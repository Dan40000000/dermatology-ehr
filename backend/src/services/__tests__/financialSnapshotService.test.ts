import { pool } from "../../db/pool";
import { getFinancialSnapshots } from "../financialSnapshotService";
import { inferVisitRevenueBenchmark } from "../../data/appointmentRevenueBenchmarks";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../productSalesService", () => ({
  ensureStoreSchemaAndCatalog: jest.fn().mockResolvedValue(undefined),
}));

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("financialSnapshotService", () => {
  it("infers consult and follow-up benchmarks from appointment type names", () => {
    expect(
      inferVisitRevenueBenchmark({ appointmentTypeName: "Consult", durationMinutes: 30 })
    ).toMatchObject({
      cptCode: "99203",
      amountCents: 13360,
      usesBenchmark: true,
    });

    expect(
      inferVisitRevenueBenchmark({ appointmentTypeName: "Follow-up", durationMinutes: 15 })
    ).toMatchObject({
      cptCode: "99213",
      amountCents: 9561,
      usesBenchmark: true,
    });
  });

  it("uses actual charges when available and benchmarks completed visits without charges", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-11T15:00:00Z"));

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            appointment_id: "appt-1",
            completed_at: "2026-03-11T13:00:00Z",
            appointment_type_name: "Consult",
            duration_minutes: 30,
            actual_charge_cents: "0",
          },
          {
            appointment_id: "appt-2",
            completed_at: "2026-03-10T14:00:00Z",
            appointment_type_name: "Follow-up",
            duration_minutes: 15,
            actual_charge_cents: "0",
          },
          {
            appointment_id: "appt-3",
            completed_at: "2026-03-11T11:00:00Z",
            appointment_type_name: "Procedure Visit",
            duration_minutes: 30,
            actual_charge_cents: "20000",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { collected_on: "2026-03-11", amount_cents: "5000" },
          { collected_on: "2026-03-09", amount_cents: "4000" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ collected_on: "2026-03-10", amount_cents: "10000" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            bill_id: "bill-1",
            billed_on: "2026-03-11",
            total_charges_cents: "5000",
            notes: "[NO_SHOW_FEE]|appointmentId=appt-9",
            appointment_type_name: null,
            cpt_codes: "NOSHOW",
            line_descriptions: "No-show fee (missed appointment)",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            sale_id: "sale-1",
            sold_on: "2026-03-11",
            total_cents: "6250",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            bill_id: "bill-writeoff-1",
            written_off_on: "2026-03-11",
            amount_cents: "1200",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            referred_on: "2026-03-10",
            balance_cents: "8000",
          },
        ],
      });

    const snapshots = await getFinancialSnapshots("tenant-1");

    expect(queryMock.mock.calls[1][0]).toContain("payment_date::date::text AS collected_on");
    expect(queryMock.mock.calls[2][0]).toContain("payment_date::date::text AS collected_on");
    expect(snapshots.daily.totalRevenueCents).toBe(44610);
    expect(snapshots.daily.benchmarkRevenueCents).toBe(13360);
    expect(snapshots.daily.standaloneRevenueCents).toBe(5000);
    expect(snapshots.daily.storeRevenueCents).toBe(6250);
    expect(snapshots.daily.badDebtCents).toBe(1200);
    expect(snapshots.daily.collectionsReferralBalanceCents).toBe(8000);
    expect(snapshots.daily.collectionsCents).toBe(11250);
    expect(snapshots.daily.completedAppointments).toBe(2);
    expect(snapshots.daily.revenueCategories[0]).toMatchObject({
      key: "procedure",
      revenueCents: 20000,
    });
    expect(snapshots.daily.revenueCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "no_show_fee", revenueCents: 5000 }),
        expect.objectContaining({ key: "product_sale", revenueCents: 6250 }),
      ]),
    );

    expect(snapshots.weekly.totalRevenueCents).toBe(54171);
    expect(snapshots.weekly.benchmarkRevenueCents).toBe(22921);
    expect(snapshots.weekly.standaloneRevenueCents).toBe(5000);
    expect(snapshots.weekly.storeRevenueCents).toBe(6250);
    expect(snapshots.weekly.collectionsCents).toBe(25250);
    expect(snapshots.weekly.completedAppointments).toBe(3);
    expect(snapshots.weekly.benchmarkVisitsCount).toBe(2);
  });
});
