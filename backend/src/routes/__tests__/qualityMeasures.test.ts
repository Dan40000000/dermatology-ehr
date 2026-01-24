import request from "supertest";
import express from "express";
import { qualityMeasuresRouter } from "../qualityMeasures";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/moduleAccess", () => ({
  requireModuleAccess: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/quality", qualityMeasuresRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Quality measures routes", () => {
  it("GET /quality/measures filters by category and active", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "measure-1" }] });

    const res = await request(app).get("/quality/measures?category=prevention&active=true");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("quality_measures"),
      ["prevention", true]
    );
  });

  it("GET /quality/performance returns cached performance", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ measure_id: "measure-1", performance_rate: "88.50" }],
    });

    const res = await request(app).get("/quality/performance?year=2024&quarter=1");

    expect(res.status).toBe(200);
    expect(res.body[0].measure_id).toBe("measure-1");
  });

  it("GET /quality/performance calculates performance when missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "measure-1",
            measure_code: "Q1",
            measure_name: "Measure 1",
            category: "quality",
            description: "desc-1",
          },
          {
            id: "measure-2",
            measure_code: "Q2",
            measure_name: "Measure 2",
            category: "quality",
            description: "desc-2",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ numerator_count: "1", denominator_count: "2", exclusion_count: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [{ numerator_count: "0", denominator_count: "0", exclusion_count: "0" }],
      });

    const res = await request(app).get(
      "/quality/performance?startDate=2025-01-01&endDate=2025-12-31"
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].performance_rate).toBe("50.00");
    expect(res.body[1].performance_rate).toBe("0.00");
  });

  it("POST /quality/submit requires year, quarter, and measures", async () => {
    const res = await request(app).post("/quality/submit").send({ year: 2024 });

    expect(res.status).toBe(400);
  });

  it("POST /quality/submit stores submission", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "submission-1", status: "submitted" }] });

    const res = await request(app).post("/quality/submit").send({
      year: 2024,
      quarter: 1,
      measures: [{ measureId: "measure-1", numerator: 10, denominator: 12 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("submission-1");
  });

  it("GET /quality/reports/mips requires year", async () => {
    const res = await request(app).get("/quality/reports/mips");

    expect(res.status).toBe(400);
  });

  it("GET /quality/reports/mips aggregates scores", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ score: "50" }, { score: "100" }],
    });

    const res = await request(app).get("/quality/reports/mips?year=2024");

    expect(res.status).toBe(200);
    expect(res.body.total_submissions).toBe(2);
    expect(res.body.average_score).toBe(75);
  });

  it("GET /quality/reports/pqrs groups by category", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { category: "A", performance_rate: "80" },
        { category: "B", performance_rate: "90" },
        { category: "A", performance_rate: "70" },
      ],
    });

    const res = await request(app).get("/quality/reports/pqrs?year=2024");

    expect(res.status).toBe(200);
    expect(res.body.performance_by_category.A).toHaveLength(2);
    expect(res.body.performance_by_category.B).toHaveLength(1);
  });

  it("GET /quality/gap-closure returns open gaps by default", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "gap-1" }] });

    const res = await request(app).get("/quality/gap-closure?priority=high");

    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe("gap-1");
  });

  it("POST /quality/gap-closure/:id/close returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/quality/gap-closure/gap-1/close")
      .send({ interventionNotes: "done" });

    expect(res.status).toBe(404);
  });

  it("POST /quality/gap-closure/:id/close closes gap", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "gap-1", status: "closed" }] });

    const res = await request(app)
      .post("/quality/gap-closure/gap-1/close")
      .send({ interventionNotes: "done" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("closed");
  });

  it("POST /quality/recalculate requires date range", async () => {
    const res = await request(app).post("/quality/recalculate").send({ startDate: "2025-01-01" });

    expect(res.status).toBe(400);
  });

  it("POST /quality/recalculate recalculates measures", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "measure-1",
            measure_code: "Q1",
            measure_name: "Measure 1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            numerator_count: "1",
            denominator_count: "2",
            exclusion_count: "0",
            patient_list: [],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/quality/recalculate").send({
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.recalculated).toBe(1);
    expect(res.body.results[0].performance_rate).toBe("50.00");
  });
});
