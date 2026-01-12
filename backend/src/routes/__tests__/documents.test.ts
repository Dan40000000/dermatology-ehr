import request from "supertest";
import express from "express";
import { documentsRouter } from "../documents";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/documents", documentsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Documents routes", () => {
  it("GET /documents returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "doc-1" }] });
    const res = await request(app).get("/documents");
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });

  it("POST /documents rejects invalid payload", async () => {
    const res = await request(app).post("/documents").send({ patientId: "p1" });
    expect(res.status).toBe(400);
  });

  it("POST /documents creates document", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/documents").send({
      patientId: "p1",
      title: "Lab report",
      url: "/uploads/doc.pdf",
    });
    expect(res.status).toBe(201);
    expect(res.body.suggestedCategory).toBe("Lab Results");
  });

  it("GET /documents/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/documents/doc-1");
    expect(res.status).toBe(404);
  });

  it("GET /documents/:id returns document", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "doc-1" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/documents/doc-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("doc-1");
  });

  it("GET /documents/:id/preview returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/documents/doc-1/preview");
    expect(res.status).toBe(404);
  });

  it("GET /documents/:id/preview returns preview", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ url: "/doc.pdf", thumbnailUrl: "/thumb.png", mimeType: "application/pdf" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/documents/doc-1/preview");
    expect(res.status).toBe(200);
    expect(res.body.previewUrl).toBe("/thumb.png");
  });

  it("POST /documents/:id/sign rejects invalid payload", async () => {
    const res = await request(app).post("/documents/doc-1/sign").send({});
    expect(res.status).toBe(400);
  });

  it("POST /documents/:id/sign returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/documents/doc-1/sign").send({
      signatureData: "sig",
      signatureType: "typed",
      signerName: "User",
    });
    expect(res.status).toBe(404);
  });

  it("POST /documents/:id/sign rejects already signed", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_signed: true }] });
    const res = await request(app).post("/documents/doc-1/sign").send({
      signatureData: "sig",
      signatureType: "typed",
      signerName: "User",
    });
    expect(res.status).toBe(400);
  });

  it("POST /documents/:id/sign signs document", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_signed: false }] });
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/documents/doc-1/sign").send({
      signatureData: "sig",
      signatureType: "typed",
      signerName: "User",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.query).toHaveBeenCalled();
  });

  it("GET /documents/:id/versions returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/documents/doc-1/versions");
    expect(res.status).toBe(404);
  });

  it("GET /documents/:id/versions returns list", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "doc-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "v1" }] });
    const res = await request(app).get("/documents/doc-1/versions");
    expect(res.status).toBe(200);
    expect(res.body.versions).toHaveLength(1);
  });

  it("POST /documents/:id/versions rejects missing fileUrl", async () => {
    const res = await request(app).post("/documents/doc-1/versions").send({});
    expect(res.status).toBe(400);
  });

  it("POST /documents/:id/versions returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/documents/doc-1/versions").send({ fileUrl: "/doc.pdf" });
    expect(res.status).toBe(404);
  });

  it("POST /documents/:id/versions creates version", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "doc-1" }] })
      .mockResolvedValueOnce({ rows: [{ max_version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/documents/doc-1/versions").send({
      fileUrl: "/doc.pdf",
      changeDescription: "Update",
    });

    expect(res.status).toBe(201);
    expect(res.body.versionNumber).toBe(2);
  });

  it("PUT /documents/:id/category rejects invalid payload", async () => {
    const res = await request(app).put("/documents/doc-1/category").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /documents/:id/category returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/documents/doc-1/category").send({ category: "Other" });
    expect(res.status).toBe(404);
  });

  it("PUT /documents/:id/category updates category", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "doc-1" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/documents/doc-1/category").send({ category: "Other" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /documents/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/documents/doc-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /documents/:id deletes document", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [{ id: "doc-1" }] });
    const res = await request(app).delete("/documents/doc-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /documents/meta/categories returns categories", async () => {
    const res = await request(app).get("/documents/meta/categories");
    expect(res.status).toBe(200);
    expect(res.body.categories).toContain("Other");
  });
});
