import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

export const rxChangeRequestsRouter = Router();

// Validation schemas
const createRxChangeRequestSchema = z.object({
  patientId: z.string().uuid(),
  originalPrescriptionId: z.string().uuid().optional(),
  originalDrug: z.string().min(1),
  originalStrength: z.string().optional(),
  originalQuantity: z.number().optional(),
  originalSig: z.string().optional(),
  requestedDrug: z.string().optional(),
  requestedStrength: z.string().optional(),
  requestedQuantity: z.number().optional(),
  requestedSig: z.string().optional(),
  changeType: z.string().min(1),
  changeReason: z.string().optional(),
  pharmacyId: z.string().uuid().optional(),
  pharmacyName: z.string().min(1),
  pharmacyNcpdp: z.string().optional(),
  pharmacyPhone: z.string().optional(),
  notes: z.string().optional(),
});

const updateRxChangeRequestSchema = z.object({
  status: z.enum(['pending_review', 'approved', 'denied', 'approved_with_modification']),
  responseNotes: z.string().optional(),
  approvedAlternativeDrug: z.string().optional(),
  approvedAlternativeStrength: z.string().optional(),
});

// GET /api/rx-change-requests - List all change requests
rxChangeRequestsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, patientId, providerId, pharmacyId } = req.query;

    let query = `
      SELECT
        rcr.*,
        pat.first_name AS "patientFirstName",
        pat.last_name AS "patientLastName",
        prov.full_name AS "providerName",
        pharm.name AS "pharmacyName"
      FROM rx_change_requests rcr
      LEFT JOIN patients pat ON rcr.patient_id = pat.id
      LEFT JOIN providers prov ON rcr.provider_id = prov.id
      LEFT JOIN pharmacies pharm ON rcr.pharmacy_id = pharm.id
      WHERE rcr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND rcr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (patientId) {
      query += ` AND rcr.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (providerId) {
      query += ` AND rcr.provider_id = $${paramIndex}`;
      params.push(providerId);
      paramIndex++;
    }

    if (pharmacyId) {
      query += ` AND rcr.pharmacy_id = $${paramIndex}`;
      params.push(pharmacyId);
      paramIndex++;
    }

    query += ' ORDER BY rcr.request_date DESC LIMIT 100';

    const result = await pool.query(query, params);

    return res.json({ rxChangeRequests: result.rows });
  } catch (error) {
    console.error('Error fetching Rx change requests:', error);
    return res.status(500).json({ error: 'Failed to fetch Rx change requests' });
  }
});

// GET /api/rx-change-requests/:id - Get single change request
rxChangeRequestsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        rcr.*,
        pat.first_name AS "patientFirstName",
        pat.last_name AS "patientLastName",
        prov.full_name AS "providerName",
        pharm.name AS "pharmacyName",
        p.medication_name AS "originalMedicationName",
        p.sig AS "prescriptionSig",
        p.quantity AS "prescriptionQuantity"
      FROM rx_change_requests rcr
      LEFT JOIN patients pat ON rcr.patient_id = pat.id
      LEFT JOIN providers prov ON rcr.provider_id = prov.id
      LEFT JOIN pharmacies pharm ON rcr.pharmacy_id = pharm.id
      LEFT JOIN prescriptions p ON rcr.original_prescription_id = p.id
      WHERE rcr.id = $1 AND rcr.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rx change request not found' });
    }

    return res.json({ rxChangeRequest: result.rows[0] });
  } catch (error) {
    console.error('Error fetching Rx change request:', error);
    return res.status(500).json({ error: 'Failed to fetch Rx change request' });
  }
});

