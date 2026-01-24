import request from "supertest";
import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { patientPortalMessagesRouter } from "../patientPortalMessages";
import { pool } from "../../db/pool";

// Mock environment
jest.mock("../../config/env", () => ({
  env: {
    jwtSecret: "test-secret",
    tenantHeader: "x-tenant-id",
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    randomUUID: jest.fn(() => "test-uuid"),
  };
});

const app = express();
app.use(express.json());
app.use("/api/patient-portal/messages", patientPortalMessagesRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const tenantId = "tenant-1";
const patientId = "patient-1";
const patientEmail = "patient@example.com";

// Create patient token
const patientToken = jwt.sign(
  {
    id: "portal-user-1",
    patientId,
    tenantId,
    email: patientEmail,
  },
  "test-secret"
);

const uploadDir = path.join(process.cwd(), "uploads", "message-attachments");

let mockClient: any;

beforeAll(() => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

  mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  connectMock.mockResolvedValue(mockClient);
});

const listUploads = () => (fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : []);
const cleanupUploads = (files: string[]) => {
  files.forEach((file) => {
    const filePath = path.join(uploadDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
};

describe("Patient Portal Messages routes", () => {
  describe("Authentication", () => {
    it("should return 401 when no token provided", async () => {
      const res = await request(app).get("/api/patient-portal/messages/threads");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Missing token");
    });

    it("should return 401 when invalid token", async () => {
      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .set("Authorization", "Bearer invalid-token");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid token");
    });

    it("should return 403 when staff token used", async () => {
      const staffToken = jwt.sign(
        {
          id: "staff-1",
          tenantId,
          email: "staff@example.com",
          // No patientId
        },
        "test-secret"
      );

      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Invalid patient token");
    });

    it("should return 403 when tenant mismatch", async () => {
      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", "wrong-tenant");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Invalid tenant");
    });

    it("should return 403 when tenant header missing", async () => {
      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Invalid tenant");
    });
  });

  describe("GET /api/patient-portal/messages/threads", () => {
    it("should return patient's threads", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "thread-1",
              subject: "Test Thread",
              category: "general",
              status: "open",
              messageCount: "3",
              unreadCount: "1",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: "1" }],
        });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(res.body.threads).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it("should filter by category", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .query({ category: "medical" })
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("category"), expect.arrayContaining(["medical"]));
    });

    it("should filter by status", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .query({ status: "closed" })
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("status"), expect.arrayContaining(["closed"]));
    });

    it("should handle limit and offset", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "100" }] });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .query({ limit: "10", offset: "20" })
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.offset).toBe(20);
      expect(res.body.pagination.hasMore).toBe(true);
    });

    it("should default limit to 50", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(50);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .get("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch message threads");
    });
  });

  describe("GET /api/patient-portal/messages/threads/:id", () => {
    it("should return thread with messages", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "thread-1",
              subject: "Test Thread",
              category: "general",
              status: "open",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "msg-1",
              senderType: "patient",
              messageText: "Test message",
              attachments: [],
            },
          ],
        });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads/thread-1")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(res.body.thread.id).toBe("thread-1");
      expect(res.body.messages).toHaveLength(1);
    });

    it("should return 404 when thread not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads/nonexistent")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Thread not found");
    });

    it("should only return non-internal messages", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "thread-1" }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/patient-portal/messages/threads/thread-1")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(queryMock.mock.calls[1][0]).toContain("is_internal_note = false");
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .get("/api/patient-portal/messages/threads/thread-1")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch thread");
    });
  });

  describe("POST /api/patient-portal/messages/threads", () => {
    const validPayload = {
      subject: "Test Subject",
      category: "general",
      messageText: "Test message",
    };

    it("should create new thread", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ first_name: "John", last_name: "Doe" }],
      });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT thread
        .mockResolvedValueOnce({ rows: [] }) // INSERT message
        .mockResolvedValueOnce({ rows: [] }) // SELECT auto-reply
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.threadId).toBe("test-uuid");
      expect(res.body.messageId).toBe("test-uuid");
    });

    it("should return 404 when patient not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Patient not found");
    });

    it("should validate required fields", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("should validate subject not empty", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({ ...validPayload, subject: "" });

      expect(res.status).toBe(400);
    });

    it("should validate subject max length", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({ ...validPayload, subject: "a".repeat(501) });

      expect(res.status).toBe(400);
    });

    it("should validate category enum", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({ ...validPayload, category: "invalid" });

      expect(res.status).toBe(400);
    });

    it("should validate messageText not empty", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({ ...validPayload, messageText: "" });

      expect(res.status).toBe(400);
    });

    it("should auto-assign priority based on category", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ first_name: "John", last_name: "Doe" }],
      });
      mockClient.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({ ...validPayload, category: "medical" });

      expect(res.status).toBe(201);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO patient_message_threads"),
        expect.arrayContaining(["urgent"])
      );
    });

    it("should send auto-reply when available", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ first_name: "John", last_name: "Doe" }],
      });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT thread
        .mockResolvedValueOnce({ rows: [] }) // INSERT message
        .mockResolvedValueOnce({ rows: [{ auto_reply_text: "Thanks for your message!" }] }) // auto-reply
        .mockResolvedValueOnce({ rows: [] }) // INSERT auto-reply message
        .mockResolvedValueOnce({ rows: [] }) // UPDATE thread
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO patient_messages"),
        expect.arrayContaining(["Thanks for your message!"])
      );
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to create thread");
    });

    it("should rollback on error", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ first_name: "John", last_name: "Doe" }],
      });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/api/patient-portal/messages/threads")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("POST /api/patient-portal/messages/threads/:id/messages", () => {
    const validPayload = {
      messageText: "Test message",
    };

    it("should send message in thread", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "thread-1", status: "open" }] })
        .mockResolvedValueOnce({ rows: [{ first_name: "John", last_name: "Doe" }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT message
        .mockResolvedValueOnce({ rows: [] }) // UPDATE thread
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.messageId).toBe("test-uuid");
    });

    it("should return 404 when thread not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/nonexistent/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Thread not found");
    });

    it("should return 400 when thread is closed", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "thread-1", status: "closed" }] });

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cannot send message to closed thread");
    });

    it("should validate messageText not empty", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({ messageText: "" });

      expect(res.status).toBe(400);
    });

    it("should validate messageText max length", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send({ messageText: "a".repeat(5001) });

      expect(res.status).toBe(400);
    });

    it("should update thread status from waiting-patient to in-progress", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "thread-1", status: "waiting-patient" }] })
        .mockResolvedValueOnce({ rows: [{ first_name: "John", last_name: "Doe" }] });
      mockClient.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("status = CASE WHEN status = 'waiting-patient' THEN 'in-progress'"),
        ["thread-1"]
      );
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to send message");
    });

    it("should rollback on error", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "thread-1", status: "open" }] })
        .mockResolvedValueOnce({ rows: [{ first_name: "John", last_name: "Doe" }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/messages")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("POST /api/patient-portal/messages/threads/:id/mark-read", () => {
    it("should mark thread as read", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/mark-read")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    });

    it("should mark all staff messages as read", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/mark-read")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE patient_messages"),
        ["thread-1"]
      );
    });

    it("should handle database error", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/mark-read")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to mark thread as read");
    });

    it("should rollback on error", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/api/patient-portal/messages/threads/thread-1/mark-read")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("GET /api/patient-portal/messages/unread-count", () => {
    it("should return unread count", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: "5" }] });

      const res = await request(app)
        .get("/api/patient-portal/messages/unread-count")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });

    it("should handle zero unread messages", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] });

      const res = await request(app)
        .get("/api/patient-portal/messages/unread-count")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .get("/api/patient-portal/messages/unread-count")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch unread count");
    });
  });

  describe("POST /api/patient-portal/messages/attachments", () => {
    it("should return 400 when no file uploaded", async () => {
      const res = await request(app)
        .post("/api/patient-portal/messages/attachments")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .field("messageId", "msg-1");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No file uploaded");
    });

    it("should return 400 when messageId missing", async () => {
      const beforeFiles = listUploads();

      const res = await request(app)
        .post("/api/patient-portal/messages/attachments")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .attach("file", Buffer.from("test content"), "test.pdf");

      const afterFiles = listUploads();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Message ID required");
      expect(afterFiles).toEqual(beforeFiles);
    });

    it("should return 404 when message not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const beforeFiles = listUploads();

      const res = await request(app)
        .post("/api/patient-portal/messages/attachments")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .field("messageId", "msg-1")
        .attach("file", Buffer.from("test content"), "test.pdf");

      const afterFiles = listUploads();

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Message not found");
      expect(afterFiles).toEqual(beforeFiles);
    });

    it("should upload attachment", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "msg-1" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const beforeFiles = listUploads();

      const res = await request(app)
        .post("/api/patient-portal/messages/attachments")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .field("messageId", "msg-1")
        .attach("file", Buffer.from("test content"), "test.pdf");

      const afterFiles = listUploads();
      const newFiles = afterFiles.filter((file) => !beforeFiles.includes(file));

      expect(res.status).toBe(201);
      expect(res.body.attachmentId).toBe("test-uuid");
      expect(res.body.filename).toBe("test.pdf");
      expect(newFiles.length).toBeGreaterThan(0);

      cleanupUploads(newFiles);
    });

    it("should update message attachment count", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "msg-1" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/patient-portal/messages/attachments")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .field("messageId", "msg-1")
        .attach("file", Buffer.from("test content"), "test.pdf");

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE patient_messages"),
        ["msg-1"]
      );

      const uploadedFiles = listUploads().filter((file) => file.includes("test-uuid"));
      cleanupUploads(uploadedFiles);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));
      const beforeFiles = listUploads();

      const res = await request(app)
        .post("/api/patient-portal/messages/attachments")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId)
        .field("messageId", "msg-1")
        .attach("file", Buffer.from("test content"), "test.pdf");

      const afterFiles = listUploads();

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to upload attachment");
      expect(afterFiles).toEqual(beforeFiles);
    });
  });

  describe("GET /api/patient-portal/messages/attachments/:id", () => {
    it("should return 404 when attachment not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/patient-portal/messages/attachments/attach-1")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Attachment not found");
    });

    it("should download attachment", async () => {
      const testFilePath = path.join(uploadDir, "download-test.pdf");
      fs.writeFileSync(testFilePath, "test content");

      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "attach-1",
            file_path: testFilePath,
            original_filename: "download-test.pdf",
          },
        ],
      });

      const res = await request(app)
        .get("/api/patient-portal/messages/attachments/attach-1")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(200);

      fs.unlinkSync(testFilePath);
    });

    it("should verify patient access to attachment", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/patient-portal/messages/attachments/attach-1")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(404);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("t.patient_id = $2"),
        expect.arrayContaining(["attach-1", patientId, tenantId])
      );
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .get("/api/patient-portal/messages/attachments/attach-1")
        .set("Authorization", `Bearer ${patientToken}`)
        .set("x-tenant-id", tenantId);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to download attachment");
    });
  });
});
