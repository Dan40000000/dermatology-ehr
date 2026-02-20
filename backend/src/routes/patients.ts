import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { parsePagination, paginatedResponse } from "../middleware/pagination";
import { parseFields, buildSelectClause } from "../middleware/fieldSelection";
import { emitPatientUpdated } from "../websocket/emitter";
import { logger } from "../lib/logger";
import { buildSsnFields } from "../security/encryption";
import { auditPatientDataAccess } from "../services/audit";

const ssnInputSchema = z.string().refine((value) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 4 || digits.length === 9;
}, {
  message: "SSN must be 4 or 9 digits",
});

const canAccessSsnLast4 = (req: AuthedRequest): boolean => {
  const role = req.user?.role;
  return role === "admin" || role === "provider" || role === "ma";
};

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logPatientsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

async function safeAuditPatientAccess(params: {
  tenantId: string;
  userId?: string;
  patientId: string;
  accessType: "view" | "create" | "update" | "delete" | "export";
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await auditPatientDataAccess({
      ...params,
      userId: params.userId || "system",
    });
  } catch (error: any) {
    logger.warn("Patient audit logging failed", {
      error: toSafeErrorMessage(error),
      patientId: params.patientId,
      accessType: params.accessType,
    });
  }
}

const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dob: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || v.replace(/\D/g, "").length >= 10, { message: "Invalid phone" }),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  insurance: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
  // Additional fields for complete patient record
  sex: z.enum(['M', 'F', 'O']).optional(),
  ssn: ssnInputSchema.optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  pharmacyName: z.string().optional(),
  pharmacyPhone: z.string().optional(),
  pharmacyAddress: z.string().optional(),
  primaryCarePhysician: z.string().optional(),
  referralSource: z.string().optional(),
  insuranceId: z.string().optional(),
  insuranceGroupNumber: z.string().optional(),
});

export const patientsRouter = Router();

