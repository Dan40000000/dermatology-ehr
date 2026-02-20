import request from "supertest";
import express from "express";
import crypto from "crypto";
import { pharmaciesRouter } from "../pharmacies";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
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

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    randomUUID: jest.fn(() => "test-uuid"),
  };
});

const app = express();
app.use(express.json());
app.use("/api/pharmacies", pharmaciesRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Pharmacies routes", () => {
  describe("GET /api/pharmacies/search", () => {
    it("should return pharmacies with search query", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pharmacy-1",
            name: "CVS Pharmacy",
            ncpdp_id: "1234567",
            surescripts_enabled: true,
          },
        ],
      });

      const res = await request(app).get("/api/pharmacies/search").query({ query: "CVS" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it("should search by ncpdp id", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", ncpdp_id: "1234567" }],
      });

      const res = await request(app).get("/api/pharmacies/search").query({ ncpdpId: "1234567" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should search by city", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", city: "New York" }],
      });

      const res = await request(app).get("/api/pharmacies/search").query({ city: "New York" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should search by state", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", state: "NY" }],
      });

      const res = await request(app).get("/api/pharmacies/search").query({ state: "ny" });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(["NY"]));
    });

    it("should search by zip", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", zip: "10001" }],
      });

      const res = await request(app).get("/api/pharmacies/search").query({ zip: "10001" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should search by chain", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", chain: "CVS" }],
      });

      const res = await request(app).get("/api/pharmacies/search").query({ chain: "CVS" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should filter by preferred", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", is_preferred: true }],
      });

      const res = await request(app).get("/api/pharmacies/search").query({ preferred: "true" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should combine multiple filters", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1" }],
      });

      const res = await request(app)
        .get("/api/pharmacies/search")
        .query({ query: "CVS", city: "New York", state: "NY", preferred: "true" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/pharmacies/search");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to search pharmacies");
      expect(loggerMock.error).toHaveBeenCalledWith("Error searching pharmacies", {
        error: "Database error",
      });
    });

    it("should mask non-Error values on search failures", async () => {
      queryMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

      const res = await request(app).get("/api/pharmacies/search");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to search pharmacies");
      expect(loggerMock.error).toHaveBeenCalledWith("Error searching pharmacies", {
        error: "Unknown error",
      });
    });
  });

  describe("GET /api/pharmacies/nearby", () => {
    it("should find pharmacies by latitude and longitude", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pharmacy-1",
            name: "CVS Pharmacy",
            distance: 2.5,
            latitude: 40.7128,
            longitude: -74.006,
          },
        ],
      });

      const res = await request(app)
        .get("/api/pharmacies/nearby")
        .query({ latitude: "40.7128", longitude: "-74.0060" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
      expect(res.body.pharmacies[0].distance).toBe(2.5);
    });

    it("should use custom radius", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/pharmacies/nearby")
        .query({ latitude: "40.7128", longitude: "-74.0060", radius: "5" });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([40.7128, -74.006, 5]));
    });

    it("should default to 10 mile radius", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/pharmacies/nearby")
        .query({ latitude: "40.7128", longitude: "-74.0060" });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([40.7128, -74.006, 10]));
    });

    it("should find pharmacies by city and state", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", city: "New York", state: "NY" }],
      });

      const res = await request(app)
        .get("/api/pharmacies/nearby")
        .query({ city: "New York", state: "NY" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should find pharmacies by zip code", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", zip: "10001" }],
      });

      const res = await request(app).get("/api/pharmacies/nearby").query({ zip: "10001" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should return 400 when no search criteria provided", async () => {
      const res = await request(app).get("/api/pharmacies/nearby");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Must provide either latitude/longitude, city/state, or zip code");
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .get("/api/pharmacies/nearby")
        .query({ latitude: "40.7128", longitude: "-74.0060" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to find nearby pharmacies");
    });
  });

  describe("GET /api/pharmacies", () => {
    it("should return all pharmacies", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          { id: "pharmacy-1", name: "CVS Pharmacy" },
          { id: "pharmacy-2", name: "Walgreens" },
        ],
      });

      const res = await request(app).get("/api/pharmacies");

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(2);
    });

    it("should search by name or ncpdp", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", name: "CVS Pharmacy" }],
      });

      const res = await request(app).get("/api/pharmacies").query({ search: "CVS" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should filter by city", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", city: "New York" }],
      });

      const res = await request(app).get("/api/pharmacies").query({ city: "New York" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should filter by state", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", state: "NY" }],
      });

      const res = await request(app).get("/api/pharmacies").query({ state: "NY" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should filter by zip", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", zip: "10001" }],
      });

      const res = await request(app).get("/api/pharmacies").query({ zip: "10001" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should filter by preferred", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", is_preferred: true }],
      });

      const res = await request(app).get("/api/pharmacies").query({ preferred: "true" });

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(1);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/pharmacies");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch pharmacies");
    });
  });

  describe("GET /api/pharmacies/list/preferred", () => {
    it("should return preferred pharmacies", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          { id: "pharmacy-1", name: "CVS Pharmacy", is_preferred: true },
          { id: "pharmacy-2", name: "Walgreens", is_preferred: true },
        ],
      });

      const res = await request(app).get("/api/pharmacies/list/preferred");

      expect(res.status).toBe(200);
      expect(res.body.pharmacies).toHaveLength(2);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/pharmacies/list/preferred");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch preferred pharmacies");
    });
  });

  describe("GET /api/pharmacies/ncpdp/:ncpdpId", () => {
    it("should return pharmacy by ncpdp id", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", ncpdp_id: "1234567", name: "CVS Pharmacy" }],
      });

      const res = await request(app).get("/api/pharmacies/ncpdp/1234567");

      expect(res.status).toBe(200);
      expect(res.body.pharmacy.ncpdp_id).toBe("1234567");
    });

    it("should return 404 when pharmacy not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/pharmacies/ncpdp/1234567");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Pharmacy not found");
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/pharmacies/ncpdp/1234567");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch pharmacy");
    });
  });

  describe("GET /api/pharmacies/:id", () => {
    it("should return pharmacy by id", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1", name: "CVS Pharmacy" }],
      });

      const res = await request(app).get("/api/pharmacies/pharmacy-1");

      expect(res.status).toBe(200);
      expect(res.body.pharmacy.id).toBe("pharmacy-1");
    });

    it("should return 404 when pharmacy not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/pharmacies/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Pharmacy not found");
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/api/pharmacies/pharmacy-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch pharmacy");
    });
  });

  describe("POST /api/pharmacies", () => {
    const validPayload = {
      ncpdpId: "1234567",
      name: "CVS Pharmacy",
      phone: "555-1234",
      fax: "555-5678",
      street: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
      isPreferred: true,
      is24Hour: false,
      acceptsErx: true,
    };

    it("should create new pharmacy", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/pharmacies").send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("test-uuid");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into pharmacies"),
        expect.arrayContaining([
          "test-uuid",
          "1234567",
          "CVS Pharmacy",
          "555-1234",
          "555-5678",
          "123 Main St",
          "New York",
          "NY",
          "10001",
          true,
          false,
          true,
        ])
      );
    });

    it("should validate required fields", async () => {
      const res = await request(app).post("/api/pharmacies").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("should validate name is not empty", async () => {
      const res = await request(app).post("/api/pharmacies").send({ name: "" });

      expect(res.status).toBe(400);
    });

    it("should validate state max length", async () => {
      const res = await request(app).post("/api/pharmacies").send({ ...validPayload, state: "NYY" });

      expect(res.status).toBe(400);
    });

    it("should allow minimal payload with just name", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/pharmacies").send({ name: "CVS Pharmacy" });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("test-uuid");
    });

    it("should default booleans", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/pharmacies").send({ name: "CVS Pharmacy" });

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([false, false, true])
      );
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).post("/api/pharmacies").send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to create pharmacy");
    });
  });

  describe("PUT /api/pharmacies/:id", () => {
    it("should update pharmacy", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1" }],
      });

      const res = await request(app).put("/api/pharmacies/pharmacy-1").send({ name: "New Name" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe("pharmacy-1");
    });

    it("should update multiple fields", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1" }],
      });

      const res = await request(app)
        .put("/api/pharmacies/pharmacy-1")
        .send({ name: "New Name", phone: "555-1234", isPreferred: true });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE pharmacies"),
        expect.arrayContaining(["New Name", "555-1234", true, "pharmacy-1"])
      );
    });

    it("should return 400 when no fields to update", async () => {
      const res = await request(app).put("/api/pharmacies/pharmacy-1").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No fields to update");
    });

    it("should return 404 when pharmacy not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/api/pharmacies/nonexistent").send({ name: "New Name" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Pharmacy not found");
    });

    it("should validate state max length", async () => {
      const res = await request(app).put("/api/pharmacies/pharmacy-1").send({ state: "NYY" });

      expect(res.status).toBe(400);
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).put("/api/pharmacies/pharmacy-1").send({ name: "New Name" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to update pharmacy");
    });

    it("should convert camelCase to snake_case", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pharmacy-1" }],
      });

      const res = await request(app).put("/api/pharmacies/pharmacy-1").send({ isPreferred: true });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("is_preferred"),
        expect.any(Array)
      );
    });
  });

  describe("DELETE /api/pharmacies/:id", () => {
    it("should delete pharmacy", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "pharmacy-1" }] });

      const res = await request(app).delete("/api/pharmacies/pharmacy-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 400 when pharmacy is used in prescriptions", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: "5" }] });

      const res = await request(app).delete("/api/pharmacies/pharmacy-1");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cannot delete pharmacy that is referenced in prescriptions");
    });

    it("should return 404 when pharmacy not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] }).mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/api/pharmacies/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Pharmacy not found");
    });

    it("should handle database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).delete("/api/pharmacies/pharmacy-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to delete pharmacy");
    });
  });
});
