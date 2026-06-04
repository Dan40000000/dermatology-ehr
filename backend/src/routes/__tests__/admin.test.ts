import request from "supertest";
import express from "express";
import adminRouter from "../admin";
import { pool } from "../../db/pool";
import { revokeRefreshTokensForUser } from "../../services/authService";
import { createTwilioService } from "../../services/twilioService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "admin-1", tenantId: "tenant-1", role: "admin", fullName: "Admin User" };
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

jest.mock("../../services/authService", () => ({
  revokeRefreshTokensForUser: jest.fn(),
}));

jest.mock("../../services/twilioService", () => ({
  createTwilioService: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/admin", adminRouter);

const queryMock = pool.query as jest.Mock;
const revokeRefreshTokensForUserMock = revokeRefreshTokensForUser as jest.Mock;
const createTwilioServiceMock = createTwilioService as jest.Mock;
const sendSMSMock = jest.fn();

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  revokeRefreshTokensForUserMock.mockReset();
  createTwilioServiceMock.mockReset();
  sendSMSMock.mockReset();
  createTwilioServiceMock.mockReturnValue({ sendSMS: sendSMSMock });
});

describe("Admin routes - Facilities", () => {
  it("GET /admin/facilities returns facilities", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "facility-1",
        name: "Main Clinic",
        address: "123 Main St",
        phone: "555-1234",
        isActive: true,
        downtimePacketsEnabled: true,
        downtimePacketTime: "05:00",
        downtimeDeviceProfile: "desktop",
        downtimeIncludeDob: true,
        downtimeIncludePhone: true,
        downtimeIncludeInsurance: false,
        downtimePrimaryDeviceId: "device-1",
        downtimePrimaryDeviceLabel: "Chrome on Mac",
        downtimePrimaryDeviceRegisteredAt: "2026-04-27T18:00:00.000Z",
        downtimePrimaryDeviceRegisteredBy: "Admin User",
        downtimePrimaryDeviceLastSeenAt: "2026-04-27T18:05:00.000Z",
        downtimePrimaryDeviceLastPacketSavedAt: "2026-04-27T18:06:00.000Z",
        downtimePrimaryDeviceLastPacketDate: "2026-04-28",
      }],
      rowCount: 1,
    });

    const res = await request(app).get("/admin/facilities");

    expect(res.status).toBe(200);
    expect(res.body.facilities).toHaveLength(1);
    expect(res.body.facilities[0].name).toBe("Main Clinic");
    expect(res.body.facilities[0].downtimeSettings).toEqual({
      enabled: true,
      packetTime: "05:00",
      deviceProfile: "desktop",
      includeDob: true,
      includePhone: true,
      includeInsurance: false,
    });
    expect(res.body.facilities[0].downtimePrimaryDevice).toEqual({
      deviceId: "device-1",
      label: "Chrome on Mac",
      registeredAt: "2026-04-27T18:00:00.000Z",
      registeredBy: "Admin User",
      lastSeenAt: "2026-04-27T18:05:00.000Z",
      lastPacketSavedAt: "2026-04-27T18:06:00.000Z",
      lastPacketDate: "2026-04-28",
    });
  });

  it("POST /admin/facilities creates facility", async () => {
    const res = await request(app).post("/admin/facilities").send({
      name: "New Clinic",
      address: "456 Oak St",
      phone: "555-5678",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("New Clinic");
    expect(res.body.isActive).toBe(true);
  });

  it("POST /admin/facilities rejects missing name", async () => {
    const res = await request(app).post("/admin/facilities").send({
      address: "456 Oak St",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("PUT /admin/facilities/:id updates facility", async () => {
    const res = await request(app).put("/admin/facilities/facility-1").send({
      name: "Updated Clinic",
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /admin/facilities/:id/downtime-primary-device registers facility device", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "facility-1",
        name: "Main Clinic",
        address: "123 Main St",
        phone: "555-1234",
        isActive: true,
        downtimePacketsEnabled: true,
        downtimePacketTime: "12:00",
        downtimeDeviceProfile: "desktop",
        downtimeIncludeDob: true,
        downtimeIncludePhone: true,
        downtimeIncludeInsurance: true,
        downtimePrimaryDeviceId: "device-1",
        downtimePrimaryDeviceLabel: "Chrome on Mac",
        downtimePrimaryDeviceRegisteredAt: "2026-04-27T18:00:00.000Z",
        downtimePrimaryDeviceRegisteredBy: "Admin User",
        downtimePrimaryDeviceLastSeenAt: null,
        downtimePrimaryDeviceLastPacketSavedAt: null,
        downtimePrimaryDeviceLastPacketDate: null,
      }],
      rowCount: 1,
    });

    const res = await request(app)
      .post("/admin/facilities/facility-1/downtime-primary-device")
      .send({ deviceId: "device-1", deviceLabel: "Chrome on Mac" });

    expect(res.status).toBe(200);
    expect(res.body.facility.downtimePrimaryDevice.deviceId).toBe("device-1");
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE locations"),
      expect.arrayContaining(["device-1", "Chrome on Mac", "Admin User", "facility-1", "tenant-1"]),
    );
  });

  it("DELETE /admin/facilities/:id/downtime-primary-device clears facility device", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "facility-1",
        name: "Main Clinic",
        address: "123 Main St",
        phone: "555-1234",
        isActive: true,
        downtimePacketsEnabled: true,
        downtimePacketTime: "12:00",
        downtimeDeviceProfile: "desktop",
        downtimeIncludeDob: true,
        downtimeIncludePhone: true,
        downtimeIncludeInsurance: true,
        downtimePrimaryDeviceId: null,
      }],
      rowCount: 1,
    });

    const res = await request(app).delete("/admin/facilities/facility-1/downtime-primary-device");

    expect(res.status).toBe(200);
    expect(res.body.facility.downtimePrimaryDevice).toBeNull();
  });

  it("DELETE /admin/facilities/:id rejects facility with rooms", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: "5" }], rowCount: 1 });

    const res = await request(app).delete("/admin/facilities/facility-1");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("rooms");
  });

  it("DELETE /admin/facilities/:id deletes facility", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 });

    const res = await request(app).delete("/admin/facilities/facility-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Admin routes - Rooms", () => {
  it("GET /admin/rooms returns rooms with facility info", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "room-1",
          name: "Room A",
          facilityId: "facility-1",
          roomType: "exam",
          isActive: true,
          facilityName: "Main Clinic",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/admin/rooms");

    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(1);
    expect(res.body.rooms[0].name).toBe("Room A");
    expect(res.body.rooms[0].facilityName).toBe("Main Clinic");
  });

  it("POST /admin/rooms creates room", async () => {
    const res = await request(app).post("/admin/rooms").send({
      name: "Room B",
      facilityId: "facility-1",
      roomType: "procedure",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("Room B");
    expect(res.body.roomType).toBe("procedure");
  });

  it("POST /admin/rooms rejects missing required fields", async () => {
    const res = await request(app).post("/admin/rooms").send({
      name: "Room C",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /admin/rooms defaults roomType to exam", async () => {
    const res = await request(app).post("/admin/rooms").send({
      name: "Room D",
      facilityId: "facility-1",
    });

    expect(res.status).toBe(201);
    expect(res.body.roomType).toBe("exam");
  });

  it("PUT /admin/rooms/:id updates room", async () => {
    const res = await request(app).put("/admin/rooms/room-1").send({
      name: "Updated Room",
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /admin/rooms/:id deletes room", async () => {
    const res = await request(app).delete("/admin/rooms/room-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Admin routes - Providers", () => {
  it("GET /admin/providers returns providers", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: "provider-1", fullName: "Dr. Smith", specialty: "Dermatology", npi: "1234567890", isActive: true },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/admin/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(1);
    expect(res.body.providers[0].fullName).toBe("Dr. Smith");
  });

  it("POST /admin/providers creates provider", async () => {
    const res = await request(app).post("/admin/providers").send({
      fullName: "Dr. Jones",
      specialty: "Dermatology",
      npi: "9876543210",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.fullName).toBe("Dr. Jones");
  });

  it("POST /admin/providers rejects missing name", async () => {
    const res = await request(app).post("/admin/providers").send({
      specialty: "Dermatology",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /admin/providers defaults specialty to Dermatology", async () => {
    const res = await request(app).post("/admin/providers").send({
      fullName: "Dr. Williams",
    });

    expect(res.status).toBe(201);
    expect(res.body.specialty).toBe("Dermatology");
  });

  it("PUT /admin/providers/:id updates provider", async () => {
    const res = await request(app).put("/admin/providers/provider-1").send({
      fullName: "Dr. Smith Updated",
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /admin/providers/:id deletes provider", async () => {
    const res = await request(app).delete("/admin/providers/provider-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Admin routes - Users", () => {
  it("GET /admin/users returns users", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "user-1",
        email: "user@example.com",
        phone: "+15551234567",
        fullName: "User Name",
        role: "front_desk",
        failedLoginAttempts: 5,
        loginLockedAt: "2026-06-03T12:00:00.000Z",
        loginLockedReason: "failed_login_attempts",
      }],
      rowCount: 1,
    });

    const res = await request(app).get("/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].email).toBe("user@example.com");
    expect(res.body.users[0].phone).toBe("+15551234567");
    expect(res.body.users[0].failedLoginAttempts).toBe(5);
    expect(res.body.users[0].loginLockedAt).toBe("2026-06-03T12:00:00.000Z");
    expect(res.body.users[0].loginLockedReason).toBe("failed_login_attempts");
  });

  it("POST /admin/users creates user", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Check for existing email

    const res = await request(app).post("/admin/users").send({
      email: "newuser@example.com",
      fullName: "New User",
      password: "C0mpl3x!Health",
      role: "provider",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.email).toBe("newuser@example.com");
    expect(res.body.role).toBe("provider");
    expect(res.body.passwordResetRequired).toBe(true);
  });

  it("POST /admin/users stores mobile phone and prepares a temporary login text", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          twilio_phone_number: "+15550001111",
          is_active: true,
          is_test_mode: true,
        }],
        rowCount: 1,
      });

    const res = await request(app).post("/admin/users").send({
      email: "newuser@example.com",
      fullName: "New User",
      phone: "(555) 123-4567",
      password: "C0mpl3x!Health",
      role: "front_desk",
      sendTemporaryLoginSms: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.phone).toBe("+15551234567");
    expect(res.body.temporaryLoginDelivery).toMatchObject({
      method: "sms",
      status: "mocked",
      to: "+15551234567",
    });
    expect(queryMock.mock.calls[1][0]).toContain("phone");
    expect(queryMock.mock.calls[1][1]).toContain("+15551234567");
    expect(createTwilioServiceMock).not.toHaveBeenCalled();
  });

  it("POST /admin/users rejects missing required fields", async () => {
    const res = await request(app).post("/admin/users").send({
      email: "user@example.com",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /admin/users rejects duplicate email", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "user-1" }], rowCount: 1 });

    const res = await request(app).post("/admin/users").send({
      email: "existing@example.com",
      fullName: "Existing User",
      password: "C0mpl3x!Health",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already exists");
  });

  it("POST /admin/users defaults role to front_desk", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post("/admin/users").send({
      email: "newuser@example.com",
      fullName: "New User",
      password: "C0mpl3x!Health",
    });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("front_desk");
  });

  it("POST /admin/users lowercases email", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post("/admin/users").send({
      email: "NewUser@Example.COM",
      fullName: "New User",
      password: "C0mpl3x!Health",
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("newuser@example.com");
  });

  it("PUT /admin/users/:id updates user", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ role: "front_desk", secondaryRoles: [] }],
      rowCount: 1,
    });

    const res = await request(app).put("/admin/users/user-1").send({
      fullName: "Updated Name",
      role: "admin",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("PUT /admin/users/:id resets password, forces next-login change, and revokes sessions", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ role: "front_desk", secondaryRoles: [], email: "staff@example.com", fullName: "Staff User", phone: "+15551234567" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app).put("/admin/users/user-1").send({
      password: "TempStaff2026!",
    });

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[1][0]).toContain("password_hash");
    expect(queryMock.mock.calls[1][0]).toContain("force_password_reset = true");
    expect(queryMock.mock.calls[1][0]).toContain("password_changed_at = CURRENT_TIMESTAMP");
    expect(queryMock.mock.calls[1][0]).toContain("failed_login_attempts = 0");
    expect(queryMock.mock.calls[1][0]).toContain("login_locked_at = NULL");
    expect(queryMock.mock.calls[1][0]).toContain("login_locked_reason = NULL");
    expect(queryMock.mock.calls[1][0]).toContain("last_failed_login_at = NULL");
    expect(revokeRefreshTokensForUserMock).toHaveBeenCalledWith("user-1", "tenant-1");
  });

  it("PUT /admin/users/:id can reset a password and prepare the temporary login text", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ role: "front_desk", secondaryRoles: [], email: "staff@example.com", fullName: "Staff User", phone: "+15551234567" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          twilio_phone_number: "+15550001111",
          is_active: true,
          is_test_mode: true,
        }],
        rowCount: 1,
      });

    const res = await request(app).put("/admin/users/user-1").send({
      password: "TempStaff2026!",
      sendTemporaryLoginSms: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.temporaryLoginDelivery).toMatchObject({
      status: "mocked",
      to: "+15551234567",
    });
    expect(revokeRefreshTokensForUserMock).toHaveBeenCalledWith("user-1", "tenant-1");
  });

  it("PUT /admin/users/:id rejects texting a temporary login without a new password", async () => {
    const res = await request(app).put("/admin/users/user-1").send({
      sendTemporaryLoginSms: true,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("temporary password");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("PUT /admin/users/:id rejects no updates", async () => {
    const res = await request(app).put("/admin/users/user-1").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No fields to update");
  });

  it("DELETE /admin/users/:id prevents self-deletion", async () => {
    const res = await request(app).delete("/admin/users/admin-1");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot delete your own account");
  });

  it("DELETE /admin/users/:id deletes user", async () => {
    const res = await request(app).delete("/admin/users/user-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Admin routes - Error handling", () => {
  it("handles database errors gracefully", async () => {
    queryMock.mockRejectedValueOnce(new Error("Database error"));

    const res = await request(app).get("/admin/facilities");

    expect(res.status).toBe(500);
  });
});
