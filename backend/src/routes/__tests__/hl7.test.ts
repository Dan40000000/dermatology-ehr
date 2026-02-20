import request from "supertest";
import express from "express";
import { hl7Router } from "../hl7";
import * as hl7Parser from "../../services/hl7Parser";
import * as hl7Processor from "../../services/hl7Processor";
import * as hl7Queue from "../../services/hl7Queue";
import * as audit from "../../services/audit";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    // Only set user if not already set (allows tests to override)
    if (!req.user) {
      req.user = { id: "user-1", tenantId: "tenant-1" };
    }
    return next();
  },
  AuthedRequest: {},
}));

jest.mock("../../services/hl7Parser");
jest.mock("../../services/hl7Processor");
jest.mock("../../services/hl7Queue");
jest.mock("../../services/audit");
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
}));

const app = express();
app.use(express.json());
app.use(express.text());
app.use("/api/hl7", hl7Router);

const parseHL7Mock = hl7Parser.parseHL7Message as jest.Mock;
const validateHL7Mock = hl7Parser.validateHL7Message as jest.Mock;
const generateACKMock = hl7Parser.generateACK as jest.Mock;
const processHL7Mock = hl7Processor.processHL7Message as jest.Mock;
const enqueueHL7Mock = hl7Queue.enqueueHL7Message as jest.Mock;
const getQueuedMessagesMock = hl7Queue.getQueuedMessages as jest.Mock;
const getMessageByIdMock = hl7Queue.getMessageById as jest.Mock;
const retryFailedMessageMock = hl7Queue.retryFailedMessage as jest.Mock;
const getQueueStatisticsMock = hl7Queue.getQueueStatistics as jest.Mock;
const createAuditLogMock = audit.createAuditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const sampleHL7 = "MSH|^~\\&|SENDER|SENDER_FACILITY|DERMAPP|DERM|20240101120000||ADT^A01|MSG001|P|2.5";

const mockParsedHL7 = {
  messageType: "ADT^A01",
  messageControlId: "MSG001",
  sendingApplication: "SENDER",
  sendingFacility: "SENDER_FACILITY",
  segments: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  createAuditLogMock.mockResolvedValue(undefined);
  loggerMock.error.mockReset();
});

