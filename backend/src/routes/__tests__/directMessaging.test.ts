import request from "supertest";
import express from "express";
import { directMessagingRouter } from "../directMessaging";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
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

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/direct", directMessagingRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Direct messaging routes", () => {
  it("GET /direct/messages returns inbox list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "msg-1" }] });
    const res = await request(app).get("/direct/messages");
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("GET /direct/messages returns sent list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "msg-1" }] });
    const res = await request(app).get("/direct/messages?folder=sent");
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("GET /direct/messages handles errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/direct/messages");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch messages");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching Direct messages:", {
      error: "boom",
    });
  });

  it("GET /direct/messages masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ directAddress: "secret@hisp.example" });
    const res = await request(app).get("/direct/messages");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch messages");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching Direct messages:", {
      error: "Unknown error",
    });
  });

  it("POST /direct/send rejects invalid payload", async () => {
    const res = await request(app).post("/direct/send").send({ subject: "Hi" });
    expect(res.status).toBe(400);
  });

  it("POST /direct/send sends message", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/direct/send").send({
      toAddress: "provider@example.com",
      subject: "Consult",
      body: "Test",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("delivered");
    expect(auditMock).toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it("POST /direct/send handles failures", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.01);
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/direct/send").send({
      toAddress: "provider@example.com",
      subject: "Consult",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("failed");
    randomSpy.mockRestore();
  });

  it("GET /direct/contacts returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "contact-1" }] });
    const res = await request(app).get("/direct/contacts?search=derm&specialty=Derm&favoritesOnly=true");
    expect(res.status).toBe(200);
    expect(res.body.contacts).toHaveLength(1);
  });

  it("POST /direct/contacts returns 409 when duplicate", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "contact-1" }] });
    const res = await request(app).post("/direct/contacts").send({
      providerName: "Dr. Dermatologist",
      directAddress: "doc@example.com",
    });
    expect(res.status).toBe(409);
  });

  it("POST /direct/contacts creates contact", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "contact-1" }] });

    const res = await request(app).post("/direct/contacts").send({
      providerName: "Dr. Dermatologist",
      directAddress: "doc@example.com",
      specialty: "Derm",
    });

    expect(res.status).toBe(201);
    expect(res.body.contact.id).toBe("contact-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("PATCH /direct/messages/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/direct/messages/msg-1").send({ read: true });
    expect(res.status).toBe(404);
  });

  it("PATCH /direct/messages/:id marks read", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "msg-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/direct/messages/msg-1").send({ read: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /direct/messages/:id/attachments returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/direct/messages/msg-1/attachments");
    expect(res.status).toBe(404);
  });

  it("GET /direct/messages/:id/attachments returns attachments", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ attachments: [{ filename: "file.pdf" }] }] });
    const res = await request(app).get("/direct/messages/msg-1/attachments");
    expect(res.status).toBe(200);
    expect(res.body.attachments).toHaveLength(1);
  });

  it("GET /direct/stats returns stats", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ inboxTotal: "1" }] });
    const res = await request(app).get("/direct/stats");
    expect(res.status).toBe(200);
    expect(res.body.inboxTotal).toBe("1");
  });
});
