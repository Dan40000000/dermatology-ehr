import request from "supertest";
import express from "express";
import biopsyRouter from "../biopsy";
import { pool } from "../../db/pool";
import { BiopsyService } from "../../services/biopsyService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: req.header("X-Test-Role") || "provider" };
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
    getSafetyCommandCenter: jest.fn(),
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
  biopsyService.getSafetyCommandCenter.mockResolvedValue({
    summary: { total_open_loops: 0 },
    queues: { critical: [] },
    biopsies: [],
  });
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
      .mockResolvedValueOnce({ rows: [{
        patient_ok: true, encounter_ok: true, lesion_ok: true, provider_ok: true, lab_ok: true,
      }] })
      .mockResolvedValueOnce({ rows: [{ id: "bio-1", lesion_id: lesionId }] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies").send(baseBiopsy);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("bio-1");
    expect(biopsyService.updateLesionStatusForBiopsy).toHaveBeenCalled();
    expect(biopsyService.trackSpecimen).toHaveBeenCalled();
    expect(biopsyService.generateSpecimenId).toHaveBeenCalledWith({ tenantId: "tenant-1" }, client);
    expect(biopsyService.updateLesionStatusForBiopsy).toHaveBeenCalledWith(
      lesionId,
      "bio-1",
      "tenant-1",
      client,
    );
    expect(biopsyService.trackSpecimen).toHaveBeenCalledWith(
      expect.objectContaining({ biopsyId: "bio-1", eventType: "ordered" }),
      client,
    );
    expect(String(client.query.mock.calls[1][0])).toContain("FROM lesions");
    expect(String(client.query.mock.calls[1][0])).toContain("FROM lab_interfaces");
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO biopsy_status_history"))).toBe(true);
  });

  it("POST /biopsies accepts bounded opaque TEXT references", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        patient_ok: true, encounter_ok: true, lesion_ok: true, provider_ok: true, lab_ok: true,
      }] })
      .mockResolvedValueOnce({ rows: [{ id: "biopsy-demo-1", lesion_id: "lesion-demo-1" }] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies").send({
      ...baseBiopsy,
      patient_id: "demo-patient-1",
      encounter_id: "enc-demo-jane-biopsy",
      lesion_id: "lesion-demo-1",
      ordering_provider_id: "prov-demo",
      path_lab_id: "lab-interface-demo",
    });

    expect(res.status).toBe(201);
    expect(client.query.mock.calls[1][1]).toEqual([
      "tenant-1", "demo-patient-1", "enc-demo-jane-biopsy", "lesion-demo-1", "prov-demo", "lab-interface-demo",
    ]);
  });

  it("POST /biopsies rejects cross-tenant or cross-patient references before insert", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        patient_ok: true, encounter_ok: false, lesion_ok: true, provider_ok: true, lab_ok: true,
      }] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies").send(baseBiopsy);
    expect(res.status).toBe(400);
    expect(res.body.invalidReferences).toEqual(["encounter"]);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO biopsies"))).toBe(false);
  });

  it("blocks non-clinical users from adding pathology results", async () => {
    const res = await request(app)
      .post("/biopsies/bio-1/result")
      .set("X-Test-Role", "billing")
      .send({ pathology_diagnosis: "Nevus" });
    expect(res.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
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

  it("allows manager access to biopsy reads exposed by the clinical labs module", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1" }] });
    const res = await request(app).get("/biopsies").set("X-Test-Role", "manager");
    expect(res.status).toBe(200);
    expect(res.body.biopsies).toHaveLength(1);
  });

  it("blocks non-clinical users from biopsy list and detail reads", async () => {
    const list = await request(app).get("/biopsies").set("X-Test-Role", "billing");
    const detail = await request(app).get("/biopsies/bio-1").set("X-Test-Role", "billing");

    expect(list.status).toBe(403);
    expect(detail.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
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

  it("GET /biopsies/command-center returns safety queues", async () => {
    biopsyService.getSafetyCommandCenter.mockResolvedValueOnce({
      summary: { total_open_loops: 2, critical_items: 1 },
      queues: { critical: [{ id: "bio-1" }], pendingReview: [{ id: "bio-2" }] },
      biopsies: [{ id: "bio-1" }, { id: "bio-2" }],
    });

    const res = await request(app).get(`/biopsies/command-center?provider_id=${providerId}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.critical_items).toBe(1);
    expect(res.body.queues.critical).toHaveLength(1);
    expect(biopsyService.getSafetyCommandCenter).toHaveBeenCalledWith("tenant-1", providerId);
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
      .mockResolvedValueOnce({ rows: [{ status: "ordered" }] })
      .mockResolvedValueOnce({ rows: [{ id: "bio-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).put("/biopsies/bio-1").send({ status: "sent" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
    expect(biopsyService.trackSpecimen).toHaveBeenCalledWith(
      expect.objectContaining({ biopsyId: "bio-1", eventType: "sent" }),
      client,
    );
    expect(String(client.query.mock.calls[2][0])).toContain("status = ANY");
    expect(client.query.mock.calls[2][1]).toEqual(["sent", "bio-1", "tenant-1", ["ordered", "collected"]]);
    expect(client.query.mock.calls[3][1]).toEqual(["tenant-1", "bio-1", "ordered", "sent", "user-1", "Status updated to sent"]);
  });

  it("PUT /biopsies/:id accepts diagnosis updates without status changes", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "bio-1", diagnosis_code: "C44.91" }] });
    connectMock.mockResolvedValueOnce(client);
    biopsyService.trackSpecimen.mockClear();

    const res = await request(app).put("/biopsies/bio-1").send({
      diagnosis_code: "C44.91",
      diagnosis_description: "Basal cell carcinoma of skin, unspecified",
    });
    expect(res.status).toBe(200);
    expect(res.body.diagnosis_code).toBe("C44.91");
    expect(biopsyService.trackSpecimen).not.toHaveBeenCalled();
  });

  it("PUT /biopsies/:id cannot bypass the dedicated pathology result transition", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });
    connectMock.mockResolvedValueOnce(client);
    const res = await request(app).put("/biopsies/bio-1").send({ status: "resulted" });
    expect(res.status).toBe(400);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE biopsies"))).toBe(false);
  });

  it("blocks an MA from changing provider-owned diagnosis fields", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app)
      .put("/biopsies/bio-1")
      .set("X-Test-Role", "ma")
      .send({ diagnosis_code: "C44.91" });

    expect(res.status).toBe(403);
    expect(res.body.forbiddenFields).toEqual(["diagnosis_code"]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("atomically rejects a regressive status update", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: "sent" }] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app)
      .put("/biopsies/bio-1")
      .set("X-Test-Role", "ma")
      .send({ status: "collected" });

    expect(res.status).toBe(409);
    expect(res.body.currentStatus).toBe("sent");
    expect(String(client.query.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(client.query.mock.calls[1][1]).toEqual(["bio-1", "tenant-1"]);
    expect(biopsyService.trackSpecimen).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ rows: [{ status: "sent" }] })
      .mockResolvedValueOnce({ rows: [{
        id: "bio-1", lesion_id: lesionId,
        received_by_lab_at: "2026-01-01T00:00:00Z",
        resulted_at: "2026-01-08T00:00:00Z",
        updated_at: "2026-01-08T00:00:00Z",
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/biopsies/bio-1/result").send({
      pathology_diagnosis: "Melanoma",
      malignancy_type: "melanoma",
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
    expect(biopsyService.trackSpecimen).toHaveBeenCalledWith(
      expect.objectContaining({ biopsyId: "bio-1", eventType: "resulted" }),
      client,
    );
    expect(client.query.mock.calls.some(([sql, values]) => (
      String(sql).includes("INSERT INTO biopsy_status_history")
      && values?.[2] === "sent"
      && values?.[3] === "resulted"
      && values?.[4] === "user-1"
    ))).toBe(true);
    expect(biopsyService.sendNotification).toHaveBeenCalledTimes(2);
    const candidateInserts = queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO mips_readiness_evidence'));
    expect(candidateInserts.map(([, values]) => values[4])).toEqual(['440', 'AAD6']);
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
    expect(biopsyService.trackSpecimen).toHaveBeenCalledWith(
      expect.objectContaining({ biopsyId: "bio-1", eventType: "reviewed" }),
      client,
    );
    expect(String(client.query.mock.calls[1][0])).toContain("p.tenant_id = $8");
  });

  it("POST /biopsies/:id/notify-patient returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/biopsies/bio-1/notify-patient").send({ method: "phone" });
    expect(res.status).toBe(404);
  });

  it("POST /biopsies/:id/notify-patient marks notified", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      id: "bio-1",
      resulted_at: "2026-02-01T00:00:00Z",
      patient_notified_at: "2026-02-09T00:00:00Z",
      patient_notified_method: "phone",
      updated_at: "2026-02-09T00:00:00Z",
    }] });
    const res = await request(app).post("/biopsies/bio-1/notify-patient").send({ method: "phone" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("bio-1");
    const aad6Insert = queryMock.mock.calls.find(([sql, values]) => (
      String(sql).includes('INSERT INTO mips_readiness_evidence') && values[4] === 'AAD6'
    ));
    expect(aad6Insert?.[1][10]).toContain('notificationMethodRecorded');
  });

  it("POST /biopsies/:id/notify-patient is idempotent after notification is recorded", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: "bio-1", patient_notified: true, patient_notified_at: "2026-02-09T00:00:00Z",
        patient_notified_method: "phone",
      }] });
    const res = await request(app).post("/biopsies/bio-1/notify-patient").send({ method: "phone" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "bio-1", patient_notified: true, idempotent: true });
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
    expect(res.text).not.toContain("Patient Name");
    expect(res.text).not.toContain("DOB");
  });

  it("blocks non-provider users from exporting the biopsy log", async () => {
    biopsyService.exportBiopsyLog.mockClear();
    const res = await request(app)
      .get("/biopsies/export/log")
      .set("X-Test-Role", "ma");

    expect(res.status).toBe(403);
    expect(biopsyService.exportBiopsyLog).not.toHaveBeenCalled();
  });
});
