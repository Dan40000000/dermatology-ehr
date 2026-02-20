import request from "supertest";
import express from "express";
import { reportsRouter } from "../reports";
import { pool } from "../../db/pool";
import * as reportService from "../../services/reportService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin", fullName: "Admin User" };
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

jest.mock("../../services/reportService");

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/reports", reportsRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  jest.clearAllMocks();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Reports routes - Appointments", () => {
  it("POST /reports/appointments generates report", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        time: "10:00",
        patientName: "John Doe",
        providerName: "Dr. Smith",
        locationName: "Main Clinic",
        appointmentType: "Follow-up",
        status: "completed",
        duration: 30,
      },
    ];

    jest.spyOn(reportService, "generateAppointmentReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/appointments").send({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  it("POST /reports/appointments returns CSV format", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        time: "10:00",
        patientName: "John Doe",
        providerName: "Dr. Smith",
        locationName: "Main Clinic",
        appointmentType: "Follow-up",
        status: "completed",
        duration: 30,
      },
    ];

    jest.spyOn(reportService, "generateAppointmentReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/appointments").send({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      format: "csv",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("Appointments_Report");
    expect(res.text).toContain("Date,Time,Patient");
  });

  it("POST /reports/appointments handles errors", async () => {
    jest.spyOn(reportService, "generateAppointmentReport").mockRejectedValue(new Error("Report error"));

    const res = await request(app).post("/reports/appointments").send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to generate report");
    expect(loggerMock.error).toHaveBeenCalledWith("Error generating appointment report:", {
      error: "Report error",
    });
  });

  it("POST /reports/appointments masks non-Error failures", async () => {
    jest.spyOn(reportService, "generateAppointmentReport").mockRejectedValue({ patientName: "Jane Doe" });

    const res = await request(app).post("/reports/appointments").send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to generate report");
    expect(loggerMock.error).toHaveBeenCalledWith("Error generating appointment report:", {
      error: "Unknown error",
    });
  });

  it("POST /reports/appointments rejects invalid filters", async () => {
    const res = await request(app).post("/reports/appointments").send({
      format: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("Reports routes - Financial", () => {
  it("POST /reports/financial generates report", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        patientName: "John Doe",
        services: "Consultation",
        chargesCents: 15000,
        paymentsCents: 15000,
        balanceCents: 0,
        claimNumber: "CLM001",
      },
    ];

    const mockSummary = {
      totalCharges: 15000,
      totalPayments: 15000,
      totalOutstanding: 0,
    };

    jest.spyOn(reportService, "generateFinancialReport").mockResolvedValue(mockData);
    jest.spyOn(reportService, "getFinancialSummary").mockResolvedValue(mockSummary);

    const res = await request(app).post("/reports/financial").send({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.summary).toBeDefined();
  });

  it("POST /reports/financial returns CSV with summary", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        patientName: "John Doe",
        services: "Consultation",
        chargesCents: 15000,
        paymentsCents: 15000,
        balanceCents: 0,
        claimNumber: "CLM001",
      },
    ];

    const mockSummary = {
      totalCharges: 15000,
      totalPayments: 15000,
      totalOutstanding: 0,
    };

    jest.spyOn(reportService, "generateFinancialReport").mockResolvedValue(mockData);
    jest.spyOn(reportService, "getFinancialSummary").mockResolvedValue(mockSummary);

    const res = await request(app).post("/reports/financial").send({
      format: "csv",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("SUMMARY");
    expect(res.text).toContain("150.00");
  });
});

describe("Reports routes - Clinical", () => {
  it("POST /reports/clinical generates report", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        patientName: "John Doe",
        diagnosisCode: "L40.0",
        diagnosisDescription: "Psoriasis vulgaris",
        procedureCode: "99213",
        procedureDescription: "Office visit",
        providerName: "Dr. Smith",
      },
    ];

    jest.spyOn(reportService, "generateClinicalReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/clinical").send({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("POST /reports/clinical returns CSV format", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        patientName: "John Doe",
        diagnosisCode: "L40.0",
        diagnosisDescription: "Psoriasis vulgaris",
        procedureCode: "99213",
        procedureDescription: "Office visit",
        providerName: "Dr. Smith",
      },
    ];

    jest.spyOn(reportService, "generateClinicalReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/clinical").send({
      format: "csv",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Diagnosis Code");
  });
});

describe("Reports routes - Patient List", () => {
  it("POST /reports/patients generates report", async () => {
    const mockData = [
      {
        name: "John Doe",
        dob: "1980-01-01",
        age: 44,
        gender: "M",
        phone: "555-1234",
        email: "john@example.com",
        lastVisit: "2024-01-01",
        status: "Active",
      },
    ];

    jest.spyOn(reportService, "generatePatientListReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/patients").send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("POST /reports/patients returns CSV format", async () => {
    const mockData = [
      {
        name: "John Doe",
        dob: "1980-01-01",
        age: 44,
        gender: "M",
        phone: "555-1234",
        email: "john@example.com",
        lastVisit: "2024-01-01",
        status: "Active",
      },
    ];

    jest.spyOn(reportService, "generatePatientListReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/patients").send({
      format: "csv",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Date of Birth");
  });
});

describe("Reports routes - Provider Productivity", () => {
  it("POST /reports/productivity generates report", async () => {
    const mockData = [
      {
        providerName: "Dr. Smith",
        patientsSeen: 50,
        appointments: 55,
        revenueCents: 500000,
        avgPerPatientCents: 10000,
      },
    ];

    jest.spyOn(reportService, "generateProviderProductivityReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/productivity").send({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("POST /reports/productivity returns CSV format", async () => {
    const mockData = [
      {
        providerName: "Dr. Smith",
        patientsSeen: 50,
        appointments: 55,
        revenueCents: 500000,
        avgPerPatientCents: 10000,
      },
    ];

    jest.spyOn(reportService, "generateProviderProductivityReport").mockResolvedValue(mockData);

    const res = await request(app).post("/reports/productivity").send({
      format: "csv",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("5000.00");
    expect(res.text).toContain("100.00");
  });
});

describe("Reports routes - No-Show", () => {
  it("POST /reports/no-shows generates report", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        patientName: "John Doe",
        providerName: "Dr. Smith",
        appointmentType: "Follow-up",
        reason: "No reason given",
        status: "no_show",
      },
    ];

    jest.spyOn(reportService, "generateNoShowReport").mockResolvedValue(mockData);
    queryMock.mockResolvedValueOnce({ rows: [{ total: "100" }], rowCount: 1 });

    const res = await request(app).post("/reports/no-shows").send({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.noShowRate).toBe("1.00");
    expect(res.body.totalAppointments).toBe(100);
  });

  it("POST /reports/no-shows returns CSV with rate", async () => {
    const mockData = [
      {
        date: "2024-01-01",
        patientName: "John Doe",
        providerName: "Dr. Smith",
        appointmentType: "Follow-up",
        reason: "No reason given",
        status: "no_show",
      },
    ];

    jest.spyOn(reportService, "generateNoShowReport").mockResolvedValue(mockData);
    queryMock.mockResolvedValueOnce({ rows: [{ total: "50" }], rowCount: 1 });

    const res = await request(app).post("/reports/no-shows").send({
      format: "csv",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("No-Show Rate");
  });
});

describe("Reports routes - Filter endpoints", () => {
  it("GET /reports/filters/providers returns providers", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: "provider-1", name: "Dr. Smith" },
        { id: "provider-2", name: "Dr. Jones" },
      ],
      rowCount: 2,
    });

    const res = await request(app).get("/reports/filters/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(2);
  });

  it("GET /reports/filters/locations returns locations", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: "location-1", name: "Main Clinic" },
        { id: "location-2", name: "Downtown Office" },
      ],
      rowCount: 2,
    });

    const res = await request(app).get("/reports/filters/locations");

    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(2);
  });

  it("GET /reports/filters/appointment-types returns appointment types", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: "type-1", name: "New Patient" },
        { id: "type-2", name: "Follow-up" },
      ],
      rowCount: 2,
    });

    const res = await request(app).get("/reports/filters/appointment-types");

    expect(res.status).toBe(200);
    expect(res.body.appointmentTypes).toHaveLength(2);
  });
});

describe("Reports routes - Legacy export", () => {
  it("GET /reports/appointments/export returns CSV", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "appt-1",
          patient: "John Doe",
          provider: "Dr. Smith",
          scheduled_start: "2024-01-01T10:00:00Z",
          scheduled_end: "2024-01-01T10:30:00Z",
          status: "completed",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/reports/appointments/export");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("appointments.csv");
    expect(res.text).toContain("id,patient,provider");
  });
});

describe("Reports routes - Error handling", () => {
  it("handles database errors gracefully", async () => {
    queryMock.mockRejectedValueOnce(new Error("Database error"));

    const res = await request(app).get("/reports/filters/providers");

    expect(res.status).toBe(500);
  });
});
