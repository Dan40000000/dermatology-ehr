import request from "supertest";
import express from "express";
import type { Express } from "express";

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

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

let app: Express;
let queryMock: jest.Mock;
let connectMock: jest.Mock;
let logger: { error: jest.Mock; info: jest.Mock; warn: jest.Mock };

const setupApp = () => {
  jest.resetModules();

  let labVendorsRouter: any;
  let pool: any;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    labVendorsRouter = require("../labVendors").labVendorsRouter;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pool = require("../../db/pool").pool;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    logger = require("../../lib/logger").logger;
  });

  app = express();
  app.use(express.json());
  app.use("/lab-vendors", labVendorsRouter);

  queryMock = pool.query as jest.Mock;
  connectMock = pool.connect as jest.Mock;
};

beforeEach(() => {
  setupApp();
  queryMock.mockReset();
  connectMock.mockReset();
  (logger.error as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Lab vendors routes", () => {
  it("GET /lab-vendors returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "vendor-1" }] });
    const res = await request(app).get("/lab-vendors?vendor_type=ref&active_only=true");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /lab-vendors returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/lab-vendors");
    expect(res.status).toBe(500);
  });

  it("GET /lab-vendors/catalog returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "test-1" }] });
    const res = await request(app).get("/lab-vendors/catalog?search=cbc&active_only=true");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /lab-vendors/catalog returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/lab-vendors/catalog");
    expect(res.status).toBe(500);
  });

  it("GET /lab-vendors/order-sets returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "set-1" }] });
    const res = await request(app).get("/lab-vendors/order-sets?category=Derm");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /lab-vendors/categories returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ category: "Derm" }] });
    const res = await request(app).get("/lab-vendors/categories");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /lab-vendors/order-sets creates order set", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "set-1" }] }) // insert order set
      .mockResolvedValueOnce({ rows: [] }) // insert tests
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/lab-vendors/order-sets").send({
      name: "Derm Panel",
      category: "Derm",
      tests: [{ test_id: "test-1", is_required: true }],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("set-1");
  });

  it("POST /lab-vendors/order-sets returns 500 on error", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("boom"));
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/lab-vendors/order-sets").send({ name: "Set" });
    expect(res.status).toBe(500);
  });
});
