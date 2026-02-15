import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { scrubClaim, applyAutoFixes, getPassedChecks } from "../services/claimScrubber";
import { suggestModifiers, getAllModifierRules, getModifierInfo } from "../services/modifierEngine";
import {
  emitClaimCreated,
  emitClaimUpdated,
  emitClaimStatusChanged,
  emitClaimSubmitted,
  emitClaimDenied,
  emitClaimPaid,
  emitPaymentReceived,
} from "../websocket/emitter";
import { logger } from "../lib/logger";

const claimCreateSchema = z.object({
  encounterId: z.string().optional(),
  patientId: z.string(),
  payer: z.string().optional(),
  payerId: z.string().optional(),
  serviceDate: z.string().optional(),
  lineItems: z.array(z.object({
    cpt: z.string(),
    modifiers: z.array(z.string()).optional(),
    dx: z.array(z.string()),
    units: z.number().int().positive(),
    charge: z.number().positive(),
    description: z.string().optional(),
  })).optional(),
});

const claimUpdateSchema = z.object({
  lineItems: z.array(z.object({
    cpt: z.string(),
    modifiers: z.array(z.string()).optional(),
    dx: z.array(z.string()),
    units: z.number().int().positive(),
    charge: z.number().positive(),
    description: z.string().optional(),
  })).optional(),
  isCosmetic: z.boolean().optional(),
  cosmeticReason: z.string().optional(),
  notes: z.string().optional(),
});

const claimStatusSchema = z.object({
  status: z.enum(["draft", "scrubbed", "ready", "submitted", "accepted", "denied", "paid", "appealed"]),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  amountCents: z.number().int().positive(),
  paymentDate: z.string(),
  paymentMethod: z.string().optional(),
  payer: z.string().optional(),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
});

const appealSchema = z.object({
  appealNotes: z.string(),
  denialReason: z.string().optional(),
  templateId: z.string().optional(),
  appealDeadline: z.string().optional(),
  appealLevel: z.enum(["first", "second", "external"]).optional(),
});

const appealOutcomeSchema = z.object({
  outcome: z.enum(["approved", "denied", "partial"]),
  approvedAmountCents: z.number().int().optional(),
  denialReason: z.string().optional(),
  notes: z.string().optional(),
  decisionDate: z.string().optional(),
});

// Appeal letter templates for common denial types
const APPEAL_TEMPLATES: Record<string, { name: string; category: string; template: string }> = {
  "cosmetic_medical_necessity": {
    name: "Medical Necessity - Cosmetic Denial",
    category: "cosmetic_vs_medical",
    template: `Dear Claims Review Department,

I am writing to appeal the denial of claim [CLAIM_NUMBER] for patient [PATIENT_NAME], date of service [SERVICE_DATE].

The claim was denied as cosmetic/not medically necessary. However, this procedure was performed for the following medical indication:

Diagnosis: [DIAGNOSIS_CODE] - [DIAGNOSIS_DESCRIPTION]

Clinical Justification:
- [CLINICAL_NOTES]

The patient presented with documented symptoms including [SYMPTOMS] that significantly impacted their [FUNCTIONAL_IMPACT].

Attached documentation includes:
- Clinical photographs showing [PHOTO_DESCRIPTION]
- Pathology report (if applicable)
- Prior treatment history

Based on the above, I respectfully request reconsideration of this claim.

Sincerely,
[PROVIDER_NAME]
[PRACTICE_NAME]`,
  },
  "modifier_correction": {
    name: "Modifier Correction Appeal",
    category: "modifier_issue",
    template: `Dear Claims Review Department,

I am writing regarding claim [CLAIM_NUMBER] denied due to modifier issues.

This letter serves to clarify that the services performed were distinct and separately identifiable:

Original Claim Details:
- Patient: [PATIENT_NAME]
- Date of Service: [SERVICE_DATE]
- Procedures: [PROCEDURE_CODES]

Clarification of Services:
[SERVICE_CLARIFICATION]

The appropriate modifier(s) have been applied to reflect:
- [MODIFIER_JUSTIFICATION]

Please reprocess this claim with the corrected information.

Sincerely,
[PROVIDER_NAME]`,
  },
  "prior_auth_retroactive": {
    name: "Retroactive Prior Authorization",
    category: "prior_auth",
    template: `Dear Prior Authorization Department,

I am requesting retroactive authorization for claim [CLAIM_NUMBER].

Patient Information:
- Name: [PATIENT_NAME]
- Member ID: [MEMBER_ID]
- Date of Service: [SERVICE_DATE]

Procedure(s) Performed: [PROCEDURE_CODES]
Diagnosis: [DIAGNOSIS_CODE] - [DIAGNOSIS_DESCRIPTION]

Reason for Retroactive Request:
[REASON_FOR_RETROACTIVE]

Clinical Justification:
This procedure was medically necessary due to [MEDICAL_NECESSITY].

The urgency of the patient's condition required [URGENCY_EXPLANATION].

Enclosed documentation:
- Clinical notes
- Supporting medical records
- [ADDITIONAL_DOCS]

Please contact our office if additional information is required.

Sincerely,
[PROVIDER_NAME]`,
  },
  "documentation_supplement": {
    name: "Documentation Supplement",
    category: "documentation",
    template: `Dear Claims Review Department,

Re: Claim [CLAIM_NUMBER] - Request for Reconsideration with Additional Documentation

I am submitting additional documentation in support of the above-referenced claim for patient [PATIENT_NAME], date of service [SERVICE_DATE].

The claim was denied due to insufficient documentation. Please find enclosed:

1. [DOCUMENT_1]
2. [DOCUMENT_2]
3. [DOCUMENT_3]

This documentation clearly demonstrates:
- Medical necessity for the procedure(s) performed
- The clinical decision-making process
- [ADDITIONAL_JUSTIFICATION]

Please reprocess this claim with the enclosed supporting documentation.

Sincerely,
[PROVIDER_NAME]`,
  },
  "duplicate_clarification": {
    name: "Duplicate Claim Clarification",
    category: "duplicate",
    template: `Dear Claims Processing Department,

I am writing to clarify that claim [CLAIM_NUMBER] is NOT a duplicate submission.

Patient: [PATIENT_NAME]
Date of Service: [SERVICE_DATE]

This claim represents a distinct service from the previously processed claim because:

[DISTINCTION_EXPLANATION]

Key Differences:
- [DIFFERENCE_1]
- [DIFFERENCE_2]

Supporting documentation is attached to verify these were separate services.

Please reprocess this claim accordingly.

Sincerely,
[PROVIDER_NAME]`,
  },
};

const scrubSchema = z.object({
  claimId: z.string(),
  autoFix: z.boolean().optional(),
});

const batchSubmitSchema = z.object({
  claimIds: z.array(z.string()),
});

export const claimsRouter = Router();

// GET /api/claims/diagnosis-codes - Get available diagnosis codes
claimsRouter.get("/diagnosis-codes", requireAuth, async (req: AuthedRequest, res) => {
  const { search, category, common } = req.query;

  let query = `select id, icd10_code as "icd10Code", description, category,
                      is_common as "isCommon", specialty
               from diagnosis_codes
               where specialty = 'dermatology'`;

  const params: any[] = [];
  let paramCount = 0;

  if (common === 'true') {
    query += ` and is_common = true`;
  }

  if (category) {
    paramCount++;
    query += ` and category = $${paramCount}`;
    params.push(category);
  }

  if (search) {
    paramCount++;
    query += ` and (icd10_code ilike $${paramCount} or description ilike $${paramCount})`;
    params.push(`%${search}%`);
  }

  query += ` order by is_common desc, icd10_code asc limit 100`;

  const result = await pool.query(query, params);
  res.json({ diagnosisCodes: result.rows });
});

