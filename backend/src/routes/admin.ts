import { Router } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { validatePasswordPolicy } from "../middleware/security";

const router = Router();

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireRoles(["admin"]));

// ============ FACILITIES (using locations table) ============

// List facilities
router.get("/facilities", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT id, name, address, phone, is_active as "isActive", created_at as "createdAt"
     FROM locations
     WHERE tenant_id = $1
     ORDER BY name`,
    [tenantId]
  );

  res.json({ facilities: result.rows });
});

// Create facility
router.post("/facilities", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { name, address, phone } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Facility name is required" });
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO locations (id, tenant_id, name, address, phone, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, tenantId, name, address || null, phone || null]
  );

  res.status(201).json({ id, name, address, phone, isActive: true });
});

// Update facility
router.put("/facilities/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { name, address, phone, isActive } = req.body;

  await pool.query(
    `UPDATE locations
     SET name = COALESCE($1, name),
         address = COALESCE($2, address),
         phone = COALESCE($3, phone),
         is_active = COALESCE($4, is_active)
     WHERE id = $5 AND tenant_id = $6`,
    [name, address, phone, isActive, id, tenantId]
  );

  res.json({ success: true });
});

// Delete facility
router.delete("/facilities/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  // Check if facility has rooms
  const roomCheck = await pool.query(
    `SELECT COUNT(*) FROM rooms WHERE facility_id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (parseInt(roomCheck.rows[0].count) > 0) {
    return res.status(400).json({ error: "Cannot delete facility with rooms. Delete rooms first." });
  }

  await pool.query(
    `DELETE FROM locations WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  res.json({ success: true });
});

// ============ ROOMS ============

// List rooms
router.get("/rooms", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT r.id, r.name, r.facility_id as "facilityId", r.room_type as "roomType",
            r.is_active as "isActive", r.created_at as "createdAt",
            l.name as "facilityName"
     FROM rooms r
     LEFT JOIN locations l ON r.facility_id = l.id
     WHERE r.tenant_id = $1
     ORDER BY l.name, r.name`,
    [tenantId]
  );

  res.json({ rooms: result.rows });
});

// Create room
router.post("/rooms", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { name, facilityId, roomType } = req.body;

  if (!name || !facilityId) {
    return res.status(400).json({ error: "Room name and facility are required" });
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO rooms (id, tenant_id, facility_id, name, room_type, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, tenantId, facilityId, name, roomType || "exam"]
  );

  res.status(201).json({ id, name, facilityId, roomType: roomType || "exam", isActive: true });
});

// Update room
router.put("/rooms/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { name, facilityId, roomType, isActive } = req.body;

  await pool.query(
    `UPDATE rooms
     SET name = COALESCE($1, name),
         facility_id = COALESCE($2, facility_id),
         room_type = COALESCE($3, room_type),
         is_active = COALESCE($4, is_active)
     WHERE id = $5 AND tenant_id = $6`,
    [name, facilityId, roomType, isActive, id, tenantId]
  );

  res.json({ success: true });
});

// Delete room
router.delete("/rooms/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(
    `DELETE FROM rooms WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  res.json({ success: true });
});

// ============ PROVIDERS ============

// List providers
router.get("/providers", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT id, full_name as "fullName", specialty, npi, tax_id as "taxId",
            is_active as "isActive", created_at as "createdAt"
     FROM providers
     WHERE tenant_id = $1
     ORDER BY full_name`,
    [tenantId]
  );

  res.json({ providers: result.rows });
});

// Create provider
router.post("/providers", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { fullName, specialty, npi } = req.body;

  if (!fullName) {
    return res.status(400).json({ error: "Provider name is required" });
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO providers (id, tenant_id, full_name, specialty, npi, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, tenantId, fullName, specialty || "Dermatology", npi || null]
  );

  res.status(201).json({ id, fullName, specialty: specialty || "Dermatology", npi, isActive: true });
});

// Update provider
router.put("/providers/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { fullName, specialty, npi, isActive } = req.body;

  await pool.query(
    `UPDATE providers
     SET full_name = COALESCE($1, full_name),
         specialty = COALESCE($2, specialty),
         npi = COALESCE($3, npi),
         is_active = COALESCE($4, is_active)
     WHERE id = $5 AND tenant_id = $6`,
    [fullName, specialty, npi, isActive, id, tenantId]
  );

  res.json({ success: true });
});

// Delete provider
router.delete("/providers/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(
    `DELETE FROM providers WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  res.json({ success: true });
});

// ============ USERS ============

// List users
router.get("/users", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT id, email, full_name as "fullName", role, created_at as "createdAt"
     FROM users
     WHERE tenant_id = $1
     ORDER BY full_name`,
    [tenantId]
  );

  res.json({ users: result.rows });
});

// Create user
router.post("/users", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { email, fullName, role, password } = req.body;

  if (!email || !fullName || !password) {
    return res.status(400).json({ error: "Email, name, and password are required" });
  }

  // Validate password strength
  const passwordValidation = validatePasswordPolicy(password);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      error: "Password does not meet security requirements",
      details: passwordValidation.errors
    });
  }

  // Check if email already exists
  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1 AND tenant_id = $2`,
    [email.toLowerCase(), tenantId]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return res.status(400).json({ error: "A user with this email already exists" });
  }

  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 12); // Increased to 12 rounds for better security

  await pool.query(
    `INSERT INTO users (id, tenant_id, email, full_name, role, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, email.toLowerCase(), fullName, role || "front_desk", passwordHash]
  );

  res.status(201).json({ id, email: email.toLowerCase(), fullName, role: role || "front_desk" });
});

// Update user
router.put("/users/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { email, fullName, role, password } = req.body;

  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (email) {
    updates.push(`email = $${paramIndex++}`);
    values.push(email.toLowerCase());
  }
  if (fullName) {
    updates.push(`full_name = $${paramIndex++}`);
    values.push(fullName);
  }
  if (role) {
    updates.push(`role = $${paramIndex++}`);
    values.push(role);
  }
  if (password) {
    // Validate password strength
    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: "Password does not meet security requirements",
        details: passwordValidation.errors
      });
    }
    updates.push(`password_hash = $${paramIndex++}`);
    values.push(bcrypt.hashSync(password, 12)); // Increased to 12 rounds for better security
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id, tenantId);
  await pool.query(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
    values
  );

  res.json({ success: true });
});

// Delete user
router.delete("/users/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  // Prevent deleting yourself
  if (id === req.user?.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  await pool.query(
    `DELETE FROM users WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  res.json({ success: true });
});

export default router;
