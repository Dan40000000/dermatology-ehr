import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { CLINICAL_ROLES } from '../lib/roles';
import { validatePrescription, checkDrugInteractions, checkAllergies } from '../services/prescriptionValidator';
import { sendNewRx, checkFormulary, getPatientBenefits } from '../services/surescriptsService';
import { getPrescribingService, type PrescriptionSendRequest } from '../services/healthcareWorkflowServices';
import { logger } from '../lib/logger';

export const prescriptionsRouter = Router();
prescriptionsRouter.use(requireAuth, requireRoles([...CLINICAL_ROLES]));

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function logPrescriptionsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// Validation schemas
const createPrescriptionSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().min(1).optional(),
  medicationId: z.string().min(1).optional(),
  medicationName: z.string().min(1),
  genericName: z.string().optional(),
  strength: z.string().optional(),
  dosageForm: z.string().optional(),
  sig: z.string().min(1),
  quantity: z.number().positive(),
  quantityUnit: z.string().optional().default('each'),
  refills: z.number().int().min(0).max(11),
  daysSupply: z.number().int().positive().optional(),
  pharmacyId: z.string().min(1).optional(),
  pharmacyName: z.string().optional(),
  pharmacyPhone: z.string().optional(),
  pharmacyAddress: z.string().optional(),
  pharmacyNcpdp: z.string().optional(),
  daw: z.boolean().optional().default(false),
  isControlled: z.boolean().optional().default(false),
  deaSchedule: z.string().optional(),
  indication: z.string().optional(),
  notes: z.string().optional(),
  deliveryMethod: z.enum(['electronic', 'print', 'manual']).optional().default('electronic'),
  deliveryNotes: z.string().optional(),
});

const updatePrescriptionSchema = z.object({
  sig: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  refills: z.number().int().min(0).max(11).optional(),
  daysSupply: z.number().int().positive().optional(),
  pharmacyId: z.string().min(1).optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'sent', 'transmitted', 'error', 'cancelled', 'discontinued']).optional(),
});

const sendPrescriptionWorkflowSchema = z.object({
  prescriptionId: z.string().optional(),
  orderId: z.string().optional(),
  patientId: z.string().optional(),
  pharmacyNcpdp: z.string().optional(),
  pharmacyName: z.string().optional(),
  medicationName: z.string().optional(),
  strength: z.string().optional(),
  sig: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  refills: z.union([z.string(), z.number()]).optional(),
}).refine(
  (data) => data.prescriptionId || data.orderId || data.medicationName,
  { message: 'prescriptionId, orderId, or medicationName is required' }
);

const deliveryDocumentationSchema = z.object({
  notes: z.string().optional(),
  pharmacyName: z.string().optional(),
  pharmacyNcpdp: z.string().optional(),
});

// GET /api/prescriptions - List prescriptions (with optional filters)
prescriptionsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      patientId,
      status,
      startDate,
      endDate,
      providerId,
      erxStatus,
      isControlled,
      writtenDateFrom,
      writtenDateTo,
      search
    } = req.query;

    let query = `
      select
        p.*,
        pat.first_name as "patientFirstName",
        pat.last_name as "patientLastName",
        prov.full_name as "providerName",
        null as "pharmacyName"
      from prescriptions p
      left join patients pat on p.patient_id = pat.id
      left join providers prov on p.provider_id = prov.id
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

    if (erxStatus) {
      query += ` and p.erx_status = $${paramIndex}`;
      params.push(erxStatus);
      paramIndex++;
    }

    if (isControlled === 'true') {
      query += ` and p.is_controlled = true`;
    }

    if (writtenDateFrom) {
      query += ` and p.written_date >= $${paramIndex}`;
      params.push(writtenDateFrom);
      paramIndex++;
    }

    if (writtenDateTo) {
      query += ` and p.written_date <= $${paramIndex}`;
      params.push(writtenDateTo);
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

    if (search) {
      query += ` and (
        p.medication_name ilike $${paramIndex} or
        pat.first_name ilike $${paramIndex} or
        pat.last_name ilike $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' order by p.created_at desc limit 100';

    const result = await pool.query(query, params);

    return res.json({ prescriptions: result.rows });
  } catch (error) {
    logPrescriptionsError('Error fetching prescriptions:', error);
    return res.status(500).json({ error: 'Failed to fetch prescriptions' });
  }
});

