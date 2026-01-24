import request from "supertest";
import express from "express";
import crypto from "crypto";
import { statementsRouter } from "../statements";
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
    connect: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const app = express();
app.use(express.json());
app.use("/statements", statementsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  randomUUIDMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Statement routes", () => {
  it("GET /statements returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "stmt-1" }] });

    const res = await request(app).get("/statements");

    expect(res.status).toBe(200);
    expect(res.body.statements).toHaveLength(1);
  });

  it("GET /statements/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).get("/statements/stmt-1");

    expect(res.status).toBe(404);
  });

  it("GET /statements/:id returns statement", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "stmt-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "line-1" }] });

    const res = await request(app).get("/statements/stmt-1");

    expect(res.status).toBe(200);
    expect(res.body.statement.id).toBe("stmt-1");
    expect(res.body.lineItems).toHaveLength(1);
  });

  it("POST /statements rejects invalid payload", async () => {
    const res = await request(app).post("/statements").send({});

    expect(res.status).toBe(400);
  });

  it("POST /statements creates statement", async () => {
    randomUUIDMock
      .mockReturnValueOnce("stmt-1")
      .mockReturnValueOnce("line-1");

    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/statements").send({
      patientId: "patient-1",
      statementDate: "2025-01-01",
      balanceCents: 1000,
      lineItems: [
        {
          serviceDate: "2025-01-01",
          description: "Visit",
          amountCents: 1000,
          patientResponsibilityCents: 1000,
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("stmt-1");
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("PUT /statements/:id rejects empty update", async () => {
    const res = await request(app).put("/statements/stmt-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /statements/:id updates statement", async () => {
    const res = await request(app)
      .put("/statements/stmt-1")
      .send({ status: "sent" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /statements/:id/send rejects invalid via", async () => {
    const res = await request(app)
      .post("/statements/stmt-1/send")
      .send({ via: "carrier" });

    expect(res.status).toBe(400);
  });

  it("POST /statements/:id/send updates statement", async () => {
    const res = await request(app)
      .post("/statements/stmt-1/send")
      .send({ via: "email" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /statements/:id deletes statement", async () => {
    const res = await request(app).delete("/statements/stmt-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
