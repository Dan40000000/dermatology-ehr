import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { recordEncounterLearning } from "../services/learningService";
import { encounterService } from "../services/encounterService";
import { billingService } from "../services/billingService";
import { workflowOrchestrator } from "../services/workflowOrchestrator";
import {
  emitEncounterCreated,
  emitEncounterUpdated,
  emitEncounterCompleted,
  emitEncounterSigned,
} from "../websocket/emitter";
import { logger } from "../lib/logger";

const encounterSchema = z.object({
  patientId: z.string(),
  providerId: z.string(),
  appointmentId: z.string().optional(),
  chiefComplaint: z.string().optional(),
  hpi: z.string().optional(),
  ros: z.string().optional(),
  exam: z.string().optional(),
  assessmentPlan: z.string().optional(),
});

const encounterUpdateSchema = z.object({
  chiefComplaint: z.string().optional(),
  hpi: z.string().optional(),
  ros: z.string().optional(),
  exam: z.string().optional(),
  assessmentPlan: z.string().optional(),
});

export const encountersRouter = Router();

/**
 * @swagger
 * /api/encounters:
 *   get:
 *     summary: List encounters
 *     description: Retrieve encounters for the current tenant (limited to 50, ordered by creation date).
 *     tags:
 *       - Encounters
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: List of encounters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 encounters:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       patientId:
 *                         type: string
 *                         format: uuid
 *                       providerId:
 *                         type: string
 *                         format: uuid
 *                       appointmentId:
 *                         type: string
 *                         format: uuid
 *                       status:
 *                         type: string
 *                       chiefComplaint:
 *                         type: string
 *                       hpi:
 *                         type: string
 *                       ros:
 *                         type: string
 *                       exam:
 *                         type: string
 *                       assessmentPlan:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 */
encountersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `SELECT e.id, e.patient_id as "patientId", e.provider_id as "providerId", e.appointment_id as "appointmentId",
            e.status, e.chief_complaint as "chiefComplaint", e.hpi, e.ros, e.exam, e.assessment_plan as "assessmentPlan",
            e.created_at as "createdAt", e.updated_at as "updatedAt",
            p.first_name || ' ' || p.last_name as "patientName",
            pr.full_name as "providerName"
     FROM encounters e
     LEFT JOIN patients p ON p.id = e.patient_id
     LEFT JOIN providers pr ON pr.id = e.provider_id
     WHERE e.tenant_id = $1
     ORDER BY e.created_at DESC
     LIMIT 500`,
    [tenantId],
  );
  res.json({ encounters: result.rows });
});

