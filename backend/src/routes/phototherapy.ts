/**
 * Phototherapy Routes
 * API endpoints for UV light therapy tracking
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';
import { PhototherapyService } from '../services/phototherapyService';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Validation schemas
const createCourseSchema = z.object({
  patientId: z.string().uuid(),
  protocolId: z.string().uuid(),
  providerId: z.string().uuid(),
  fitzpatrickSkinType: z.number().int().min(1).max(6),
  diagnosisCode: z.string().optional(),
  diagnosisDescription: z.string().optional(),
  indication: z.string().optional(),
  targetBodyAreas: z.array(z.string()).optional(),
  treatmentPercentageBsa: z.number().optional(),
  targetTreatmentCount: z.number().int().optional(),
  clinicalNotes: z.string().optional(),
  precautions: z.string().optional(),
});

const recordTreatmentSchema = z.object({
  cabinetId: z.string().uuid().optional().nullable(),
  treatmentDate: z.string(),
  treatmentTime: z.string().optional(),
  doseMj: z.number().positive(),
  durationSeconds: z.number().int().optional(),
  bodyAreas: z.array(z.string()).optional(),
  skinType: z.number().int().min(1).max(6).optional(),
  preTreatmentNotes: z.string().optional(),
  psoralenTaken: z.boolean().optional(),
  psoralenTime: z.string().optional(),
  psoralenDoseMg: z.number().optional(),
  eyeProtectionVerified: z.boolean().optional(),
  supervisedBy: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const recordErythemaSchema = z.object({
  erythemaResponse: z.enum(['none', 'minimal', 'mild', 'moderate', 'severe', 'blistering']),
  erythemaScore: z.number().int().min(0).max(4).optional(),
  responseNotes: z.string().optional(),
});

const updateCourseStatusSchema = z.object({
  status: z.enum(['active', 'completed', 'discontinued', 'on_hold']),
  reason: z.string().optional(),
});

const createProtocolSchema = z.object({
  name: z.string().min(1),
  condition: z.string().min(1),
  lightType: z.enum(['NB-UVB', 'BB-UVB', 'PUVA', 'UVA1']),
  wavelengthNm: z.string().optional(),
  description: z.string().optional(),
  startingDoseTypeI: z.number().optional(),
  startingDoseTypeII: z.number().optional(),
  startingDoseTypeIII: z.number().optional(),
  startingDoseTypeIV: z.number().optional(),
  startingDoseTypeV: z.number().optional(),
  startingDoseTypeVI: z.number().optional(),
  startingDose: z.number().optional(),
  incrementPercent: z.number().min(0).max(50).optional(),
  maxDose: z.number().optional(),
  frequency: z.string().optional(),
  minHoursBetweenTreatments: z.number().int().optional(),
  psoralenType: z.string().optional(),
  psoralenDoseMg: z.number().optional(),
  psoralenTimingMinutes: z.number().int().optional(),
  maxCumulativeDose: z.number().optional(),
  highCumulativeWarning: z.number().optional(),
  isTemplate: z.boolean().optional(),
});

/**
 * GET /api/phototherapy/protocols
 * List all phototherapy protocols
 */
router.get('/protocols', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const isTemplate = req.query.is_template === 'true' ? true :
      req.query.is_template === 'false' ? false : undefined;

    const protocols = await PhototherapyService.getProtocols(tenantId, isTemplate);

    res.json({ protocols });
  } catch (error: any) {
    logger.error('Error fetching phototherapy protocols', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch protocols' });
  }
});

/**
 * POST /api/phototherapy/protocols
 * Create a new protocol
 */
