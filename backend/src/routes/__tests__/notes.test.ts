import request from "supertest";
import express from "express";
import { logger } from "../../lib/logger";

let currentUser = {
  id: "provider-1",
  tenantId: "tenant-1",
  role: "provider",
  fullName: "Dr. Test",
};

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = currentUser;
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

const { notesRouter } = require("../notes");
const { pool } = require("../../db/pool");
const { auditLog } = require("../../services/audit");

const app = express();
app.use(express.json());
app.use("/notes", notesRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const noteIds = ["note-1", "note-2"];
const missingTableError = Object.assign(new Error("missing table"), { code: "42P01" });

beforeEach(() => {
  currentUser = {
    id: "provider-1",
    tenantId: "tenant-1",
    role: "provider",
    fullName: "Dr. Test",
  };
  queryMock.mockReset();
  auditLogMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Notes routes", () => {
  it("GET /notes returns notes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "note-1" }], rowCount: 1 });

    const res = await request(app).get("/notes").query({ status: "draft" });

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
  });

  it("GET /notes applies optional filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/notes").query({
      status: "final",
      providerId: "provider-1",
      patientId: "patient-1",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(res.status).toBe(200);
    const query = queryMock.mock.calls[0][0];
    expect(query).toContain("e.provider_id");
    expect(query).toContain("e.patient_id");
    expect(query).toContain("e.created_at >=");
    expect(query).toContain("e.created_at <=");
  });

  it("GET /notes rejects invalid filters", async () => {
    const res = await request(app).get("/notes").query({ status: "invalid" });

    expect(res.status).toBe(400);
  });

  it("POST /notes/bulk/finalize validates body", async () => {
    const res = await request(app).post("/notes/bulk/finalize").send({ noteIds: [] });

    expect(res.status).toBe(400);
  });

  it("POST /notes/bulk/finalize returns 404 when notes missing", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "note-1", status: "draft" }],
    });

    const res = await request(app).post("/notes/bulk/finalize").send({ noteIds });

    expect(res.status).toBe(404);
  });

  it("POST /notes/bulk/finalize rejects signed notes", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { id: "note-1", status: "signed" },
        { id: "note-2", status: "draft" },
      ],
    });

    const res = await request(app).post("/notes/bulk/finalize").send({ noteIds });

    expect(res.status).toBe(409);
    expect(res.body.signedNotes).toContain("note-1");
  });

  it("POST /notes/bulk/finalize returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/notes/bulk/finalize").send({ noteIds });

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Bulk finalize error:", {
      error: "boom",
    });
  });

  it("POST /notes/bulk/finalize masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ noteText: "PHI note content" });

    const res = await request(app).post("/notes/bulk/finalize").send({ noteIds });

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Bulk finalize error:", {
      error: "Unknown error",
    });
  });

  it("POST /notes/bulk/finalize finalizes notes", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id: "note-1", status: "draft" },
          { id: "note-2", status: "final" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/notes/bulk/finalize").send({ noteIds });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalledTimes(noteIds.length);
  });

  it("POST /notes/bulk/assign validates body", async () => {
    const res = await request(app).post("/notes/bulk/assign").send({ noteIds });

    expect(res.status).toBe(400);
  });

  it("POST /notes/bulk/assign returns 404 when provider missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app)
      .post("/notes/bulk/assign")
      .send({ noteIds, providerId: "provider-9" });

    expect(res.status).toBe(404);
  });

  it("POST /notes/bulk/assign returns 404 when notes missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "provider-1" }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "note-1", status: "draft" }],
      });

    const res = await request(app)
      .post("/notes/bulk/assign")
      .send({ noteIds, providerId: "provider-1" });

    expect(res.status).toBe(404);
  });

  it("POST /notes/bulk/assign rejects signed notes", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "provider-1" }] })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id: "note-1", status: "signed" },
          { id: "note-2", status: "draft" },
        ],
      });

    const res = await request(app)
      .post("/notes/bulk/assign")
      .send({ noteIds, providerId: "provider-1" });

    expect(res.status).toBe(409);
    expect(res.body.signedNotes).toContain("note-1");
  });

  it("POST /notes/bulk/assign returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post("/notes/bulk/assign")
      .send({ noteIds, providerId: "provider-1" });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("POST /notes/bulk/assign assigns notes", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "provider-1" }] })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id: "note-1", status: "draft" },
          { id: "note-2", status: "preliminary" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/notes/bulk/assign")
      .send({ noteIds, providerId: "provider-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalledTimes(noteIds.length);
  });

  it("PATCH /notes/:id/sign returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).patch("/notes/note-1/sign").send({});

    expect(res.status).toBe(404);
  });

  it("PATCH /notes/:id/sign blocks signing for wrong provider", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "note-1", status: "final", provider_id: "provider-2" }],
    });

    const res = await request(app).patch("/notes/note-1/sign").send({});

    expect(res.status).toBe(403);
  });

  it("PATCH /notes/:id/sign rejects already signed note", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "note-1", status: "signed", provider_id: "provider-1" }],
    });

    const res = await request(app).patch("/notes/note-1/sign").send({});

    expect(res.status).toBe(409);
  });

  it("PATCH /notes/:id/sign allows admin to sign any note", async () => {
    currentUser = { ...currentUser, id: "admin-1", role: "admin" };
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "note-1", status: "final", provider_id: "provider-2" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch("/notes/note-1/sign").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("PATCH /notes/:id/sign returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).patch("/notes/note-1/sign").send({});

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("PATCH /notes/:id/sign signs note", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "note-1", status: "final", provider_id: "provider-1" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch("/notes/note-1/sign").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("PATCH /notes/:id/addendum requires signed note", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "note-1", status: "draft", provider_id: "provider-1" }],
    });

    const res = await request(app)
      .patch("/notes/note-1/addendum")
      .send({ addendum: "More detail" });

    expect(res.status).toBe(409);
  });

  it("PATCH /notes/:id/addendum returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app)
      .patch("/notes/note-1/addendum")
      .send({ addendum: "Addendum detail" });

    expect(res.status).toBe(404);
  });

  it("PATCH /notes/:id/addendum adds addendum", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "note-1",
            status: "signed",
            provider_id: "provider-1",
            assessment_plan: "Plan",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/notes/note-1/addendum")
      .send({ addendum: "Addendum detail" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("PATCH /notes/:id/addendum uses fallback name and empty plan", async () => {
    currentUser = { ...currentUser, fullName: undefined };
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "note-1",
            status: "signed",
            provider_id: "provider-1",
            assessment_plan: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/notes/note-1/addendum")
      .send({ addendum: "Addendum detail" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("PATCH /notes/:id/addendum returns 500 on retry failure", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "note-1",
            status: "signed",
            provider_id: "provider-1",
            assessment_plan: "Plan",
          },
        ],
      })
      .mockRejectedValueOnce(missingTableError)
      .mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .patch("/notes/note-1/addendum")
      .send({ addendum: "Addendum detail" });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("PATCH /notes/:id/addendum creates table when missing", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "note-1",
            status: "signed",
            provider_id: "provider-1",
            assessment_plan: "Plan",
          },
        ],
      })
      .mockRejectedValueOnce(missingTableError)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ assessment_plan: "Plan" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/notes/note-1/addendum")
      .send({ addendum: "Addendum detail" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    consoleSpy.mockRestore();
  });

  it("PATCH /notes/:id/addendum returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "note-1",
            status: "signed",
            provider_id: "provider-1",
            assessment_plan: "Plan",
          },
        ],
      })
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "OTHER" }));

    const res = await request(app)
      .patch("/notes/note-1/addendum")
      .send({ addendum: "Addendum detail" });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("GET /notes/:id/addendums returns addendums", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "add-1" }], rowCount: 1 });

    const res = await request(app).get("/notes/note-1/addendums");

    expect(res.status).toBe(200);
    expect(res.body.addendums).toHaveLength(1);
  });

  it("GET /notes/:id/addendums returns empty when table missing", async () => {
    queryMock.mockRejectedValueOnce(missingTableError);

    const res = await request(app).get("/notes/note-1/addendums");

    expect(res.status).toBe(200);
    expect(res.body.addendums).toEqual([]);
  });

  it("GET /notes/:id/addendums returns 500 on error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "OTHER" }));

    const res = await request(app).get("/notes/note-1/addendums");

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
