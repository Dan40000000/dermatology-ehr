import request from "supertest";
import express from "express";
import { locationsRouter } from "../locations";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/locations", locationsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
});

describe("Locations routes", () => {
  it("GET /locations returns list", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "loc-1",
        name: "Main",
        downtimePacketsEnabled: true,
        downtimePacketTime: "05:30",
        downtimeDeviceProfile: "ipad",
        downtimePrimaryDeviceId: "device-1",
        downtimePrimaryDeviceLabel: "Front Desk PC",
        downtimePrimaryDeviceRegisteredAt: "2026-04-27T18:00:00.000Z",
        downtimePrimaryDeviceRegisteredBy: "Admin User",
      }],
    });
    const res = await request(app).get("/locations");
    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(1);
    expect(res.body.locations[0].downtimeSettings).toEqual({
      enabled: true,
      packetTime: "05:30",
      deviceProfile: "ipad",
      includeDob: true,
      includePhone: true,
      includeInsurance: true,
    });
    expect(res.body.locations[0].downtimePrimaryDevice).toEqual({
      deviceId: "device-1",
      label: "Front Desk PC",
      registeredAt: "2026-04-27T18:00:00.000Z",
      registeredBy: "Admin User",
      lastSeenAt: null,
      lastPacketSavedAt: null,
      lastPacketDate: null,
    });
  });
});
