/**
 * Referral Management Routes
 * Comprehensive API for managing patient referrals from external providers
 *
 * Key Features:
 * - Process incoming referrals
 * - Track status through complete lifecycle
 * - Convert referrals to appointments
 * - Generate closed-loop reports for referring providers
 * - Manage referring provider directory
 */

import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { ReferralService } from "../services/referralService";
import { logger } from "../lib/logger";

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createReferralSchema = z.object({
  patientId: z.string().uuid(),
  referringProviderId: z.string().uuid().optional(),
  referringProviderName: z.string().optional(),
  referringPractice: z.string().optional(),
  priority: z.enum(["routine", "urgent", "stat"]).optional().default("routine"),
  diagnosisCodes: z.array(z.string()).optional(),
  reason: z.string().optional(),
  clinicalNotes: z.string().optional(),
  insuranceAuthNumber: z.string().optional(),
  // Legacy fields for backward compatibility
  direction: z.enum(["incoming", "outgoing"]).optional().default("incoming"),
  referringProvider: z.string().optional(),
  referringOrganization: z.string().optional(),
  referredToProvider: z.string().optional(),
  referredToOrganization: z.string().optional(),
  appointmentId: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["new", "received", "scheduled", "in_progress", "completed", "declined", "cancelled"]).optional(),
});

const updateReferralSchema = z.object({
  status: z.enum([
    "received", "verified", "scheduled", "in_progress",
    "completed", "report_sent", "declined", "cancelled"
  ]).optional(),
  priority: z.enum(["routine", "urgent", "stat"]).optional(),
  assignedProviderId: z.string().uuid().optional(),
  clinicalNotes: z.string().optional(),
  notes: z.string().optional(),
  insuranceAuthStatus: z.enum(["not_required", "pending", "approved", "denied"]).optional(),
  insuranceAuthNumber: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "received", "verified", "scheduled", "in_progress",
    "completed", "report_sent", "declined", "cancelled"
  ]),
  notes: z.string().optional(),
});

const scheduleAppointmentSchema = z.object({
  providerId: z.string().uuid(),
  locationId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  scheduledStart: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid start date" }),
  scheduledEnd: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid end date" }),
});

const sendReportSchema = z.object({
  encounterId: z.string().uuid().optional(),
  diagnosis: z.array(z.string()).optional(),
  treatmentPlan: z.string().optional(),
  followUpRecommendations: z.string().optional(),
  additionalNotes: z.string().optional(),
});

const createProviderSchema = z.object({
  name: z.string().min(1),
  npi: z.string().length(10).optional(),
  practiceName: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(10).optional(),
  preferences: z.object({
    preferred_contact_method: z.enum(["fax", "email", "portal", "phone"]).optional(),
    send_status_updates: z.boolean().optional(),
    send_closed_loop_reports: z.boolean().optional(),
    report_format: z.enum(["pdf", "hl7", "fhir"]).optional(),
    auto_acknowledge: z.boolean().optional(),
  }).optional(),
  notes: z.string().optional(),
});

const updateProviderSchema = createProviderSchema.partial();

// =====================================================
// ROUTER
// =====================================================

export const referralsRouter = Router();

referralsRouter.use(requireAuth);

// =====================================================
// REFERRING PROVIDER ENDPOINTS (must come before /:id routes)
// =====================================================

/**
 * GET /api/referrals/providers
 * List referring providers
 */
