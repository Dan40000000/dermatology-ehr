import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { auditLog } from "../services/audit";
import { randomUUID } from "crypto";

export const diseaseRegistryRouter = Router();

diseaseRegistryRouter.use(requireAuth, requireModuleAccess("registry"));

// GET /api/disease-registry/dashboard - Get registry dashboard metrics
diseaseRegistryRouter.get("/dashboard", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    // Get counts by registry type
    const registryCounts = await pool.query(
      `SELECT
        rc.registry_type,
        rc.name,
        COUNT(DISTINCT rm.patient_id) as patient_count
       FROM registry_cohorts rc
       LEFT JOIN registry_members rm ON rm.registry_id = rc.id AND rm.status = 'active'
       WHERE rc.tenant_id = $1 AND rc.status = 'active' AND rc.registry_type IS NOT NULL
       GROUP BY rc.registry_type, rc.name
       ORDER BY rc.name`,
      [tenantId]
    );

    // Get patients due for follow-up (melanoma)
    const melanomaDue = await pool.query(
      `SELECT COUNT(*) as count
       FROM melanoma_registry
       WHERE tenant_id = $1
         AND next_scheduled_exam <= CURRENT_DATE + INTERVAL '7 days'
         AND next_scheduled_exam >= CURRENT_DATE
         AND recurrence_status = 'no_recurrence'`,
      [tenantId]
    );

    // Get patients overdue for labs
    const labsOverdue = await pool.query(
      `SELECT COUNT(*) as count
       FROM chronic_therapy_registry
       WHERE tenant_id = $1 AND next_lab_due < CURRENT_DATE`,
      [tenantId]
    );

    // Get isotretinoin patients needing pregnancy tests
    const pregnancyTestsDue = await pool.query(
      `SELECT COUNT(*) as count
       FROM acne_registry
       WHERE tenant_id = $1
         AND on_isotretinoin = true
         AND pregnancy_category = 'can_get_pregnant'
         AND next_pregnancy_test_due <= CURRENT_DATE + INTERVAL '7 days'`,
      [tenantId]
    );

    // Get quality metrics
    const qualityMetrics = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM melanoma_registry WHERE tenant_id = $1 AND initial_staging_documented = true)::numeric /
        NULLIF((SELECT COUNT(*) FROM melanoma_registry WHERE tenant_id = $1)::numeric, 0) * 100 as melanoma_staging_rate,
        (SELECT COUNT(*) FROM psoriasis_registry WHERE tenant_id = $1 AND baseline_pasi_documented = true)::numeric /
        NULLIF((SELECT COUNT(*) FROM psoriasis_registry WHERE tenant_id = $1)::numeric, 0) * 100 as psoriasis_pasi_rate,
        (SELECT COUNT(*) FROM chronic_therapy_registry WHERE tenant_id = $1 AND labs_up_to_date = true)::numeric /
        NULLIF((SELECT COUNT(*) FROM chronic_therapy_registry WHERE tenant_id = $1)::numeric, 0) * 100 as labs_compliance_rate`,
      [tenantId]
    );

    res.json({
      registryCounts: registryCounts.rows,
      alerts: {
        melanomaDue: parseInt(melanomaDue.rows[0]?.count || "0"),
        labsOverdue: parseInt(labsOverdue.rows[0]?.count || "0"),
        pregnancyTestsDue: parseInt(pregnancyTestsDue.rows[0]?.count || "0"),
      },
      qualityMetrics: qualityMetrics.rows[0] || {},
    });
  } catch (err) {
    console.error("Error fetching registry dashboard:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// GET /api/disease-registry/melanoma - List melanoma registry patients
diseaseRegistryRouter.get("/melanoma", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT
        mr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob,
        EXTRACT(YEAR FROM AGE(p.dob::date)) as age
       FROM melanoma_registry mr
       JOIN patients p ON p.id = mr.patient_id
       WHERE mr.tenant_id = $1
       ORDER BY mr.next_scheduled_exam ASC NULLS LAST, mr.diagnosis_date DESC`,
      [tenantId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error("Error fetching melanoma registry:", err);
    res.status(500).json({ error: "Failed to load melanoma registry" });
  }
});

