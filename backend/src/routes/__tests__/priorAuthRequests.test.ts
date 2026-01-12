import request from "supertest";
import express from "express";
import priorAuthRequestsRouter from "../priorAuthRequests";
import { pool } from "../../db/pool";
import * as priorAuthAdapter from "../../services/priorAuthAdapter";
import * as audit from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
  AuthedRequest: {},
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/priorAuthAdapter");
jest.mock("../../services/audit");

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-test-123"),
}));

const app = express();
app.use(express.json());
app.use("/api/prior-auth-requests", priorAuthRequestsRouter);

const queryMock = pool.query as jest.Mock;
const getPriorAuthAdapterMock = priorAuthAdapter.getPriorAuthAdapter as jest.Mock;
const auditLogMock = audit.auditLog as jest.Mock;

const mockAdapter = {
  submit: jest.fn(),
  checkStatus: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [] });
  auditLogMock.mockResolvedValue(undefined);
  getPriorAuthAdapterMock.mockReturnValue(mockAdapter);
  mockAdapter.submit.mockReset();
  mockAdapter.checkStatus.mockReset();
});

describe("Prior Auth Requests Routes", () => {
  describe("POST /api/prior-auth-requests", () => {
    it("should create new PA request", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "uuid-test-123",
              patient_id: "patient-1",
              medication_name: "Dupixent",
              status: "pending",
            },
          ],
        });

      const res = await request(app)
        .post("/api/prior-auth-requests")
        .send({
          patientId: "patient-1",
          medicationName: "Dupixent",
          payer: "Blue Cross",
          memberId: "MEMBER123",
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Prior authorization request created successfully");
      expect(res.body.data.id).toBe("uuid-test-123");
      expect(auditLogMock).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "prior_auth_create",
        "prior_auth_requests",
        "uuid-test-123"
      );
    });

    it("should create PA request with prescription data", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              medication_name: "Humira",
              strength: "40mg",
              quantity: 2,
              sig: "Inject 40mg subcutaneously every 2 weeks",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "uuid-test-123" }],
        });

      const res = await request(app)
        .post("/api/prior-auth-requests")
        .send({
          patientId: "patient-1",
          prescriptionId: "rx-1",
          payer: "Blue Cross",
          memberId: "MEMBER123",
        });

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("INSERT INTO prior_auth_requests"),
        expect.arrayContaining(["Humira", "40mg", 2])
      );
    });

    it("should return 404 when patient not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/prior-auth-requests")
        .send({
          patientId: "patient-999",
          medicationName: "Dupixent",
          payer: "Blue Cross",
          memberId: "MEMBER123",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Patient not found");
    });

    it("should return 400 for validation errors", async () => {
      const res = await request(app).post("/api/prior-auth-requests").send({
        patientId: "patient-1",
        // missing required fields
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app)
        .post("/api/prior-auth-requests")
        .send({
          patientId: "patient-1",
          medicationName: "Dupixent",
          payer: "Blue Cross",
          memberId: "MEMBER123",
        });

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/prior-auth-requests", () => {
    it("should return list of PA requests", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pa-1",
            patient_id: "patient-1",
            first_name: "John",
            last_name: "Doe",
            medication_name: "Dupixent",
            status: "pending",
          },
          {
            id: "pa-2",
            patient_id: "patient-2",
            first_name: "Jane",
            last_name: "Smith",
            medication_name: "Humira",
            status: "approved",
          },
        ],
      });

      const res = await request(app).get("/api/prior-auth-requests");

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.data).toHaveLength(2);
    });

    it("should filter by patientId", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/prior-auth-requests")
        .query({ patientId: "patient-1" });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.patient_id = $2"),
        expect.arrayContaining(["tenant-1", "patient-1"])
      );
    });

    it("should filter by status", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/prior-auth-requests")
        .query({ status: "approved" });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.status = $2"),
        expect.arrayContaining(["tenant-1", "approved"])
      );
    });

    it("should filter by payer", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/prior-auth-requests")
        .query({ payer: "Blue Cross" });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("pa.payer ILIKE $2"),
        expect.arrayContaining(["tenant-1", "%Blue Cross%"])
      );
    });

    it("should support pagination", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/prior-auth-requests")
        .query({ limit: 10, offset: 20 });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $2 OFFSET $3"),
        ["tenant-1", 10, 20]
      );
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/prior-auth-requests");

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/prior-auth-requests/:id", () => {
    it("should return single PA request", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pa-1",
            patient_id: "patient-1",
            first_name: "John",
            last_name: "Doe",
            phone: "555-1234",
            email: "john@example.com",
            medication_name: "Dupixent",
            status: "pending",
          },
        ],
      });

      const res = await request(app).get("/api/prior-auth-requests/pa-1");

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe("pa-1");
      expect(res.body.data.first_name).toBe("John");
    });

    it("should return 404 when not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth-requests/pa-999");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization request not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/prior-auth-requests/pa-1");

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/prior-auth-requests/:id/submit", () => {
    it("should submit PA request to payer", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "pa-1",
              tenant_id: "tenant-1",
              patient_id: "patient-1",
              medication_name: "Dupixent",
              status: "pending",
              payer: "Blue Cross",
              member_id: "MEMBER123",
              history: [],
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockAdapter.submit.mockResolvedValue({
        status: "submitted",
        statusReason: "PA submitted successfully",
        externalReferenceId: "EXT-123",
        requestPayload: {},
        responsePayload: {},
        estimatedDecisionTime: "24-48 hours",
      });

      const res = await request(app).post("/api/prior-auth-requests/pa-1/submit");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Prior authorization submitted successfully");
      expect(res.body.status).toBe("submitted");
      expect(res.body.externalReferenceId).toBe("EXT-123");
      expect(mockAdapter.submit).toHaveBeenCalled();
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should return 404 when PA request not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/prior-auth-requests/pa-999/submit");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization request not found");
    });

    it("should return 400 when not in pending status", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pa-1",
            status: "submitted",
          },
        ],
      });

      const res = await request(app).post("/api/prior-auth-requests/pa-1/submit");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cannot submit PA request");
      expect(res.body.reason).toContain("Current status is 'submitted'");
    });

    it("should return 500 on submission error", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pa-1",
            status: "pending",
            payer: "Blue Cross",
            history: [],
          },
        ],
      });
      mockAdapter.submit.mockRejectedValue(new Error("Submission failed"));

      const res = await request(app).post("/api/prior-auth-requests/pa-1/submit");

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/prior-auth-requests/:id/status", () => {
    it("should check PA status", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pa-1",
            patient_id: "patient-1",
            first_name: "John",
            last_name: "Doe",
            medication_name: "Dupixent",
            payer: "Blue Cross",
            status: "submitted",
            external_reference_id: "EXT-123",
            history: [],
          },
        ],
      });

      mockAdapter.checkStatus.mockResolvedValue({
        status: "submitted",
        statusReason: "Under review",
        externalReferenceId: "EXT-123",
        responsePayload: {},
        lastUpdated: "2024-01-01T00:00:00Z",
      });

      const res = await request(app).get("/api/prior-auth-requests/pa-1/status");

      expect(res.status).toBe(200);
      expect(res.body.paRequestId).toBe("pa-1");
      expect(res.body.status).toBe("submitted");
      expect(res.body.statusReason).toBe("Under review");
      expect(mockAdapter.checkStatus).toHaveBeenCalledWith("pa-1", "EXT-123");
    });

    it("should update status if changed", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "pa-1",
              patient_id: "patient-1",
              first_name: "John",
              last_name: "Doe",
              medication_name: "Dupixent",
              payer: "Blue Cross",
              status: "submitted",
              external_reference_id: "EXT-123",
              history: [],
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockAdapter.checkStatus.mockResolvedValue({
        status: "approved",
        statusReason: "Approved by payer",
        externalReferenceId: "EXT-123",
        responsePayload: {},
        lastUpdated: "2024-01-01T00:00:00Z",
      });

      const res = await request(app).get("/api/prior-auth-requests/pa-1/status");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("approved");
      expect(queryMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("UPDATE prior_auth_requests"),
        expect.arrayContaining(["approved", "Approved by payer"])
      );
    });

    it("should return 404 when PA request not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/prior-auth-requests/pa-999/status");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization request not found");
    });

    it("should return 500 on status check error", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pa-1",
            payer: "Blue Cross",
            status: "submitted",
            external_reference_id: "EXT-123",
            history: [],
          },
        ],
      });
      mockAdapter.checkStatus.mockRejectedValue(new Error("Status check failed"));

      const res = await request(app).get("/api/prior-auth-requests/pa-1/status");

      expect(res.status).toBe(500);
    });
  });

  describe("PATCH /api/prior-auth-requests/:id", () => {
    it("should update PA request", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "pa-1", status: "pending", history: [] }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "pa-1", status: "needs_info", history: [] }],
        });

      const res = await request(app).patch("/api/prior-auth-requests/pa-1").send({
        status: "needs_info",
        statusReason: "Additional documentation required",
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Prior authorization request updated successfully");
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should update attachments", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "pa-1", status: "pending", history: [] }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "pa-1" }],
        });

      const res = await request(app).patch("/api/prior-auth-requests/pa-1").send({
        attachments: [
          {
            fileName: "lab_results.pdf",
            fileUrl: "https://example.com/lab_results.pdf",
            fileType: "application/pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("attachments = $1"),
        expect.arrayContaining([expect.any(String)])
      );
    });

    it("should return 404 when PA request not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).patch("/api/prior-auth-requests/pa-999").send({
        status: "needs_info",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prior authorization request not found");
    });

    it("should return 400 when no fields to update", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pa-1", status: "pending", history: [] }],
      });

      const res = await request(app).patch("/api/prior-auth-requests/pa-1").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No valid fields to update");
    });

    it("should return 400 for validation errors", async () => {
      const res = await request(app).patch("/api/prior-auth-requests/pa-1").send({
        status: "invalid-status",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).patch("/api/prior-auth-requests/pa-1").send({
        status: "needs_info",
      });

      expect(res.status).toBe(500);
    });
  });
});
