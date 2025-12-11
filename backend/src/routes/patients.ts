import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

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
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  insurance: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
});

export const patientsRouter = Router();

patientsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, first_name as "firstName", last_name as "lastName", dob, phone, email,
            address, city, state, zip, insurance, allergies, medications,
            created_at as "createdAt"
     from patients where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId],
  );
  return res.json({ patients: result.rows });
});

patientsRouter.post("/", requireAuth, requireRoles(["admin", "ma", "front_desk", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = createPatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const { firstName, lastName, dob, phone, email, address, city, state, zip, insurance, allergies, medications } = parsed.data;

  await pool.query(
    `insert into patients(id, tenant_id, first_name, last_name, dob, phone, email, address, city, state, zip, insurance, allergies, medications)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, tenantId, firstName, lastName, dob || null, phone || null, email || null, address || null, city || null, state || null, zip || null, insurance || null, allergies || null, medications || null],
  );
  return res.status(201).json({ id });
});

const updatePatientSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dob: z.string().optional(),
  sex: z.enum(['M', 'F', 'O']).optional(),
  ssn: z.string().optional(),
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
  allergies: z.string().optional(),
  medications: z.string().optional(),
});

patientsRouter.put("/:id", requireAuth, requireRoles(["admin", "ma", "front_desk", "provider"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const parsed = updatePatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  // Build dynamic update query
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(parsed.data).forEach(([key, value]) => {
    if (value !== undefined) {
      // Convert camelCase to snake_case for database columns
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      updates.push(`${dbKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

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

    return res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error updating patient:', error);
    return res.status(500).json({ error: 'Failed to update patient' });
  }
});
