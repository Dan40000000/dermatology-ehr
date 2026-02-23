import { frontDeskService } from "../frontDeskService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";
import { encounterService } from "../encounterService";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../encounterService", () => ({
  encounterService: {
    createEncounterFromAppointment: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const createEncounterMock = encounterService.createEncounterFromAppointment as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  createEncounterMock.mockReset();
  (logger.info as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("frontDeskService", () => {
  it("getTodaySchedule returns appointments with wait time", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2025-01-01T12:00:00Z"));
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "appt-1",
          tenant_id: "tenant-1",
          patient_id: "patient-1",
          patient_first_name: "Ada",
          patient_last_name: "Lovelace",
          patient_phone: "555",
          patient_email: "ada@example.com",
          provider_id: "prov-1",
          provider_name: "Dr. Demo",
          location_id: "loc-1",
          location_name: "Main",
          appointment_type_id: "type-1",
          appointment_type_name: "Consult",
          scheduled_start: "2025-01-01T12:30:00Z",
          scheduled_end: "2025-01-01T12:45:00Z",
          status: "checked_in",
          arrived_at: "2025-01-01T11:30:00Z",
          roomed_at: null,
          completed_at: null,
          insurance_verified: true,
          insurance_plan_name: "Plan A",
          copay_amount: "25",
          outstanding_balance: "12.5",
          payment_due_cents: "0",
          created_at: "2025-01-01T10:00:00Z",
        },
      ],
    });

    const result = await frontDeskService.getTodaySchedule(
      "tenant-1",
      "prov-1",
      "checked_in"
    );

    expect(result[0].waitTimeMinutes).toBe(30);
    expect(result[0].copayAmount).toBe(25);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      "tenant-1",
      "2025-01-01",
      "prov-1",
      "checked_in",
    ]);
    jest.useRealTimers();
  });

  it("getTodaySchedule uses schema-tolerant insurance and balance access", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await frontDeskService.getTodaySchedule("tenant-1");

    const scheduleQuery = queryMock.mock.calls[0][0] as string;

    expect(scheduleQuery).toContain("to_jsonb(p)");
    expect(scheduleQuery).toContain("to_jsonb(b)");
    expect(scheduleQuery).not.toMatch(/\bp\.insurance_details\b/);
    expect(scheduleQuery).not.toMatch(/\bb\.amount_cents\b/);
  });

  it("getTodaySchedule uses local-date helper for the day filter", async () => {
    const localDateSpy = jest
      .spyOn(frontDeskService as any, "toLocalIsoDate")
      .mockReturnValueOnce("2026-02-21");
    queryMock.mockResolvedValueOnce({ rows: [] });

    await frontDeskService.getTodaySchedule("tenant-1");

    expect(localDateSpy).toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["tenant-1", "2026-02-21"]);
    localDateSpy.mockRestore();
  });

  it("getDailyStats calculates open slots and average wait", async () => {
    const providerSpy = jest
      .spyOn(frontDeskService as any, "getProviderCount")
      .mockResolvedValueOnce(2);
    const localDateSpy = jest
      .spyOn(frontDeskService as any, "toLocalIsoDate")
      .mockReturnValueOnce("2026-02-21");

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            total_scheduled: "5",
            patients_arrived: "3",
            patients_completed: "2",
            no_shows: "1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ collections_today: "125.5" }] })
      .mockResolvedValueOnce({ rows: [{ avg_wait_minutes: "12.4" }] });

    const result = await frontDeskService.getDailyStats("tenant-1");

    expect(result.openSlotsRemaining).toBe(67);
    expect(result.averageWaitTime).toBe(12);
    expect(localDateSpy).toHaveBeenCalled();
    expect(queryMock).toHaveBeenNthCalledWith(1, expect.any(String), ["tenant-1", "2026-02-21"]);
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.any(String), ["tenant-1", "2026-02-21"]);
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.any(String), ["tenant-1", "2026-02-21"]);
    localDateSpy.mockRestore();
    providerSpy.mockRestore();
  });

  it("getWaitingRoomPatients flags delayed patients", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          appointment_id: "appt-1",
          patient_id: "patient-1",
          patient_name: "Ada Lovelace",
          provider_id: "prov-1",
          provider_name: "Dr. Demo",
          scheduled_time: "2025-01-01T11:00:00Z",
          arrived_at: "2025-01-01T10:40:00Z",
          wait_time_minutes: "20.5",
        },
      ],
    });

    const result = await frontDeskService.getWaitingRoomPatients("tenant-1");

    expect(result[0].waitTimeMinutes).toBe(20);
    expect(result[0].isDelayed).toBe(true);
  });

  it("checkInPatient updates appointment and creates encounter", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ patient_id: "patient-1", provider_id: "prov-1" }],
      })
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT
    createEncounterMock.mockResolvedValueOnce({ id: "enc-1" });

    const result = await frontDeskService.checkInPatient("tenant-1", "appt-1");

    expect(result.encounterId).toBe("enc-1");
    expect(createEncounterMock).toHaveBeenCalledWith(
      "tenant-1",
      "appt-1",
      "patient-1",
      "prov-1"
    );
    expect(client.release).toHaveBeenCalled();
  });

  it("checkInPatient still succeeds when encounter creation fails", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ patient_id: "patient-1", provider_id: "prov-1" }],
      })
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT
    createEncounterMock.mockRejectedValueOnce(new Error("encounter failed"));
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // fallback lookup

    const result = await frontDeskService.checkInPatient("tenant-1", "appt-1");

    expect(result.encounterId).toBe("");
    expect(client.release).toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id FROM encounters"),
      ["tenant-1", "appt-1"]
    );
  });

  it("checkInPatient throws when appointment missing", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(frontDeskService.checkInPatient("tenant-1", "appt-1")).rejects.toThrow(
      "Appointment not found"
    );

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("checkOutPatient routes unpaid self-pay visits to checkout", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ payment_due_cents: "12500" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await frontDeskService.checkOutPatient("tenant-1", "appt-1");

    expect(result).toEqual({
      status: "checkout",
      requiresPayment: true,
      paymentDueCents: 12500,
    });
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SET status = 'checkout'"),
      ["tenant-1", "appt-1"]
    );
  });

  it("checkOutPatient completes appointment when no self-pay balance exists", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ payment_due_cents: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await frontDeskService.checkOutPatient("tenant-1", "appt-1");

    expect(result).toEqual({
      status: "completed",
      requiresPayment: false,
      paymentDueCents: 0,
    });
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SET status = 'completed'"),
      ["tenant-1", "appt-1"]
    );
  });

  it("updateAppointmentStatus sets arrived_at for checked_in", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await frontDeskService.updateAppointmentStatus("tenant-1", "appt-1", "checked_in");

    const query = queryMock.mock.calls[0][0];
    expect(query).toContain("arrived_at");
  });

  it("updateAppointmentStatus sets roomed_at for in_room", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await frontDeskService.updateAppointmentStatus("tenant-1", "appt-1", "in_room");

    const query = queryMock.mock.calls[0][0];
    expect(query).toContain("roomed_at");
  });

  it("updateAppointmentStatus sets completed_at for completed", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await frontDeskService.updateAppointmentStatus("tenant-1", "appt-1", "completed");

    const query = queryMock.mock.calls[0][0];
    expect(query).toContain("completed_at");
  });

  it("updateAppointmentStatus clears completed_at for checkout", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await frontDeskService.updateAppointmentStatus("tenant-1", "appt-1", "checkout");

    const query = queryMock.mock.calls[0][0];
    expect(query).toContain("completed_at = NULL");
  });

  it("getUpcomingPatients returns mapped results", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2025-01-01T10:00:00Z"));
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "appt-1",
          tenant_id: "tenant-1",
          patient_id: "patient-1",
          patient_first_name: "Ada",
          patient_last_name: "Lovelace",
          patient_phone: "555",
          patient_email: "ada@example.com",
          provider_id: "prov-1",
          provider_name: "Dr. Demo",
          location_id: "loc-1",
          location_name: "Main",
          appointment_type_id: "type-1",
          appointment_type_name: "Consult",
          scheduled_start: "2025-01-01T12:30:00Z",
          scheduled_end: "2025-01-01T12:45:00Z",
          status: "scheduled",
          insurance_verified: true,
          insurance_plan_name: "Plan A",
          copay_amount: "25",
          outstanding_balance: "12.5",
          created_at: "2025-01-01T09:00:00Z",
        },
      ],
    });

    const result = await frontDeskService.getUpcomingPatients("tenant-1", 1);

    expect(result[0].appointmentTypeName).toBe("Consult");
    expect(result[0].copayAmount).toBe(25);
    jest.useRealTimers();
  });
});
