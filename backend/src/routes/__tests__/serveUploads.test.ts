import request from "supertest";
import express from "express";
import fs from "fs";
import path from "path";
import { serveUploadsRouter } from "../serveUploads";
import { auditLog } from "../../services/audit";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/uploads", serveUploadsRouter);

const uploadDir = path.join(process.cwd(), "uploads");
const testFilePath = path.join(uploadDir, "test.txt");
const auditMock = auditLog as jest.Mock;
const poolQueryMock = pool.query as jest.Mock;

beforeAll(() => {
  fs.mkdirSync(uploadDir, { recursive: true });
});

afterEach(() => {
  auditMock.mockClear();
  poolQueryMock.mockReset();
  poolQueryMock.mockResolvedValue({ rowCount: 1, rows: [{}] });
});

afterAll(() => {
  if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
  }
});

describe("Serve uploads routes", () => {
  beforeEach(() => {
    poolQueryMock.mockResolvedValue({ rowCount: 1, rows: [{}] });
  });

  it("POST /uploads/sign rejects missing key", async () => {
    const res = await request(app).post("/uploads/sign").send({});

    expect(res.status).toBe(400);
  });

  it("POST /uploads/sign returns token and url", async () => {
    const res = await request(app).post("/uploads/sign").send({ key: "file.txt" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.url).toContain("file.txt");
  });

  it("POST /uploads/sign rejects unauthorized keys", async () => {
    poolQueryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post("/uploads/sign").send({ key: "file.txt" });

    expect(res.status).toBe(403);
  });

  it("GET /uploads/:key rejects missing token", async () => {
    const res = await request(app).get("/uploads/file.txt");

    expect(res.status).toBe(401);
  });

  it("GET /uploads/:key rejects invalid token", async () => {
    const res = await request(app).get("/uploads/file.txt?token=invalid");

    expect(res.status).toBe(401);
  });

  it("GET /uploads/:key returns 404 when file missing", async () => {
    const signRes = await request(app).post("/uploads/sign").send({ key: "missing.txt" });

    const res = await request(app).get(`/uploads/missing.txt?token=${signRes.body.token}`);

    expect(res.status).toBe(404);
  });

  it("GET /uploads/:key streams file contents", async () => {
    const filename = "test.txt";
    fs.writeFileSync(testFilePath, "hello");

    const signRes = await request(app).post("/uploads/sign").send({ key: filename });
    const res = await request(app).get(`/uploads/${filename}?token=${signRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe("hello");
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /uploads/:key rejects when token key and path key do not match", async () => {
    const signRes = await request(app).post("/uploads/sign").send({ key: "file.txt" });
    const res = await request(app).get(`/uploads/other.txt?token=${signRes.body.token}`);

    expect(res.status).toBe(403);
  });
});
