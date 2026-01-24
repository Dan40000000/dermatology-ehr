import request from "supertest";
import express from "express";
import { registryRouter } from "../registry";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/moduleAccess", () => ({
  requireModuleAccess: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/registry", registryRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Registry routes", () => {
  it("GET /registry/cohorts returns cohorts", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cohort-1" }] });

    const res = await request(app).get("/registry/cohorts");

    expect(res.status).toBe(200);
    expect(res.body.cohorts).toHaveLength(1);
  });

  it("GET /registry/cohorts filters by status", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/registry/cohorts?status=active");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("rc.status = $2"),
      ["tenant-1", "active"]
    );
  });

  it("POST /registry/cohorts validates payload", async () => {
    const res = await request(app).post("/registry/cohorts").send({});

    expect(res.status).toBe(400);
  });

  it("POST /registry/cohorts creates cohort", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/registry/cohorts").send({ name: "Registry A" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditMock).toHaveBeenCalled();
  });

  it("PUT /registry/cohorts/:id rejects empty updates", async () => {
    const res = await request(app).put("/registry/cohorts/cohort-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /registry/cohorts/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app)
      .put("/registry/cohorts/cohort-1")
      .send({ name: "Updated" });

    expect(res.status).toBe(404);
  });

  it("PUT /registry/cohorts/:id updates cohort", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "cohort-1" }] });

    const res = await request(app)
      .put("/registry/cohorts/cohort-1")
      .send({ description: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("cohort-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("DELETE /registry/cohorts/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).delete("/registry/cohorts/cohort-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /registry/cohorts/:id deletes cohort and members", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "cohort-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/registry/cohorts/cohort-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("cohort-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /registry/cohorts/:id/members returns members", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "member-1" }] });

    const res = await request(app).get("/registry/cohorts/cohort-1/members");

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
  });

  it("POST /registry/cohorts/:id/members validates payload", async () => {
    const res = await request(app).post("/registry/cohorts/cohort-1/members").send({});

    expect(res.status).toBe(400);
  });

  it("POST /registry/cohorts/:id/members adds member", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "member-1" }] });

    const res = await request(app)
      .post("/registry/cohorts/cohort-1/members")
      .send({ patientId: "patient-1" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("member-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("DELETE /registry/cohorts/:id/members/:memberId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).delete("/registry/cohorts/cohort-1/members/member-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /registry/cohorts/:id/members/:memberId removes member", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "member-1" }] });

    const res = await request(app).delete("/registry/cohorts/cohort-1/members/member-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("member-1");
    expect(auditMock).toHaveBeenCalled();
  });
});