// GET /api/prescriptions/refill-requests - List all refill requests
prescriptionsRouter.get('/refill-requests', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, patientId } = req.query;

    let query = `
      select
        p.*,
        pat.first_name as "patientFirstName",
        pat.last_name as "patientLastName",
        prov.full_name as "providerName",
        null as "pharmacyName"
      from prescriptions p
      left join patients pat on p.patient_id = pat.id
      left join providers prov on p.provider_id = prov.id
      where p.tenant_id = $1 and p.refill_status is not null
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` and p.refill_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (patientId) {
      query += ` and p.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    query += ' order by p.created_at desc limit 100';

    const result = await pool.query(query, params);

    return res.json({ refillRequests: result.rows });
  } catch (error) {
    logPrescriptionsError('Error fetching refill requests:', error);
    return res.status(500).json({ error: 'Failed to fetch refill requests' });
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
        null as "pharmacyName"
      from prescriptions p
      left join patients pat on p.patient_id = pat.id
      left join providers prov on p.provider_id = prov.id
      where p.id = $1 and p.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    return res.json({ prescription: result.rows[0] });
  } catch (error) {
    logPrescriptionsError('Error fetching prescription:', error);
    return res.status(500).json({ error: 'Failed to fetch prescription' });
  }
});

// GET /api/patients/:patientId/prescriptions - Get patient's prescriptions with full details
prescriptionsRouter.get('/patient/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;
    const { includeRefills, includeDermTracking, status } = req.query;

    // Verify patient belongs to tenant
    const patientCheck = await pool.query(
      'select id from patients where id = $1 and tenant_id = $2',
      [patientId, tenantId]
    );
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    let query = `
      select
        p.*,
        prov.full_name as "providerName",
        prov.npi as "providerNpi",
        pharm.name as "pharmacyName",
        pharm.phone as "pharmacyPhone",
        pharm.street as "pharmacyStreet",
        pharm.city as "pharmacyCity",
        pharm.state as "pharmacyState",
        pharm.zip as "pharmacyZip",
        e.created_at as "encounterDate",
        e.chief_complaint as "encounterChiefComplaint"
      from prescriptions p
      left join providers prov on p.provider_id = prov.id
      left join pharmacies pharm on p.pharmacy_id = pharm.id
      left join encounters e on p.encounter_id = e.id
      where p.patient_id = $1 and p.tenant_id = $2
    `;

    const params: any[] = [patientId, tenantId];
    let paramIndex = 3;

    if (status) {
      query += ` and p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' order by p.created_at desc';

    const result = await pool.query(query, params);
    const prescriptions = result.rows;

    // Optionally include refill history for each prescription
    if (includeRefills === 'true') {
      for (const prescription of prescriptions) {
        const refillsResult = await pool.query(
          `select
            r.*,
            pharm.name as "pharmacyName"
          from prescription_refills r
          left join pharmacies pharm on r.pharmacy_id = pharm.id
          where r.prescription_id = $1
          order by r.filled_date desc`,
          [prescription.id]
        );
        prescription.refills = refillsResult.rows;
      }
    }

    // Optionally include dermatology-specific tracking
    if (includeDermTracking === 'true') {
      for (const prescription of prescriptions) {
        const trackingResult = await pool.query(
          `select * from derm_medication_tracking
           where prescription_id = $1
           order by created_at desc
           limit 1`,
          [prescription.id]
        );
        if (trackingResult.rows.length > 0) {
          prescription.dermTracking = trackingResult.rows[0];
        }
      }
    }

    return res.json({ prescriptions });
  } catch (error) {
    logPrescriptionsError('Error fetching patient prescriptions:', error);
    return res.status(500).json({ error: 'Failed to fetch patient prescriptions' });
  }
});

// GET /api/encounters/:encounterId/prescriptions - Get prescriptions for an encounter
prescriptionsRouter.get('/encounter/:encounterId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { encounterId } = req.params;
    const tenantId = req.user!.tenantId;

    // Verify encounter belongs to tenant
    const encounterCheck = await pool.query(
      'select id, patient_id from encounters where id = $1 and tenant_id = $2',
      [encounterId, tenantId]
    );
    if (encounterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Encounter not found' });
    }

    const result = await pool.query(
      `select
        p.*,
        prov.full_name as "providerName",
        prov.npi as "providerNpi",
        pharm.name as "pharmacyName",
        pharm.phone as "pharmacyPhone"
      from prescriptions p
      left join providers prov on p.provider_id = prov.id
      left join pharmacies pharm on p.pharmacy_id = pharm.id
      where p.encounter_id = $1 and p.tenant_id = $2
      order by p.created_at desc`,
      [encounterId, tenantId]
    );

    return res.json({ prescriptions: result.rows });
  } catch (error) {
    logPrescriptionsError('Error fetching encounter prescriptions:', error);
    return res.status(500).json({ error: 'Failed to fetch encounter prescriptions' });
  }
});

