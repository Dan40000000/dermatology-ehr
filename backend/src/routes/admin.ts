import { Router } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { validatePasswordPolicy } from "../middleware/security";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";
import { mapDowntimeSettings, parseDowntimeSettingsInput } from "../lib/downtimeSettings";
import { mapDowntimePrimaryDevice } from "../lib/downtimePrimaryDevice";
import { invalidateCache } from "../services/redisCache";
import { revokeRefreshTokensForUser } from "../services/authService";

const router = Router();

const FACILITY_SELECT_COLUMNS = `id,
            name,
            address,
            phone,
            is_active as "isActive",
            created_at as "createdAt",
            downtime_packets_enabled as "downtimePacketsEnabled",
            downtime_packet_time as "downtimePacketTime",
            downtime_device_profile as "downtimeDeviceProfile",
            downtime_include_dob as "downtimeIncludeDob",
            downtime_include_phone as "downtimeIncludePhone",
            downtime_include_insurance as "downtimeIncludeInsurance",
            downtime_primary_device_id as "downtimePrimaryDeviceId",
            downtime_primary_device_label as "downtimePrimaryDeviceLabel",
            downtime_primary_device_registered_at as "downtimePrimaryDeviceRegisteredAt",
            downtime_primary_device_registered_by as "downtimePrimaryDeviceRegisteredBy",
            downtime_primary_device_last_seen_at as "downtimePrimaryDeviceLastSeenAt",
            downtime_primary_device_last_packet_saved_at as "downtimePrimaryDeviceLastPacketSavedAt",
            downtime_primary_device_last_packet_date as "downtimePrimaryDeviceLastPacketDate"`;

function normalizeSecondaryRolesInput(value: unknown, primaryRole: string): string[] {
  return normalizeRoleArray(value).filter((role) => role !== primaryRole);
}

function mapFacilityRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    isActive: row.isActive,
    createdAt: row.createdAt,
    downtimeSettings: mapDowntimeSettings(row),
    downtimePrimaryDevice: mapDowntimePrimaryDevice(row),
  };
}

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireRoles(["admin"]));

// ============ FACILITIES (using locations table) ============

// List facilities
router.get("/facilities", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT ${FACILITY_SELECT_COLUMNS}
     FROM locations
     WHERE tenant_id = $1
     ORDER BY name`,
    [tenantId]
  );

  res.json({ facilities: result.rows.map(mapFacilityRow) });
});

// Create facility
router.post("/facilities", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { name, address, phone } = req.body;
  const downtimeSettings = parseDowntimeSettingsInput(req.body?.downtimeSettings);

  if (!name) {
    return res.status(400).json({ error: "Facility name is required" });
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO locations (
       id,
       tenant_id,
       name,
       address,
       phone,
       is_active,
       downtime_packets_enabled,
       downtime_packet_time,
       downtime_device_profile,
       downtime_include_dob,
       downtime_include_phone,
       downtime_include_insurance
     )
     VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      tenantId,
      name,
      address || null,
      phone || null,
      downtimeSettings.enabled,
      downtimeSettings.packetTime,
      downtimeSettings.deviceProfile,
      downtimeSettings.includeDob,
      downtimeSettings.includePhone,
      downtimeSettings.includeInsurance,
    ]
  );

  await invalidateCache.locations(tenantId);

  res.status(201).json({
    id,
    name,
    address,
    phone,
    isActive: true,
    downtimeSettings,
    downtimePrimaryDevice: null,
  });
});

// Update facility
router.put("/facilities/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { name, address, phone, isActive } = req.body;
  const downtimeSettings = parseDowntimeSettingsInput(req.body?.downtimeSettings);

  await pool.query(
    `UPDATE locations
     SET name = COALESCE($1, name),
         address = COALESCE($2, address),
         phone = COALESCE($3, phone),
         is_active = COALESCE($4, is_active),
         downtime_packets_enabled = $5,
         downtime_packet_time = $6,
         downtime_device_profile = $7,
         downtime_include_dob = $8,
         downtime_include_phone = $9,
         downtime_include_insurance = $10
     WHERE id = $11 AND tenant_id = $12`,
    [
      name,
      address,
      phone,
      isActive,
      downtimeSettings.enabled,
      downtimeSettings.packetTime,
      downtimeSettings.deviceProfile,
      downtimeSettings.includeDob,
      downtimeSettings.includePhone,
      downtimeSettings.includeInsurance,
      id,
      tenantId,
    ]
  );

  await invalidateCache.locations(tenantId);
  res.json({ success: true });
});

router.post("/facilities/:id/downtime-primary-device", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  const rawLabel = typeof req.body?.deviceLabel === "string" ? req.body.deviceLabel.trim() : "";
  const deviceLabel = rawLabel ? rawLabel.slice(0, 120) : null;
  const registeredBy =
    (typeof req.user?.fullName === "string" && req.user.fullName.trim()) ||
    (typeof req.user?.email === "string" && req.user.email.trim()) ||
    req.user?.id ||
    "admin";

  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  const result = await pool.query(
    `UPDATE locations
     SET downtime_primary_device_id = $1,
         downtime_primary_device_label = $2,
         downtime_primary_device_registered_at = CURRENT_TIMESTAMP,
         downtime_primary_device_registered_by = $3,
         downtime_primary_device_last_seen_at = NULL,
         downtime_primary_device_last_packet_saved_at = NULL,
         downtime_primary_device_last_packet_date = NULL
     WHERE id = $4 AND tenant_id = $5
     RETURNING ${FACILITY_SELECT_COLUMNS}`,
    [deviceId, deviceLabel, registeredBy, id, tenantId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Facility not found" });
  }

  await invalidateCache.locations(tenantId);
  res.json({ facility: mapFacilityRow(result.rows[0]) });
});

router.delete("/facilities/:id/downtime-primary-device", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE locations
     SET downtime_primary_device_id = NULL,
         downtime_primary_device_label = NULL,
         downtime_primary_device_registered_at = NULL,
         downtime_primary_device_registered_by = NULL,
         downtime_primary_device_last_seen_at = NULL,
         downtime_primary_device_last_packet_saved_at = NULL,
         downtime_primary_device_last_packet_date = NULL
     WHERE id = $1 AND tenant_id = $2
     RETURNING ${FACILITY_SELECT_COLUMNS}`,
    [id, tenantId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Facility not found" });
  }

  await invalidateCache.locations(tenantId);
  res.json({ facility: mapFacilityRow(result.rows[0]) });
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

  await invalidateCache.locations(tenantId);
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
    `SELECT id, email, full_name as "fullName", role,
            coalesce(secondary_roles, '{}'::text[]) as "secondaryRoles",
            coalesce(force_password_reset, false) as "passwordResetRequired",
            coalesce(failed_login_attempts, 0) as "failedLoginAttempts",
            login_locked_at as "loginLockedAt",
            login_locked_reason as "loginLockedReason",
            created_at as "createdAt"
     FROM users
     WHERE tenant_id = $1
     ORDER BY full_name`,
    [tenantId]
  );

  res.json({
    users: result.rows.map((row) => {
      const secondaryRoles = normalizeRoleArray(row.secondaryRoles);
      return {
        ...row,
        secondaryRoles,
        roles: buildEffectiveRoles(row.role, secondaryRoles),
      };
    }),
  });
});

