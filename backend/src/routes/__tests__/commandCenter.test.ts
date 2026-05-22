import request from "supertest";
import express from "express";
import { commandCenterRouter } from "../commandCenter";
import { pool } from "../../db/pool";

let mockUser = {
  id: "admin-1",
  tenantId: "tenant-1",
  role: "admin",
  roles: ["admin"],
  email: "admin@example.test",
  fullName: "Admin User",
};

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = mockUser;
    req.tenantId = mockUser.tenantId;
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/command-center", commandCenterRouter);

const queryMock = pool.query as jest.Mock;

function mockCommandCenterQueries() {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes("with day_appointments")) {
      return {
        rows: [
          {
            appointments_count: "31",
            active_appointments_count: "3",
            checked_in_count: "1",
            completed_count: "26",
            waiting_count: "1",
            in_rooms_count: "2",
            checkout_count: "1",
            stale_scheduled_count: "1",
            no_show_count: "2",
            cancelled_count: "1",
            needs_insurance_verification: "4",
            balance_due_appointments: "5",
            copay_due_cents: "17500",
          },
        ],
      };
    }

    if (sql.includes("from claims")) {
      return {
        rows: [
          {
            claims_in_queue: "8",
            claims_denied_rejected: "3",
          },
        ],
      };
    }

    if (sql.includes("from patient_payments")) {
      return {
        rows: [
          {
            patient_collections_cents: "90000",
            payer_collections_cents: "240000",
            store_collections_cents: "35000",
            revenue_today_cents: "410000",
          },
        ],
      };
    }

    if (sql.includes("from financial_work_queue")) {
      return {
        rows: [
          {
            financial_work_queue_count: "6",
            claim_work_queue_count: "4",
            billing_work_queue_count: "2",
          },
        ],
      };
    }

    if (sql.includes("ar_total_cents")) {
      return {
        rows: [
          {
            ar_total_cents: "1200000",
            ar_over_90_cents: "250000",
          },
        ],
      };
    }

    return { rows: [] };
  });
}

beforeEach(() => {
  queryMock.mockReset();
  mockUser = {
    id: "admin-1",
    tenantId: "tenant-1",
    role: "admin",
    roles: ["admin"],
    email: "admin@example.test",
    fullName: "Admin User",
  };
});

describe("Command Center routes", () => {
  it("GET /command-center/summary returns role-aware source-of-truth metrics", async () => {
    mockCommandCenterQueries();

    const res = await request(app).get("/command-center/summary?date=2026-05-18");

    expect(res.status).toBe(200);
    expect(res.body.businessDate).toBe("2026-05-18");
    expect(res.body.schedule.appointmentsCount).toBe(31);
    expect(res.body.schedule.completedCount).toBe(26);
    expect(res.body.schedule.checkoutCount).toBe(1);
    expect(res.body.claims.claimsInQueue).toBe(8);
    expect(res.body.claims.claimsDeniedRejected).toBe(3);
    expect(res.body.financials.revenueTodayCents).toBe(410000);
    expect(res.body.financials.netCollectionsCents).toBe(330000);
    expect(res.body.financials.storeCollectionsCents).toBe(35000);
    expect(res.body.financials.collectionRateToday).toBe(89);
    expect(res.body.financials.financialWorkQueueCount).toBe(6);
    expect(res.body.financials.arOver90Cents).toBe(250000);
    expect(res.body.dataHealth.failedSources).toEqual([]);

    const scheduleSql = String(queryMock.mock.calls.find(([sql]) => String(sql).includes("with day_appointments"))?.[0] || "");
    expect(scheduleSql).toContain("count(*) as appointments_count");
    expect(scheduleSql).toContain("status = 'checkout') as checkout_count");
    expect(scheduleSql).not.toContain("status in ('completed', 'checked_out')) as checkout_count");
    expect(scheduleSql).not.toContain("status <> 'cancelled') as appointments_count");
  });

  it("hides financial metrics from front desk users while keeping claims visible", async () => {
    mockUser = {
      ...mockUser,
      id: "front-desk-1",
      role: "front_desk",
      roles: ["front_desk"],
    };
    mockCommandCenterQueries();

    const res = await request(app).get("/command-center/summary?date=2026-05-18");

    expect(res.status).toBe(200);
    expect(res.body.schedule.appointmentsCount).toBe(31);
    expect(res.body.claims.claimsInQueue).toBe(8);
    expect(res.body.financials).toBeNull();
    expect(String(queryMock.mock.calls.map(([sql]) => sql).join("\n"))).not.toContain("from patient_payments");
  });

  it("returns data health when an optional source is unavailable", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("with day_appointments")) {
        return { rows: [{ appointments_count: "1" }] };
      }
      if (sql.includes("from claims")) {
        throw new Error("claims table unavailable");
      }
      return { rows: [] };
    });

    const res = await request(app).get("/command-center/summary?date=2026-05-18");

    expect(res.status).toBe(200);
    expect(res.body.schedule.appointmentsCount).toBe(1);
    expect(res.body.claims.claimsInQueue).toBe(0);
    expect(res.body.dataHealth.failedSources).toEqual([
      { source: "claims", message: "claims table unavailable" },
    ]);
  });

  it("rejects invalid dates", async () => {
    const res = await request(app).get("/command-center/summary?date=05-18-2026");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