/**
 * @swagger
 * /api/patients:
 *   get:
 *     summary: List patients
 *     description: Retrieve a paginated list of patients for the current tenant with optional field selection.
 *     tags:
 *       - Patients
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to return (e.g., id,firstName,lastName,email)
 *     responses:
 *       200:
 *         description: Paginated list of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Patient'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
patientsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { page, limit, offset } = parsePagination(req);
  const selectedFields = parseFields(req);
  const canViewSsn = canAccessSsnLast4(req);

  if (selectedFields?.includes("ssn") && !canViewSsn) {
    return res.status(403).json({ error: "Insufficient role to access SSN data" });
  }

  // Build SELECT clause based on requested fields
  const fieldMap: Record<string, string> = {
    id: "id",
    firstName: `first_name as "firstName"`,
    lastName: `last_name as "lastName"`,
    dateOfBirth: `dob as "dateOfBirth"`,
    mrn: "mrn",
    phone: "phone",
    email: "email",
    sex: "sex",
    address: "address",
    city: "city",
    state: "state",
    zip: "zip",
    insurance: "insurance",
    allergies: "allergies",
    medications: "medications",
    createdAt: `created_at as "createdAt"`,
    updatedAt: `updated_at as "updatedAt"`,
    ssn: canViewSsn ? `ssn_last4 as "ssn"` : `null::text as "ssn"`,
  };
  const defaultFieldList = [
    "id",
    "firstName",
    "lastName",
    "dateOfBirth",
    "mrn",
    "phone",
    "email",
    "sex",
    "address",
    "city",
    "state",
    "zip",
    "insurance",
    "allergies",
    "medications",
    "createdAt",
    "updatedAt",
  ];
  const defaultFields = defaultFieldList.map((field) => fieldMap[field]).join(", ");
  const allowedFields = Object.keys(fieldMap);

  let selectClause = defaultFields;
  if (selectedFields) {
    try {
      selectClause = buildSelectClause(selectedFields, defaultFields, fieldMap, allowedFields);
    } catch (error: unknown) {
      return res.status(400).json({ error: (error as Error).message });
    }
  }

  // Get total count
  const countResult = await pool.query(
    `select count(*) from patients where tenant_id = $1`,
    [tenantId]
  );
  const total = parseInt(countResult.rows[0].count);

  // Get paginated data with last visit information
  const result = await pool.query(
    `select ${selectClause},
       (select max(scheduled_start) from appointments
        where appointments.patient_id = patients.id
          and appointments.tenant_id = patients.tenant_id
          and appointments.status = 'completed') as "lastVisit"
     from patients where tenant_id = $1 order by created_at desc limit $2 offset $3`,
    [tenantId, limit, offset],
  );

  await safeAuditPatientAccess({
    tenantId,
    userId: req.user!.id,
    patientId: "patient-list",
    accessType: "view",
    resourceType: "patient_list",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });

  return res.json(paginatedResponse(result.rows, total, page, limit));
});

/**
 * @swagger
 * /api/patients:
 *   post:
 *     summary: Create a new patient
 *     description: Create a new patient record. Requires admin, ma, front_desk, or provider role.
 *     tags:
 *       - Patients
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePatientRequest'
 *     responses:
 *       201:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
patientsRouter.post("/", requireAuth, requireRoles(["admin", "ma", "front_desk", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = createPatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const {
    firstName, lastName, dob, phone, email, address, city, state, zip,
    insurance, allergies, medications, sex, ssn,
    emergencyContactName, emergencyContactRelationship, emergencyContactPhone,
    pharmacyName, pharmacyPhone, pharmacyAddress,
    primaryCarePhysician, referralSource, insuranceId, insuranceGroupNumber
  } = parsed.data;
  const { ssnLast4, ssnEncrypted } = buildSsnFields(ssn);

  await pool.query(
    `insert into patients(
      id, tenant_id, first_name, last_name, dob, phone, email, address, city, state, zip,
      insurance, allergies, medications, sex, ssn_last4, ssn_encrypted,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
      pharmacy_name, pharmacy_phone, pharmacy_address,
      primary_care_physician, referral_source, insurance_id, insurance_group_number
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
    [
      id, tenantId, firstName, lastName, dob || null, phone || null, email || null,
      address || null, city || null, state || null, zip || null,
      insurance || null, allergies || null, medications || null, sex || null, ssnLast4, ssnEncrypted,
      emergencyContactName || null, emergencyContactRelationship || null, emergencyContactPhone || null,
      pharmacyName || null, pharmacyPhone || null, pharmacyAddress || null,
      primaryCarePhysician || null, referralSource || null, insuranceId || null, insuranceGroupNumber || null
    ],
  );

  await safeAuditPatientAccess({
    tenantId,
    userId: req.user!.id,
    patientId: id,
    accessType: "create",
    resourceType: "patient",
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  return res.status(201).json({ id });
});

/**
 * @swagger
 * /api/patients/{id}:
 *   get:
 *     summary: Get patient by ID
 *     description: Retrieve a single patient's detailed information by ID.
 *     tags:
 *       - Patients
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 patient:
 *                   $ref: '#/components/schemas/Patient'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch patient
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
patientsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  const tenantId = req.user!.tenantId;
  const canViewSsn = canAccessSsnLast4(req);

  try {
    const result = await pool.query(
      `select id, first_name as "firstName", last_name as "lastName", dob, phone, email,
              address, city, state, zip, insurance, allergies, medications, sex,
              ${canViewSsn ? `ssn_last4 as "ssn"` : `null::text as "ssn"`},
              emergency_contact_name as "emergencyContactName",
              emergency_contact_relationship as "emergencyContactRelationship",
              emergency_contact_phone as "emergencyContactPhone",
              pharmacy_name as "pharmacyName",
              pharmacy_phone as "pharmacyPhone",
              pharmacy_address as "pharmacyAddress",
              insurance_id as "insuranceId",
              insurance_group_number as "insuranceGroupNumber",
              primary_care_physician as "primaryCarePhysician",
              referral_source as "referralSource",
              created_at as "createdAt", updated_at as "updatedAt"
       from patients where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    await safeAuditPatientAccess({
      tenantId,
      userId: req.user!.id,
      patientId: id,
      accessType: "view",
      resourceType: "patient",
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });

    return res.json({ patient: result.rows[0] });
  } catch (error) {
    logPatientsError("Error fetching patient", error);
    return res.status(500).json({ error: "Failed to fetch patient" });
  }
});

const updatePatientSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dob: z.string().optional(),
  sex: z.enum(['M', 'F', 'O']).optional(),
  ssn: ssnInputSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  pharmacyName: z.string().optional(),
  pharmacyPhone: z.string().optional(),
  pharmacyAddress: z.string().optional(),
  insurance: z.string().optional(),
  insuranceId: z.string().optional(),
  insuranceGroupNumber: z.string().optional(),
  primaryCarePhysician: z.string().optional(),
  referralSource: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
});

/**
 * @swagger
 * /api/patients/{id}:
 *   put:
 *     summary: Update patient
 *     description: Update an existing patient's information. Requires admin, ma, front_desk, or provider role.
 *     tags:
 *       - Patients
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePatientRequest'
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Validation error or no fields to update
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to update patient
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
patientsRouter.put("/:id", requireAuth, requireRoles(["admin", "ma", "front_desk", "provider"]), async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  const tenantId = req.user!.tenantId;

  const parsed = updatePatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { ssn, ...patientUpdates } = parsed.data;

  // Build dynamic update query
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(patientUpdates).forEach(([key, value]) => {
    if (value !== undefined) {
      // Convert camelCase to snake_case for database columns
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      updates.push(`${dbKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (ssn !== undefined) {
    const { ssnLast4, ssnEncrypted } = buildSsnFields(ssn);
    updates.push(`ssn_last4 = $${paramIndex}`);
    values.push(ssnLast4);
    paramIndex++;
    updates.push(`ssn_encrypted = $${paramIndex}`);
    values.push(ssnEncrypted);
    paramIndex++;
    updates.push(`ssn = $${paramIndex}`);
    values.push(null);
    paramIndex++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  // Add tenant_id and id to values
  values.push(tenantId, id);

  const query = `
    UPDATE patients
    SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}
    RETURNING id
  `;

  try {
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await safeAuditPatientAccess({
      tenantId,
      userId: req.user!.id,
      patientId: id,
      accessType: "update",
      resourceType: "patient",
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });

    // Emit WebSocket event for patient update
    try {
      const patientData = await pool.query(
        `SELECT id, first_name, last_name, dob, phone, email, insurance
         FROM patients
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      if (patientData.rows.length > 0) {
        const patient = patientData.rows[0];
        emitPatientUpdated(tenantId, {
          id: patient.id,
          firstName: patient.first_name,
          lastName: patient.last_name,
          dob: patient.dob,
          phone: patient.phone,
          email: patient.email,
          insurance: patient.insurance,
          lastUpdated: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error("Failed to emit patient updated event", {
        error: error.message,
        patientId: id,
      });
    }

    return res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    logPatientsError("Error updating patient", error);
    return res.status(500).json({ error: 'Failed to update patient' });
  }
});

/**
 * @swagger
 * /api/patients/{id}:
 *   delete:
 *     summary: Delete patient
 *     description: Delete a patient and all associated records (appointments, encounters, documents, etc.). Admin only.
 *     tags:
 *       - Patients
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to delete patient
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
patientsRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  const tenantId = req.user!.tenantId;

  try {
    // First check if patient exists
    const checkResult = await pool.query(
      `SELECT id, first_name, last_name FROM patients WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = checkResult.rows[0];

    // Delete related records first (due to foreign key constraints)
    // Delete appointments
    await pool.query(`DELETE FROM appointments WHERE patient_id = $1 AND tenant_id = $2`, [id, tenantId]);

    // Delete encounters
    await pool.query(`DELETE FROM encounters WHERE patient_id = $1 AND tenant_id = $2`, [id, tenantId]);

    // Delete documents
    await pool.query(`DELETE FROM documents WHERE patient_id = $1 AND tenant_id = $2`, [id, tenantId]);

    // Delete photos
    await pool.query(`DELETE FROM photos WHERE patient_id = $1 AND tenant_id = $2`, [id, tenantId]);

    // Delete tasks
    await pool.query(`DELETE FROM tasks WHERE patient_id = $1 AND tenant_id = $2`, [id, tenantId]);

    // Delete messages
    await pool.query(`DELETE FROM messages WHERE patient_id = $1 AND tenant_id = $2`, [id, tenantId]);

    // Finally delete the patient
    await pool.query(`DELETE FROM patients WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);

    await safeAuditPatientAccess({
      tenantId,
      userId: req.user!.id,
      patientId: id,
      accessType: "delete",
      resourceType: "patient",
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });

    return res.json({
      success: true,
      message: `Patient ${patient.first_name} ${patient.last_name} has been deleted`
    });
  } catch (error) {
    logPatientsError("Error deleting patient", error);
    return res.status(500).json({ error: 'Failed to delete patient' });
  }
});

/**
 * @swagger
 * /api/patients/{id}/appointments:
 *   get:
 *     summary: Get patient appointments
 *     description: Retrieve all appointments for a specific patient
 *     tags:
 *       - Patients
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 appointments:
 *                   type: array
 */