// POST /api/disease-registry/melanoma - Add/update melanoma registry entry
const melanomaSchema = z.object({
  patientId: z.string(),
  diagnosisDate: z.string().optional(),
  initialBiopsyDate: z.string().optional(),
  primarySite: z.string().optional(),
  breslowDepthMm: z.number().optional(),
  clarkLevel: z.string().optional(),
  ulceration: z.boolean().optional(),
  mitoticRate: z.number().optional(),
  ajccStage: z.string().optional(),
  sentinelNodeBiopsyPerformed: z.boolean().optional(),
  sentinelNodeStatus: z.string().optional(),
  brafMutationStatus: z.string().optional(),
  surveillanceSchedule: z.string().optional(),
  nextScheduledExam: z.string().optional(),
  recurrenceStatus: z.string().optional(),
  notes: z.string().optional(),
});

diseaseRegistryRouter.post("/melanoma", async (req: AuthedRequest, res) => {
  const parsed = melanomaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const data = parsed.data;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = randomUUID();

  try {
    // Check if entry exists
    const existing = await pool.query(
      `SELECT id FROM melanoma_registry WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, data.patientId]
    );

    if (existing.rows.length > 0) {
      // Update existing
      const updates: string[] = [];
      const values: any[] = [];
      let index = 1;

      if (data.diagnosisDate !== undefined) {
        updates.push(`diagnosis_date = $${index++}`);
        values.push(data.diagnosisDate);
      }
      if (data.breslowDepthMm !== undefined) {
        updates.push(`breslow_depth_mm = $${index++}`);
        values.push(data.breslowDepthMm);
      }
      if (data.ajccStage !== undefined) {
        updates.push(`ajcc_stage = $${index++}`, `initial_staging_documented = true`);
        values.push(data.ajccStage);
      }
      if (data.surveillanceSchedule !== undefined) {
        updates.push(`surveillance_schedule = $${index++}`);
        values.push(data.surveillanceSchedule);
      }
      if (data.nextScheduledExam !== undefined) {
        updates.push(`next_scheduled_exam = $${index++}`);
        values.push(data.nextScheduledExam);
      }
      if (data.notes !== undefined) {
        updates.push(`notes = $${index++}`);
        values.push(data.notes);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = now()`);
        values.push(existing.rows[0].id, tenantId);

        await pool.query(
          `UPDATE melanoma_registry SET ${updates.join(", ")}
           WHERE id = $${index++} AND tenant_id = $${index}`,
          values
        );
      }

      res.json({ id: existing.rows[0].id, updated: true });
    } else {
      // Insert new
      await pool.query(
        `INSERT INTO melanoma_registry (
          id, tenant_id, patient_id, diagnosis_date, initial_biopsy_date,
          primary_site, breslow_depth_mm, clark_level, ulceration, mitotic_rate,
          ajcc_stage, sentinel_node_biopsy_performed, sentinel_node_status,
          braf_mutation_status, surveillance_schedule, next_scheduled_exam,
          recurrence_status, initial_staging_documented, notes, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now(), now())`,
        [
          id,
          tenantId,
          data.patientId,
          data.diagnosisDate || null,
          data.initialBiopsyDate || null,
          data.primarySite || null,
          data.breslowDepthMm || null,
          data.clarkLevel || null,
          data.ulceration || null,
          data.mitoticRate || null,
          data.ajccStage || null,
          data.sentinelNodeBiopsyPerformed || null,
          data.sentinelNodeStatus || null,
          data.brafMutationStatus || null,
          data.surveillanceSchedule || null,
          data.nextScheduledExam || null,
          data.recurrenceStatus || "no_recurrence",
          data.ajccStage ? true : false,
          data.notes || null,
          userId,
        ]
      );

      await auditLog(tenantId, userId, "melanoma_registry_create", "melanoma_registry", id);
      res.status(201).json({ id, created: true });
    }
  } catch (err) {
    console.error("Error saving melanoma registry entry:", err);
    res.status(500).json({ error: "Failed to save melanoma registry entry" });
  }
});