// GET /api/claims - List all claims with filters
claimsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, patientId, startDate, endDate, scrubStatus, isCosmetic } = req.query;

  let query = `
    select
      c.id, c.claim_number as "claimNumber", c.encounter_id as "encounterId",
      c.patient_id as "patientId", c.total_charges as "totalCharges", c.status,
      c.payer, c.payer_id as "payerId", c.payer_name as "payerName",
      c.submitted_at as "submittedAt", c.service_date as "serviceDate",
      c.scrub_status as "scrubStatus", c.is_cosmetic as "isCosmetic",
      c.denial_reason as "denialReason", c.denial_date as "denialDate",
      c.appeal_status as "appealStatus",
      c.created_at as "createdAt", c.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      pr.full_name as "providerName"
    from claims c
    join patients p on p.id = c.patient_id
    left join encounters e on e.id = c.encounter_id
    left join providers pr on pr.id = e.provider_id
    where c.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` and c.status = $${paramCount}`;
    params.push(status);
  }

  if (scrubStatus) {
    paramCount++;
    query += ` and c.scrub_status = $${paramCount}`;
    params.push(scrubStatus);
  }

  if (patientId) {
    paramCount++;
    query += ` and c.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (isCosmetic !== undefined) {
    paramCount++;
    query += ` and c.is_cosmetic = $${paramCount}`;
    params.push(isCosmetic === 'true');
  }

  if (startDate) {
    paramCount++;
    query += ` and c.service_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and c.service_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by c.service_date desc, c.created_at desc limit 200`;

  const result = await pool.query(query, params);
  res.json({ claims: result.rows });
});

// POST /api/claims - Create new claim
claimsRouter.post("/", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = claimCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const claimId = crypto.randomUUID();

  // Calculate total from line items or encounter charges
  let totalCharges = 0;
  let lineItems = payload.lineItems || [];

  if (payload.encounterId && !payload.lineItems) {
    // Load from encounter
    const chargesResult = await pool.query(
      `select cpt_code as cpt, quantity as units, fee_cents / 100.0 as charge, description,
              linked_diagnosis_ids as dx
       from charges
       where encounter_id = $1 and tenant_id = $2`,
      [payload.encounterId, tenantId],
    );

    lineItems = chargesResult.rows.map((row: any) => ({
      cpt: row.cpt,
      modifiers: [],
      dx: row.dx || [],
      units: row.units,
      charge: row.charge,
      description: row.description,
    }));
  }

  totalCharges = lineItems.reduce((sum, item) => sum + (item.charge * item.units), 0);

  // Generate claim number
  const claimNumber = `CLM-${Date.now()}-${claimId.substring(0, 8)}`;
  const serviceDate = payload.serviceDate || new Date().toISOString().split('T')[0];

  // Pull insurance info from latest eligibility verification if not provided
  let payerId = payload.payerId;
  let payerName = payload.payer;

  if (!payerId || !payerName) {
    const insuranceResult = await pool.query(
      `SELECT
        p.insurance_payer_id,
        p.insurance_plan_name,
        iv.payer_name,
        iv.payer_id
       FROM patients p
       LEFT JOIN insurance_verifications iv ON iv.id = p.latest_verification_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [payload.patientId, tenantId]
    );

    if (insuranceResult.rows.length > 0) {
      const insurance = insuranceResult.rows[0];
      payerId = payerId || insurance.payer_id || insurance.insurance_payer_id || null;
      payerName = payerName || insurance.payer_name || insurance.insurance_plan_name || null;
    }
  }

  await pool.query(
    `insert into claims(id, tenant_id, encounter_id, patient_id, claim_number, total_charges,
                        service_date, status, payer, payer_id, payer_name, line_items, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [claimId, tenantId, payload.encounterId || null, payload.patientId, claimNumber, totalCharges,
     serviceDate, "draft", payerName, payerId, payerName,
     JSON.stringify(lineItems), req.user!.id],
  );

  // Create initial status history
  await pool.query(
    `insert into claim_status_history(id, tenant_id, claim_id, status, changed_by, changed_at)
     values ($1, $2, $3, $4, $5, now())`,
    [crypto.randomUUID(), tenantId, claimId, "draft", req.user!.id],
  );

  await auditLog(tenantId, req.user!.id, "claim_create", "claim", claimId);
  res.status(201).json({ id: claimId, claimNumber });
});

// PUT /api/claims/:id - Update claim
claimsRouter.put("/:id", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = claimUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const payload = parsed.data;

  // Check if claim exists
  const existing = await pool.query(`select id from claims where id = $1 and tenant_id = $2`, [claimId, tenantId]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const updates: string[] = [`updated_at = now()`, `updated_by = $1`];
  const params: any[] = [req.user!.id];
  let paramCount = 1;

  if (payload.lineItems) {
    paramCount++;
    updates.push(`line_items = $${paramCount}`);
    params.push(JSON.stringify(payload.lineItems));

    // Recalculate total
    const totalCharges = payload.lineItems.reduce((sum, item) => sum + (item.charge * item.units), 0);
    paramCount++;
    updates.push(`total_charges = $${paramCount}`);
    params.push(totalCharges);
  }

  if (payload.isCosmetic !== undefined) {
    paramCount++;
    updates.push(`is_cosmetic = $${paramCount}`);
    params.push(payload.isCosmetic);
  }

  if (payload.cosmeticReason) {
    paramCount++;
    updates.push(`cosmetic_reason = $${paramCount}`);
    params.push(payload.cosmeticReason);
  }

  paramCount++;
  params.push(claimId);
  paramCount++;
  params.push(tenantId);

  await pool.query(
    `update claims set ${updates.join(", ")} where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    params,
  );

  await auditLog(tenantId, req.user!.id, "claim_update", "claim", claimId);
  res.json({ ok: true });
});

// PUT /api/claims/:id/status - Update claim status
claimsRouter.put("/:id/status", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = claimStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const { status, notes } = parsed.data;

  // Check if claim exists
  const existing = await pool.query(`select id from claims where id = $1 and tenant_id = $2`, [claimId, tenantId]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  // Update claim status
  const updates: string[] = [`status = $1`, `updated_at = now()`];
  const params: any[] = [status];
  let paramCount = 1;

  if (status === "submitted") {
    paramCount++;
    updates.push(`submitted_at = $${paramCount}`);
    params.push(new Date().toISOString());
  }

  paramCount++;
  params.push(claimId);
  paramCount++;
  params.push(tenantId);

  await pool.query(
    `update claims set ${updates.join(", ")} where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    params,
  );

  // Add to status history
  await pool.query(
    `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
     values ($1, $2, $3, $4, $5, $6, now())`,
    [crypto.randomUUID(), tenantId, claimId, status, notes || null, req.user!.id],
  );

  await auditLog(tenantId, req.user!.id, `claim_status_${status}`, "claim", claimId);
  res.json({ ok: true });
});

// POST /api/claims/scrub - Run claim scrubber
claimsRouter.post("/scrub", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = scrubSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { claimId, autoFix } = parsed.data;

  // Load claim
  const claimResult = await pool.query(
    `select id, tenant_id, patient_id, service_date, line_items, payer_id, payer_name, is_cosmetic
     from claims
     where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const claimData = claimResult.rows[0];

  // Run scrubber
  const scrubResult = await scrubClaim({
    id: claimData.id,
    tenantId: claimData.tenant_id,
    patientId: claimData.patient_id,
    serviceDate: claimData.service_date,
    lineItems: claimData.line_items || [],
    payerId: claimData.payer_id,
    payerName: claimData.payer_name,
    isCosmetic: claimData.is_cosmetic,
  });

  // Apply auto-fixes if requested
  let updatedLineItems = claimData.line_items;
  if (autoFix && scrubResult.errors.length > 0) {
    const fixableIssues = scrubResult.errors.filter(e => e.autoFixable);
    if (fixableIssues.length > 0) {
      const fixedClaim = applyAutoFixes({
        id: claimData.id,
        tenantId: claimData.tenant_id,
        patientId: claimData.patient_id,
        serviceDate: claimData.service_date,
        lineItems: claimData.line_items || [],
      }, fixableIssues);

      updatedLineItems = fixedClaim.lineItems;

      // Re-run scrubber on fixed claim
      const reScrubResult = await scrubClaim(fixedClaim);

      // Update claim with fixes
      await pool.query(
        `update claims
         set line_items = $1, scrub_status = $2, scrub_errors = $3, scrub_warnings = $4,
             scrub_info = $5, last_scrubbed_at = now()
         where id = $6 and tenant_id = $7`,
        [
          JSON.stringify(updatedLineItems),
          reScrubResult.status,
          JSON.stringify(reScrubResult.errors),
          JSON.stringify(reScrubResult.warnings),
          JSON.stringify(reScrubResult.info),
          claimId,
          tenantId,
        ]
      );

      return res.json({
        ...reScrubResult,
        autoFixed: true,
        updatedLineItems,
        passedChecks: getPassedChecks(fixedClaim),
      });
    }
  }

  // Update claim with scrub results
  await pool.query(
    `update claims
     set scrub_status = $1, scrub_errors = $2, scrub_warnings = $3, scrub_info = $4,
         last_scrubbed_at = now()
     where id = $5 and tenant_id = $6`,
    [
      scrubResult.status,
      JSON.stringify(scrubResult.errors),
      JSON.stringify(scrubResult.warnings),
      JSON.stringify(scrubResult.info),
      claimId,
      tenantId,
    ]
  );

  const passedChecks = getPassedChecks({
    id: claimData.id,
    tenantId: claimData.tenant_id,
    patientId: claimData.patient_id,
    serviceDate: claimData.service_date,
    lineItems: claimData.line_items || [],
  });

  res.json({ ...scrubResult, passedChecks });
});

// POST /api/claims/submit - Submit claims batch
claimsRouter.post("/submit", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = batchSubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { claimIds } = parsed.data;

  const results = {
    submitted: [] as string[],
    errors: [] as { claimId: string; error: string }[],
  };

  for (const claimId of claimIds) {
    try {
      // Check scrub status
      const claimResult = await pool.query(
        `select scrub_status from claims where id = $1 and tenant_id = $2`,
        [claimId, tenantId]
      );

      if (!claimResult.rowCount) {
        results.errors.push({ claimId, error: "Claim not found" });
        continue;
      }

      const scrubStatus = claimResult.rows[0].scrub_status;
      if (scrubStatus === "errors") {
        results.errors.push({ claimId, error: "Claim has unresolved errors" });
        continue;
      }

      // Update to submitted
      await pool.query(
        `update claims set status = 'submitted', submitted_at = now() where id = $1 and tenant_id = $2`,
        [claimId, tenantId]
      );

      await pool.query(
        `insert into claim_status_history(id, tenant_id, claim_id, status, changed_by, changed_at)
         values ($1, $2, $3, $4, $5, now())`,
        [crypto.randomUUID(), tenantId, claimId, "submitted", req.user!.id]
      );

      results.submitted.push(claimId);
    } catch (err: any) {
      results.errors.push({ claimId, error: err.message });
    }
  }

  res.json(results);
});

// GET /api/claims/denials - Get denied claims
claimsRouter.get("/denials", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `select
      c.id, c.claim_number as "claimNumber", c.patient_id as "patientId",
      c.service_date as "serviceDate", c.total_charges as "totalCharges",
      c.denial_reason as "denialReason", c.denial_code as "denialCode",
      c.denial_date as "denialDate", c.denial_category as "denialCategory",
      c.appeal_status as "appealStatus", c.appeal_submitted_at as "appealSubmittedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      pr.full_name as "providerName",
      EXTRACT(DAY FROM NOW() - c.denial_date) as "daysSinceDenial"
    from claims c
    join patients p on p.id = c.patient_id
    left join encounters e on e.id = c.encounter_id
    left join providers pr on pr.id = e.provider_id
    where c.tenant_id = $1 and c.status = 'denied'
    order by c.denial_date desc`,
    [tenantId]
  );

  res.json({ denials: result.rows });
});

// GET /api/claims/appeal-templates - Get appeal letter templates
claimsRouter.get("/appeal-templates", requireAuth, async (req: AuthedRequest, res) => {
  const { category } = req.query;

  let templates = Object.entries(APPEAL_TEMPLATES).map(([id, template]) => ({
    id,
    ...template,
  }));

  if (category && typeof category === "string") {
    templates = templates.filter((t) => t.category === category);
  }

  res.json({ templates });
});

// GET /api/claims/appeal-templates/:id - Get specific appeal template
claimsRouter.get("/appeal-templates/:templateId", requireAuth, async (req: AuthedRequest, res) => {
  const templateId = String(req.params.templateId);
  const template = APPEAL_TEMPLATES[templateId];

  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  res.json({ id: templateId, ...template });
});

// POST /api/claims/:id/appeal - Create appeal with enhanced tracking
claimsRouter.post("/:id/appeal", requireAuth, requireRoles(["admin", "billing"]), async (req: AuthedRequest, res) => {
  const parsed = appealSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const { appealNotes, denialReason, templateId, appealDeadline, appealLevel } = parsed.data;

  // Check if claim is denied
  const claimResult = await pool.query(
    `select status, denial_date, denial_code, denial_category, payer_name from claims where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const claim = claimResult.rows[0];

  if (claim.status !== "denied" && claim.status !== "appealed") {
    return res.status(400).json({ error: "Can only appeal denied claims" });
  }

  // Calculate default appeal deadline if not provided (typically 60-180 days from denial)
  let deadline = appealDeadline;
  if (!deadline && claim.denial_date) {
    const denialDate = new Date(claim.denial_date);
    denialDate.setDate(denialDate.getDate() + 60); // Default 60 days
    deadline = denialDate.toISOString().split("T")[0];
  }

  // Create appeal record
  const appealId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO claim_appeals (id, tenant_id, claim_id, appeal_level, appeal_status,
       appeal_notes, template_used, appeal_deadline, submitted_at, submitted_by, created_at)
     VALUES ($1, $2, $3, $4, 'submitted', $5, $6, $7, NOW(), $8, NOW())
     ON CONFLICT DO NOTHING`,
    [
      appealId,
      tenantId,
      claimId,
      appealLevel || "first",
      appealNotes,
      templateId || null,
      deadline || null,
      req.user!.id,
    ]
  );

  // Update claim with appeal info
  await pool.query(
    `UPDATE claims
     SET status = 'appealed',
         appeal_status = 'submitted',
         appeal_notes = $1,
         appeal_submitted_at = NOW(),
         denial_reason = COALESCE($2, denial_reason)
     WHERE id = $3 AND tenant_id = $4`,
    [appealNotes, denialReason || null, claimId, tenantId]
  );

  await pool.query(
    `INSERT INTO claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [crypto.randomUUID(), tenantId, claimId, "appealed", `Appeal submitted (Level: ${appealLevel || "first"})`, req.user!.id]
  );

  await auditLog(tenantId, req.user!.id, "claim_appeal_submitted", "claim", claimId);

  res.json({
    ok: true,
    appealId,
    appealDeadline: deadline,
    appealLevel: appealLevel || "first",
  });
});

