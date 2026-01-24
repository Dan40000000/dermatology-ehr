import request from "supertest";
import express from "express";
import { patientPortalRouter } from "../patientPortal";
import { pool } from "../../db/pool";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

jest.mock("../../config/env", () => ({
  env: {
    jwtSecret: "test-secret",
    tenantHeader: "x-tenant-id",
    nodeEnv: "development",
  },
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../middleware/patientPortalAuth", () => ({
  requirePatientAuth: (req: any, _res: any, next: any) => {
    req.patient = {
      tenantId: "tenant-1",
      patientId: "patient-1",
      accountId: "account-1",
    };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/patient-portal", patientPortalRouter);

const queryMock = pool.query as jest.Mock;
const hashMock = bcrypt.hash as jest.Mock;
const compareMock = bcrypt.compare as jest.Mock;
const jwtSignMock = jwt.sign as jest.Mock;

const tenantHeader = "x-tenant-id";

beforeEach(() => {
  process.env.NODE_ENV = "development";
  queryMock.mockReset();
  hashMock.mockReset();
  compareMock.mockReset();
  jwtSignMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  hashMock.mockResolvedValue("hashed-password");
  compareMock.mockResolvedValue(true);
  jwtSignMock.mockReturnValue("jwt-token");
});

describe("Patient portal routes", () => {
  it("POST /patient-portal/register rejects missing tenant header", async () => {
    const res = await request(app).post("/patient-portal/register").send({});

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/register rejects invalid payload", async () => {
    const res = await request(app)
      .post("/patient-portal/register")
      .set(tenantHeader, "tenant-1")
      .send({});

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/register rejects existing email", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "account-1" }] });

    const res = await request(app)
      .post("/patient-portal/register")
      .set(tenantHeader, "tenant-1")
      .send({
        email: "patient@example.com",
        password: "C0mpl3x!Health",
        firstName: "Pat",
        lastName: "Ent",
        dob: "1990-01-01",
      });

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/register rejects missing patient match", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal/register")
      .set(tenantHeader, "tenant-1")
      .send({
        email: "patient@example.com",
        password: "C0mpl3x!Health",
        firstName: "Pat",
        lastName: "Ent",
        dob: "1990-01-01",
      });

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/register creates account", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal/register")
      .set(tenantHeader, "tenant-1")
      .send({
        email: "patient@example.com",
        password: "C0mpl3x!Health",
        firstName: "Pat",
        lastName: "Ent",
        dob: "1990-01-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.accountId).toBeDefined();
    expect(res.body.verificationToken).toBeDefined();
  });

  it("POST /patient-portal/login rejects missing tenant header", async () => {
    const res = await request(app).post("/patient-portal/login").send({});

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/login rejects invalid payload", async () => {
    const res = await request(app)
      .post("/patient-portal/login")
      .set(tenantHeader, "tenant-1")
      .send({});

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/login rejects missing account", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal/login")
      .set(tenantHeader, "tenant-1")
      .send({ email: "patient@example.com", password: "C0mpl3x!Health" });

    expect(res.status).toBe(401);
  });

  it("POST /patient-portal/login rejects inactive account", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "account-1",
          patient_id: "patient-1",
          email: "patient@example.com",
          password_hash: "hash",
          is_active: false,
          email_verified: true,
          failed_login_attempts: 0,
          locked_until: null,
          first_name: "Pat",
          last_name: "Ent",
        },
      ],
    });

    const res = await request(app)
      .post("/patient-portal/login")
      .set(tenantHeader, "tenant-1")
      .send({ email: "patient@example.com", password: "C0mpl3x!Health" });

    expect(res.status).toBe(403);
  });

  it("POST /patient-portal/login rejects locked account", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "account-1",
          patient_id: "patient-1",
          email: "patient@example.com",
          password_hash: "hash",
          is_active: true,
          email_verified: true,
          failed_login_attempts: 4,
          locked_until: new Date(Date.now() + 60_000).toISOString(),
          first_name: "Pat",
          last_name: "Ent",
        },
      ],
    });

    const res = await request(app)
      .post("/patient-portal/login")
      .set(tenantHeader, "tenant-1")
      .send({ email: "patient@example.com", password: "C0mpl3x!Health" });

    expect(res.status).toBe(403);
  });

  it("POST /patient-portal/login tracks failed attempts", async () => {
    compareMock.mockResolvedValueOnce(false);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "account-1",
          patient_id: "patient-1",
          email: "patient@example.com",
          password_hash: "hash",
          is_active: true,
          email_verified: true,
          failed_login_attempts: 1,
          locked_until: null,
          first_name: "Pat",
          last_name: "Ent",
        },
      ],
    });

    const res = await request(app)
      .post("/patient-portal/login")
      .set(tenantHeader, "tenant-1")
      .send({ email: "patient@example.com", password: "C0mpl3x!Health" });

    expect(res.status).toBe(401);
    expect(res.body.attemptsRemaining).toBe(3);
  });

  it("POST /patient-portal/login requires email verification", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "account-1",
          patient_id: "patient-1",
          email: "patient@example.com",
          password_hash: "hash",
          is_active: true,
          email_verified: false,
          failed_login_attempts: 0,
          locked_until: null,
          first_name: "Pat",
          last_name: "Ent",
        },
      ],
    });

    const res = await request(app)
      .post("/patient-portal/login")
      .set(tenantHeader, "tenant-1")
      .send({ email: "patient@example.com", password: "C0mpl3x!Health" });

    expect(res.status).toBe(403);
    expect(res.body.requiresVerification).toBe(true);
  });

  it("POST /patient-portal/login returns session token", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "account-1",
            patient_id: "patient-1",
            email: "patient@example.com",
            password_hash: "hash",
            is_active: true,
            email_verified: true,
            failed_login_attempts: 0,
            locked_until: null,
            first_name: "Pat",
            last_name: "Ent",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal/login")
      .set(tenantHeader, "tenant-1")
      .send({ email: "patient@example.com", password: "C0mpl3x!Health" });

    expect(res.status).toBe(200);
    expect(res.body.sessionToken).toBe("jwt-token");
  });

  it("POST /patient-portal/logout clears session", async () => {
    const res = await request(app)
      .post("/patient-portal/logout")
      .set("Authorization", "Bearer token-1");

    expect(res.status).toBe(200);
  });

  it("POST /patient-portal/verify-email rejects invalid token", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal/verify-email")
      .set(tenantHeader, "tenant-1")
      .send({ token: "token-1234567890" });

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/verify-email succeeds", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "account-1" }] });

    const res = await request(app)
      .post("/patient-portal/verify-email")
      .set(tenantHeader, "tenant-1")
      .send({ token: "token-1234567890" });

    expect(res.status).toBe(200);
  });

  it("POST /patient-portal/forgot-password returns token in development", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "account-1" }] });

    const res = await request(app)
      .post("/patient-portal/forgot-password")
      .set(tenantHeader, "tenant-1")
      .send({ email: "patient@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeDefined();
  });

  it("POST /patient-portal/reset-password rejects invalid token", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal/reset-password")
      .set(tenantHeader, "tenant-1")
      .send({ token: "token-1234567890", password: "C0mpl3x!Health" });

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal/reset-password resets password", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "account-1", patient_id: "patient-1" }] });

    const res = await request(app)
      .post("/patient-portal/reset-password")
      .set(tenantHeader, "tenant-1")
      .send({ token: "token-1234567890", password: "C0mpl3x!Health" });

    expect(res.status).toBe(200);
  });

  it("GET /patient-portal/me returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/patient-portal/me");

    expect(res.status).toBe(404);
  });

  it("GET /patient-portal/me returns patient data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1" }] });

    const res = await request(app).get("/patient-portal/me");

    expect(res.status).toBe(200);
    expect(res.body.patient.id).toBe("patient-1");
  });

  it("PUT /patient-portal/me rejects empty updates", async () => {
    const res = await request(app).put("/patient-portal/me").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /patient-portal/me updates profile", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1" }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/patient-portal/me")
      .send({ phone: "555-123-4567" });

    expect(res.status).toBe(200);
  });

  it("GET /patient-portal/activity returns activity", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ action: "login" }] });

    const res = await request(app).get("/patient-portal/activity");

    expect(res.status).toBe(200);
    expect(res.body.activity).toHaveLength(1);
  });
});
