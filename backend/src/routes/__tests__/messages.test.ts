import request from "supertest";
import express from "express";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: () => "msg-1",
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

const { messagesRouter } = require("../messages");

const app = express();
app.use(express.json());
app.use("/messages", messagesRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
});

describe("Messages routes", () => {
  it("GET /messages returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "msg-1" }] });
    const res = await request(app).get("/messages");
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("POST /messages rejects invalid payload", async () => {
    const res = await request(app).post("/messages").send({});
    expect(res.status).toBe(400);
  });

  it("POST /messages creates message with defaults", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/messages").send({ body: "Hello" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("msg-1");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0][1];
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
    expect(params[5]).toBe("system");
    expect(auditMock).toHaveBeenCalledWith("tenant-1", "user-1", "message_create", "message", "msg-1");
  });
});
