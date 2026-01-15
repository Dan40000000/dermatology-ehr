import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

export const refillRequestsRouter = Router();

// Validation schemas
const createRefillRequestSchema = z.object({
  patientId: z.string().uuid(),
  originalPrescriptionId: z.string().uuid().optional(),
  medicationName: z.string().min(1),
  strength: z.string().optional(),
  drugDescription: z.string().optional(),
  originalRxDate: z.string().optional(),
  providerId: z.string().uuid().optional(),
  pharmacyId: z.string().uuid().optional(),
  pharmacyName: z.string().optional(),
  pharmacyNcpdp: z.string().optional(),
  requestSource: z.enum(['pharmacy', 'patient', 'portal']).optional().default('pharmacy'),
  requestMethod: z.string().optional(),
  notes: z.string().optional(),
});

const updateRefillRequestSchema = z.object({
  status: z.enum(['pending', 'approved', 'denied']),
  denialReason: z.string().optional(),
  denialNotes: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/refill-requests - List all refill requests
refillRequestsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, patientId, providerId } = req.query;

    let query = `
      SELECT
        rr.*,
        pat.first_name AS "patientFirstName",
        pat.last_name AS "patientLastName",
        prov.full_name AS "providerName",
        pharm.name AS "pharmacyName"
      FROM refill_requests rr
      LEFT JOIN patients pat ON rr.patient_id = pat.id
      LEFT JOIN providers prov ON rr.provider_id = prov.id
      LEFT JOIN pharmacies pharm ON rr.pharmacy_id = pharm.id
      WHERE rr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND rr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (patientId) {
      query += ` AND rr.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (providerId) {
      query += ` AND rr.provider_id = $${paramIndex}`;
      params.push(providerId);
      paramIndex++;
    }

    query += ' ORDER BY rr.requested_date DESC LIMIT 100';

    const result = await pool.query(query, params);

    return res.json({ refillRequests: result.rows });
  } catch (error) {
    console.error('Error fetching refill requests:', error);
    return res.status(500).json({ error: 'Failed to fetch refill requests' });
  }
});

// GET /api/refill-requests/:id - Get single refill request
refillRequestsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        rr.*,
        pat.first_name AS "patientFirstName",
        pat.last_name AS "patientLastName",
        prov.full_name AS "providerName",
        pharm.name AS "pharmacyName",
        p.medication_name AS "originalMedicationName",
        p.sig AS "originalSig",
        p.quantity AS "originalQuantity",
        p.refills AS "originalRefills"
      FROM refill_requests rr
      LEFT JOIN patients pat ON rr.patient_id = pat.id
      LEFT JOIN providers prov ON rr.provider_id = prov.id
      LEFT JOIN pharmacies pharm ON rr.pharmacy_id = pharm.id
      LEFT JOIN prescriptions p ON rr.original_prescription_id = p.id
      WHERE rr.id = $1 AND rr.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Refill request not found' });
    }

    return res.json({ refillRequest: result.rows[0] });
  } catch (error) {
    console.error('Error fetching refill request:', error);
    return res.status(500).json({ error: 'Failed to fetch refill request' });
  }
});

// POST /api/refill-requests - Create new refill request
refillRequestsRouter.post(
  '/',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createRefillRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const data = parsed.data;

      // Verify patient exists
      const patientCheck = await pool.query(
        'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
        [data.patientId, tenantId]
      );
      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO refill_requests(
          id, tenant_id, patient_id, original_prescription_id, medication_name,
          strength, drug_description, original_rx_date, provider_id,
          pharmacy_id, pharmacy_name, pharmacy_ncpdp, request_source,
          request_method, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          id, tenantId, data.patientId, data.originalPrescriptionId || null,
          data.medicationName, data.strength || null, data.drugDescription || null,
          data.originalRxDate || null, data.providerId || null,
          data.pharmacyId || null, data.pharmacyName || null,
          data.pharmacyNcpdp || null, data.requestSource, data.requestMethod || null,
          data.notes || null, 'pending'
        ]
      );

      return res.status(201).json({ id, message: 'Refill request created' });
    } catch (error) {
      console.error('Error creating refill request:', error);
      return res.status(500).json({ error: 'Failed to create refill request' });
    }
  }
);

