import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { validatePrescription, checkDrugInteractions, checkAllergies } from '../services/prescriptionValidator';

export const prescriptionsRouter = Router();

// Validation schemas
const createPrescriptionSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  medicationId: z.string().uuid().optional(),
  medicationName: z.string().min(1),
  genericName: z.string().optional(),
  strength: z.string().optional(),
  dosageForm: z.string().optional(),
  sig: z.string().min(1),
  quantity: z.number().positive(),
  quantityUnit: z.string().optional().default('each'),
  refills: z.number().int().min(0).max(5),
  daysSupply: z.number().int().positive().optional(),
  pharmacyId: z.string().uuid().optional(),
  pharmacyName: z.string().optional(),
  pharmacyPhone: z.string().optional(),
  pharmacyAddress: z.string().optional(),
  pharmacyNcpdp: z.string().optional(),
  daw: z.boolean().optional().default(false),
  isControlled: z.boolean().optional().default(false),
  deaSchedule: z.string().optional(),
  indication: z.string().optional(),
  notes: z.string().optional(),
});

const updatePrescriptionSchema = z.object({
  sig: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  refills: z.number().int().min(0).max(5).optional(),
  daysSupply: z.number().int().positive().optional(),
  pharmacyId: z.string().uuid().optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'sent', 'transmitted', 'error', 'cancelled', 'discontinued']).optional(),
});

// GET /api/prescriptions - List prescriptions (with optional filters)
prescriptionsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, status, startDate, endDate, providerId } = req.query;

    let query = `
      select
        p.*,
        pat.first_name as "patientFirstName",
        pat.last_name as "patientLastName",
        prov.full_name as "providerName",
        pharm.name as "pharmacyName"
      from prescriptions p
      left join patients pat on p.patient_id = pat.id
      left join providers prov on p.provider_id = prov.id
      left join pharmacies pharm on p.pharmacy_id = pharm.id
      where p.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` and p.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (status) {
      query += ` and p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (providerId) {
      query += ` and p.provider_id = $${paramIndex}`;
      params.push(providerId);
      paramIndex++;
    }

    if (startDate) {
      query += ` and p.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` and p.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ' order by p.created_at desc limit 100';

    const result = await pool.query(query, params);

    return res.json({ prescriptions: result.rows });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    return res.status(500).json({ error: 'Failed to fetch prescriptions' });
  }
});

// GET /api/prescriptions/:id - Get single prescription
prescriptionsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `select
        p.*,
        pat.first_name as "patientFirstName",
        pat.last_name as "patientLastName",
        prov.full_name as "providerName",
        pharm.name as "pharmacyName"
      from prescriptions p
      left join patients pat on p.patient_id = pat.id
      left join providers prov on p.provider_id = prov.id
      left join pharmacies pharm on p.pharmacy_id = pharm.id
      where p.id = $1 and p.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    return res.json({ prescription: result.rows[0] });
  } catch (error) {
    console.error('Error fetching prescription:', error);
    return res.status(500).json({ error: 'Failed to fetch prescription' });
  }
});

