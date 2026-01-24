import request from "supertest";
import express from "express";
import { cosmeticTreatmentsRouter } from "../cosmeticTreatments";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: { query: jest.fn() },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/cosmetic-treatments", cosmeticTreatmentsRouter);

const queryMock = pool.query as jest.Mock;

const baseTreatment = {
  patientId: "patient-1",
  treatmentType: "botox",
  treatmentDate: "2025-01-01",
  providerId: "provider-1",
};

const botoxSite = {
  treatmentId: "treatment-1",
  anatomicalRegion: "glabella",
  bodyView: "face_front",
  xCoordinate: 20,
  yCoordinate: 30,
  unitsInjected: 10,
};

const fillerSite = {
  treatmentId: "treatment-1",
  anatomicalRegion: "lips_upper",
  bodyView: "face_front",
  xCoordinate: 40,
  yCoordinate: 50,
  mlInjected: 0.5,
};

const treatmentEvent = {
  treatmentId: "treatment-1",
  eventType: "follow_up",
  description: "Follow up scheduled",
};

beforeEach(() => {
  queryMock.mockReset();
  (auditLog as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Cosmetic treatments routes", () => {
  it("GET /cosmetic-treatments returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "ct-1" }] });
    const res = await request(app).get("/cosmetic-treatments");
    expect(res.status).toBe(200);
    expect(res.body.treatments).toHaveLength(1);
  });

  it("GET /cosmetic-treatments supports filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "ct-1" }] });
    const res = await request(app).get("/cosmetic-treatments").query({
      patientId: "patient-1",
      providerId: "provider-1",
      treatmentType: "botox",
      fromDate: "2025-01-01",
      toDate: "2025-01-31",
      limit: "25",
    });
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ct.treatment_date"),
      expect.arrayContaining(["tenant-1", "patient-1", "provider-1", "botox", "2025-01-01", "2025-01-31", 25])
    );
  });

  it("GET /cosmetic-treatments/:id returns 404 when missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/cosmetic-treatments/ct-1");
    expect(res.status).toBe(404);
  });

  it("GET /cosmetic-treatments/:id returns treatment details", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "ct-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "botox-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "filler-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] });
    const res = await request(app).get("/cosmetic-treatments/ct-1");
    expect(res.status).toBe(200);
    expect(res.body.treatment.id).toBe("ct-1");
    expect(res.body.treatment.botoxInjectionSites).toHaveLength(1);
    expect(res.body.treatment.fillerInjectionSites).toHaveLength(1);
    expect(res.body.treatment.events).toHaveLength(1);
  });

  it("POST /cosmetic-treatments rejects invalid payload", async () => {
    const res = await request(app).post("/cosmetic-treatments").send({ patientId: "p1" });
    expect(res.status).toBe(400);
  });

  it("POST /cosmetic-treatments creates treatment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "ct-1" }] });
    const res = await request(app).post("/cosmetic-treatments").send(baseTreatment);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("ct-1");
    expect(auditLog).toHaveBeenCalled();
  });

  it("PUT /cosmetic-treatments/:id accepts empty payload defaults", async () => {
    const res = await request(app).put("/cosmetic-treatments/ct-1").send({});
    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalled();
  });

  it("PUT /cosmetic-treatments/:id updates treatment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/cosmetic-treatments/ct-1").send({ notes: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("PUT /cosmetic-treatments/:id updates all fields", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/cosmetic-treatments/ct-1").send({
      encounterId: "enc-1",
      treatmentType: "laser",
      productName: "Laser X",
      treatmentDate: "2025-01-05",
      injectionSites: [{ region: "forehead", x: 10, y: 20, units: 5 }],
      totalUnits: 20,
      dilutionRatio: "2:1",
      fillerSites: [{ region: "cheek", x: 30, y: 40, ml: 0.3 }],
      totalMl: 1.2,
      fillerType: "hyaluronic_acid",
      lotNumber: "LOT-123",
      expirationDate: "2026-01-01",
      deviceName: "Device A",
      settings: { fluence: 5, additional_settings: { mode: "safe" } },
      treatmentAreas: ["face", "neck"],
      passes: 2,
      peelStrength: "superficial",
      peelAgent: "Glycolic",
      beforePhotoId: "photo-1",
      afterPhotoId: "photo-2",
      patientConsentSigned: true,
      consentFormId: "consent-1",
      complications: "None",
      adverseReactions: "Mild redness",
      followUpDate: "2025-01-12",
      followUpInstructions: "Return in one week",
      cptCodes: ["11100"],
      chargedAmountCents: 20000,
      indication: "Cosmetic",
      preTreatmentAssessment: "Assessment",
      postTreatmentInstructions: "Post care",
      notes: "Updated notes",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /cosmetic-treatments/:id deletes treatment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/cosmetic-treatments/ct-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /cosmetic-treatments/patient/:patientId/history returns history", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "hist-1" }] });
    const res = await request(app).get("/cosmetic-treatments/patient/patient-1/history");
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
  });

  it("GET /cosmetic-treatments/alerts/follow-ups returns follow ups", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "follow-1" }] });
    const res = await request(app).get("/cosmetic-treatments/alerts/follow-ups?days=7");
    expect(res.status).toBe(200);
    expect(res.body.treatments).toHaveLength(1);
  });

  it("POST /cosmetic-treatments/botox-sites rejects invalid payload", async () => {
    const res = await request(app).post("/cosmetic-treatments/botox-sites").send({});
    expect(res.status).toBe(400);
  });

  it("POST /cosmetic-treatments/botox-sites returns 404 when missing treatment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).post("/cosmetic-treatments/botox-sites").send(botoxSite);
    expect(res.status).toBe(404);
  });

  it("POST /cosmetic-treatments/botox-sites creates site", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "ct-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "site-1" }] });
    const res = await request(app).post("/cosmetic-treatments/botox-sites").send(botoxSite);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("site-1");
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /cosmetic-treatments/:id/botox-sites returns sites", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "site-1" }] });
    const res = await request(app).get("/cosmetic-treatments/treatment-1/botox-sites");
    expect(res.status).toBe(200);
    expect(res.body.sites).toHaveLength(1);
  });

  it("DELETE /cosmetic-treatments/botox-sites/:id deletes site", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/cosmetic-treatments/botox-sites/site-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /cosmetic-treatments/filler-sites creates site", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "ct-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "site-2" }] });
    const res = await request(app).post("/cosmetic-treatments/filler-sites").send(fillerSite);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("site-2");
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /cosmetic-treatments/:id/filler-sites returns sites", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "site-2" }] });
    const res = await request(app).get("/cosmetic-treatments/treatment-1/filler-sites");
    expect(res.status).toBe(200);
    expect(res.body.sites).toHaveLength(1);
  });

  it("DELETE /cosmetic-treatments/filler-sites/:id deletes site", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/cosmetic-treatments/filler-sites/site-2");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /cosmetic-treatments/events creates event", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "ct-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] });
    const res = await request(app).post("/cosmetic-treatments/events").send(treatmentEvent);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("event-1");
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /cosmetic-treatments/:id/events returns events", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "event-1" }] });
    const res = await request(app).get("/cosmetic-treatments/treatment-1/events");
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });

  it("DELETE /cosmetic-treatments/events/:id deletes event", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/cosmetic-treatments/events/event-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /cosmetic-treatments/stats/summary returns stats", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ treatment_type: "botox", count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1500" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });
    const res = await request(app).get("/cosmetic-treatments/stats/summary");
    expect(res.status).toBe(200);
    expect(res.body.totalTreatments).toBe(2);
    expect(res.body.totalRevenueCents).toBe(1500);
    expect(res.body.treatmentsWithComplications).toBe(1);
  });
});
