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
    serviceMock.checkInPatient.mockResolvedValueOnce({
      encounterId: "enc-1",
      copayAmount: 35,
      copayAmountCents: 3500,
      copaySource: "insurance_profile",
      eligibilityStatus: "Active",
      eligibilityVerifiedAt: "2026-02-27T12:00:00.000Z",
    } as any);

    const res = await request(app).post("/front-desk/check-in/apt-1");

    expect(res.status).toBe(200);
    expect(res.body.encounterId).toBe("enc-1");
    expect(res.body.copayAmount).toBe(35);
    expect(res.body.copayAmountCents).toBe(3500);
    expect(res.body.copaySource).toBe("insurance_profile");
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /front-desk/check-in still succeeds when audit logging fails", async () => {
    serviceMock.checkInPatient.mockResolvedValueOnce({
      encounterId: "enc-1",
      copayAmount: 0,
      copayAmountCents: 0,
      copaySource: "none",
    } as any);
    (auditLog as jest.Mock).mockRejectedValueOnce(new Error("audit down"));

    const res = await request(app).post("/front-desk/check-in/apt-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.encounterId).toBe("enc-1");
  });

  it("POST /front-desk/check-in forwards copay collect payload", async () => {
    serviceMock.checkInPatient.mockResolvedValueOnce({
      encounterId: "enc-1",
      copayAmount: 35,
      copayAmountCents: 3500,
      copaySource: "insurance_profile",
      copayDisposition: "collected",
      copayCollectedAmountCents: 3500,
      paymentReceiptNumber: "RCP-2026-000001",
      paymentConfirmationEmailSent: true,
      paymentConfirmationEmailAddress: "patient@example.com",
    } as any);

    const res = await request(app).post("/front-desk/check-in/apt-1").send({
      collectCopay: true,
      copayAmountCents: 3500,
      paymentMethod: "credit",
      notes: "Paid at desk",
    });

    expect(res.status).toBe(200);
    expect(serviceMock.checkInPatient).toHaveBeenCalledWith(
      "tenant-1",
      "apt-1",
      expect.objectContaining({
        collectCopay: true,
        copayAmountCents: 3500,
        paymentMethod: "credit",
      })
    );
    expect(res.body.copayDisposition).toBe("collected");
    expect(res.body.copayCollectedAmountCents).toBe(3500);
    expect(res.body.paymentReceiptNumber).toBe("RCP-2026-000001");
    expect(res.body.paymentConfirmationEmailSent).toBe(true);
    expect(res.body.paymentConfirmationEmailAddress).toBe("patient@example.com");
  });

  it("POST /front-desk/check-out returns success", async () => {
    serviceMock.checkOutPatient.mockResolvedValueOnce({
      status: "completed",
      requiresPayment: false,
      paymentDueCents: 0,
    } as any);

    const res = await request(app).post("/front-desk/check-out/apt-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /front-desk/check-out returns checkout state when payment is due", async () => {
    serviceMock.checkOutPatient.mockResolvedValueOnce({
      status: "checkout",
      requiresPayment: true,
      paymentDueCents: 7500,
    } as any);

    const res = await request(app).post("/front-desk/check-out/apt-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("checkout");
    expect(res.body.requiresPayment).toBe(true);
    expect(res.body.paymentDueCents).toBe(7500);
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
