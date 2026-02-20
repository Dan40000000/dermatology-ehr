import request from "supertest";
import express from "express";
import { encountersRouter } from "../encounters";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { recordEncounterLearning } from "../../services/learningService";
import { encounterService } from "../../services/encounterService";
import { billingService } from "../../services/billingService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/learningService", () => ({
  recordEncounterLearning: jest.fn(),
}));

jest.mock("../../services/encounterService", () => ({
  encounterService: {
    generateChargesFromEncounter: jest.fn(),
    addDiagnosis: jest.fn(),
    addProcedure: jest.fn(),
    completeEncounter: jest.fn(),
  },
}));

jest.mock("../../services/billingService", () => ({
  billingService: {
    createClaimFromCharges: jest.fn(),
  },
}));

jest.mock("../../websocket/emitter", () => ({
  emitEncounterCreated: jest.fn(),
  emitEncounterUpdated: jest.fn(),
  emitEncounterCompleted: jest.fn(),
  emitEncounterSigned: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/encounters", encountersRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;
const learningMock = recordEncounterLearning as jest.Mock;
const encounterServiceMock = encounterService as jest.Mocked<typeof encounterService>;
const billingServiceMock = billingService as jest.Mocked<typeof billingService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  learningMock.mockReset();
  Object.values(encounterServiceMock).forEach((fn) => fn.mockReset());
  Object.values(billingServiceMock).forEach((fn) => fn.mockReset());
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Encounters routes", () => {
  it("GET /encounters returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "enc-1" }] });
    const res = await request(app).get("/encounters");
    expect(res.status).toBe(200);
    expect(res.body.encounters).toHaveLength(1);
  });

  it("POST /encounters rejects invalid payload", async () => {
    const res = await request(app).post("/encounters").send({ providerId: "prov-1" });
    expect(res.status).toBe(400);
  });

  it("POST /encounters creates encounter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/encounters").send({
      patientId: "pat-1",
      providerId: "prov-1",
      chiefComplaint: "Rash",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post("/encounters/enc-1").send({ chiefComplaint: "Update" });
    expect(res.status).toBe(404);
  });

  it("POST /encounters/:id returns 409 when locked", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "locked" }] });
    const res = await request(app).post("/encounters/enc-1").send({ chiefComplaint: "Update" });
    expect(res.status).toBe(409);
  });

  it("POST /encounters/:id updates encounter", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "draft" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/encounters/enc-1").send({ chiefComplaint: "Update" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id/status rejects invalid payload", async () => {
    const res = await request(app).post("/encounters/enc-1/status").send({});
    expect(res.status).toBe(400);
  });

  it("POST /encounters/:id/status updates status and triggers learning", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    learningMock.mockResolvedValueOnce(undefined);
    const res = await request(app).post("/encounters/enc-1/status").send({ status: "locked" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(learningMock).toHaveBeenCalledWith("enc-1");
  });

  it("POST /encounters/:id/status auto-stops ambient recordings for closed states", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // encounter status update
      .mockResolvedValueOnce({ rows: [] }) // audit insert
      .mockResolvedValueOnce({ rows: [{ id: "rec-1" }], rowCount: 1 }); // ambient auto-stop update

    const res = await request(app).post("/encounters/enc-1/status").send({ status: "closed" });

    expect(res.status).toBe(200);
    const ambientUpdateCall = queryMock.mock.calls.find((call) =>
      typeof call[0] === "string" && call[0].includes("UPDATE ambient_recordings")
    );
    expect(ambientUpdateCall).toBeTruthy();
    expect(auditMock).toHaveBeenCalledWith("tenant-1", "user-1", "ambient_recording_auto_stop", "ambient_recording", "rec-1");
  });

  it("POST /encounters/:id/status ignores learning errors", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    learningMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).post("/encounters/enc-1/status").send({ status: "finalized" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /encounters/:id/superbill returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).get("/encounters/enc-1/superbill");
    expect(res.status).toBe(404);
  });

  it("GET /encounters/:id/superbill returns HTML", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "enc-1",
            patientFirstName: "Ava",
            patientLastName: "Jones",
            practicePhone: "555-1111",
            providerName: "Dr. Smith",
            providerNpi: "123",
            practiceName: "Derm Clinic",
            practiceAddress: "123 Main",
            practiceCity: "City",
            practiceState: "CA",
            practiceZip: "12345",
            practiceNpi: "987",
            practiceTaxId: "11-1111111",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "dx-1", icd10Code: "L40.0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "chg-1", cptCode: "11100", feeCents: 10000, quantity: 1 }] });

    const res = await request(app).get("/encounters/enc-1/superbill");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Superbill - Jones, Ava");
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /encounters/:id/prescriptions returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).get("/encounters/enc-1/prescriptions");

    expect(res.status).toBe(404);
  });

  it("GET /encounters/:id/prescriptions returns list", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ patient_id: "pat-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get("/encounters/enc-1/prescriptions");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id/generate-charges returns charges", async () => {
    encounterServiceMock.generateChargesFromEncounter.mockResolvedValueOnce([{ id: "chg-1" }] as any);

    const res = await request(app).post("/encounters/enc-1/generate-charges");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id/generate-charges handles errors", async () => {
    encounterServiceMock.generateChargesFromEncounter.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/encounters/enc-1/generate-charges");

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error generating charges", { error: "boom" });
  });

  it("POST /encounters/:id/generate-charges masks non-Error failures", async () => {
    encounterServiceMock.generateChargesFromEncounter.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).post("/encounters/enc-1/generate-charges");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to generate charges");
    expect(loggerMock.error).toHaveBeenCalledWith("Error generating charges", { error: "Unknown error" });
  });

  it("POST /encounters/:id/diagnoses rejects invalid payload", async () => {
    const res = await request(app).post("/encounters/enc-1/diagnoses").send({ icd10Code: "L30.9" });

    expect(res.status).toBe(400);
  });

  it("POST /encounters/:id/diagnoses adds diagnosis", async () => {
    encounterServiceMock.addDiagnosis.mockResolvedValueOnce("diag-1");

    const res = await request(app).post("/encounters/enc-1/diagnoses").send({
      icd10Code: "L30.9",
      description: "Dermatitis",
      isPrimary: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("diag-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id/procedures rejects invalid payload", async () => {
    const res = await request(app).post("/encounters/enc-1/procedures").send({ cptCode: "11100" });

    expect(res.status).toBe(400);
  });

  it("POST /encounters/:id/procedures adds procedure", async () => {
    encounterServiceMock.addProcedure.mockResolvedValueOnce("chg-1");

    const res = await request(app).post("/encounters/enc-1/procedures").send({
      cptCode: "11100",
      description: "Biopsy",
      quantity: 1,
      modifiers: ["25"],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("chg-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id/complete completes encounter", async () => {
    encounterServiceMock.completeEncounter.mockResolvedValueOnce(undefined as any);

    const res = await request(app).post("/encounters/enc-1/complete");

    expect(res.status).toBe(200);
    expect(res.body.encounterId).toBe("enc-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id/complete auto-stops ambient recordings", async () => {
    encounterServiceMock.completeEncounter.mockResolvedValueOnce(undefined as any);
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rec-1" }], rowCount: 1 });

    const res = await request(app).post("/encounters/enc-1/complete");

    expect(res.status).toBe(200);
    const ambientUpdateCall = queryMock.mock.calls.find((call) =>
      typeof call[0] === "string" && call[0].includes("UPDATE ambient_recordings")
    );
    expect(ambientUpdateCall).toBeTruthy();
    expect(auditMock).toHaveBeenCalledWith("tenant-1", "user-1", "ambient_recording_auto_stop", "ambient_recording", "rec-1");
  });

  it("POST /encounters/:id/create-claim returns claim", async () => {
    billingServiceMock.createClaimFromCharges.mockResolvedValueOnce({
      id: "claim-1",
      claimNumber: "CLM-1",
      totalCents: 1000,
      status: "draft",
    } as any);

    const res = await request(app).post("/encounters/enc-1/create-claim");

    expect(res.status).toBe(201);
    expect(res.body.claimId).toBe("claim-1");
  });

  it("GET /encounters/:id/charges returns charges", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: "chg-1", cptCode: "11100", description: "Biopsy", quantity: 2, feeCents: 1000 },
      ],
    });

    const res = await request(app).get("/encounters/enc-1/charges");

    expect(res.status).toBe(200);
    expect(res.body.totalCents).toBe(2000);
    expect(auditMock).toHaveBeenCalled();
  });
});
