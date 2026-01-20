/**
 * Prior Authorization API Routes
 * Comprehensive PA tracking system - saves practices 3.5 hours/day!
 */

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { PriorAuthService } from '../services/priorAuthService';
import { PriorAuthLetterGenerator } from '../services/priorAuthLetterGenerator';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';

const router = Router();
router.use(requireAuth);

// Validation schemas
const createPASchema = z.object({
  patientId: z.string().min(1),
  authType: z.enum(['medication', 'procedure', 'service']),
  medicationName: z.string().optional(),
  procedureCode: z.string().optional(),
  serviceDescription: z.string().optional(),
  diagnosisCodes: z.array(z.string()).optional(),
  diagnosisDescriptions: z.array(z.string()).optional(),
  payerName: z.string().optional(),
  payerPhone: z.string().optional(),
  clinicalJustification: z.string().optional(),
  previousTreatments: z.string().optional(),
  urgency: z.enum(['stat', 'urgent', 'routine']).optional(),
});

const updatePASchema = z.object({
  status: z.enum(['draft', 'submitted', 'pending', 'approved', 'denied', 'appealed', 'expired', 'cancelled']).optional(),
  authNumber: z.string().optional(),
  expirationDate: z.string().optional(),
  denialReason: z.string().optional(),
  notes: z.string().optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'submitted', 'pending', 'approved', 'denied', 'appealed', 'expired', 'cancelled']),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
  contactedPerson: z.string().optional(),
  contactMethod: z.enum(['phone', 'fax', 'portal', 'email', 'mail']).optional(),
});

// GET /api/prior-auth - List PAs with filters
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      status,
      authType,
      patientId,
      search,
      page = '1',
      limit = '25',
    } = req.query;

    let query = `
      SELECT
        pa.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        (pa.expiration_date - CURRENT_DATE) as days_until_expiration
      FROM prior_authorizations pa
      JOIN patients p ON pa.patient_id = p.id
      WHERE pa.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND pa.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (authType) {
      query += ` AND pa.auth_type = $${paramIndex}`;
      params.push(authType);
      paramIndex++;
    }

    if (patientId) {
      query += ` AND pa.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        p.first_name ILIKE $${paramIndex}
        OR p.last_name ILIKE $${paramIndex}
        OR pa.medication_name ILIKE $${paramIndex}
        OR pa.reference_number ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY pa.created_at DESC`;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 25;
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/prior-auth - Create new PA
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const validated = createPASchema.parse(req.body);

    const referenceNumber = await PriorAuthService.generateReferenceNumber(tenantId);
    const paId = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO prior_authorizations (
        id, tenant_id, patient_id, auth_type,
        medication_name, procedure_code, service_description,
        diagnosis_codes, diagnosis_descriptions,
        payer_name, payer_phone,
        clinical_justification, previous_treatments,
        urgency, reference_number, status, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, 'draft', $16
      ) RETURNING *`,
      [
        paId, tenantId, validated.patientId, validated.authType,
        validated.medicationName, validated.procedureCode, validated.serviceDescription,
        validated.diagnosisCodes || [], validated.diagnosisDescriptions || [],
        validated.payerName, validated.payerPhone,
        validated.clinicalJustification, validated.previousTreatments,
        validated.urgency || 'routine', referenceNumber, userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth/dashboard - Dashboard stats
router.get('/dashboard', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const stats = await PriorAuthService.getDashboardStats(tenantId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth/expiring - Get expiring PAs
router.get('/expiring', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const expiringPAs = await PriorAuthService.getExpiringPAs(tenantId, 30);
    res.json(expiringPAs);
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth/:id - Get PA details
router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pa.*, p.first_name || ' ' || p.last_name as patient_name
       FROM prior_authorizations pa
       JOIN patients p ON pa.patient_id = p.id
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

// PUT /api/prior-auth/:id - Update PA
router.put('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const validated = updatePASchema.parse(req.body);

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    Object.entries(validated).forEach(([key, value]) => {
      if (value !== undefined) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updateFields.push(`${snakeKey} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    });

    updateFields.push(`updated_by = $${paramIndex}`, 'updated_at = NOW()');
    updateValues.push(userId, id, tenantId);

    const result = await pool.query(
      `UPDATE prior_authorizations
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex + 1} AND tenant_id = $${paramIndex + 2}
       RETURNING *`,
      updateValues
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/prior-auth/:id/status - Add status update
router.post('/:id/status', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const validated = statusUpdateSchema.parse(req.body);

    await PriorAuthService.updateStatus(
      id!, tenantId, validated.status,
      validated.notes || null,
      validated.referenceNumber || null,
      validated.contactedPerson || null,
      validated.contactMethod || null,
      userId
    );

    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/prior-auth/:id/generate-letter
router.post('/:id/generate-letter', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const paResult = await pool.query(
      `SELECT * FROM prior_authorizations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (paResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    const pa = paResult.rows[0];
    const letter = await PriorAuthLetterGenerator.generateLetter({
      patientId: pa.patient_id,
      tenantId,
      medicationName: pa.medication_name,
      procedureCode: pa.procedure_code,
      diagnosisCodes: pa.diagnosis_codes || [],
      diagnosisDescriptions: pa.diagnosis_descriptions || [],
      payerName: pa.payer_name,
      clinicalJustification: pa.clinical_justification,
      previousTreatments: pa.previous_treatments,
      previousFailures: pa.previous_failures,
    });

    res.json(letter);
  } catch (error) {
    next(error);
  }
});

export const priorAuthRouter = router;
