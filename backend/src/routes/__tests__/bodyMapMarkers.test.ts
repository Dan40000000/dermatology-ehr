import request from "supertest";
import express from "express";
import { bodyMapMarkersRouter } from "../bodyMapMarkers";
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
app.use("/body-map-markers", bodyMapMarkersRouter);

const queryMock = pool.query as jest.Mock;

const baseMarker = {
  patient_id: "11111111-1111-4111-8111-111111111111",
  marker_type: "lesion",
  body_region: "left arm",
};

const baseProcedureSite = {
  patient_id: "11111111-1111-4111-8111-111111111111",
  procedure_type: "biopsy_shave",
  body_region: "left arm",
  procedure_date: "2025-01-01",
};

beforeEach(() => {
  queryMock.mockReset();
  (auditLog as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Body map markers routes", () => {
  it("GET /body-map-markers returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "marker-1" }] });
    const res = await request(app).get("/body-map-markers");
    expect(res.status).toBe(200);
    expect(res.body.markers).toHaveLength(1);
  });

  it("GET /body-map-markers supports filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "marker-1" }] });
    const res = await request(app).get("/body-map-markers").query({
      patient_id: "11111111-1111-4111-8111-111111111111",
      encounter_id: "22222222-2222-4222-8222-222222222222",
      marker_type: "lesion",
      status: "active",
    });
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("and status = $"),
      expect.arrayContaining(["tenant-1", "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "lesion", "active"])
    );
  });

  it("GET /body-map-markers/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/body-map-markers/marker-1");
    expect(res.status).toBe(404);
  });

  it("GET /body-map-markers/:id returns marker", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "marker-1" }] });
    const res = await request(app).get("/body-map-markers/marker-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("marker-1");
  });

  it("POST /body-map-markers rejects invalid payload", async () => {
    const res = await request(app).post("/body-map-markers").send({});
    expect(res.status).toBe(400);
  });

  it("POST /body-map-markers returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/body-map-markers").send(baseMarker);
    expect(res.status).toBe(404);
  });

  it("POST /body-map-markers returns 404 when encounter missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/body-map-markers").send({
      ...baseMarker,
      encounter_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(res.status).toBe(404);
  });

  it("POST /body-map-markers creates marker", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/body-map-markers").send(baseMarker);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditLog).toHaveBeenCalled();
  });

  it("PUT /body-map-markers/:id rejects invalid payload", async () => {
    const res = await request(app).put("/body-map-markers/marker-1").send({ size_mm: -1 });
    expect(res.status).toBe(400);
  });

  it("PUT /body-map-markers/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/body-map-markers/marker-1").send({ description: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PUT /body-map-markers/:id rejects empty updates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "marker-1" }] });
    const res = await request(app).put("/body-map-markers/marker-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /body-map-markers/:id updates marker", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "marker-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/body-map-markers/marker-1").send({ description: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("PUT /body-map-markers/:id updates all fields", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "marker-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/body-map-markers/marker-1").send({
      marker_type: "condition",
      sub_type: "eczema",
      body_region: "right leg",
      x_position: 45,
      y_position: 22,
      description: "Updated description",
      clinical_notes: "Updated notes",
      status: "resolved",
      severity: "moderate",
      size_mm: 12,
      date_identified: "2025-01-02",
      date_resolved: "2025-01-10",
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("PUT /body-map-markers/:id handles database errors", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "marker-1" }] })
      .mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app).put("/body-map-markers/marker-1").send({ description: "Updated" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to update body map marker");
  });

  it("DELETE /body-map-markers/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/body-map-markers/marker-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /body-map-markers/:id deletes marker", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "marker-1" }] });
    const res = await request(app).delete("/body-map-markers/marker-1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("Procedure sites routes", () => {
  it("GET /body-map-markers/procedure-sites returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "site-1" }] });
    const res = await request(app).get("/body-map-markers/procedure-sites");
    expect(res.status).toBe(200);
    expect(res.body.procedure_sites).toHaveLength(1);
  });

  it("GET /body-map-markers/procedure-sites supports filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "site-1" }] });
    const res = await request(app).get("/body-map-markers/procedure-sites").query({
      patient_id: "11111111-1111-4111-8111-111111111111",
      encounter_id: "22222222-2222-4222-8222-222222222222",
      procedure_type: "laser",
      pathology_status: "pending",
    });
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("and ps.pathology_status"),
      expect.arrayContaining(["tenant-1", "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "laser", "pending"])
    );
  });

  it("GET /body-map-markers/procedure-sites/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/body-map-markers/procedure-sites/site-1");
    expect(res.status).toBe(404);
  });

  it("GET /body-map-markers/procedure-sites/:id returns site", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "site-1" }] });
    const res = await request(app).get("/body-map-markers/procedure-sites/site-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("site-1");
  });

  it("POST /body-map-markers/procedure-sites rejects invalid payload", async () => {
    const res = await request(app).post("/body-map-markers/procedure-sites").send({});
    expect(res.status).toBe(400);
  });

  it("POST /body-map-markers/procedure-sites returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/body-map-markers/procedure-sites").send(baseProcedureSite);
    expect(res.status).toBe(404);
  });

  it("POST /body-map-markers/procedure-sites returns 404 when encounter missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/body-map-markers/procedure-sites").send({
      ...baseProcedureSite,
      encounter_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(res.status).toBe(404);
  });

  it("POST /body-map-markers/procedure-sites returns 404 when marker missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "encounter-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/body-map-markers/procedure-sites").send({
      ...baseProcedureSite,
      encounter_id: "22222222-2222-4222-8222-222222222222",
      body_map_marker_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(res.status).toBe(404);
  });

  it("POST /body-map-markers/procedure-sites creates site", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/body-map-markers/procedure-sites").send(baseProcedureSite);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("PUT /body-map-markers/procedure-sites/:id rejects invalid payload", async () => {
    const res = await request(app).put("/body-map-markers/procedure-sites/site-1").send({ sutures_count: -1 });
    expect(res.status).toBe(400);
  });

  it("PUT /body-map-markers/procedure-sites/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/body-map-markers/procedure-sites/site-1").send({ procedure_notes: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PUT /body-map-markers/procedure-sites/:id rejects empty updates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "site-1" }] });
    const res = await request(app).put("/body-map-markers/procedure-sites/site-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /body-map-markers/procedure-sites/:id updates site", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "site-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/body-map-markers/procedure-sites/site-1").send({ procedure_notes: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("PUT /body-map-markers/procedure-sites/:id updates all fields", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "site-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/body-map-markers/procedure-sites/site-1").send({
      body_map_marker_id: "33333333-3333-4333-8333-333333333333",
      procedure_type: "excision",
      body_region: "left arm",
      x_position: 20,
      y_position: 40,
      procedure_date: "2025-01-03",
      performed_by: "44444444-4444-4444-8444-444444444444",
      clinical_indication: "Lesion",
      procedure_notes: "Notes",
      pathology_status: "benign",
      pathology_result: "Benign",
      pathology_date: "2025-01-04",
      sutures_count: 3,
      suture_type: "nylon",
      follow_up_needed: true,
      follow_up_date: "2025-01-10",
      follow_up_notes: "Return in 1 week",
      complications: "None",
      healing_status: "normal",
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("DELETE /body-map-markers/procedure-sites/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/body-map-markers/procedure-sites/site-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /body-map-markers/procedure-sites/:id deletes site", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "site-1" }] });
    const res = await request(app).delete("/body-map-markers/procedure-sites/site-1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