// Create user
router.post("/users", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { email, fullName, role, password, secondaryRoles } = req.body;

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
  const primaryRole = role || "front_desk";
  const normalizedSecondaryRoles = normalizeSecondaryRolesInput(secondaryRoles, primaryRole);
  const passwordHash = bcrypt.hashSync(password, 12); // Increased to 12 rounds for better security

  await pool.query(
    `INSERT INTO users (id, tenant_id, email, full_name, role, secondary_roles, password_hash, force_password_reset, password_changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, CURRENT_TIMESTAMP)`,
    [id, tenantId, email.toLowerCase(), fullName, primaryRole, normalizedSecondaryRoles, passwordHash]
  );

  res.status(201).json({
    id,
    email: email.toLowerCase(),
    fullName,
    role: primaryRole,
    secondaryRoles: normalizedSecondaryRoles,
    roles: buildEffectiveRoles(primaryRole, normalizedSecondaryRoles),
    passwordResetRequired: true,
  });
});

// Update user
router.put("/users/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing user id" });
  const { email, fullName, role, password, secondaryRoles } = req.body;

  if (!email && !fullName && !role && !password && secondaryRoles === undefined) {
    return res.status(400).json({ error: "No fields to update" });
  }

  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const existingUserResult = await pool.query(
    `SELECT role, coalesce(secondary_roles, '{}'::text[]) as "secondaryRoles"
     FROM users WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  const existingUser = existingUserResult.rows[0];
  if (!existingUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const nextPrimaryRole = role || existingUser.role;
  const requestedSecondaryRoles = secondaryRoles !== undefined ? secondaryRoles : existingUser.secondaryRoles;
  const normalizedSecondaryRoles = normalizeSecondaryRolesInput(requestedSecondaryRoles, nextPrimaryRole);

  if (email) {
    updates.push(`email = $${paramIndex++}`);
    values.push(email.toLowerCase());
  }
  if (fullName) {
    updates.push(`full_name = $${paramIndex++}`);
    values.push(fullName);
  }
  if (role || secondaryRoles !== undefined) {
    updates.push(`secondary_roles = $${paramIndex++}`);
    values.push(normalizedSecondaryRoles);
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
    updates.push(`force_password_reset = true`);
    updates.push(`password_changed_at = CURRENT_TIMESTAMP`);
    updates.push(`failed_login_attempts = 0`);
    updates.push(`login_locked_at = NULL`);
    updates.push(`login_locked_reason = NULL`);
    updates.push(`last_failed_login_at = NULL`);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id, tenantId);
  await pool.query(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
    values
  );

  if (password) {
    await revokeRefreshTokensForUser(id, tenantId);
  }

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