// POST /api/claims/:id/appeal-outcome - Record appeal outcome
claimsRouter.post("/:id/appeal-outcome", requireAuth, requireRoles(["admin", "billing"]), async (req: AuthedRequest, res) => {
  const parsed = appealOutcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const { outcome, approvedAmountCents, denialReason, notes, decisionDate } = parsed.data;

  // Check if claim exists and is in appeal status
  const claimResult = await pool.query(
    `SELECT id, status, appeal_status, total_charges FROM claims WHERE id = $1 AND tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const claim = claimResult.rows[0];

  if (claim.status !== "appealed") {
    return res.status(400).json({ error: "Claim is not in appeal status" });
  }

  const decision = decisionDate || new Date().toISOString().split("T")[0];
  let newStatus = "denied";
  let newAppealStatus = "denied";

  if (outcome === "approved") {
    newStatus = "accepted";
    newAppealStatus = "approved";
  } else if (outcome === "partial") {
    newStatus = "accepted";
    newAppealStatus = "partial";
  }

  // Update claim with appeal outcome
  await pool.query(
    `UPDATE claims
     SET status = $1,
         appeal_status = $2,
         appeal_decision = $3,
         appeal_decision_date = $4,
         appeal_notes = COALESCE(appeal_notes, '') || E'\n\nOutcome: ' || $3 || COALESCE(E'\n' || $5, '')
     WHERE id = $6 AND tenant_id = $7`,
    [newStatus, newAppealStatus, outcome, decision, notes || null, claimId, tenantId]
  );

  // Update the appeal record if exists
  await pool.query(
    `UPDATE claim_appeals
     SET appeal_status = $1,
         outcome = $2,
         approved_amount_cents = $3,
         outcome_notes = $4,
         decision_date = $5,
         updated_at = NOW()
     WHERE claim_id = $6 AND tenant_id = $7
       AND appeal_status = 'submitted'
     ORDER BY created_at DESC
     LIMIT 1`,
    [newAppealStatus, outcome, approvedAmountCents || null, notes || null, decision, claimId, tenantId]
  );

  // If approved or partial, auto-post payment
  if (outcome === "approved" || outcome === "partial") {
    const paymentAmount = approvedAmountCents || Math.round(claim.total_charges * 100);
    const paymentId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO claim_payments (id, tenant_id, claim_id, amount_cents, payment_date,
         payment_method, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, 'Appeal Payment', $6, $7)`,
      [
        paymentId,
        tenantId,
        claimId,
        paymentAmount,
        decision,
        `Appeal ${outcome}: ${notes || "Payment from successful appeal"}`,
        req.user!.id,
      ]
    );

    // Check if claim is fully paid
    const totalPaidResult = await pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM claim_payments WHERE claim_id = $1`,
      [claimId]
    );
    const totalPaid = totalPaidResult.rows[0].total;
    const totalChargesCents = Math.round(claim.total_charges * 100);

    if (totalPaid >= totalChargesCents) {
      await pool.query(
        `UPDATE claims SET status = 'paid', paid_amount = total_charges WHERE id = $1`,
        [claimId]
      );
      newStatus = "paid";
    }
  }

  // Add to status history
  await pool.query(
    `INSERT INTO claim_status_history (id, tenant_id, claim_id, status, notes, changed_by, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      crypto.randomUUID(),
      tenantId,
      claimId,
      newStatus,
      `Appeal outcome: ${outcome}${notes ? ` - ${notes}` : ""}`,
      req.user!.id,
    ]
  );

  await auditLog(tenantId, req.user!.id, `claim_appeal_${outcome}`, "claim", claimId);

  res.json({
    ok: true,
    outcome,
    newStatus,
    approvedAmountCents: outcome === "approved" || outcome === "partial" ? approvedAmountCents : null,
  });
});

