import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db/pool';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireAuth);

// Validation schemas
const createPriorAuthSchema = z.object({
  patientId: z.string().uuid(),
  prescriptionId: z.string().uuid().optional(),
  medicationName: z.string().min(1),
  diagnosisCode: z.string().min(1),
  insuranceName: z.string().min(1),
  providerNpi: z.string().min(1),
  clinicalJustification: z.string().min(10),
  urgency: z.enum(['routine', 'urgent', 'stat']).default('routine'),
});

const updatePriorAuthSchema = z.object({
  status: z.enum(['pending', 'submitted', 'approved', 'denied', 'additional_info_needed']),
  insuranceAuthNumber: z.string().optional(),
  denialReason: z.string().optional(),
  notes: z.string().optional(),
});

// Get all prior auth requests
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { patientId, status, providerId } = req.query;

    let query = `
      SELECT pa.*,
             p.first_name, p.last_name, p.date_of_birth,
             u.full_name as provider_name
      FROM prior_authorizations pa
      JOIN patients p ON pa.patient_id = p.id
      LEFT JOIN users u ON pa.provider_id = u.id
      WHERE pa.tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let paramCount = 1;

    if (patientId) {
      paramCount++;
      query += ` AND pa.patient_id = $${paramCount}`;
      values.push(patientId);
    }

    if (status) {
      paramCount++;
      query += ` AND pa.status = $${paramCount}`;
      values.push(status);
    }

    if (providerId) {
      paramCount++;
      query += ` AND pa.provider_id = $${paramCount}`;
      values.push(providerId);
    }

    query += ' ORDER BY pa.created_at DESC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get single prior auth request
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pa.*,
              p.first_name, p.last_name, p.date_of_birth, p.phone, p.insurance,
              u.full_name as provider_name, u.email as provider_email
       FROM prior_authorizations pa
       JOIN patients p ON pa.patient_id = p.id
       LEFT JOIN users u ON pa.provider_id = u.id
       WHERE pa.id = $1 AND pa.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Create new prior auth request
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.userId;
    const validated = createPriorAuthSchema.parse(req.body);

    const id = randomUUID();
    const authNumber = `PA-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const result = await pool.query(
      `INSERT INTO prior_authorizations (
        id, tenant_id, patient_id, prescription_id, provider_id,
        medication_name, diagnosis_code, insurance_name, provider_npi,
        clinical_justification, urgency, status, auth_number, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        id,
        tenantId,
        validated.patientId,
        validated.prescriptionId || null,
        userId,
        validated.medicationName,
        validated.diagnosisCode,
        validated.insuranceName,
        validated.providerNpi,
        validated.clinicalJustification,
        validated.urgency,
        'pending',
        authNumber,
        userId,
      ]
    );

    // Create task for staff to submit to insurance
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO tasks (id, tenant_id, patient_id, title, description, status, priority, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        taskId,
        tenantId,
        validated.patientId,
        'Submit Prior Authorization',
        `Submit prior auth ${authNumber} for ${validated.medicationName} to ${validated.insuranceName}`,
        'open',
        validated.urgency === 'stat' ? 'high' : validated.urgency === 'urgent' ? 'medium' : 'normal',
        null, // Will be picked up by billing staff
        userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// Update prior auth request
router.patch('/:id', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;
    const validated = updatePriorAuthSchema.parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(validated.status);

      // Auto-set dates based on status
      if (validated.status === 'submitted') {
        paramCount++;
        updates.push(`submitted_at = $${paramCount}`);
        values.push(new Date().toISOString());
      } else if (validated.status === 'approved') {
        paramCount++;
        updates.push(`approved_at = $${paramCount}`);
        values.push(new Date().toISOString());
      } else if (validated.status === 'denied') {
        paramCount++;
        updates.push(`denied_at = $${paramCount}`);
        values.push(new Date().toISOString());
      }
    }

    if (validated.insuranceAuthNumber) {
      paramCount++;
      updates.push(`insurance_auth_number = $${paramCount}`);
      values.push(validated.insuranceAuthNumber);
    }

    if (validated.denialReason) {
      paramCount++;
      updates.push(`denial_reason = $${paramCount}`);
      values.push(validated.denialReason);
    }

    if (validated.notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      values.push(validated.notes);
    }

    paramCount++;
    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());

    paramCount++;
    values.push(id);
    paramCount++;
    values.push(tenantId);

    const query = `
      UPDATE prior_authorizations
      SET ${updates.join(', ')}
      WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// Delete prior auth request
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM prior_authorizations WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    res.json({ message: 'Prior authorization deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Generate prior auth form (PDF-ready HTML)
router.get('/:id/form', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pa.*,
              p.first_name, p.last_name, p.date_of_birth, p.phone, p.address, p.city, p.state, p.zip, p.insurance,
              u.full_name as provider_name, u.email as provider_email
       FROM prior_authorizations pa
       JOIN patients p ON pa.patient_id = p.id
       LEFT JOIN users u ON pa.provider_id = u.id
       WHERE pa.id = $1 AND pa.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    const pa = result.rows[0];

    // Return structured data for frontend to render as form
    res.json({
      authNumber: pa.auth_number,
      patient: {
        name: `${pa.first_name} ${pa.last_name}`,
        dob: pa.date_of_birth,
        phone: pa.phone,
        address: `${pa.address}, ${pa.city}, ${pa.state} ${pa.zip}`,
        insurance: pa.insurance,
      },
      provider: {
        name: pa.provider_name,
        npi: pa.provider_npi,
        email: pa.provider_email,
      },
      medication: {
        name: pa.medication_name,
        diagnosisCode: pa.diagnosis_code,
      },
      justification: pa.clinical_justification,
      urgency: pa.urgency,
      status: pa.status,
      insuranceAuthNumber: pa.insurance_auth_number,
      createdAt: pa.created_at,
      submittedAt: pa.submitted_at,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
