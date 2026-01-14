import request from "supertest";
import express from "express";
import { tasksRouter } from "../tasks";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider", fullName: "Provider User" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/tasks", tasksRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Tasks routes - List", () => {
  it("GET /tasks returns tasks", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "task-1",
          title: "Test Task",
          description: "Test description",
          status: "todo",
          priority: "normal",
          category: "general",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/tasks");

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Test Task");
  });

  it("GET /tasks filters by status", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "task-1", title: "Test Task", status: "completed" }],
      rowCount: 1,
    });

    const res = await request(app).get("/tasks?status=completed");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("t.status = $2"), expect.arrayContaining(["completed"]));
  });

  it("GET /tasks filters by category", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/tasks?category=lab");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("t.category = $2"), expect.arrayContaining(["lab"]));
  });

  it("GET /tasks filters by assignedTo=me", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/tasks?assignedTo=me");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("t.assigned_to = $2"), expect.arrayContaining(["user-1"]));
  });

  it("GET /tasks filters by assignedTo=unassigned", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/tasks?assignedTo=unassigned");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("t.assigned_to is null"), expect.anything());
  });

  it("GET /tasks filters by priority", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/tasks?priority=high");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("t.priority = $2"), expect.arrayContaining(["high"]));
  });

  it("GET /tasks searches by text", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/tasks?search=urgent");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("t.title ilike $2 or t.description ilike $2"),
      expect.arrayContaining(["%urgent%"])
    );
  });

  it("GET /tasks sorts results", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/tasks?sortBy=priority&sortOrder=asc");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("order by t.priority asc"), expect.anything());
  });
});

describe("Tasks routes - Create", () => {
  it("POST /tasks creates task", async () => {
    const res = await request(app).post("/tasks").send({
      title: "New Task",
      description: "Task description",
      priority: "high",
      category: "lab",
      status: "todo",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "task_create", "task", expect.any(String));
  });

  it("POST /tasks creates task with minimal data", async () => {
    const res = await request(app).post("/tasks").send({
      title: "Minimal Task",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /tasks creates task with patient and encounter", async () => {
    const res = await request(app).post("/tasks").send({
      title: "Patient Task",
      patientId: "patient-1",
      encounterId: "encounter-1",
    });

    expect(res.status).toBe(201);
  });

  it("POST /tasks rejects missing title", async () => {
    const res = await request(app).post("/tasks").send({
      description: "No title",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /tasks rejects invalid priority", async () => {
    const res = await request(app).post("/tasks").send({
      title: "Test Task",
      priority: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /tasks rejects invalid status", async () => {
    const res = await request(app).post("/tasks").send({
      title: "Test Task",
      status: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("Tasks routes - Update", () => {
  it("PUT /tasks/:id updates task", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 });

    const res = await request(app).put("/tasks/task-1").send({
      title: "Updated Task",
      status: "in_progress",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "task_update", "task", "task-1");
  });

  it("PUT /tasks/:id tracks completion", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 });

    const res = await request(app).put("/tasks/task-1").send({
      status: "completed",
    });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("completed_at = now()"),
      expect.arrayContaining(["completed", "user-1"])
    );
  });

  it("PUT /tasks/:id clears completion when status changes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 });

    const res = await request(app).put("/tasks/task-1").send({
      status: "in_progress",
    });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("completed_at = null"),
      expect.arrayContaining(["in_progress"])
    );
  });

  it("PUT /tasks/:id returns 404 when task not found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).put("/tasks/task-1").send({
      title: "Updated",
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("PUT /tasks/:id rejects no updates", async () => {
    const res = await request(app).put("/tasks/task-1").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No fields to update");
  });

  it("PUT /tasks/:id rejects invalid data", async () => {
    const res = await request(app).put("/tasks/task-1").send({
      priority: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("Tasks routes - Status update", () => {
  it("PUT /tasks/:id/status updates status", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 });

    const res = await request(app).put("/tasks/task-1/status").send({
      status: "completed",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "task_status_change", "task", "task-1");
  });

  it("PUT /tasks/:id/status tracks completion", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 });

    const res = await request(app).put("/tasks/task-1/status").send({
      status: "completed",
    });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(["completed", "task-1", "tenant-1", "user-1"]));
  });

  it("PUT /tasks/:id/status clears completion", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 });

    const res = await request(app).put("/tasks/task-1/status").send({
      status: "in_progress",
    });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("completed_at = null"), expect.anything());
  });

  it("PUT /tasks/:id/status rejects invalid status", async () => {
    const res = await request(app).put("/tasks/task-1/status").send({
      status: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("PUT /tasks/:id/status returns 404 when task not found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).put("/tasks/task-1/status").send({
      status: "completed",
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("Tasks routes - Delete", () => {
  it("DELETE /tasks/:id deletes task", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 });

    const res = await request(app).delete("/tasks/task-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "task_delete", "task", "task-1");
  });

  it("DELETE /tasks/:id returns 404 when task not found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).delete("/tasks/task-1");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("Tasks routes - Comments", () => {
  it("GET /tasks/:id/comments returns comments", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "comment-1",
          comment: "Test comment",
          userId: "user-1",
          userName: "Provider User",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/tasks/task-1/comments");

    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].comment).toBe("Test comment");
  });

  it("POST /tasks/:id/comments adds comment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "task-1" }], rowCount: 1 }); // Task exists check

    const res = await request(app).post("/tasks/task-1/comments").send({
      comment: "New comment",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "task_comment_add", "task", "task-1");
  });

  it("POST /tasks/:id/comments rejects empty comment", async () => {
    const res = await request(app).post("/tasks/task-1/comments").send({
      comment: "",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /tasks/:id/comments returns 404 when task not found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post("/tasks/task-1/comments").send({
      comment: "Comment on missing task",
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("Tasks routes - Error handling", () => {
  it("handles database errors gracefully", async () => {
    queryMock.mockRejectedValueOnce(new Error("Database error"));

    const res = await request(app).get("/tasks");

    expect(res.status).toBe(500);
  });
});