/**
 * @swagger
 * /api/encounters:
 *   post:
 *     summary: Create an encounter
 *     description: Create a new encounter (clinical visit documentation). Requires provider, ma, or admin role.
 *     tags:
 *       - Encounters
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - providerId
 *             properties:
 *               patientId:
 *                 type: string
 *               providerId:
 *                 type: string
 *               appointmentId:
 *                 type: string
 *               chiefComplaint:
 *                 type: string
 *               hpi:
 *                 type: string
 *               ros:
 *                 type: string
 *               exam:
 *                 type: string
 *               assessmentPlan:
 *                 type: string
 *     responses:
 *       201:
 *         description: Encounter created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
encountersRouter.post("/", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = encounterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  await pool.query(
    `insert into encounters(id, tenant_id, appointment_id, patient_id, provider_id, status, chief_complaint, hpi, ros, exam, assessment_plan)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      tenantId,
      payload.appointmentId || null,
      payload.patientId,
      payload.providerId,
      "draft",
      payload.chiefComplaint || null,
      payload.hpi || null,
      payload.ros || null,
      payload.exam || null,
      payload.assessmentPlan || null,
    ],
  );
  await auditLog(tenantId, req.user!.id, "encounter_create", "encounter", id);

  // Emit WebSocket event for encounter creation
  try {
    const encounterData = await pool.query(
      `SELECT e.id, e.patient_id, e.provider_id, e.appointment_id, e.status,
              e.chief_complaint, e.created_at, e.updated_at,
              p.first_name || ' ' || p.last_name as patient_name,
              pr.full_name as provider_name
       FROM encounters e
       JOIN patients p ON p.id = e.patient_id
       JOIN providers pr ON pr.id = e.provider_id
       WHERE e.id = $1`,
      [id]
    );

    if (encounterData.rows.length > 0) {
      const enc = encounterData.rows[0];
      emitEncounterCreated(tenantId, {
        id: enc.id,
        patientId: enc.patient_id,
        patientName: enc.patient_name,
        providerId: enc.provider_id,
        providerName: enc.provider_name,
        appointmentId: enc.appointment_id,
        status: enc.status,
        chiefComplaint: enc.chief_complaint,
        createdAt: enc.created_at,
        updatedAt: enc.updated_at,
      });
    }
  } catch (error: any) {
    logger.error("Failed to emit encounter created event", {
      error: error.message,
      encounterId: id,
    });
  }

  res.status(201).json({ id });
});

const statusSchema = z.object({ status: z.string() });

encountersRouter.post("/:id", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = encounterUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);
  const statusCheck = await pool.query(`select status from encounters where id = $1 and tenant_id = $2`, [encId, tenantId]);
  if (!statusCheck.rowCount) return res.status(404).json({ error: "Not found" });
  if (statusCheck.rows[0].status === "locked") return res.status(409).json({ error: "Encounter is locked" });
  await pool.query(
    `update encounters
     set chief_complaint = coalesce($1, chief_complaint),
         hpi = coalesce($2, hpi),
         ros = coalesce($3, ros),
         exam = coalesce($4, exam),
         assessment_plan = coalesce($5, assessment_plan),
         updated_at = now()
     where id = $6 and tenant_id = $7`,
    [parsed.data.chiefComplaint, parsed.data.hpi, parsed.data.ros, parsed.data.exam, parsed.data.assessmentPlan, encId, tenantId],
  );
  await auditLog(tenantId, req.user!.id, "encounter_update", "encounter", encId);
  res.json({ ok: true });
});

encountersRouter.post("/:id/status", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);
  const newStatus = parsed.data.status;

  await pool.query(`update encounters set status = $1, updated_at = now() where id = $2 and tenant_id = $3`, [
    newStatus,
    encId,
    tenantId,
  ]);
  await pool.query(
    `insert into audit_log(id, tenant_id, actor_id, action, entity, entity_id)
     values ($1,$2,$3,$4,$5,$6)`,
    [crypto.randomUUID(), tenantId, req.user!.id, `encounter_status_${newStatus}`, "encounter", encId],
  );
  await auditLog(tenantId, req.user!.id, `encounter_status_${newStatus}`, "encounter", encId);

  // Trigger adaptive learning when encounter is finalized/locked
  if (newStatus === "locked" || newStatus === "finalized") {
    try {
      await recordEncounterLearning(encId);
    } catch (error) {
      // Log error but don't fail the request
      console.error("Error recording encounter learning:", error);
    }
  }

  // CRITICAL: Trigger workflow orchestrator for signed/locked encounters
  // This auto-creates claims and runs the billing workflow
  if (newStatus === "signed" || newStatus === "locked" || newStatus === "finalized") {
    try {
      await workflowOrchestrator.processEvent({
        type: newStatus === "signed" ? "encounter_signed" : "encounter_locked",
        tenantId,
        userId: req.user!.id,
        entityType: "encounter",
        entityId: encId,
        data: {},
        timestamp: new Date(),
      });
      logger.info("Workflow orchestrator triggered for encounter sign", { encounterId: encId, status: newStatus });
    } catch (error: any) {
      // Log error but don't fail the request - workflow should be resilient
      logger.error("Error triggering workflow for encounter sign", { encounterId: encId, error: error.message });
    }
  }

  res.json({ ok: true });
});

encountersRouter.get("/:id/superbill", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);

  // Fetch encounter with patient and provider info
  const encounterResult = await pool.query(
    `select
      e.id, e.created_at as "dateOfService",
      p.id as "patientId", p.first_name as "patientFirstName", p.last_name as "patientLastName",
      p.dob, p.address as "patientAddress", p.city as "patientCity", p.state as "patientState", p.zip as "patientZip",
      p.insurance_plan_name as "insurancePlanName", p.insurance_member_id as "insuranceMemberId",
      p.insurance_group_number as "insuranceGroupNumber",
      pr.full_name as "providerName", pr.npi as "providerNpi",
      t.practice_name as "practiceName", t.practice_address as "practiceAddress",
      t.practice_city as "practiceCity", t.practice_state as "practiceState", t.practice_zip as "practiceZip",
      t.practice_phone as "practicePhone", t.practice_npi as "practiceNpi", t.practice_tax_id as "practiceTaxId"
    from encounters e
    join patients p on p.id = e.patient_id
    join providers pr on pr.id = e.provider_id
    join tenants t on t.id = e.tenant_id
    where e.id = $1 and e.tenant_id = $2`,
    [encId, tenantId],
  );

  if (!encounterResult.rowCount) {
    return res.status(404).json({ error: "Encounter not found" });
  }

  const encounter = encounterResult.rows[0];

  // Fetch diagnoses
  const diagnosesResult = await pool.query(
    `select id, icd10_code as "icd10Code", description, is_primary as "isPrimary"
     from encounter_diagnoses
     where encounter_id = $1 and tenant_id = $2
     order by is_primary desc, created_at`,
    [encId, tenantId],
  );

  // Fetch charges/procedures
  const chargesResult = await pool.query(
    `select id, cpt_code as "cptCode", description, quantity, fee_cents as "feeCents",
            linked_diagnosis_ids as "linkedDiagnosisIds"
     from charges
     where encounter_id = $1 and tenant_id = $2
     order by created_at`,
    [encId, tenantId],
  );

  const diagnoses = diagnosesResult.rows;
  const charges = chargesResult.rows;
  const totalCharges = charges.reduce((sum, c) => sum + (c.feeCents || 0) * (c.quantity || 1), 0);

  // Generate HTML superbill
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Superbill - ${encounter.patientLastName}, ${encounter.patientFirstName}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      margin: 0;
      padding: 20px;
    }
    .superbill {
      max-width: 8.5in;
      margin: 0 auto;
      border: 2px solid #000;
      padding: 15px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .header h1 {
      margin: 0 0 5px 0;
      font-size: 18pt;
      color: #6B46C1;
    }
    .section {
      margin-bottom: 15px;
    }
    .section-title {
      font-weight: bold;
      background-color: #6B46C1;
      color: white;
      padding: 5px;
      margin-bottom: 5px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .field {
      margin-bottom: 5px;
    }
    .label {
      font-weight: bold;
      display: inline-block;
      width: 140px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 5px;
    }
    th, td {
      border: 1px solid #000;
      padding: 5px;
      text-align: left;
    }
    th {
      background-color: #F3F4F6;
      font-weight: bold;
    }
    .total-row {
      font-weight: bold;
      background-color: #F9FAFB;
    }
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #000;
      font-size: 9pt;
      text-align: center;
    }
    @media print {
      body { margin: 0; padding: 10px; }
      .superbill { border: none; }
    }
  </style>
</head>
<body>
  <div class="superbill">
    <div class="header">
      <h1>SUPERBILL</h1>
      <div>${encounter.practiceName || 'Medical Practice'}</div>
      <div>${encounter.practiceAddress || ''}, ${encounter.practiceCity || ''}, ${encounter.practiceState || ''} ${encounter.practiceZip || ''}</div>
      <div>Phone: ${encounter.practicePhone || ''}</div>
    </div>

    <div class="section">
      <div class="section-title">Practice Information</div>
      <div class="grid">
        <div class="field"><span class="label">NPI:</span> ${encounter.practiceNpi || ''}</div>
        <div class="field"><span class="label">Tax ID:</span> ${encounter.practiceTaxId || ''}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Patient Information</div>
      <div class="grid">
        <div class="field"><span class="label">Name:</span> ${encounter.patientLastName}, ${encounter.patientFirstName}</div>
        <div class="field"><span class="label">DOB:</span> ${encounter.dob ? new Date(encounter.dob).toLocaleDateString() : ''}</div>
        <div class="field"><span class="label">Address:</span> ${encounter.patientAddress || ''}</div>
        <div class="field"><span class="label">City/State/Zip:</span> ${encounter.patientCity || ''}, ${encounter.patientState || ''} ${encounter.patientZip || ''}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Insurance Information</div>
      <div class="grid">
        <div class="field"><span class="label">Plan Name:</span> ${encounter.insurancePlanName || 'Self-Pay'}</div>
        <div class="field"><span class="label">Member ID:</span> ${encounter.insuranceMemberId || ''}</div>
        <div class="field"><span class="label">Group Number:</span> ${encounter.insuranceGroupNumber || ''}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Provider Information</div>
      <div class="grid">
        <div class="field"><span class="label">Provider:</span> ${encounter.providerName}</div>
        <div class="field"><span class="label">NPI:</span> ${encounter.providerNpi || ''}</div>
        <div class="field"><span class="label">Date of Service:</span> ${new Date(encounter.dateOfService).toLocaleDateString()}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Diagnoses</div>
      <table>
        <thead>
          <tr>
            <th style="width: 30px">#</th>
            <th style="width: 100px">ICD-10 Code</th>
            <th>Description</th>
            <th style="width: 60px">Primary</th>
          </tr>
        </thead>
        <tbody>
          ${diagnoses.map((dx, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${dx.icd10Code}</td>
              <td>${dx.description}</td>
              <td>${dx.isPrimary ? 'Yes' : ''}</td>
            </tr>
          `).join('')}
          ${diagnoses.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: #999;">No diagnoses recorded</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Procedures</div>
      <table>
        <thead>
          <tr>
            <th style="width: 100px">CPT Code</th>
            <th>Description</th>
            <th style="width: 80px">Dx Pointer</th>
            <th style="width: 60px">Qty</th>
            <th style="width: 100px">Charge</th>
          </tr>
        </thead>
        <tbody>
          ${charges.map((charge) => {
            const diagPointers = (charge.linkedDiagnosisIds || [])
              .map((dxId: string) => {
                const idx = diagnoses.findIndex((d) => d.id === dxId);
                return idx >= 0 ? (idx + 1).toString() : '';
              })
              .filter((p: string) => p)
              .join(', ');
            return `
            <tr>
              <td>${charge.cptCode || ''}</td>
              <td>${charge.description || ''}</td>
              <td>${diagPointers}</td>
              <td>${charge.quantity || 1}</td>
              <td>$${((charge.feeCents || 0) / 100).toFixed(2)}</td>
            </tr>
          `}).join('')}
          ${charges.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: #999;">No procedures recorded</td></tr>' : ''}
          <tr class="total-row">
            <td colspan="4" style="text-align: right;">Total Charges:</td>
            <td>$${(totalCharges / 100).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p>This is a superbill for insurance submission. Please submit to your insurance company for reimbursement.</p>
      <p>If you have questions, please contact our billing department at ${encounter.practicePhone || 'our office'}.</p>
    </div>
  </div>

  <script>
    // Auto-print on load (optional)
    // window.onload = () => window.print();
  </script>
</body>
</html>
  `;

  await auditLog(tenantId, req.user!.id, "superbill_generated", "encounter", encId);
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

encountersRouter.get("/:id/prescriptions", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);

  try {
    // Verify encounter exists
    const encounterCheck = await pool.query(
      `select id, patient_id from encounters where id = $1 and tenant_id = $2`,
      [encId, tenantId]
    );

    if (!encounterCheck.rowCount) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    const encounter = encounterCheck.rows[0];

    // Fetch prescriptions for this encounter
    const result = await pool.query(
      `select
        p.id, p.patient_id as "patientId", p.provider_id as "providerId",
        p.encounter_id as "encounterId",
        p.medication_name as "medicationName", p.generic_name as "genericName",
        p.strength, p.dosage_form as "dosageForm", p.sig, p.quantity, p.quantity_unit as "quantityUnit",
        p.refills, p.refills_remaining as "refillsRemaining", p.days_supply as "daysSupply",
        p.status, p.is_controlled as "isControlled", p.dea_schedule as "deaSchedule",
        p.pharmacy_id as "pharmacyId", p.pharmacy_name as "pharmacyName",
        p.indication, p.notes,
        p.written_date as "writtenDate", p.sent_at as "sentAt",
        p.created_at as "createdAt", p.updated_at as "updatedAt",
        prov.full_name as "providerName",
        ph.name as "pharmacyFullName", ph.phone as "pharmacyPhone"
      from prescriptions p
      left join providers prov on p.provider_id = prov.id
      left join pharmacies ph on p.pharmacy_id = ph.id
      where p.encounter_id = $1 and p.tenant_id = $2
      order by p.created_at desc`,
      [encId, tenantId]
    );

    await auditLog(tenantId, req.user!.id, "encounter_prescriptions_viewed", "encounter", encId);

    return res.json({
      encounterId: encId,
      patientId: encounter.patient_id,
      prescriptions: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error("Error fetching encounter prescriptions:", error);
    return res.status(500).json({ error: "Failed to fetch encounter prescriptions" });
  }
});

/**
 * POST /api/encounters/:id/generate-charges
 * Generate charges from encounter procedures
 */
