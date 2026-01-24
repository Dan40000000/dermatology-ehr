import request from "supertest";
import express from "express";
import { frontDeskRouter } from "../frontDesk";
import { frontDeskService } from "../../services/frontDeskService";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "front_desk" };
    req.tenantId = "tenant-1";
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/frontDeskService", () => ({
  frontDeskService: {
    getTodaySchedule: jest.fn(),
    getDailyStats: jest.fn(),
    getWaitingRoomPatients: jest.fn(),
    getUpcomingPatients: jest.fn(),
    checkInPatient: jest.fn(),
    checkOutPatient: jest.fn(),
    updateAppointmentStatus: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/front-desk", frontDeskRouter);

const serviceMock = frontDeskService as jest.Mocked<typeof frontDeskService>;

beforeEach(() => {
  Object.values(serviceMock).forEach((fn) => fn.mockReset());
  (auditLog as jest.Mock).mockReset();
});

describe("Front desk routes", () => {
  it("GET /front-desk/today returns schedule", async () => {
    serviceMock.getTodaySchedule.mockResolvedValueOnce([{ id: "apt-1" }] as any);

    const res = await request(app).get("/front-desk/today");

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(1);
  });

  it("GET /front-desk/today handles errors", async () => {
    serviceMock.getTodaySchedule.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/front-desk/today");

    expect(res.status).toBe(500);
  });

  it("GET /front-desk/stats returns stats", async () => {
    serviceMock.getDailyStats.mockResolvedValueOnce({ totalScheduled: 5 } as any);

    const res = await request(app).get("/front-desk/stats");

    expect(res.status).toBe(200);
    expect(res.body.totalScheduled).toBe(5);
  });

  it("GET /front-desk/waiting returns waiting room patients", async () => {
    serviceMock.getWaitingRoomPatients.mockResolvedValueOnce([{ appointmentId: "apt-1" }] as any);

    const res = await request(app).get("/front-desk/waiting");

    expect(res.status).toBe(200);
    expect(res.body.patients).toHaveLength(1);
  });

  it("GET /front-desk/upcoming uses query limit", async () => {
    serviceMock.getUpcomingPatients.mockResolvedValueOnce([{ id: "apt-1" }] as any);

    const res = await request(app).get("/front-desk/upcoming?limit=2");

    expect(res.status).toBe(200);
    expect(serviceMock.getUpcomingPatients).toHaveBeenCalledWith("tenant-1", 2);
  });

  it("POST /front-desk/check-in returns success", async () => {
    serviceMock.checkInPatient.mockResolvedValueOnce({ encounterId: "enc-1" } as any);

    const res = await request(app).post("/front-desk/check-in/apt-1");

    expect(res.status).toBe(200);
    expect(res.body.encounterId).toBe("enc-1");
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /front-desk/check-out returns success", async () => {
    serviceMock.checkOutPatient.mockResolvedValueOnce(undefined as any);

    const res = await request(app).post("/front-desk/check-out/apt-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("PUT /front-desk/status rejects invalid payload", async () => {
    const res = await request(app).put("/front-desk/status/apt-1").send({ status: "nope" });

    expect(res.status).toBe(400);
  });

  it("PUT /front-desk/status updates status", async () => {
    serviceMock.updateAppointmentStatus.mockResolvedValueOnce(undefined as any);

    const res = await request(app).put("/front-desk/status/apt-1").send({ status: "checked_in" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });
});
