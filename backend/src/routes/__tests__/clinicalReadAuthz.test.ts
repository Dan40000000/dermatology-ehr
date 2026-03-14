import express from "express";
import request from "supertest";
import { notesRouter } from "../notes";
import { diagnosesRouter } from "../diagnoses";
import { ordersRouter } from "../orders";
import { prescriptionsRouter } from "../prescriptions";
import { bodyMapMarkersRouter } from "../bodyMapMarkers";
import { photosRouter } from "../photos";
import { encountersRouter } from "../encounters";
import { labResultsRouter } from "../labResults";
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
app.use("/api/notes", notesRouter);
app.use("/api/diagnoses", diagnosesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/body-map-markers", bodyMapMarkersRouter);
app.use("/api/photos", photosRouter);
app.use("/api/encounters", encountersRouter);
app.use("/api/lab-results", labResultsRouter);

const queryMock = pool.query as jest.Mock;
const getTableColumnsMock = getTableColumns as jest.Mock;

const SENSITIVE_READ_ENDPOINTS = [
  "/api/notes",
  "/api/diagnoses/encounter/encounter-1",
  "/api/orders",
  "/api/prescriptions",
  "/api/body-map-markers",
  "/api/photos",
  "/api/encounters",
  "/api/lab-results",
] as const;

const CLINICAL_ROLES = ["provider", "admin", "ma", "nurse", "manager", "compliance_officer"] as const;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  getTableColumnsMock.mockReset();
  getTableColumnsMock.mockResolvedValue(
    new Set([
      "id",
      "patient_id",
      "encounter_id",
      "photo_type",
      "body_location",
      "body_region",
      "created_at",
      "updated_at",
      "is_deleted",
      "is_clinical",
    ]),
  );
});

describe("Clinical read endpoint authz", () => {
  it.each(SENSITIVE_READ_ENDPOINTS)("blocks front desk role from %s", async (path) => {
    const res = await request(app).get(path).set("x-test-role", "front_desk");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Insufficient role");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each(
    CLINICAL_ROLES.flatMap((role) => SENSITIVE_READ_ENDPOINTS.map((path) => ({ role, path }))),
  )("allows %s role through middleware for %s", async ({ role, path }) => {
    const res = await request(app).get(path).set("x-test-role", role);

    expect(res.status).not.toBe(403);
    expect(queryMock).toHaveBeenCalled();
  });
});
