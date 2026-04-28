import request from "supertest";
import express from "express";
import { downtimePacketsRouter } from "../downtimePackets";
import { pool } from "../../db/pool";
import { getTableColumns } from "../../db/schema";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "front_desk" };
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

jest.mock("../../db/schema", () => ({
  getTableColumns: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/downtime-packets", downtimePacketsRouter);

const queryMock = pool.query as jest.Mock;
const getTableColumnsMock = getTableColumns as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  getTableColumnsMock.mockReset();
  getTableColumnsMock.mockImplementation(async (tableName: string) => {
    switch (tableName) {
      case "patients":
        return new Set([
          "mrn",
          "dob",
          "phone",
          "address",
          "city",
          "state",
          "zip",
          "insurance",
          "insurance_id",
          "insurance_group_number",
          "allergies",
          "medications",
          "current_symptoms",
          "past_medical_history",
        ]);
      case "appointments":
        return new Set(["reason", "notes", "scheduled_end"]);
      case "encounters":
        return new Set(["chief_complaint", "assessment_plan", "created_at", "updated_at"]);
      case "visit_summaries":
        return new Set(["summary_text", "chief_complaint", "diagnosis_shared", "visit_date", "created_at"]);
      case "prescriptions":
        return new Set(["medication_name", "prescribed_date", "created_at"]);
      case "patient_allergies":
        return new Set(["allergen", "reaction", "status"]);
      default:
        return new Set();
    }
  });
});

describe("Downtime packet routes", () => {
  it("POST /downtime-packets/generate returns packet data", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "loc-1",
            name: "Main Clinic",
            address: "1 Main St",
            phone: "5551234567",
            downtimePacketsEnabled: true,
            downtimePacketTime: "05:00",
            downtimeDeviceProfile: "desktop",
            downtimeIncludeDob: true,
            downtimeIncludePhone: true,
            downtimeIncludeInsurance: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            appointmentId: "appt-1",
            scheduledStart: "2026-04-13T09:00:00.000Z",
            status: "scheduled",
            patientName: "Sarah Johnson",
            dob: "1980-01-01",
            phone: "5551234567",
            insurance: "Aetna",
            providerName: "Dr. Demo",
            appointmentTypeName: "Follow-up",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

    const res = await request(app).post("/downtime-packets/generate").send({
      locationId: "loc-1",
      date: "2026-04-13",
    });

    expect(res.status).toBe(200);
    expect(res.body.packet.location.name).toBe("Main Clinic");
    expect(res.body.packet.settings.deviceProfile).toBe("desktop");
    expect(res.body.packet.appointments).toHaveLength(1);
    expect(res.body.packet.counts.total).toBe(1);
    expect(res.body.changed).toBe(true);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('a.scheduled_start >= $3'),
      ["tenant-1", "loc-1", expect.any(Date), expect.any(Date)],
    );
  });

  it("POST /downtime-packets/generate rejects missing locationId", async () => {
    const res = await request(app).post("/downtime-packets/generate").send({ date: "2026-04-13" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("locationId");
  });

  it("GET /downtime-packets/ready returns stored packet", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "packet-1",
          generatedAt: "2026-04-12T19:00:00.000Z",
          packetPayload: {
            date: "2026-04-13",
            generatedAt: "2026-04-12T19:00:00.000Z",
            location: { id: "loc-1", name: "Main Clinic", address: "1 Main St", phone: "5551234567" },
            settings: {
              enabled: true,
              packetTime: "12:00",
              deviceProfile: "desktop",
              includeDob: true,
              includePhone: true,
              includeInsurance: true,
            },
            counts: { total: 1, byStatus: { scheduled: 1 } },
            appointments: [],
          },
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/downtime-packets/ready").query({
      locationId: "loc-1",
      date: "2026-04-13",
    });

    expect(res.status).toBe(200);
    expect(res.body.packet.date).toBe("2026-04-13");
    expect(res.body.packet.settings.packetTime).toBe("12:00");
  });

  it("POST /downtime-packets/device-status updates assigned device heartbeat", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "loc-1" }],
      rowCount: 1,
    });

    const res = await request(app).post("/downtime-packets/device-status").send({
      deviceId: "device-1",
      reports: [
        {
          locationId: "loc-1",
          lastPacketSavedAt: "2026-04-27T18:05:00.000Z",
          lastPacketDate: "2026-04-28",
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.updatedLocationIds).toEqual(["loc-1"]);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("downtime_primary_device_last_seen_at"),
      ["2026-04-27T18:05:00.000Z", "2026-04-28", "tenant-1", "loc-1", "device-1"],
    );
  });
});
