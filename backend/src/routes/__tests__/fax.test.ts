import request from "supertest";
import express from "express";
import { faxRouter } from "../fax";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/fax", faxRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Fax routes", () => {
  it("GET /fax/inbox returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "fax-1" }] });
    const res = await request(app).get("/fax/inbox?status=received&unreadOnly=true");
    expect(res.status).toBe(200);
    expect(res.body.faxes).toHaveLength(1);
  });

  it("GET /fax/outbox returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "fax-1" }] });
    const res = await request(app).get("/fax/outbox?status=sent");
    expect(res.status).toBe(200);
    expect(res.body.faxes).toHaveLength(1);
  });

  it("POST /fax/send rejects invalid payload", async () => {
    const res = await request(app).post("/fax/send").send({});
    expect(res.status).toBe(400);
  });

  it("POST /fax/send returns sending status", async () => {
    jest.useFakeTimers();
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    queryMock.mockResolvedValueOnce({ rows: [] });

    const requestPromise = request(app).post("/fax/send").send({
      recipientNumber: "+15555551212",
      subject: "Test Fax",
      pages: 1,
    });

    jest.runAllTimers();
    const res = await requestPromise;

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("sending");

    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it("GET /fax/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/fax/fax-1");
    expect(res.status).toBe(404);
  });

  it("GET /fax/:id returns fax", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "fax-1" }] });
    const res = await request(app).get("/fax/fax-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("fax-1");
  });

  it("GET /fax/:id/pdf returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/fax/fax-1/pdf");
    expect(res.status).toBe(404);
  });

  it("GET /fax/:id/pdf returns pdf info", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ pdfUrl: "/fax.pdf", storage: "mock" }] });
    const res = await request(app).get("/fax/fax-1/pdf");
    expect(res.status).toBe(200);
    expect(res.body.pdfUrl).toBe("/fax.pdf");
  });

  it("PATCH /fax/:id rejects invalid payload", async () => {
    const res = await request(app).patch("/fax/fax-1").send({ read: "nope" });
    expect(res.status).toBe(400);
  });

  it("PATCH /fax/:id rejects empty updates", async () => {
    const res = await request(app).patch("/fax/fax-1").send({});
    expect(res.status).toBe(400);
  });

  it("PATCH /fax/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/fax/fax-1").send({ read: true });
    expect(res.status).toBe(404);
  });

  it("PATCH /fax/:id updates fax", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "fax-1" }] });
    const res = await request(app).patch("/fax/fax-1").send({ read: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /fax/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/fax/fax-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /fax/:id deletes fax", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "fax-1" }] });
    const res = await request(app).delete("/fax/fax-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /fax/simulate-incoming creates fax", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/fax/simulate-incoming");
    expect(res.status).toBe(201);
    expect(res.body.message).toContain("Simulated");
  });

  it("GET /fax/meta/stats returns stats", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ inboundTotal: "1" }] });
    const res = await request(app).get("/fax/meta/stats");
    expect(res.status).toBe(200);
    expect(res.body.inboundTotal).toBe("1");
  });
});
