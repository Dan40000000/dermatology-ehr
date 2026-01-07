import request from "supertest";
import express from "express";
import { noteTemplatesRouter } from "../noteTemplates";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

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

jest.mock("../../middleware/moduleAccess", () => ({
  requireModuleAccess: () => (_req: any, _res: any, next: any) => next(),
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
app.use("/note-templates", noteTemplatesRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

beforeEach(() => {
  currentUser = {
    id: "provider-1",
    tenantId: "tenant-1",
    role: "provider",
    fullName: "Dr. Test",
  };
  queryMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Note templates routes", () => {
  it("GET /note-templates returns templates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "template-1" }], rowCount: 1 });

    const res = await request(app).get("/note-templates").query({ category: "Initial Visit" });

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it("GET /note-templates filters by provider", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "template-2" }], rowCount: 1 });

    const res = await request(app)
      .get("/note-templates")
      .query({ providerId: "provider-1" });

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it("GET /note-templates/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/note-templates/template-1");

    expect(res.status).toBe(404);
  });

  it("GET /note-templates/:id returns template", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "template-1", name: "Basic Template" }],
      rowCount: 1,
    });

    const res = await request(app).get("/note-templates/template-1");

    expect(res.status).toBe(200);
    expect(res.body.template.id).toBe("template-1");
  });

  it("POST /note-templates validates payload", async () => {
    const res = await request(app).post("/note-templates").send({});

    expect(res.status).toBe(400);
  });

  it("POST /note-templates creates template", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/note-templates").send({
      name: "Derm Visit",
      category: "Initial Visit",
      description: "First visit note",
      isShared: true,
      templateContent: { chiefComplaint: "Rash", hpi: "Two weeks" },
    });

    expect(res.status).toBe(201);
    expect(res.body.template.name).toBe("Derm Visit");
    expect(auditLogMock).toHaveBeenCalledWith(
      "tenant-1",
      "provider-1",
      "template_create",
      "note_template",
      expect.any(String)
    );
  });

  it("PUT /note-templates/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).put("/note-templates/template-1").send({ name: "Updated" });

    expect(res.status).toBe(404);
  });

  it("PUT /note-templates/:id validates payload", async () => {
    const res = await request(app).put("/note-templates/template-1").send({ name: "" });

    expect(res.status).toBe(400);
  });

  it("PUT /note-templates/:id blocks non-owners", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ providerId: "provider-2", isShared: false }],
      rowCount: 1,
    });

    const res = await request(app).put("/note-templates/template-1").send({ name: "Updated" });

    expect(res.status).toBe(403);
  });

  it("PUT /note-templates/:id returns ok when no updates", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ providerId: "provider-1", isShared: false }],
      rowCount: 1,
    });

    const res = await request(app).put("/note-templates/template-1").send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("PUT /note-templates/:id updates template", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ providerId: "provider-1", isShared: false }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put("/note-templates/template-1").send({
      name: "Updated Name",
      isShared: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditLogMock).toHaveBeenCalledWith(
      "tenant-1",
      "provider-1",
      "template_update",
      "note_template",
      "template-1"
    );
  });

  it("PUT /note-templates/:id updates category and content", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ providerId: "provider-1", isShared: false }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put("/note-templates/template-1").send({
      category: "Follow-up Visit",
      description: "Updated description",
      templateContent: { exam: "Clear" },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("DELETE /note-templates/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).delete("/note-templates/template-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /note-templates/:id blocks non-owners", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ providerId: "provider-2" }],
      rowCount: 1,
    });

    const res = await request(app).delete("/note-templates/template-1");

    expect(res.status).toBe(403);
  });

  it("DELETE /note-templates/:id deletes template", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ providerId: "provider-1" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/note-templates/template-1");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditLogMock).toHaveBeenCalledWith(
      "tenant-1",
      "provider-1",
      "template_delete",
      "note_template",
      "template-1"
    );
  });

  it("POST /note-templates/:id/apply returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post("/note-templates/template-1/apply").send({});

    expect(res.status).toBe(404);
  });

  it("POST /note-templates/:id/apply increments usage count", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ templateContent: { chiefComplaint: "Rash" } }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/note-templates/template-1/apply").send({});

    expect(res.status).toBe(200);
    expect(res.body.templateContent.chiefComplaint).toBe("Rash");
    expect(auditLogMock).toHaveBeenCalledWith(
      "tenant-1",
      "provider-1",
      "template_apply",
      "note_template",
      "template-1"
    );
  });

  it("POST /note-templates/:id/favorite removes favorite", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "fav-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/note-templates/template-1/favorite").send({});

    expect(res.status).toBe(200);
    expect(res.body.isFavorite).toBe(false);
  });

  it("POST /note-templates/:id/favorite adds favorite", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/note-templates/template-1/favorite").send({});

    expect(res.status).toBe(200);
    expect(res.body.isFavorite).toBe(true);
  });
});