// GET /api/disease-registry/psoriasis - List psoriasis registry patients
diseaseRegistryRouter.get("/psoriasis", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT
        pr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob
       FROM psoriasis_registry pr
       JOIN patients p ON p.id = pr.patient_id
       WHERE pr.tenant_id = $1
       ORDER BY pr.current_pasi_score DESC NULLS LAST, pr.diagnosis_date DESC`,
      [tenantId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error("Error fetching psoriasis registry:", err);
    res.status(500).json({ error: "Failed to load psoriasis registry" });
  }
});

// POST /api/disease-registry/psoriasis - Add/update psoriasis registry entry
const psoriasisSchema = z.object({
  patientId: z.string(),
  diagnosisDate: z.string().optional(),
  psoriasisType: z.string().optional(),
  currentPasiScore: z.number().optional(),
  currentBsaPercent: z.number().optional(),
  currentDlqiScore: z.number().optional(),
  currentTreatmentType: z.string().optional(),
  biologicName: z.string().optional(),
  nextLabDue: z.string().optional(),
  notes: z.string().optional(),
});

diseaseRegistryRouter.post("/psoriasis", async (req: AuthedRequest, res) => {
  const parsed = psoriasisSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const data = parsed.data;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = randomUUID();

  try {
    const existing = await pool.query(
      `SELECT id FROM psoriasis_registry WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, data.patientId]
    );

    if (existing.rows.length > 0) {
      // Update existing
      const updates: string[] = [];
      const values: any[] = [];
      let index = 1;

      if (data.currentPasiScore !== undefined) {
        updates.push(`current_pasi_score = $${index++}`, `baseline_pasi_documented = true`);
        values.push(data.currentPasiScore);
      }
      if (data.currentBsaPercent !== undefined) {
        updates.push(`current_bsa_percent = $${index++}`);
        values.push(data.currentBsaPercent);
      }
      if (data.currentTreatmentType !== undefined) {
        updates.push(`current_treatment_type = $${index++}`);
        values.push(data.currentTreatmentType);
      }
      if (data.biologicName !== undefined) {
        updates.push(`biologic_name = $${index++}`);
        values.push(data.biologicName);
      }
      if (data.nextLabDue !== undefined) {
        updates.push(`next_lab_due = $${index++}`);
        values.push(data.nextLabDue);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = now()`);
        values.push(existing.rows[0].id, tenantId);

        await pool.query(
          `UPDATE psoriasis_registry SET ${updates.join(", ")}
           WHERE id = $${index++} AND tenant_id = $${index}`,
          values
        );
      }

      // Record PASI score history if provided
      if (data.currentPasiScore !== undefined) {
        await pool.query(
          `INSERT INTO pasi_score_history (
            id, tenant_id, patient_id, psoriasis_registry_id,
            assessment_date, pasi_score, bsa_percent, dlqi_score,
            assessed_by, created_at
          ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8, now())
          ON CONFLICT (tenant_id, patient_id, assessment_date) DO UPDATE
          SET pasi_score = $5, bsa_percent = $6, dlqi_score = $7`,
          [
            randomUUID(),
            tenantId,
            data.patientId,
            existing.rows[0].id,
            data.currentPasiScore,
            data.currentBsaPercent || null,
            data.currentDlqiScore || null,
            userId,
          ]
        );
      }

      res.json({ id: existing.rows[0].id, updated: true });
    } else {
      // Insert new
      await pool.query(
        `INSERT INTO psoriasis_registry (
          id, tenant_id, patient_id, diagnosis_date, psoriasis_type,
          current_pasi_score, current_bsa_percent, current_dlqi_score,
          current_treatment_type, biologic_name, next_lab_due,
          baseline_pasi_documented, notes, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())`,
        [
          id,
          tenantId,
          data.patientId,
          data.diagnosisDate || null,
          data.psoriasisType || null,
          data.currentPasiScore || null,
          data.currentBsaPercent || null,
          data.currentDlqiScore || null,
          data.currentTreatmentType || null,
          data.biologicName || null,
          data.nextLabDue || null,
          data.currentPasiScore ? true : false,
          data.notes || null,
          userId,
        ]
      );

      await auditLog(tenantId, userId, "psoriasis_registry_create", "psoriasis_registry", id);
      res.status(201).json({ id, created: true });
    }
  } catch (err) {
    console.error("Error saving psoriasis registry entry:", err);
    res.status(500).json({ error: "Failed to save psoriasis registry entry" });
  }
});

// GET /api/disease-registry/acne - List acne/isotretinoin registry patients
diseaseRegistryRouter.get("/acne", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { onIsotretinoin } = req.query;

  try {
    let query = `
      SELECT
        ar.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob,
        p.sex
       FROM acne_registry ar
       JOIN patients p ON p.id = ar.patient_id
       WHERE ar.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (onIsotretinoin === "true") {
      query += ` AND ar.on_isotretinoin = true`;
    }

    query += ` ORDER BY ar.next_pregnancy_test_due ASC NULLS LAST, ar.next_lab_due ASC`;

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error("Error fetching acne registry:", err);
    res.status(500).json({ error: "Failed to load acne registry" });
  }
});

