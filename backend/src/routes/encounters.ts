import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { recordEncounterLearning } from "../services/learningService";

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

encountersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, patient_id as "patientId", provider_id as "providerId", appointment_id as "appointmentId",
            status, chief_complaint as "chiefComplaint", hpi, ros, exam, assessment_plan as "assessmentPlan",
            created_at as "createdAt", updated_at as "updatedAt"
     from encounters where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId],
  );
  res.json({ encounters: result.rows });
});

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
  await pool.query(`update encounters set status = $1, updated_at = now() where id = $2 and tenant_id = $3`, [
    parsed.data.status,
    encId,
    tenantId,
  ]);
  await pool.query(
    `insert into audit_log(id, tenant_id, actor_id, action, entity, entity_id)
     values ($1,$2,$3,$4,$5,$6)`,
    [crypto.randomUUID(), tenantId, req.user!.id, `encounter_status_${parsed.data.status}`, "encounter", encId],
  );
  await auditLog(tenantId, req.user!.id, `encounter_status_${parsed.data.status}`, "encounter", encId);

  // Trigger adaptive learning when encounter is finalized/locked
  if (parsed.data.status === "locked" || parsed.data.status === "finalized") {
    try {
      await recordEncounterLearning(encId);
    } catch (error) {
      // Log error but don't fail the request
      console.error("Error recording encounter learning:", error);
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
