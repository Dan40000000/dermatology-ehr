import request from "supertest";
import express from "express";
import { protocolsRouter } from "../protocols";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

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

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/protocols", protocolsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  (logger.error as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Protocols routes", () => {
  it("GET /protocols returns paginated list", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ id: "protocol-1" }] });

    const res = await request(app).get("/protocols");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("GET /protocols/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/protocols/protocol-1");
    expect(res.status).toBe(404);
  });

  it("GET /protocols/:id returns details", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "protocol-1", name: "Test" }] })
      .mockResolvedValueOnce({ rows: [{ id: "step-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "order-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "handout-1" }] });

    const res = await request(app).get("/protocols/protocol-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("protocol-1");
    expect(res.body.steps).toHaveLength(1);
    expect(res.body.order_sets).toHaveLength(1);
    expect(res.body.handouts).toHaveLength(1);
  });

  it("POST /protocols rejects invalid payload", async () => {
    const res = await request(app).post("/protocols").send({ name: "Bad" });
    expect(res.status).toBe(400);
  });

  it("POST /protocols creates protocol", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "protocol-1" }] });
    const res = await request(app).post("/protocols").send({
      name: "Protocol A",
      category: "medical",
      type: "general",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("protocol-1");
  });

  it("PUT /protocols/:id updates with defaults when empty payload", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "protocol-1" }] });
    const res = await request(app).put("/protocols/protocol-1").send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("protocol-1");
  });

  it("PUT /protocols/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/protocols/protocol-1").send({ name: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PUT /protocols/:id updates protocol", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "protocol-1" }] });
    const res = await request(app).put("/protocols/protocol-1").send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("protocol-1");
  });

  it("DELETE /protocols/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/protocols/protocol-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /protocols/:id deletes protocol", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "protocol-1" }] });
    const res = await request(app).delete("/protocols/protocol-1");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it("POST /protocols/:protocolId/steps rejects invalid payload", async () => {
    const res = await request(app).post("/protocols/protocol-1/steps").send({ step_number: 1 });
    expect(res.status).toBe(400);
  });

  it("POST /protocols/:protocolId/steps creates step", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "step-1" }] });
    const res = await request(app).post("/protocols/protocol-1/steps").send({
      step_number: 1,
      title: "Assessment",
      action_type: "assessment",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("step-1");
  });

  it("PUT /protocols/:protocolId/steps/:stepId rejects empty updates", async () => {
    const res = await request(app).put("/protocols/protocol-1/steps/step-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /protocols/:protocolId/steps/:stepId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/protocols/protocol-1/steps/step-1").send({ title: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PUT /protocols/:protocolId/steps/:stepId updates step", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "step-1" }] });
    const res = await request(app).put("/protocols/protocol-1/steps/step-1").send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("step-1");
  });

  it("DELETE /protocols/:protocolId/steps/:stepId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/protocols/protocol-1/steps/step-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /protocols/:protocolId/steps/:stepId deletes step", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "step-1" }] });
    const res = await request(app).delete("/protocols/protocol-1/steps/step-1");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it("POST /protocols/applications rejects invalid payload", async () => {
    const res = await request(app).post("/protocols/applications").send({ protocol_id: "protocol-1" });
    expect(res.status).toBe(400);
  });

  it("POST /protocols/applications applies protocol", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "step-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "app-1" }] });

    const res = await request(app).post("/protocols/applications").send({
      protocol_id: "protocol-1",
      patient_id: "patient-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("app-1");
  });

  it("GET /protocols/applications/patient/:patientId returns applications", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "app-1" }] });
    const res = await request(app).get("/protocols/applications/patient/patient-1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("POST /protocols/applications/:applicationId/complete-step advances to next step", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // insert completion
      .mockResolvedValueOnce({ rows: [{ next_step_id: "step-2" }] }) // next step
      .mockResolvedValueOnce({ rows: [] }); // update current step

    const res = await request(app)
      .post("/protocols/applications/app-1/complete-step")
      .send({ step_id: "step-1" });
    expect(res.status).toBe(200);
    expect(res.body.next_step_id).toBe("step-2");
  });

  it("POST /protocols/applications/:applicationId/complete-step marks completed", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // insert completion
      .mockResolvedValueOnce({ rows: [{ next_step_id: null }] }) // no next step
      .mockResolvedValueOnce({ rows: [] }); // mark completed

    const res = await request(app)
      .post("/protocols/applications/app-1/complete-step")
      .send({ step_id: "step-1" });
    expect(res.status).toBe(200);
    expect(res.body.next_step_id).toBeNull();
  });

  it("PATCH /protocols/applications/:applicationId rejects empty updates", async () => {
    const res = await request(app).patch("/protocols/applications/app-1").send({});
    expect(res.status).toBe(400);
  });

  it("PATCH /protocols/applications/:applicationId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/protocols/applications/app-1").send({ status: "completed" });
    expect(res.status).toBe(404);
  });

  it("PATCH /protocols/applications/:applicationId updates application", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "app-1" }] });
    const res = await request(app).patch("/protocols/applications/app-1").send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("app-1");
  });

  it("GET /protocols/stats/overview returns stats", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_protocols: "2" }] });
    const res = await request(app).get("/protocols/stats/overview");
    expect(res.status).toBe(200);
    expect(res.body.total_protocols).toBe("2");
  });
});
