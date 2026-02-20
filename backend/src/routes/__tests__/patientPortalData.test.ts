import request from "supertest";
import express from "express";
import crypto from "crypto";
import fs from "fs";
import { patientPortalDataRouter } from "../patientPortalData";
import { pool } from "../../db/pool";

jest.mock("../../middleware/patientPortalAuth", () => ({
  requirePatientAuth: (req: any, _res: any, next: any) => {
    req.patient = {
      tenantId: "tenant-1",
      patientId: "patient-1",
      accountId: "account-1",
      email: "patient@example.com",
    };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
  mkdirSync: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/patient-portal-data", patientPortalDataRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const existsSyncMock = fs.existsSync as jest.Mock;
const createReadStreamMock = fs.createReadStream as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  existsSyncMock.mockReset();
  createReadStreamMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Patient portal data routes", () => {
  it("POST /patient-portal-data/checkin/start rejects invalid appointment id", async () => {
    const res = await request(app)
      .post("/patient-portal-data/checkin/start")
      .send({ appointmentId: "not-a-uuid" });

    expect(res.status).toBe(400);
  });

  it("POST /patient-portal-data/checkin/start returns 404 for missing appointment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal-data/checkin/start")
      .send({ appointmentId: "11111111-1111-4111-8111-111111111111" });

    expect(res.status).toBe(404);
  });

  it("POST /patient-portal-data/checkin/start creates session", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/patient-portal-data/checkin/start")
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe("uuid-1");
  });

  it("PUT /patient-portal-data/checkin/:id/demographics returns 404 for missing session", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/patient-portal-data/checkin/session-1/demographics")
      .send({ phone: "555-111-2222" });

    expect(res.status).toBe(404);
  });

  it("PUT /patient-portal-data/checkin/:id/demographics updates patient and session", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "session-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/patient-portal-data/checkin/session-1/demographics")
      .send({ phone: "555-111-2222", city: "Boston" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("PUT /patient-portal-data/checkin/:id/complete confirms appointment", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "session-1", appointment_id: "appt-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/patient-portal-data/checkin/session-1/complete")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.appointmentId).toBe("appt-1");
  });

  it("GET /patient-portal-data/appointments returns past appointments", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "appt-1" }] });

    const res = await request(app).get("/patient-portal-data/appointments?status=past");

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(1);
  });

  it("GET /patient-portal-data/visit-summaries returns summaries", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "summary-1" }] });

    const res = await request(app).get("/patient-portal-data/visit-summaries");

    expect(res.status).toBe(200);
    expect(res.body.summaries).toHaveLength(1);
  });

  it("GET /patient-portal-data/documents filters by category", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "doc-1" }] });

    const res = await request(app).get("/patient-portal-data/documents?category=lab");

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });

  it("GET /patient-portal-data/documents/:id/download returns 404 when not shared", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/patient-portal-data/documents/doc-1/download");

    expect(res.status).toBe(404);
  });

  it("GET /patient-portal-data/documents/:id/download streams file", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "share-1",
            viewed_at: null,
            file_path: "uploads/doc.pdf",
            title: "Doc",
            file_type: "application/pdf",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    existsSyncMock.mockReturnValue(true);
    createReadStreamMock.mockReturnValue({
      pipe: (res: any) => res.end("file"),
    });

    const res = await request(app).get("/patient-portal-data/documents/doc-1/download");

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toBe("application/pdf");
    expect(res.header["content-disposition"]).toContain("attachment");
  });

  it("GET /patient-portal-data/prescriptions returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get("/patient-portal-data/prescriptions");

    expect(res.status).toBe(200);
    expect(res.body.prescriptions).toHaveLength(1);
  });

  it("GET /patient-portal-data/vitals maps vital signs", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          encounterDate: "2025-01-01",
          vitalSigns: { weight: 120 },
          providerName: "Dr Test",
        },
      ],
    });

    const res = await request(app).get("/patient-portal-data/vitals");

    expect(res.status).toBe(200);
    expect(res.body.vitals[0]).toMatchObject({
      date: "2025-01-01",
      provider: "Dr Test",
      weight: 120,
    });
  });

  it("GET /patient-portal-data/lab-results returns empty when table missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ exists: false }] });

    const res = await request(app).get("/patient-portal-data/lab-results");

    expect(res.status).toBe(200);
    expect(res.body.labResults).toHaveLength(0);
  });

  it("GET /patient-portal-data/allergies parses allergies", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ allergies: "Peanuts, Shellfish" }] });

    const res = await request(app).get("/patient-portal-data/allergies");

    expect(res.status).toBe(200);
    expect(res.body.allergies).toHaveLength(2);
    expect(res.body.allergies[0].allergen).toBe("Peanuts");
  });

  it("GET /patient-portal-data/medications returns active meds", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ medicationName: "Med-1" }] });

    const res = await request(app).get("/patient-portal-data/medications");

    expect(res.status).toBe(200);
    expect(res.body.medications).toHaveLength(1);
  });

  it("GET /patient-portal-data/dashboard aggregates counts", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ appointmentDate: "2025-01-02" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ count: "4" }] });

    const res = await request(app).get("/patient-portal-data/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.dashboard).toMatchObject({
      upcomingAppointments: 2,
      newDocuments: 1,
      newVisits: 3,
      activePrescriptions: 4,
    });
  });
});
