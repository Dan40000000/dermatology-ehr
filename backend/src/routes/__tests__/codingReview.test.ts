import request from "supertest";
import express from "express";
import { codingReviewRouter } from "../codingReview";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../middleware/moduleAccess", () => ({
  requireModuleAccess: () => (_req: any, _res: any, next: any) => next(),
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
app.use("/coding-review", codingReviewRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Coding review routes", () => {
  it("returns post-visit coding work with issue flags and summary", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          encounterId: "enc-1",
          appointmentId: "appt-1",
          patientId: "patient-1",
          patientName: "Ava Jones",
          providerId: "provider-1",
          providerName: "Dr Demo",
          serviceAt: "2026-05-24T15:00:00.000Z",
          appointmentStatus: "completed",
          encounterStatus: "draft",
          chiefComplaint: "Rash",
          diagnosisCount: 0,
          primaryDiagnosisCount: 0,
          diagnosisCodes: [],
          chargeCount: 1,
          missingCptCount: 0,
          unlinkedChargeCount: 1,
          totalChargeCents: 17500,
          cptCodes: ["99213"],
          superbillId: "sb-1",
          superbillStatus: "draft",
          claimId: "claim-1",
          claimStatus: "coding_review",
        },
      ],
    });

    const res = await request(app).get("/coding-review/post-visit?startDate=2026-05-20&endDate=2026-05-24");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].issues).toEqual(
      expect.arrayContaining([
        "missing_diagnosis",
        "diagnosis_link_needed",
        "note_unsigned",
        "superbill_open",
        "claim_coding_review",
      ]),
    );
    expect(res.body.items[0].recommendedOwner).toBe("provider");
    expect(res.body.summary.issueCounts.missing_diagnosis).toBe(1);
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "post_visit_coding_review_view",
      "coding_review",
      "tenant-1",
    );
  });

  it("hides cleared rows unless includeCleared is true", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          encounterId: "enc-2",
          appointmentId: "appt-2",
          patientId: "patient-2",
          patientName: "Ben Skin",
          providerId: "provider-1",
          providerName: "Dr Demo",
          serviceAt: "2026-05-24T16:00:00.000Z",
          appointmentStatus: "completed",
          encounterStatus: "signed",
          chiefComplaint: "Acne",
          diagnosisCount: 1,
          primaryDiagnosisCount: 1,
          diagnosisCodes: ["L70.0"],
          chargeCount: 1,
          missingCptCount: 0,
          unlinkedChargeCount: 0,
          totalChargeCents: 15000,
          cptCodes: ["99213"],
          superbillId: "sb-2",
          superbillStatus: "submitted",
          claimId: "claim-2",
          claimStatus: "submitted",
        },
      ],
    });

    const defaultRes = await request(app).get("/coding-review/post-visit?startDate=2026-05-20&endDate=2026-05-24");
    expect(defaultRes.body.items).toHaveLength(0);

    const includeRes = await request(app).get(
      "/coding-review/post-visit?startDate=2026-05-20&endDate=2026-05-24&includeCleared=true",
    );
    expect(includeRes.body.items).toHaveLength(1);
    expect(includeRes.body.items[0].issues).toEqual([]);
  });

  it("excludes cancelled and no-show appointments from post-visit coding work", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          encounterId: "enc-levi-cancelled",
          appointmentId: "appt-levi-cancelled",
          patientId: "patient-levi",
          patientName: "Levi Ortiz",
          providerId: "provider-1",
          providerName: "Dr Demo",
          serviceAt: "2026-05-24T17:00:00.000Z",
          appointmentStatus: "cancelled",
          encounterStatus: "draft",
          chiefComplaint: "Follow-up",
          diagnosisCount: 0,
          primaryDiagnosisCount: 0,
          diagnosisCodes: [],
          chargeCount: 0,
          missingCptCount: 0,
          unlinkedChargeCount: 0,
          totalChargeCents: 0,
          cptCodes: [],
          superbillId: null,
          superbillStatus: null,
          claimId: null,
          claimStatus: null,
        },
        {
          encounterId: "enc-noshow",
          appointmentId: "appt-noshow",
          patientId: "patient-noshow",
          patientName: "No Show Patient",
          providerId: "provider-1",
          providerName: "Dr Demo",
          serviceAt: "2026-05-24T18:00:00.000Z",
          appointmentStatus: "no_show",
          encounterStatus: "draft",
          chiefComplaint: "Acne",
          diagnosisCount: 0,
          primaryDiagnosisCount: 0,
          diagnosisCodes: [],
          chargeCount: 0,
          missingCptCount: 0,
          unlinkedChargeCount: 0,
          totalChargeCents: 0,
          cptCodes: [],
          superbillId: null,
          superbillStatus: null,
          claimId: null,
          claimStatus: null,
        },
      ],
    });

    const res = await request(app).get(
      "/coding-review/post-visit?startDate=2026-05-20&endDate=2026-05-24&includeCleared=true",
    );

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.summary.total).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain("Levi Ortiz");
    expect(String(queryMock.mock.calls[0][0])).toContain(
      "coalesce(lower(a.status), '') not in ('cancelled', 'canceled', 'no_show', 'no-show', 'no show')",
    );
  });

  it("does not flag missing superbills as open superbills", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          encounterId: "enc-3",
          appointmentId: "appt-3",
          patientId: "patient-3",
          patientName: "Cara Mole",
          providerId: "provider-1",
          providerName: "Dr Demo",
          serviceAt: "2026-05-24T17:00:00.000Z",
          appointmentStatus: "completed",
          encounterStatus: "completed",
          chiefComplaint: "Skin check",
          diagnosisCount: 1,
          primaryDiagnosisCount: 1,
          diagnosisCodes: ["Z12.83"],
          chargeCount: 1,
          missingCptCount: 0,
          unlinkedChargeCount: 0,
          totalChargeCents: 15000,
          cptCodes: ["99213"],
          superbillId: null,
          superbillStatus: null,
          claimId: "claim-3",
          claimStatus: "coding_review",
        },
      ],
    });

    const res = await request(app).get("/coding-review/post-visit?startDate=2026-05-20&endDate=2026-05-24");

    expect(res.status).toBe(200);
    expect(res.body.items[0].issues).toContain("claim_coding_review");
    expect(res.body.items[0].issues).not.toContain("superbill_open");
    expect(res.body.items[0].reviewRoute).toBe("/patients/patient-3/encounter/enc-3?section=billing");
  });

  it("rejects invalid dates", async () => {
    const res = await request(app).get("/coding-review/post-visit?startDate=bad");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
