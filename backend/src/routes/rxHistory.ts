import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { getRxHistory } from '../services/surescriptsService';

export const rxHistoryRouter = Router();

// Validation schemas
const createRxHistorySchema = z.object({
  patientId: z.string().uuid(),
  pharmacyId: z.string().uuid().optional(),
  pharmacyNcpdp: z.string().optional(),
  pharmacyName: z.string().optional(),
  medicationName: z.string().min(1),
  genericName: z.string().optional(),
  ndc: z.string().optional(),
  strength: z.string().optional(),
  dosageForm: z.string().optional(),
  quantity: z.number().positive(),
  quantityUnit: z.string().optional().default('each'),
  daysSupply: z.number().int().positive().optional(),
  sig: z.string().optional(),
  prescriberName: z.string().optional(),
  prescriberNpi: z.string().optional(),
  prescribedDate: z.string().optional(),
  writtenDate: z.string().optional(),
  fillDate: z.string(),
  fillNumber: z.number().int().positive().optional().default(1),
  filledQuantity: z.number().positive().optional(),
  refillsRemaining: z.number().int().min(0).optional().default(0),
  lastFillDate: z.string().optional(),
  source: z.enum(['surescripts', 'manual', 'imported']).optional().default('manual'),
});

/**
 * GET /api/rx-history/:patientId
 * Get complete medication history for patient from all pharmacies
 * Simulates Surescripts RxHistoryRequest
 */
rxHistoryRouter.get('/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;
    const { startDate, endDate, pharmacyId, source } = req.query;

    // Verify patient exists and belongs to tenant
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Build query
    let query = `
      SELECT
        rh.*,
        p.name as pharmacy_name_resolved,
        p.ncpdp_id,
        p.chain
      FROM rx_history rh
      LEFT JOIN pharmacies p ON rh.pharmacy_id = p.id
      WHERE rh.patient_id = $1 AND rh.tenant_id = $2
    `;

    const params: any[] = [patientId, tenantId];
    let paramIndex = 3;

    if (startDate) {
      query += ` AND rh.fill_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND rh.fill_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (pharmacyId) {
      query += ` AND rh.pharmacy_id = $${paramIndex}`;
      params.push(pharmacyId);
      paramIndex++;
    }

    if (source) {
      query += ` AND rh.source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    query += ' ORDER BY rh.fill_date DESC LIMIT 200';

    const result = await pool.query(query, params);

    // Also fetch from Surescripts (simulated)
    let surescriptsData = null;
    try {
      surescriptsData = await getRxHistory(patientId!, tenantId);
    } catch (error) {
      console.error('Error fetching Surescripts Rx history:', error);
    }

    return res.json({
      rxHistory: result.rows,
      surescriptsMessageId: surescriptsData?.messageId,
      totalRecords: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching Rx history:', error);
    return res.status(500).json({ error: 'Failed to fetch Rx history' });
  }
});

/**
 * GET /api/rx-history/patient/:patientId/summary
 * Get medication history summary (grouped by medication)
 */
rxHistoryRouter.get('/patient/:patientId/summary', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    // Verify patient
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await pool.query(
      `SELECT
        medication_name,
        generic_name,
        COUNT(*) as fill_count,
        MAX(fill_date) as last_fill_date,
        SUM(filled_quantity) as total_quantity_filled,
        array_agg(DISTINCT pharmacy_name) as pharmacies
      FROM rx_history
      WHERE patient_id = $1 AND tenant_id = $2
      GROUP BY medication_name, generic_name
      ORDER BY last_fill_date DESC`,
      [patientId, tenantId]
    );

    return res.json({ summary: result.rows });
  } catch (error) {
    console.error('Error fetching Rx history summary:', error);
    return res.status(500).json({ error: 'Failed to fetch Rx history summary' });
  }
});

/**
 * POST /api/rx-history
 * Manually add Rx history record (for imported data)
 */
