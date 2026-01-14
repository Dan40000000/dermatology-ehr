import request from "supertest";
import express from "express";
import adminRouter from "../admin";
import { pool } from "../../db/pool";

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

const app = express();
app.use(express.json());
app.use("/admin", adminRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Admin routes - Facilities", () => {
  it("GET /admin/facilities returns facilities", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "facility-1", name: "Main Clinic", address: "123 Main St", phone: "555-1234", isActive: true }],
      rowCount: 1,
    });

    const res = await request(app).get("/admin/facilities");

    expect(res.status).toBe(200);
    expect(res.body.facilities).toHaveLength(1);
    expect(res.body.facilities[0].name).toBe("Main Clinic");
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
      rows: [{ id: "user-1", email: "user@example.com", fullName: "User Name", role: "front_desk" }],
      rowCount: 1,
    });

    const res = await request(app).get("/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].email).toBe("user@example.com");
  });

  it("POST /admin/users creates user", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Check for existing email

    const res = await request(app).post("/admin/users").send({
      email: "newuser@example.com",
      fullName: "New User",
      password: "Password123!",
      role: "provider",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.email).toBe("newuser@example.com");
    expect(res.body.role).toBe("provider");
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
      password: "Password123!",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already exists");
  });

  it("POST /admin/users defaults role to front_desk", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post("/admin/users").send({
      email: "newuser@example.com",
      fullName: "New User",
      password: "Password123!",
    });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("front_desk");
  });

  it("POST /admin/users lowercases email", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post("/admin/users").send({
      email: "NewUser@Example.COM",
      fullName: "New User",
      password: "Password123!",
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("newuser@example.com");
  });

  it("PUT /admin/users/:id updates user", async () => {
    const res = await request(app).put("/admin/users/user-1").send({
      fullName: "Updated Name",
      role: "admin",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
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
