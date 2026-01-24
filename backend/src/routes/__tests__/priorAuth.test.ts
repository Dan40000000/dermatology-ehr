import request from "supertest";
import express from "express";
import priorAuthRouter from "../priorAuth";
import { pool } from "../../db/pool";
import { notificationService } from "../../services/integrations/notificationService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "f1111111-1111-4111-8111-111111111111", tenantId: "99999999-9999-4999-8999-999999999999" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/integrations/notificationService", () => ({
  notificationService: {
    sendNotification: jest.fn(),
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

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000000"),
}));

const app = express();
app.use(express.json());
app.use("/api/prior-auth", priorAuthRouter);

// Error handler middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const queryMock = pool.query as jest.Mock;
const notificationServiceMock = notificationService as jest.Mocked<typeof notificationService>;
const loggerMock = logger as jest.Mocked<typeof logger>;
const flushPromises = () => Promise.resolve();
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [] });
  notificationServiceMock.sendNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  process.env.NODE_ENV = originalNodeEnv;
});

describe("Prior Auth Routes", () => {
  describe("GET /api/prior-auth", () => {
    it("should return all prior auth requests", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "b1111111-1111-4111-8111-111111111111",
            patient_id: "a1111111-1111-4111-8111-111111111111",
            medication_name: "Dupixent",
            status: "pending",
          },
        ],
      });

      const res = await request(app).get("/api/prior-auth");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].medication_name).toBe("Dupixent");
    });

    it("should filter by patientId", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth").query({
        patientId: "a1111111-1111-4111-8111-111111111111",
      });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.patient_id = $2"),
        expect.arrayContaining(["99999999-9999-4999-8999-999999999999", "a1111111-1111-4111-8111-111111111111"])
      );
    });

    it("should filter by status", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth").query({
        status: "approved",
      });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.status = $2"),
        expect.arrayContaining(["99999999-9999-4999-8999-999999999999", "approved"])
      );
    });

    it("should filter by providerId", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth").query({
        providerId: "d1111111-1111-4111-8111-111111111111",
      });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.provider_id = $2"),
        expect.arrayContaining(["99999999-9999-4999-8999-999999999999", "d1111111-1111-4111-8111-111111111111"])
      );
    });

    it("should handle multiple filters", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth").query({
        patientId: "a1111111-1111-4111-8111-111111111111",
        status: "approved",
        providerId: "d1111111-1111-4111-8111-111111111111",
      });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.patient_id = $2"),
        expect.arrayContaining(["99999999-9999-4999-8999-999999999999", "a1111111-1111-4111-8111-111111111111", "approved", "d1111111-1111-4111-8111-111111111111"])
      );
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/prior-auth");

      expect(res.status).toBe(500);
    });

    it("should apply search filtering", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth").query({ search: "Dupixent" });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.auth_number ILIKE"),
        expect.arrayContaining(["%Dupixent%"])
      );
    });

    it("should apply pagination when page or limit provided", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth").query({ page: "2", limit: "10" });

      expect(res.status).toBe(200);
      expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("LIMIT"));
      expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("OFFSET"));
    });
  });

  describe("GET /api/prior-auth/:id", () => {
    it("should return single prior auth request", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "b1111111-1111-4111-8111-111111111111",
            patient_id: "a1111111-1111-4111-8111-111111111111",
            first_name: "John",
            last_name: "Doe",
            medication_name: "Dupixent",
          },
        ],
      });

      const res = await request(app).get("/api/prior-auth/b1111111-1111-4111-8111-111111111111");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("b1111111-1111-4111-8111-111111111111");
      expect(res.body.first_name).toBe("John");
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth/b9999999-9999-4999-8999-999999999999");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/prior-auth/b1111111-1111-4111-8111-111111111111");

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/prior-auth", () => {
    it("should create new prior auth request", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "00000000-0000-4000-8000-000000000000", auth_number: "PA-123456-ABC" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth").send({
        patientId: "a1111111-1111-4111-8111-111111111111",
        medicationName: "Dupixent",
        diagnosisCode: "L20.9",
        insuranceName: "Blue Cross",
        providerNpi: "1234567890",
        clinicalJustification: "Patient has severe atopic dermatitis that has not responded to topical therapies.",
        urgency: "routine",
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("00000000-0000-4000-8000-000000000000");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO prior_authorizations"),
        expect.arrayContaining([
          "00000000-0000-4000-8000-000000000000",
          "99999999-9999-4999-8999-999999999999",
          "a1111111-1111-4111-8111-111111111111",
          "Dupixent",
          "L20.9",
        ])
      );
    });

    it("should create task for staff", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-8000-000000000000" }] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app).post("/api/prior-auth").send({
        patientId: "a1111111-1111-4111-8111-111111111111",
        medicationName: "Dupixent",
        diagnosisCode: "L20.9",
        insuranceName: "Blue Cross",
        providerNpi: "1234567890",
        clinicalJustification: "Patient has severe atopic dermatitis.",
        urgency: "stat",
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tasks"),
        expect.arrayContaining([
          expect.anything(),
          "99999999-9999-4999-8999-999999999999",
          "a1111111-1111-4111-8111-111111111111",
          "Submit Prior Authorization",
          expect.stringContaining("Submit prior auth"),
          "open",
          "high",
        ])
      );
    });

    it("should return 400 for validation errors", async () => {
      const res = await request(app).post("/api/prior-auth").send({
        patientId: "a1111111-1111-4111-8111-111111111111",
        // missing required fields
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/prior-auth").send({
        patientId: "a1111111-1111-4111-8111-111111111111",
        medicationName: "Dupixent",
        diagnosisCode: "L20.9",
        insuranceName: "Blue Cross",
        providerNpi: "1234567890",
        clinicalJustification: "Patient has severe atopic dermatitis.",
      });

      expect(res.status).toBe(500);
    });

    it("should validate modern payload requirements", async () => {
      const res = await request(app).post("/api/prior-auth").send({
        patientId: "a1111111-1111-4111-8111-111111111111",
        authType: "service",
        // missing serviceDescription
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
    });
  });

  describe("PATCH /api/prior-auth/:id", () => {
    it("should update prior auth status", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "approved" }],
      });

      const res = await request(app).patch("/api/prior-auth/b1111111-1111-4111-8111-111111111111").send({
        status: "approved",
        insuranceAuthNumber: "AUTH-123",
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("approved");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE prior_authorizations"),
        expect.arrayContaining(["approved"])
      );
    });

    it("should set submitted_at when status is submitted", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "submitted" }],
      });

      await request(app).patch("/api/prior-auth/b1111111-1111-4111-8111-111111111111").send({
        status: "submitted",
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("submitted_at = $2"),
        expect.arrayContaining(["submitted", expect.any(String)])
      );
    });

    it("should set approved_at when status is approved", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "approved" }],
      });

      await request(app).patch("/api/prior-auth/b1111111-1111-4111-8111-111111111111").send({
        status: "approved",
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("approved_at = $2"),
        expect.anything()
      );
    });

    it("should set denied_at when status is denied", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "denied" }],
      });

      await request(app).patch("/api/prior-auth/b1111111-1111-4111-8111-111111111111").send({
        status: "denied",
        denialReason: "Step therapy required",
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("denied_at = $2"),
        expect.anything()
      );
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).patch("/api/prior-auth/b9999999-9999-4999-8999-999999999999").send({
        status: "approved",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 400 for validation errors", async () => {
      const res = await request(app).patch("/api/prior-auth/b1111111-1111-4111-8111-111111111111").send({
        status: "invalid-status",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).patch("/api/prior-auth/b1111111-1111-4111-8111-111111111111").send({
        status: "approved",
      });

      expect(res.status).toBe(500);
    });
  });

  describe("DELETE /api/prior-auth/:id", () => {
    it("should delete prior auth", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "b1111111-1111-4111-8111-111111111111" }] });

      const res = await request(app).delete("/api/prior-auth/b1111111-1111-4111-8111-111111111111");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Prior authorization deleted successfully");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM prior_authorizations"),
        ["b1111111-1111-4111-8111-111111111111", "99999999-9999-4999-8999-999999999999"]
      );
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/api/prior-auth/b9999999-9999-4999-8999-999999999999");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).delete("/api/prior-auth/b1111111-1111-4111-8111-111111111111");

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/prior-auth/:id/form", () => {
    it("should return form data", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "b1111111-1111-4111-8111-111111111111",
            auth_number: "PA-123456-ABC",
            first_name: "John",
            last_name: "Doe",
            date_of_birth: "1990-01-01",
            phone: "555-1234",
            address: "123 Main St",
            city: "Boston",
            state: "MA",
            zip: "02101",
            insurance: "Blue Cross",
            provider_name: "Dr. Smith",
            provider_npi: "1234567890",
            provider_email: "smith@example.com",
            medication_name: "Dupixent",
            diagnosis_code: "L20.9",
            clinical_justification: "Severe atopic dermatitis",
            urgency: "routine",
            status: "pending",
            insurance_auth_number: null,
            created_at: "2024-01-01T00:00:00Z",
            submitted_at: null,
          },
        ],
      });

      const res = await request(app).get("/api/prior-auth/b1111111-1111-4111-8111-111111111111/form");

      expect(res.status).toBe(200);
      expect(res.body.authNumber).toBe("PA-123456-ABC");
      expect(res.body.patient.name).toBe("John Doe");
      expect(res.body.medication.name).toBe("Dupixent");
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth/b9999999-9999-4999-8999-999999999999/form");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/prior-auth/b1111111-1111-4111-8111-111111111111/form");

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/prior-auth/:id/submit", () => {
    it("should submit prior auth to payer", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "pending", auth_number: "PA-123" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/submit");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Prior authorization submitted successfully");
      expect(res.body.status).toBe("submitted");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE prior_authorizations"),
        expect.arrayContaining([expect.any(String), expect.any(String), "b1111111-1111-4111-8111-111111111111", "99999999-9999-4999-8999-999999999999"])
      );
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth/b9999999-9999-4999-8999-999999999999/submit");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 400 when already submitted", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "submitted" }],
      });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/submit");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Prior authorization has already been submitted");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/submit");

      expect(res.status).toBe(500);
    });

    it("should simulate approved payer response and notify", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const randomMock = jest.spyOn(Math, "random").mockReturnValue(0.5);
      jest.useFakeTimers();

      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "b1111111-1111-4111-8111-111111111111",
              status: "pending",
              patient_id: "a1111111-1111-4111-8111-111111111111",
              medication_name: "Dupixent",
              insurance_name: "Blue Cross",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              patient_name: "John Doe",
              medication_name: "Dupixent",
              insurance_name: "Blue Cross",
            },
          ],
        });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/submit");

      await jest.runAllTimersAsync();
      await flushPromises();

      expect(res.status).toBe(200);
      expect(notificationServiceMock.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "99999999-9999-4999-8999-999999999999",
          notificationType: "prior_auth_approved",
          data: expect.objectContaining({
            patientName: "John Doe",
            medication: "Dupixent",
            insurancePlan: "Blue Cross",
          }),
        })
      );

      randomMock.mockRestore();
      jest.useRealTimers();
      process.env.NODE_ENV = originalEnv;
    });

    it("should log notification errors for denied response", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const randomMock = jest.spyOn(Math, "random").mockReturnValue(0.7);
      jest.useFakeTimers();
      notificationServiceMock.sendNotification.mockRejectedValueOnce(new Error("notify fail"));

      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "b1111111-1111-4111-8111-111111111111",
              status: "pending",
              patient_id: "a1111111-1111-4111-8111-111111111111",
              medication_name: "Dupixent",
              insurance_name: "Blue Cross",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              patient_name: "John Doe",
              medication_name: "Dupixent",
              insurance_name: "Blue Cross",
            },
          ],
        });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/submit");

      await jest.runAllTimersAsync();
      await flushPromises();

      expect(res.status).toBe(200);
      expect(loggerMock.error).toHaveBeenCalledWith(
        "Failed to send prior auth notification",
        expect.objectContaining({
          error: "notify fail",
          priorAuthId: "b1111111-1111-4111-8111-111111111111",
        })
      );

      randomMock.mockRestore();
      jest.useRealTimers();
      process.env.NODE_ENV = originalEnv;
    });

    it("should handle more info needed response without notifications", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const randomMock = jest.spyOn(Math, "random").mockReturnValue(0.95);
      jest.useFakeTimers();

      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "b1111111-1111-4111-8111-111111111111",
              status: "pending",
              patient_id: "a1111111-1111-4111-8111-111111111111",
              medication_name: "Dupixent",
              insurance_name: "Blue Cross",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              patient_name: "John Doe",
              medication_name: "Dupixent",
              insurance_name: "Blue Cross",
            },
          ],
        });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/submit");

      await jest.runAllTimersAsync();
      await flushPromises();

      const notesUpdate = queryMock.mock.calls.find((call) => {
        return typeof call[0] === "string" && call[0].includes("notes = COALESCE");
      });

      expect(res.status).toBe(200);
      expect(notesUpdate).toBeDefined();
      expect(notificationServiceMock.sendNotification).not.toHaveBeenCalled();

      randomMock.mockRestore();
      jest.useRealTimers();
      process.env.NODE_ENV = originalEnv;
    });

    it("should log errors when mock payer response fails", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const randomMock = jest.spyOn(Math, "random").mockReturnValue(0.5);
      jest.useFakeTimers();

      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "b1111111-1111-4111-8111-111111111111",
              status: "pending",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error("update failed"));

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/submit");

      await jest.runAllTimersAsync();
      await flushPromises();

      expect(res.status).toBe(200);
      expect(loggerMock.error).toHaveBeenCalledWith(
        "Error processing mock payer response",
        expect.objectContaining({
          error: expect.anything(),
        })
      );

      randomMock.mockRestore();
      jest.useRealTimers();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("POST /api/prior-auth/:id/documents", () => {
    it("should upload supporting document", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "b1111111-1111-4111-8111-111111111111",
              patient_id: "a1111111-1111-4111-8111-111111111111",
              auth_number: "PA-123",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/documents").send({
        documentType: "lab_results",
        documentUrl: "https://example.com/doc.pdf",
        documentName: "Lab Results",
        notes: "Recent blood work",
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("00000000-0000-4000-8000-000000000000");
      expect(res.body.message).toBe("Document uploaded successfully");
    });

    it("should return 404 when prior auth not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth/b9999999-9999-4999-8999-999999999999/documents").send({
        documentUrl: "https://example.com/doc.pdf",
        documentName: "Document",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/documents").send({
        documentUrl: "https://example.com/doc.pdf",
        documentName: "Document",
      });

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/prior-auth/:id/status", () => {
    it("should return status information", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "b1111111-1111-4111-8111-111111111111",
            auth_number: "PA-123",
            status: "submitted",
            first_name: "John",
            last_name: "Doe",
            provider_name: "Dr. Smith",
            created_at: "2024-01-01T00:00:00Z",
            submitted_at: "2024-01-02T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
            approved_at: null,
            denied_at: null,
            insurance_auth_number: null,
            denial_reason: null,
          },
        ],
      });

      const res = await request(app).get("/api/prior-auth/b1111111-1111-4111-8111-111111111111/status");

      expect(res.status).toBe(200);
      expect(res.body.authNumber).toBe("PA-123");
      expect(res.body.status).toBe("submitted");
      expect(res.body.payerStatus).toBe("In Review");
      expect(res.body.timeline).toBeInstanceOf(Array);
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth/b9999999-9999-4999-8999-999999999999/status");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/prior-auth/b1111111-1111-4111-8111-111111111111/status");

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/prior-auth/webhook/payer-response", () => {
    it("should process webhook response for approval", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "submitted" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/prior-auth/webhook/payer-response")
        .send({
          authNumber: "PA-123",
          status: "approved",
          insuranceAuthNumber: "AUTH-456",
          reason: "Approved",
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Webhook processed successfully");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE prior_authorizations"),
        expect.arrayContaining(["approved"])
      );
    });

    it("should process webhook response for denial", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "b1111111-1111-4111-8111-111111111111", status: "submitted" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/prior-auth/webhook/payer-response")
        .send({
          authNumber: "PA-123",
          status: "denied",
          reason: "Step therapy required",
        });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE prior_authorizations"),
        expect.arrayContaining(["denied"])
      );
    });

    it("should return 404 when prior auth not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/prior-auth/webhook/payer-response")
        .send({
          authNumber: "PA-999",
          status: "approved",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app)
        .post("/api/prior-auth/webhook/payer-response")
        .send({
          authNumber: "PA-123",
          status: "approved",
        });

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/prior-auth/dashboard", () => {
    it("should return dashboard stats", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            total: "5",
            pending: "2",
            approved: "1",
            denied: "1",
            expiring_soon: "1",
            expiring_urgent: "0",
            avg_days_pending: "3.5",
            success_rate: "50",
          },
        ],
      });

      const res = await request(app).get("/api/prior-auth/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5);
      expect(res.body.pending).toBe(2);
      expect(res.body.success_rate).toBe(50);
    });

    it("should return zeros when no data", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.pending).toBe(0);
    });
  });

  describe("GET /api/prior-auth/expiring", () => {
    it("should return expiring prior auths", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pa-1" }] });

      const res = await request(app).get("/api/prior-auth/expiring?days=15");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '15 days'"),
        ["99999999-9999-4999-8999-999999999999"]
      );
    });
  });

  describe("POST /api/prior-auth/:id/status", () => {
    it("should add status update", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "b1111111-1111-4111-8111-111111111111" }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/status").send({
        status: "submitted",
        notes: "Called payer",
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Status updated successfully");
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth/b9999999-9999-4999-8999-999999999999/status").send({
        status: "approved",
      });

      expect(res.status).toBe(404);
    });

    it("should return 400 for validation errors", async () => {
      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/status").send({
        status: "bad",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/prior-auth/:id/generate-letter", () => {
    it("should return letter text", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            auth_number: "PA-123",
            first_name: "John",
            last_name: "Doe",
            dob: "1990-01-01",
            insurance: "Blue Cross",
            medication_name: "Dupixent",
            diagnosis_code: "L20.9",
            clinical_justification: "Severe dermatitis",
            provider_name: "Dr. Smith",
          },
        ],
      });

      const res = await request(app).post("/api/prior-auth/b1111111-1111-4111-8111-111111111111/generate-letter");

      expect(res.status).toBe(200);
      expect(res.body.letterText).toContain("Prior Authorization Request");
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth/b9999999-9999-4999-8999-999999999999/generate-letter");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/prior-auth (modern payload)", () => {
    it("should create prior auth from modern payload", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "00000000-0000-4000-8000-000000000000" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth").send({
        patientId: "a1111111-1111-4111-8111-111111111111",
        authType: "procedure",
        procedureCode: "11111",
        diagnosisCodes: ["L20.9"],
        payerName: "Blue Cross",
        previousTreatments: "Topicals",
        urgency: "urgent",
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("00000000-0000-4000-8000-000000000000");
    });
  });
});