// GET /api/prescriptions/:id/refill-history - Get refill history for a prescription
prescriptionsRouter.get('/:id/refill-history', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    // Verify prescription belongs to tenant
    const prescriptionCheck = await pool.query(
      'select id, patient_id, medication_name, refills, refills_remaining from prescriptions where id = $1 and tenant_id = $2',
      [id, tenantId]
    );
    if (prescriptionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    const prescription = prescriptionCheck.rows[0];

    // Get refill history
    const refillsResult = await pool.query(
      `select
        r.*,
        pharm.name as "pharmacyName",
        pharm.phone as "pharmacyPhone",
        pharm.street as "pharmacyStreet",
        pharm.city as "pharmacyCity",
        pharm.state as "pharmacyState",
        prov.full_name as "filledByProviderName",
        u.full_name as "filledByUserName"
      from prescription_refills r
      left join pharmacies pharm on r.pharmacy_id = pharm.id
      left join providers prov on r.filled_by_provider_id = prov.id
      left join users u on r.filled_by_user_id = u.id
      where r.prescription_id = $1
      order by r.filled_date desc`,
      [id]
    );

    return res.json({
      prescription: {
        id: prescription.id,
        patientId: prescription.patient_id,
        medicationName: prescription.medication_name,
        totalRefills: prescription.refills,
        refillsRemaining: prescription.refills_remaining,
      },
      refills: refillsResult.rows,
      summary: {
        totalRefills: prescription.refills,
        refillsUsed: refillsResult.rows.length,
        refillsRemaining: prescription.refills_remaining,
        lastFilledDate: refillsResult.rows.length > 0 ? refillsResult.rows[0].filled_date : null,
      },
    });
  } catch (error) {
    logPrescriptionsError('Error fetching refill history:', error);
    return res.status(500).json({ error: 'Failed to fetch refill history' });
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

      const patientCheck = await pool.query(
        'select id from patients where id = $1 and tenant_id = $2',
        [data.patientId, tenantId]
      );
      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      if (data.encounterId) {
        const encounterCheck = await pool.query(
          'select id, patient_id from encounters where id = $1 and tenant_id = $2',
          [data.encounterId, tenantId]
        );
        if (encounterCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Encounter not found' });
        }
        if (encounterCheck.rows[0].patient_id !== data.patientId) {
          return res.status(400).json({ error: 'Encounter does not match patient' });
        }
      }

      if (data.pharmacyId) {
        const pharmacyCheck = await pool.query(
          'select id from pharmacies where id = $1',
          [data.pharmacyId]
        );
        if (pharmacyCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Pharmacy not found' });
        }
      }

      if (data.medicationId) {
        const medicationCheck = await pool.query(
          'select id from medications where id = $1',
          [data.medicationId]
        );
        if (medicationCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Medication not found' });
        }
      }

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
          status, delivery_method, delivery_status, delivery_notes, written_date, refills_remaining,
          created_by
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
          CURRENT_TIMESTAMP, $30, $31
        )`,
        [
          id, tenantId, data.patientId, data.encounterId || null, userId, data.medicationId || null,
          data.medicationName, data.genericName || null, data.strength || null, data.dosageForm || null,
          data.sig, data.quantity, data.quantityUnit, data.refills, data.daysSupply || null,
          data.pharmacyId || null, data.pharmacyName || null, data.pharmacyPhone || null,
          data.pharmacyAddress || null, data.pharmacyNcpdp || null,
          data.daw, data.isControlled, data.deaSchedule || null, data.indication || null, data.notes || null,
          'pending', data.deliveryMethod, data.deliveryMethod === 'electronic' ? 'draft' : 'pending',
          data.deliveryNotes || null, data.refills, userId,
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
        `insert into audit_log(id, tenant_id, user_id, action, resource_type, resource_id, ip_address)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), tenantId, userId, 'create', 'prescription', id, req.ip]
      );

      return res.status(201).json({
        id,
        deliveryMethod: data.deliveryMethod,
        deliveryStatus: data.deliveryMethod === 'electronic' ? 'draft' : 'pending',
        validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      });
    } catch (error) {
      logPrescriptionsError('Error creating prescription:', error);
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

      if (data.pharmacyId) {
        const pharmacyCheck = await pool.query(
          'select id from pharmacies where id = $1',
          [data.pharmacyId]
        );
        if (pharmacyCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Pharmacy not found' });
        }
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
      logPrescriptionsError('Error updating prescription:', error);
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
      logPrescriptionsError('Error cancelling prescription:', error);
      return res.status(500).json({ error: 'Failed to cancel prescription' });
    }
  }
);