patientsRouter.get("/:id/appointments", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT a.id, a.patient_id as "patientId", a.provider_id as "providerId",
              a.appointment_type_id as "appointmentTypeId", a.location_id as "locationId",
              a.scheduled_start as "scheduledStart", a.scheduled_end as "scheduledEnd",
              a.duration_minutes as "durationMinutes", a.status, a.chief_complaint as "chiefComplaint",
              a.notes, a.created_at as "createdAt", a.updated_at as "updatedAt",
              p.first_name || ' ' || p.last_name as "providerName",
              at.name as "appointmentType"
       FROM appointments a
       LEFT JOIN providers p ON a.provider_id = p.id
       LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
       WHERE a.patient_id = $1 AND a.tenant_id = $2
       ORDER BY a.scheduled_start DESC`,
      [id, tenantId]
    );

    return res.json({ appointments: result.rows });
  } catch (error) {
    logPatientsError("Error fetching patient appointments", error);
    return res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/encounters:
 *   get:
 *     summary: Get patient encounters
 *     description: Retrieve all encounters for a specific patient
 */
patientsRouter.get("/:id/encounters", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT e.id, e.patient_id as "patientId", e.provider_id as "providerId",
              e.appointment_id as "appointmentId", e.created_at as "encounterDate",
              e.chief_complaint as "chiefComplaint", e.hpi, e.ros, e.exam as "physicalExam",
              e.assessment_plan as "assessmentPlan", e.status,
              e.created_at as "createdAt", e.updated_at as "updatedAt",
              pr.full_name as "providerName"
       FROM encounters e
       LEFT JOIN providers pr ON e.provider_id = pr.id
       WHERE e.patient_id = $1 AND e.tenant_id = $2
       ORDER BY e.created_at DESC`,
      [id, tenantId]
    );

    return res.json({ encounters: result.rows });
  } catch (error) {
    logPatientsError("Error fetching patient encounters", error);
    return res.status(500).json({ error: "Failed to fetch encounters" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/prescriptions:
 *   get:
 *     summary: Get patient prescriptions
 *     description: Retrieve all prescriptions for a specific patient
 */
patientsRouter.get("/:id/prescriptions", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const { status, includeInactive } = req.query;

  try {
    // Verify patient exists
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    let query = `
      SELECT p.id, p.patient_id as "patientId", p.provider_id as "providerId",
             p.encounter_id as "encounterId",
             p.medication_name as "medicationName", p.generic_name as "genericName",
             p.strength, p.dosage_form as "dosageForm", p.sig, p.quantity, p.quantity_unit as "quantityUnit",
             p.refills, p.refills_remaining as "refillsRemaining", p.days_supply as "daysSupply",
             p.status, p.is_controlled as "isControlled", p.dea_schedule as "deaSchedule",
             p.pharmacy_id as "pharmacyId", p.pharmacy_name as "pharmacyName",
             p.indication, p.notes,
             p.written_date as "writtenDate", p.sent_at as "sentAt",
             p.last_filled_date as "lastFilledDate",
             p.created_at as "createdAt", p.updated_at as "updatedAt",
             prov.full_name as "providerName",
             ph.name as "pharmacyFullName", ph.phone as "pharmacyPhone",
             e.created_at as "encounterDate"
      FROM prescriptions p
      LEFT JOIN providers prov ON p.provider_id = prov.id
      LEFT JOIN pharmacies ph ON p.pharmacy_id = ph.id
      LEFT JOIN encounters e ON p.encounter_id = e.id
      WHERE p.patient_id = $1 AND p.tenant_id = $2
    `;

    const params: any[] = [id, tenantId];
    let paramIndex = 3;

    // Filter by status if provided
    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    } else if (includeInactive !== 'true') {
      // By default, exclude cancelled and discontinued prescriptions
      query += ` AND p.status NOT IN ('cancelled', 'discontinued')`;
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);

    // Group prescriptions by active vs inactive
    const prescriptions = result.rows;
    const active = prescriptions.filter(p =>
      p.status !== 'cancelled' &&
      p.status !== 'discontinued' &&
      (p.refillsRemaining === null || p.refillsRemaining > 0)
    );
    const inactive = prescriptions.filter(p =>
      p.status === 'cancelled' ||
      p.status === 'discontinued' ||
      (p.refillsRemaining !== null && p.refillsRemaining <= 0)
    );

    return res.json({
      prescriptions: result.rows,
      summary: {
        total: prescriptions.length,
        active: active.length,
        inactive: inactive.length,
        controlled: prescriptions.filter(p => p.isControlled).length,
      }
    });
  } catch (error) {
    logPatientsError("Error fetching patient prescriptions", error);
    return res.status(500).json({ error: "Failed to fetch prescriptions" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/prior-auths:
 *   get:
 *     summary: Get patient prior authorizations
 */
patientsRouter.get("/:id/prior-auths", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT pa.id, pa.patient_id as "patientId", pa.prescription_id as "prescriptionId",
              pa.medication_name as "medicationName", pa.status, pa.submitted_date as "submittedDate",
              pa.decision_date as "decisionDate", pa.approval_number as "approvalNumber",
              pa.denial_reason as "denialReason", pa.expires_at as "expiresAt",
              pa.insurance_company as "insuranceCompany", pa.notes,
              pa.created_at as "createdAt", pa.updated_at as "updatedAt",
              p.medication_name as "prescriptionMedication"
       FROM prior_auths pa
       LEFT JOIN prescriptions p ON pa.prescription_id = p.id
       WHERE pa.patient_id = $1 AND pa.tenant_id = $2
       ORDER BY pa.submitted_date DESC`,
      [id, tenantId]
    );

    return res.json({ priorAuths: result.rows });
  } catch (error) {
    logPatientsError("Error fetching patient prior authorizations", error);
    return res.status(500).json({ error: "Failed to fetch prior authorizations" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/biopsies:
 *   get:
 *     summary: Get patient biopsies
 */
patientsRouter.get("/:id/biopsies", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT b.id, b.patient_id as "patientId", b.encounter_id as "encounterId",
              b.lesion_id as "lesionId", b.specimen_type as "specimenType",
              b.specimen_number as "specimenNumber", b.body_location as "bodyLocation",
              b.clinical_description as "clinicalDescription", b.status,
              b.ordered_at as "orderedAt", b.collected_at as "collectedAt",
              b.sent_at as "sentAt", b.received_by_lab_at as "receivedByLabAt",
              b.resulted_at as "resultedAt", b.reviewed_at as "reviewedAt",
              b.path_lab as "pathLab", b.path_lab_case_number as "pathLabCaseNumber",
              b.pathology_diagnosis as "pathologyDiagnosis",
              b.pathology_report as "pathologyReport",
              b.malignancy_type as "malignancyType", b.margins,
              b.follow_up_action as "followUpAction",
              b.created_at as "createdAt", b.updated_at as "updatedAt",
              p.first_name || ' ' || p.last_name as "orderingProvider"
       FROM biopsies b
       LEFT JOIN providers p ON b.ordering_provider_id = p.id
       WHERE b.patient_id = $1 AND b.tenant_id = $2
       ORDER BY b.ordered_at DESC`,
      [id, tenantId]
    );

    return res.json({ biopsies: result.rows });
  } catch (error) {
    logPatientsError("Error fetching patient biopsies", error);
    return res.status(500).json({ error: "Failed to fetch biopsies" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/balance:
 *   get:
 *     summary: Get patient account balance
 */
patientsRouter.get("/:id/balance", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    // Get total charges
    const chargesResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_charges
       FROM charges
       WHERE patient_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    // Get total payments
    const paymentsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_payments
       FROM patient_payments
       WHERE patient_id = $1 AND tenant_id = $2 AND status != 'failed'`,
      [id, tenantId]
    );

    // Get recent payments
    const recentPaymentsResult = await pool.query(
      `SELECT id, amount, payment_method as "paymentMethod",
              payment_date as "paymentDate", status, notes,
              created_at as "createdAt"
       FROM patient_payments
       WHERE patient_id = $1 AND tenant_id = $2
       ORDER BY payment_date DESC
       LIMIT 10`,
      [id, tenantId]
    );

    // Get payment plans
    const paymentPlansResult = await pool.query(
      `SELECT id, total_amount as "totalAmount", amount_paid as "amountPaid",
              monthly_payment as "monthlyPayment", status,
              start_date as "startDate", created_at as "createdAt"
       FROM payment_plans
       WHERE patient_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [id, tenantId]
    );

    const totalCharges = parseFloat(chargesResult.rows[0].total_charges);
    const totalPayments = parseFloat(paymentsResult.rows[0].total_payments);
    const balance = totalCharges - totalPayments;

    return res.json({
      balance,
      totalCharges,
      totalPayments,
      recentPayments: recentPaymentsResult.rows,
      paymentPlans: paymentPlansResult.rows
    });
  } catch (error) {
    logPatientsError("Error fetching patient balance", error);
    return res.status(500).json({ error: "Failed to fetch balance" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/photos:
 *   get:
 *     summary: Get patient photos
 */
patientsRouter.get("/:id/photos", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT p.id, p.patient_id as "patientId", p.encounter_id as "encounterId",
              p.lesion_id as "lesionId", p.photo_type as "photoType",
              p.body_location as "bodyLocation", p.url, p.thumbnail_url as "thumbnailUrl",
              p.caption, p.tags, p.captured_at as "capturedAt",
              p.created_at as "createdAt", p.updated_at as "updatedAt"
       FROM photos p
       WHERE p.patient_id = $1 AND p.tenant_id = $2
       ORDER BY p.captured_at DESC`,
      [id, tenantId]
    );

    return res.json({ photos: result.rows });
  } catch (error) {
    logPatientsError("Error fetching patient photos", error);
    return res.status(500).json({ error: "Failed to fetch photos" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/body-map:
 *   get:
 *     summary: Get patient body map with lesions
 */
patientsRouter.get("/:id/body-map", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT l.id, l.patient_id as "patientId", l.encounter_id as "encounterId",
              l.body_region as "bodyRegion", l.body_location as "bodyLocation",
              l.x_coord as "xCoord", l.y_coord as "yCoord",
              l.lesion_type as "lesionType", l.description,
              l.size_mm as "sizeMm", l.color, l.shape, l.texture,
              l.diagnosis, l.status, l.first_noted as "firstNoted",
              l.last_examined as "lastExamined",
              l.created_at as "createdAt", l.updated_at as "updatedAt"
       FROM lesions l
       WHERE l.patient_id = $1 AND l.tenant_id = $2
       ORDER BY l.created_at DESC`,
      [id, tenantId]
    );

    return res.json({ lesions: result.rows });
  } catch (error) {
    logPatientsError("Error fetching patient body map", error);
    return res.status(500).json({ error: "Failed to fetch body map" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/insurance:
 *   get:
 *     summary: Get patient insurance and eligibility status
 */
patientsRouter.get("/:id/insurance", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    // Get patient insurance info
    const patientResult = await pool.query(
      `SELECT insurance, insurance_id as "insuranceId",
              insurance_group_number as "insuranceGroupNumber"
       FROM patients
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Get latest eligibility check
    const eligibilityResult = await pool.query(
      `SELECT id, status, checked_at as "checkedAt",
              coverage_active as "coverageActive", copay, deductible,
              deductible_remaining as "deductibleRemaining",
              out_of_pocket_max as "outOfPocketMax",
              out_of_pocket_remaining as "outOfPocketRemaining",
              benefits, raw_response as "rawResponse",
              created_at as "createdAt"
       FROM insurance_eligibility
       WHERE patient_id = $1 AND tenant_id = $2
       ORDER BY checked_at DESC
       LIMIT 1`,
      [id, tenantId]
    );

    return res.json({
      insurance: patientResult.rows[0],
      eligibility: eligibilityResult.rows[0] || null
    });
  } catch (error) {
    logPatientsError("Error fetching patient insurance", error);
    return res.status(500).json({ error: "Failed to fetch insurance" });
  }
});