// GET /api/claims/:id/appeals - Get appeal history for a claim
claimsRouter.get("/:id/appeals", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  const result = await pool.query(
    `SELECT
       id, appeal_level as "appealLevel", appeal_status as "appealStatus",
       appeal_notes as "appealNotes", template_used as "templateUsed",
       appeal_deadline as "appealDeadline", outcome,
       approved_amount_cents as "approvedAmountCents",
       outcome_notes as "outcomeNotes", decision_date as "decisionDate",
       submitted_at as "submittedAt", submitted_by as "submittedBy",
       created_at as "createdAt"
     FROM claim_appeals
     WHERE claim_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [claimId, tenantId]
  );

  res.json({ appeals: result.rows });
});

// GET /api/claims/appeals/pending - Get all pending appeals with deadlines
claimsRouter.get("/appeals/pending", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT
       c.id as "claimId", c.claim_number as "claimNumber",
       c.patient_id as "patientId", c.total_charges as "totalCharges",
       c.denial_reason as "denialReason", c.denial_code as "denialCode",
       ca.id as "appealId", ca.appeal_level as "appealLevel",
       ca.appeal_deadline as "appealDeadline",
       ca.submitted_at as "submittedAt",
       p.first_name as "patientFirstName", p.last_name as "patientLastName",
       EXTRACT(DAY FROM ca.appeal_deadline::date - CURRENT_DATE) as "daysUntilDeadline"
     FROM claim_appeals ca
     JOIN claims c ON c.id = ca.claim_id
     JOIN patients p ON p.id = c.patient_id
     WHERE ca.tenant_id = $1
       AND ca.appeal_status = 'submitted'
     ORDER BY ca.appeal_deadline ASC NULLS LAST, ca.submitted_at DESC`,
    [tenantId]
  );

  res.json({ pendingAppeals: result.rows });
});

// GET /api/claims/metrics - Dashboard metrics with aging buckets
claimsRouter.get("/metrics", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Overall counts
  const countsResult = await pool.query(
    `select
      count(*) filter (where status = 'draft') as "draftCount",
      count(*) filter (where status = 'ready') as "readyCount",
      count(*) filter (where status = 'submitted' or status = 'accepted') as "pendingCount",
      count(*) filter (where status = 'denied') as "deniedCount",
      count(*) filter (where status = 'paid') as "paidCount",
      sum(total_charges) filter (where status = 'submitted' or status = 'accepted') as "pendingAmount",
      sum(total_charges) filter (where status = 'paid') as "paidAmount",
      sum(total_charges) filter (where status = 'denied') as "deniedAmount"
    from claims
    where tenant_id = $1 and service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  // Aging buckets (days since service date for unpaid claims)
  const agingResult = await pool.query(
    `select
      count(*) filter (where age <= 30) as "age_0_30",
      sum(total_charges) filter (where age <= 30) as "amount_0_30",
      count(*) filter (where age > 30 and age <= 60) as "age_31_60",
      sum(total_charges) filter (where age > 30 and age <= 60) as "amount_31_60",
      count(*) filter (where age > 60 and age <= 90) as "age_61_90",
      sum(total_charges) filter (where age > 60 and age <= 90) as "amount_61_90",
      count(*) filter (where age > 90) as "age_90_plus",
      sum(total_charges) filter (where age > 90) as "amount_90_plus"
    from (
      select
        c.*,
        EXTRACT(DAY FROM NOW() - c.service_date::timestamptz) as age
      from claims c
      where c.tenant_id = $1
        and c.status in ('submitted', 'accepted', 'denied')
    ) claims_with_age`,
    [tenantId]
  );

  // Average days to payment
  const daysToPaymentResult = await pool.query(
    `select
      avg(EXTRACT(DAY FROM payment_date::timestamptz - c.service_date::timestamptz)) as "avgDaysToPayment",
      count(*) as "paidClaimsCount"
    from claims c
    join claim_payments cp on cp.claim_id = c.id
    where c.tenant_id = $1
      and c.status = 'paid'
      and c.service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  // Collection rate (paid vs total charged)
  const collectionResult = await pool.query(
    `select
      sum(c.total_charges) as "totalCharges",
      coalesce(sum(cp.total_payments), 0) as "totalPayments",
      case
        when sum(c.total_charges) > 0
        then (coalesce(sum(cp.total_payments), 0) / sum(c.total_charges)) * 100
        else 0
      end as "collectionRate"
    from claims c
    left join (
      select claim_id, sum(amount_cents) / 100.0 as total_payments
      from claim_payments
      where tenant_id = $1
      group by claim_id
    ) cp on cp.claim_id = c.id
    where c.tenant_id = $1
      and c.service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  // Denial rate
  const denialRateResult = await pool.query(
    `select
      count(*) filter (where status in ('submitted', 'accepted', 'denied', 'paid')) as "totalSubmitted",
      count(*) filter (where status = 'denied') as "deniedCount",
      case
        when count(*) filter (where status in ('submitted', 'accepted', 'denied', 'paid')) > 0
        then (count(*) filter (where status = 'denied')::float / count(*) filter (where status in ('submitted', 'accepted', 'denied', 'paid'))::float) * 100
        else 0
      end as "denialRate"
    from claims
    where tenant_id = $1
      and service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  res.json({
    counts: countsResult.rows[0],
    aging: agingResult.rows[0],
    daysToPayment: daysToPaymentResult.rows[0],
    collection: collectionResult.rows[0],
    denialRate: denialRateResult.rows[0],
  });
});

// GET /api/claims/analytics - Denial analytics
claimsRouter.get("/analytics", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Overall stats
  const statsResult = await pool.query(
    `select
      count(*) filter (where status = 'submitted') as "submitted",
      count(*) filter (where status = 'denied') as "denied",
      count(*) filter (where status = 'paid') as "paid",
      count(*) filter (where status IN ('submitted', 'accepted')) as "inProcess",
      count(*) filter (where status = 'denied') * 100.0 / NULLIF(count(*) filter (where status IN ('submitted', 'denied', 'accepted', 'paid')), 0) as "denialRate",
      avg(EXTRACT(DAY FROM paid_at - submitted_at)) filter (where status = 'paid' and submitted_at is not null) as "avgDaysToPayment"
    from (
      select *,
        (select max(changed_at) from claim_status_history where claim_id = c.id and status = 'paid') as paid_at
      from claims c
      where tenant_id = $1 and submitted_at >= NOW() - INTERVAL '90 days'
    ) claims_with_paid`,
    [tenantId]
  );

  // Top denial reasons
  const denialReasonsResult = await pool.query(
    `select denial_category, denial_reason, count(*) as count
     from claims
     where tenant_id = $1 and status = 'denied' and denial_date >= NOW() - INTERVAL '90 days'
     group by denial_category, denial_reason
     order by count desc
     limit 10`,
    [tenantId]
  );

  // Denial rate by payer
  const payerResult = await pool.query(
    `select
      payer_name,
      count(*) filter (where status = 'denied') as denied,
      count(*) as total,
      count(*) filter (where status = 'denied') * 100.0 / count(*) as "denialRate"
     from claims
     where tenant_id = $1 and submitted_at >= NOW() - INTERVAL '90 days'
       and payer_name is not null
     group by payer_name
     having count(*) >= 5
     order by "denialRate" desc
     limit 10`,
    [tenantId]
  );

  // Denial rate by provider
  const providerResult = await pool.query(
    `select
      pr.full_name as "providerName",
      count(*) filter (where c.status = 'denied') as denied,
      count(*) as total,
      count(*) filter (where c.status = 'denied') * 100.0 / count(*) as "denialRate"
     from claims c
     left join encounters e on e.id = c.encounter_id
     left join providers pr on pr.id = e.provider_id
     where c.tenant_id = $1 and c.submitted_at >= NOW() - INTERVAL '90 days'
       and pr.full_name is not null
     group by pr.full_name
     having count(*) >= 5
     order by "denialRate" desc
     limit 10`,
    [tenantId]
  );

  // Appeal success rate
  const appealResult = await pool.query(
    `select
      count(*) filter (where appeal_status = 'approved') as approved,
      count(*) filter (where appeal_status = 'denied') as "appealDenied",
      count(*) as total,
      count(*) filter (where appeal_status = 'approved') * 100.0 / NULLIF(count(*), 0) as "successRate"
     from claims
     where tenant_id = $1 and status = 'appealed'`,
    [tenantId]
  );

  res.json({
    stats: statsResult.rows[0],
    topDenialReasons: denialReasonsResult.rows,
    denialByPayer: payerResult.rows,
    denialByProvider: providerResult.rows,
    appealStats: appealResult.rows[0],
  });
});

