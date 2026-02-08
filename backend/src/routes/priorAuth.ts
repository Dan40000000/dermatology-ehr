/**
 * Prior Authorization API Routes
 * Comprehensive PA tracking system
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { pool } from '../db/pool';
import { randomUUID } from 'crypto';
import { notificationService } from '../services/integrations/notificationService';
import { logger } from '../lib/logger';
import { loadEnv } from '../config/validate';

const router = Router();
router.use(requireAuth);

const createLegacySchema = z.object({
  patientId: z.string().uuid(),
  prescriptionId: z.string().uuid().optional(),
  medicationName: z.string().min(1),
  diagnosisCode: z.string().min(1),
  insuranceName: z.string().min(1),
  providerNpi: z.string().min(1),
  clinicalJustification: z.string().min(10),
  urgency: z.enum(['routine', 'urgent', 'stat']).default('routine'),
});

const createModernSchema = z.object({
  patientId: z.string().min(1),
  authType: z.enum(['medication', 'procedure', 'service']),
  medicationName: z.string().optional(),
  procedureCode: z.string().optional(),
  serviceDescription: z.string().optional(),
  diagnosisCodes: z.array(z.string()).optional(),
  diagnosisCode: z.string().optional(),
  diagnosisDescriptions: z.array(z.string()).optional(),
  payerName: z.string().optional(),
  payerPhone: z.string().optional(),
  insuranceName: z.string().optional(),
  providerNpi: z.string().optional(),
  clinicalJustification: z.string().optional(),
  previousTreatments: z.string().optional(),
  urgency: z.enum(['routine', 'urgent', 'stat']).optional(),
}).superRefine((data, ctx) => {
  if (data.authType === 'medication' && !data.medicationName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['medicationName'],
      message: 'Medication name required',
    });
  }

  if (data.authType === 'procedure' && !data.procedureCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['procedureCode'],
      message: 'Procedure code required',
    });
  }

  if (data.authType === 'service' && !data.serviceDescription) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceDescription'],
      message: 'Service description required',
    });
  }
});

const updatePriorAuthSchema = z.object({
  status: z.enum(['draft', 'pending', 'submitted', 'approved', 'denied', 'more_info_needed']),
  insuranceAuthNumber: z.string().optional(),
  denialReason: z.string().optional(),
  approvalReason: z.string().optional(),
  notes: z.string().optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'pending', 'submitted', 'approved', 'denied', 'appealed', 'more_info_needed']),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
  contactedPerson: z.string().optional(),
  contactMethod: z.enum(['phone', 'fax', 'portal', 'email', 'mail']).optional(),
});

const buildNotes = (entries: Array<string | null | undefined>): string | null => {
  const filtered = entries
    .filter((entry) => entry && entry.trim().length > 0)
    .map((entry) => entry!.trim());

  return filtered.length > 0 ? filtered.join('\n') : null;
};

const normalizeCreatePayload = (body: any) => {
  const legacyParsed = createLegacySchema.safeParse(body);
  if (legacyParsed.success) {
    return {
      normalized: {
        patientId: legacyParsed.data.patientId,
        prescriptionId: legacyParsed.data.prescriptionId || null,
        medicationName: legacyParsed.data.medicationName,
        diagnosisCode: legacyParsed.data.diagnosisCode,
        insuranceName: legacyParsed.data.insuranceName,
        providerNpi: legacyParsed.data.providerNpi,
        clinicalJustification: legacyParsed.data.clinicalJustification,
        urgency: legacyParsed.data.urgency,
        notes: null as string | null,
      },
      error: null,
    };
  }

  const modernParsed = createModernSchema.safeParse(body);
  if (!modernParsed.success) {
    return {
      normalized: null,
      error: legacyParsed.error || modernParsed.error,
    };
  }

  const authType = modernParsed.data.authType;
  const medicationName =
    authType === 'procedure'
      ? modernParsed.data.procedureCode
      : authType === 'service'
        ? modernParsed.data.serviceDescription
        : modernParsed.data.medicationName;

  const diagnosisCode =
    modernParsed.data.diagnosisCode ||
    modernParsed.data.diagnosisCodes?.[0] ||
    'UNKNOWN';

  const insuranceName =
    modernParsed.data.payerName ||
    modernParsed.data.insuranceName ||
    'Unknown Payer';

  const providerNpi = modernParsed.data.providerNpi || '';
  const clinicalJustification = modernParsed.data.clinicalJustification || 'Not provided';
  const urgency = modernParsed.data.urgency || 'routine';

  const notes = buildNotes([
    authType !== 'medication' ? `Auth type: ${authType}` : null,
    modernParsed.data.procedureCode ? `Procedure code: ${modernParsed.data.procedureCode}` : null,
    modernParsed.data.serviceDescription ? `Service description: ${modernParsed.data.serviceDescription}` : null,
    modernParsed.data.payerPhone ? `Payer phone: ${modernParsed.data.payerPhone}` : null,
    modernParsed.data.previousTreatments ? `Previous treatments: ${modernParsed.data.previousTreatments}` : null,
    modernParsed.data.diagnosisDescriptions?.length
      ? `Diagnosis descriptions: ${modernParsed.data.diagnosisDescriptions.join(', ')}`
      : null,
  ]);

  return {
    normalized: {
      patientId: modernParsed.data.patientId,
      prescriptionId: null,
      medicationName: medicationName || 'UNKNOWN',
      diagnosisCode,
      insuranceName,
      providerNpi,
      clinicalJustification,
      urgency,
      notes,
    },
    error: null,
  };
};

// GET /api/prior-auth - List PAs with filters
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, status, providerId, search, page, limit } = req.query;

    let query = `
      SELECT
        pa.*,
        p.first_name,
        p.last_name,
        p.dob as date_of_birth,
        p.first_name || ' ' || p.last_name as patient_name,
        u.full_name as provider_name,
        pa.insurance_name as payer_name,
        pa.auth_number as reference_number,
        pa.expires_at as expiration_date,
        (pa.expires_at::date - CURRENT_DATE) as days_until_expiration,
        CASE
          WHEN pa.submitted_at IS NOT NULL THEN DATE_PART('day', NOW() - pa.submitted_at)
          ELSE NULL
        END as days_pending
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

    if (search) {
      paramCount++;
      query += ` AND (
        p.first_name ILIKE $${paramCount}
        OR p.last_name ILIKE $${paramCount}
        OR pa.medication_name ILIKE $${paramCount}
        OR pa.auth_number ILIKE $${paramCount}
      )`;
      values.push(`%${search}%`);
    }

    query += ' ORDER BY pa.created_at DESC';

    if (page || limit) {
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 25));
      const offset = (pageNum - 1) * limitNum;

      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(limitNum);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(offset);
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth/dashboard - Dashboard stats
router.get('/dashboard', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const statsQuery = `
      WITH pa_stats AS (
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending' OR status = 'submitted') as pending,
          COUNT(*) FILTER (WHERE status = 'approved') as approved,
          COUNT(*) FILTER (WHERE status = 'denied') as denied,
          COUNT(*) FILTER (WHERE status = 'approved' AND expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon,
          COUNT(*) FILTER (WHERE status = 'approved' AND expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as expiring_urgent,
          AVG(EXTRACT(DAY FROM NOW() - submitted_at)) FILTER (WHERE status IN ('pending', 'submitted') AND submitted_at IS NOT NULL) as avg_days_pending,
          COUNT(*) FILTER (WHERE status IN ('approved', 'denied')) as total_decided
        FROM prior_authorizations
        WHERE tenant_id = $1
          AND created_at > NOW() - INTERVAL '90 days'
      )
      SELECT
        total,
        pending,
        approved,
        denied,
        expiring_soon,
        expiring_urgent,
        COALESCE(avg_days_pending, 0) as avg_days_pending,
        CASE
          WHEN total_decided > 0 THEN (approved::FLOAT / total_decided::FLOAT * 100)
          ELSE 0
        END as success_rate
      FROM pa_stats
    `;

    const result = await pool.query(statsQuery, [tenantId]);

    if (result.rows.length === 0) {
      return res.json({
        total: 0,
        pending: 0,
        approved: 0,
        denied: 0,
        expiring_soon: 0,
        expiring_urgent: 0,
        avg_days_pending: 0,
        success_rate: 0,
        total_resubmissions: 0,
      });
    }

    return res.json({
      total: parseInt(result.rows[0].total),
      pending: parseInt(result.rows[0].pending),
      approved: parseInt(result.rows[0].approved),
      denied: parseInt(result.rows[0].denied),
      expiring_soon: parseInt(result.rows[0].expiring_soon),
      expiring_urgent: parseInt(result.rows[0].expiring_urgent),
      avg_days_pending: parseFloat(result.rows[0].avg_days_pending),
      success_rate: parseFloat(result.rows[0].success_rate),
      total_resubmissions: 0,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth/expiring - Get expiring PAs
router.get('/expiring', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const days = Math.max(1, parseInt(req.query.days as string) || 30);

    const query = `
      SELECT
        pa.id,
        p.first_name || ' ' || p.last_name as patient_name,
        pa.medication_name,
        pa.expires_at as expiration_date,
        (pa.expires_at::date - CURRENT_DATE) as days_until_expiration,
        pa.auth_number,
        pa.insurance_name as payer_name
      FROM prior_authorizations pa
      JOIN patients p ON pa.patient_id = p.id
      WHERE pa.tenant_id = $1
        AND pa.status = 'approved'
        AND pa.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'
      ORDER BY pa.expires_at ASC
    `;

    const result = await pool.query(query, [tenantId]);
    res.json(result.rows);
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
      `SELECT pa.*,
              p.first_name, p.last_name, p.dob as date_of_birth, p.phone, p.insurance,
              p.first_name || ' ' || p.last_name as patient_name,
              u.full_name as provider_name, u.email as provider_email,
              pa.insurance_name as payer_name,
              pa.auth_number as reference_number,
              pa.expires_at as expiration_date,
              (pa.expires_at::date - CURRENT_DATE) as days_until_expiration
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

// POST /api/prior-auth - Create new PA
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { normalized, error } = normalizeCreatePayload(req.body);

    if (error || !normalized) {
      return res.status(400).json({ error: 'Validation error', details: error?.issues });
    }

    const id = randomUUID();
    const authNumber = `PA-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const result = await pool.query(
      `INSERT INTO prior_authorizations (
        id, tenant_id, patient_id, prescription_id, provider_id,
        medication_name, diagnosis_code, insurance_name, provider_npi,
        clinical_justification, urgency, status, auth_number, created_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id,
        tenantId,
        normalized.patientId,
        normalized.prescriptionId,
        userId,
        normalized.medicationName,
        normalized.diagnosisCode,
        normalized.insuranceName,
        normalized.providerNpi,
        normalized.clinicalJustification,
        normalized.urgency,
        'pending',
        authNumber,
        userId,
        normalized.notes,
      ]
    );

    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO tasks (id, tenant_id, patient_id, title, description, status, priority, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        taskId,
        tenantId,
        normalized.patientId,
        'Submit Prior Authorization',
        `Submit prior auth ${authNumber} for ${normalized.medicationName} to ${normalized.insuranceName}`,
        'open',
        normalized.urgency === 'stat'
          ? 'high'
          : normalized.urgency === 'urgent'
            ? 'medium'
            : 'normal',
        null,
        userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

// PATCH /api/prior-auth/:id - Update PA
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const validated = updatePriorAuthSchema.parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(validated.status);

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
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

// DELETE /api/prior-auth/:id - Delete PA
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
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

// GET /api/prior-auth/:id/form - Generate form payload
router.get('/:id/form', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pa.*,
              p.first_name, p.last_name, p.dob as date_of_birth, p.phone, p.address, p.city, p.state, p.zip, p.insurance,
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

// POST /api/prior-auth/:id/submit - Submit PA to payer
router.post('/:id/submit', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM prior_authorizations WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    const pa = result.rows[0];

    if (!['draft', 'pending'].includes(pa.status)) {
      return res.status(400).json({ error: 'Prior authorization has already been submitted' });
    }

    await pool.query(
      `UPDATE prior_authorizations
       SET status = 'submitted', submitted_at = $1, updated_at = $2
       WHERE id = $3 AND tenant_id = $4`,
      [new Date().toISOString(), new Date().toISOString(), id, tenantId]
    );

    if (loadEnv().NODE_ENV !== 'test') {
      const timer = setTimeout(async () => {
        try {
          const random = Math.random();
          let newStatus: string;
          let insuranceAuthNumber: string | null = null;
          let denialReason: string | null = null;
          let approvalReason: string | null = null;

          if (random < 0.6) {
            newStatus = 'approved';
            insuranceAuthNumber = `AUTH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            approvalReason = 'Medical necessity criteria met.';
          } else if (random < 0.8) {
            newStatus = 'denied';
            denialReason = 'Step therapy not completed.';
          } else {
            newStatus = 'more_info_needed';
            denialReason = 'Additional documentation required.';
          }

          const updates: string[] = ['status = $1', 'updated_at = $2'];
          const values: any[] = [newStatus, new Date().toISOString()];
          let paramCount = 2;

          if (newStatus === 'approved') {
            paramCount++;
            updates.push(`approved_at = $${paramCount}`);
            values.push(new Date().toISOString());
            paramCount++;
            updates.push(`insurance_auth_number = $${paramCount}`);
            values.push(insuranceAuthNumber);
            paramCount++;
            updates.push(`notes = COALESCE(notes, '') || $${paramCount}`);
            values.push(`\n[${new Date().toISOString()}] Payer Response: ${approvalReason}`);
          } else if (newStatus === 'denied') {
            paramCount++;
            updates.push(`denied_at = $${paramCount}`);
            values.push(new Date().toISOString());
            paramCount++;
            updates.push(`denial_reason = $${paramCount}`);
            values.push(denialReason);
          } else if (newStatus === 'more_info_needed') {
            paramCount++;
            updates.push(`notes = COALESCE(notes, '') || $${paramCount}`);
            values.push(`\n[${new Date().toISOString()}] Payer Request: ${denialReason}`);
          }

          paramCount++;
          values.push(id);
          paramCount++;
          values.push(tenantId);

          await pool.query(
            `UPDATE prior_authorizations SET ${updates.join(', ')} WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}`,
            values
          );

          try {
            const paDetails = await pool.query(
              `SELECT pa.*, p.first_name || ' ' || p.last_name as patient_name
               FROM prior_authorizations pa
               JOIN patients p ON p.id = pa.patient_id
               WHERE pa.id = $1`,
              [id]
            );

            if (paDetails.rows.length > 0) {
              const paData = paDetails.rows[0];

              if (newStatus === 'approved') {
                await notificationService.sendNotification({
                  tenantId,
                  notificationType: 'prior_auth_approved',
                  data: {
                    patientName: paData.patient_name,
                    medication: paData.medication_name,
                    insurancePlan: paData.insurance_name,
                    approvedAt: new Date().toISOString(),
                    referenceNumber: insuranceAuthNumber,
                  },
                });
              } else if (newStatus === 'denied') {
                await notificationService.sendNotification({
                  tenantId,
                  notificationType: 'prior_auth_denied',
                  data: {
                    patientName: paData.patient_name,
                    medication: paData.medication_name,
                    insurancePlan: paData.insurance_name,
                    deniedAt: new Date().toISOString(),
                    denialReason: denialReason,
                  },
                });
              }
            }
          } catch (notifError: any) {
            logger.error('Failed to send prior auth notification', {
              error: notifError.message,
              priorAuthId: id,
            });
          }
        } catch (err) {
          logger.error('Error processing mock payer response', { error: err });
        }
      }, 2000);

      timer.unref?.();
    }

    res.json({
      message: 'Prior authorization submitted successfully',
      status: 'submitted',
      estimatedResponseTime: '2-3 seconds (mock)',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/prior-auth/:id/documents - Upload supporting document
router.post('/:id/documents', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { documentType, documentUrl, documentName, notes } = req.body;

    const paResult = await pool.query(
      'SELECT * FROM prior_authorizations WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (paResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    const documentId = randomUUID();

    await pool.query(
      `INSERT INTO documents (
        id, tenant_id, patient_id, document_type, document_name,
        file_path, uploaded_by, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        documentId,
        tenantId,
        paResult.rows[0].patient_id,
        documentType || 'prior_auth_support',
        documentName || 'Supporting Document',
        documentUrl,
        userId,
        `Prior Auth: ${paResult.rows[0].auth_number}${notes ? ` - ${notes}` : ''}`,
        new Date().toISOString(),
      ]
    );

    await pool.query(
      `UPDATE prior_authorizations
       SET notes = COALESCE(notes, '') || $1, updated_at = $2
       WHERE id = $3 AND tenant_id = $4`,
      [
        `\n[${new Date().toISOString()}] Document uploaded: ${documentName} (${documentType})`,
        new Date().toISOString(),
        id,
        tenantId,
      ]
    );

    res.status(201).json({
      id: documentId,
      message: 'Document uploaded successfully',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth/:id/status - Check status with payer
router.get('/:id/status', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pa.*,
              p.first_name, p.last_name,
              u.full_name as provider_name
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

    const statusResponse = {
      authNumber: pa.auth_number,
      status: pa.status,
      submittedAt: pa.submitted_at,
      lastUpdated: pa.updated_at,
      payerStatus:
        pa.status === 'submitted'
          ? 'In Review'
          : pa.status === 'approved'
            ? 'Approved'
            : pa.status === 'denied'
              ? 'Denied'
              : pa.status === 'more_info_needed'
                ? 'Pending Additional Information'
                : 'Not Submitted',
      insuranceAuthNumber: pa.insurance_auth_number,
      denialReason: pa.denial_reason,
      estimatedDecisionDate:
        pa.status === 'submitted'
          ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
          : null,
      timeline: [
        {
          date: pa.created_at,
          event: 'Request Created',
          status: 'completed',
        },
        pa.submitted_at && {
          date: pa.submitted_at,
          event: 'Submitted to Payer',
          status: 'completed',
        },
        pa.status === 'submitted' && {
          date: new Date().toISOString(),
          event: 'Under Review',
          status: 'in_progress',
        },
        pa.approved_at && {
          date: pa.approved_at,
          event: 'Approved',
          status: 'completed',
        },
        pa.denied_at && {
          date: pa.denied_at,
          event: 'Denied',
          status: 'completed',
        },
        pa.status === 'more_info_needed' && {
          date: pa.updated_at,
          event: 'Additional Information Requested',
          status: 'action_required',
        },
      ].filter(Boolean),
    };

    res.json(statusResponse);
  } catch (error) {
    next(error);
  }
});

// POST /api/prior-auth/:id/status - Add status update log
router.post('/:id/status', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const validated = statusUpdateSchema.parse(req.body);

    const existing = await pool.query(
      'SELECT id FROM prior_authorizations WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    const noteEntry = buildNotes([
      `[${new Date().toISOString()}] Status update: ${validated.status}`,
      validated.referenceNumber ? `Reference #: ${validated.referenceNumber}` : null,
      validated.contactedPerson ? `Contact: ${validated.contactedPerson}` : null,
      validated.contactMethod ? `Method: ${validated.contactMethod}` : null,
      validated.notes,
    ]);

    const updates: string[] = ['status = $1', 'updated_at = $2'];
    const values: any[] = [validated.status, new Date().toISOString()];
    let paramCount = 2;

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

    if (noteEntry) {
      paramCount++;
      updates.push(`notes = COALESCE(notes, '') || $${paramCount}`);
      values.push(`\n${noteEntry}`);
    }

    paramCount++;
    values.push(id);
    paramCount++;
    values.push(tenantId);

    await pool.query(
      `UPDATE prior_authorizations SET ${updates.join(', ')} WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}`,
      values
    );

    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

// POST /api/prior-auth/:id/generate-letter - Simple letter generation
router.post('/:id/generate-letter', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pa.*, p.first_name, p.last_name, p.dob, p.insurance,
              u.full_name as provider_name
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
    const letterText = `To Whom It May Concern,\n\n` +
      `Re: Prior Authorization Request ${pa.auth_number}\n\n` +
      `Patient: ${pa.first_name} ${pa.last_name} (DOB: ${pa.dob})\n` +
      `Insurance: ${pa.insurance}\n` +
      `Medication/Service: ${pa.medication_name}\n` +
      `Diagnosis Code: ${pa.diagnosis_code}\n\n` +
      `Clinical Justification:\n${pa.clinical_justification}\n\n` +
      `Please consider this request based on the medical necessity described above.\n\n` +
      `Sincerely,\n${pa.provider_name || 'Provider'}`;

    res.json({ letterText });
  } catch (error) {
    next(error);
  }
});

// POST /api/prior-auth/webhook/payer-response - Mock webhook
router.post('/webhook/payer-response', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { authNumber, status, insuranceAuthNumber, reason, additionalData } = req.body;

    const result = await pool.query(
      'SELECT * FROM prior_authorizations WHERE auth_number = $1 AND tenant_id = $2',
      [authNumber, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    const pa = result.rows[0];

    const updates: string[] = ['status = $1', 'updated_at = $2'];
    const values: any[] = [status, new Date().toISOString()];
    let paramCount = 2;

    if (status === 'approved' && insuranceAuthNumber) {
      paramCount++;
      updates.push(`approved_at = $${paramCount}`);
      values.push(new Date().toISOString());
      paramCount++;
      updates.push(`insurance_auth_number = $${paramCount}`);
      values.push(insuranceAuthNumber);
    } else if (status === 'denied' && reason) {
      paramCount++;
      updates.push(`denied_at = $${paramCount}`);
      values.push(new Date().toISOString());
      paramCount++;
      updates.push(`denial_reason = $${paramCount}`);
      values.push(reason);
    }

    if (additionalData) {
      paramCount++;
      updates.push(`notes = COALESCE(notes, '') || $${paramCount}`);
      values.push(`\n[${new Date().toISOString()}] Webhook received: ${JSON.stringify(additionalData)}`);
    }

    paramCount++;
    values.push(pa.id);
    paramCount++;
    values.push(tenantId);

    await pool.query(
      `UPDATE prior_authorizations SET ${updates.join(', ')} WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}`,
      values
    );

    res.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    next(error);
  }
});

export const priorAuthRouter = router;
export default router;