encountersRouter.post("/:id/generate-charges", requireAuth, requireRoles(["provider", "admin", "billing"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);

  try {
    const charges = await encounterService.generateChargesFromEncounter(tenantId, encId);
    await auditLog(tenantId, req.user!.id, "encounter_charges_generated", "encounter", encId);

    return res.status(200).json({
      encounterId: encId,
      charges,
      count: charges.length,
      message: `Generated ${charges.length} charges from encounter`
    });
  } catch (error: any) {
    console.error("Error generating charges:", error);
    return res.status(500).json({ error: error.message || "Failed to generate charges" });
  }
});

/**
 * POST /api/encounters/:id/diagnoses
 * Add a diagnosis to an encounter
 */
const diagnosisSchema = z.object({
  icd10Code: z.string().min(1),
  description: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

encountersRouter.post("/:id/diagnoses", requireAuth, requireRoles(["provider", "admin", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = diagnosisSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);

  try {
    const diagnosisId = await encounterService.addDiagnosis(
      tenantId,
      encId,
      parsed.data.icd10Code,
      parsed.data.description,
      parsed.data.isPrimary || false
    );

    await auditLog(tenantId, req.user!.id, "diagnosis_added", "encounter", encId);

    return res.status(201).json({ id: diagnosisId, message: "Diagnosis added successfully" });
  } catch (error: any) {
    console.error("Error adding diagnosis:", error);
    return res.status(500).json({ error: error.message || "Failed to add diagnosis" });
  }
});

/**
 * POST /api/encounters/:id/procedures
 * Add a procedure/charge to an encounter
 */
const procedureSchema = z.object({
  cptCode: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().optional(),
  modifiers: z.array(z.string()).optional(),
});

encountersRouter.post("/:id/procedures", requireAuth, requireRoles(["provider", "admin", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = procedureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);

  try {
    const chargeId = await encounterService.addProcedure(
      tenantId,
      encId,
      parsed.data.cptCode,
      parsed.data.description,
      parsed.data.quantity || 1,
      parsed.data.modifiers
    );

    await auditLog(tenantId, req.user!.id, "procedure_added", "encounter", encId);

    return res.status(201).json({ id: chargeId, message: "Procedure added successfully" });
  } catch (error: any) {
    console.error("Error adding procedure:", error);
    return res.status(500).json({ error: error.message || "Failed to add procedure" });
  }
});

/**
 * POST /api/encounters/:id/complete
 * Complete an encounter and generate charges
 */
encountersRouter.post("/:id/complete", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);

  try {
    await encounterService.completeEncounter(tenantId, encId);
    await auditLog(tenantId, req.user!.id, "encounter_completed", "encounter", encId);

    return res.status(200).json({
      encounterId: encId,
      message: "Encounter completed and charges generated"
    });
  } catch (error: any) {
    console.error("Error completing encounter:", error);
    return res.status(500).json({ error: error.message || "Failed to complete encounter" });
  }
});

