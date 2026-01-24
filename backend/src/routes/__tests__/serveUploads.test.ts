import request from "supertest";
import express from "express";
import fs from "fs";
import path from "path";
import { serveUploadsRouter } from "../serveUploads";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use("/uploads", serveUploadsRouter);

const uploadDir = path.join(process.cwd(), "uploads");
const testFilePath = path.join(uploadDir, "test.txt");
const auditMock = auditLog as jest.Mock;

beforeAll(() => {
  fs.mkdirSync(uploadDir, { recursive: true });
});

afterEach(() => {
  auditMock.mockClear();
});

afterAll(() => {
  if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
  }
});

describe("Serve uploads routes", () => {
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
});