referralsRouter.get("/providers", async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { search, specialty, active, limit = "50", offset = "0" } = req.query;

    let query = `
      SELECT
        id,
        name,
        npi,
        practice_name as "practiceName",
        specialty,
        phone,
        fax,
        email,
        address_line1 as "addressLine1",
        city,
        state,
        zip,
        preferences,
        is_active as "isActive",
        notes,
        created_at as "createdAt"
      FROM referring_providers
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (search) {
      query += ` AND (
        name ILIKE $${paramIndex} OR
        practice_name ILIKE $${paramIndex} OR
        npi ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (specialty) {
      query += ` AND specialty = $${paramIndex++}`;
      params.push(specialty);
    }
    if (active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(active === "true");
    }

    query += ` ORDER BY name ASC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);

    res.json({ providers: result.rows });
  } catch (error: any) {
    logger.error("Error listing referring providers", { error: error.message });
    res.status(500).json({ error: "Failed to list providers" });
  }
});

/**
 * POST /api/referrals/providers
 * Add referring provider
 */
referralsRouter.post("/providers", requireRoles(["admin", "front_desk"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = createProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const data = parsed.data;
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO referring_providers (
        id, tenant_id, name, npi, practice_name, specialty,
        phone, fax, email, address_line1, address_line2,
        city, state, zip, preferences, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        tenantId,
        data.name,
        data.npi || null,
        data.practiceName || null,
        data.specialty || null,
        data.phone || null,
        data.fax || null,
        data.email || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.state || null,
        data.zip || null,
        JSON.stringify(data.preferences || {}),
        data.notes || null,
        userId,
      ]
    );

    await auditLog(tenantId, userId, "referring_provider_create", "referring_provider", id);
    res.status(201).json({ id });
  } catch (error: any) {
    logger.error("Error creating referring provider", { error: error.message });

    if (error.code === "23505") {
      return res.status(409).json({ error: "Provider with this NPI already exists" });
    }

    res.status(500).json({ error: "Failed to create provider" });
  }
});

/**
 * GET /api/referrals/providers/:id
 * Get referring provider details
 */
referralsRouter.get("/providers/:id", async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.params.id;

    const result = await pool.query(
      `SELECT
        rp.*,
        (
          SELECT COUNT(*) FROM referrals r
          WHERE r.referring_provider_id = rp.id
        ) as referral_count,
        (
          SELECT COUNT(*) FROM referrals r
          WHERE r.referring_provider_id = rp.id
          AND r.status IN ('received', 'verified')
        ) as active_referral_count
      FROM referring_providers rp
      WHERE rp.id = $1 AND rp.tenant_id = $2`,
      [providerId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found" });
    }

    res.json({ provider: result.rows[0] });
  } catch (error: any) {
    logger.error("Error getting referring provider", { error: error.message });
    res.status(500).json({ error: "Failed to get provider" });
  }
});

/**
 * PATCH /api/referrals/providers/:id
 * Update referring provider
 */
referralsRouter.patch("/providers/:id", requireRoles(["admin", "front_desk"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = updateProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const providerId = req.params.id!;
    const data = parsed.data;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const addUpdate = (field: string, value: any) => {
      updates.push(`${field} = $${paramIndex++}`);
      values.push(value);
    };

    if (data.name !== undefined) addUpdate("name", data.name);
    if (data.npi !== undefined) addUpdate("npi", data.npi);
    if (data.practiceName !== undefined) addUpdate("practice_name", data.practiceName);
    if (data.specialty !== undefined) addUpdate("specialty", data.specialty);
    if (data.phone !== undefined) addUpdate("phone", data.phone);
    if (data.fax !== undefined) addUpdate("fax", data.fax);
    if (data.email !== undefined) addUpdate("email", data.email);
    if (data.addressLine1 !== undefined) addUpdate("address_line1", data.addressLine1);
    if (data.addressLine2 !== undefined) addUpdate("address_line2", data.addressLine2);
    if (data.city !== undefined) addUpdate("city", data.city);
    if (data.state !== undefined) addUpdate("state", data.state);
    if (data.zip !== undefined) addUpdate("zip", data.zip);
    if (data.preferences !== undefined) addUpdate("preferences", JSON.stringify(data.preferences));
    if (data.notes !== undefined) addUpdate("notes", data.notes);

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(providerId, tenantId);

    const result = await pool.query(
      `UPDATE referring_providers SET ${updates.join(", ")}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
       RETURNING id`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found" });
    }

    await auditLog(tenantId, userId, "referring_provider_update", "referring_provider", providerId);
    res.json({ id: providerId });
  } catch (error: any) {
    logger.error("Error updating referring provider", { error: error.message });
    res.status(500).json({ error: "Failed to update provider" });
  }
});

/**
 * DELETE /api/referrals/providers/:id
 * Deactivate referring provider (soft delete)
 */
referralsRouter.delete("/providers/:id", requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const providerId = req.params.id!;

    const result = await pool.query(
      `UPDATE referring_providers SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [providerId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found" });
    }

    await auditLog(tenantId, userId, "referring_provider_deactivate", "referring_provider", providerId);
    res.json({ id: providerId, message: "Provider deactivated" });
  } catch (error: any) {
    logger.error("Error deactivating referring provider", { error: error.message });
    res.status(500).json({ error: "Failed to deactivate provider" });
  }
});

