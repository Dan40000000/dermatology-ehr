import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { getTableColumns } from "../db/schema";
import { REVENUE_CYCLE_ROLES } from "../lib/roles";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { requireRoles } from "../middleware/rbac";
import { parsePagination, paginatedResponse } from "../middleware/pagination";
import { parseFields, buildSelectClause } from "../middleware/fieldSelection";
import { emitPatientUpdated } from "../websocket/emitter";
import { logger } from "../lib/logger";
import { buildSsnFields } from "../security/encryption";
import { auditPatientDataAccess } from "../services/audit";
import { getPatientAllergySummaries, getPatientMedicationSummaries } from "../services/patientHealthRecord";

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
  pharmacyId: z.string().optional(),
  pharmacyNcpdp: z.string().optional(),
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
patientsRouter.get("/", requireAuth, requireModuleAccess("patients"), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { page, limit, offset } = parsePagination(req, { maxLimit: 1000 });
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
    accountNumber: `account_number as "accountNumber"`,
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
    pharmacyId: `pharmacy_id as "pharmacyId"`,
    pharmacyNcpdp: `pharmacy_ncpdp as "pharmacyNcpdp"`,
    pharmacyName: `pharmacy_name as "pharmacyName"`,
    pharmacyPhone: `pharmacy_phone as "pharmacyPhone"`,
    pharmacyAddress: `pharmacy_address as "pharmacyAddress"`,
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
    "accountNumber",
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
    "pharmacyId",
    "pharmacyNcpdp",
    "pharmacyName",
    "pharmacyPhone",
    "pharmacyAddress",
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
    pharmacyId, pharmacyNcpdp, pharmacyName, pharmacyPhone, pharmacyAddress,
    primaryCarePhysician, referralSource, insuranceId, insuranceGroupNumber
  } = parsed.data;
  const { ssnLast4, ssnEncrypted } = buildSsnFields(ssn);
  const accountNumber = `ACCT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  await pool.query(
    `insert into patients(
      id, tenant_id, first_name, last_name, dob, phone, email, address, city, state, zip,
      insurance, allergies, medications, sex, ssn_last4, ssn_encrypted,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
      pharmacy_id, pharmacy_ncpdp, pharmacy_name, pharmacy_phone, pharmacy_address,
      primary_care_physician, referral_source, insurance_id, insurance_group_number, account_number
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
    [
      id, tenantId, firstName, lastName, dob || null, phone || null, email || null,
      address || null, city || null, state || null, zip || null,
      insurance || null, allergies || null, medications || null, sex || null, ssnLast4, ssnEncrypted,
      emergencyContactName || null, emergencyContactRelationship || null, emergencyContactPhone || null,
      pharmacyId || null, pharmacyNcpdp || null, pharmacyName || null, pharmacyPhone || null, pharmacyAddress || null,
      primaryCarePhysician || null, referralSource || null, insuranceId || null, insuranceGroupNumber || null,
      accountNumber
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
patientsRouter.get("/:id", requireAuth, requireModuleAccess("patients"), async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  const tenantId = req.user!.tenantId;
  const canViewSsn = canAccessSsnLast4(req);

  try {
    const result = await pool.query(
      `select id, first_name as "firstName", last_name as "lastName", dob, phone, email,
              address, city, state, zip, insurance, allergies, medications, sex,
              account_number as "accountNumber",
              ${canViewSsn ? `ssn_last4 as "ssn"` : `null::text as "ssn"`},
              emergency_contact_name as "emergencyContactName",
              emergency_contact_relationship as "emergencyContactRelationship",
              emergency_contact_phone as "emergencyContactPhone",
              pharmacy_id as "pharmacyId",
              pharmacy_ncpdp as "pharmacyNcpdp",
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

    const patient = result.rows[0];
    const [allergiesList, medicationsList] = await Promise.all([
      getPatientAllergySummaries(tenantId, id, pool, { legacyAllergies: patient.allergies }),
      getPatientMedicationSummaries(tenantId, id, pool, { legacyMedications: patient.medications }),
    ]);

    return res.json({ patient: { ...patient, allergiesList, medicationsList } });
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
  pharmacyId: z.string().optional().nullable(),
  pharmacyNcpdp: z.string().optional().nullable(),
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
patientsRouter.get("/:id/appointments", requireAuth, requireModuleAccess("schedule"), async (req: AuthedRequest, res) => {
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
patientsRouter.get("/:id/encounters", requireAuth, requireModuleAccess("notes"), async (req: AuthedRequest, res) => {
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

patientsRouter.get("/:id/clinical-summary", requireAuth, requireModuleAccess("patients"), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const diagnosesResult = await pool.query(
      `SELECT ed.id,
              ed.encounter_id as "encounterId",
              COALESCE(ed.icd10_code, ed.icd_code) as "icd10Code",
              ed.description,
              ed.is_primary as "isPrimary",
              ed.created_at as "createdAt",
              e.created_at as "encounterDate",
              e.chief_complaint as "chiefComplaint",
              pr.full_name as "providerName"
       FROM encounter_diagnoses ed
       INNER JOIN encounters e
         ON e.id = ed.encounter_id
        AND e.tenant_id = ed.tenant_id
       LEFT JOIN providers pr
         ON pr.id = e.provider_id
        AND pr.tenant_id = e.tenant_id
       WHERE ed.tenant_id = $1
         AND e.patient_id = $2
       ORDER BY ed.is_primary DESC, ed.created_at DESC`,
      [tenantId, id]
    );

    const recallsResult = await pool.query(
      `SELECT pr.id,
              pr.patient_id as "patientId",
              pr.campaign_id as "campaignId",
              COALESCE(pr.due_date, pr.recall_date) as "dueDate",
              pr.recall_date as "recallDate",
              COALESCE(pr.recall_type, rc.recall_type) as "recallType",
              pr.status,
              pr.last_contact_date as "lastContactDate",
              pr.contact_method as "contactMethod",
              pr.notes,
              pr.doctor_notes as "doctorNotes",
              pr.preferred_contact_method as "preferredContactMethod",
              pr.notified_on as "notifiedOn",
              pr.notification_count as "notificationCount",
              pr.appointment_id as "appointmentId",
              pr.created_at as "createdAt",
              pr.updated_at as "updatedAt",
              rc.name as "campaignName"
       FROM patient_recalls pr
       LEFT JOIN recall_campaigns rc
         ON rc.id = pr.campaign_id
        AND rc.tenant_id = pr.tenant_id
       WHERE pr.tenant_id = $1
         AND pr.patient_id = $2
       ORDER BY CASE WHEN pr.status IN ('pending', 'contacted', 'scheduled') THEN 0 ELSE 1 END,
                COALESCE(pr.due_date, pr.recall_date) ASC NULLS LAST,
                pr.created_at DESC`,
      [tenantId, id]
    );

    return res.json({
      diagnoses: diagnosesResult.rows,
      recalls: recallsResult.rows,
    });
  } catch (error) {
    logPatientsError("Error fetching patient clinical summary", error);
    return res.status(500).json({ error: "Failed to fetch patient clinical summary" });
  }
});

/**
 * @swagger
 * /api/patients/{id}/prescriptions:
 *   get:
 *     summary: Get patient prescriptions
 *     description: Retrieve all prescriptions for a specific patient
 */
patientsRouter.get("/:id/prescriptions", requireAuth, requireModuleAccess("rx"), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const { status, includeInactive } = req.query;

  try {
    const prescriptionColumns = await getTableColumns("prescriptions");
    const statusColumn = prescriptionColumns.has("status")
      ? "p.status"
      : prescriptionColumns.has("erx_status")
        ? "p.erx_status"
        : null;
    const hasEncounterColumn = prescriptionColumns.has("encounter_id");
    const hasPharmacyColumn = prescriptionColumns.has("pharmacy_id");
    const pharmacyColumns = hasPharmacyColumn ? await getTableColumns("pharmacies") : new Set<string>();
    const hasPharmacyTable = pharmacyColumns.size > 0;

    // Verify patient exists
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    let query = `
      SELECT p.*,
             p.patient_id as "patientId",
             p.provider_id as "providerId",
             NULLIF(to_jsonb(p)->>'encounter_id', '') as "encounterId",
             p.medication_name as "medicationName",
             p.created_at as "createdAt",
             NULLIF(to_jsonb(p)->>'updated_at', '') as "updatedAt",
             prov.full_name as "providerName",
             ${hasPharmacyTable ? `ph.name` : `NULL::text`} as "pharmacyFullName",
             ${hasPharmacyTable && pharmacyColumns.has("phone") ? `ph.phone` : `NULL::text`} as "pharmacyPhone",
             ${hasEncounterColumn ? `e.created_at` : `NULL::timestamptz`} as "encounterDate",
             COALESCE(${statusColumn ? `NULLIF(${statusColumn}, '')` : `NULL::text`}, 'active') as "status",
             NULLIF(to_jsonb(p)->>'generic_name', '') as "genericName",
             NULLIF(to_jsonb(p)->>'dosage_form', '') as "dosageForm",
             NULLIF(to_jsonb(p)->>'quantity_unit', '') as "quantityUnit",
             NULLIF(to_jsonb(p)->>'refills_remaining', '') as "refillsRemaining",
             NULLIF(to_jsonb(p)->>'days_supply', '') as "daysSupply",
             NULLIF(to_jsonb(p)->>'dea_schedule', '') as "deaSchedule",
             NULLIF(to_jsonb(p)->>'written_date', '') as "writtenDate",
             NULLIF(to_jsonb(p)->>'sent_at', '') as "sentAt",
             NULLIF(to_jsonb(p)->>'last_filled_date', '') as "lastFilledDate",
             NULLIF(to_jsonb(p)->>'pharmacy_id', '') as "pharmacyId",
             NULLIF(to_jsonb(p)->>'pharmacy_name', '') as "pharmacyName"
      FROM prescriptions p
      LEFT JOIN providers prov ON p.provider_id = prov.id AND p.tenant_id = prov.tenant_id
      ${hasPharmacyTable ? `LEFT JOIN pharmacies ph ON p.pharmacy_id = ph.id AND p.tenant_id = ph.tenant_id` : ``}
      ${hasEncounterColumn ? `LEFT JOIN encounters e ON p.encounter_id = e.id AND p.tenant_id = e.tenant_id` : ``}
      WHERE p.patient_id = $1 AND p.tenant_id = $2
    `;

    const params: any[] = [id, tenantId];
    let paramIndex = 3;

    // Filter by status if provided
    if (status && statusColumn) {
      query += ` AND ${statusColumn} = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    } else if (includeInactive !== 'true' && statusColumn) {
      // By default, exclude cancelled and discontinued prescriptions
      query += ` AND ${statusColumn} NOT IN ('cancelled', 'discontinued')`;
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    const prescriptions = result.rows.map((row: Record<string, any>) => ({
      ...row,
      patientId: row.patientId ?? row.patient_id ?? id,
      providerId: row.providerId ?? row.provider_id ?? null,
      encounterId: row.encounterId ?? row.encounter_id ?? null,
      medicationName: row.medicationName ?? row.medication_name ?? '',
      genericName: row.genericName ?? row.generic_name ?? null,
      dosageForm: row.dosageForm ?? row.dosage_form ?? null,
      quantityUnit: row.quantityUnit ?? row.quantity_unit ?? null,
      refillsRemaining: row.refillsRemaining ?? row.refills_remaining ?? row.refills ?? null,
      daysSupply: row.daysSupply ?? row.days_supply ?? null,
      isControlled: row.isControlled ?? row.is_controlled ?? false,
      deaSchedule: row.deaSchedule ?? row.dea_schedule ?? null,
      pharmacyId: row.pharmacyId ?? row.pharmacy_id ?? null,
      pharmacyName: row.pharmacyName ?? row.pharmacy_name ?? row.pharmacyFullName ?? null,
      writtenDate: row.writtenDate ?? row.written_date ?? null,
      sentAt: row.sentAt ?? row.sent_at ?? null,
      lastFilledDate: row.lastFilledDate ?? row.last_filled_date ?? null,
      createdAt: row.createdAt ?? row.created_at ?? null,
      updatedAt: row.updatedAt ?? row.updated_at ?? null,
      status: row.status ?? null,
    }));

    const active = prescriptions.filter((prescription) => {
      const normalizedStatus = String(prescription.status || '').toLowerCase();
      const inactiveStatus = normalizedStatus === 'cancelled' || normalizedStatus === 'discontinued';
      const hasNumericRefills = typeof prescription.refillsRemaining === 'number';
      const exhaustedRefills = hasNumericRefills && prescription.refillsRemaining <= 0;

      return !inactiveStatus && !exhaustedRefills;
    });
    const inactive = prescriptions.filter((prescription) => !active.includes(prescription));

    return res.json({
      prescriptions,
      summary: {
        total: prescriptions.length,
        active: active.length,
        inactive: inactive.length,
        controlled: prescriptions.filter((prescription) => Boolean(prescription.isControlled)).length,
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
patientsRouter.get("/:id/prior-auths", requireAuth, requireModuleAccess("epa"), async (req: AuthedRequest, res) => {
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
patientsRouter.get("/:id/biopsies", requireAuth, requireModuleAccess("labs"), async (req: AuthedRequest, res) => {
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
patientsRouter.get("/:id/balance", requireAuth, requireRoles(REVENUE_CYCLE_ROLES), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    // Bill-backed balances (includes no-show/late-fee bills)
    const billingSummaryResult = await pool.query(
      `SELECT
         COALESCE(
           SUM(
             CASE
               WHEN b.status <> 'cancelled' THEN COALESCE(b.total_charges_cents, 0)
               ELSE 0
             END
           ),
           0
         ) / 100.0 AS billed_charges,
         COALESCE(
           SUM(
             CASE
               WHEN b.status NOT IN ('paid', 'written_off', 'cancelled')
                 THEN GREATEST(COALESCE(b.balance_cents, 0), 0)
               ELSE 0
             END
           ),
           0
         ) / 100.0 AS outstanding_balance,
         COALESCE(
           SUM(
             CASE
               WHEN b.status NOT IN ('paid', 'written_off', 'cancelled')
                 AND b.due_date IS NOT NULL
                 AND b.due_date < CURRENT_DATE
                 THEN GREATEST(COALESCE(b.balance_cents, 0), 0)
               ELSE 0
             END
           ),
           0
         ) / 100.0 AS past_due_balance
       FROM bills b
       WHERE b.patient_id = $1
         AND b.tenant_id = $2`,
      [id, tenantId]
    );

    // Encounter charges that are not yet linked to any bill line item
    const unbilledChargesResult = await pool.query(
      `SELECT
         COALESCE(SUM(c.amount_cents), 0) / 100.0 AS unbilled_charges
       FROM charges c
       LEFT JOIN encounters e
         ON e.id = c.encounter_id
        AND e.tenant_id = c.tenant_id
       WHERE c.tenant_id = $2
         AND COALESCE(e.patient_id, NULLIF(to_jsonb(c)->>'patient_id', '')) = $1
         AND COALESCE(c.status, 'pending') <> 'voided'
         AND NOT EXISTS (
           SELECT 1
           FROM bill_line_items li
           WHERE li.tenant_id = c.tenant_id
             AND li.charge_id = c.id
         )`,
      [id, tenantId]
    );

    // Get total payments
    const paymentsResult = await pool.query(
      `SELECT COALESCE(SUM(amount_cents) / 100.0, 0) as total_payments
       FROM patient_payments
       WHERE patient_id = $1
         AND tenant_id = $2
         AND status NOT IN ('failed', 'voided')`,
      [id, tenantId]
    );

    // Get recent payments
    const recentPaymentsResult = await pool.query(
      `SELECT id,
              amount_cents / 100.0 as amount,
              payment_method as "paymentMethod",
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
      `SELECT
         pp.id,
         COALESCE(
           NULLIF(to_jsonb(pp)->>'total_amount', '')::numeric,
           NULLIF(to_jsonb(pp)->>'total_amount_cents', '')::numeric / 100.0,
           0
         ) as "totalAmount",
         COALESCE(
           NULLIF(to_jsonb(pp)->>'amount_paid', '')::numeric,
           NULLIF(to_jsonb(pp)->>'amount_paid_cents', '')::numeric / 100.0,
           COALESCE(
             NULLIF(to_jsonb(pp)->>'total_amount', '')::numeric,
             NULLIF(to_jsonb(pp)->>'total_amount_cents', '')::numeric / 100.0,
             0
           ) - COALESCE(
             NULLIF(to_jsonb(pp)->>'remaining_balance', '')::numeric,
             NULLIF(to_jsonb(pp)->>'remaining_balance_cents', '')::numeric / 100.0,
             0
           ),
           0
         ) as "amountPaid",
         COALESCE(
           NULLIF(to_jsonb(pp)->>'monthly_payment', '')::numeric,
           NULLIF(to_jsonb(pp)->>'monthly_payment_cents', '')::numeric / 100.0,
           0
         ) as "monthlyPayment",
         pp.status,
         COALESCE(NULLIF(to_jsonb(pp)->>'start_date', ''), NULLIF(to_jsonb(pp)->>'first_payment_date', '')) as "startDate",
         pp.created_at as "createdAt"
       FROM payment_plans pp
       WHERE pp.patient_id = $1 AND pp.tenant_id = $2
       ORDER BY pp.created_at DESC`,
      [id, tenantId]
    );

    // Get recent charge postings (line-item ledger)
    const recentChargesResult = await pool.query(
      `SELECT
         li.id,
         b.id as "billId",
         b.bill_number as "billNumber",
         li.cpt_code as "cptCode",
         li.description,
         li.service_date as "serviceDate",
         li.total_cents / 100.0 as amount,
         b.insurance_responsibility_cents as "insuranceResponsibilityCents",
         b.patient_responsibility_cents as "patientResponsibilityCents",
         b.balance_cents / 100.0 as "billBalance",
         b.due_date as "dueDate",
         b.status as "billStatus",
         (
           b.due_date IS NOT NULL
           AND b.due_date < CURRENT_DATE
           AND COALESCE(b.balance_cents, 0) > 0
           AND b.status NOT IN ('paid', 'written_off', 'cancelled')
         ) as "isPastDue"
       FROM bill_line_items li
       JOIN bills b
         ON b.id = li.bill_id
        AND b.tenant_id = li.tenant_id
       WHERE b.patient_id = $1
         AND b.tenant_id = $2
         AND b.status <> 'cancelled'
       ORDER BY li.service_date DESC NULLS LAST, li.created_at DESC
       LIMIT 15`,
      [id, tenantId]
    );

    const billedCharges = parseFloat(billingSummaryResult.rows[0]?.billed_charges || "0");
    const outstandingFromBills = parseFloat(billingSummaryResult.rows[0]?.outstanding_balance || "0");
    const pastDueBalance = parseFloat(billingSummaryResult.rows[0]?.past_due_balance || "0");
    const unbilledCharges = parseFloat(unbilledChargesResult.rows[0]?.unbilled_charges || "0");
    const totalCharges = billedCharges + unbilledCharges;
    const totalPayments = parseFloat(paymentsResult.rows[0].total_payments);
    const outstandingBalance = Math.max(0, outstandingFromBills + unbilledCharges);
    const currentBalance = Math.max(0, outstandingBalance - pastDueBalance);
    const fallbackBalance = Math.max(0, totalCharges - totalPayments);
    const balance = outstandingBalance > 0 ? outstandingBalance : fallbackBalance;

    return res.json({
      balance,
      currentBalance,
      pastDueBalance,
      totalCharges,
      totalPayments,
      recentCharges: recentChargesResult.rows,
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
patientsRouter.get("/:id/photos", requireAuth, requireModuleAccess("photos"), async (req: AuthedRequest, res) => {
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
patientsRouter.get("/:id/body-map", requireAuth, requireModuleAccess("body_diagram"), async (req: AuthedRequest, res) => {
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
patientsRouter.get("/:id/insurance", requireAuth, requireModuleAccess("patients"), async (req: AuthedRequest, res) => {
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
