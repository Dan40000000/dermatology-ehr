import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { auditLog } from "../services/audit";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

export const diseaseRegistryRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logDiseaseRegistryError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

diseaseRegistryRouter.use(requireAuth, requireModuleAccess("registry"));

// GET /api/disease-registry/dashboard - Get registry dashboard metrics
diseaseRegistryRouter.get("/dashboard", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    // Get counts by registry type from the same disease tables the tabs use.
    const registryCounts = await pool.query(
      `SELECT registry_type, name, patient_count
       FROM (
         SELECT 'melanoma'::text AS registry_type, 'Melanoma'::text AS name, COUNT(*)::int AS patient_count
         FROM melanoma_registry
         WHERE tenant_id = $1

         UNION ALL

         SELECT 'psoriasis'::text AS registry_type, 'Psoriasis'::text AS name, COUNT(*)::int AS patient_count
         FROM psoriasis_registry
         WHERE tenant_id = $1

         UNION ALL

         SELECT 'acne'::text AS registry_type, 'Acne / Isotretinoin'::text AS name, COUNT(*)::int AS patient_count
         FROM acne_registry
         WHERE tenant_id = $1 AND on_isotretinoin = true

         UNION ALL

         SELECT 'chronic_therapy'::text AS registry_type, 'Chronic Therapy'::text AS name, COUNT(*)::int AS patient_count
         FROM chronic_therapy_registry
         WHERE tenant_id = $1
       ) registry_counts
       ORDER BY CASE registry_type
         WHEN 'melanoma' THEN 1
         WHEN 'psoriasis' THEN 2
         WHEN 'acne' THEN 3
         WHEN 'chronic_therapy' THEN 4
         ELSE 99
       END`,
      [tenantId]
    );

    const dashboardSummary = await pool.query(
      `WITH melanoma_summary AS (
         SELECT
           COUNT(*)::int AS total_patients,
           COUNT(*) FILTER (
             WHERE next_scheduled_exam >= CURRENT_DATE
               AND next_scheduled_exam <= CURRENT_DATE + INTERVAL '7 days'
               AND recurrence_status = 'no_recurrence'
           )::int AS followups_due,
           COUNT(*) FILTER (
             WHERE next_scheduled_exam < CURRENT_DATE
               AND recurrence_status = 'no_recurrence'
           )::int AS overdue_followups,
           COUNT(*) FILTER (
             WHERE coalesce(initial_staging_documented, false) = false
               OR ajcc_stage IS NULL
           )::int AS unstaged_patients
         FROM melanoma_registry
         WHERE tenant_id = $1
       ),
       psoriasis_summary AS (
         SELECT
           COUNT(*)::int AS total_patients,
           COUNT(*) FILTER (
             WHERE coalesce(biologic_name, '') <> ''
           )::int AS biologic_patients,
           COUNT(*) FILTER (
             WHERE next_lab_due < CURRENT_DATE
           )::int AS labs_overdue,
           COUNT(*) FILTER (
             WHERE coalesce(baseline_pasi_documented, false) = false
           )::int AS missing_baseline_pasi,
           COUNT(*) FILTER (
             WHERE coalesce(current_pasi_score, 0) >= 10
           )::int AS moderate_to_severe
         FROM psoriasis_registry
         WHERE tenant_id = $1
       ),
       acne_summary AS (
         SELECT
           COUNT(*) FILTER (WHERE on_isotretinoin = true)::int AS total_patients,
           COUNT(*) FILTER (
             WHERE on_isotretinoin = true
               AND coalesce(ipledge_id, '') <> ''
           )::int AS ipledge_enrolled,
           COUNT(*) FILTER (
             WHERE on_isotretinoin = true
               AND pregnancy_category = 'can_get_pregnant'
               AND next_pregnancy_test_due <= CURRENT_DATE + INTERVAL '7 days'
           )::int AS pregnancy_tests_due,
           COUNT(*) FILTER (
             WHERE on_isotretinoin = true
               AND next_lab_due < CURRENT_DATE
           )::int AS labs_overdue
         FROM acne_registry
         WHERE tenant_id = $1
       ),
       chronic_summary AS (
         SELECT
           COUNT(*)::int AS total_patients,
           COUNT(*) FILTER (
             WHERE next_lab_due < CURRENT_DATE
           )::int AS labs_overdue,
           COUNT(*) FILTER (
             WHERE next_lab_due >= CURRENT_DATE
               AND next_lab_due <= CURRENT_DATE + INTERVAL '14 days'
           )::int AS labs_due_soon,
           COUNT(*) FILTER (
             WHERE medication_class ILIKE '%biologic%'
           )::int AS biologic_therapies
         FROM chronic_therapy_registry
         WHERE tenant_id = $1
       )
       SELECT
         melanoma_summary.total_patients AS melanoma_total_patients,
         melanoma_summary.followups_due AS melanoma_followups_due,
         melanoma_summary.overdue_followups AS melanoma_overdue_followups,
         melanoma_summary.unstaged_patients AS melanoma_unstaged_patients,
         psoriasis_summary.total_patients AS psoriasis_total_patients,
         psoriasis_summary.biologic_patients AS psoriasis_biologic_patients,
         psoriasis_summary.labs_overdue AS psoriasis_labs_overdue,
         psoriasis_summary.missing_baseline_pasi AS psoriasis_missing_baseline_pasi,
         psoriasis_summary.moderate_to_severe AS psoriasis_moderate_to_severe,
         acne_summary.total_patients AS acne_total_patients,
         acne_summary.ipledge_enrolled AS acne_ipledge_enrolled,
         acne_summary.pregnancy_tests_due AS acne_pregnancy_tests_due,
         acne_summary.labs_overdue AS acne_labs_overdue,
         chronic_summary.total_patients AS chronic_total_patients,
         chronic_summary.labs_overdue AS chronic_labs_overdue,
         chronic_summary.labs_due_soon AS chronic_labs_due_soon,
         chronic_summary.biologic_therapies AS chronic_biologic_therapies
       FROM melanoma_summary, psoriasis_summary, acne_summary, chronic_summary`,
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
        NULLIF((SELECT COUNT(*) FROM chronic_therapy_registry WHERE tenant_id = $1)::numeric, 0) * 100 as labs_compliance_rate,
        (SELECT COUNT(*)
         FROM acne_registry
         WHERE tenant_id = $1
           AND on_isotretinoin = true
           AND (pregnancy_category <> 'can_get_pregnant' OR next_pregnancy_test_due >= CURRENT_DATE)
           AND (next_lab_due IS NULL OR next_lab_due >= CURRENT_DATE)
        )::numeric /
        NULLIF((SELECT COUNT(*) FROM acne_registry WHERE tenant_id = $1 AND on_isotretinoin = true)::numeric, 0) * 100 as isotretinoin_monitoring_rate`,
      [tenantId]
    );

    const summary = dashboardSummary.rows[0] || {};
    const melanomaDue = parseInt(summary.melanoma_followups_due || "0", 10);
    const melanomaOverdue = parseInt(summary.melanoma_overdue_followups || "0", 10);
    const psoriasisLabsOverdue = parseInt(summary.psoriasis_labs_overdue || "0", 10);
    const acneLabsOverdue = parseInt(summary.acne_labs_overdue || "0", 10);
    const chronicLabsOverdue = parseInt(summary.chronic_labs_overdue || "0", 10);
    const pregnancyTestsDue = parseInt(summary.acne_pregnancy_tests_due || "0", 10);
    const labsOverdue = psoriasisLabsOverdue + acneLabsOverdue + chronicLabsOverdue;

    res.json({
      registryCounts: registryCounts.rows,
      alerts: {
        melanomaDue,
        melanomaOverdue,
        labsOverdue,
        pregnancyTestsDue,
        totalActionItems: melanomaDue + melanomaOverdue + labsOverdue + pregnancyTestsDue,
      },
      registrySummaries: {
        melanoma: {
          totalPatients: parseInt(summary.melanoma_total_patients || "0", 10),
          followupsDue: melanomaDue,
          overdueFollowups: melanomaOverdue,
          unstagedPatients: parseInt(summary.melanoma_unstaged_patients || "0", 10),
        },
        psoriasis: {
          totalPatients: parseInt(summary.psoriasis_total_patients || "0", 10),
          biologicPatients: parseInt(summary.psoriasis_biologic_patients || "0", 10),
          labsOverdue: psoriasisLabsOverdue,
          missingBaselinePasi: parseInt(summary.psoriasis_missing_baseline_pasi || "0", 10),
          moderateToSevere: parseInt(summary.psoriasis_moderate_to_severe || "0", 10),
        },
        acne: {
          totalPatients: parseInt(summary.acne_total_patients || "0", 10),
          ipledgeEnrolled: parseInt(summary.acne_ipledge_enrolled || "0", 10),
          pregnancyTestsDue,
          labsOverdue: acneLabsOverdue,
        },
        chronicTherapy: {
          totalPatients: parseInt(summary.chronic_total_patients || "0", 10),
          labsOverdue: chronicLabsOverdue,
          labsDueSoon: parseInt(summary.chronic_labs_due_soon || "0", 10),
          biologicTherapies: parseInt(summary.chronic_biologic_therapies || "0", 10),
        },
      },
      qualityMetrics: qualityMetrics.rows[0] || {},
    });
  } catch (err) {
    logDiseaseRegistryError("Error fetching registry dashboard:", err);
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
        p.phone,
        p.email,
        EXTRACT(YEAR FROM AGE(p.dob::date)) as age,
        recall.id as recall_id,
        recall.recall_status,
        recall.recall_due_date,
        recall.last_reminder_type,
        recall.last_reminder_sent_at,
        recall.last_reminder_delivery_status,
        recall.contact_attempts,
        recall.text_thread_id,
        recall.text_thread_status
       FROM melanoma_registry mr
       JOIN patients p ON p.id = mr.patient_id
       LEFT JOIN LATERAL (
         SELECT
           pr.id,
           pr.status as recall_status,
           COALESCE(pr.due_date, pr.recall_date) as recall_due_date,
           latest_log.reminder_type as last_reminder_type,
           latest_log.sent_at as last_reminder_sent_at,
           latest_log.delivery_status as last_reminder_delivery_status,
           (
             SELECT COUNT(*)::int
             FROM reminder_log rl_count
             WHERE rl_count.recall_id = pr.id
           ) as contact_attempts,
           latest_thread.id as text_thread_id,
           latest_thread.status as text_thread_status
         FROM patient_recalls pr
         LEFT JOIN recall_campaigns rc ON rc.id = pr.campaign_id AND rc.tenant_id = pr.tenant_id
         LEFT JOIN LATERAL (
           SELECT rl.reminder_type, rl.sent_at, rl.delivery_status
           FROM reminder_log rl
           WHERE rl.recall_id = pr.id
           ORDER BY rl.sent_at DESC
           LIMIT 1
         ) latest_log ON true
         LEFT JOIN LATERAL (
           SELECT t.id, t.status
           FROM patient_message_threads t
           WHERE t.patient_id = pr.patient_id
             AND t.tenant_id = pr.tenant_id
           ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
           LIMIT 1
         ) latest_thread ON true
         WHERE pr.patient_id = mr.patient_id
           AND pr.tenant_id = mr.tenant_id
           AND (
             COALESCE(pr.recall_type, '') ILIKE 'Melanoma Surveillance'
             OR COALESCE(rc.recall_type, '') ILIKE 'Melanoma Surveillance'
             OR COALESCE(rc.name, '') ILIKE 'Melanoma Surveillance'
           )
         ORDER BY COALESCE(pr.due_date, pr.recall_date) ASC NULLS LAST, pr.updated_at DESC
         LIMIT 1
       ) recall ON true
       WHERE mr.tenant_id = $1
       ORDER BY mr.next_scheduled_exam ASC NULLS LAST, mr.diagnosis_date DESC`,
      [tenantId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    logDiseaseRegistryError("Error fetching melanoma registry:", err);
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
    logDiseaseRegistryError("Error saving melanoma registry entry:", err);
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
    logDiseaseRegistryError("Error fetching psoriasis registry:", err);
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
    logDiseaseRegistryError("Error saving psoriasis registry entry:", err);
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
    logDiseaseRegistryError("Error fetching acne registry:", err);
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
    logDiseaseRegistryError("Error fetching chronic therapy registry:", err);
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
    logDiseaseRegistryError("Error saving chronic therapy registry entry:", err);
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
    logDiseaseRegistryError("Error fetching PASI history:", err);
    res.status(500).json({ error: "Failed to load PASI history" });
  }
});