// POST /api/prescriptions/send - Vendor-neutral e-prescribing facade
prescriptionsRouter.post(
  '/send',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = sendPrescriptionWorkflowSchema.parse(req.body || {});
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      let source: 'prescription' | 'order' | 'payload' = 'payload';
      let prescriptionRow: any | null = null;
      let orderRow: any | null = null;

      const sendRequest: PrescriptionSendRequest = {
        tenantId,
        prescriptionId: parsed.prescriptionId,
        orderId: parsed.orderId,
        patientId: parsed.patientId,
        medicationName: parsed.medicationName,
        strength: parsed.strength,
        sig: parsed.sig,
        quantity: parsed.quantity,
        refills: parsed.refills,
        pharmacyNcpdp: parsed.pharmacyNcpdp,
        pharmacyName: parsed.pharmacyName,
      };

      if (parsed.prescriptionId) {
        const prescriptionResult = await pool.query(
          `select p.*, pat.first_name, pat.last_name, pat.dob as date_of_birth,
                  prov.full_name as provider_name, prov.npi as provider_npi
             from prescriptions p
             join patients pat on p.patient_id = pat.id
             left join providers prov on p.provider_id = prov.id
            where p.id = $1 and p.tenant_id = $2`,
          [parsed.prescriptionId, tenantId]
        );

        if (prescriptionResult.rows.length > 0) {
          prescriptionRow = prescriptionResult.rows[0];
          source = 'prescription';

          if (prescriptionRow.status === 'cancelled') {
            return res.status(400).json({ error: 'Cannot send cancelled prescription' });
          }

          Object.assign(sendRequest, {
            patientId: prescriptionRow.patient_id,
            patientName: `${prescriptionRow.first_name || ''} ${prescriptionRow.last_name || ''}`.trim(),
            medicationName: prescriptionRow.medication_name,
            strength: prescriptionRow.strength,
            sig: prescriptionRow.sig,
            quantity: prescriptionRow.quantity,
            refills: prescriptionRow.refills,
            pharmacyNcpdp: parsed.pharmacyNcpdp || prescriptionRow.pharmacy_ncpdp,
            pharmacyName: parsed.pharmacyName || prescriptionRow.pharmacy_name,
            providerName: prescriptionRow.provider_name,
            providerNpi: prescriptionRow.provider_npi,
          });
        }
      }

      if (source === 'payload' && parsed.orderId) {
        const orderResult = await pool.query(
          `select o.*, pat.first_name, pat.last_name, prov.full_name as provider_name, prov.npi as provider_npi
             from orders o
             join patients pat on o.patient_id = pat.id
             left join providers prov on o.provider_id = prov.id
            where o.id = $1 and o.tenant_id = $2 and o.type = 'rx'`,
          [parsed.orderId, tenantId]
        );

        if (orderResult.rows.length === 0 && !parsed.prescriptionId) {
          return res.status(404).json({ error: 'Prescription/order not found' });
        }

        if (orderResult.rows.length > 0) {
          orderRow = orderResult.rows[0];
          source = 'order';
          const details = String(orderRow.details || '');
          const lines = details.split('\n').map((line) => line.trim());

          Object.assign(sendRequest, {
            orderId: parsed.orderId,
            patientId: orderRow.patient_id,
            patientName: `${orderRow.first_name || ''} ${orderRow.last_name || ''}`.trim(),
            medicationName: parsed.medicationName || lines[0] || 'Prescription',
            sig: parsed.sig || lines.find((line) => line.startsWith('Sig:'))?.replace('Sig:', '').trim(),
            quantity: parsed.quantity || lines.find((line) => line.startsWith('Qty:'))?.replace('Qty:', '').trim(),
            pharmacyName: parsed.pharmacyName || lines.find((line) => line.startsWith('Pharmacy:'))?.replace('Pharmacy:', '').trim(),
            providerName: orderRow.provider_name,
            providerNpi: orderRow.provider_npi,
          });
        }
      }

      if (parsed.prescriptionId && source === 'payload' && !parsed.orderId) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      const transmissionResult = await getPrescribingService().sendPrescription(sendRequest);

      if (!transmissionResult.success) {
        return res.status(502).json({
          error: 'Failed to transmit prescription',
          result: transmissionResult,
        });
      }

      if (source === 'prescription' && prescriptionRow) {
        await pool.query(
          `UPDATE prescriptions
              SET status = 'sent',
                  delivery_method = 'electronic',
                  delivery_status = 'sent',
                  documented_at = CURRENT_TIMESTAMP,
                  documented_by = $3,
                  pharmacy_ncpdp = COALESCE($1, pharmacy_ncpdp),
                  sent_at = CURRENT_TIMESTAMP,
                  surescripts_message_id = $2,
                  updated_at = CURRENT_TIMESTAMP,
                  updated_by = $3
            WHERE id = $4 AND tenant_id = $5`,
          [transmissionResult.pharmacyNcpdp, transmissionResult.messageId, userId, prescriptionRow.id, tenantId]
        );

        await pool.query(
          `INSERT INTO prescription_audit_log(prescription_id, action, user_id, ip_address, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            prescriptionRow.id,
            'transmitted',
            userId,
            req.ip,
            JSON.stringify({
              provider: transmissionResult.provider,
              mode: transmissionResult.mode,
              deliveryMethod: 'electronic',
              messageId: transmissionResult.messageId,
              pharmacyNcpdp: transmissionResult.pharmacyNcpdp,
            }),
          ]
        );
      } else if (source === 'order' && orderRow) {
        await pool.query(
          `update orders
              set status = 'ordered',
                  details = coalesce(details, '') || $1
            where id = $2 and tenant_id = $3`,
          [` | eRx sent via ${transmissionResult.provider}: ${transmissionResult.messageId}`, orderRow.id, tenantId]
        );
      }

      return res.json({
        success: true,
        provider: transmissionResult.provider,
        mode: transmissionResult.mode,
        messageId: transmissionResult.messageId,
        pharmacyName: transmissionResult.pharmacyName,
        pharmacyNcpdp: transmissionResult.pharmacyNcpdp,
        source,
        result: transmissionResult,
        message: 'Prescription sent successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.issues });
      }

      logPrescriptionsError('Error sending prescription through workflow facade:', error);
      return res.status(500).json({ error: 'Failed to send prescription' });
    }
  }
);

// POST /api/prescriptions/send-erx - Send prescription to pharmacy via NCPDP/Surescripts
prescriptionsRouter.post(
  '/send-erx',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { prescriptionId, pharmacyNcpdp } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!prescriptionId || !pharmacyNcpdp) {
        return res.status(400).json({ error: 'prescriptionId and pharmacyNcpdp are required' });
      }

      // Get prescription details
      const result = await pool.query(
        `select p.*, pat.first_name, pat.last_name, pat.dob as date_of_birth, pat.gender,
                prov.full_name as provider_name, prov.npi as provider_npi
         from prescriptions p
         join patients pat on p.patient_id = pat.id
         join providers prov on p.provider_id = prov.id
         where p.id = $1 and p.tenant_id = $2`,
        [prescriptionId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      const prescription = result.rows[0];

      if (prescription.status === 'cancelled') {
        return res.status(400).json({ error: 'Cannot send cancelled prescription' });
      }

      if (prescription.status === 'sent' || prescription.status === 'transmitted') {
        return res.status(400).json({ error: 'Prescription has already been sent' });
      }

      // Get pharmacy details
      const pharmacyResult = await pool.query(
        'SELECT * FROM pharmacies WHERE ncpdp_id = $1',
        [pharmacyNcpdp]
      );

      if (pharmacyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Pharmacy not found' });
      }

      const pharmacy = pharmacyResult.rows[0];

      // Build NCPDP SCRIPT message
      const prescriptionData = {
        prescription: {
          medicationName: prescription.medication_name,
          genericName: prescription.generic_name,
          strength: prescription.strength,
          dosageForm: prescription.dosage_form,
          sig: prescription.sig,
          quantity: prescription.quantity,
          quantityUnit: prescription.quantity_unit,
          refills: prescription.refills,
          daysSupply: prescription.days_supply,
          daw: prescription.daw,
          isControlled: prescription.is_controlled,
          deaSchedule: prescription.dea_schedule,
        },
        patient: {
          firstName: prescription.first_name,
          lastName: prescription.last_name,
          dateOfBirth: prescription.date_of_birth,
          gender: prescription.gender,
        },
        prescriber: {
          name: prescription.provider_name,
          npi: prescription.provider_npi,
        },
      };

      // Send via Surescripts
      const transmissionResult = await sendNewRx(prescriptionId, pharmacyNcpdp, prescriptionData);

      if (!transmissionResult.success) {
        await pool.query(
          `UPDATE prescriptions
           SET status = 'error', updated_at = CURRENT_TIMESTAMP, updated_by = $1
           WHERE id = $2`,
          [userId, prescriptionId]
        );

        return res.status(500).json({
          error: transmissionResult.error || 'Failed to transmit prescription',
        });
      }

      // Update prescription status
      await pool.query(
        `UPDATE prescriptions
         SET status = 'sent',
             delivery_method = 'electronic',
             delivery_status = 'sent',
             documented_at = CURRENT_TIMESTAMP,
             documented_by = $4,
             pharmacy_ncpdp = $1,
             pharmacy_id = $2,
             sent_at = CURRENT_TIMESTAMP,
             surescripts_message_id = $3,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $4
         WHERE id = $5`,
        [pharmacyNcpdp, pharmacy.id, transmissionResult.messageId, userId, prescriptionId]
      );

      // Log to audit
      await pool.query(
        `INSERT INTO prescription_audit_log(prescription_id, action, user_id, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          prescriptionId,
          'transmitted',
          userId,
          req.ip,
          JSON.stringify({ pharmacyNcpdp, messageId: transmissionResult.messageId, deliveryMethod: 'electronic' }),
        ]
      );

      return res.json({
        success: true,
        messageId: transmissionResult.messageId,
        pharmacyName: pharmacy.name,
        message: 'Prescription sent successfully',
      });
    } catch (error) {
      logPrescriptionsError('Error sending eRx:', error);
      return res.status(500).json({ error: 'Failed to send electronic prescription' });
    }
  }
);