// =====================================================
// REFERRAL ENDPOINTS
// =====================================================

/**
 * GET /api/referrals/metrics
 * Get referral metrics for dashboard
 */
referralsRouter.get("/metrics", async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { startDate, endDate } = req.query;

    const metrics = await ReferralService.getReferralMetrics(
      tenantId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.json({ metrics });
  } catch (error: any) {
    logger.error("Error getting referral metrics", { error: error.message });
    res.status(500).json({ error: "Failed to get metrics" });
  }
});

/**
 * GET /api/referrals/stalled
 * Get stalled referrals (> 5 days without scheduling)
 */
referralsRouter.get("/stalled", async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const stalledReferrals = await ReferralService.getStalledReferrals(tenantId);

    res.json({ referrals: stalledReferrals });
  } catch (error: any) {
    logger.error("Error getting stalled referrals", { error: error.message });
    res.status(500).json({ error: "Failed to get stalled referrals" });
  }
});

/**
 * GET /api/referrals
 * List referrals with filters
 */
referralsRouter.get("/", async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      status,
      priority,
      patientId,
      referringProviderId,
      direction,
      startDate,
      endDate,
      stalled,
      limit = "50",
      offset = "0",
    } = req.query;

    let query = `
      SELECT
        r.id,
        r.referral_number as "referralNumber",
        r.patient_id as "patientId",
        p.first_name || ' ' || p.last_name as "patientName",
        r.referring_provider_id as "referringProviderId",
        COALESCE(rp.name, r.referring_provider) as "referringProviderName",
        COALESCE(rp.practice_name, r.referring_practice, r.referring_organization) as "referringPractice",
        r.assigned_provider_id as "assignedProviderId",
        pr.full_name as "assignedProviderName",
        r.direction,
        r.status,
        r.priority,
        r.diagnosis_codes as "diagnosisCodes",
        r.reason,
        r.clinical_notes as "clinicalNotes",
        r.insurance_auth_status as "insuranceAuthStatus",
        r.insurance_auth_number as "insuranceAuthNumber",
        r.appointment_id as "appointmentId",
        r.scheduled_date as "scheduledDate",
        r.received_at as "receivedAt",
        r.verified_at as "verifiedAt",
        r.report_sent_at as "reportSentAt",
        r.created_at as "createdAt",
        r.updated_at as "updatedAt",
        EXTRACT(DAY FROM NOW() - r.created_at)::INT as "daysSinceReceived"
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      LEFT JOIN referring_providers rp ON r.referring_provider_id = rp.id
      LEFT JOIN providers pr ON r.assigned_provider_id = pr.id
      WHERE r.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }
    if (priority) {
      query += ` AND r.priority = $${paramIndex++}`;
      params.push(priority);
    }
    if (patientId) {
      query += ` AND r.patient_id = $${paramIndex++}`;
      params.push(patientId);
    }
    if (referringProviderId) {
      query += ` AND r.referring_provider_id = $${paramIndex++}`;
      params.push(referringProviderId);
    }
    if (direction) {
      query += ` AND r.direction = $${paramIndex++}`;
      params.push(direction);
    }
    if (startDate) {
      query += ` AND r.created_at >= $${paramIndex++}::date`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND r.created_at <= $${paramIndex++}::date + INTERVAL '1 day'`;
      params.push(endDate);
    }
    if (stalled === "true") {
      query += ` AND r.status IN ('received', 'verified') AND r.created_at < NOW() - INTERVAL '5 days'`;
    }

    query += ` ORDER BY
      CASE WHEN r.priority = 'stat' THEN 1 WHEN r.priority = 'urgent' THEN 2 ELSE 3 END,
      r.created_at DESC
    `;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM referrals r WHERE r.tenant_id = $1`;
    const countParams: any[] = [tenantId];
    let countIndex = 2;

    if (status) {
      countQuery += ` AND r.status = $${countIndex++}`;
      countParams.push(status);
    }
    if (priority) {
      countQuery += ` AND r.priority = $${countIndex++}`;
      countParams.push(priority);
    }
    if (patientId) {
      countQuery += ` AND r.patient_id = $${countIndex++}`;
      countParams.push(patientId);
    }
    if (stalled === "true") {
      countQuery += ` AND r.status IN ('received', 'verified') AND r.created_at < NOW() - INTERVAL '5 days'`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      referrals: result.rows,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + result.rows.length < total,
      },
    });
  } catch (error: any) {
    logger.error("Error listing referrals", { error: error.message });
    res.status(500).json({ error: "Failed to list referrals" });
  }
});

/**
 * GET /api/referrals/:id
 * Get referral details
 */
referralsRouter.get("/:id", async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const referralId = req.params.id;

    const referralResult = await pool.query(
      `SELECT
        r.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.date_of_birth as patient_dob,
        p.phone as patient_phone,
        rp.name as referring_provider_name,
        rp.practice_name as referring_practice_name,
        rp.phone as referring_provider_phone,
        rp.fax as referring_provider_fax,
        rp.email as referring_provider_email,
        rp.preferences as referring_provider_preferences,
        pr.full_name as assigned_provider_name,
        a.scheduled_start as appointment_start,
        a.scheduled_end as appointment_end,
        a.status as appointment_status
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      LEFT JOIN referring_providers rp ON r.referring_provider_id = rp.id
      LEFT JOIN providers pr ON r.assigned_provider_id = pr.id
      LEFT JOIN appointments a ON r.appointment_id = a.id
      WHERE r.id = $1 AND r.tenant_id = $2`,
      [referralId, tenantId]
    );

    if (referralResult.rows.length === 0) {
      return res.status(404).json({ error: "Referral not found" });
    }

    // Get status history
    const historyResult = await pool.query(
      `SELECT
        h.id,
        h.status,
        h.previous_status as "previousStatus",
        h.notes,
        h.created_at as "createdAt",
        u.full_name as "changedByName"
      FROM referral_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.referral_id = $1
      ORDER BY h.created_at DESC`,
      [referralId]
    );

    // Get communications
    const commsResult = await pool.query(
      `SELECT
        c.id,
        c.direction,
        c.channel,
        c.subject,
        c.message,
        c.status,
        c.attachments,
        c.contact_name as "contactName",
        c.sent_at as "sentAt",
        c.created_at as "createdAt",
        u.full_name as "createdByName"
      FROM referral_communications c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.referral_id = $1
      ORDER BY c.created_at DESC`,
      [referralId]
    );

    // Get documents
    const docsResult = await pool.query(
      `SELECT
        d.id,
        d.document_type as "documentType",
        d.filename,
        d.file_path as "filePath",
        d.file_size as "fileSize",
        d.description,
        d.created_at as "createdAt",
        u.full_name as "uploadedByName"
      FROM referral_documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.referral_id = $1
      ORDER BY d.created_at DESC`,
      [referralId]
    );

    res.json({
      referral: referralResult.rows[0],
      statusHistory: historyResult.rows,
      communications: commsResult.rows,
      documents: docsResult.rows,
    });
  } catch (error: any) {
    logger.error("Error getting referral", { error: error.message });
    res.status(500).json({ error: "Failed to get referral" });
  }
});

/**
 * POST /api/referrals
 * Create new referral
 */
referralsRouter.post("/", requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = createReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const data = parsed.data;

    const result = await ReferralService.processIncomingReferral(
      tenantId,
      {
        patientId: data.patientId,
        referringProviderId: data.referringProviderId,
        referringProviderName: data.referringProviderName || data.referringProvider,
        referringPractice: data.referringPractice || data.referringOrganization,
        priority: data.priority,
        diagnosisCodes: data.diagnosisCodes,
        reason: data.reason || data.notes,
        clinicalNotes: data.clinicalNotes,
        insuranceAuthNumber: data.insuranceAuthNumber,
      },
      userId
    );

    res.status(201).json({
      id: result.referralId,
      referralNumber: result.referralNumber,
      autoAcknowledged: result.autoAcknowledged,
    });
  } catch (error: any) {
    logger.error("Error creating referral", { error: error.message });
    res.status(500).json({ error: "Failed to create referral" });
  }
});

/**
 * PATCH /api/referrals/:id
 * Update referral details
 */
referralsRouter.patch("/:id", requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = updateReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const referralId = req.params.id!;
    const data = parsed.data;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(data.priority);
    }
    if (data.assignedProviderId) {
      updates.push(`assigned_provider_id = $${paramIndex++}`);
      values.push(data.assignedProviderId);
    }
    if (data.clinicalNotes !== undefined) {
      updates.push(`clinical_notes = $${paramIndex++}`);
      values.push(data.clinicalNotes);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }
    if (data.insuranceAuthStatus) {
      updates.push(`insurance_auth_status = $${paramIndex++}`);
      values.push(data.insuranceAuthStatus);
    }
    if (data.insuranceAuthNumber !== undefined) {
      updates.push(`insurance_auth_number = $${paramIndex++}`);
      values.push(data.insuranceAuthNumber);
    }

    if (updates.length === 0 && !data.status) {
      return res.status(400).json({ error: "No updates provided" });
    }

    // Handle status update separately for proper workflow
    if (data.status) {
      await ReferralService.updateReferralStatus(tenantId, referralId, {
        status: data.status,
        notes: data.notes,
        changedBy: userId,
      });
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(referralId, tenantId);

      const result = await pool.query(
        `UPDATE referrals SET ${updates.join(", ")}
         WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
         RETURNING id`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Referral not found" });
      }
    }

    await auditLog(tenantId, userId, "referral_update", "referral", referralId);
    res.json({ id: referralId });
  } catch (error: any) {
    logger.error("Error updating referral", { error: error.message });
    res.status(500).json({ error: error.message || "Failed to update referral" });
  }
});

/**
 * PUT /api/referrals/:id (backward compatibility)
 * Same as PATCH for backward compatibility
 */
referralsRouter.put("/:id", requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = updateReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const referralId = req.params.id!;
    const data = parsed.data;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(data.priority);
    }
    if (data.assignedProviderId) {
      updates.push(`assigned_provider_id = $${paramIndex++}`);
      values.push(data.assignedProviderId);
    }
    if (data.clinicalNotes !== undefined) {
      updates.push(`clinical_notes = $${paramIndex++}`);
      values.push(data.clinicalNotes);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }
    if (data.insuranceAuthStatus) {
      updates.push(`insurance_auth_status = $${paramIndex++}`);
      values.push(data.insuranceAuthStatus);
    }
    if (data.insuranceAuthNumber !== undefined) {
      updates.push(`insurance_auth_number = $${paramIndex++}`);
      values.push(data.insuranceAuthNumber);
    }

    if (updates.length === 0 && !data.status) {
      return res.status(400).json({ error: "No updates provided" });
    }

    if (data.status) {
      await ReferralService.updateReferralStatus(tenantId, referralId, {
        status: data.status,
        notes: data.notes,
        changedBy: userId,
      });
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(referralId, tenantId);

      const result = await pool.query(
        `UPDATE referrals SET ${updates.join(", ")}
         WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
         RETURNING id`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Referral not found" });
      }
    }

    await auditLog(tenantId, userId, "referral_update", "referral", referralId);
    res.json({ id: referralId });
  } catch (error: any) {
    logger.error("Error updating referral", { error: error.message });
    res.status(500).json({ error: error.message || "Failed to update referral" });
  }
});

/**
 * PATCH /api/referrals/:id/status
 * Update referral status
 */
referralsRouter.patch("/:id/status", requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const referralId = req.params.id!;

    await ReferralService.updateReferralStatus(tenantId, referralId, {
      status: parsed.data.status,
      notes: parsed.data.notes,
      changedBy: userId,
    });

    res.json({ id: referralId, status: parsed.data.status });
  } catch (error: any) {
    logger.error("Error updating referral status", { error: error.message });
    res.status(500).json({ error: error.message || "Failed to update status" });
  }
});

/**
 * POST /api/referrals/:id/schedule
 * Convert referral to appointment
 */
referralsRouter.post("/:id/schedule", requireRoles(["admin", "front_desk", "ma"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = scheduleAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const referralId = req.params.id!;

    // Get patient ID from referral
    const referralResult = await pool.query(
      `SELECT patient_id FROM referrals WHERE id = $1 AND tenant_id = $2`,
      [referralId, tenantId]
    );

    if (referralResult.rows.length === 0) {
      return res.status(404).json({ error: "Referral not found" });
    }

    const result = await ReferralService.convertReferralToAppointment(
      tenantId,
      {
        referralId,
        patientId: referralResult.rows[0].patient_id,
        providerId: parsed.data.providerId,
        locationId: parsed.data.locationId,
        appointmentTypeId: parsed.data.appointmentTypeId,
        scheduledStart: parsed.data.scheduledStart,
        scheduledEnd: parsed.data.scheduledEnd,
      },
      userId
    );

    res.status(201).json({
      referralId,
      appointmentId: result.appointmentId,
      message: "Appointment scheduled successfully",
    });
  } catch (error: any) {
    logger.error("Error scheduling referral", { error: error.message });
    res.status(500).json({ error: error.message || "Failed to schedule appointment" });
  }
});

/**
 * POST /api/referrals/:id/report
 * Send closed-loop report to referring provider
 */
referralsRouter.post("/:id/report", requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = sendReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const referralId = req.params.id!;

    const result = await ReferralService.generateClosedLoopReport(
      tenantId,
      {
        referralId,
        encounterId: parsed.data.encounterId,
        diagnosis: parsed.data.diagnosis,
        treatmentPlan: parsed.data.treatmentPlan,
        followUpRecommendations: parsed.data.followUpRecommendations,
        additionalNotes: parsed.data.additionalNotes,
      },
      userId
    );

    res.json({
      referralId,
      reportId: result.reportId,
      sent: result.sent,
      message: result.sent ? "Report sent to referring provider" : "Report generated but not sent (no provider configured)",
    });
  } catch (error: any) {
    logger.error("Error sending closed-loop report", { error: error.message });
    res.status(500).json({ error: error.message || "Failed to send report" });
  }
});

/**
 * POST /api/referrals/:id/check-auth
 * Check insurance authorization status
 */
referralsRouter.post("/:id/check-auth", requireRoles(["admin", "front_desk", "ma"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const referralId = req.params.id!;

    const result = await ReferralService.checkInsuranceAuthorization(tenantId, referralId, userId);

    res.json({
      referralId,
      insuranceAuthStatus: result.status,
      insuranceAuthNumber: result.authNumber,
      insuranceAuthExpiry: result.expiryDate,
    });
  } catch (error: any) {
    logger.error("Error checking insurance auth", { error: error.message });
    res.status(500).json({ error: error.message || "Failed to check authorization" });
  }
});

/**
 * DELETE /api/referrals/:id
 * Delete referral (soft delete via status change to cancelled)
 */
referralsRouter.delete("/:id", requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const referralId = req.params.id!;

    await ReferralService.updateReferralStatus(tenantId, referralId, {
      status: "cancelled",
      notes: "Referral cancelled/deleted",
      changedBy: userId,
    });

    await auditLog(tenantId, userId, "referral_delete", "referral", referralId);
    res.json({ id: referralId, message: "Referral cancelled" });
  } catch (error: any) {
    logger.error("Error deleting referral", { error: error.message });
    res.status(500).json({ error: error.message || "Failed to delete referral" });
  }
});
