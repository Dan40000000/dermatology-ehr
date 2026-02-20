import request from "supertest";
import express from "express";
import crypto from "crypto";
import { taskTemplatesRouter } from "../taskTemplates";
import { pool } from "../../db/pool";
import { auditLog, createAuditLog } from "../../services/audit";
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
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
  createAuditLog: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const app = express();
app.use(express.json());
app.use("/task-templates", taskTemplatesRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const createAuditLogMock = createAuditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  auditLogMock.mockReset();
  createAuditLogMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Task template routes", () => {
  it("GET /task-templates returns templates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tpl-1" }] });

    const res = await request(app).get("/task-templates");

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it("GET /task-templates logs sanitized Error failures", async () => {
    queryMock.mockRejectedValueOnce(new Error("template list failed"));

    const res = await request(app).get("/task-templates");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch task templates");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching task templates:", {
      error: "template list failed",
    });
  });

  it("GET /task-templates masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ templateName: "Sensitive Template" });

    const res = await request(app).get("/task-templates");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch task templates");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching task templates:", {
      error: "Unknown error",
    });
  });

  it("POST /task-templates rejects invalid payload", async () => {
    const res = await request(app).post("/task-templates").send({});

    expect(res.status).toBe(400);
  });

  it("POST /task-templates rejects duplicate name", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).post("/task-templates").send({
      name: "Follow-up",
      title: "Follow-up",
    });

    expect(res.status).toBe(400);
  });

  it("POST /task-templates creates template", async () => {
    randomUUIDMock.mockReturnValueOnce("tpl-1");
    queryMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/task-templates").send({
      name: "Follow-up",
      title: "Follow-up",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("tpl-1");
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("PUT /task-templates/:id rejects empty update", async () => {
    const res = await request(app).put("/task-templates/tpl-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /task-templates/:id rejects name conflict", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app)
      .put("/task-templates/tpl-1")
      .send({ name: "Existing" });

    expect(res.status).toBe(400);
  });

  it("PUT /task-templates/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app)
      .put("/task-templates/tpl-1")
      .send({ title: "Updated" });

    expect(res.status).toBe(404);
  });

  it("PUT /task-templates/:id updates template", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app)
      .put("/task-templates/tpl-1")
      .send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("DELETE /task-templates/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app).delete("/task-templates/tpl-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /task-templates/:id deletes template", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).delete("/task-templates/tpl-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /task-templates/:id/create-task returns 404 when template missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).post("/task-templates/tpl-1/create-task").send({});

    expect(res.status).toBe(404);
  });

  it("POST /task-templates/:id/create-task creates task", async () => {
    randomUUIDMock.mockReturnValueOnce("task-1");
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "tpl-1",
        title: "Follow-up",
        description: "Call patient",
        category: "followup",
        priority: "normal",
        default_assignee: "user-2",
        name: "Follow-up",
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/task-templates/tpl-1/create-task")
      .send({ patientId: "patient-1" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("task-1");
    expect(createAuditLogMock).toHaveBeenCalled();
  });
});