// POST /api/prescriptions/check-formulary - Check insurance formulary
prescriptionsRouter.post(
  '/check-formulary',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { medicationName, ndc, payerId } = req.body;

      if (!medicationName) {
        return res.status(400).json({ error: 'medicationName is required' });
      }

      const formularyResult = await checkFormulary(medicationName, payerId, ndc);

      return res.json(formularyResult);
    } catch (error) {
      logPrescriptionsError('Error checking formulary:', error);
      return res.status(500).json({ error: 'Failed to check formulary' });
    }
  }
);

// GET /api/prescriptions/patient-benefits/:patientId - Get patient pharmacy benefits
prescriptionsRouter.get(
  '/patient-benefits/:patientId',
  requireAuth,
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

      const benefits = await getPatientBenefits(patientId!, tenantId);

      if (!benefits) {
        return res.status(404).json({ error: 'No pharmacy benefits found for patient' });
      }

      return res.json(benefits);
    } catch (error) {
      logPrescriptionsError('Error fetching patient benefits:', error);
      return res.status(500).json({ error: 'Failed to fetch patient benefits' });
    }
  }
);

// POST /api/prescriptions/:id/send - Legacy endpoint (redirects to send-erx)
prescriptionsRouter.post(
  '/:id/send',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      // Get prescription with pharmacy NCPDP
      const result = await pool.query(
        `SELECT p.*, pharm.ncpdp_id
         FROM prescriptions p
         LEFT JOIN pharmacies pharm ON p.pharmacy_id = pharm.id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      const prescription = result.rows[0];

      if (!prescription.ncpdp_id && !prescription.pharmacy_ncpdp) {
        return res.status(400).json({ error: 'Pharmacy NCPDP ID is required' });
      }

      // Redirect to the new endpoint
      return res.status(200).json({
        message: 'Please use /api/prescriptions/send-erx endpoint instead',
        redirectTo: '/api/prescriptions/send-erx',
        body: {
          prescriptionId: id,
          pharmacyNcpdp: prescription.pharmacy_ncpdp || prescription.ncpdp_id,
        }
      });
    } catch (error) {
      logPrescriptionsError('Error sending prescription:', error);
      return res.status(500).json({ error: 'Failed to send prescription' });
    }
  }
);

// POST /api/prescriptions/:id/refill-deny - Deny refill with reason
prescriptionsRouter.post(
  '/:id/refill-deny',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!reason) {
        return res.status(400).json({ error: 'Denial reason is required' });
      }

      // Check prescription exists
      const existing = await pool.query(
        'select id from prescriptions where id = $1 and tenant_id = $2',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      // Update refill status to denied
      await pool.query(
        `update prescriptions
         set refill_status = 'denied',
             denial_reason = $1,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $2
         where id = $3`,
        [reason, userId, id]
      );

      // Log to audit
      await pool.query(
        `insert into prescription_audit_log(prescription_id, action, changed_fields, user_id, ip_address)
         values ($1, $2, $3, $4, $5)`,
        [id, 'refill_denied', JSON.stringify({ reason }), userId, req.ip]
      );

      return res.json({ success: true, message: 'Refill denied' });
    } catch (error) {
      logPrescriptionsError('Error denying refill:', error);
      return res.status(500).json({ error: 'Failed to deny refill' });
    }
  }
);

// POST /api/prescriptions/:id/change-request - Request medication change
prescriptionsRouter.post(
  '/:id/change-request',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { changeType, details } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!changeType || !details) {
        return res.status(400).json({ error: 'Change type and details are required' });
      }

      // Check prescription exists
      const existing = await pool.query(
        'select id from prescriptions where id = $1 and tenant_id = $2',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      // Update refill status and change request details
      await pool.query(
        `update prescriptions
         set refill_status = 'change_requested',
             change_request_details = $1,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $2
         where id = $3`,
        [JSON.stringify({ changeType, details, requestedAt: new Date().toISOString(), requestedBy: userId }), userId, id]
      );

      // Log to audit
      await pool.query(
        `insert into prescription_audit_log(prescription_id, action, changed_fields, user_id, ip_address)
         values ($1, $2, $3, $4, $5)`,
        [id, 'change_requested', JSON.stringify({ changeType, details }), userId, req.ip]
      );

      return res.json({ success: true, message: 'Change request submitted' });
    } catch (error) {
      logPrescriptionsError('Error requesting change:', error);
      return res.status(500).json({ error: 'Failed to request change' });
    }
  }
);

// POST /api/prescriptions/:id/audit-confirm - Confirm review for compliance
prescriptionsRouter.post(
  '/:id/audit-confirm',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Check prescription exists
      const existing = await pool.query(
        'select id from prescriptions where id = $1 and tenant_id = $2',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      // Update audit confirmation
      await pool.query(
        `update prescriptions
         set audit_confirmed_at = CURRENT_TIMESTAMP,
             audit_confirmed_by = $1,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $1
         where id = $2`,
        [userId, id]
      );

      // Log to audit
      await pool.query(
        `insert into prescription_audit_log(prescription_id, action, user_id, ip_address)
         values ($1, $2, $3, $4)`,
        [id, 'audit_confirmed', userId, req.ip]
      );

      return res.json({ success: true, message: 'Audit confirmation recorded' });
    } catch (error) {
      logPrescriptionsError('Error confirming audit:', error);
      return res.status(500).json({ error: 'Failed to confirm audit' });
    }
  }
);

// POST /api/prescriptions/bulk/send-erx - Send multiple prescriptions electronically
prescriptionsRouter.post(
  '/bulk/send-erx',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { prescriptionIds } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!Array.isArray(prescriptionIds) || prescriptionIds.length === 0) {
        return res.status(400).json({ error: 'prescriptionIds array is required' });
      }

      if (prescriptionIds.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 prescriptions can be sent at once' });
      }

      // Create batch operation record
      const batchId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO prescription_batch_operations(
          id, tenant_id, operation_type, prescription_ids, total_count,
          initiated_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [batchId, tenantId, 'bulk_erx', prescriptionIds, prescriptionIds.length, userId, 'in_progress']
      );

      const results: {
        success: string[];
        failed: Array<{ id: any; error: string }>;
      } = {
        success: [],
        failed: [],
      };

      // Process each prescription
      for (const prescriptionId of prescriptionIds) {
        try {
          // Get prescription with pharmacy info
          const result = await pool.query(
            `SELECT p.*, pharm.ncpdp_id
             FROM prescriptions p
             LEFT JOIN pharmacies pharm ON p.pharmacy_id = pharm.id
             WHERE p.id = $1 AND p.tenant_id = $2`,
            [prescriptionId, tenantId]
          );

          if (result.rows.length === 0) {
            results.failed.push({ id: prescriptionId, error: 'Prescription not found' });
            continue;
          }

          const prescription = result.rows[0];

          if (!prescription.ncpdp_id && !prescription.pharmacy_ncpdp) {
            results.failed.push({ id: prescriptionId, error: 'No pharmacy NCPDP ID' });
            continue;
          }

          if (prescription.status === 'cancelled') {
            results.failed.push({ id: prescriptionId, error: 'Prescription is cancelled' });
            continue;
          }

          if (prescription.status === 'sent' || prescription.status === 'transmitted') {
            results.failed.push({ id: prescriptionId, error: 'Already sent' });
            continue;
          }

          // Update status to sent (simulated)
          await pool.query(
            `UPDATE prescriptions
             SET status = 'sent',
                 erx_status = 'success',
                 delivery_method = 'electronic',
                 delivery_status = 'sent',
                 documented_at = CURRENT_TIMESTAMP,
                 documented_by = $1,
                 sent_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP,
                 updated_by = $1
             WHERE id = $2`,
            [userId, prescriptionId]
          );

          // Log to audit
          await pool.query(
            `INSERT INTO prescription_audit_log(prescription_id, action, user_id, ip_address, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [prescriptionId, 'bulk_transmitted', userId, req.ip, JSON.stringify({ batchId })]
          );

          results.success.push(prescriptionId);
        } catch (error: any) {
          results.failed.push({ id: prescriptionId, error: error.message });
        }
      }

      // Update batch operation
      await pool.query(
        `UPDATE prescription_batch_operations
         SET status = $1,
             success_count = $2,
             failure_count = $3,
             completed_at = CURRENT_TIMESTAMP,
             error_log = $4
         WHERE id = $5`,
        [
          results.failed.length === 0 ? 'completed' : (results.success.length > 0 ? 'partial_failure' : 'failed'),
          results.success.length,
          results.failed.length,
          JSON.stringify(results.failed),
          batchId
        ]
      );

      return res.json({
        success: true,
        batchId,
        totalCount: prescriptionIds.length,
        successCount: results.success.length,
        failureCount: results.failed.length,
        results,
      });
    } catch (error) {
      logPrescriptionsError('Error sending bulk eRx:', error);
      return res.status(500).json({ error: 'Failed to send bulk prescriptions' });
    }
  }
);

