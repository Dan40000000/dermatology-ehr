import request from "supertest";
import express from "express";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: () => "resp-1",
}));

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { cannedResponsesRouter } = require("../cannedResponses");

const app = express();
app.use(express.json());
app.use("/canned-responses", cannedResponsesRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
});

describe("Canned responses routes", () => {
  it("GET /canned-responses returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "resp-1" }] });
    const res = await request(app).get("/canned-responses?category=general&activeOnly=false");
    expect(res.status).toBe(200);
    expect(res.body.cannedResponses).toHaveLength(1);
  });

  it("GET /canned-responses returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/canned-responses");
    expect(res.status).toBe(500);
  });

  it("GET /canned-responses/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/canned-responses/resp-1");
    expect(res.status).toBe(404);
  });

  it("GET /canned-responses/:id returns response", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "resp-1" }] });
    const res = await request(app).get("/canned-responses/resp-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("resp-1");
  });

  it("POST /canned-responses rejects invalid payload", async () => {
    const res = await request(app).post("/canned-responses").send({});
    expect(res.status).toBe(400);
  });

  it("POST /canned-responses creates response", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/canned-responses").send({
      title: "Follow-up",
      category: "appointment",
      responseText: "Please schedule a follow-up.",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("resp-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("PUT /canned-responses/:id rejects empty updates", async () => {
    const res = await request(app).put("/canned-responses/resp-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /canned-responses/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).put("/canned-responses/resp-1").send({ title: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PUT /canned-responses/:id updates response", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "resp-1" }], rowCount: 1 });
    const res = await request(app).put("/canned-responses/resp-1").send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("DELETE /canned-responses/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).delete("/canned-responses/resp-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /canned-responses/:id deactivates response", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "resp-1" }], rowCount: 1 });
    const res = await request(app).delete("/canned-responses/resp-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });
});