describe("HL7 Routes", () => {
  describe("POST /api/hl7/inbound", () => {
    it("should accept HL7 message as string body", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-123");
      generateACKMock.mockReturnValue("ACK message");

      const res = await request(app)
        .post("/api/hl7/inbound")
        .set("Content-Type", "text/plain")
        .send(sampleHL7);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe("msg-123");
      expect(res.body.status).toBe("queued");
      expect(parseHL7Mock).toHaveBeenCalledWith(sampleHL7);
      expect(enqueueHL7Mock).toHaveBeenCalledWith(sampleHL7, "tenant-1");
    });

    it("should accept HL7 message in message field", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-124");
      generateACKMock.mockReturnValue("ACK message");

      const res = await request(app)
        .post("/api/hl7/inbound")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe("msg-124");
    });

    it("should accept HL7 message in hl7Message field", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-125");
      generateACKMock.mockReturnValue("ACK message");

      const res = await request(app)
        .post("/api/hl7/inbound")
        .send({ hl7Message: sampleHL7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe("msg-125");
    });

    it("should return 401 when no tenantId", async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use(
        "/api/hl7",
        (req: any, _res: any, next: any) => {
          req.user = { id: "user-1" };
          next();
        },
        hl7Router
      );

      const res = await request(appNoAuth)
        .post("/api/hl7/inbound")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("should return 400 when no message in body", async () => {
      const res = await request(app).post("/api/hl7/inbound").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing HL7 message in request body");
    });

    it("should return 400 when parse fails", async () => {
      parseHL7Mock.mockImplementation(() => {
        throw new Error("Invalid HL7 format");
      });
      generateACKMock.mockReturnValue("NACK message");

      const res = await request(app)
        .post("/api/hl7/inbound")
        .send({ message: "invalid" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid HL7 message format");
      expect(res.body.details).toBe("Invalid HL7 format");
      expect(createAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "HL7_PARSE_ERROR",
          severity: "error",
          status: "failure",
        })
      );
    });

    it("should return 400 when validation fails", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({
        valid: false,
        errors: ["Missing required field"],
      });
      generateACKMock.mockReturnValue("NACK message");

      const res = await request(app)
        .post("/api/hl7/inbound")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("HL7 message validation failed");
      expect(res.body.validationErrors).toEqual(["Missing required field"]);
      expect(createAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "HL7_VALIDATION_ERROR",
          severity: "warning",
          status: "failure",
        })
      );
    });

    it("should return 500 on internal error", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockRejectedValue(new Error("DB error"));

      const res = await request(app)
        .post("/api/hl7/inbound")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error processing HL7 message");
    });

    it("should create audit log on success", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-126");
      generateACKMock.mockReturnValue("ACK message");

      await request(app).post("/api/hl7/inbound").send({ message: sampleHL7 });

      expect(createAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "HL7_MESSAGE_RECEIVED",
          resourceType: "hl7_message",
          resourceId: "msg-126",
          severity: "info",
          status: "success",
        })
      );
    });
  });

  describe("POST /api/hl7/inbound/sync", () => {
    it("should process HL7 message synchronously", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      processHL7Mock.mockResolvedValue({
        success: true,
        resourceId: "resource-1",
        ackMessage: "ACK message",
      });

      const res = await request(app)
        .post("/api/hl7/inbound/sync")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.resourceId).toBe("resource-1");
      expect(processHL7Mock).toHaveBeenCalledWith(mockParsedHL7, "tenant-1", "user-1");
    });

    it("should return 401 when no tenantId", async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use(
        "/api/hl7",
        (req: any, _res: any, next: any) => {
          req.user = { id: "user-1" };
          next();
        },
        hl7Router
      );

      const res = await request(appNoAuth)
        .post("/api/hl7/inbound/sync")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(401);
    });

    it("should return 400 when no message", async () => {
      const res = await request(app).post("/api/hl7/inbound/sync").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing HL7 message in request body");
    });

    it("should return 400 when validation fails", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({
        valid: false,
        errors: ["Invalid message"],
      });
      generateACKMock.mockReturnValue("NACK");

      const res = await request(app)
        .post("/api/hl7/inbound/sync")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toEqual(["Invalid message"]);
    });

    it("should return 500 when processing fails", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      processHL7Mock.mockResolvedValue({
        success: false,
        error: "Processing failed",
        ackMessage: "NACK",
      });

      const res = await request(app)
        .post("/api/hl7/inbound/sync")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Processing failed");
    });

    it("should return 500 on exception", async () => {
      parseHL7Mock.mockImplementation(() => {
        throw new Error("Parse error");
      });

      const res = await request(app)
        .post("/api/hl7/inbound/sync")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });

    it("should create audit log on success", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      processHL7Mock.mockResolvedValue({
        success: true,
        resourceId: "resource-2",
        ackMessage: "ACK",
      });

      await request(app)
        .post("/api/hl7/inbound/sync")
        .send({ message: sampleHL7 });

      expect(createAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "HL7_MESSAGE_PROCESSED_SYNC",
          resourceType: "hl7_message",
        })
      );
    });
  });

  describe("GET /api/hl7/messages", () => {
    it("should list HL7 messages", async () => {
      getQueuedMessagesMock.mockResolvedValue({
        messages: [{ id: "msg-1" }, { id: "msg-2" }],
        total: 2,
      });

      const res = await request(app).get("/api/hl7/messages");

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.limit).toBe(50);
      expect(res.body.offset).toBe(0);
    });

    it("should return 401 when no tenantId", async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use(
        "/api/hl7",
        (req: any, _res: any, next: any) => {
          req.user = { id: "user-1" };
          next();
        },
        hl7Router
      );

      const res = await request(appNoAuth).get("/api/hl7/messages");

      expect(res.status).toBe(401);
    });

    it("should filter by status", async () => {
      getQueuedMessagesMock.mockResolvedValue({
        messages: [{ id: "msg-1", status: "pending" }],
        total: 1,
      });

      const res = await request(app)
        .get("/api/hl7/messages")
        .query({ status: "pending" });

      expect(res.status).toBe(200);
      expect(getQueuedMessagesMock).toHaveBeenCalledWith(
        "tenant-1",
        expect.objectContaining({ status: "pending" })
      );
    });

    it("should filter by messageType", async () => {
      getQueuedMessagesMock.mockResolvedValue({
        messages: [{ id: "msg-1", messageType: "ADT^A01" }],
        total: 1,
      });

      const res = await request(app)
        .get("/api/hl7/messages")
        .query({ messageType: "ADT^A01" });

      expect(res.status).toBe(200);
      expect(getQueuedMessagesMock).toHaveBeenCalledWith(
        "tenant-1",
        expect.objectContaining({ messageType: "ADT^A01" })
      );
    });

    it("should support pagination", async () => {
      getQueuedMessagesMock.mockResolvedValue({
        messages: [],
        total: 100,
      });

      const res = await request(app)
        .get("/api/hl7/messages")
        .query({ limit: 10, offset: 20 });

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(10);
      expect(res.body.offset).toBe(20);
      expect(getQueuedMessagesMock).toHaveBeenCalledWith(
        "tenant-1",
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it("should return 500 on error", async () => {
      getQueuedMessagesMock.mockRejectedValue(new Error("DB error"));

      const res = await request(app).get("/api/hl7/messages");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
      expect(loggerMock.error).toHaveBeenCalledWith("Error listing HL7 messages", { error: "DB error" });
    });

    it("should mask non-Error values when listing HL7 messages fails", async () => {
      getQueuedMessagesMock.mockRejectedValue({ patientName: "Jane Doe" });

      const res = await request(app).get("/api/hl7/messages");

      expect(res.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith("Error listing HL7 messages", { error: "Unknown error" });
    });
  });

  describe("GET /api/hl7/messages/:id", () => {
    it("should get message by id", async () => {
      getMessageByIdMock.mockResolvedValue({
        id: "msg-1",
        status: "processed",
      });

      const res = await request(app).get("/api/hl7/messages/msg-1");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("msg-1");
      expect(getMessageByIdMock).toHaveBeenCalledWith("msg-1", "tenant-1");
    });

    it("should return 401 when no tenantId", async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use(
        "/api/hl7",
        (req: any, _res: any, next: any) => {
          req.user = { id: "user-1" };
          next();
        },
        hl7Router
      );

      const res = await request(appNoAuth).get("/api/hl7/messages/msg-1");

      expect(res.status).toBe(401);
    });

    it("should return 404 when message not found", async () => {
      getMessageByIdMock.mockResolvedValue(null);

      const res = await request(app).get("/api/hl7/messages/msg-999");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Message not found");
    });

    it("should return 500 on error", async () => {
      getMessageByIdMock.mockRejectedValue(new Error("DB error"));

      const res = await request(app).get("/api/hl7/messages/msg-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });
  });

  describe("POST /api/hl7/messages/:id/reprocess", () => {
    it("should reprocess failed message", async () => {
      retryFailedMessageMock.mockResolvedValue(undefined);

      const res = await request(app).post("/api/hl7/messages/msg-1/reprocess");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Message queued for reprocessing");
      expect(retryFailedMessageMock).toHaveBeenCalledWith("msg-1", "tenant-1");
    });

    it("should return 401 when no tenantId", async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use(
        "/api/hl7",
        (req: any, _res: any, next: any) => {
          req.user = { id: "user-1" };
          next();
        },
        hl7Router
      );

      const res = await request(appNoAuth).post(
        "/api/hl7/messages/msg-1/reprocess"
      );

      expect(res.status).toBe(401);
    });

    it("should create audit log", async () => {
      retryFailedMessageMock.mockResolvedValue(undefined);

      await request(app).post("/api/hl7/messages/msg-1/reprocess");

      expect(createAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "HL7_MESSAGE_REPROCESS",
          resourceType: "hl7_message",
          resourceId: "msg-1",
        })
      );
    });

    it("should return 500 on error", async () => {
      retryFailedMessageMock.mockRejectedValue(new Error("Retry error"));

      const res = await request(app).post("/api/hl7/messages/msg-1/reprocess");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });
  });

  describe("GET /api/hl7/statistics", () => {
    it("should get queue statistics", async () => {
      getQueueStatisticsMock.mockResolvedValue({
        pending: 5,
        processing: 2,
        processed: 100,
        failed: 3,
      });

      const res = await request(app).get("/api/hl7/statistics");

      expect(res.status).toBe(200);
      expect(res.body.pending).toBe(5);
      expect(res.body.processed).toBe(100);
      expect(getQueueStatisticsMock).toHaveBeenCalledWith("tenant-1");
    });

    it("should return 401 when no tenantId", async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use(
        "/api/hl7",
        (req: any, _res: any, next: any) => {
          req.user = { id: "user-1" };
          next();
        },
        hl7Router
      );

      const res = await request(appNoAuth).get("/api/hl7/statistics");

      expect(res.status).toBe(401);
    });

    it("should return 500 on error", async () => {
      getQueueStatisticsMock.mockRejectedValue(new Error("Stats error"));

      const res = await request(app).get("/api/hl7/statistics");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });
  });

  describe("Legacy endpoints", () => {
    it("POST /api/hl7/adt should forward to inbound", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-127");
      generateACKMock.mockReturnValue("ACK");

      const res = await request(app)
        .post("/api/hl7/adt")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/hl7/siu should forward to inbound", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-128");
      generateACKMock.mockReturnValue("ACK");

      const res = await request(app)
        .post("/api/hl7/siu")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/hl7/dft should forward to inbound", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-129");
      generateACKMock.mockReturnValue("ACK");

      const res = await request(app)
        .post("/api/hl7/dft")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/hl7/oru should forward to inbound", async () => {
      parseHL7Mock.mockReturnValue(mockParsedHL7);
      validateHL7Mock.mockReturnValue({ valid: true, errors: [] });
      enqueueHL7Mock.mockResolvedValue("msg-130");
      generateACKMock.mockReturnValue("ACK");

      const res = await request(app)
        .post("/api/hl7/oru")
        .send({ message: sampleHL7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