/**
 * POST /api/encounters/:id/create-claim
 * Create a claim from encounter charges
 */
encountersRouter.post("/:id/create-claim", requireAuth, requireRoles(["provider", "admin", "billing"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);
  const userId = req.user!.id;

  try {
    const claim = await billingService.createClaimFromCharges(tenantId, encId, userId);

    return res.status(201).json({
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      totalCents: claim.totalCents,
      status: claim.status,
      message: "Claim created successfully"
    });
  } catch (error: any) {
    console.error("Error creating claim:", error);
    return res.status(500).json({ error: error.message || "Failed to create claim" });
  }
});

/**
 * GET /api/encounters/:id/charges
 * Get charges for an encounter
 */
encountersRouter.get("/:id/charges", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const encId = String(req.params.id);

  try {
    const result = await pool.query(
      `SELECT id, cpt_code as "cptCode", description, quantity, fee_cents as "feeCents",
              linked_diagnosis_ids as "linkedDiagnosisIds", icd_codes as "icdCodes",
              status, created_at as "createdAt", updated_at as "updatedAt"
       FROM charges
       WHERE encounter_id = $1 AND tenant_id = $2
       ORDER BY created_at`,
      [encId, tenantId]
    );

    const totalCents = result.rows.reduce((sum, charge) => sum + (charge.feeCents || 0) * (charge.quantity || 1), 0);

    await auditLog(tenantId, req.user!.id, "encounter_charges_viewed", "encounter", encId);

    return res.json({
      encounterId: encId,
      charges: result.rows,
      count: result.rows.length,
      totalCents
    });
  } catch (error) {
    console.error("Error fetching encounter charges:", error);
    return res.status(500).json({ error: "Failed to fetch encounter charges" });
  }
});
