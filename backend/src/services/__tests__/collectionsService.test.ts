import * as collectionsService from "../collectionsService";
import { pool } from "../../db/pool";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("collectionsService", () => {
  it("getPatientBalance returns null when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await collectionsService.getPatientBalance("tenant-1", "patient-1");
    expect(result).toBeNull();
  });

  it("getPatientBalance returns balance", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }], rowCount: 1 });
    const result = await collectionsService.getPatientBalance("tenant-1", "patient-1");
    expect(result?.patientId).toBe("patient-1");
  });

  it("getPatientBalance falls back to open bills when legacy balance is stale", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            patientId: "patient-1",
            totalBalance: 0,
            currentBalance: 0,
            balance31_60: 0,
            balance61_90: 0,
            balanceOver90: 0,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            patientId: "patient-1",
            totalBalance: 325,
            currentBalance: 125,
            balance31_60: 200,
            balance61_90: 0,
            balanceOver90: 0,
          },
        ],
        rowCount: 1,
      });

    const result = await collectionsService.getPatientBalance("tenant-1", "patient-1");

    expect(result?.totalBalance).toBe(325);
    expect(result?.currentBalance).toBe(125);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("from bills b"),
      ["tenant-1", "patient-1"]
    );
  });

  it("calculateEstimate returns breakdown", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            insurance_copay: 10,
            insurance_deductible: 50,
            insurance_coinsurance_percent: 20,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ fee_cents: 10000 }], rowCount: 1 });

    const result = await collectionsService.calculateEstimate("tenant-1", "patient-1", ["11111"]);
    expect(result.estimatedTotal).toBeGreaterThan(0);
    expect(result.breakdown.totalCharges).toBe(100);
  });

  it("processPayment records payment", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // count
      .mockResolvedValueOnce({ rows: [] }) // insert
      .mockResolvedValueOnce({ rows: [] }) // update balance
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const result = await collectionsService.processPayment("tenant-1", "patient-1", 10, "card", {});
    expect(result.receiptNumber).toMatch(/^RCP-/);
  });

  it("recordCollectionAttempt returns attempt id", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const id = await collectionsService.recordCollectionAttempt("tenant-1", {
      patientId: "patient-1",
      amountDue: 50,
      collectionPoint: "check_in",
      result: "collected_full",
    });
    expect(id).toBeTruthy();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into collection_attempts"),
      expect.arrayContaining(["tenant-1", "patient-1"])
    );
  });

  it("createCollectionContactAttempt records a rich follow-up note", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const id = await collectionsService.createCollectionContactAttempt("tenant-1", {
      patientId: "patient-1",
      amountDue: 125,
      contactMethod: "phone",
      outcome: "promise_to_pay",
      patientResponse: "Patient will pay Friday",
      nextFollowUpDate: "2026-07-20",
      patientPromisedAmount: 75,
      attemptedBy: "user-1",
    });

    expect(id).toBeTruthy();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("patient_response"),
      expect.arrayContaining([
        "tenant-1",
        "patient-1",
        expect.anything(),
        expect.anything(),
        expect.any(Date),
        125,
        "phone",
        "promise_to_pay",
      ])
    );
  });

  it("getPatientCollectionActivity returns balance and attempts", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "attempt-1", outcome: "spoke_patient" }] });

    const result = await collectionsService.getPatientCollectionActivity("tenant-1", "patient-1");

    expect(result.balance?.patientId).toBe("patient-1");
    expect(result.attempts).toHaveLength(1);
  });

  it("getAgingReport returns buckets and patients", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            current: 10,
            days31_60: 5,
            days61_90: 0,
            over90: 0,
            total: 15,
            patientCount: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] });

    const result = await collectionsService.getAgingReport("tenant-1");
    expect(result.buckets.total).toBe(15);
    expect(result.patients).toHaveLength(1);
  });

  it("getCollectionStats returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ date: "2025-01-01" }] });
    const result = await collectionsService.getCollectionStats("tenant-1", "2025-01-01", "2025-01-31");
    expect(result).toHaveLength(1);
  });

  it("updateCollectionStats calculates and stores stats", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            total_charges: "1000",
            collected_checkin: "200",
            collected_checkout: "100",
            collected_statement: "50",
            collected_portal: "50",
            total_collected: "400",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // upsert
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    await collectionsService.updateCollectionStats("tenant-1", "2025-01-01");
    expect(client.query).toHaveBeenCalled();
  });

  it("getCollectionTalkingPoints handles 0-30 days", () => {
    const result = collectionsService.getCollectionTalkingPoints({
      patientId: "p1",
      totalBalance: 10,
      currentBalance: 10,
      balance31_60: 0,
      balance61_90: 0,
      balanceOver90: 0,
      oldestChargeDate: new Date().toISOString(),
      lastPaymentDate: null,
      lastPaymentAmount: null,
      hasPaymentPlan: false,
      hasAutopay: false,
    });
    expect(result.tips).toHaveLength(3);
  });

  it("getCollectionTalkingPoints handles 31-60 days", () => {
    const date = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const result = collectionsService.getCollectionTalkingPoints({
      patientId: "p1",
      totalBalance: 10,
      currentBalance: 0,
      balance31_60: 10,
      balance61_90: 0,
      balanceOver90: 0,
      oldestChargeDate: date,
      lastPaymentDate: null,
      lastPaymentAmount: null,
      hasPaymentPlan: false,
      hasAutopay: false,
    });
    expect(result.script).toMatch(/outstanding balance/i);
  });

  it("getCollectionTalkingPoints handles 61-90 days", () => {
    const date = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString();
    const result = collectionsService.getCollectionTalkingPoints({
      patientId: "p1",
      totalBalance: 10,
      currentBalance: 0,
      balance31_60: 0,
      balance61_90: 10,
      balanceOver90: 0,
      oldestChargeDate: date,
      lastPaymentDate: null,
      lastPaymentAmount: null,
      hasPaymentPlan: false,
      hasAutopay: false,
    });
    expect(result.script).toMatch(/over 60 days/i);
  });

  it("getCollectionTalkingPoints handles >90 days", () => {
    const date = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const result = collectionsService.getCollectionTalkingPoints({
      patientId: "p1",
      totalBalance: 10,
      currentBalance: 0,
      balance31_60: 0,
      balance61_90: 0,
      balanceOver90: 10,
      oldestChargeDate: date,
      lastPaymentDate: null,
      lastPaymentAmount: null,
      hasPaymentPlan: false,
      hasAutopay: false,
    });
    expect(result.script).toMatch(/seriously overdue/i);
  });
});
