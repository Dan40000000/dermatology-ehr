import { pool } from "../../db/pool";
import { getFinancialSnapshots } from "../financialSnapshotService";
import { inferVisitRevenueBenchmark } from "../../data/appointmentRevenueBenchmarks";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
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
      });

    const snapshots = await getFinancialSnapshots("tenant-1");

    expect(snapshots.daily.totalRevenueCents).toBe(33360);
    expect(snapshots.daily.benchmarkRevenueCents).toBe(13360);
    expect(snapshots.daily.collectionsCents).toBe(5000);
    expect(snapshots.daily.completedAppointments).toBe(2);

    expect(snapshots.weekly.totalRevenueCents).toBe(42921);
    expect(snapshots.weekly.benchmarkRevenueCents).toBe(22921);
    expect(snapshots.weekly.collectionsCents).toBe(19000);
    expect(snapshots.weekly.completedAppointments).toBe(3);
    expect(snapshots.weekly.benchmarkVisitsCount).toBe(2);
  });
});