rxHistoryRouter.post(
  '/',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createRxHistorySchema.safeParse(req.body);
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
        `INSERT INTO rx_history (
          id, tenant_id, patient_id, pharmacy_id, pharmacy_ncpdp, pharmacy_name,
          medication_name, generic_name, ndc, strength, dosage_form,
          quantity, quantity_unit, days_supply, sig,
          prescriber_name, prescriber_npi, prescribed_date, written_date,
          fill_date, fill_number, filled_quantity, refills_remaining,
          last_fill_date, source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
        )`,
        [
          id,
          tenantId,
          data.patientId,
          data.pharmacyId || null,
          data.pharmacyNcpdp || null,
          data.pharmacyName || null,
          data.medicationName,
          data.genericName || null,
          data.ndc || null,
          data.strength || null,
          data.dosageForm || null,
          data.quantity,
          data.quantityUnit,
          data.daysSupply || null,
          data.sig || null,
          data.prescriberName || null,
          data.prescriberNpi || null,
          data.prescribedDate || null,
          data.writtenDate || null,
          data.fillDate,
          data.fillNumber,
          data.filledQuantity || data.quantity,
          data.refillsRemaining,
          data.lastFillDate || data.fillDate,
          data.source,
        ]
      );

      return res.status(201).json({ id });
    } catch (error) {
      console.error('Error creating Rx history record:', error);
      return res.status(500).json({ error: 'Failed to create Rx history record' });
    }
  }
);

/**
 * POST /api/rx-history/import-surescripts/:patientId
 * Import Rx history from Surescripts for a patient
 */
rxHistoryRouter.post(
  '/import-surescripts/:patientId',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      // Verify patient
      const patientCheck = await pool.query(
        'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
        [patientId, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Fetch from Surescripts
      const surescriptsData = await getRxHistory(patientId!, tenantId);

      let importedCount = 0;

      // Import each medication
      for (const med of surescriptsData.medications) {
        // Check if already exists
        const existing = await pool.query(
          `SELECT id FROM rx_history
           WHERE patient_id = $1
           AND medication_name = $2
           AND fill_date = $3
           AND pharmacy_ncpdp = $4`,
          [patientId, med.medicationName, med.fillDate, med.pharmacyNcpdp]
        );

        if (existing.rows.length > 0) {
          continue; // Skip duplicates
        }

        // Find pharmacy by NCPDP
        const pharmacyResult = await pool.query(
          'SELECT id FROM pharmacies WHERE ncpdp_id = $1 LIMIT 1',
          [med.pharmacyNcpdp]
        );

        const pharmacyId = pharmacyResult.rows.length > 0 ? pharmacyResult.rows[0].id : null;

        await pool.query(
          `INSERT INTO rx_history (
            id, tenant_id, patient_id, pharmacy_id, pharmacy_ncpdp, pharmacy_name,
            medication_name, generic_name, ndc, strength, dosage_form,
            quantity, quantity_unit, days_supply, sig,
            prescriber_name, prescriber_npi, prescribed_date, written_date,
            fill_date, fill_number, filled_quantity, refills_remaining,
            source, surescripts_message_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
          )`,
          [
            crypto.randomUUID(),
            tenantId,
            patientId,
            pharmacyId,
            med.pharmacyNcpdp,
            med.pharmacyName,
            med.medicationName,
            med.genericName || null,
            med.ndc || null,
            med.strength || null,
            med.dosageForm || null,
            med.quantity,
            'each',
            med.daysSupply || null,
            med.sig || null,
            med.prescriberName,
            med.prescriberNpi || null,
            med.prescribedDate || null,
            med.writtenDate || null,
            med.fillDate,
            med.fillNumber,
            med.quantity,
            med.refillsRemaining,
            'surescripts',
            surescriptsData.messageId,
          ]
        );

        importedCount++;
      }

      return res.json({
        success: true,
        importedCount,
        messageId: surescriptsData.messageId,
        totalAvailable: surescriptsData.medications.length,
      });
    } catch (error) {
      console.error('Error importing Surescripts Rx history:', error);
      return res.status(500).json({ error: 'Failed to import Rx history' });
    }
  }
);

/**
 * DELETE /api/rx-history/:id
 * Delete Rx history record
 */
rxHistoryRouter.delete(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        'DELETE FROM rx_history WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Rx history record not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting Rx history record:', error);
      return res.status(500).json({ error: 'Failed to delete Rx history record' });
    }
  }
);