// GET /api/disease-registry/chronic-therapy - List chronic therapy patients
diseaseRegistryRouter.get("/chronic-therapy", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT
        ct.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob
       FROM chronic_therapy_registry ct
       JOIN patients p ON p.id = ct.patient_id
       WHERE ct.tenant_id = $1
       ORDER BY ct.next_lab_due ASC NULLS LAST`,
      [tenantId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error("Error fetching chronic therapy registry:", err);
    res.status(500).json({ error: "Failed to load chronic therapy registry" });
  }
});

// POST /api/disease-registry/chronic-therapy - Add chronic therapy entry
const chronicTherapySchema = z.object({
  patientId: z.string(),
  primaryDiagnosis: z.string(),
  medicationName: z.string(),
  medicationClass: z.string(),
  startDate: z.string(),
  currentDose: z.string().optional(),
  labFrequency: z.string().optional(),
  nextLabDue: z.string().optional(),
  notes: z.string().optional(),
});

diseaseRegistryRouter.post("/chronic-therapy", async (req: AuthedRequest, res) => {
  const parsed = chronicTherapySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const data = parsed.data;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = randomUUID();

  try {
    await pool.query(
      `INSERT INTO chronic_therapy_registry (
        id, tenant_id, patient_id, primary_diagnosis, medication_name,
        medication_class, start_date, current_dose, lab_frequency,
        next_lab_due, notes, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
      [
        id,
        tenantId,
        data.patientId,
        data.primaryDiagnosis,
        data.medicationName,
        data.medicationClass,
        data.startDate,
        data.currentDose || null,
        data.labFrequency || null,
        data.nextLabDue || null,
        data.notes || null,
        userId,
      ]
    );

    await auditLog(tenantId, userId, "chronic_therapy_registry_create", "chronic_therapy_registry", id);
    res.status(201).json({ id, created: true });
  } catch (err) {
    console.error("Error saving chronic therapy registry entry:", err);
    res.status(500).json({ error: "Failed to save chronic therapy registry entry" });
  }
});

// GET /api/disease-registry/pasi-history/:patientId - Get PASI score history
diseaseRegistryRouter.get("/pasi-history/:patientId", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM pasi_score_history
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY assessment_date DESC
       LIMIT 20`,
      [tenantId, patientId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error("Error fetching PASI history:", err);
    res.status(500).json({ error: "Failed to load PASI history" });
  }
});

// GET /api/disease-registry/alerts - Get all registry alerts
diseaseRegistryRouter.get("/alerts", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    // Melanoma follow-ups due
    const melanomaDue = await pool.query(
      `SELECT
        mr.id,
        mr.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        mr.next_scheduled_exam,
        'melanoma_followup' as alert_type,
        'Melanoma follow-up due' as alert_message
       FROM melanoma_registry mr
       JOIN patients p ON p.id = mr.patient_id
       WHERE mr.tenant_id = $1
         AND mr.next_scheduled_exam <= CURRENT_DATE + INTERVAL '7 days'
         AND mr.next_scheduled_exam >= CURRENT_DATE
         AND mr.recurrence_status = 'no_recurrence'
       ORDER BY mr.next_scheduled_exam`,
      [tenantId]
    );

    // Labs overdue
    const labsOverdue = await pool.query(
      `SELECT
        ct.id,
        ct.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        ct.medication_name,
        ct.next_lab_due,
        'labs_overdue' as alert_type,
        'Labs overdue for ' || ct.medication_name as alert_message
       FROM chronic_therapy_registry ct
       JOIN patients p ON p.id = ct.patient_id
       WHERE ct.tenant_id = $1 AND ct.next_lab_due < CURRENT_DATE
       ORDER BY ct.next_lab_due`,
      [tenantId]
    );

    // Pregnancy tests due
    const pregnancyTestsDue = await pool.query(
      `SELECT
        ar.id,
        ar.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        ar.next_pregnancy_test_due,
        'pregnancy_test_due' as alert_type,
        'iPLEDGE pregnancy test due' as alert_message
       FROM acne_registry ar
       JOIN patients p ON p.id = ar.patient_id
       WHERE ar.tenant_id = $1
         AND ar.on_isotretinoin = true
         AND ar.pregnancy_category = 'can_get_pregnant'
         AND ar.next_pregnancy_test_due <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY ar.next_pregnancy_test_due`,
      [tenantId]
    );

    res.json({
      alerts: [
        ...melanomaDue.rows,
        ...labsOverdue.rows,
        ...pregnancyTestsDue.rows,
      ],
    });
  } catch (err) {
    console.error("Error fetching registry alerts:", err);
    res.status(500).json({ error: "Failed to load registry alerts" });
  }
});