router.post('/protocols', async (req: AuthedRequest, res: Response) => {
  try {
    const validatedData = createProtocolSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const query = `
      INSERT INTO phototherapy_protocols (
        tenant_id, name, condition, light_type, wavelength_nm, description,
        starting_dose_type_i, starting_dose_type_ii, starting_dose_type_iii,
        starting_dose_type_iv, starting_dose_type_v, starting_dose_type_vi,
        starting_dose, increment_percent, max_dose, frequency,
        min_hours_between_treatments, psoralen_type, psoralen_dose_mg,
        psoralen_timing_minutes, max_cumulative_dose, high_cumulative_warning,
        is_template, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      validatedData.name,
      validatedData.condition,
      validatedData.lightType,
      validatedData.wavelengthNm || null,
      validatedData.description || null,
      validatedData.startingDoseTypeI || null,
      validatedData.startingDoseTypeII || null,
      validatedData.startingDoseTypeIII || null,
      validatedData.startingDoseTypeIV || null,
      validatedData.startingDoseTypeV || null,
      validatedData.startingDoseTypeVI || null,
      validatedData.startingDose || null,
      validatedData.incrementPercent || 10,
      validatedData.maxDose || null,
      validatedData.frequency || '3x_weekly',
      validatedData.minHoursBetweenTreatments || 48,
      validatedData.psoralenType || null,
      validatedData.psoralenDoseMg || null,
      validatedData.psoralenTimingMinutes || null,
      validatedData.maxCumulativeDose || null,
      validatedData.highCumulativeWarning || null,
      validatedData.isTemplate || false,
      userId,
    ]);

    logger.info('Phototherapy protocol created', {
      protocolId: result.rows[0].id,
      name: validatedData.name,
    });

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error creating phototherapy protocol', { error: error.message });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    if (error.code === '23505') {
      return res.status(409).json({ error: 'A protocol with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to create protocol' });
  }
});

/**
 * POST /api/phototherapy/courses
 * Start a new phototherapy course for a patient
 */
router.post('/courses', async (req: AuthedRequest, res: Response) => {
  try {
    const validatedData = createCourseSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const course = await PhototherapyService.createCourse({
      tenantId,
      patientId: validatedData.patientId,
      protocolId: validatedData.protocolId,
      providerId: validatedData.providerId,
      fitzpatrickSkinType: validatedData.fitzpatrickSkinType as 1 | 2 | 3 | 4 | 5 | 6,
      diagnosisCode: validatedData.diagnosisCode,
      diagnosisDescription: validatedData.diagnosisDescription,
      indication: validatedData.indication,
      targetBodyAreas: validatedData.targetBodyAreas,
      treatmentPercentageBsa: validatedData.treatmentPercentageBsa,
      targetTreatmentCount: validatedData.targetTreatmentCount,
      clinicalNotes: validatedData.clinicalNotes,
      precautions: validatedData.precautions,
      createdBy: userId,
    });

    res.status(201).json(course);
  } catch (error: any) {
    logger.error('Error creating phototherapy course', { error: error.message });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    if (error.message.includes('already has an active')) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to create course' });
  }
});

/**
 * GET /api/phototherapy/courses
 * List phototherapy courses (optionally filter by status)
 */
router.get('/courses', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, patient_id, provider_id } = req.query;

    let query = `
      SELECT
        pc.*,
        pp.name as protocol_name,
        pp.light_type,
        pp.condition,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as prescribing_provider_name,
        (
          SELECT MAX(treatment_date) FROM phototherapy_treatments pt WHERE pt.course_id = pc.id
        ) as last_treatment_date
      FROM phototherapy_courses pc
      JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
      JOIN patients p ON pc.patient_id = p.id
      JOIN providers pr ON pc.prescribing_provider_id = pr.id
      WHERE pc.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND pc.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (patient_id) {
      query += ` AND pc.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (provider_id) {
      query += ` AND pc.prescribing_provider_id = $${paramIndex}`;
      params.push(provider_id);
      paramIndex++;
    }

    query += ` ORDER BY pc.start_date DESC`;

    const result = await pool.query(query, params);

    res.json({ courses: result.rows });
  } catch (error: any) {
    logger.error('Error fetching phototherapy courses', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

/**
 * GET /api/phototherapy/courses/active
 * Get all active courses (for dashboard)
 */
router.get('/courses/active', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.query.provider_id as string | undefined;

    const courses = await PhototherapyService.getActiveCourses(tenantId, providerId);

    res.json({ courses });
  } catch (error: any) {
    logger.error('Error fetching active phototherapy courses', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch active courses' });
  }
});

/**
 * GET /api/phototherapy/courses/:id
 * Get course details with treatments
 */
router.get('/courses/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const courseDetails = await PhototherapyService.getCourseDetails(id!, tenantId!);

    res.json(courseDetails);
  } catch (error: any) {
    logger.error('Error fetching phototherapy course', { error: error.message, courseId: req.params.id });

    if (error.message === 'Course not found') {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

/**
 * PUT /api/phototherapy/courses/:id/status
 * Update course status
 */
router.put('/courses/:id/status', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateCourseStatusSchema.parse(req.body);
    const tenantId = req.user!.tenantId;

    const course = await PhototherapyService.updateCourseStatus(
      id!,
      tenantId!,
      validatedData.status,
      validatedData.reason
    );

    res.json(course);
  } catch (error: any) {
    logger.error('Error updating phototherapy course status', { error: error.message, courseId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    if (error.message === 'Course not found') {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.status(500).json({ error: 'Failed to update course status' });
  }
});

/**
 * GET /api/phototherapy/courses/:id/compliance
 * Get compliance report for a course
 */
router.get('/courses/:id/compliance', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const report = await PhototherapyService.getComplianceReport(id!, tenantId!);

    res.json(report);
  } catch (error: any) {
    logger.error('Error fetching compliance report', { error: error.message, courseId: req.params.id });

    if (error.message === 'Course not found') {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.status(500).json({ error: 'Failed to fetch compliance report' });
  }
});

/**
 * POST /api/phototherapy/courses/:id/treatments
 * Record a treatment session
 */
router.post('/courses/:id/treatments', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = recordTreatmentSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const result = await PhototherapyService.recordTreatment({
      tenantId: tenantId!,
      courseId: id!,
      cabinetId: validatedData.cabinetId || undefined,
      treatmentDate: validatedData.treatmentDate,
      treatmentTime: validatedData.treatmentTime,
      doseMj: validatedData.doseMj,
      durationSeconds: validatedData.durationSeconds,
      bodyAreas: validatedData.bodyAreas,
      skinType: validatedData.skinType,
      preTreatmentNotes: validatedData.preTreatmentNotes,
      psoralenTaken: validatedData.psoralenTaken,
      psoralenTime: validatedData.psoralenTime,
      psoralenDoseMg: validatedData.psoralenDoseMg,
      eyeProtectionVerified: validatedData.eyeProtectionVerified,
      administeredBy: userId,
      supervisedBy: validatedData.supervisedBy,
      notes: validatedData.notes,
    });

    res.status(201).json(result);
  } catch (error: any) {
    logger.error('Error recording phototherapy treatment', { error: error.message, courseId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    if (error.message === 'Course not found') {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (error.message.includes('inactive course')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to record treatment' });
  }
});

/**
 * PUT /api/phototherapy/treatments/:id/erythema
 * Record erythema response for a treatment
 */
router.put('/treatments/:id/erythema', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = recordErythemaSchema.parse(req.body);
    const tenantId = req.user!.tenantId;

    const treatment = await PhototherapyService.adjustForErythema({
      tenantId: tenantId!,
      treatmentId: id!,
      erythemaResponse: validatedData.erythemaResponse,
      erythemaScore: validatedData.erythemaScore,
      responseNotes: validatedData.responseNotes,
    });

    res.json(treatment);
  } catch (error: any) {
    logger.error('Error recording erythema response', { error: error.message, treatmentId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    if (error.message === 'Treatment not found') {
      return res.status(404).json({ error: 'Treatment not found' });
    }

    res.status(500).json({ error: 'Failed to record erythema response' });
  }
});

/**
 * GET /api/phototherapy/next-dose/:courseId
 * Get suggested next dose for a course
 */
router.get('/next-dose/:courseId', async (req: AuthedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const tenantId = req.user!.tenantId;

    const doseCalculation = await PhototherapyService.calculateNextDose(courseId!, tenantId!);

    res.json(doseCalculation);
  } catch (error: any) {
    logger.error('Error calculating next dose', { error: error.message, courseId: req.params.courseId });

    if (error.message === 'Course not found') {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.status(500).json({ error: 'Failed to calculate next dose' });
  }
});

/**
 * GET /api/phototherapy/patient/:patientId/history
 * Get patient's phototherapy treatment history
 */
router.get('/patient/:patientId/history', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const history = await PhototherapyService.getPatientHistory(patientId!, tenantId!);

    res.json(history);
  } catch (error: any) {
    logger.error('Error fetching patient phototherapy history', { error: error.message, patientId: req.params.patientId });
    res.status(500).json({ error: 'Failed to fetch patient history' });
  }
});

/**
 * GET /api/phototherapy/patient/:patientId/cumulative-dose
 * Get patient's cumulative lifetime dose
 */
router.get('/patient/:patientId/cumulative-dose', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const cumulativeDose = await PhototherapyService.getCumulativeDose(patientId!, tenantId!);

    res.json(cumulativeDose);
  } catch (error: any) {
    logger.error('Error fetching cumulative dose', { error: error.message, patientId: req.params.patientId });
    res.status(500).json({ error: 'Failed to fetch cumulative dose' });
  }
});

/**
 * PUT /api/phototherapy/patient/:patientId/external-history
 * Update patient's external phototherapy history
 */
router.put('/patient/:patientId/external-history', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;
    const { externalNbUvbDose, externalBbUvbDose, externalPuvaDose, externalUva1Dose, externalHistoryNotes } = req.body;

    const query = `
      INSERT INTO phototherapy_cumulative_doses (
        tenant_id, patient_id,
        external_nb_uvb_dose, external_bb_uvb_dose,
        external_puva_dose, external_uva1_dose,
        external_history_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, patient_id) DO UPDATE SET
        external_nb_uvb_dose = COALESCE($3, phototherapy_cumulative_doses.external_nb_uvb_dose),
        external_bb_uvb_dose = COALESCE($4, phototherapy_cumulative_doses.external_bb_uvb_dose),
        external_puva_dose = COALESCE($5, phototherapy_cumulative_doses.external_puva_dose),
        external_uva1_dose = COALESCE($6, phototherapy_cumulative_doses.external_uva1_dose),
        external_history_notes = COALESCE($7, phototherapy_cumulative_doses.external_history_notes),
        updated_at = now()
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      patientId,
      externalNbUvbDose || 0,
      externalBbUvbDose || 0,
      externalPuvaDose || 0,
      externalUva1Dose || 0,
      externalHistoryNotes || null,
    ]);

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error updating external history', { error: error.message, patientId: req.params.patientId });
    res.status(500).json({ error: 'Failed to update external history' });
  }
});

