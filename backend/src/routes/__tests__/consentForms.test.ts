import request from "supertest";
import express from "express";
import { consentFormsRouter } from "../consentForms";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

// Mock crypto with requireActual to preserve createHash
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "mock-uuid-1234"),
}));

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

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/consent-forms", consentFormsRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Consent Forms routes", () => {
  describe("GET /consent-forms", () => {
    it("returns all consent forms", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "form-1",
            formName: "Treatment Consent",
            formType: "treatment",
            isActive: true,
          },
        ],
      });

      const res = await request(app).get("/consent-forms");

      expect(res.status).toBe(200);
      expect(res.body.forms).toHaveLength(1);
      expect(res.body.forms[0].id).toBe("form-1");
    });

    it("filters active forms when activeOnly=true", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "form-1", isActive: true }],
      });

      const res = await request(app).get("/consent-forms?activeOnly=true");

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("AND is_active = true"),
        ["tenant-1"]
      );
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/consent-forms");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch consent forms");
    });
  });

  describe("GET /consent-forms/active", () => {
    it("returns only active consent forms", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          { id: "form-1", formName: "Active Form", isActive: true },
          { id: "form-2", formName: "Another Active", isActive: true },
        ],
      });

      const res = await request(app).get("/consent-forms/active");

      expect(res.status).toBe(200);
      expect(res.body.forms).toHaveLength(2);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("WHERE tenant_id = $1 AND is_active = true"),
        ["tenant-1"]
      );
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/consent-forms/active");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch active consent forms");
    });
  });

  describe("GET /consent-forms/:id", () => {
    it("returns a single consent form", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "form-1",
            formName: "Treatment Consent",
            formType: "treatment",
            formContent: "<p>I consent...</p>",
            isActive: true,
          },
        ],
      });

      const res = await request(app).get("/consent-forms/form-1");

      expect(res.status).toBe(200);
      expect(res.body.form.id).toBe("form-1");
      expect(res.body.form.formName).toBe("Treatment Consent");
    });

    it("returns 404 when form not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/consent-forms/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Consent form not found");
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/consent-forms/form-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch consent form");
    });
  });

  describe("POST /consent-forms", () => {
    const validPayload = {
      formName: "New Treatment Consent",
      formType: "treatment",
      formContent: "<p>I consent to treatment...</p>",
      requiresSignature: true,
      version: "1.0",
      effectiveDate: "2024-01-01",
    };

    it("creates a new consent form", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/consent-forms").send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("mock-uuid-1234");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO consent_forms"),
        expect.arrayContaining([
          "mock-uuid-1234",
          "tenant-1",
          "New Treatment Consent",
          "treatment",
          "<p>I consent to treatment...</p>",
          true,
          "1.0",
          "2024-01-01",
        ])
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "consent_form_create",
        "consent_form",
        "mock-uuid-1234"
      );
    });

    it("uses default values when optional fields omitted", async () => {
      const minimalPayload = {
        formName: "Simple Form",
        formType: "general",
        formContent: "<p>Content</p>",
      };

      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/consent-forms").send(minimalPayload);

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO consent_forms"),
        expect.arrayContaining([
          expect.anything(),
          "tenant-1",
          "Simple Form",
          "general",
          "<p>Content</p>",
          true, // default requiresSignature
          "1.0", // default version
          null, // effectiveDate
        ])
      );
    });

    it("returns 400 for missing required fields", async () => {
      const res = await request(app).post("/consent-forms").send({
        formName: "Test",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 400 for invalid formName (empty string)", async () => {
      const res = await request(app).post("/consent-forms").send({
        ...validPayload,
        formName: "",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for formName exceeding max length", async () => {
      const res = await request(app).post("/consent-forms").send({
        ...validPayload,
        formName: "a".repeat(256), // exceeds 255
      });

      expect(res.status).toBe(400);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).post("/consent-forms").send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to create consent form");
    });
  });

  describe("PUT /consent-forms/:id", () => {
    it("updates a consent form", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "form-1" }],
      });

      const res = await request(app).put("/consent-forms/form-1").send({
        formName: "Updated Form",
        isActive: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe("form-1");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE consent_forms"),
        expect.arrayContaining(["Updated Form", false, "tenant-1", "form-1"])
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "consent_form_update",
        "consent_form",
        "form-1"
      );
    });

    it("updates only provided fields", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "form-1" }],
      });

      const res = await request(app).put("/consent-forms/form-1").send({
        version: "2.0",
      });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE consent_forms\s+SET version = \$1/),
        expect.arrayContaining(["2.0", "tenant-1", "form-1"])
      );
    });

    it("returns 400 when no fields to update", async () => {
      const res = await request(app).put("/consent-forms/form-1").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No fields to update");
    });

    it("returns 400 for invalid data", async () => {
      const res = await request(app).put("/consent-forms/form-1").send({
        formName: "", // invalid: too short
      });

      expect(res.status).toBe(400);
    });

    it("returns 404 when form not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/consent-forms/nonexistent").send({
        formName: "Updated",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Consent form not found");
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).put("/consent-forms/form-1").send({
        formName: "Updated",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to update consent form");
    });
  });

  describe("DELETE /consent-forms/:id", () => {
    it("deactivates a consent form", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "form-1" }],
      });

      const res = await request(app).delete("/consent-forms/form-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE consent_forms"),
        ["form-1", "tenant-1"]
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "consent_form_deactivate",
        "consent_form",
        "form-1"
      );
    });

    it("returns 404 when form not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/consent-forms/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Consent form not found");
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).delete("/consent-forms/form-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to deactivate consent form");
    });
  });

  describe("GET /consent-forms/patient/:patientId", () => {
    it("returns patient's signed consents", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "consent-1",
            signatureUrl: "https://example.com/sig.png",
            signedAt: "2024-01-01T10:00:00Z",
            formName: "Treatment Consent",
            formType: "treatment",
          },
          {
            id: "consent-2",
            signatureUrl: "https://example.com/sig2.png",
            signedAt: "2024-01-02T11:00:00Z",
            formName: "Privacy Policy",
            formType: "privacy",
          },
        ],
      });

      const res = await request(app).get("/consent-forms/patient/patient-1");

      expect(res.status).toBe(200);
      expect(res.body.consents).toHaveLength(2);
      expect(res.body.consents[0].id).toBe("consent-1");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("FROM patient_consents"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns empty array when patient has no consents", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/consent-forms/patient/patient-1");

      expect(res.status).toBe(200);
      expect(res.body.consents).toHaveLength(0);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/consent-forms/patient/patient-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch patient consents");
    });
  });

  describe("GET /consent-forms/consents/all", () => {
    it("returns all patient consents with pagination", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "consent-1",
              patientId: "patient-1",
              patientFirstName: "John",
              patientLastName: "Doe",
              formName: "Treatment",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: "25" }],
        });

      const res = await request(app).get("/consent-forms/consents/all?limit=10&offset=0");

      expect(res.status).toBe(200);
      expect(res.body.consents).toHaveLength(1);
      expect(res.body.total).toBe(25);
      expect(res.body.limit).toBe(10);
      expect(res.body.offset).toBe(0);
    });

    it("uses default pagination values", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] });

      const res = await request(app).get("/consent-forms/consents/all");

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(50); // default
      expect(res.body.offset).toBe(0); // default
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $2 OFFSET $3"),
        ["tenant-1", 50, 0]
      );
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/consent-forms/consents/all");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch consents");
    });
  });
});
