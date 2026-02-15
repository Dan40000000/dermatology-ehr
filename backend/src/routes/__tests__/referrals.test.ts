import request from "supertest";
import express from "express";
import { referralsRouter } from "../referrals";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { ReferralService } from "../../services/referralService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider", fullName: "Provider User" };
    return next();
  },
}));

jest.mock("../../middleware/moduleAccess", () => ({
  requireModuleAccess: () => (_req: any, _res: any, next: any) => next(),
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

jest.mock("../../services/referralService", () => ({
  ReferralService: {
    processIncomingReferral: jest.fn(),
    updateReferralStatus: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/referrals", referralsRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const referralServiceMock = ReferralService as jest.Mocked<typeof ReferralService>;

beforeEach(() => {
  queryMock.mockReset();
  auditLogMock.mockReset();
  referralServiceMock.processIncomingReferral.mockReset();
  referralServiceMock.updateReferralStatus.mockReset();

  referralServiceMock.processIncomingReferral.mockResolvedValue({
    referralId: "referral-1",
    referralNumber: "REF-0001",
    autoAcknowledged: false,
  });
  referralServiceMock.updateReferralStatus.mockResolvedValue();

  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Referrals routes - List", () => {
  it("GET /referrals returns referrals", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "referral-1",
          patient_id: "patient-1",
          direction: "outgoing",
          status: "new",
          priority: "routine",
          patientFirstName: "John",
          patientLastName: "Doe",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/referrals");

    expect(res.status).toBe(200);
    expect(res.body.referrals).toHaveLength(1);
    expect(res.body.referrals[0].direction).toBe("outgoing");
  });

  it("GET /referrals filters by status", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/referrals?status=completed");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("r.status = $2"), expect.arrayContaining(["completed"]));
  });

  it("GET /referrals filters by direction", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/referrals?direction=incoming");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("r.direction = $2"), expect.arrayContaining(["incoming"]));
  });

  it("GET /referrals filters by patientId", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/referrals?patientId=patient-1");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("r.patient_id = $2"), expect.arrayContaining(["patient-1"]));
  });

  it("GET /referrals filters by priority", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/referrals?priority=urgent");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("r.priority = $2"), expect.arrayContaining(["urgent"]));
  });

  it("GET /referrals combines multiple filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/referrals?status=new&direction=incoming&priority=urgent");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("r.status = $2"),
      expect.arrayContaining(["new", "incoming", "urgent"])
    );
  });
});

describe("Referrals routes - Get single", () => {
  it("GET /referrals/:id returns referral", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "referral-1",
          patient_id: "patient-1",
          direction: "outgoing",
          status: "new",
          patientFirstName: "John",
          patientLastName: "Doe",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/referrals/referral-1");

    expect(res.status).toBe(200);
    expect(res.body.referral.id).toBe("referral-1");
  });

  it("GET /referrals/:id returns 404 when referral not found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/referrals/referral-1");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("Referrals routes - Create", () => {
  it("POST /referrals creates referral", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
      direction: "outgoing",
      status: "new",
      priority: "routine",
      referringProvider: "Dr. Smith",
      referredToOrganization: "Specialty Clinic",
      reason: "Advanced treatment",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("referral-1");
    expect(res.body.referralNumber).toBe("REF-0001");
  });

  it("POST /referrals creates referral with minimal data", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
      direction: "incoming",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("referral-1");
  });

  it("POST /referrals defaults status to new", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
      direction: "outgoing",
    });

    expect(res.status).toBe(201);
    expect(referralServiceMock.processIncomingReferral).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        patientId: "patient-1",
        priority: "routine",
      }),
      "user-1"
    );
  });

  it("POST /referrals defaults priority to routine", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
      direction: "outgoing",
    });

    expect(res.status).toBe(201);
    expect(referralServiceMock.processIncomingReferral).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        patientId: "patient-1",
        priority: "routine",
      }),
      "user-1"
    );
  });

  it("POST /referrals rejects missing patientId", async () => {
    const res = await request(app).post("/referrals").send({
      direction: "outgoing",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /referrals rejects missing direction", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
    });

    expect(res.status).toBe(201);
    expect(referralServiceMock.processIncomingReferral).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        patientId: "patient-1",
      }),
      "user-1"
    );
  });

  it("POST /referrals rejects invalid direction", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
      direction: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /referrals rejects invalid status", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
      direction: "outgoing",
      status: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /referrals rejects invalid priority", async () => {
    const res = await request(app).post("/referrals").send({
      patientId: "patient-1",
      direction: "outgoing",
      priority: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("Referrals routes - Update", () => {
  it("PUT /referrals/:id updates referral", async () => {
    const res = await request(app).put("/referrals/referral-1").send({
      status: "scheduled",
      appointmentId: "appt-1",
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("referral-1");
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "referral_update", "referral", "referral-1");
  });

  it("PUT /referrals/:id updates multiple fields", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "referral-1" }], rowCount: 1 });

    const res = await request(app).put("/referrals/referral-1").send({
      status: "in_progress",
      priority: "urgent",
      notes: "Updated notes",
    });

    expect(res.status).toBe(200);
  });

  it("PUT /referrals/:id handles empty string values", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "referral-1" }], rowCount: 1 });

    const res = await request(app).put("/referrals/referral-1").send({
      referringProvider: "",
      notes: "",
    });

    expect(res.status).toBe(200);
  });

  it("PUT /referrals/:id returns 404 when referral not found", async () => {
    referralServiceMock.updateReferralStatus.mockRejectedValueOnce(new Error("Referral not found"));

    const res = await request(app).put("/referrals/referral-1").send({
      status: "completed",
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("PUT /referrals/:id rejects no updates", async () => {
    const res = await request(app).put("/referrals/referral-1").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No updates provided");
  });

  it("PUT /referrals/:id rejects invalid status", async () => {
    const res = await request(app).put("/referrals/referral-1").send({
      status: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("PUT /referrals/:id rejects invalid priority", async () => {
    const res = await request(app).put("/referrals/referral-1").send({
      priority: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("Referrals routes - Delete", () => {
  it("DELETE /referrals/:id deletes referral", async () => {
    const res = await request(app).delete("/referrals/referral-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("referral-1");
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "referral_delete", "referral", "referral-1");
  });

  it("DELETE /referrals/:id returns 404 when referral not found", async () => {
    referralServiceMock.updateReferralStatus.mockRejectedValueOnce(new Error("Referral not found"));

    const res = await request(app).delete("/referrals/referral-1");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("Referrals routes - Error handling", () => {
  it("handles database errors gracefully", async () => {
    queryMock.mockRejectedValueOnce(new Error("Database error"));

    const res = await request(app).get("/referrals");

    expect(res.status).toBe(500);
  });
});
