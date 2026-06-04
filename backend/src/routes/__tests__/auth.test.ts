import request from "supertest";
import express from "express";
import { authRouter } from "../auth";
import { userStore } from "../../services/userStore";
import { issueTokens, rotateRefreshToken } from "../../services/authService";
import bcrypt from "bcryptjs";
import { logger } from "../../lib/logger";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin", fullName: "Admin" };
    return next();
  },
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/userStore", () => ({
  userStore: {
    findByEmailAndTenant: jest.fn(),
    listByTenant: jest.fn(),
    mask: jest.fn((user: any) => ({
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      secondaryRoles: user.secondaryRoles || [],
      roles: user.roles || [user.role],
    })),
  },
}));

jest.mock("../../services/authService", () => ({
  issueTokens: jest.fn(),
  revokeRefreshToken: jest.fn(),
  revokeRefreshTokensForUser: jest.fn(),
  rotateRefreshToken: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("bcryptjs", () => ({
  compareSync: jest.fn(),
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
app.use("/auth", authRouter);

const findUserMock = userStore.findByEmailAndTenant as jest.Mock;
const listUsersMock = userStore.listByTenant as jest.Mock;
const issueTokensMock = issueTokens as jest.Mock;
const rotateRefreshMock = rotateRefreshToken as jest.Mock;
const compareMock = bcrypt.compareSync as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;
const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  findUserMock.mockReset();
  listUsersMock.mockReset();
  issueTokensMock.mockReset();
  rotateRefreshMock.mockReset();
  compareMock.mockReset();
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  loggerMock.error.mockReset();
});

describe("Auth routes", () => {
  it("POST /auth/login rejects missing tenant header", async () => {
    const res = await request(app).post("/auth/login").send({ email: "a@b.com", password: "Password123!" });
    expect(res.status).toBe(400);
  });

  it("POST /auth/login rejects invalid payload", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("POST /auth/login rejects missing user", async () => {
    findUserMock.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "a@b.com", password: "Password123!" });
    expect(res.status).toBe(401);
  });

  it("POST /auth/login rejects invalid password", async () => {
    findUserMock.mockResolvedValueOnce({ id: "user-1", tenantId: "tenant-1", email: "a@b.com", role: "admin", passwordHash: "hash" });
    compareMock.mockReturnValueOnce(false);
    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "a@b.com", password: "Password123!" });
    expect(res.status).toBe(401);
  });

  it("POST /auth/login locks staff after the fifth failed password attempt", async () => {
    findUserMock.mockResolvedValueOnce({ id: "user-1", tenantId: "tenant-1", email: "a@b.com", role: "admin", passwordHash: "hash" });
    compareMock.mockReturnValueOnce(false);
    queryMock
      .mockResolvedValueOnce({ rows: [{ failedLoginAttempts: 4, lockedAt: null }] })
      .mockResolvedValueOnce({ rows: [{ failedLoginAttempts: 5, lockedAt: "2026-06-03T12:00:00.000Z" }] });

    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "a@b.com", password: "Password123!" });

    expect(res.status).toBe(423);
    expect(res.body.adminResetRequired).toBe(true);
    expect(queryMock.mock.calls[1][0]).toContain("login_locked_at");
  });

  it("POST /auth/login rejects staff accounts already locked by failed attempts", async () => {
    findUserMock.mockResolvedValueOnce({ id: "user-1", tenantId: "tenant-1", email: "a@b.com", role: "admin", passwordHash: "hash" });
    queryMock.mockResolvedValueOnce({ rows: [{ failedLoginAttempts: 5, lockedAt: "2026-06-03T12:00:00.000Z" }] });

    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "a@b.com", password: "Password123!" });

    expect(res.status).toBe(423);
    expect(res.body.locked).toBe(true);
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("POST /auth/login returns tokens", async () => {
    findUserMock.mockResolvedValueOnce({
      id: "user-1",
      tenantId: "tenant-1",
      email: "a@b.com",
      role: "provider",
      secondaryRoles: ["admin"],
      roles: ["provider", "admin"],
      passwordHash: "hash",
    });
    compareMock.mockReturnValueOnce(true);
    issueTokensMock.mockResolvedValueOnce({ accessToken: "access", refreshToken: "refresh" });
    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "a@b.com", password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBe("__http_only_cookie__");
    expect(res.body.tokens.refreshToken).toBe("__http_only_cookie__");
    expect(res.headers["set-cookie"]?.join(";")).toContain("derm_staff_access=");
    expect(res.body.user.roles).toEqual(["provider", "admin"]);
  });

  it("POST /auth/login logs safe error on failure", async () => {
    findUserMock.mockRejectedValueOnce(new Error("login exploded"));

    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "a@b.com", password: "Password123!" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Login failed");
    expect(loggerMock.error).toHaveBeenCalledWith("Login error:", {
      error: "login exploded",
    });
  });

  it("POST /auth/login masks non-Error failures", async () => {
    findUserMock.mockRejectedValueOnce({ email: "a@b.com" });

    const res = await request(app)
      .post("/auth/login")
      .set("x-tenant-id", "tenant-1")
      .send({ email: "a@b.com", password: "Password123!" });

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Login error:", {
      error: "Unknown error",
    });
  });

  it("POST /auth/refresh rejects missing refresh token", async () => {
    const res = await request(app).post("/auth/refresh").send({});
    expect(res.status).toBe(400);
  });

  it("POST /auth/refresh rejects invalid token", async () => {
    rotateRefreshMock.mockResolvedValueOnce(null);
    const res = await request(app).post("/auth/refresh").send({ refreshToken: "bad-token-123456" });
    expect(res.status).toBe(401);
  });

  it("POST /auth/refresh returns rotated tokens", async () => {
    rotateRefreshMock.mockResolvedValueOnce({
      tokens: { accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 900 },
      user: { id: "user-1", tenantId: "tenant-1", role: "admin", roles: ["admin"] },
    });
    const res = await request(app).post("/auth/refresh").send({ refreshToken: "good-token-123456" });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBe("__http_only_cookie__");
    expect(res.body.tokens.refreshToken).toBe("__http_only_cookie__");
    expect(res.headers["set-cookie"]?.join(";")).toContain("derm_staff_access=");
  });

  it("GET /auth/me returns current user", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeTruthy();
  });

  it("GET /auth/users returns tenant users", async () => {
    listUsersMock.mockResolvedValueOnce([{ id: "user-1", tenantId: "tenant-1", email: "a@b.com", role: "admin" }]);
    const res = await request(app).get("/auth/users");
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
  });

  it("GET /auth/users can return workforce users only", async () => {
    listUsersMock.mockResolvedValueOnce([
      { id: "user-1", tenantId: "tenant-1", email: "admin@example.com", role: "admin" },
      { id: "user-2", tenantId: "tenant-1", email: "front@example.com", role: "front_desk" },
      { id: "user-3", tenantId: "tenant-1", email: "patient@example.com", role: "patient_portal" },
    ]);

    const res = await request(app).get("/auth/users?workforceOnly=true");

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users.map((user: any) => user.id)).toEqual(["user-1", "user-2"]);
  });
});
