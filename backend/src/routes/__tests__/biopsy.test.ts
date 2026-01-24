import request from "supertest";
import express from "express";
import biopsyRouter from "../biopsy";
import { pool } from "../../db/pool";
import { BiopsyService } from "../../services/biopsyService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../services/biopsyService", () => ({
  BiopsyService: {
    validateBiopsyData: jest.fn(),
    generateSpecimenId: jest.fn(),
    updateLesionStatusForBiopsy: jest.fn(),
    trackSpecimen: jest.fn(),
    getPendingReviewBiopsies: jest.fn(),
    getOverdueBiopsies: jest.fn(),
    getBiopsyStats: jest.fn(),
    getQualityMetrics: jest.fn(),
    exportBiopsyLog: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../../websocket/emitter", () => ({
  emitBiopsyCreated: jest.fn(),
  emitBiopsyUpdated: jest.fn(),
  emitBiopsyResultReceived: jest.fn(),
  emitBiopsyReviewed: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/biopsies", biopsyRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const biopsyService = BiopsyService as jest.Mocked<typeof BiopsyService>;

const patientId = "11111111-1111-4111-8111-111111111111";
const encounterId = "22222222-2222-4222-8222-222222222222";
const lesionId = "33333333-3333-4333-8333-333333333333";
const providerId = "44444444-4444-4444-8444-444444444444";
const labId = "55555555-5555-4555-8555-555555555555";

const baseBiopsy = {
  patient_id: patientId,
  encounter_id: encounterId,
  lesion_id: lesionId,
  specimen_type: "punch",
  specimen_size: "2mm",
  body_location: "Left arm",
  ordering_provider_id: providerId,
  path_lab: "Lab A",
  path_lab_id: labId,
};

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  (logger.error as jest.Mock).mockReset();
  biopsyService.validateBiopsyData.mockReturnValue({ valid: true, errors: [] });
  biopsyService.generateSpecimenId.mockResolvedValue("BX-20250101-001");
  biopsyService.updateLesionStatusForBiopsy.mockResolvedValue(undefined);
  biopsyService.trackSpecimen.mockResolvedValue(undefined);
  biopsyService.getPendingReviewBiopsies.mockResolvedValue([]);
  biopsyService.getOverdueBiopsies.mockResolvedValue([]);
  biopsyService.getBiopsyStats.mockResolvedValue({ total: 0 });
  biopsyService.getQualityMetrics.mockResolvedValue({ total: 0 });
  biopsyService.exportBiopsyLog.mockResolvedValue([]);
  biopsyService.sendNotification.mockResolvedValue(undefined);
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Biopsy routes", () => {
  it("POST /biopsies rejects invalid payload", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    const res = await request(app).post("/biopsies").send({});
    expect(res.status).toBe(400);
  });

  it("POST /biopsies returns validation errors from service", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    biopsyService.validateBiopsyData.mockReturnValueOnce({ valid: false, errors: ["bad data"] });
    const res = await request(app).post("/biopsies").send(baseBiopsy);
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
  });

  it("POST /biopsies creates biopsy and tracks specimen", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "bio-1", lesion_id: lesionId }] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies").send(baseBiopsy);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("bio-1");
    expect(biopsyService.updateLesionStatusForBiopsy).toHaveBeenCalled();
    expect(biopsyService.trackSpecimen).toHaveBeenCalled();
  });

  it("GET /biopsies returns filtered list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1" }] });
    const res = await request(app).get(
      `/biopsies?patient_id=${patientId}&encounter_id=${encounterId}` +
        `&status=ordered&ordering_provider_id=${providerId}&is_overdue=true` +
        `&malignancy_type=melanoma&from_date=2025-01-01&to_date=2025-01-31&limit=5&offset=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.biopsies).toHaveLength(1);
  });

  it("GET /biopsies/pending returns pending biopsies", async () => {
    biopsyService.getPendingReviewBiopsies.mockResolvedValueOnce([{ id: "bio-1" }]);
    const res = await request(app).get(`/biopsies/pending?provider_id=${providerId}`);
    expect(res.status).toBe(200);
    expect(res.body.biopsies).toHaveLength(1);
  });

  it("GET /biopsies/overdue returns overdue biopsies", async () => {
    biopsyService.getOverdueBiopsies.mockResolvedValueOnce([{ id: "bio-2" }]);
    const res = await request(app).get("/biopsies/overdue");
    expect(res.status).toBe(200);
    expect(res.body.biopsies).toHaveLength(1);
  });

  it("GET /biopsies/stats returns stats", async () => {
    biopsyService.getBiopsyStats.mockResolvedValueOnce({ total: 10 });
    const res = await request(app).get(`/biopsies/stats?provider_id=${providerId}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
  });

  it("GET /biopsies/quality-metrics returns metrics", async () => {
    biopsyService.getQualityMetrics.mockResolvedValueOnce({ total: 3 });
    const res = await request(app).get("/biopsies/quality-metrics?start_date=2025-01-01&end_date=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it("GET /biopsies/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/biopsies/bio-1");
    expect(res.status).toBe(404);
  });

  it("GET /biopsies/:id returns biopsy", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1" }] });
    const res = await request(app).get("/biopsies/bio-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
  });

  it("PUT /biopsies/:id rejects empty updates", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);
    const res = await request(app).put("/biopsies/bio-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /biopsies/:id updates and tracks status", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "bio-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).put("/biopsies/bio-1").send({ status: "sent" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
    expect(biopsyService.trackSpecimen).toHaveBeenCalled();
  });

  it("POST /biopsies/:id/result returns 404 when missing", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies/bio-1/result").send({ pathology_diagnosis: "Nevus" });
    expect(res.status).toBe(404);
  });

  it("POST /biopsies/:id/result adds result and sends notifications", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "bio-1", lesion_id: lesionId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies/bio-1/result").send({
      pathology_diagnosis: "Melanoma",
      malignancy_type: "melanoma",
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
    expect(biopsyService.trackSpecimen).toHaveBeenCalled();
    expect(biopsyService.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("POST /biopsies/:id/review returns 404 when not resulted", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies/bio-1/review").send({});
    expect(res.status).toBe(404);
  });

  it("POST /biopsies/:id/review completes review", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "bio-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies/bio-1/review").send({
      follow_up_action: "monitoring",
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
    expect(biopsyService.trackSpecimen).toHaveBeenCalled();
  });

  it("POST /biopsies/:id/notify-patient returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/biopsies/bio-1/notify-patient").send({ method: "phone" });
    expect(res.status).toBe(404);
  });

  it("POST /biopsies/:id/notify-patient marks notified", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1" }] });
    const res = await request(app).post("/biopsies/bio-1/notify-patient").send({ method: "phone" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
  });

  it("GET /biopsies/:id/alerts returns alerts", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "alert-1" }] });
    const res = await request(app).get("/biopsies/bio-1/alerts");
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
  });

  it("GET /biopsies/export/log returns CSV", async () => {
    biopsyService.exportBiopsyLog.mockResolvedValueOnce([
      {
        specimen_id: "BX-1",
        ordered_at: "2025-01-01",
        mrn: "MRN-1",
        patient_name: "Test Patient",
        date_of_birth: "1980-01-01",
        body_location: "Arm",
        specimen_type: "punch",
        status: "ordered",
        pathology_diagnosis: "Nevus",
        malignancy_type: null,
        diagnosis_code: "D22",
        margins: "clear",
        follow_up_action: "none",
        ordering_provider: "Dr A",
        path_lab: "Lab",
        turnaround_time_days: 5,
        patient_notified: true,
      },
    ]);
    const res = await request(app).get("/biopsies/export/log");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("Specimen ID");
    expect(res.text).toContain("BX-1");
  });
});
