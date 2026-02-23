process.env.APPOINTMENT_WINDOW_TIME_ZONE = "America/Denver";

import request from "supertest";
import express from "express";
import crypto from "crypto";
import { appointmentsRouter } from "../appointments";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { waitlistAutoFillService } from "../../services/waitlistAutoFillService";
import { logger } from "../../lib/logger";

let authUser: { id: string; tenantId: string; role: string };
let allowMissingUser = false;

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    if (allowMissingUser) {
      let accessCount = 0;
      const userValue = authUser;
      Object.defineProperty(req, "user", {
        configurable: true,
        get() {
          accessCount += 1;
          return accessCount === 1 ? userValue : undefined;
        },
      });
      return next();
    }
    req.user = authUser;
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/waitlistAutoFillService", () => ({
  waitlistAutoFillService: {
    processAppointmentCancellation: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/appointments", appointmentsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const waitlistMock = waitlistAutoFillService.processAppointmentCancellation as jest.Mock;
const loggerInfoMock = logger.info as jest.Mock;
const loggerErrorMock = logger.error as jest.Mock;
const releaseMock = jest.fn();

const basePayload = {
  patientId: "patient-1",
  providerId: "provider-1",
  locationId: "location-1",
  appointmentTypeId: "type-1",
  scheduledStart: "2024-01-02T16:00:00.000Z",
  scheduledEnd: "2024-01-02T16:30:00.000Z",
};

beforeEach(() => {
  authUser = { id: "user-1", tenantId: "tenant-1", role: "admin" };
  allowMissingUser = false;
  queryMock.mockReset();
  connectMock.mockReset();
  auditLogMock.mockReset();
  waitlistMock.mockReset();
  loggerInfoMock.mockReset();
  loggerErrorMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  releaseMock.mockReset();
  connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
});

describe("Appointments routes", () => {
  it("GET /appointments returns appointments", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "appt-1" }], rowCount: 1 });

    const res = await request(app).get("/appointments");

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(1);
  });

  it("POST /appointments validates payload", async () => {
    const res = await request(app).post("/appointments").send({});

    expect(res.status).toBe(400);
  });

  it("POST /appointments rejects appointments outside the calendar window", async () => {
    const res = await request(app).post("/appointments").send({
      ...basePayload,
      scheduledStart: "2024-01-02T12:00:00.000Z",
      scheduledEnd: "2024-01-02T12:30:00.000Z",
    });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("POST /appointments returns 409 on conflict", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "appt-1" }], rowCount: 1 });

    const res = await request(app).post("/appointments").send(basePayload);

    expect(res.status).toBe(409);
  });

  it("POST /appointments creates appointment", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/appointments").send(basePayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("POST /appointments uses default ignoreId when uuid is empty", async () => {
    const uuidSpy = jest.spyOn(crypto, "randomUUID").mockReturnValueOnce("");
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/appointments").send(basePayload);

    expect(res.status).toBe(201);
    expect(queryMock.mock.calls[0][1][4]).toBe("0000");
    uuidSpy.mockRestore();
  });

  it("POST /appointments honors provided status", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/appointments").send({
      ...basePayload,
      status: "cancelled",
    });

    expect(res.status).toBe(201);
    expect(queryMock.mock.calls[1][1][8]).toBe("cancelled");
  });

  it("POST /appointments uses unknown actor when user disappears", async () => {
    allowMissingUser = true;
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/appointments").send(basePayload);

    expect(res.status).toBe(201);
    expect(auditLogMock.mock.calls[0][1]).toBe("unknown");
  });

  it("POST /appointments/:id/reschedule validates payload", async () => {
    const res = await request(app).post("/appointments/appt-1/reschedule").send({});

    expect(res.status).toBe(400);
  });

  it("POST /appointments/:id/reschedule rejects appointments outside the calendar window", async () => {
    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({ scheduledStart: "2024-01-02T12:00:00.000Z", scheduledEnd: "2024-01-02T12:30:00.000Z" });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("POST /appointments/:id/reschedule returns 404 when missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // select appointment
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({ scheduledStart: basePayload.scheduledStart, scheduledEnd: basePayload.scheduledEnd });

    expect(res.status).toBe(404);
  });

  it("POST /appointments/:id/reschedule returns 409 on conflict", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ provider_id: "provider-1", patient_id: "patient-1", scheduled_start: "2026-02-23T18:00:00.000Z" }],
        rowCount: 1,
      }) // select appointment
      .mockResolvedValueOnce({ rows: [{ id: "appt-2" }], rowCount: 1 }) // conflict
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({ scheduledStart: basePayload.scheduledStart, scheduledEnd: basePayload.scheduledEnd });

    expect(res.status).toBe(409);
  });

  it("POST /appointments/:id/reschedule updates appointment", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ provider_id: "provider-1", patient_id: "patient-1", scheduled_start: "2026-02-20T18:00:00.000Z" }],
        rowCount: 1,
      }) // select appointment
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // conflict
      .mockResolvedValueOnce({ rows: [] }) // update
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({ scheduledStart: basePayload.scheduledStart, scheduledEnd: basePayload.scheduledEnd });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("POST /appointments/:id/reschedule creates late fee bill when rescheduling within 24 hours", async () => {
    const soonStart = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ provider_id: "provider-1", patient_id: "patient-1", scheduled_start: soonStart }],
        rowCount: 1,
      }) // select appointment
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // conflict
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing late fee lookup
      .mockResolvedValueOnce({ rows: [] }) // insert bill
      .mockResolvedValueOnce({ rows: [] }) // insert bill_line_items
      .mockResolvedValueOnce({ rows: [] }) // update appointment
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({
        scheduledStart: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        scheduledEnd: new Date(Date.now() + 3.5 * 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(200);
    const insertBillCall = queryMock.mock.calls.find((call) => String(call[0]).includes("insert into bills"));
    const insertLineItemCall = queryMock.mock.calls.find((call) => String(call[0]).includes("insert into bill_line_items"));
    expect(insertBillCall).toBeTruthy();
    expect(insertLineItemCall).toBeTruthy();
    expect(res.body.lateFeeBillId).toBeTruthy();
  });

  it("POST /appointments/:id/status triggers waitlist auto-fill", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ patient_id: "patient-1", scheduled_start: "2026-02-20T18:00:00.000Z", status: "scheduled" }],
        rowCount: 1,
      }) // select appointment
      .mockResolvedValueOnce({ rows: [] }) // update
      .mockResolvedValueOnce({ rows: [] }) // insert history
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    waitlistMock.mockResolvedValueOnce([{ id: "match-1" }]);

    const res = await request(app)
      .post("/appointments/appt-1/status")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(waitlistMock).toHaveBeenCalledWith("tenant-1", "appt-1");
    expect(loggerInfoMock).toHaveBeenCalled();
  });

  it("POST /appointments/:id/status skips waitlist for non-cancelled status", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ patient_id: "patient-1", scheduled_start: "2026-02-20T18:00:00.000Z", status: "scheduled" }],
        rowCount: 1,
      }) // select appointment
      .mockResolvedValueOnce({ rows: [] }) // update
      .mockResolvedValueOnce({ rows: [] }) // insert history
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post("/appointments/appt-1/status")
      .send({ status: "scheduled" });

    expect(res.status).toBe(200);
    expect(waitlistMock).not.toHaveBeenCalled();
  });

  it("POST /appointments/:id/status validates payload", async () => {
    const res = await request(app).post("/appointments/appt-1/status").send({});

    expect(res.status).toBe(400);
  });

  it("POST /appointments/:id/status logs waitlist errors", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ patient_id: "patient-1", scheduled_start: "2026-02-20T18:00:00.000Z", status: "scheduled" }],
        rowCount: 1,
      }) // select appointment
      .mockResolvedValueOnce({ rows: [] }) // update
      .mockResolvedValueOnce({ rows: [] }) // insert history
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    waitlistMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post("/appointments/appt-1/status")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("POST /appointments/:id/status creates late fee bill when cancelling within 24 hours", async () => {
    const soonStart = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ patient_id: "patient-1", scheduled_start: soonStart, status: "scheduled" }],
        rowCount: 1,
      }) // select appointment
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing late fee lookup
      .mockResolvedValueOnce({ rows: [] }) // insert bill
      .mockResolvedValueOnce({ rows: [] }) // insert bill line item
      .mockResolvedValueOnce({ rows: [] }) // update
      .mockResolvedValueOnce({ rows: [] }) // insert history
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post("/appointments/appt-1/status")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.lateFeeBillId).toBeTruthy();
    const insertBillCall = queryMock.mock.calls.find((call) => String(call[0]).includes("insert into bills"));
    expect(insertBillCall).toBeTruthy();
  });

  it("POST /appointments/late-fees/:billId/waive waives late fee bill", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            patient_responsibility_cents: 5000,
            paid_amount_cents: 0,
            adjustment_amount_cents: 0,
            notes: "[LATE_FEE]|appointmentId=appt-1|trigger=cancel|referenceStart=2026-02-23T12:00:00.000Z",
          },
        ],
        rowCount: 1,
      }) // select bill
      .mockResolvedValueOnce({ rows: [] }); // update bill

    const res = await request(app)
      .post("/appointments/late-fees/bill-1/waive")
      .send({ reason: "Patient emergency, fee waived by billing team" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "late_fee_waive", "bill", "bill-1");
  });
});
