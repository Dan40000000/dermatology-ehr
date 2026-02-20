import request from "supertest";
import express from "express";
import timeBlocksRouter from "../timeBlocks";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { logger } from "../../lib/logger";
import {
  hasSchedulingConflict,
  parseRecurrencePattern,
  expandRecurrence,
} from "../../services/timeBlockService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin", fullName: "Dr. Test" };
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

jest.mock("../../services/timeBlockService", () => ({
  hasSchedulingConflict: jest.fn(),
  parseRecurrencePattern: jest.fn(),
  expandRecurrence: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/time-blocks", timeBlocksRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const hasConflictMock = hasSchedulingConflict as jest.Mock;
const parsePatternMock = parseRecurrencePattern as jest.Mock;
const expandRecurrenceMock = expandRecurrence as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const basePayload = {
  providerId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  title: "Lunch",
  blockType: "lunch",
  description: "Break",
  startTime: "2024-01-02T12:00:00.000Z",
  endTime: "2024-01-02T12:30:00.000Z",
  isRecurring: false,
};

beforeEach(() => {
  queryMock.mockReset();
  auditLogMock.mockReset();
  hasConflictMock.mockReset();
  parsePatternMock.mockReset();
  expandRecurrenceMock.mockReset();
  loggerMock.error.mockReset();

  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  hasConflictMock.mockResolvedValue({ hasConflict: false });
});

describe("Time blocks routes", () => {
  it("GET /time-blocks returns time blocks", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).get("/time-blocks");

    expect(res.status).toBe(200);
    expect(res.body.timeBlocks).toHaveLength(1);
  });

  it("GET /time-blocks applies filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/time-blocks").query({
      providerId: basePayload.providerId,
      locationId: basePayload.locationId,
      status: "cancelled",
    });

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][1]).toEqual([
      "tenant-1",
      basePayload.providerId,
      basePayload.locationId,
      "cancelled",
    ]);
  });

  it("GET /time-blocks expands recurring blocks", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "tb-1",
          isRecurring: true,
          recurrencePattern: JSON.stringify({ pattern: "daily" }),
          startTime: "2024-01-01T09:00:00.000Z",
          endTime: "2024-01-01T10:00:00.000Z",
        },
        {
          id: "tb-2",
          isRecurring: false,
          recurrencePattern: null,
          startTime: "2024-01-02T11:00:00.000Z",
          endTime: "2024-01-02T12:00:00.000Z",
        },
      ],
    });
    parsePatternMock.mockReturnValue({ pattern: "daily" });
    expandRecurrenceMock.mockReturnValue([
      { startTime: new Date("2024-01-03T09:00:00.000Z"), endTime: new Date("2024-01-03T10:00:00.000Z") },
      { startTime: new Date("2024-01-04T09:00:00.000Z"), endTime: new Date("2024-01-04T10:00:00.000Z") },
    ]);

    const res = await request(app)
      .get("/time-blocks")
      .query({ expand: "true", startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-01-10T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.timeBlocks).toHaveLength(3);
    expect(res.body.timeBlocks.some((block: any) => block.isInstance && block.parentId === "tb-1")).toBe(true);
  });

  it("GET /time-blocks keeps recurring block when parsing fails", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "tb-1",
          isRecurring: true,
          recurrencePattern: "not-json",
          startTime: "2024-01-01T09:00:00.000Z",
          endTime: "2024-01-01T10:00:00.000Z",
        },
      ],
    });
    parsePatternMock.mockImplementation(() => {
      throw new Error("bad pattern");
    });

    const res = await request(app)
      .get("/time-blocks")
      .query({ expand: "true", startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-01-10T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.timeBlocks).toHaveLength(1);
    expect(res.body.timeBlocks[0].id).toBe("tb-1");
  });

  it("GET /time-blocks returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/time-blocks");

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching time blocks:", {
      error: "boom",
    });
  });

  it("GET /time-blocks masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ providerName: "Dr. Private" });

    const res = await request(app).get("/time-blocks");

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching time blocks:", {
      error: "Unknown error",
    });
  });

  it("GET /time-blocks/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/time-blocks/tb-1");

    expect(res.status).toBe(404);
  });

  it("GET /time-blocks/:id returns time block", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).get("/time-blocks/tb-1");

    expect(res.status).toBe(200);
    expect(res.body.timeBlock.id).toBe("tb-1");
  });

  it("GET /time-blocks/:id returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/time-blocks/tb-1");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("POST /time-blocks rejects invalid payload", async () => {
    const res = await request(app).post("/time-blocks").send({});

    expect(res.status).toBe(400);
  });

  it("POST /time-blocks rejects invalid time range", async () => {
    const res = await request(app).post("/time-blocks").send({
      ...basePayload,
      startTime: "2024-01-02T13:00:00.000Z",
      endTime: "2024-01-02T12:00:00.000Z",
    });

    expect(res.status).toBe(400);
  });

  it("POST /time-blocks requires recurrence pattern when recurring", async () => {
    const res = await request(app).post("/time-blocks").send({
      ...basePayload,
      isRecurring: true,
    });

    expect(res.status).toBe(400);
  });

  it("POST /time-blocks rejects recurrence pattern when not recurring", async () => {
    const res = await request(app).post("/time-blocks").send({
      ...basePayload,
      isRecurring: false,
      recurrencePattern: { pattern: "daily" },
    });

    expect(res.status).toBe(400);
  });

  it("POST /time-blocks returns 409 on conflict", async () => {
    hasConflictMock.mockResolvedValueOnce({ hasConflict: true, conflictType: "appointment" });

    const res = await request(app).post("/time-blocks").send(basePayload);

    expect(res.status).toBe(409);
    expect(res.body.conflictType).toBe("appointment");
  });

  it("POST /time-blocks creates time block", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).post("/time-blocks").send(basePayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditLogMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "time_block_create",
      "time_block",
      res.body.id
    );
  });

  it("POST /time-blocks returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/time-blocks").send(basePayload);

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("PATCH /time-blocks rejects invalid payload", async () => {
    const res = await request(app).patch("/time-blocks/tb-1").send({ startTime: "invalid" });

    expect(res.status).toBe(400);
  });

  it("PATCH /time-blocks returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch("/time-blocks/tb-1").send({ title: "Updated" });

    expect(res.status).toBe(404);
  });

  it("PATCH /time-blocks rejects invalid time range", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "tb-1", start_time: basePayload.startTime, end_time: basePayload.endTime, provider_id: basePayload.providerId }],
    });

    const res = await request(app).patch("/time-blocks/tb-1").send({
      startTime: "2024-01-02T13:00:00.000Z",
      endTime: "2024-01-02T12:00:00.000Z",
    });

    expect(res.status).toBe(400);
  });

  it("PATCH /time-blocks returns 409 on conflict", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "tb-1", start_time: basePayload.startTime, end_time: basePayload.endTime, provider_id: basePayload.providerId }],
    });
    hasConflictMock.mockResolvedValueOnce({ hasConflict: true, conflictType: "time_block" });

    const res = await request(app).patch("/time-blocks/tb-1").send({
      startTime: "2024-01-02T13:00:00.000Z",
      endTime: "2024-01-02T14:00:00.000Z",
    });

    expect(res.status).toBe(409);
    expect(res.body.conflictType).toBe("time_block");
  });

  it("PATCH /time-blocks rejects empty updates", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "tb-1", start_time: basePayload.startTime, end_time: basePayload.endTime, provider_id: basePayload.providerId }],
    });

    const res = await request(app).patch("/time-blocks/tb-1").send({});

    expect(res.status).toBe(400);
  });

  it("PATCH /time-blocks cancels time block", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "tb-1", start_time: basePayload.startTime, end_time: basePayload.endTime, provider_id: basePayload.providerId }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).patch("/time-blocks/tb-1").send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "time_block_cancel", "time_block", "tb-1");
  });

  it("PATCH /time-blocks updates time block", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "tb-1", start_time: basePayload.startTime, end_time: basePayload.endTime, provider_id: basePayload.providerId }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).patch("/time-blocks/tb-1").send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "time_block_update", "time_block", "tb-1");
  });

  it("PATCH /time-blocks updates schedule fields", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "tb-1",
            start_time: basePayload.startTime,
            end_time: basePayload.endTime,
            provider_id: basePayload.providerId,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).patch("/time-blocks/tb-1").send({
      blockType: "meeting",
      description: "Team sync",
      startTime: "2024-01-02T13:00:00.000Z",
      endTime: "2024-01-02T14:00:00.000Z",
      locationId: "33333333-3333-4333-8333-333333333333",
      isRecurring: true,
      recurrencePattern: { pattern: "weekly", days: [1], until: "2024-02-01" },
      recurrenceEndDate: "2024-02-01",
      status: "active",
    });

    expect(res.status).toBe(200);
  });

  it("PATCH /time-blocks clears recurrence pattern", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "tb-1",
            start_time: basePayload.startTime,
            end_time: basePayload.endTime,
            provider_id: basePayload.providerId,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).patch("/time-blocks/tb-1").send({
      recurrencePattern: null,
    });

    expect(res.status).toBe(200);
  });

  it("PATCH /time-blocks returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "tb-1", start_time: basePayload.startTime, end_time: basePayload.endTime, provider_id: basePayload.providerId }],
      })
      .mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).patch("/time-blocks/tb-1").send({ title: "Updated" });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("DELETE /time-blocks returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/time-blocks/tb-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /time-blocks deletes time block", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tb-1" }] });

    const res = await request(app).delete("/time-blocks/tb-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("tb-1");
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "time_block_delete", "time_block", "tb-1");
  });

  it("DELETE /time-blocks returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).delete("/time-blocks/tb-1");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