// POST /api/claims/:id/payments - Post payment to claim
claimsRouter.post("/:id/payments", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const payload = parsed.data;

  // Check if claim exists
  const existing = await pool.query(`select id, status from claims where id = $1 and tenant_id = $2`, [claimId, tenantId]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const paymentId = crypto.randomUUID();

  await pool.query(
    `insert into claim_payments(id, tenant_id, claim_id, amount_cents, payment_date, payment_method, payer, check_number, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      paymentId,
      tenantId,
      claimId,
      payload.amountCents,
      payload.paymentDate,
      payload.paymentMethod || null,
      payload.payer || null,
      payload.checkNumber || null,
      payload.notes || null,
      req.user!.id,
    ],
  );

  // Check if claim is fully paid and update status
  const paymentsResult = await pool.query(
    `select sum(amount_cents) as "totalPaid" from claim_payments where claim_id = $1 and tenant_id = $2`,
    [claimId, tenantId],
  );

  const claimResult = await pool.query(
    `select total_charges from claims where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  const totalPaid = paymentsResult.rows[0]?.totalPaid || 0;
  const totalCents = Math.round((claimResult.rows[0]?.total_charges || 0) * 100);

  if (totalPaid >= totalCents && existing.rows[0].status !== "paid") {
    await pool.query(
      `update claims set status = 'paid', updated_at = now(), paid_amount = total_charges where id = $1 and tenant_id = $2`,
      [claimId, tenantId]
    );

    await pool.query(
      `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
       values ($1, $2, $3, $4, $5, $6, now())`,
      [crypto.randomUUID(), tenantId, claimId, "paid", "Fully paid", req.user!.id],
    );
  }

  await auditLog(tenantId, req.user!.id, "claim_payment_posted", "claim", claimId);
  res.status(201).json({ id: paymentId });
});

// GET /api/claims/modifiers - Get modifier rules
claimsRouter.get("/modifiers", requireAuth, async (req: AuthedRequest, res) => {
  const rules = await getAllModifierRules();
  res.json({ modifiers: rules });
});

// GET /api/claims/modifiers/:code - Get specific modifier info
claimsRouter.get("/modifiers/:code", requireAuth, async (req: AuthedRequest, res) => {
  const code = String(req.params.code);
  const info = await getModifierInfo(code);

  if (!info) {
    return res.status(404).json({ error: "Modifier not found" });
  }

  res.json(info);
});

// POST /api/claims/:id/suggest-modifiers - Suggest modifiers for claim
claimsRouter.post("/:id/suggest-modifiers", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  // Load claim
  const claimResult = await pool.query(
    `select line_items from claims where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const lineItems = claimResult.rows[0].line_items || [];
  const suggestions = await suggestModifiers(tenantId, lineItems);

  res.json({ suggestions });
});

// GET /api/claims/:id - Get single claim with detail
claimsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  // Fetch claim
  const claimResult = await pool.query(
    `select
      c.id, c.claim_number as "claimNumber", c.encounter_id as "encounterId",
      c.patient_id as "patientId", c.total_charges as "totalCharges", c.status,
      c.payer, c.payer_id as "payerId", c.payer_name as "payerName",
      c.submitted_at as "submittedAt", c.service_date as "serviceDate",
      c.line_items as "lineItems", c.scrub_status as "scrubStatus",
      c.scrub_errors as "scrubErrors", c.scrub_warnings as "scrubWarnings",
      c.scrub_info as "scrubInfo", c.last_scrubbed_at as "lastScrubbedAt",
      c.is_cosmetic as "isCosmetic", c.cosmetic_reason as "cosmeticReason",
      c.denial_reason as "denialReason", c.denial_code as "denialCode",
      c.denial_date as "denialDate", c.denial_category as "denialCategory",
      c.appeal_status as "appealStatus", c.appeal_notes as "appealNotes",
      c.appeal_submitted_at as "appealSubmittedAt",
      c.created_at as "createdAt", c.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      p.dob, p.insurance_plan_name as "insurancePlanName",
      pr.full_name as "providerName"
    from claims c
    join patients p on p.id = c.patient_id
    left join encounters e on e.id = c.encounter_id
    left join providers pr on pr.id = e.provider_id
    where c.id = $1 and c.tenant_id = $2`,
    [claimId, tenantId],
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const claim = claimResult.rows[0];

  // Fetch payments
  const paymentsResult = await pool.query(
    `select id, amount_cents as "amountCents", payment_date as "paymentDate",
            payment_method as "paymentMethod", payer, check_number as "checkNumber",
            notes, created_at as "createdAt"
     from claim_payments
     where claim_id = $1 and tenant_id = $2
     order by payment_date desc`,
    [claimId, tenantId],
  );

  // Fetch status history
  const historyResult = await pool.query(
    `select id, status, notes, changed_by as "changedBy", changed_at as "changedAt"
     from claim_status_history
     where claim_id = $1 and tenant_id = $2
     order by changed_at desc`,
    [claimId, tenantId],
  );

  // Fetch diagnoses
  const diagnosesResult = await pool.query(
    `select id, icd10_code as "icd10Code", description, is_primary as "isPrimary",
            sequence_number as "sequenceNumber"
     from claim_diagnoses
     where claim_id = $1 and tenant_id = $2
     order by is_primary desc, sequence_number asc`,
    [claimId, tenantId],
  );

  // Fetch charges
  const chargesResult = await pool.query(
    `select id, cpt_code as "cptCode", description, modifiers, quantity,
            fee_cents as "feeCents", linked_diagnosis_ids as "linkedDiagnosisIds",
            sequence_number as "sequenceNumber"
     from claim_charges
     where claim_id = $1 and tenant_id = $2
     order by sequence_number asc`,
    [claimId, tenantId],
  );

  res.json({
    claim,
    payments: paymentsResult.rows,
    statusHistory: historyResult.rows,
    diagnoses: diagnosesResult.rows,
    charges: chargesResult.rows,
  });
});

// Import workflow orchestrator for ERA processing
import { workflowOrchestrator } from "../services/workflowOrchestrator";

// ERA/EOB import schema
const eraImportSchema = z.object({
  filename: z.string().optional(),
  claims: z.array(z.object({
    claimNumber: z.string().optional(),
    claimId: z.string().optional(),
    patientName: z.string().optional(),
    serviceDate: z.string().optional(),
    paidAmountCents: z.number().int(),
    paymentDate: z.string().optional(),
    payerName: z.string().optional(),
    checkNumber: z.string().optional(),
    denialCode: z.string().optional(),
    denialReason: z.string().optional(),
    patientResponsibilityCents: z.number().int().optional(),
    adjustments: z.array(z.object({
      code: z.string(),
      reason: z.string().optional(),
      amountCents: z.number().int(),
    })).optional(),
  })),
});

// POST /api/claims/era/import - Import ERA/EOB file with enhanced auto-matching and posting
claimsRouter.post("/era/import", requireAuth, requireRoles(["admin", "billing"]), async (req: AuthedRequest, res) => {
  const parsed = eraImportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { filename, claims } = parsed.data;

  // Create ERA import record
  const eraId = crypto.randomUUID();

  // Tracking for summary
  const summary = {
    totalClaims: claims.length,
    matched: 0,
    autoPosted: 0,
    unmatched: 0,
    denied: 0,
    partialPayments: 0,
    totalPaidCents: 0,
    totalAdjustmentsCents: 0,
    errors: [] as { claimNumber: string; error: string }[],
    matchedClaims: [] as { claimNumber: string; claimId: string; paidCents: number; status: string }[],
    unmatchedClaims: [] as { claimNumber: string; patientName?: string; serviceDate?: string; paidCents: number }[],
  };

  try {
    await pool.query(
      `INSERT INTO era_imports (id, tenant_id, filename, claim_count, status, imported_by, created_at)
       VALUES ($1, $2, $3, $4, 'processing', $5, NOW())
       ON CONFLICT DO NOTHING`,
      [eraId, tenantId, filename || `ERA-${Date.now()}`, claims.length, userId]
    );

    // Process each claim payment
    for (const claimPayment of claims) {
      try {
        // Enhanced matching: try multiple strategies
        let matchedClaim = null;

        // Strategy 1: Match by claim ID (if provided)
        if (claimPayment.claimId) {
          const result = await pool.query(
            `SELECT id, claim_number, total_charges, status, patient_id
             FROM claims WHERE id = $1 AND tenant_id = $2`,
            [claimPayment.claimId, tenantId]
          );
          if (result.rowCount) matchedClaim = result.rows[0];
        }

        // Strategy 2: Match by claim number (most common)
        if (!matchedClaim && claimPayment.claimNumber) {
          const result = await pool.query(
            `SELECT id, claim_number, total_charges, status, patient_id
             FROM claims WHERE claim_number = $1 AND tenant_id = $2`,
            [claimPayment.claimNumber, tenantId]
          );
          if (result.rowCount) matchedClaim = result.rows[0];
        }

        // Strategy 3: Match by patient name + service date (fuzzy matching)
        if (!matchedClaim && claimPayment.patientName && claimPayment.serviceDate) {
          // Parse patient name (try "Last, First" or "First Last")
          const nameParts = claimPayment.patientName.includes(",")
            ? claimPayment.patientName.split(",").map((s) => s.trim())
            : claimPayment.patientName.split(" ");

          const lastName = nameParts[0];
          const firstName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

          const result = await pool.query(
            `SELECT c.id, c.claim_number, c.total_charges, c.status, c.patient_id
             FROM claims c
             JOIN patients p ON p.id = c.patient_id
             WHERE c.tenant_id = $1
               AND c.service_date = $2
               AND (LOWER(p.last_name) = LOWER($3) OR LOWER(p.last_name) LIKE LOWER($4))
               AND (LOWER(p.first_name) = LOWER($5) OR LOWER(p.first_name) LIKE LOWER($6))
               AND c.status IN ('submitted', 'accepted', 'appealed')
             ORDER BY c.created_at DESC
             LIMIT 1`,
            [tenantId, claimPayment.serviceDate, lastName, `${lastName}%`, firstName, `${firstName}%`]
          );
          if (result.rowCount) matchedClaim = result.rows[0];
        }

        if (!matchedClaim) {
          summary.unmatched++;
          summary.unmatchedClaims.push({
            claimNumber: claimPayment.claimNumber || "Unknown",
            patientName: claimPayment.patientName,
            serviceDate: claimPayment.serviceDate,
            paidCents: claimPayment.paidAmountCents,
          });
          continue;
        }

        summary.matched++;

        // Auto-post payment
        const paymentId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO claim_payments
           (id, tenant_id, claim_id, amount_cents, payment_date, payment_method,
            payer, check_number, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, 'ERA', $6, $7, $8, $9)`,
          [
            paymentId,
            tenantId,
            matchedClaim.id,
            claimPayment.paidAmountCents,
            claimPayment.paymentDate || new Date().toISOString().split("T")[0],
            claimPayment.payerName || null,
            claimPayment.checkNumber || null,
            `Auto-posted from ERA ${filename || eraId}`,
            userId,
          ]
        );

        summary.autoPosted++;
        summary.totalPaidCents += claimPayment.paidAmountCents;

        // Process adjustments
        if (claimPayment.adjustments && claimPayment.adjustments.length > 0) {
          for (const adj of claimPayment.adjustments) {
            await pool.query(
              `INSERT INTO claim_adjustments
               (id, tenant_id, claim_id, adjustment_code, adjustment_reason,
                amount_cents, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
              [
                crypto.randomUUID(),
                tenantId,
                matchedClaim.id,
                adj.code,
                adj.reason || null,
                adj.amountCents,
              ]
            );
            summary.totalAdjustmentsCents += adj.amountCents;
          }
        }

        // Determine new claim status
        let newStatus = matchedClaim.status;
        const totalChargesCents = Math.round(matchedClaim.total_charges * 100);

        // Check total paid so far
        const totalPaidResult = await pool.query(
          `SELECT COALESCE(SUM(amount_cents), 0) as total FROM claim_payments WHERE claim_id = $1`,
          [matchedClaim.id]
        );
        const totalPaid = parseInt(totalPaidResult.rows[0].total);

        if (claimPayment.denialCode) {
          // Claim was denied
          newStatus = "denied";
          summary.denied++;
          await pool.query(
            `UPDATE claims
             SET status = 'denied', denial_code = $1, denial_reason = $2, denial_date = NOW()
             WHERE id = $3`,
            [claimPayment.denialCode, claimPayment.denialReason || null, matchedClaim.id]
          );
        } else if (totalPaid >= totalChargesCents) {
          // Fully paid
          newStatus = "paid";
          await pool.query(
            `UPDATE claims SET status = 'paid', paid_amount = total_charges, adjudicated_at = NOW() WHERE id = $1`,
            [matchedClaim.id]
          );
        } else if (claimPayment.paidAmountCents > 0 && totalPaid < totalChargesCents) {
          // Partial payment
          summary.partialPayments++;
          await pool.query(
            `UPDATE claims SET paid_amount = $1, adjudicated_at = NOW() WHERE id = $2`,
            [totalPaid / 100, matchedClaim.id]
          );
        }

        // Handle patient responsibility
        if (claimPayment.patientResponsibilityCents && claimPayment.patientResponsibilityCents > 0) {
          await pool.query(
            `UPDATE claims SET patient_responsibility = $1 WHERE id = $2`,
            [claimPayment.patientResponsibilityCents / 100, matchedClaim.id]
          );
        }

        // Add to status history
        await pool.query(
          `INSERT INTO claim_status_history (id, tenant_id, claim_id, status, notes, changed_by, changed_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            crypto.randomUUID(),
            tenantId,
            matchedClaim.id,
            newStatus,
            `ERA auto-post: $${(claimPayment.paidAmountCents / 100).toFixed(2)} paid`,
            userId,
          ]
        );

        summary.matchedClaims.push({
          claimNumber: matchedClaim.claim_number,
          claimId: matchedClaim.id,
          paidCents: claimPayment.paidAmountCents,
          status: newStatus,
        });

        // Emit payment received event
        const todayStr = new Date().toISOString().split("T")[0] as string;
        emitPaymentReceived(tenantId, {
          id: paymentId,
          patientId: matchedClaim.patient_id,
          claimId: matchedClaim.id,
          amount: claimPayment.paidAmountCents / 100,
          paymentDate: claimPayment.paymentDate || todayStr,
          paymentMethod: "ERA",
          payer: claimPayment.payerName,
          createdAt: new Date().toISOString(),
        });

      } catch (claimError: any) {
        summary.errors.push({
          claimNumber: claimPayment.claimNumber || "Unknown",
          error: claimError.message,
        });
        logger.error("Error processing ERA claim", {
          claimNumber: claimPayment.claimNumber,
          error: claimError.message,
        });
      }
    }

    // Update ERA import record with results
    await pool.query(
      `UPDATE era_imports
       SET status = 'completed',
           completed_at = NOW(),
           matched_count = $1,
           unmatched_count = $2,
           total_paid_cents = $3,
           summary = $4
       WHERE id = $5`,
      [
        summary.matched,
        summary.unmatched,
        summary.totalPaidCents,
        JSON.stringify(summary),
        eraId,
      ]
    );

    await auditLog(tenantId, userId, "era_imported", "era", eraId);

    logger.info("ERA import completed", {
      eraId,
      matched: summary.matched,
      unmatched: summary.unmatched,
      autoPosted: summary.autoPosted,
    });

    res.status(201).json({
      eraId,
      filename: filename || `ERA-${eraId.substring(0, 8)}`,
      summary: {
        totalClaims: summary.totalClaims,
        matched: summary.matched,
        autoPosted: summary.autoPosted,
        unmatched: summary.unmatched,
        denied: summary.denied,
        partialPayments: summary.partialPayments,
        totalPaid: (summary.totalPaidCents / 100).toFixed(2),
        totalAdjustments: (summary.totalAdjustmentsCents / 100).toFixed(2),
      },
      matchedClaims: summary.matchedClaims,
      unmatchedClaims: summary.unmatchedClaims,
      errors: summary.errors.length > 0 ? summary.errors : undefined,
    });
  } catch (error: any) {
    // Update ERA status to failed
    await pool.query(
      `UPDATE era_imports SET status = 'failed', error_message = $1 WHERE id = $2`,
      [error.message, eraId]
    );

    logger.error("ERA import failed", { eraId, error: error.message });
    res.status(500).json({ error: "Failed to process ERA import", details: error.message });
  }
});

