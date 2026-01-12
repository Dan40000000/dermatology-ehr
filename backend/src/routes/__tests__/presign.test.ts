import request from "supertest";
import express from "express";
import { presignRouter } from "../presign";
import { presignUpload } from "../../services/presign";
import { fetchObjectBuffer, getSignedObjectUrl } from "../../services/s3";
import { scanBuffer } from "../../services/virusScan";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/presign", () => ({
  presignUpload: jest.fn(),
}));

jest.mock("../../services/s3", () => ({
  fetchObjectBuffer: jest.fn(),
  getSignedObjectUrl: jest.fn(),
}));

jest.mock("../../services/virusScan", () => ({
  scanBuffer: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/presign", presignRouter);

const presignMock = presignUpload as jest.Mock;
const fetchMock = fetchObjectBuffer as jest.Mock;
const getUrlMock = getSignedObjectUrl as jest.Mock;
const scanMock = scanBuffer as jest.Mock;

const originalBucket = process.env.AWS_S3_BUCKET;

beforeEach(() => {
  presignMock.mockReset();
  fetchMock.mockReset();
  getUrlMock.mockReset();
  scanMock.mockReset();
  delete process.env.AWS_S3_BUCKET;
});

afterEach(() => {
  if (originalBucket) {
    process.env.AWS_S3_BUCKET = originalBucket;
  } else {
    delete process.env.AWS_S3_BUCKET;
  }
});

describe("Presign routes", () => {
  it("POST /presign/s3 rejects invalid payload", async () => {
    const res = await request(app).post("/presign/s3").send({});
    expect(res.status).toBe(400);
  });

  it("POST /presign/s3 rejects when S3 not configured", async () => {
    const res = await request(app).post("/presign/s3").send({
      contentType: "image/png",
      filename: "test.png",
    });
    expect(res.status).toBe(400);
  });

  it("POST /presign/s3 returns signed upload", async () => {
    process.env.AWS_S3_BUCKET = "bucket";
    presignMock.mockResolvedValueOnce({ url: "signed", fields: { key: "k" } });
    const res = await request(app).post("/presign/s3").send({
      contentType: "image/png",
      filename: "test.png",
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("signed");
  });

  it("POST /presign/s3/complete rejects when scan fails", async () => {
    process.env.AWS_S3_BUCKET = "bucket";
    fetchMock.mockResolvedValueOnce(Buffer.from("data"));
    scanMock.mockResolvedValueOnce(false);
    const res = await request(app).post("/presign/s3/complete").send({ key: "obj", contentType: "image/png" });
    expect(res.status).toBe(400);
  });

  it("POST /presign/s3/complete returns signed url", async () => {
    process.env.AWS_S3_BUCKET = "bucket";
    fetchMock.mockResolvedValueOnce(Buffer.from("data"));
    scanMock.mockResolvedValueOnce(true);
    getUrlMock.mockResolvedValueOnce("signed-url");
    const res = await request(app).post("/presign/s3/complete").send({ key: "obj", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("signed-url");
  });

  it("POST /presign/s3/complete returns 500 on error", async () => {
    process.env.AWS_S3_BUCKET = "bucket";
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).post("/presign/s3/complete").send({ key: "obj", contentType: "image/png" });
    expect(res.status).toBe(500);
  });

  it("GET /presign/s3/access/:key rejects when S3 not configured", async () => {
    const res = await request(app).get("/presign/s3/access/file%20name.pdf");
    expect(res.status).toBe(400);
  });

  it("GET /presign/s3/access/:key returns signed url", async () => {
    process.env.AWS_S3_BUCKET = "bucket";
    getUrlMock.mockResolvedValueOnce("signed-access");
    const res = await request(app).get("/presign/s3/access/file%20name.pdf");
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("signed-access");
  });
});
