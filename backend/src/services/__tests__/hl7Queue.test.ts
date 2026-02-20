import * as hl7Queue from "../hl7Queue";
import { pool } from "../../db/pool";
import { parseHL7Message, validateHL7Message } from "../hl7Parser";
import { processHL7Message } from "../hl7Processor";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../hl7Parser", () => ({
  parseHL7Message: jest.fn(),
  validateHL7Message: jest.fn(),
}));

jest.mock("../hl7Processor", () => ({
  processHL7Message: jest.fn(),
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
  randomUUID: jest.fn(() => "queue-uuid-123"),
}));

const hasSql = (mockFn: jest.Mock, fragment: string) =>
  mockFn.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes(fragment));
const loggerMock = logger as jest.Mocked<typeof logger>;

describe("hl7Queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loggerMock.error.mockReset();
  });

  it("enqueues valid messages", async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    (pool.connect as jest.Mock).mockResolvedValue(client);
    (parseHL7Message as jest.Mock).mockReturnValue({
      messageType: "ADT^A04",
      messageControlId: "MSG0001",
      sendingApplication: "APP",
      sendingFacility: "FAC",
      segments: { MSH: {} },
    });
    (validateHL7Message as jest.Mock).mockReturnValue({ valid: true, errors: [] });

    const messageId = await hl7Queue.enqueueHL7Message("RAW", "tenant-1");

    expect(messageId).toBe("queue-uuid-123");
    expect(hasSql(client.query as jest.Mock, "INSERT INTO hl7_messages")).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it("rejects invalid messages during enqueue", async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    (pool.connect as jest.Mock).mockResolvedValue(client);
    (parseHL7Message as jest.Mock).mockReturnValue({
      messageType: "ADT^A04",
      messageControlId: "MSG0001",
      sendingApplication: "APP",
      sendingFacility: "FAC",
      segments: { MSH: {} },
    });
    (validateHL7Message as jest.Mock).mockReturnValue({
      valid: false,
      errors: ["missing PID"],
    });

    await expect(hl7Queue.enqueueHL7Message("RAW", "tenant-1")).rejects.toThrow(
      "Invalid HL7 message: missing PID"
    );
    expect(client.release).toHaveBeenCalled();
  });

  it("processes pending messages successfully", async () => {
    const listClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "msg-1",
            tenant_id: "tenant-1",
            parsed_data: { messageType: "ADT^A04" },
            retry_count: 0,
          },
        ],
      }),
      release: jest.fn(),
    };
    const messageClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };

    (pool.connect as jest.Mock).mockResolvedValueOnce(listClient).mockResolvedValueOnce(messageClient);
    (processHL7Message as jest.Mock).mockResolvedValue({ success: true, ackMessage: "ACK" });

    await hl7Queue.processPendingMessages(5);

    expect(hasSql(messageClient.query as jest.Mock, "status = 'processing'")).toBe(true);
    expect(hasSql(messageClient.query as jest.Mock, "status = 'processed'")).toBe(true);
    expect(messageClient.release).toHaveBeenCalled();
    expect(listClient.release).toHaveBeenCalled();
  });

  it("retries failed messages with backoff", async () => {
    const listClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "msg-2",
            tenant_id: "tenant-1",
            parsed_data: { messageType: "ADT^A04" },
            retry_count: 1,
          },
        ],
      }),
      release: jest.fn(),
    };
    const messageClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };

    (pool.connect as jest.Mock).mockResolvedValueOnce(listClient).mockResolvedValueOnce(messageClient);
    (processHL7Message as jest.Mock).mockResolvedValue({ success: false, ackMessage: "ACK", error: "boom" });

    await hl7Queue.processPendingMessages();

    expect(hasSql(messageClient.query as jest.Mock, "next_retry_at")).toBe(true);
  });

  it("marks messages as failed after max retries", async () => {
    const listClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "msg-3",
            tenant_id: "tenant-1",
            parsed_data: { messageType: "ADT^A04" },
            retry_count: 3,
          },
        ],
      }),
      release: jest.fn(),
    };
    const messageClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };

    (pool.connect as jest.Mock).mockResolvedValueOnce(listClient).mockResolvedValueOnce(messageClient);
    (processHL7Message as jest.Mock).mockResolvedValue({ success: false, ackMessage: "ACK", error: "boom" });

    await hl7Queue.processPendingMessages();

    expect(hasSql(messageClient.query as jest.Mock, "status = 'failed'")).toBe(true);
  });

  it("handles unexpected processing errors", async () => {
    const listClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "msg-4",
            tenant_id: "tenant-1",
            parsed_data: { messageType: "ADT^A04" },
            retry_count: 0,
          },
        ],
      }),
      release: jest.fn(),
    };
    const messageClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };

    (pool.connect as jest.Mock).mockResolvedValueOnce(listClient).mockResolvedValueOnce(messageClient);
    (processHL7Message as jest.Mock).mockRejectedValue(new Error("unexpected"));

    await hl7Queue.processPendingMessages();

    expect(hasSql(messageClient.query as jest.Mock, "status = 'failed'")).toBe(true);
  });

  it("retries failed messages by id", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: "msg-5" }] });

    await hl7Queue.retryFailedMessage("msg-5", "tenant-1");

    expect(hasSql(pool.query as jest.Mock, "SET status = 'pending'")).toBe(true);
  });

  it("throws when retrying messages that are not failed", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    await expect(hl7Queue.retryFailedMessage("missing", "tenant-1")).rejects.toThrow(
      "Message not found or not in failed status"
    );
  });

  it("returns queue statistics", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          pending: "1",
          processing: "2",
          processed: "3",
          failed: "4",
          total: "10",
        },
      ],
    });

    const stats = await hl7Queue.getQueueStatistics("tenant-1");

    expect(stats).toEqual({
      pending: 1,
      processing: 2,
      processed: 3,
      failed: 4,
      total: 10,
    });
  });

  it("returns queued messages with filters applied", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ total: "2" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "msg-6",
            tenant_id: "tenant-1",
            message_type: "ORU^R01",
            message_control_id: "CTRL-6",
            sending_application: "APP",
            sending_facility: "FAC",
            raw_message: "RAW",
            parsed_data: {},
            status: "failed",
            error_message: "boom",
            processed_at: null,
            retry_count: 2,
            created_at: new Date("2025-01-01T00:00:00Z"),
          },
        ],
      });

    const result = await hl7Queue.getQueuedMessages("tenant-1", {
      status: "failed",
      messageType: "ORU^R01",
      limit: 5,
      offset: 10,
    });

    expect(result.total).toBe(2);
    expect(result.messages[0]).toMatchObject({
      id: "msg-6",
      messageType: "ORU^R01",
      status: "failed",
      retryCount: 2,
    });
  });

  it("returns null when queued message is missing", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    const result = await hl7Queue.getMessageById("missing", "tenant-1");

    expect(result).toBeNull();
  });

  it("returns queued message details by id", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: "msg-7",
          tenant_id: "tenant-1",
          message_type: "ADT^A04",
          message_control_id: "CTRL-7",
          sending_application: "APP",
          sending_facility: "FAC",
          raw_message: "RAW",
          parsed_data: {},
          status: "processed",
          error_message: null,
          processed_at: null,
          retry_count: 0,
          created_at: new Date("2025-01-01T00:00:00Z"),
        },
      ],
    });

    const result = await hl7Queue.getMessageById("msg-7", "tenant-1");

    expect(result).toMatchObject({
      id: "msg-7",
      messageType: "ADT^A04",
      status: "processed",
    });
  });

  it("runs the queue processor callback and logs startup", async () => {
    jest.useFakeTimers();
    const intervalSpy = jest.spyOn(global, "setInterval");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const timer = hl7Queue.startQueueProcessor(500);
    const callback = intervalSpy.mock.calls[0][0] as () => Promise<void>;

    await callback();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Starting HL7 queue processor"));
    expect(client.query).toHaveBeenCalled();

    clearInterval(timer);
    intervalSpy.mockRestore();
    logSpy.mockRestore();
    jest.useRealTimers();
  });

  it("logs errors when processing fails", async () => {
    jest.useFakeTimers();
    const intervalSpy = jest.spyOn(global, "setInterval");

    (pool.connect as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const timer = hl7Queue.startQueueProcessor(250);
    const callback = intervalSpy.mock.calls[0][0] as () => Promise<void>;

    await callback();

    expect(loggerMock.error).toHaveBeenCalledWith("Error processing HL7 queue:", {
      error: "boom",
    });

    clearInterval(timer);
    intervalSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("masks non-Error queue processing failures", async () => {
    jest.useFakeTimers();
    const intervalSpy = jest.spyOn(global, "setInterval");

    (pool.connect as jest.Mock).mockRejectedValueOnce({ queue: "offline" });

    const timer = hl7Queue.startQueueProcessor(250);
    const callback = intervalSpy.mock.calls[0][0] as () => Promise<void>;

    await callback();

    expect(loggerMock.error).toHaveBeenCalledWith("Error processing HL7 queue:", {
      error: "Unknown error",
    });

    clearInterval(timer);
    intervalSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