/**
 * GET /api/phototherapy/cabinets
 * List phototherapy cabinets
 */
router.get('/cabinets', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const locationId = req.query.location_id as string | undefined;

    const cabinets = await PhototherapyService.getCabinets(tenantId, locationId);

    res.json({ cabinets });
  } catch (error: any) {
    logger.error('Error fetching phototherapy cabinets', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch cabinets' });
  }
});

/**
 * POST /api/phototherapy/cabinets
 * Create a new cabinet
 */
router.post('/cabinets', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      cabinetName, locationId, lightType, manufacturer, model, serialNumber,
      bulbType, numberOfBulbs, bulbMaxHours, calibrationDate,
    } = req.body;

    if (!cabinetName || !lightType) {
      return res.status(400).json({ error: 'Cabinet name and light type are required' });
    }

    const query = `
      INSERT INTO phototherapy_cabinets (
        tenant_id, cabinet_name, location_id, light_type, manufacturer,
        model, serial_number, bulb_type, number_of_bulbs, bulb_max_hours,
        calibration_date, next_calibration_due
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        CASE WHEN $11 IS NOT NULL THEN ($11::date + INTERVAL '1 year')::date ELSE NULL END
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      cabinetName,
      locationId || null,
      lightType,
      manufacturer || null,
      model || null,
      serialNumber || null,
      bulbType || null,
      numberOfBulbs || null,
      bulbMaxHours || null,
      calibrationDate || null,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error creating phototherapy cabinet', { error: error.message });

    if (error.code === '23505') {
      return res.status(409).json({ error: 'A cabinet with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to create cabinet' });
  }
});

/**
 * GET /api/phototherapy/alerts
 * Get active phototherapy alerts
 */
router.get('/alerts', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status = 'active', patient_id, alert_type } = req.query;

    let query = `
      SELECT
        pa.*,
        p.first_name || ' ' || p.last_name as patient_name,
        pc.id as course_id
      FROM phototherapy_alerts pa
      LEFT JOIN patients p ON pa.patient_id = p.id
      LEFT JOIN phototherapy_courses pc ON pa.course_id = pc.id
      WHERE pa.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND pa.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (patient_id) {
      query += ` AND pa.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (alert_type) {
      query += ` AND pa.alert_type = $${paramIndex}`;
      params.push(alert_type);
      paramIndex++;
    }

    query += ` ORDER BY pa.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({ alerts: result.rows });
  } catch (error: any) {
    logger.error('Error fetching phototherapy alerts', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * PUT /api/phototherapy/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.put('/alerts/:id/acknowledge', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const query = `
      UPDATE phototherapy_alerts
      SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = now()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [userId, id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error acknowledging alert', { error: error.message, alertId: req.params.id });
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

/**
 * PUT /api/phototherapy/alerts/:id/resolve
 * Resolve an alert
 */
router.put('/alerts/:id/resolve', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const query = `
      UPDATE phototherapy_alerts
      SET status = 'resolved', resolved_by = $1, resolved_at = now(), resolution_notes = $2
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;

    const result = await pool.query(query, [userId, resolutionNotes || null, id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error resolving alert', { error: error.message, alertId: req.params.id });
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

export const phototherapyRouter = router;
