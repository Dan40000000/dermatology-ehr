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
const auditLogMock = auditLog as jest.Mock;
const waitlistMock = waitlistAutoFillService.processAppointmentCancellation as jest.Mock;
const loggerInfoMock = logger.info as jest.Mock;
const loggerErrorMock = logger.error as jest.Mock;

const basePayload = {
  patientId: "patient-1",
  providerId: "provider-1",
  locationId: "location-1",
  appointmentTypeId: "type-1",
  scheduledStart: "2024-01-02T10:00:00.000Z",
  scheduledEnd: "2024-01-02T10:30:00.000Z",
};

beforeEach(() => {
  authUser = { id: "user-1", tenantId: "tenant-1", role: "admin" };
  allowMissingUser = false;
  queryMock.mockReset();
  auditLogMock.mockReset();
  waitlistMock.mockReset();
  loggerInfoMock.mockReset();
  loggerErrorMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
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

  it("POST /appointments/:id/reschedule returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({ scheduledStart: basePayload.scheduledStart, scheduledEnd: basePayload.scheduledEnd });

    expect(res.status).toBe(404);
  });

  it("POST /appointments/:id/reschedule returns 409 on conflict", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ provider_id: "provider-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "appt-2" }], rowCount: 1 });

    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({ scheduledStart: basePayload.scheduledStart, scheduledEnd: basePayload.scheduledEnd });

    expect(res.status).toBe(409);
  });

  it("POST /appointments/:id/reschedule updates appointment", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ provider_id: "provider-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/appointments/appt-1/reschedule")
      .send({ scheduledStart: basePayload.scheduledStart, scheduledEnd: basePayload.scheduledEnd });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("POST /appointments/:id/status triggers waitlist auto-fill", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
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
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

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
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    waitlistMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post("/appointments/appt-1/status")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
