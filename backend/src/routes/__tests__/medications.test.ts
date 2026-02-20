import request from "supertest";
import express from "express";
import { medicationsRouter } from "../medications";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/medications", medicationsRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  loggerMock.error.mockReset();
});

describe("Medications routes", () => {
  it("GET /medications applies filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "med-1" }] });
    const res = await request(app).get("/medications?search=acne&category=topical&controlled=true&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.medications).toHaveLength(1);
  });

  it("GET /medications handles controlled=false", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "med-2" }] });
    const res = await request(app).get("/medications?controlled=false");
    expect(res.status).toBe(200);
    expect(res.body.medications).toHaveLength(1);
  });

  it("GET /medications returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/medications");
    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error searching medications:", {
      error: "boom",
    });
  });

  it("GET /medications masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ medicationName: "Secret Rx" });
    const res = await request(app).get("/medications");
    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error searching medications:", {
      error: "Unknown error",
    });
  });

  it("GET /medications/list/categories returns categories", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ category: "topical" }, { category: "systemic" }] });
    const res = await request(app).get("/medications/list/categories");
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual(["topical", "systemic"]);
  });

  it("GET /medications/list/categories returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/medications/list/categories");
    expect(res.status).toBe(500);
  });

  it("GET /medications/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/medications/med-1");
    expect(res.status).toBe(404);
  });

  it("GET /medications/:id returns medication", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "med-1" }] });
    const res = await request(app).get("/medications/med-1");
    expect(res.status).toBe(200);
    expect(res.body.medication.id).toBe("med-1");
  });

  it("GET /medications/:id returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/medications/med-1");
    expect(res.status).toBe(500);
  });
});