// POST /api/rx-change-requests - Create new change request
rxChangeRequestsRouter.post(
  '/',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createRxChangeRequestSchema.safeParse(req.body);
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

      // Get provider from original prescription if available
      let providerId = null;
      if (data.originalPrescriptionId) {
        const prescriptionCheck = await pool.query(
          'SELECT provider_id FROM prescriptions WHERE id = $1 AND tenant_id = $2',
          [data.originalPrescriptionId, tenantId]
        );
        if (prescriptionCheck.rows.length > 0) {
          providerId = prescriptionCheck.rows[0].provider_id;
        }
      }

      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO rx_change_requests(
          id, tenant_id, patient_id, original_prescription_id,
          original_drug, original_strength, original_quantity, original_sig,
          requested_drug, requested_strength, requested_quantity, requested_sig,
          change_type, change_reason, pharmacy_id, pharmacy_name, pharmacy_ncpdp,
          pharmacy_phone, provider_id, notes, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )`,
        [
          id, tenantId, data.patientId, data.originalPrescriptionId || null,
          data.originalDrug, data.originalStrength || null, data.originalQuantity || null,
          data.originalSig || null, data.requestedDrug || null, data.requestedStrength || null,
          data.requestedQuantity || null, data.requestedSig || null, data.changeType,
          data.changeReason || null, data.pharmacyId || null, data.pharmacyName,
          data.pharmacyNcpdp || null, data.pharmacyPhone || null, providerId,
          data.notes || null, 'pending_review'
        ]
      );

      return res.status(201).json({ id, message: 'Rx change request created' });
    } catch (error) {
      console.error('Error creating Rx change request:', error);
      return res.status(500).json({ error: 'Failed to create Rx change request' });
    }
  }
);

// PUT /api/rx-change-requests/:id - Update change request
rxChangeRequestsRouter.put(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = updateRxChangeRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      // Check if change request exists
      const existing = await pool.query(
        'SELECT id FROM rx_change_requests WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Rx change request not found' });
      }

      // Build dynamic update query
      const updates: string[] = ['status = $1', 'reviewed_by = $2', 'reviewed_at = CURRENT_TIMESTAMP'];
      const values: any[] = [data.status, userId];
      let paramIndex = 3;

      if (data.responseNotes) {
        updates.push(`response_notes = $${paramIndex}`);
        values.push(data.responseNotes);
        paramIndex++;
      }

      if (data.approvedAlternativeDrug) {
        updates.push(`approved_alternative_drug = $${paramIndex}`);
        values.push(data.approvedAlternativeDrug);
        paramIndex++;
      }

      if (data.approvedAlternativeStrength) {
        updates.push(`approved_alternative_strength = $${paramIndex}`);
        values.push(data.approvedAlternativeStrength);
        paramIndex++;
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, tenantId);

      const query = `
        UPDATE rx_change_requests
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
        RETURNING id
      `;

      await pool.query(query, values);

      return res.json({ success: true, id, status: data.status });
    } catch (error) {
      console.error('Error updating Rx change request:', error);
      return res.status(500).json({ error: 'Failed to update Rx change request' });
    }
  }
);

// POST /api/rx-change-requests/:id/approve - Approve change request
rxChangeRequestsRouter.post(
  '/:id/approve',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { responseNotes, approvedAlternativeDrug, approvedAlternativeStrength } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Get change request details
      const changeRequest = await pool.query(
        'SELECT * FROM rx_change_requests WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (changeRequest.rows.length === 0) {
        return res.status(404).json({ error: 'Rx change request not found' });
      }

      const request = changeRequest.rows[0];

      // Update change request status
      await pool.query(
        `UPDATE rx_change_requests
         SET status = $1,
             reviewed_by = $2,
             reviewed_at = CURRENT_TIMESTAMP,
             response_notes = $3,
             approved_alternative_drug = $4,
             approved_alternative_strength = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [
          approvedAlternativeDrug ? 'approved_with_modification' : 'approved',
          userId,
          responseNotes || null,
          approvedAlternativeDrug || null,
          approvedAlternativeStrength || null,
          id
        ]
      );

      return res.json({ success: true, message: 'Change request approved' });
    } catch (error) {
      console.error('Error approving Rx change request:', error);
      return res.status(500).json({ error: 'Failed to approve Rx change request' });
    }
  }
);

// POST /api/rx-change-requests/:id/deny - Deny change request
rxChangeRequestsRouter.post(
  '/:id/deny',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { responseNotes } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!responseNotes) {
        return res.status(400).json({ error: 'Response notes are required for denial' });
      }

      await pool.query(
        `UPDATE rx_change_requests
         SET status = 'denied',
             response_notes = $1,
             reviewed_by = $2,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND tenant_id = $4`,
        [responseNotes, userId, id, tenantId]
      );

      return res.json({ success: true, message: 'Change request denied' });
    } catch (error) {
      console.error('Error denying Rx change request:', error);
      return res.status(500).json({ error: 'Failed to deny Rx change request' });
    }
  }
);

// DELETE /api/rx-change-requests/:id - Delete change request
rxChangeRequestsRouter.delete(
  '/:id',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        'DELETE FROM rx_change_requests WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Rx change request not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting Rx change request:', error);
      return res.status(500).json({ error: 'Failed to delete Rx change request' });
    }
  }
);
