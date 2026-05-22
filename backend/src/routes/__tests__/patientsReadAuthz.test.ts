import express from "express";
import request from "supertest";
import { patientsRouter } from "../patients";
import { pool } from "../../db/pool";
import { getTableColumns } from "../../db/schema";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const role = String(req.headers["x-test-role"] || "provider");
    req.user = { id: "user-1", tenantId: "tenant-1", role };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../db/schema", () => ({
  getTableColumns: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/patients", patientsRouter);

const queryMock = pool.query as jest.Mock;
const getTableColumnsMock = getTableColumns as jest.Mock;

const AUTHZ_CASES = [
  {
    path: "/api/patients",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/appointments",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/encounters",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/prescriptions",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/prior-auths",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/biopsies",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/balance",
    allowedRoles: ["admin", "billing", "front_desk", "manager", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/photos",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/body-map",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  },
  {
    path: "/api/patients/patient-1/insurance",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  },
] as const;

const ALL_ROLES = [
  "admin",
  "provider",
  "ma",
  "front_desk",
  "billing",
  "nurse",
  "manager",
  "scheduler",
  "compliance_officer",
  "staff",
  "hr",
] as const;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ id: "patient-1" }], rowCount: 1 });
  getTableColumnsMock.mockReset();
  getTableColumnsMock.mockResolvedValue(new Set(["id", "status"]));
});

describe("Patient clinical read endpoint authz", () => {
  it.each(
    AUTHZ_CASES.flatMap(({ path, allowedRoles }) =>
      ALL_ROLES.map((role) => ({ path, role, allowed: allowedRoles.includes(role as any) })),
    ),
  )("enforces module authz for %s role on %s", async ({ path, role, allowed }) => {
    const res = await request(app).get(path).set("x-test-role", role);

    if (allowed) {
      expect(res.status).not.toBe(403);
      expect(queryMock).toHaveBeenCalled();
      return;
    }

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Insufficient role");
    if (queryMock.mock.calls.length > 0) {
      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(String(queryMock.mock.calls[0]?.[0])).toContain("tenant_access_settings");
    }
  });
});