// GET /api/disease-registry/alerts - Get all registry alerts
diseaseRegistryRouter.get("/alerts", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    // Melanoma follow-ups due or overdue
    const melanomaAlerts = await pool.query(
      `SELECT
        mr.id,
        mr.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        mr.next_scheduled_exam as due_date,
        mr.next_scheduled_exam,
        CASE
          WHEN mr.next_scheduled_exam < CURRENT_DATE THEN 'melanoma_followup_overdue'
          ELSE 'melanoma_followup_due'
        END as alert_type,
        CASE
          WHEN mr.next_scheduled_exam < CURRENT_DATE THEN 'Melanoma follow-up overdue'
          ELSE 'Melanoma follow-up due'
        END as alert_message
       FROM melanoma_registry mr
       JOIN patients p ON p.id = mr.patient_id
       WHERE mr.tenant_id = $1
         AND mr.next_scheduled_exam <= CURRENT_DATE + INTERVAL '7 days'
         AND mr.recurrence_status = 'no_recurrence'
       ORDER BY mr.next_scheduled_exam`,
      [tenantId]
    );

    const psoriasisLabsOverdue = await pool.query(
      `SELECT
        pr.id,
        pr.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.biologic_name as medication_name,
        pr.next_lab_due as due_date,
        pr.next_lab_due,
        'psoriasis_labs_overdue' as alert_type,
        'Psoriasis monitoring labs overdue' as alert_message
       FROM psoriasis_registry pr
       JOIN patients p ON p.id = pr.patient_id
       WHERE pr.tenant_id = $1
         AND pr.next_lab_due < CURRENT_DATE
       ORDER BY pr.next_lab_due`,
      [tenantId]
    );

    const chronicLabsOverdue = await pool.query(
      `SELECT
        ct.id,
        ct.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        ct.medication_name,
        ct.next_lab_due as due_date,
        ct.next_lab_due,
        'chronic_therapy_labs_overdue' as alert_type,
        'Labs overdue for ' || ct.medication_name as alert_message
       FROM chronic_therapy_registry ct
       JOIN patients p ON p.id = ct.patient_id
       WHERE ct.tenant_id = $1 AND ct.next_lab_due < CURRENT_DATE
       ORDER BY ct.next_lab_due`,
      [tenantId]
    );

    const acneLabsOverdue = await pool.query(
      `SELECT
        ar.id,
        ar.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        'Isotretinoin'::text as medication_name,
        ar.next_lab_due as due_date,
        ar.next_lab_due,
        'isotretinoin_labs_overdue' as alert_type,
        'Isotretinoin monitoring labs overdue' as alert_message
       FROM acne_registry ar
       JOIN patients p ON p.id = ar.patient_id
       WHERE ar.tenant_id = $1
         AND ar.on_isotretinoin = true
         AND ar.next_lab_due < CURRENT_DATE
       ORDER BY ar.next_lab_due`,
      [tenantId]
    );

    // Pregnancy tests due
    const pregnancyTestsDue = await pool.query(
      `SELECT
        ar.id,
        ar.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        ar.next_pregnancy_test_due as due_date,
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

    const alerts = [
      ...melanomaAlerts.rows,
      ...psoriasisLabsOverdue.rows,
      ...chronicLabsOverdue.rows,
      ...acneLabsOverdue.rows,
      ...pregnancyTestsDue.rows,
    ].sort((a: any, b: any) => {
      const aTime = a?.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b?.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

    res.json({
      alerts,
    });
  } catch (err) {
    logDiseaseRegistryError("Error fetching registry alerts:", err);
    res.status(500).json({ error: "Failed to load registry alerts" });
  }
});