// GET /api/claims/era - List ERA imports
claimsRouter.get("/era", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, limit } = req.query;

  let query = `SELECT id, filename, claim_count as "claimCount", status,
                      imported_by as "importedBy", created_at as "createdAt",
                      completed_at as "completedAt", error_message as "errorMessage",
                      matched_count as "matchedCount", unmatched_count as "unmatchedCount",
                      total_paid_cents as "totalPaidCents"
               FROM era_imports
               WHERE tenant_id = $1`;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` AND status = $${paramCount}`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1}`;
  params.push(parseInt(limit as string) || 50);

  const result = await pool.query(query, params);
  res.json({ eraImports: result.rows });
});

// ============================================
// UNDERPAYMENT DETECTION
// ============================================

/**
 * Compare paid amount vs expected (from fee schedule)
 * Returns claims with significant variance (configurable threshold, default >10%)
 */
async function detectUnderpayment(
  tenantId: string,
  claimId: string
): Promise<{
  isUnderpaid: boolean;
  expectedCents: number;
  paidCents: number;
  variancePercent: number;
  varianceCents: number;
  lineItemAnalysis: {
    cpt: string;
    expectedCents: number;
    paidCents: number;
    variancePercent: number;
  }[];
}> {
  // Get claim with line items
  const claimResult = await pool.query(
    `SELECT c.id, c.line_items, c.total_charges, c.payer_id, c.payer_name,
            COALESCE(SUM(cp.amount_cents), 0) as total_paid_cents
     FROM claims c
     LEFT JOIN claim_payments cp ON cp.claim_id = c.id
     WHERE c.id = $1 AND c.tenant_id = $2
     GROUP BY c.id`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    throw new Error("Claim not found");
  }

  const claim = claimResult.rows[0];
  const lineItems = claim.line_items || [];
  const totalPaidCents = parseInt(claim.total_paid_cents);

  // Get payer contract if exists (for expected reimbursement)
  let contractReimbursementPercent: number | null = null;
  if (claim.payer_id || claim.payer_name) {
    const contractResult = await pool.query(
      `SELECT reimbursement_percentage, medicare_percentage, fee_schedule_id
       FROM payer_contracts
       WHERE tenant_id = $1
         AND (payer_id = $2 OR payer_name = $3)
         AND status = 'active'
       ORDER BY effective_date DESC
       LIMIT 1`,
      [tenantId, claim.payer_id, claim.payer_name]
    );

    if (contractResult.rowCount) {
      contractReimbursementPercent = contractResult.rows[0].reimbursement_percentage ||
        contractResult.rows[0].medicare_percentage;
    }
  }

  // Get default fee schedule for expected amounts
  const feeScheduleResult = await pool.query(
    `SELECT fsi.cpt_code, fsi.fee_cents
     FROM fee_schedule_items fsi
     JOIN fee_schedules fs ON fs.id = fsi.fee_schedule_id
     WHERE fs.tenant_id = $1 AND fs.is_default = true`,
    [tenantId]
  );

  const feeScheduleMap: Record<string, number> = {};
  for (const row of feeScheduleResult.rows) {
    feeScheduleMap[row.cpt_code] = row.fee_cents;
  }

  // Calculate expected amounts for each line item
  let totalExpectedCents = 0;
  const lineItemAnalysis: {
    cpt: string;
    expectedCents: number;
    paidCents: number;
    variancePercent: number;
  }[] = [];

  for (const item of lineItems) {
    const cptCode = item.cpt;
    const units = item.units || 1;

    // Get expected from fee schedule
    let expectedCents = 0;
    if (feeScheduleMap[cptCode]) {
      expectedCents = feeScheduleMap[cptCode] * units;
    } else {
      // Fall back to the charge amount from the claim
      expectedCents = Math.round((item.charge || 0) * 100 * units);
    }

    // Apply contract reimbursement percentage if available
    if (contractReimbursementPercent && expectedCents > 0) {
      expectedCents = Math.round(expectedCents * (contractReimbursementPercent / 100));
    }

    totalExpectedCents += expectedCents;

    // We don't have per-line-item paid amounts in this schema,
    // so we'll distribute proportionally for analysis
    const proportion = expectedCents / (totalExpectedCents || 1);
    const estimatedPaidCents = Math.round(totalPaidCents * proportion);
    const itemVariancePercent = expectedCents > 0
      ? ((expectedCents - estimatedPaidCents) / expectedCents) * 100
      : 0;

    lineItemAnalysis.push({
      cpt: cptCode,
      expectedCents,
      paidCents: estimatedPaidCents,
      variancePercent: Math.round(itemVariancePercent * 100) / 100,
    });
  }

  // If no fee schedule data, use claim's total_charges as expected
  if (totalExpectedCents === 0) {
    totalExpectedCents = Math.round(claim.total_charges * 100);
    if (contractReimbursementPercent) {
      totalExpectedCents = Math.round(totalExpectedCents * (contractReimbursementPercent / 100));
    }
  }

  // Calculate overall variance
  const varianceCents = totalExpectedCents - totalPaidCents;
  const variancePercent = totalExpectedCents > 0
    ? (varianceCents / totalExpectedCents) * 100
    : 0;

  return {
    isUnderpaid: variancePercent > 10,
    expectedCents: totalExpectedCents,
    paidCents: totalPaidCents,
    variancePercent: Math.round(variancePercent * 100) / 100,
    varianceCents,
    lineItemAnalysis,
  };
}

// GET /api/claims/:id/underpayment - Check single claim for underpayment
claimsRouter.get("/:id/underpayment", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  try {
    const analysis = await detectUnderpayment(tenantId, claimId);
    res.json(analysis);
  } catch (error: any) {
    logger.error("Error checking underpayment", { claimId, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/claims/underpaid - List all underpaid claims
claimsRouter.get("/underpaid/list", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const thresholdPercent = parseFloat(req.query.threshold as string) || 10;
  const limit = parseInt(req.query.limit as string) || 100;
  const minVarianceCents = parseInt(req.query.minVariance as string) || 0;

  try {
    // Get all paid claims with payment data
    const claimsResult = await pool.query(
      `SELECT
         c.id, c.claim_number as "claimNumber", c.patient_id as "patientId",
         c.service_date as "serviceDate", c.total_charges as "totalCharges",
         c.payer_name as "payerName", c.line_items as "lineItems",
         c.status, c.paid_amount as "paidAmount",
         p.first_name as "patientFirstName", p.last_name as "patientLastName",
         COALESCE(SUM(cp.amount_cents), 0) as "totalPaidCents"
       FROM claims c
       JOIN patients p ON p.id = c.patient_id
       LEFT JOIN claim_payments cp ON cp.claim_id = c.id
       WHERE c.tenant_id = $1
         AND c.status IN ('paid', 'accepted')
         AND c.total_charges > 0
       GROUP BY c.id, p.first_name, p.last_name
       HAVING COALESCE(SUM(cp.amount_cents), 0) > 0
       ORDER BY c.service_date DESC
       LIMIT $2`,
      [tenantId, limit * 3] // Get more to filter
    );

    // Get fee schedule for comparison
    const feeScheduleResult = await pool.query(
      `SELECT fsi.cpt_code, fsi.fee_cents
       FROM fee_schedule_items fsi
       JOIN fee_schedules fs ON fs.id = fsi.fee_schedule_id
       WHERE fs.tenant_id = $1 AND fs.is_default = true`,
      [tenantId]
    );

    const feeScheduleMap: Record<string, number> = {};
    for (const row of feeScheduleResult.rows) {
      feeScheduleMap[row.cpt_code] = row.fee_cents;
    }

    // Get payer contracts for reimbursement rates
    const contractsResult = await pool.query(
      `SELECT payer_id, payer_name, reimbursement_percentage, medicare_percentage
       FROM payer_contracts
       WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );

    const contractMap: Record<string, number> = {};
    for (const contract of contractsResult.rows) {
      const rate = contract.reimbursement_percentage || contract.medicare_percentage;
      if (rate) {
        if (contract.payer_id) contractMap[contract.payer_id] = rate;
        if (contract.payer_name) contractMap[contract.payer_name] = rate;
      }
    }

    // Analyze each claim for underpayment
    const underpaidClaims: any[] = [];

    for (const claim of claimsResult.rows) {
      const lineItems = claim.lineItems || [];
      const totalPaidCents = parseInt(claim.totalPaidCents);

      // Calculate expected amount
      let expectedCents = 0;
      for (const item of lineItems) {
        const cptCode = item.cpt;
        const units = item.units || 1;

        if (feeScheduleMap[cptCode]) {
          expectedCents += feeScheduleMap[cptCode] * units;
        } else {
          expectedCents += Math.round((item.charge || 0) * 100 * units);
        }
      }

      // Apply contract rate if available
      const contractRate = contractMap[claim.payerName] || contractMap[claim.payerId];
      if (contractRate && expectedCents > 0) {
        expectedCents = Math.round(expectedCents * (contractRate / 100));
      }

      // Fall back to total_charges if no line items
      if (expectedCents === 0) {
        expectedCents = Math.round(claim.totalCharges * 100);
        if (contractRate) {
          expectedCents = Math.round(expectedCents * (contractRate / 100));
        }
      }

      // Calculate variance
      const varianceCents = expectedCents - totalPaidCents;
      const variancePercent = expectedCents > 0 ? (varianceCents / expectedCents) * 100 : 0;

      // Check if meets threshold
      if (variancePercent >= thresholdPercent && varianceCents >= minVarianceCents) {
        underpaidClaims.push({
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientId: claim.patientId,
          patientName: `${claim.patientFirstName} ${claim.patientLastName}`,
          serviceDate: claim.serviceDate,
          payerName: claim.payerName,
          expectedAmount: (expectedCents / 100).toFixed(2),
          paidAmount: (totalPaidCents / 100).toFixed(2),
          varianceAmount: (varianceCents / 100).toFixed(2),
          variancePercent: Math.round(variancePercent * 100) / 100,
          status: claim.status,
        });
      }
    }

    // Sort by variance amount descending
    underpaidClaims.sort((a, b) => parseFloat(b.varianceAmount) - parseFloat(a.varianceAmount));

    // Apply limit
    const limitedResults = underpaidClaims.slice(0, limit);

    // Calculate summary stats
    const totalUnderpayment = limitedResults.reduce(
      (sum, c) => sum + parseFloat(c.varianceAmount),
      0
    );

    res.json({
      underpaidClaims: limitedResults,
      summary: {
        totalClaims: limitedResults.length,
        totalUnderpayment: totalUnderpayment.toFixed(2),
        averageVariancePercent: limitedResults.length > 0
          ? (limitedResults.reduce((sum, c) => sum + c.variancePercent, 0) / limitedResults.length).toFixed(2)
          : "0.00",
        thresholdUsed: thresholdPercent,
      },
    });
  } catch (error: any) {
    logger.error("Error listing underpaid claims", { error: error.message });
    res.status(500).json({ error: "Failed to analyze underpaid claims" });
  }
});