// POST /api/prescriptions/bulk/print - Print multiple prescriptions
prescriptionsRouter.post(
  '/bulk/print',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { prescriptionIds } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!Array.isArray(prescriptionIds) || prescriptionIds.length === 0) {
        return res.status(400).json({ error: 'prescriptionIds array is required' });
      }

      if (prescriptionIds.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 prescriptions can be printed at once' });
      }

      // Create batch operation record
      const batchId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO prescription_batch_operations(
          id, tenant_id, operation_type, prescription_ids, total_count,
          initiated_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [batchId, tenantId, 'bulk_print', prescriptionIds, prescriptionIds.length, userId, 'in_progress']
      );

      // Update print counts
      await pool.query(
        `UPDATE prescriptions
         SET status = 'sent',
             delivery_method = 'print',
             delivery_status = 'printed',
             documented_at = CURRENT_TIMESTAMP,
             documented_by = $1,
             print_count = COALESCE(print_count, 0) + 1,
             last_printed_at = CURRENT_TIMESTAMP,
             last_printed_by = $1
         WHERE id = ANY($2) AND tenant_id = $3`,
        [userId, prescriptionIds, tenantId]
      );

      // Update batch operation
      await pool.query(
        `UPDATE prescription_batch_operations
         SET status = 'completed',
             success_count = $1,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [prescriptionIds.length, batchId]
      );

      return res.json({
        success: true,
        batchId,
        totalCount: prescriptionIds.length,
        message: 'Prescriptions marked for printing',
      });
    } catch (error) {
      logPrescriptionsError('Error printing bulk prescriptions:', error);
      return res.status(500).json({ error: 'Failed to print prescriptions' });
    }
  }
);

// POST /api/prescriptions/:id/print - Document printed prescription
prescriptionsRouter.post(
  '/:id/print',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = deliveryDocumentationSchema.parse(req.body || {});
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const existing = await pool.query(
        `SELECT p.id, p.status, p.medication_name, p.sig, p.quantity, p.quantity_unit,
                p.refills, p.pharmacy_name, pat.first_name, pat.last_name
           FROM prescriptions p
           LEFT JOIN patients pat ON p.patient_id = pat.id
          WHERE p.id = $1 AND p.tenant_id = $2`,
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      const prescription = existing.rows[0];
      if (['cancelled', 'discontinued'].includes(String(prescription.status || '').toLowerCase())) {
        return res.status(400).json({ error: 'Cannot print cancelled or discontinued prescription' });
      }

      await pool.query(
        `UPDATE prescriptions
            SET status = 'sent',
                delivery_method = 'print',
                delivery_status = 'printed',
                delivery_notes = COALESCE(NULLIF($1, ''), delivery_notes),
                pharmacy_name = COALESCE(NULLIF($2, ''), pharmacy_name),
                pharmacy_ncpdp = COALESCE(NULLIF($3, ''), pharmacy_ncpdp),
                documented_at = CURRENT_TIMESTAMP,
                documented_by = $4,
                print_count = COALESCE(print_count, 0) + 1,
                last_printed_at = CURRENT_TIMESTAMP,
                last_printed_by = $4,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $4
          WHERE id = $5 AND tenant_id = $6`,
        [parsed.notes || null, parsed.pharmacyName || null, parsed.pharmacyNcpdp || null, userId, id, tenantId]
      );

      await pool.query(
        `INSERT INTO prescription_audit_log(prescription_id, action, user_id, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          'printed',
          userId,
          req.ip,
          JSON.stringify({
            deliveryMethod: 'print',
            notes: parsed.notes || null,
            pharmacyName: parsed.pharmacyName || null,
          }),
        ]
      );

      return res.json({
        success: true,
        prescriptionId: id,
        deliveryMethod: 'print',
        deliveryStatus: 'printed',
        printCountIncremented: true,
        printable: {
          patientName: `${prescription.first_name || ''} ${prescription.last_name || ''}`.trim(),
          medicationName: prescription.medication_name,
          sig: prescription.sig,
          quantity: prescription.quantity,
          quantityUnit: prescription.quantity_unit,
          refills: prescription.refills,
          pharmacyName: parsed.pharmacyName || prescription.pharmacy_name || null,
        },
        message: 'Prescription marked as printed',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.issues });
      }
      logPrescriptionsError('Error documenting printed prescription:', error);
      return res.status(500).json({ error: 'Failed to document printed prescription' });
    }
  }
);

