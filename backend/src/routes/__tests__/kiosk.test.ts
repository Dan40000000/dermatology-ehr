import request from "supertest";
import express from "express";
import { kioskRouter } from "../kiosk";
import { pool } from "../../db/pool";
import * as signatureService from "../../services/signatureService";
import * as audit from "../../services/audit";

jest.mock("../../middleware/kioskAuth", () => ({
  requireKioskAuth: (req: any, _res: any, next: any) => {
    req.kiosk = {
      id: "kiosk-1",
      tenantId: "tenant-1",
      locationId: "location-1",
    };
    return next();
  },
  KioskRequest: {},
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/signatureService");
jest.mock("../../services/audit");

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-test-123"),
}));

const app = express();
app.use(express.json());
app.use("/api/kiosk", kioskRouter);

const queryMock = pool.query as jest.Mock;
const saveSignatureMock = signatureService.saveSignature as jest.Mock;
const saveInsuranceCardPhotoMock = signatureService.saveInsuranceCardPhoto as jest.Mock;
const validateSignatureDataMock = signatureService.validateSignatureData as jest.Mock;
const auditLogMock = audit.auditLog as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [] });
  auditLogMock.mockResolvedValue(undefined);
});

describe("Kiosk Routes", () => {
  describe("POST /api/kiosk/heartbeat", () => {
    it("should update heartbeat timestamp", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "kiosk-1" }] });

      const res = await request(app).post("/api/kiosk/heartbeat");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.timestamp).toBeDefined();
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE kiosk_devices"),
        ["kiosk-1"]
      );
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/kiosk/heartbeat");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Heartbeat failed");
    });
  });

  describe("POST /api/kiosk/verify-patient", () => {
    it("should verify patient by DOB", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "patient-1",
            firstName: "John",
            lastName: "Doe",
            dob: "1990-01-01",
          },
        ],
      });

      const res = await request(app).post("/api/kiosk/verify-patient").send({
        method: "dob",
        lastName: "Doe",
        dob: "1990-01-01",
      });

      expect(res.status).toBe(200);
      expect(res.body.patients).toHaveLength(1);
      expect(res.body.patients[0].lastName).toBe("Doe");
    });

    it("should verify patient by phone", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "patient-1",
            firstName: "John",
            lastName: "Doe",
            phone: "555-1234",
          },
        ],
      });

      const res = await request(app).post("/api/kiosk/verify-patient").send({
        method: "phone",
        lastName: "Doe",
        phone: "555-1234",
      });

      expect(res.status).toBe(200);
      expect(res.body.patients).toHaveLength(1);
    });

    it("should verify patient by MRN", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "patient-1",
            firstName: "John",
            lastName: "Doe",
            mrn: "MRN123",
          },
        ],
      });

      const res = await request(app).post("/api/kiosk/verify-patient").send({
        method: "mrn",
        lastName: "Doe",
        mrn: "MRN123",
      });

      expect(res.status).toBe(200);
      expect(res.body.patients).toHaveLength(1);
    });

    it("should return 400 for invalid input", async () => {
      const res = await request(app).post("/api/kiosk/verify-patient").send({
        method: "dob",
        // missing lastName
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid method or missing data", async () => {
      const res = await request(app).post("/api/kiosk/verify-patient").send({
        method: "dob",
        lastName: "Doe",
        // missing dob
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid verification method or missing data");
    });

    it("should return 404 when patient not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/verify-patient").send({
        method: "dob",
        lastName: "Doe",
        dob: "1990-01-01",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Patient not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/kiosk/verify-patient").send({
        method: "dob",
        lastName: "Doe",
        dob: "1990-01-01",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Verification failed");
    });
  });

  describe("GET /api/kiosk/today-appointments", () => {
    it("should return today's appointments", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "appt-1",
            scheduledStart: "2024-01-01T10:00:00Z",
            patientFirstName: "John",
            patientLastName: "Doe",
          },
        ],
      });

      const res = await request(app).get("/api/kiosk/today-appointments");

      expect(res.status).toBe(200);
      expect(res.body.appointments).toHaveLength(1);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("DATE(a.scheduled_start) = CURRENT_DATE"),
        ["tenant-1", "location-1"]
      );
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/kiosk/today-appointments");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch appointments");
    });
  });

  describe("POST /api/kiosk/checkin/start", () => {
    it("should start checkin session", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "appt-1" }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/checkin/start").send({
        patientId: "patient-1",
        appointmentId: "appt-1",
        verificationMethod: "dob",
        verificationValue: "1990-01-01",
      });

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBe("uuid-test-123");
      expect(res.body.patientId).toBe("patient-1");
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should start checkin without appointment", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/checkin/start").send({
        patientId: "patient-1",
        verificationMethod: "dob",
        verificationValue: "1990-01-01",
      });

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBe("uuid-test-123");
    });

    it("should return 400 for invalid input", async () => {
      const res = await request(app).post("/api/kiosk/checkin/start").send({
        patientId: "not-a-uuid",
      });

      expect(res.status).toBe(400);
    });

    it("should return 404 when patient not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/checkin/start").send({
        patientId: "patient-999",
        verificationMethod: "dob",
        verificationValue: "1990-01-01",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Patient not found");
    });

    it("should return 404 when appointment not found", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/checkin/start").send({
        patientId: "patient-1",
        appointmentId: "appt-999",
        verificationMethod: "dob",
        verificationValue: "1990-01-01",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Appointment not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/kiosk/checkin/start").send({
        patientId: "patient-1",
        verificationMethod: "dob",
        verificationValue: "1990-01-01",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to start check-in");
    });
  });

  describe("GET /api/kiosk/checkin/:sessionId", () => {
    it("should get checkin session", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "session-1",
            patient_id: "patient-1",
            patientFirstName: "John",
            patientLastName: "Doe",
          },
        ],
      });

      const res = await request(app).get("/api/kiosk/checkin/session-1");

      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe("session-1");
    });

    it("should return 404 when session not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/kiosk/checkin/session-999");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/kiosk/checkin/session-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch session");
    });
  });

  describe("PUT /api/kiosk/checkin/:sessionId/demographics", () => {
    it("should update demographics", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put("/api/kiosk/checkin/session-1/demographics")
        .send({
          phone: "555-5555",
          email: "new@example.com",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should return 400 for invalid input", async () => {
      const res = await request(app)
        .put("/api/kiosk/checkin/session-1/demographics")
        .send({
          email: "not-an-email",
        });

      expect(res.status).toBe(400);
    });

    it("should return 404 when session not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put("/api/kiosk/checkin/session-999/demographics")
        .send({
          phone: "555-5555",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app)
        .put("/api/kiosk/checkin/session-1/demographics")
        .send({
          phone: "555-5555",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to update demographics");
    });
  });

  describe("PUT /api/kiosk/checkin/:sessionId/insurance", () => {
    it("should update insurance", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put("/api/kiosk/checkin/session-1/insurance")
        .send({
          insurance: "Blue Cross",
          insuranceMemberId: "123456",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should return 400 for invalid input", async () => {
      const res = await request(app)
        .put("/api/kiosk/checkin/session-1/insurance")
        .send({
          invalidField: "value",
        });

      expect(res.status).toBe(400);
    });

    it("should return 404 when session not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put("/api/kiosk/checkin/session-999/insurance")
        .send({
          insurance: "Blue Cross",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app)
        .put("/api/kiosk/checkin/session-1/insurance")
        .send({
          insurance: "Blue Cross",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to update insurance");
    });
  });

  describe("POST /api/kiosk/checkin/:sessionId/insurance-photo", () => {
    it("should upload insurance card photo", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [] });

      saveInsuranceCardPhotoMock.mockResolvedValue({
        url: "https://example.com/photo.jpg",
        thumbnailUrl: "https://example.com/thumb.jpg",
      });

      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/insurance-photo")
        .send({
          side: "front",
          photoData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.photoUrl).toBe("https://example.com/photo.jpg");
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should return 400 for invalid input", async () => {
      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/insurance-photo")
        .send({
          side: "invalid-side",
        });

      expect(res.status).toBe(400);
    });

    it("should return 404 when session not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/kiosk/checkin/session-999/insurance-photo")
        .send({
          side: "front",
          photoData: "data:image/png;base64,abc",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("should return 500 on save error", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] });
      saveInsuranceCardPhotoMock.mockRejectedValue(new Error("Save failed"));

      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/insurance-photo")
        .send({
          side: "front",
          photoData: "data:image/png;base64,abc",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Save failed");
    });
  });

  describe("POST /api/kiosk/checkin/:sessionId/signature", () => {
    const validFormId = "00000000-0000-0000-0000-000000000001";

    beforeEach(() => {
      queryMock.mockReset();
      queryMock.mockResolvedValue({ rows: [] });
      validateSignatureDataMock.mockReset();
      validateSignatureDataMock.mockReturnValue(true); // Default to valid signature
      saveSignatureMock.mockReset();
      saveSignatureMock.mockResolvedValue({ url: "https://example.com/sig.png", thumbnailUrl: "https://example.com/sig-thumb.png" });
    });

    it("should save signature", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: validFormId,
              formContent: "Terms and conditions",
              version: "1.0",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      validateSignatureDataMock.mockReturnValue(true);
      saveSignatureMock.mockResolvedValue({
        url: "https://example.com/signature.png",
        thumbnailUrl: "https://example.com/sig-thumb.png",
      });

      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/signature")
        .send({
          signatureData: "data:image/png;base64,abc",
          consentFormId: validFormId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.consentId).toBe("uuid-test-123");
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should return 400 for invalid input", async () => {
      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/signature")
        .send({
          signatureData: "data:image/png;base64,abc",
          consentFormId: "not-a-uuid",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid signature data", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] });
      validateSignatureDataMock.mockReturnValue(false);

      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/signature")
        .send({
          signatureData: "invalid",
          consentFormId: validFormId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid signature data");
    });

    it("should return 404 when session not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      validateSignatureDataMock.mockReturnValue(true);

      const res = await request(app)
        .post("/api/kiosk/checkin/session-999/signature")
        .send({
          signatureData: "data:image/png;base64,abc",
          consentFormId: "00000000-0000-0000-0000-000000000001",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("should return 404 when consent form not found", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [] });
      validateSignatureDataMock.mockReturnValue(true);

      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/signature")
        .send({
          signatureData: "data:image/png;base64,abc",
          consentFormId: "00000000-0000-0000-0000-000000000999",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Consent form not found");
    });

    it("should return 500 on save error", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ patientId: "patient-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-0000-0000-000000000001", formContent: "Terms", version: "1.0" }] });
      validateSignatureDataMock.mockReturnValue(true);
      saveSignatureMock.mockRejectedValue(new Error("Save failed"));

      const res = await request(app)
        .post("/api/kiosk/checkin/session-1/signature")
        .send({
          signatureData: "data:image/png;base64,abc",
          consentFormId: "00000000-0000-0000-0000-000000000001",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Save failed");
    });
  });

  describe("POST /api/kiosk/checkin/:sessionId/complete", () => {
    beforeEach(() => {
      queryMock.mockReset();
      queryMock.mockResolvedValue({ rows: [] });
    });

    it("should complete checkin", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ patientId: "patient-1", appointmentId: "appt-1" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/checkin/session-1/complete");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.patientId).toBe("patient-1");
      expect(res.body.appointmentId).toBe("appt-1");
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should complete checkin without appointment", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ patientId: "patient-1", appointmentId: null }],
      });

      const res = await request(app).post("/api/kiosk/checkin/session-1/complete");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.appointmentId).toBeNull();
    });

    it("should return 404 when session not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/checkin/session-999/complete");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/kiosk/checkin/session-1/complete");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to complete check-in");
    });
  });

  describe("POST /api/kiosk/checkin/:sessionId/cancel", () => {
    beforeEach(() => {
      queryMock.mockReset();
      queryMock.mockResolvedValue({ rows: [] });
    });

    it("should cancel checkin", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "session-1" }] });

      const res = await request(app).post("/api/kiosk/checkin/session-1/cancel");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(auditLogMock).toHaveBeenCalled();
    });

    it("should return 404 when session not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/kiosk/checkin/session-999/cancel");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("should return 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/api/kiosk/checkin/session-1/cancel");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to cancel check-in");
    });
  });
});
