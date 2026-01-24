import request from "supertest";
import express from "express";
import { chronicConditionsRouter } from "../chronicConditions";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/chronic", chronicConditionsRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  auditMock.mockReset();
});

describe("Chronic conditions routes", () => {
  it("GET /chronic returns conditions", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cond-1" }] });

    const res = await request(app).get("/chronic?patientId=patient-1&status=active");

    expect(res.status).toBe(200);
    expect(res.body.conditions).toHaveLength(1);
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "patient-1", "active"]);
  });

  it("GET /chronic/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/chronic/cond-1");

    expect(res.status).toBe(404);
  });

  it("GET /chronic/:id returns condition", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cond-1" }] });

    const res = await request(app).get("/chronic/cond-1");

    expect(res.status).toBe(200);
    expect(res.body.condition.id).toBe("cond-1");
  });

  it("POST /chronic rejects invalid payload", async () => {
    const res = await request(app).post("/chronic").send({});

    expect(res.status).toBe(400);
  });

  it("POST /chronic creates condition", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cond-1" }] });

    const res = await request(app).post("/chronic").send({
      patientId: "patient-1",
      conditionType: "psoriasis",
      severity: "moderate",
    });

    expect(res.status).toBe(201);
    expect(res.body.condition.id).toBe("cond-1");
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "chronic_condition_created",
      "patient_skin_conditions",
      expect.any(String)
    );
  });

  it("PUT /chronic/:id rejects empty updates", async () => {
    const res = await request(app).put("/chronic/cond-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /chronic/:id updates condition", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cond-1" }] });

    const res = await request(app).put("/chronic/cond-1").send({
      severity: "mild",
      notes: "updated",
    });

    expect(res.status).toBe(200);
    expect(res.body.condition.id).toBe("cond-1");
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "chronic_condition_updated",
      "patient_skin_conditions",
      "cond-1"
    );
  });

  it("DELETE /chronic/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/chronic/cond-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /chronic/:id removes condition", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cond-1" }] });

    const res = await request(app).delete("/chronic/cond-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "chronic_condition_deleted",
      "patient_skin_conditions",
      "cond-1"
    );
  });

  it("GET /chronic/:conditionId/assessments returns assessments", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "assessment-1" }] });

    const res = await request(app).get("/chronic/cond-1/assessments");

    expect(res.status).toBe(200);
    expect(res.body.assessments).toHaveLength(1);
  });

  it("POST /chronic/:conditionId/assessments rejects invalid payload", async () => {
    const res = await request(app).post("/chronic/cond-1/assessments").send({});

    expect(res.status).toBe(400);
  });

  it("POST /chronic/:conditionId/assessments creates assessment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "assessment-1" }] });

    const res = await request(app).post("/chronic/cond-1/assessments").send({
      patientId: "patient-1",
      assessmentDate: "2025-01-01",
      severityScore: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.assessment.id).toBe("assessment-1");
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "condition_assessment_created",
      "condition_assessments",
      expect.any(String)
    );
  });

  it("PUT /chronic/:conditionId/assessments/:id rejects empty updates", async () => {
    const res = await request(app).put("/chronic/cond-1/assessments/a-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /chronic/:conditionId/assessments/:id updates assessment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "assessment-1" }] });

    const res = await request(app).put("/chronic/cond-1/assessments/a-1").send({
      severityScore: 4,
    });

    expect(res.status).toBe(200);
    expect(res.body.assessment.id).toBe("assessment-1");
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "condition_assessment_updated",
      "condition_assessments",
      "a-1"
    );
  });

  it("DELETE /chronic/:conditionId/assessments/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/chronic/cond-1/assessments/a-1");

    expect(res.status).toBe(404);
  });
});
