import request from "supertest";
import express from "express";
import { analyticsRouter } from "../analytics";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: { query: jest.fn() },
}));

const app = express();
app.use(express.json());
app.use("/analytics", analyticsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ count: "1" }] });
});

describe("Analytics routes", () => {
  it("GET /analytics/summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ count: "4" }] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ count: "6" }] })
      .mockResolvedValueOnce({ rows: [{ total: "700" }] });
    const res = await request(app).get("/analytics/summary");
    expect(res.status).toBe(200);
    expect(res.body.counts.patients).toBe(2);
  });

  it("GET /analytics/appointments-by-day", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", count: "1" }] });
    const res = await request(app).get("/analytics/appointments-by-day?startDate=2025-01-01&endDate=2025-01-10&providerId=provider-1");
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(1);
  });

  it("GET /analytics/appointments-by-provider", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ provider: "Dr", count: "2" }] });
    const res = await request(app).get("/analytics/appointments-by-provider?startDate=2025-01-01&endDate=2025-01-10&providerId=provider-1");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/status-counts", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "scheduled", count: "2" }] });
    const res = await request(app).get("/analytics/status-counts?startDate=2025-01-01&endDate=2025-01-10&providerId=provider-1");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/revenue-by-day", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", amount: "100" }] });
    const res = await request(app).get("/analytics/revenue-by-day?startDate=2025-01-01&endDate=2025-01-10");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/dashboard", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "10" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ total: "900" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });
    const res = await request(app).get("/analytics/dashboard?startDate=2025-01-01&endDate=2025-01-10");
    expect(res.status).toBe(200);
    expect(res.body.totalPatients).toBe(10);
  });

  it("GET /analytics/appointments/trend", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", count: "1" }] });
    const res = await request(app).get("/analytics/appointments/trend?startDate=2025-01-01&endDate=2025-01-10");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/revenue/trend", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", amount: "100" }] });
    const res = await request(app).get("/analytics/revenue/trend?startDate=2025-01-01&endDate=2025-01-10");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/top-diagnoses", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "L20.9", count: "1" }] });
    const res = await request(app).get("/analytics/top-diagnoses?startDate=2025-01-01&endDate=2025-01-10");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/top-procedures", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "11100", count: "1" }] });
    const res = await request(app).get("/analytics/top-procedures?startDate=2025-01-01&endDate=2025-01-10");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/provider-productivity", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ provider: "Dr", count: "1" }] });
    const res = await request(app).get("/analytics/provider-productivity");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/patient-demographics", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ label: "18-24", count: "1" }] });
    const res = await request(app).get("/analytics/patient-demographics");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/appointment-types", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ name: "Consult", count: "1" }] });
    const res = await request(app).get("/analytics/appointment-types?startDate=2025-01-01&endDate=2025-01-10");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/overview", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // currentPatients
      .mockResolvedValueOnce({ rows: [{ count: "5" }] }) // previousPatients
      .mockResolvedValueOnce({ rows: [{ count: "20" }] }) // currentAppointments
      .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // previousAppointments
      .mockResolvedValueOnce({ rows: [{ total: "1000" }] }) // currentRevenue
      .mockResolvedValueOnce({ rows: [{ total: "500" }] }) // previousRevenue
      .mockResolvedValueOnce({ rows: [{ status: "scheduled", count: "3" }] }) // status breakdown
      .mockResolvedValueOnce({ rows: [{ total_charges: "2000", paid_charges: "1000" }] }); // collection rate

    const res = await request(app).get("/analytics/overview?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.newPatients.current).toBe(10);
    expect(res.body.newPatients.previous).toBe(5);
    expect(res.body.newPatients.trend).toBe(100);
    expect(res.body.collectionRate).toBe(50);
  });

  it("GET /analytics/appointments", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: "scheduled", count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ type_name: "Consult", count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ provider_name: "Dr A", count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ avg_wait_minutes: 12.5 }] });

    const res = await request(app).get("/analytics/appointments?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.byStatus).toHaveLength(1);
    expect(res.body.byType).toHaveLength(1);
    expect(res.body.byProvider).toHaveLength(1);
    expect(res.body.avgWaitTimeMinutes).toBe(12.5);
  });

  it("GET /analytics/revenue", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            total_charges: "4",
            total_billed: "2000",
            total_paid: "1000",
            total_pending: "700",
            total_denied: "300",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ payment_method: "card", count: "2", total_amount: "500" }] })
      .mockResolvedValueOnce({ rows: [{ description: "Procedure A", count: "1", total_revenue: "1500" }] });

    const res = await request(app).get("/analytics/revenue?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.summary.totalCharges).toBe(4);
    expect(res.body.summary.collectionRate).toBe(50);
    expect(res.body.paymentMethods).toHaveLength(1);
    expect(res.body.topProcedures).toHaveLength(1);
  });

  it("GET /analytics/patients", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "25" }] })
      .mockResolvedValueOnce({ rows: [{ month: "2025-01-01", count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ age_group: "18-34", gender: "F", count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ insurance_provider: "ACME", count: "2" }] });

    const res = await request(app).get("/analytics/patients?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.totalPatients).toBe(25);
    expect(res.body.newPatientsPerMonth).toHaveLength(1);
    expect(res.body.demographics).toHaveLength(1);
    expect(res.body.payerMix).toHaveLength(1);
  });

  it("GET /analytics/providers", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ provider_name: "Dr A", completed_appointments: "4", revenue_cents: "1200" }],
    });

    const res = await request(app).get("/analytics/providers?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("GET /analytics/quality", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ signed: "6", draft: "2", total: "8" }] })
      .mockResolvedValueOnce({ rows: [{ with_cc: "6", with_assessment: "5", with_plan: "4", total: "8" }] })
      .mockResolvedValueOnce({ rows: [{ with_followup: "3", total: "6" }] });

    const res = await request(app).get("/analytics/quality?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.encounterCompletion.rate).toBe(75);
    expect(res.body.documentation.chiefComplaintCompliance).toBe(75);
    expect(res.body.followUp.rate).toBe(50);
  });
});
