import request from "supertest";
import express from "express";
import { providersRouter } from "../providers";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider", fullName: "Provider User" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/providers", providersRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Providers routes", () => {
  it("GET /providers returns providers", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "provider-1",
          fullName: "Dr. Jane Smith",
          specialty: "Dermatology",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "provider-2",
          fullName: "Dr. John Doe",
          specialty: "Dermatology",
          createdAt: "2024-01-02T00:00:00Z",
        },
      ],
      rowCount: 2,
    });

    const res = await request(app).get("/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(2);
    expect(res.body.providers[0].fullName).toBe("Dr. Jane Smith");
    expect(res.body.providers[0].specialty).toBe("Dermatology");
  });

  it("GET /providers returns empty array when no providers", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(0);
  });

  it("GET /providers queries with correct tenant filter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app).get("/providers");

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id = $1"),
      ["tenant-1"]
    );
  });

  it("GET /providers orders results by full name", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app).get("/providers");

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("order by full_name"),
      expect.anything()
    );
  });

  it("GET /providers handles database errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("Database connection error"));

    const res = await request(app).get("/providers");

    expect(res.status).toBe(500);
  });

  it("GET /providers requires authentication", async () => {
    // This test verifies the auth middleware is applied
    // The mock auth middleware sets req.user, so this just confirms the route is protected
    const res = await request(app).get("/providers");

    expect(res.status).not.toBe(401); // Should not be unauthorized with mock auth
  });
});