// POST /api/claims/:id/flag-underpayment - Flag a claim as underpaid for review
claimsRouter.post("/:id/flag-underpayment", requireAuth, requireRoles(["admin", "billing"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const { notes, expectedAmountCents, actualPaidCents, variancePercent } = req.body;

  try {
    // Verify claim exists
    const claimResult = await pool.query(
      `SELECT id, claim_number FROM claims WHERE id = $1 AND tenant_id = $2`,
      [claimId, tenantId]
    );

    if (!claimResult.rowCount) {
      return res.status(404).json({ error: "Claim not found" });
    }

    // Create underpayment flag record
    const flagId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO claim_underpayment_flags
       (id, tenant_id, claim_id, expected_amount_cents, actual_paid_cents,
        variance_percent, notes, status, flagged_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW())`,
      [
        flagId,
        tenantId,
        claimId,
        expectedAmountCents || null,
        actualPaidCents || null,
        variancePercent || null,
        notes || null,
        req.user!.id,
      ]
    );

    // Add to status history
    await pool.query(
      `INSERT INTO claim_status_history (id, tenant_id, claim_id, status, notes, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        crypto.randomUUID(),
        tenantId,
        claimId,
        "underpayment_flagged",
        `Underpayment flagged: expected $${((expectedAmountCents || 0) / 100).toFixed(2)}, received $${((actualPaidCents || 0) / 100).toFixed(2)}`,
        req.user!.id,
      ]
    );

    await auditLog(tenantId, req.user!.id, "claim_underpayment_flagged", "claim", claimId);

    res.json({ ok: true, flagId });
  } catch (error: any) {
    logger.error("Error flagging underpayment", { claimId, error: error.message });
    res.status(500).json({ error: "Failed to flag underpayment" });
  }
});