// POST /api/prescriptions/:id/manual-fill - Document manually filled/written prescription
prescriptionsRouter.post(
  '/:id/manual-fill',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = deliveryDocumentationSchema.parse(req.body || {});
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const existing = await pool.query(
        'SELECT id, status FROM prescriptions WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      const prescription = existing.rows[0];
      if (['cancelled', 'discontinued'].includes(String(prescription.status || '').toLowerCase())) {
        return res.status(400).json({ error: 'Cannot manually fill cancelled or discontinued prescription' });
      }

      await pool.query(
        `UPDATE prescriptions
            SET status = 'sent',
                delivery_method = 'manual',
                delivery_status = 'manual_documented',
                delivery_notes = COALESCE(NULLIF($1, ''), delivery_notes),
                pharmacy_name = COALESCE(NULLIF($2, ''), pharmacy_name),
                pharmacy_ncpdp = COALESCE(NULLIF($3, ''), pharmacy_ncpdp),
                documented_at = CURRENT_TIMESTAMP,
                documented_by = $4,
                manually_filled_at = CURRENT_TIMESTAMP,
                manually_filled_by = $4,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $4
          WHERE id = $5 AND tenant_id = $6`,
        [parsed.notes || null, parsed.pharmacyName || null, parsed.pharmacyNcpdp || null, userId, id, tenantId]
      );

      await pool.query(
        `INSERT INTO prescription_audit_log(prescription_id, action, user_id, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          'manual_fill_documented',
          userId,
          req.ip,
          JSON.stringify({
            deliveryMethod: 'manual',
            notes: parsed.notes || null,
            pharmacyName: parsed.pharmacyName || null,
          }),
        ]
      );

      return res.json({
        success: true,
        prescriptionId: id,
        deliveryMethod: 'manual',
        deliveryStatus: 'manual_documented',
        message: 'Manual prescription documented',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.issues });
      }
      logPrescriptionsError('Error documenting manual prescription:', error);
      return res.status(500).json({ error: 'Failed to document manual prescription' });
    }
  }
);

// POST /api/prescriptions/bulk/refill - Create refills for multiple prescriptions
prescriptionsRouter.post(
  '/bulk/refill',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { prescriptionIds } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!Array.isArray(prescriptionIds) || prescriptionIds.length === 0) {
        return res.status(400).json({ error: 'prescriptionIds array is required' });
      }

      if (prescriptionIds.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 prescriptions can be refilled at once' });
      }

      // Create batch operation record
      const batchId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO prescription_batch_operations(
          id, tenant_id, operation_type, prescription_ids, total_count,
          initiated_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [batchId, tenantId, 'bulk_refill', prescriptionIds, prescriptionIds.length, userId, 'in_progress']
      );

      const results: {
        success: Array<{ originalId: any; newId: string }>;
        failed: Array<{ id: any; error: string }>;
      } = {
        success: [],
        failed: [],
      };

      // Process each prescription
      for (const prescriptionId of prescriptionIds) {
        try {
          // Get original prescription
          const result = await pool.query(
            'SELECT * FROM prescriptions WHERE id = $1 AND tenant_id = $2',
            [prescriptionId, tenantId]
          );

          if (result.rows.length === 0) {
            results.failed.push({ id: prescriptionId, error: 'Prescription not found' });
            continue;
          }

          const original = result.rows[0];

          if (original.refills <= 0) {
            results.failed.push({ id: prescriptionId, error: 'No refills remaining' });
            continue;
          }

          // Create new prescription (refill)
          const newRxId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO prescriptions(
              id, tenant_id, patient_id, provider_id, medication_id, medication_name,
              generic_name, strength, dosage_form, sig, quantity, quantity_unit,
              refills, days_supply, pharmacy_id, pharmacy_name, pharmacy_ncpdp,
              daw, is_controlled, dea_schedule, status, created_by, notes
            ) SELECT
              $1, tenant_id, patient_id, provider_id, medication_id, medication_name,
              generic_name, strength, dosage_form, sig, quantity, quantity_unit,
              refills - 1, days_supply, pharmacy_id, pharmacy_name, pharmacy_ncpdp,
              daw, is_controlled, dea_schedule, 'pending', $2,
              'Refill from batch operation ' || $3
            FROM prescriptions
            WHERE id = $4`,
            [newRxId, userId, batchId, prescriptionId]
          );

          results.success.push({ originalId: prescriptionId, newId: newRxId });
        } catch (error: any) {
          results.failed.push({ id: prescriptionId, error: error.message });
        }
      }

      // Update batch operation
      await pool.query(
        `UPDATE prescription_batch_operations
         SET status = $1,
             success_count = $2,
             failure_count = $3,
             completed_at = CURRENT_TIMESTAMP,
             error_log = $4
         WHERE id = $5`,
        [
          results.failed.length === 0 ? 'completed' : (results.success.length > 0 ? 'partial_failure' : 'failed'),
          results.success.length,
          results.failed.length,
          JSON.stringify(results.failed),
          batchId
        ]
      );

      return res.json({
        success: true,
        batchId,
        totalCount: prescriptionIds.length,
        successCount: results.success.length,
        failureCount: results.failed.length,
        results,
      });
    } catch (error) {
      logPrescriptionsError('Error creating bulk refills:', error);
      return res.status(500).json({ error: 'Failed to create bulk refills' });
    }
  }
);
