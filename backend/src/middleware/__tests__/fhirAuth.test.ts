import {
  requireFHIRAuth,
  requireFHIRScope,
  logFHIRAccess,
  parseScopes,
  checkScopePermission,
  getFHIRPatientContext,
} from "../fhirAuth";
import { pool } from "../../db/pool";
import { createAuditLog } from "../../services/audit";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  createAuditLog: jest.fn(),
}));

const queryMock = pool.query as jest.Mock;
const auditMock = createAuditLog as jest.Mock;

const createRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FHIR auth middleware", () => {
  beforeEach(() => {
    queryMock.mockReset();
    auditMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    auditMock.mockResolvedValue({});
  });

  it("rejects missing auth header", async () => {
    const req: any = { headers: {}, ip: "1.1.1.1", get: jest.fn(), query: {} };
    const res = createRes();
    const next = jest.fn();
    await requireFHIRAuth(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects invalid token", async () => {
    const req: any = { headers: { authorization: "Bearer token" }, ip: "1.1.1.1", get: jest.fn(), query: {} };
    const res = createRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({ rows: [] });
    await requireFHIRAuth(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(auditMock).toHaveBeenCalled();
  });

  it("rejects expired token", async () => {
    const req: any = { headers: { authorization: "Bearer token" }, ip: "1.1.1.1", get: jest.fn(), query: {} };
    const res = createRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "tok-1", tenant_id: "tenant-1", client_id: "client-1", scope: "user/*.read", expires_at: "2000-01-01T00:00:00Z" }],
    });
    await requireFHIRAuth(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts valid token", async () => {
    const req: any = { headers: { authorization: "Bearer token" }, ip: "1.1.1.1", get: jest.fn(), query: {}, path: "/fhir/Patient" };
    const res = createRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "tok-1", tenant_id: "tenant-1", client_id: "client-1", client_name: "Test", scope: "user/*.read", expires_at: null }],
    });
    queryMock.mockResolvedValueOnce({ rows: [] }); // update last_used
    await requireFHIRAuth(req, res as any, next);
    expect(next).toHaveBeenCalled();
    expect(req.fhirAuth).toBeTruthy();
  });

  it("rejects patient-scoped tokens without launch patient context", async () => {
    const req: any = { headers: { authorization: "Bearer patient-token" }, ip: "1.1.1.1", get: jest.fn(), query: {} };
    const res = createRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "tok-patient", tenant_id: "tenant-1", client_id: "client-1", scope: "patient/*.read", expires_at: null }],
    });

    await requireFHIRAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].issue[0].diagnostics).toContain("patient context");
  });

  it("attaches patient launch context and accepts SMART v2 read/search scopes", async () => {
    const req: any = { headers: { authorization: "Bearer patient-token" }, ip: "1.1.1.1", get: jest.fn(), query: {}, path: "/fhir/AllergyIntolerance" };
    const res = createRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "tok-patient", tenant_id: "tenant-1", client_id: "client-1", scope: "patient/AllergyIntolerance.rs", patient_id: "p1", expires_at: null }],
    });
    queryMock.mockResolvedValueOnce({ rows: [] });

    await requireFHIRAuth(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.fhirAuth.patientId).toBe("p1");
    expect(parseScopes("patient/AllergyIntolerance.rs")).toEqual(["patient/AllergyIntolerance.rs"]);
    expect(checkScopePermission(["patient/AllergyIntolerance.rs"], "AllergyIntolerance", "search")).toBe(true);
  });

  it("requireFHIRScope blocks without auth", async () => {
    const middleware = requireFHIRScope("Patient", "read");
    const req: any = { fhirAuth: undefined };
    const res = createRes();
    const next = jest.fn();
    middleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("requireFHIRScope blocks insufficient scope", async () => {
    const middleware = requireFHIRScope("Patient", "write");
    const req: any = { fhirAuth: { tenantId: "tenant-1", clientId: "client-1", scope: ["user/*.read"] }, ip: "1.1.1.1" };
    const res = createRes();
    const next = jest.fn();
    middleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("requireFHIRScope allows when scope matches", async () => {
    const middleware = requireFHIRScope("Patient", "read");
    const req: any = { fhirAuth: { tenantId: "tenant-1", clientId: "client-1", scope: ["user/*.read"] }, ip: "1.1.1.1" };
    const res = createRes();
    const next = jest.fn();
    middleware(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks patient tokens from unrelated resources", () => {
    const middleware = requireFHIRScope("Organization", "read");
    const req: any = {
      fhirAuth: { tenantId: "tenant-1", clientId: "client-1", scope: ["patient/*.read"], patientId: "p1" },
      ip: "1.1.1.1",
      query: {},
      params: {},
      path: "/fhir/Organization",
    };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks patient tokens from another patient's resource", () => {
    const middleware = requireFHIRScope("AllergyIntolerance", "read");
    const req: any = {
      fhirAuth: { tenantId: "tenant-1", clientId: "client-1", scope: ["patient/*.read"], patientId: "p1" },
      ip: "1.1.1.1",
      query: { patient: "Patient/p2" },
      params: {},
      path: "/fhir/AllergyIntolerance",
    };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not treat a member resource _id filter as a patient id", () => {
    const req: any = {
      fhirAuth: { tenantId: "tenant-1", clientId: "client-1", scope: ["patient/*.read"], patientId: "p1" },
      query: { _id: "allergy-1" },
      params: {},
      path: "/fhir/AllergyIntolerance",
    };

    expect(getFHIRPatientContext(req, "AllergyIntolerance", "read")).toBe("p1");
  });

  it("logFHIRAccess no-ops without auth", async () => {
    const req: any = { fhirAuth: undefined };
    await logFHIRAccess(req, "Patient", "p1", "read");
    expect(auditMock).not.toHaveBeenCalled();
  });
});
