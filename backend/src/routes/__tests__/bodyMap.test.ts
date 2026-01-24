import request from "supertest";
import express from "express";
import crypto from "crypto";
import { bodyMapRouter } from "../bodyMap";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

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

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const app = express();
app.use(express.json());
app.use("/body-map", bodyMapRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Body map routes", () => {
  it("GET /body-map/patients/:id/lesions returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/body-map/patients/patient-1/lesions");

    expect(res.status).toBe(404);
  });

  it("GET /body-map/patients/:id/lesions returns lesions", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] });

    const res = await request(app).get("/body-map/patients/patient-1/lesions");

    expect(res.status).toBe(200);
    expect(res.body.lesions).toHaveLength(1);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("POST /body-map/patients/:id/lesions rejects invalid payload", async () => {
    const res = await request(app)
      .post("/body-map/patients/patient-1/lesions")
      .send({});

    expect(res.status).toBe(400);
  });

  it("POST /body-map/patients/:id/lesions returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/body-map/patients/patient-1/lesions")
      .send({
        patient_id: "11111111-1111-4111-8111-111111111111",
        anatomical_location: "Arm",
        x_coordinate: 10,
        y_coordinate: 20,
        body_view: "front",
        status: "monitoring",
      });

    expect(res.status).toBe(404);
  });

  it("POST /body-map/patients/:id/lesions creates lesion", async () => {
    randomUUIDMock.mockReturnValueOnce("lesion-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/body-map/patients/patient-1/lesions")
      .send({
        patient_id: "11111111-1111-4111-8111-111111111111",
        anatomical_location: "Arm",
        x_coordinate: 10,
        y_coordinate: 20,
        body_view: "front",
        status: "monitoring",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("lesion-1");
  });

  it("PUT /body-map/patients/:id/lesions/:lesionId returns 400 on empty update", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] });

    const res = await request(app)
      .put("/body-map/patients/patient-1/lesions/lesion-1")
      .send({});

    expect(res.status).toBe(400);
  });

  it("PUT /body-map/patients/:id/lesions/:lesionId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/body-map/patients/patient-1/lesions/lesion-1")
      .send({ color: "brown" });

    expect(res.status).toBe(404);
  });

  it("PUT /body-map/patients/:id/lesions/:lesionId updates lesion", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/body-map/patients/patient-1/lesions/lesion-1")
      .send({ color: "brown" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("DELETE /body-map/patients/:id/lesions/:lesionId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/body-map/patients/patient-1/lesions/lesion-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /body-map/patients/:id/lesions/:lesionId deletes lesion", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] });

    const res = await request(app).delete("/body-map/patients/patient-1/lesions/lesion-1");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /body-map/patients/:id/lesions/:lesionId/history returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(
      "/body-map/patients/patient-1/lesions/lesion-1/history"
    );

    expect(res.status).toBe(404);
  });

  it("GET /body-map/patients/:id/lesions/:lesionId/history returns observations", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "obs-1" }] });

    const res = await request(app).get(
      "/body-map/patients/patient-1/lesions/lesion-1/history"
    );

    expect(res.status).toBe(200);
    expect(res.body.observations).toHaveLength(1);
  });

  it("POST /body-map/patients/:id/lesions/:lesionId/observations rejects invalid payload", async () => {
    const res = await request(app)
      .post("/body-map/patients/patient-1/lesions/lesion-1/observations")
      .send({});

    expect(res.status).toBe(400);
  });

  it("POST /body-map/patients/:id/lesions/:lesionId/observations returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/body-map/patients/patient-1/lesions/lesion-1/observations")
      .send({ observed_date: "2025-01-01" });

    expect(res.status).toBe(404);
  });

  it("POST /body-map/patients/:id/lesions/:lesionId/observations creates observation", async () => {
    randomUUIDMock.mockReturnValueOnce("obs-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/body-map/patients/patient-1/lesions/lesion-1/observations")
      .send({ observed_date: "2025-01-01" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("obs-1");
  });
});
