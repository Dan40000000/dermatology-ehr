import request from "supertest";
import express from "express";
import { patientSchedulingRouter, providerSchedulingRouter } from "../patientScheduling";
import { pool } from "../../db/pool";
import {
  calculateAvailableSlots,
  getAvailableDatesInMonth,
  getBookingSettings,
  canCancelAppointment,
  getProviderInfo,
} from "../../services/availabilityService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin", name: "Test User" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../middleware/patientPortalAuth", () => ({
  requirePatientAuth: (req: any, _res: any, next: any) => {
    req.patient = { tenantId: "tenant-1", patientId: "patient-1", accountId: "account-1" };
    return next();
  },
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/availabilityService", () => ({
  calculateAvailableSlots: jest.fn(),
  getAvailableDatesInMonth: jest.fn(),
  getBookingSettings: jest.fn(),
  canCancelAppointment: jest.fn(),
  getProviderInfo: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/patient-portal/scheduling", patientSchedulingRouter);
app.use("/scheduling", providerSchedulingRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const calculateSlotsMock = calculateAvailableSlots as jest.Mock;
const getBookingSettingsMock = getBookingSettings as jest.Mock;
const getAvailableDatesMock = getAvailableDatesInMonth as jest.Mock;
const canCancelMock = canCancelAppointment as jest.Mock;
const getProviderInfoMock = getProviderInfo as jest.Mock;

const uuid = "11111111-1111-1111-8111-111111111111";

const buildClient = () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  return { query, release: jest.fn() };
};

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  calculateSlotsMock.mockReset();
  getBookingSettingsMock.mockReset();
  getAvailableDatesMock.mockReset();
  canCancelMock.mockReset();
  getProviderInfoMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Patient scheduling portal routes", () => {
  it("GET /patient-portal/scheduling/settings returns settings", async () => {
    getBookingSettingsMock.mockResolvedValueOnce({ isEnabled: true, bookingWindowDays: 30 });
    queryMock.mockResolvedValueOnce({ rows: [{ customMessage: "Hello", requireReason: true }] });

    const res = await request(app).get("/patient-portal/scheduling/settings");

    expect(res.status).toBe(200);
    expect(res.body.isEnabled).toBe(true);
    expect(res.body.customMessage).toBe("Hello");
    expect(res.body.requireReason).toBe(true);
  });

  it("GET /patient-portal/scheduling/settings returns 500 on error", async () => {
    getBookingSettingsMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/patient-portal/scheduling/settings");

    expect(res.status).toBe(500);
  });

  it("GET /patient-portal/scheduling/providers returns providers", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "prov-1" }] });

    const res = await request(app).get("/patient-portal/scheduling/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(1);
  });

  it("GET /patient-portal/scheduling/providers returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/patient-portal/scheduling/providers");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("GET /patient-portal/scheduling/appointment-types returns appointment types", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "appt-1" }] });

    const res = await request(app).get("/patient-portal/scheduling/appointment-types");

    expect(res.status).toBe(200);
    expect(res.body.appointmentTypes).toHaveLength(1);
  });

  it("GET /patient-portal/scheduling/appointment-types returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/patient-portal/scheduling/appointment-types");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("GET /patient-portal/scheduling/available-dates validates query", async () => {
    const res = await request(app).get("/patient-portal/scheduling/available-dates");

    expect(res.status).toBe(400);
  });

  it("GET /patient-portal/scheduling/available-dates returns dates", async () => {
    getAvailableDatesMock.mockResolvedValueOnce(["2024-01-02"]);

    const res = await request(app)
      .get("/patient-portal/scheduling/available-dates")
      .query({
        providerId: uuid,
        appointmentTypeId: uuid,
        year: "2024",
        month: "1",
      });

    expect(res.status).toBe(200);
    expect(res.body.dates).toEqual(["2024-01-02"]);
  });

  it("GET /patient-portal/scheduling/available-dates returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    getAvailableDatesMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .get("/patient-portal/scheduling/available-dates")
      .query({
        providerId: uuid,
        appointmentTypeId: uuid,
        year: "2024",
        month: "1",
      });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("GET /patient-portal/scheduling/availability validates query", async () => {
    const res = await request(app).get("/patient-portal/scheduling/availability");

    expect(res.status).toBe(400);
  });

  it("GET /patient-portal/scheduling/availability returns slots with provider info", async () => {
    const start = "2024-01-02T09:00:00.000Z";
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: start, isAvailable: true }]);
    getProviderInfoMock.mockResolvedValueOnce({ fullName: "Dr. Smith" });

    const res = await request(app)
      .get("/patient-portal/scheduling/availability")
      .query({
        date: "2024-01-02",
        providerId: uuid,
        appointmentTypeId: uuid,
      });

    expect(res.status).toBe(200);
    expect(res.body.slots[0].providerName).toBe("Dr. Smith");
  });

  it("GET /patient-portal/scheduling/availability returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    calculateSlotsMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .get("/patient-portal/scheduling/availability")
      .query({
        date: "2024-01-02",
        providerId: uuid,
        appointmentTypeId: uuid,
      });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("POST /patient-portal/scheduling/book returns 409 when slot unavailable", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: "2024-01-02T10:00:00.000Z", isAvailable: true }]);
    client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patient-portal/scheduling/book").send({
      providerId: uuid,
      appointmentTypeId: uuid,
      scheduledStart: "2024-01-02T09:00:00.000Z",
      scheduledEnd: "2024-01-02T09:30:00.000Z",
    });

    expect(res.status).toBe(409);
  });

  it("POST /patient-portal/scheduling/book returns 409 on conflict", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const start = "2024-01-02T09:00:00.000Z";
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: start, isAvailable: true }]);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "conflict" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patient-portal/scheduling/book").send({
      providerId: uuid,
      appointmentTypeId: uuid,
      scheduledStart: start,
      scheduledEnd: "2024-01-02T09:30:00.000Z",
    });

    expect(res.status).toBe(409);
  });

  it("POST /patient-portal/scheduling/book returns 500 when location missing", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const start = "2024-01-02T09:00:00.000Z";
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: start, isAvailable: true }]);
    client.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patient-portal/scheduling/book").send({
      providerId: uuid,
      appointmentTypeId: uuid,
      scheduledStart: start,
      scheduledEnd: "2024-01-02T09:30:00.000Z",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("No location found");
  });

  it("POST /patient-portal/scheduling/book creates appointment", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const start = "2024-01-02T09:00:00.000Z";
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: start, isAvailable: true }]);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "loc-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patient-portal/scheduling/book").send({
      providerId: uuid,
      appointmentTypeId: uuid,
      scheduledStart: start,
      scheduledEnd: "2024-01-02T09:30:00.000Z",
      reason: "Consult",
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Appointment booked successfully");
  });

  it("POST /patient-portal/scheduling/book allows missing reason", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const start = "2024-01-02T10:00:00.000Z";
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: start, isAvailable: true }]);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "loc-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patient-portal/scheduling/book").send({
      providerId: uuid,
      appointmentTypeId: uuid,
      scheduledStart: start,
      scheduledEnd: "2024-01-02T10:30:00.000Z",
    });

    expect(res.status).toBe(201);
    expect(client.query.mock.calls[3][1][9]).toBeNull();
    expect(client.query.mock.calls[4][1][7]).toBeNull();
  });

  it("PUT /patient-portal/scheduling/reschedule returns 403 when blocked", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            providerId: uuid,
            appointmentTypeId: uuid,
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    canCancelMock.mockResolvedValueOnce({ canCancel: false, reason: "Too late" });

    const res = await request(app)
      .put(`/patient-portal/scheduling/reschedule/${uuid}`)
      .send({
        scheduledStart: "2024-01-03T09:00:00.000Z",
        scheduledEnd: "2024-01-03T09:30:00.000Z",
      });

    expect(res.status).toBe(403);
  });

  it("PUT /patient-portal/scheduling/reschedule returns 404 when missing", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put(`/patient-portal/scheduling/reschedule/${uuid}`)
      .send({
        scheduledStart: "2024-01-03T09:00:00.000Z",
        scheduledEnd: "2024-01-03T09:30:00.000Z",
      });

    expect(res.status).toBe(404);
  });

  it("PUT /patient-portal/scheduling/reschedule updates appointment", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const newStart = "2024-01-03T09:00:00.000Z";
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            providerId: uuid,
            appointmentTypeId: uuid,
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    canCancelMock.mockResolvedValueOnce({ canCancel: true });
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: newStart, isAvailable: true }]);

    const res = await request(app)
      .put(`/patient-portal/scheduling/reschedule/${uuid}`)
      .send({
        scheduledStart: newStart,
        scheduledEnd: "2024-01-03T09:30:00.000Z",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Appointment rescheduled successfully");
  });

  it("DELETE /patient-portal/scheduling/cancel returns 404 when missing", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete(`/patient-portal/scheduling/cancel/${uuid}`)
      .send({ reason: "No longer needed" });

    expect(res.status).toBe(404);
  });

  it("DELETE /patient-portal/scheduling/cancel returns 403 when blocked", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    canCancelMock.mockResolvedValueOnce({ canCancel: false, reason: "Too late" });

    const res = await request(app)
      .delete(`/patient-portal/scheduling/cancel/${uuid}`)
      .send({ reason: "No longer needed" });

    expect(res.status).toBe(403);
  });

  it("DELETE /patient-portal/scheduling/cancel cancels appointment", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    canCancelMock.mockResolvedValueOnce({ canCancel: true });

    const res = await request(app)
      .delete(`/patient-portal/scheduling/cancel/${uuid}`)
      .send({ reason: "No longer needed" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Appointment cancelled successfully");
  });

  it("DELETE /patient-portal/scheduling/cancel uses default reasons when missing", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    canCancelMock.mockResolvedValueOnce({ canCancel: true });

    const res = await request(app).delete(`/patient-portal/scheduling/cancel/${uuid}`).send({});

    expect(res.status).toBe(200);
    expect(client.query.mock.calls[3][1][5]).toBe("Cancelled by patient via portal");
    expect(client.query.mock.calls[4][1][7]).toBe("Cancelled by patient");
  });

  it("POST /patient-portal/scheduling/book validates payload", async () => {
    const res = await request(app).post("/patient-portal/scheduling/book").send({
      providerId: "not-a-uuid",
    });

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/scheduling/book returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const start = "2024-01-02T09:00:00.000Z";
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: start, isAvailable: true }]);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/patient-portal/scheduling/book").send({
      providerId: uuid,
      appointmentTypeId: uuid,
      scheduledStart: start,
      scheduledEnd: "2024-01-02T09:30:00.000Z",
    });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("PUT /patient-portal/scheduling/reschedule validates payload", async () => {
    const res = await request(app)
      .put(`/patient-portal/scheduling/reschedule/${uuid}`)
      .send({ scheduledStart: "not-a-date" });

    expect(res.status).toBe(400);
  });

  it("PUT /patient-portal/scheduling/reschedule returns 409 when slot unavailable", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const newStart = "2024-01-03T09:00:00.000Z";
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            providerId: uuid,
            appointmentTypeId: uuid,
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      });
    canCancelMock.mockResolvedValueOnce({ canCancel: true });
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: newStart, isAvailable: false }]);

    const res = await request(app)
      .put(`/patient-portal/scheduling/reschedule/${uuid}`)
      .send({
        scheduledStart: newStart,
        scheduledEnd: "2024-01-03T09:30:00.000Z",
      });

    expect(res.status).toBe(409);
  });

  it("PUT /patient-portal/scheduling/reschedule returns 409 on conflict", async () => {
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const newStart = "2024-01-03T09:00:00.000Z";
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            providerId: uuid,
            appointmentTypeId: uuid,
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "conflict" }] });
    canCancelMock.mockResolvedValueOnce({ canCancel: true });
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: newStart, isAvailable: true }]);

    const res = await request(app)
      .put(`/patient-portal/scheduling/reschedule/${uuid}`)
      .send({
        scheduledStart: newStart,
        scheduledEnd: "2024-01-03T09:30:00.000Z",
      });

    expect(res.status).toBe(409);
  });

  it("PUT /patient-portal/scheduling/reschedule returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    const newStart = "2024-01-03T09:00:00.000Z";
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            providerId: uuid,
            appointmentTypeId: uuid,
            scheduledStart: "2024-01-02T09:00:00.000Z",
            scheduledEnd: "2024-01-02T09:30:00.000Z",
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("boom"));
    canCancelMock.mockResolvedValueOnce({ canCancel: true });
    calculateSlotsMock.mockResolvedValueOnce([{ startTime: newStart, isAvailable: true }]);

    const res = await request(app)
      .put(`/patient-portal/scheduling/reschedule/${uuid}`)
      .send({
        scheduledStart: newStart,
        scheduledEnd: "2024-01-03T09:30:00.000Z",
      });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("DELETE /patient-portal/scheduling/cancel validates payload", async () => {
    const res = await request(app)
      .delete(`/patient-portal/scheduling/cancel/${uuid}`)
      .send({ reason: 123 });

    expect(res.status).toBe(400);
  });

  it("DELETE /patient-portal/scheduling/cancel returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .delete(`/patient-portal/scheduling/cancel/${uuid}`)
      .send({ reason: "No longer needed" });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});