// GET /api/prescriptions/patient/:patientId - Get patient's prescriptions
prescriptionsRouter.get('/patient/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `select
        p.*,
        prov.full_name as "providerName",
        pharm.name as "pharmacyName"
      from prescriptions p
      left join providers prov on p.provider_id = prov.id
      left join pharmacies pharm on p.pharmacy_id = pharm.id
      where p.patient_id = $1 and p.tenant_id = $2
      order by p.created_at desc`,
      [patientId, tenantId]
    );

    return res.json({ prescriptions: result.rows });
  } catch (error) {
    console.error('Error fetching patient prescriptions:', error);
    return res.status(500).json({ error: 'Failed to fetch patient prescriptions' });
  }
});

// POST /api/prescriptions - Create new prescription
prescriptionsRouter.post(
  '/',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createPrescriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      // Validate prescription
      const validation = validatePrescription({
        medicationId: data.medicationId,
        medicationName: data.medicationName,
        strength: data.strength,
        quantity: data.quantity,
        refills: data.refills,
        daysSupply: data.daysSupply,
        isControlled: data.isControlled || false,
        deaSchedule: data.deaSchedule,
        patientId: data.patientId,
        providerId: userId,
      });

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Prescription validation failed',
          validationErrors: validation.errors,
          validationWarnings: validation.warnings,
        });
      }

      // Check for drug interactions and allergies (stub)
      if (data.medicationId) {
        const interactions = await checkDrugInteractions(data.medicationId, data.patientId);
        const allergies = await checkAllergies(data.medicationName, data.patientId);

        // If there are critical warnings, include them in response
        if (interactions.length > 0 || allergies.length > 0) {
          validation.warnings.push(...interactions, ...allergies);
        }
      }

      const id = crypto.randomUUID();

      await pool.query(
        `insert into prescriptions(
          id, tenant_id, patient_id, encounter_id, provider_id, medication_id,
          medication_name, generic_name, strength, dosage_form,
          sig, quantity, quantity_unit, refills, days_supply,
          pharmacy_id, pharmacy_name, pharmacy_phone, pharmacy_address, pharmacy_ncpdp,
          daw, is_controlled, dea_schedule, indication, notes,
          status, created_by
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        )`,
        [
          id, tenantId, data.patientId, data.encounterId || null, userId, data.medicationId || null,
          data.medicationName, data.genericName || null, data.strength || null, data.dosageForm || null,
          data.sig, data.quantity, data.quantityUnit, data.refills, data.daysSupply || null,
          data.pharmacyId || null, data.pharmacyName || null, data.pharmacyPhone || null,
          data.pharmacyAddress || null, data.pharmacyNcpdp || null,
          data.daw, data.isControlled, data.deaSchedule || null, data.indication || null, data.notes || null,
          'pending', userId,
        ]
      );

      // Log to prescription audit log
      await pool.query(
        `insert into prescription_audit_log(prescription_id, action, user_id, ip_address)
         values ($1, $2, $3, $4)`,
        [id, 'created', userId, req.ip]
      );

      // Also log to main audit log
      await pool.query(
        `insert into audit_log(tenant_id, user_id, action, resource_type, resource_id, ip_address)
         values ($1, $2, $3, $4, $5, $6)`,
        [tenantId, userId, 'create', 'prescription', id, req.ip]
      );

      return res.status(201).json({
        id,
        validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      });
    } catch (error) {
      console.error('Error creating prescription:', error);
      return res.status(500).json({ error: 'Failed to create prescription' });
    }
  }
);

// PUT /api/prescriptions/:id - Update prescription
prescriptionsRouter.put(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = updatePrescriptionSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      // Check if prescription exists and is editable
      const existing = await pool.query(
        'select status from prescriptions where id = $1 and tenant_id = $2',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      if (existing.rows[0].status === 'sent' || existing.rows[0].status === 'transmitted') {
        return res.status(400).json({ error: 'Cannot modify prescription that has been sent' });
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          updates.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updates.push(`updated_by = $${paramIndex}`);
      values.push(userId);
      paramIndex++;

      values.push(id, tenantId);

      const query = `
        UPDATE prescriptions
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
        RETURNING id
      `;

      await pool.query(query, values);

      // Log to audit
      await pool.query(
        `insert into prescription_audit_log(prescription_id, action, changed_fields, user_id, ip_address)
         values ($1, $2, $3, $4, $5)`,
        [id, 'modified', JSON.stringify(data), userId, req.ip]
      );

      return res.json({ success: true, id });
    } catch (error) {
      console.error('Error updating prescription:', error);
      return res.status(500).json({ error: 'Failed to update prescription' });
    }
  }
);

// DELETE /api/prescriptions/:id - Cancel prescription
prescriptionsRouter.delete(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Instead of deleting, mark as cancelled
      const result = await pool.query(
        `update prescriptions
         set status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = $1
         where id = $2 and tenant_id = $3
         returning id`,
        [userId, id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      // Log to audit
      await pool.query(
        `insert into prescription_audit_log(prescription_id, action, user_id, ip_address)
         values ($1, $2, $3, $4)`,
        [id, 'cancelled', userId, req.ip]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Error cancelling prescription:', error);
      return res.status(500).json({ error: 'Failed to cancel prescription' });
    }
  }
);

// POST /api/prescriptions/:id/send - Send prescription to pharmacy (stub for Surescripts)
prescriptionsRouter.post(
  '/:id/send',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Check prescription exists
      const result = await pool.query(
        `select p.*, pharm.ncpdp_id
         from prescriptions p
         left join pharmacies pharm on p.pharmacy_id = pharm.id
         where p.id = $1 and p.tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      const prescription = result.rows[0];

      if (prescription.status === 'cancelled') {
        return res.status(400).json({ error: 'Cannot send cancelled prescription' });
      }

      if (!prescription.pharmacy_id) {
        return res.status(400).json({ error: 'Pharmacy is required to send prescription' });
      }

      // STUB: In production, this would integrate with Surescripts
      // For now, just mark as sent
      console.log('[STUB] Sending prescription to Surescripts:', {
        prescriptionId: id,
        pharmacyNcpdp: prescription.ncpdp_id,
        medicationName: prescription.medication_name,
      });

      const messageId = `STUB-${crypto.randomUUID()}`;

      await pool.query(
        `update prescriptions
         set status = 'sent',
             sent_at = CURRENT_TIMESTAMP,
             surescripts_message_id = $1,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $2
         where id = $3`,
        [messageId, userId, id]
      );

      // Log to audit
      await pool.query(
        `insert into prescription_audit_log(prescription_id, action, user_id, ip_address)
         values ($1, $2, $3, $4)`,
        [id, 'transmitted', userId, req.ip]
      );

      return res.json({
        success: true,
        messageId,
        message: 'Prescription sent successfully (stub mode - not actually transmitted)',
      });
    } catch (error) {
      console.error('Error sending prescription:', error);
      return res.status(500).json({ error: 'Failed to send prescription' });
    }
  }
);