// PUT /api/refill-requests/:id - Update refill request (approve/deny)
refillRequestsRouter.put(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = updateRefillRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      // Check if refill request exists
      const existing = await pool.query(
        'SELECT id, status FROM refill_requests WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Refill request not found' });
      }

      // Build dynamic update query
      const updates: string[] = ['status = $1', 'reviewed_by = $2', 'reviewed_at = CURRENT_TIMESTAMP'];
      const values: any[] = [data.status, userId];
      let paramIndex = 3;

      if (data.denialReason) {
        updates.push(`denial_reason = $${paramIndex}`);
        values.push(data.denialReason);
        paramIndex++;
      }

      if (data.denialNotes) {
        updates.push(`denial_notes = $${paramIndex}`);
        values.push(data.denialNotes);
        paramIndex++;
      }

      if (data.notes) {
        updates.push(`notes = $${paramIndex}`);
        values.push(data.notes);
        paramIndex++;
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, tenantId);

      const query = `
        UPDATE refill_requests
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
        RETURNING id
      `;

      await pool.query(query, values);

      return res.json({ success: true, id, status: data.status });
    } catch (error) {
      console.error('Error updating refill request:', error);
      return res.status(500).json({ error: 'Failed to update refill request' });
    }
  }
);

// POST /api/refill-requests/:id/approve - Approve refill request
refillRequestsRouter.post(
  '/:id/approve',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Get refill request details
      const refillRequest = await pool.query(
        `SELECT rr.*, p.id as original_prescription_id
         FROM refill_requests rr
         LEFT JOIN prescriptions p ON rr.original_prescription_id = p.id
         WHERE rr.id = $1 AND rr.tenant_id = $2`,
        [id, tenantId]
      );

      if (refillRequest.rows.length === 0) {
        return res.status(404).json({ error: 'Refill request not found' });
      }

      const request = refillRequest.rows[0];

      // Update refill request status
      await pool.query(
        `UPDATE refill_requests
         SET status = 'approved',
             reviewed_by = $1,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [userId, id]
      );

      // If there's an original prescription, create a new prescription based on it
      if (request.original_prescription_id) {
        const newRxId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO prescriptions(
            id, tenant_id, patient_id, provider_id, medication_name,
            strength, dosage_form, sig, quantity, quantity_unit, refills,
            pharmacy_id, pharmacy_name, pharmacy_ncpdp, status, created_by, notes
          )
          SELECT
            $1, tenant_id, patient_id, provider_id, medication_name,
            strength, dosage_form, sig, quantity, quantity_unit, refills,
            pharmacy_id, pharmacy_name, pharmacy_ncpdp, 'pending', $2,
            'Refill approved from request ' || $3
          FROM prescriptions
          WHERE id = $4`,
          [newRxId, userId, id, request.original_prescription_id]
        );

        return res.json({
          success: true,
          message: 'Refill approved and new prescription created',
          newPrescriptionId: newRxId
        });
      }

      return res.json({ success: true, message: 'Refill approved' });
    } catch (error) {
      console.error('Error approving refill request:', error);
      return res.status(500).json({ error: 'Failed to approve refill request' });
    }
  }
);

// POST /api/refill-requests/:id/deny - Deny refill request
refillRequestsRouter.post(
  '/:id/deny',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { denialReason, denialNotes } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!denialReason) {
        return res.status(400).json({ error: 'Denial reason is required' });
      }

      await pool.query(
        `UPDATE refill_requests
         SET status = 'denied',
             denial_reason = $1,
             denial_notes = $2,
             reviewed_by = $3,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND tenant_id = $5`,
        [denialReason, denialNotes || null, userId, id, tenantId]
      );

      return res.json({ success: true, message: 'Refill denied' });
    } catch (error) {
      console.error('Error denying refill request:', error);
      return res.status(500).json({ error: 'Failed to deny refill request' });
    }
  }
);

// DELETE /api/refill-requests/:id - Delete refill request
refillRequestsRouter.delete(
  '/:id',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        'DELETE FROM refill_requests WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Refill request not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting refill request:', error);
      return res.status(500).json({ error: 'Failed to delete refill request' });
    }
  }
);
