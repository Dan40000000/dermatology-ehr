import request from "supertest";
import express from "express";
import crypto from "crypto";
import { messagingRouter } from "../messaging";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      email: "admin@example.com",
      fullName: "Admin User",
    };
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

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockSendEmail = jest.fn();
jest.mock("../../lib/container", () => ({
  getEmailService: () => ({
    sendEmail: mockSendEmail,
  }),
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
app.use("/api/messaging", messagingRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

let mockClient: any;

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  auditLogMock.mockReset();
  loggerMock.error.mockReset();
  delete process.env.MESSAGING_WEBHOOK_SECRET;
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({
    accepted: [],
    rejected: [],
    messageId: "email-message-id",
  });

  mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  connectMock.mockResolvedValue(mockClient);
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Messaging routes", () => {
  describe("GET /api/messaging/recipients", () => {
    it("should return compose recipients", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "user-2", fullName: "Ben Skin", email: "ben@example.com", role: "provider" }],
      });

      const res = await request(app).get("/api/messaging/recipients");

      expect(res.status).toBe(200);
      expect(res.body.recipients).toHaveLength(1);
      expect(res.body.recipients[0].id).toBe("user-2");
    });

    it("should handle database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/messaging/recipients");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch recipients");
      expect(loggerMock.error).toHaveBeenCalledWith("Error fetching message recipients:", {
        error: "Database error",
      });
    });
  });

  describe("GET /api/messaging/threads", () => {
    it("should return inbox threads", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [],
      });
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "thread-1",
            subject: "Test Thread",
            patientId: "patient-1",
            createdBy: "user-2",
            isArchived: false,
            unreadCount: "2",
          },
        ],
      });

      const res = await request(app).get("/api/messaging/threads").query({ filter: "inbox" });

      expect(res.status).toBe(200);
      expect(res.body.threads).toHaveLength(1);
      expect(res.body.threads[0].id).toBe("thread-1");
    });

    it("should return sent threads", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [],
      });
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "thread-1",
            subject: "Test Thread",
            createdBy: "user-1",
          },
        ],
      });

      const res = await request(app).get("/api/messaging/threads").query({ filter: "sent" });

      expect(res.status).toBe(200);
      expect(res.body.threads).toHaveLength(1);
    });

    it("should return archived threads", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [],
      });
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "thread-1",
            subject: "Test Thread",
            isArchived: true,
          },
        ],
      });

      const res = await request(app).get("/api/messaging/threads").query({ filter: "archived" });

      expect(res.status).toBe(200);
      expect(res.body.threads).toHaveLength(1);
    });

    it("should default to inbox filter", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/messaging/threads");

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalled();
    });

    it("should keep inbox threads with any non-self message (not only unread)", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/api/messaging/threads").query({ filter: "inbox" });

      const listQuery = queryMock.mock.calls.find((call: any) =>
        typeof call[0] === "string" &&
        call[0].toLowerCase().includes("select") &&
        call[0].includes("from message_threads mt")
      )?.[0] as string;

      expect(listQuery).toContain("tm_inbox_any.sender_id != $2");
      expect(listQuery).not.toContain("tm_inbox.created_at > mp.last_read_at");
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/messaging/threads");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch threads");
      expect(loggerMock.error).toHaveBeenCalledWith("Error fetching threads:", {
        error: "Database error",
      });
    });

    it("should mask non-Error failures", async () => {
      queryMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

      const res = await request(app).get("/api/messaging/threads");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch threads");
      expect(loggerMock.error).toHaveBeenCalledWith("Error fetching threads:", {
        error: "Unknown error",
      });
    });
  });

  describe("GET /api/messaging/threads/:id", () => {
    it("should return thread with messages", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "thread-1",
              subject: "Test Thread",
              patientId: "patient-1",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "msg-1",
              body: "Test message",
              sender: "user-2",
            },
          ],
        });

      const res = await request(app).get("/api/messaging/threads/thread-1");

      expect(res.status).toBe(200);
      expect(res.body.thread.id).toBe("thread-1");
      expect(res.body.messages).toHaveLength(1);
    });

    it("should return 404 when thread not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/messaging/threads/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Thread not found");
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/messaging/threads/thread-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch thread");
    });
  });

  describe("POST /api/messaging/threads", () => {
    const validPayload = {
      subject: "Test Subject",
      patientId: "patient-1",
      participantIds: ["user-2"],
      message: "Test message",
    };

    it("should create new thread", async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (typeof query === "string" && query.includes("from users") && query.includes("id = any")) {
          return Promise.resolve({ rows: [{ id: "user-2" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).post("/api/messaging/threads").send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("test-uuid");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "thread_create", "message_thread", "test-uuid");
    });

    it("should add creator as participant", async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (typeof query === "string" && query.includes("from users") && query.includes("id = any")) {
          return Promise.resolve({ rows: [{ id: "user-2" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).post("/api/messaging/threads").send(validPayload);

      expect(res.status).toBe(201);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("insert into message_participants"),
        expect.arrayContaining(["test-uuid", "user-1"])
      );
    });

    it("should not duplicate creator in participants", async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (typeof query === "string" && query.includes("from users") && query.includes("id = any")) {
          return Promise.resolve({ rows: [{ id: "user-2" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post("/api/messaging/threads")
        .send({ ...validPayload, participantIds: ["user-1", "user-2"] });

      expect(res.status).toBe(201);
      // Should only insert creator once as participant
      const participantCalls = mockClient.query.mock.calls.filter((call: any) =>
        call[0]?.includes("insert into message_participants")
      );
      expect(participantCalls).toHaveLength(2); // Creator + user-2
    });

    it("should reject invalid participant ids", async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (typeof query === "string" && query.includes("from users") && query.includes("id = any")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).post("/api/messaging/threads").send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("One or more internal recipients are invalid");
      expect(res.body.invalidParticipantIds).toEqual(["user-2"]);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("should validate required fields", async () => {
      const res = await request(app).post("/api/messaging/threads").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("should validate subject is not empty", async () => {
      const res = await request(app)
        .post("/api/messaging/threads")
        .send({ ...validPayload, subject: "" });

      expect(res.status).toBe(400);
    });

    it("should require at least one recipient across internal or external", async () => {
      const res = await request(app)
        .post("/api/messaging/threads")
        .send({ ...validPayload, participantIds: [] });

      expect(res.status).toBe(400);
    });

    it("should allow external recipients without internal participants", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      mockSendEmail.mockResolvedValueOnce({
        accepted: ["outside@gmail.com"],
        rejected: [],
        messageId: "email-message-id",
      });

      const res = await request(app)
        .post("/api/messaging/threads")
        .send({ ...validPayload, participantIds: [], externalEmails: ["outside@gmail.com"] });

      expect(res.status).toBe(201);
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: ["outside@gmail.com"],
        subject: "Test Subject",
        text: expect.stringContaining("Test message"),
        from: "Admin User <admin@example.com>",
      });
      expect(mockSendEmail.mock.calls[0][0].text).toContain("IntraMail Thread ID: test-uuid");
      expect(res.body.externalEmail).toMatchObject({
        requested: ["outside@gmail.com"],
        accepted: ["outside@gmail.com"],
        rejected: [],
      });
    });

    it("should reject invalid external email addresses", async () => {
      const res = await request(app)
        .post("/api/messaging/threads")
        .send({ ...validPayload, participantIds: [], externalEmails: ["not-an-email"] });

      expect(res.status).toBe(400);
    });

    it("should validate message is not empty", async () => {
      const res = await request(app)
        .post("/api/messaging/threads")
        .send({ ...validPayload, message: "" });

      expect(res.status).toBe(400);
    });

    it("should handle database error", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).post("/api/messaging/threads").send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to create thread");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("should allow optional patientId", async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (typeof query === "string" && query.includes("from users") && query.includes("id = any")) {
          return Promise.resolve({ rows: [{ id: "user-2" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post("/api/messaging/threads")
        .send({ ...validPayload, patientId: undefined });

      expect(res.status).toBe(201);
    });
  });

  describe("POST /api/messaging/threads/:id/messages", () => {
    const validPayload = {
      body: "Test message",
    };

    it("should send message in thread", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "participant-1" }] }) // participant check
        .mockResolvedValueOnce({ rows: [] }) // insert message
        .mockResolvedValueOnce({ rows: [] }) // update thread timestamp
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post("/api/messaging/threads/thread-1/messages")
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("test-uuid");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "message_send", "message", "test-uuid");
    });

    it("should return 403 when user is not a participant", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // participant check - empty means not a participant
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const res = await request(app)
        .post("/api/messaging/threads/thread-1/messages")
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Not a participant of this thread");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("should update thread timestamp", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "participant-1" }] }) // participant check
        .mockResolvedValueOnce({ rows: [] }) // insert message
        .mockResolvedValueOnce({ rows: [] }) // update thread timestamp
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post("/api/messaging/threads/thread-1/messages")
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("update message_threads set updated_at = now()"),
        ["thread-1"]
      );
    });

    it("should validate body is not empty", async () => {
      const res = await request(app)
        .post("/api/messaging/threads/thread-1/messages")
        .send({ body: "" });

      expect(res.status).toBe(400);
    });

    it("should validate required fields", async () => {
      const res = await request(app).post("/api/messaging/threads/thread-1/messages").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("should handle database error", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("Database error")) // participant check fails
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const res = await request(app)
        .post("/api/messaging/threads/thread-1/messages")
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to send message");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("PUT /api/messaging/threads/:id/read", () => {
    it("should mark thread as read", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/api/messaging/threads/thread-1/read");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("update message_participants"),
        ["thread-1", "user-1"]
      );
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).put("/api/messaging/threads/thread-1/read");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to mark thread as read");
    });
  });

  describe("PUT /api/messaging/threads/:id/archive", () => {
    it("should archive thread", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/api/messaging/threads/thread-1/archive").send({ archive: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("update message_participants"),
        ["thread-1", "user-1", true]
      );
    });

    it("should unarchive thread", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/api/messaging/threads/thread-1/archive").send({ archive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("update message_participants"),
        ["thread-1", "user-1", false]
      );
    });

    it("should default to archive when no body provided", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/api/messaging/threads/thread-1/archive").send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).put("/api/messaging/threads/thread-1/archive").send({ archive: true });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to archive thread");
    });
  });

  describe("GET /api/messaging/unread-count", () => {
    it("should return unread count", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: "5" }] });

      const res = await request(app).get("/api/messaging/unread-count");

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });

    it("should handle zero unread messages", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] });

      const res = await request(app).get("/api/messaging/unread-count");

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/messaging/unread-count");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch unread count");
    });
  });

  describe("POST /api/messaging/webhook/email", () => {
    it("should reject inbound webhook when secret is configured and missing", async () => {
      process.env.MESSAGING_WEBHOOK_SECRET = "secret-123";

      const res = await request(app).post("/api/messaging/webhook/email").send({
        from: "outside@gmail.com",
        to: "inbox+thread-thread-1@example.com",
        text: "Thanks for the update.",
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Invalid webhook credentials");
    });

    it("should map inbound email to thread using reply-to alias", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "thread-1", tenantId: "tenant-1" }] }) // thread lookup
        .mockResolvedValueOnce({ rows: [{ id: "user-2" }] }) // sender user lookup
        .mockResolvedValueOnce({ rows: [] }) // insert message
        .mockResolvedValueOnce({ rows: [] }) // update timestamp
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app).post("/api/messaging/webhook/email").send({
        from: "outside@gmail.com",
        to: "inbox+thread-thread-1@example.com",
        text: "Thanks for the update.",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.threadId).toBe("thread-1");
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("insert into thread_messages"),
        expect.arrayContaining(["tenant-1", "thread-1", "Thanks for the update.", "user-2"])
      );
    });

    it("should ignore webhook payloads without a mappable thread", async () => {
      const res = await request(app).post("/api/messaging/webhook/email").send({
        from: "outside@gmail.com",
        to: "support@example.com",
        text: "No thread id in this one",
      });

      expect(res.status).toBe(200);
      expect(res.body.ignored).toBe(true);
    });

    it("should ignore unknown thread ids safely", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // thread lookup miss
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const res = await request(app).post("/api/messaging/webhook/email").send({
        from: "outside@gmail.com",
        to: "inbox+thread-thread-missing@example.com",
        text: "Checking in",
      });

      expect(res.status).toBe(200);
      expect(res.body.ignored).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });
});
