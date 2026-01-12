import request from "supertest";
import express from "express";
import { labResultsRouter } from "../labResults";
import { pool } from "../../db/pool";
import { HL7Service } from "../../services/hl7Service";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../../services/hl7Service", () => ({
  HL7Service: {
    parseLabResultMessage: jest.fn(),
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/lab-results", labResultsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const parseMock = (HL7Service.parseLabResultMessage as jest.Mock);

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  parseMock.mockReset();
  (logger.error as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Lab results routes", () => {
  it("GET /lab-results returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "result-1" }] });
    const res = await request(app).get("/lab-results?abnormal_only=true");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /lab-results returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/lab-results");
    expect(res.status).toBe(500);
  });

  it("GET /lab-results/trends returns stats", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { result_value_numeric: "2", test_name: "Test", result_unit: "mg", reference_range_low: 1, reference_range_high: 5, reference_range_text: "1-5" },
        { result_value_numeric: "4" },
      ],
    });
    const res = await request(app).get("/lab-results/trends/p1/T1?months=6");
    expect(res.status).toBe(200);
    expect(res.body.statistics).toBeTruthy();
  });

  it("POST /lab-results/ingest rejects missing payload", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/lab-results/ingest").send({});
    expect(res.status).toBe(400);
  });

  it("POST /lab-results/ingest ingests manual results", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "order-1", patient_id: "p1" }] }) // find order
      .mockResolvedValueOnce({ rows: [{ id: "res-1" }] }) // insert result
      .mockResolvedValueOnce({ rows: [] }) // update lab_order_tests
      .mockResolvedValueOnce({ rows: [] }) // update lab_orders
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/lab-results/ingest").send({
      manual_results: {
        lab_order_id: "order-1",
        results: [
          {
            orderId: "order-1",
            observations: [
              {
                testCode: "T1",
                testName: "Test",
                value: "5",
                referenceRange: "1-10",
                units: "mg",
                abnormalFlags: [],
              },
            ],
          },
        ],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
  });

  it("POST /lab-results/ingest ingests HL7 results", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "order-1", patient_id: "p1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "res-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    parseMock.mockReturnValueOnce({
      messageControlId: "MSG1",
      results: [
        {
          orderId: "order-1",
          observations: [
            { testCode: "T1", testName: "Test", value: "3", referenceRange: "1-5", units: "mg" },
          ],
        },
      ],
    });

    const res = await request(app).post("/lab-results/ingest").send({ hl7_message: "HL7" });
    expect(res.status).toBe(201);
  });

  it("POST /lab-results/:id/acknowledge acknowledges", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1" }] });
    const res = await request(app).post("/lab-results/result-1/acknowledge").send({ comments: "ok" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Results acknowledged");
  });

  it("GET /lab-results/critical returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "crit-1" }] });
    const res = await request(app).get("/lab-results/critical");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /lab-results/critical/:id/acknowledge returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/lab-results/critical/crit-1/acknowledge").send({});
    expect(res.status).toBe(404);
  });

  it("POST /lab-results/critical/:id/acknowledge returns row", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "crit-1" }] });
    const res = await request(app).post("/lab-results/critical/crit-1/acknowledge").send({
      notification_method: "phone",
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("crit-1");
  });
});