// GET /api/claims/underpayment-flags - List all underpayment flags for review
claimsRouter.get("/underpayment-flags/list", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status } = req.query;

  let query = `
    SELECT
      uf.id as "flagId",
      uf.claim_id as "claimId",
      c.claim_number as "claimNumber",
      c.patient_id as "patientId",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      c.payer_name as "payerName",
      c.service_date as "serviceDate",
      uf.expected_amount_cents as "expectedAmountCents",
      uf.actual_paid_cents as "actualPaidCents",
      uf.variance_percent as "variancePercent",
      uf.notes,
      uf.status,
      uf.resolution_notes as "resolutionNotes",
      uf.created_at as "createdAt",
      uf.resolved_at as "resolvedAt"
    FROM claim_underpayment_flags uf
    JOIN claims c ON c.id = uf.claim_id
    JOIN patients p ON p.id = c.patient_id
    WHERE uf.tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (status && typeof status === "string") {
    query += ` AND uf.status = $2`;
    params.push(status);
  }

  query += ` ORDER BY uf.created_at DESC`;

  const result = await pool.query(query, params);
  res.json({ underpaymentFlags: result.rows });
});

// GET /api/claims/workflow-analytics - Get workflow analytics for billing dashboard
claimsRouter.get("/workflow-analytics", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const days = parseInt(req.query.days as string) || 30;

  try {
    // Get daily analytics for the period
    const analyticsResult = await pool.query(
      `SELECT date, metric, value
       FROM daily_analytics
       WHERE tenant_id = $1 AND date >= CURRENT_DATE - $2::INT
       ORDER BY date DESC, metric`,
      [tenantId, days]
    );

    // Pivot the data into a more usable format
    const analyticsMap: Record<string, Record<string, number>> = {};
    for (const row of analyticsResult.rows) {
      const dateKey = row.date.toISOString().split('T')[0];
      if (!analyticsMap[dateKey]) {
        analyticsMap[dateKey] = {};
      }
      analyticsMap[dateKey][row.metric] = parseFloat(row.value);
    }

    // Get recent workflow events for debugging
    const eventsResult = await pool.query(
      `SELECT event_type, entity_type, COUNT(*) as count
       FROM workflow_events
       WHERE tenant_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY event_type, entity_type
       ORDER BY count DESC
       LIMIT 20`,
      [tenantId, days]
    );

    // Get recent workflow errors
    const errorsResult = await pool.query(
      `SELECT event_type, entity_type, error_message, COUNT(*) as count
       FROM workflow_errors
       WHERE tenant_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY event_type, entity_type, error_message
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId, days]
    );

    res.json({
      dailyAnalytics: analyticsMap,
      workflowEventCounts: eventsResult.rows,
      recentErrors: errorsResult.rows,
    });
  } catch (error: any) {
    logger.error("Error fetching workflow analytics", { error: error.message });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});