describe("Provider scheduling routes", () => {
  it("GET /scheduling/availability-templates returns templates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "template-1" }] });

    const res = await request(app).get("/scheduling/availability-templates");

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it("POST /scheduling/availability-templates validates body", async () => {
    const res = await request(app).post("/scheduling/availability-templates").send({});

    expect(res.status).toBe(400);
  });

  it("POST /scheduling/availability-templates creates template", async () => {
    const res = await request(app).post("/scheduling/availability-templates").send({
      providerId: uuid,
      dayOfWeek: 2,
      startTime: "09:00",
      endTime: "17:00",
      slotDuration: 30,
      allowOnlineBooking: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Availability template created");
  });

  it("PUT /scheduling/availability-templates/:id validates updates", async () => {
    const res = await request(app).put(`/scheduling/availability-templates/${uuid}`).send({});

    expect(res.status).toBe(400);
  });

  it("PUT /scheduling/availability-templates/:id updates template", async () => {
    const res = await request(app).put(`/scheduling/availability-templates/${uuid}`).send({
      startTime: "08:00",
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Availability template updated");
  });

  it("DELETE /scheduling/availability-templates/:id deletes template", async () => {
    const res = await request(app).delete(`/scheduling/availability-templates/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Availability template deleted");
  });

  it("GET /scheduling/time-off returns entries", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pto-1" }] });

    const res = await request(app).get("/scheduling/time-off");

    expect(res.status).toBe(200);
    expect(res.body.timeOff).toHaveLength(1);
  });

  it("POST /scheduling/time-off validates body", async () => {
    const res = await request(app).post("/scheduling/time-off").send({});

    expect(res.status).toBe(400);
  });

  it("POST /scheduling/time-off creates entry", async () => {
    const res = await request(app).post("/scheduling/time-off").send({
      providerId: uuid,
      startDatetime: "2024-01-02T09:00:00.000Z",
      endDatetime: "2024-01-02T10:00:00.000Z",
      reason: "Vacation",
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Time-off created");
  });

  it("POST /scheduling/time-off allows missing reason and notes", async () => {
    const res = await request(app).post("/scheduling/time-off").send({
      providerId: uuid,
      startDatetime: "2024-01-02T11:00:00.000Z",
      endDatetime: "2024-01-02T12:00:00.000Z",
    });

    expect(res.status).toBe(201);
    expect(queryMock.mock.calls[0][1][5]).toBeNull();
    expect(queryMock.mock.calls[0][1][6]).toBeNull();
  });

  it("DELETE /scheduling/time-off/:id deletes entry", async () => {
    const res = await request(app).delete(`/scheduling/time-off/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Time-off deleted");
  });

  it("GET /scheduling/settings returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/scheduling/settings");

    expect(res.status).toBe(404);
  });

  it("GET /scheduling/settings returns settings", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "settings-1" }] });

    const res = await request(app).get("/scheduling/settings");

    expect(res.status).toBe(200);
    expect(res.body.settings.id).toBe("settings-1");
  });

  it("PUT /scheduling/settings validates empty updates", async () => {
    const res = await request(app).put("/scheduling/settings").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /scheduling/settings updates settings", async () => {
    const res = await request(app).put("/scheduling/settings").send({
      isEnabled: true,
      bookingWindowDays: 30,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Settings updated");
  });

  it("GET /scheduling/availability-templates returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/scheduling/availability-templates");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("POST /scheduling/availability-templates returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/scheduling/availability-templates").send({
      providerId: uuid,
      dayOfWeek: 2,
      startTime: "09:00",
      endTime: "17:00",
      slotDuration: 30,
    });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("PUT /scheduling/availability-templates/:id validates payload", async () => {
    const res = await request(app).put(`/scheduling/availability-templates/${uuid}`).send({
      slotDuration: 10,
    });

    expect(res.status).toBe(400);
  });

  it("PUT /scheduling/availability-templates/:id returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).put(`/scheduling/availability-templates/${uuid}`).send({
      startTime: "08:00",
    });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("DELETE /scheduling/availability-templates/:id returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).delete(`/scheduling/availability-templates/${uuid}`);

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("GET /scheduling/time-off returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/scheduling/time-off");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("POST /scheduling/time-off returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/scheduling/time-off").send({
      providerId: uuid,
      startDatetime: "2024-01-02T09:00:00.000Z",
      endDatetime: "2024-01-02T10:00:00.000Z",
      reason: "Vacation",
    });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("DELETE /scheduling/time-off/:id returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).delete(`/scheduling/time-off/${uuid}`);

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("GET /scheduling/settings returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/scheduling/settings");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("PUT /scheduling/settings validates payload", async () => {
    const res = await request(app).put("/scheduling/settings").send({
      bookingWindowDays: 0,
    });

    expect(res.status).toBe(400);
  });

  it("PUT /scheduling/settings returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).put("/scheduling/settings").send({
      isEnabled: false,
      bookingWindowDays: 20,
    });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
