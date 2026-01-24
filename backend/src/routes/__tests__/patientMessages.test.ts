import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { patientMessagesRouter } from "../patientMessages";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", name: "Staff User" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

const tenantId = "tenant-1";
const token = jwt.sign(
  {
    id: "user-1",
    tenantId,
    role: "admin",
    email: "staff@example.com",
    fullName: "Staff User",
  },
  process.env.JWT_SECRET || "test-secret"
);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.headers.authorization = req.headers.authorization || `Bearer ${token}`;
  req.headers["x-tenant-id"] = req.headers["x-tenant-id"] || tenantId;
  next();
});
app.use("/patient-messages", patientMessagesRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

const uuid = "11111111-1111-1111-8111-111111111111";
const uploadDir = path.join(process.cwd(), "uploads", "message-attachments");

const listUploads = () => (fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : []);
const cleanupUploads = (files: string[]) => {
  files.forEach((file) => {
    const filePath = path.join(uploadDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
};

beforeAll(() => {
  fs.mkdirSync(uploadDir, { recursive: true });
});

const buildClient = () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  return { query, release: jest.fn() };
};

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Patient message routes", () => {
  it("GET /patient-messages/threads returns threads", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "thread-1" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    const res = await request(app).get("/patient-messages/threads");

    expect(res.status).toBe(200);
    expect(res.body.threads).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("GET /patient-messages/threads applies filters", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "thread-1" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    const res = await request(app).get("/patient-messages/threads").query({
      category: "billing",
      status: "open",
      assignedTo: "provider-1",
      priority: "urgent",
      unreadOnly: "true",
      search: "Doe",
      limit: "10",
      offset: "20",
    });

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("t.category"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("t.status"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("t.assigned_to"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("t.priority"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("t.is_read_by_staff = false"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("t.subject ILIKE"));
  });

  it("GET /patient-messages/threads returns 500 on database error", async () => {
    queryMock.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(app).get("/patient-messages/threads");

    expect(res.status).toBe(500);
  });

  it("GET /patient-messages/threads/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/patient-messages/threads/${uuid}`);

    expect(res.status).toBe(404);
  });

  it("GET /patient-messages/threads/:id returns thread and messages", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid, subject: "Hello" }] })
      .mockResolvedValueOnce({ rows: [{ id: "msg-1" }] });

    const res = await request(app).get(`/patient-messages/threads/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.thread.id).toBe(uuid);
    expect(res.body.messages).toHaveLength(1);
  });

  it("POST /patient-messages/threads validates body", async () => {
    const res = await request(app).post("/patient-messages/threads").send({});

    expect(res.status).toBe(400);
  });

  it("POST /patient-messages/threads returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patient-messages/threads").send({
      patientId: uuid,
      subject: "Test",
      category: "general",
      messageText: "Hello",
    });

    expect(res.status).toBe(404);
  });

  it("POST /patient-messages/threads creates thread", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: uuid }] });
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patient-messages/threads").send({
      patientId: uuid,
      subject: "Test",
      category: "general",
      messageText: "Hello",
    });

    expect(res.status).toBe(201);
    expect(res.body.threadId).toBeDefined();
    expect(res.body.messageId).toBeDefined();
  });

  it("PUT /patient-messages/threads/:id rejects empty updates", async () => {
    const res = await request(app).put(`/patient-messages/threads/${uuid}`).send({});

    expect(res.status).toBe(400);
  });

  it("PUT /patient-messages/threads/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app)
      .put(`/patient-messages/threads/${uuid}`)
      .send({ status: "closed" });

    expect(res.status).toBe(404);
  });

  it("PUT /patient-messages/threads/:id updates thread", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app)
      .put(`/patient-messages/threads/${uuid}`)
      .send({ status: "closed" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /patient-messages/threads/:id/messages validates body", async () => {
    const res = await request(app).post(`/patient-messages/threads/${uuid}/messages`).send({});

    expect(res.status).toBe(400);
  });

  it("POST /patient-messages/threads/:id/messages returns 404 when missing thread", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/patient-messages/threads/${uuid}/messages`).send({
      messageText: "Hi",
    });

    expect(res.status).toBe(404);
  });

  it("POST /patient-messages/threads/:id/messages sends message", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: uuid }] });
    const client = buildClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/patient-messages/threads/${uuid}/messages`).send({
      messageText: "Hi",
      isInternalNote: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.messageId).toBeDefined();
  });

  it("POST /patient-messages/threads/:id/close returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app).post(`/patient-messages/threads/${uuid}/close`);

    expect(res.status).toBe(404);
  });

  it("POST /patient-messages/threads/:id/close closes thread", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).post(`/patient-messages/threads/${uuid}/close`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /patient-messages/threads/:id/reopen reopens thread", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).post(`/patient-messages/threads/${uuid}/reopen`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /patient-messages/threads/:id/mark-read returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app).post(`/patient-messages/threads/${uuid}/mark-read`);

    expect(res.status).toBe(404);
  });

  it("POST /patient-messages/threads/:id/mark-read marks thread", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).post(`/patient-messages/threads/${uuid}/mark-read`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /patient-messages/unread-count returns count", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: "2" }] });

    const res = await request(app).get("/patient-messages/unread-count");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("POST /patient-messages/attachments rejects missing file", async () => {
    const res = await request(app).post("/patient-messages/attachments").field("messageId", uuid);

    expect(res.status).toBe(400);
  });

  it("GET /patient-messages/attachments/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/patient-messages/attachments/${uuid}`);

    expect(res.status).toBe(404);
  });

  it("POST /patient-messages/attachments rejects missing messageId and cleans file", async () => {
    const beforeFiles = listUploads();

    const res = await request(app)
      .post("/patient-messages/attachments")
      .attach("file", Buffer.from("test"), "note.pdf");

    const afterFiles = listUploads();

    expect(res.status).toBe(400);
    expect(afterFiles).toEqual(beforeFiles);
  });

  it("POST /patient-messages/attachments returns 404 when message missing", async () => {
    const beforeFiles = listUploads();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-messages/attachments")
      .field("messageId", uuid)
      .attach("file", Buffer.from("test"), "note.pdf");

    const afterFiles = listUploads();

    expect(res.status).toBe(404);
    expect(afterFiles).toEqual(beforeFiles);
  });

  it("POST /patient-messages/attachments uploads file", async () => {
    const beforeFiles = listUploads();
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-messages/attachments")
      .field("messageId", uuid)
      .attach("file", Buffer.from("test"), "note.pdf");

    const afterFiles = listUploads();
    const newFiles = afterFiles.filter((file) => !beforeFiles.includes(file));

    expect(res.status).toBe(201);
    expect(res.body.filename).toBe("note.pdf");
    expect(newFiles).toHaveLength(1);

    cleanupUploads(newFiles);
  });

  it("POST /patient-messages/attachments rejects invalid file type", async () => {
    const res = await request(app)
      .post("/patient-messages/attachments")
      .field("messageId", uuid)
      .attach("file", Buffer.from("test"), {
        filename: "note.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(500);
  });

  it("GET /patient-messages/attachments/:id downloads attachment", async () => {
    const filePath = path.join(uploadDir, "download-note.pdf");
    fs.writeFileSync(filePath, "content");
    queryMock.mockResolvedValueOnce({
      rows: [{ file_path: filePath, original_filename: "download-note.pdf" }],
    });

    const res = await request(app).get(`/patient-messages/attachments/${uuid}`);

    expect(res.status).toBe(200);
    expect(auditLogMock).toHaveBeenCalled();

    fs.unlinkSync(filePath);
  });
});
