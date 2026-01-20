import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

// Validation schemas
const injectionSiteSchema = z.object({
  region: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  units: z.number().optional(),
  ml: z.number().optional(),
  depth: z.string().optional(),
  technique: z.string().optional(),
  notes: z.string().optional(),
});

const deviceSettingsSchema = z.object({
  fluence: z.number().optional(),
  pulse_duration: z.number().optional(),
  spot_size: z.number().optional(),
  passes: z.number().optional(),
  wavelength: z.number().optional(),
  additional_settings: z.record(z.string(), z.unknown()).optional(),
});

const cosmeticTreatmentSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().optional(),
  treatmentType: z.enum(["botox", "filler", "laser", "peel", "microneedling", "kybella", "sclerotherapy", "prp", "other"]),
  productName: z.string().optional(),
  treatmentDate: z.string(), // ISO date
  providerId: z.string().min(1),

  // For neurotoxins
  injectionSites: z.array(injectionSiteSchema).optional(),
  totalUnits: z.number().optional(),
  dilutionRatio: z.string().optional(),

  // For fillers
  fillerSites: z.array(injectionSiteSchema).optional(),
  totalMl: z.number().optional(),
  fillerType: z.enum(["hyaluronic_acid", "calcium_hydroxylapatite", "poly_l_lactic_acid", "pmma", "other"]).optional(),

  // Product tracking
  lotNumber: z.string().optional(),
  expirationDate: z.string().optional(), // ISO date

  // For lasers/devices
  deviceName: z.string().optional(),
  settings: deviceSettingsSchema.optional(),
  treatmentAreas: z.array(z.string()).optional(),
  passes: z.number().int().optional(),

  // For peels
  peelStrength: z.enum(["superficial", "medium", "deep"]).optional(),
  peelAgent: z.string().optional(),

  // Photos
  beforePhotoId: z.string().optional(),
  afterPhotoId: z.string().optional(),

  // Consent and follow-up
  patientConsentSigned: z.boolean().default(false),
  consentFormId: z.string().optional(),
  complications: z.string().optional(),
  adverseReactions: z.string().optional(),
  followUpDate: z.string().optional(), // ISO date
  followUpInstructions: z.string().optional(),

  // Billing
  cptCodes: z.array(z.string()).optional(),
  chargedAmountCents: z.number().int().optional(),

  // Clinical notes
  indication: z.string().optional(),
  preTreatmentAssessment: z.string().optional(),
  postTreatmentInstructions: z.string().optional(),
  notes: z.string().optional(),
});

const updateCosmeticTreatmentSchema = cosmeticTreatmentSchema.partial().omit({ patientId: true, providerId: true });

const botoxInjectionMapSchema = z.object({
  treatmentId: z.string().min(1),
  anatomicalRegion: z.enum([
    "glabella", "forehead", "crow_feet_right", "crow_feet_left", "bunny_lines",
    "lip_flip", "gummy_smile", "masseter_right", "masseter_left", "platysmal_bands",
    "chin", "neck", "axilla_right", "axilla_left", "other"
  ]),
  bodyView: z.enum(["front", "back", "left", "right", "face_front", "face_left", "face_right"]),
  xCoordinate: z.number().min(0).max(100),
  yCoordinate: z.number().min(0).max(100),
  unitsInjected: z.number().positive(),
  numberOfInjectionPoints: z.number().int().positive().optional(),
  injectionDepth: z.enum(["intradermal", "subcutaneous", "intramuscular"]).optional(),
  needleGauge: z.string().optional(),
  notes: z.string().optional(),
});

const fillerInjectionMapSchema = z.object({
  treatmentId: z.string().min(1),
  anatomicalRegion: z.enum([
    "lips_upper", "lips_lower", "lips_border", "nasolabial_fold_right", "nasolabial_fold_left",
    "marionette_lines_right", "marionette_lines_left", "cheek_right", "cheek_left",
    "tear_trough_right", "tear_trough_left", "temple_right", "temple_left",
    "chin", "jawline_right", "jawline_left", "nose", "hand_right", "hand_left", "other"
  ]),
  bodyView: z.enum(["front", "back", "left", "right", "face_front", "face_left", "face_right"]),
  xCoordinate: z.number().min(0).max(100),
  yCoordinate: z.number().min(0).max(100),
  mlInjected: z.number().positive(),
  syringeSize: z.number().positive().optional(),
  injectionDepth: z.enum(["subcutaneous", "supraperiosteal", "deep_dermal", "superficial_dermal"]).optional(),
  injectionTechnique: z.enum(["linear_threading", "serial_puncture", "cross_hatching", "fanning", "bolus"]).optional(),
  cannulaVsNeedle: z.enum(["cannula", "needle"]).optional(),
  gaugeSize: z.string().optional(),
  notes: z.string().optional(),
});

const treatmentEventSchema = z.object({
  treatmentId: z.string().min(1),
  eventType: z.enum(["follow_up", "touch_up", "complication", "reversal", "patient_inquiry", "other"]),
  eventDate: z.string().optional(), // ISO datetime, defaults to now
  description: z.string().min(1),
  severity: z.enum(["mild", "moderate", "severe"]).optional(),
  resolution: z.string().optional(),
  photoId: z.string().optional(),
  providerId: z.string().optional(),
  notes: z.string().optional(),
});

export const cosmeticTreatmentsRouter = Router();

// ==================== COSMETIC TREATMENTS ENDPOINTS ====================

// Get all cosmetic treatments (with filters)
cosmeticTreatmentsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, providerId, treatmentType, fromDate, toDate, limit = "100" } = req.query;

  let query = `
    SELECT
      ct.id, ct.patient_id as "patientId", ct.encounter_id as "encounterId",
      ct.treatment_type as "treatmentType", ct.product_name as "productName",
      ct.treatment_date as "treatmentDate", ct.provider_id as "providerId",
      ct.injection_sites as "injectionSites", ct.total_units as "totalUnits",
      ct.dilution_ratio as "dilutionRatio",
      ct.filler_sites as "fillerSites", ct.total_ml as "totalMl", ct.filler_type as "fillerType",
      ct.lot_number as "lotNumber", ct.expiration_date as "expirationDate",
      ct.device_name as "deviceName", ct.settings, ct.treatment_areas as "treatmentAreas",
      ct.passes, ct.peel_strength as "peelStrength", ct.peel_agent as "peelAgent",
      ct.before_photo_id as "beforePhotoId", ct.after_photo_id as "afterPhotoId",
      ct.patient_consent_signed as "patientConsentSigned",
      ct.consent_form_id as "consentFormId",
      ct.complications, ct.adverse_reactions as "adverseReactions",
      ct.follow_up_date as "followUpDate", ct.follow_up_instructions as "followUpInstructions",
      ct.cpt_codes as "cptCodes", ct.charged_amount_cents as "chargedAmountCents",
      ct.indication, ct.pre_treatment_assessment as "preTreatmentAssessment",
      ct.post_treatment_instructions as "postTreatmentInstructions",
      ct.notes, ct.created_at as "createdAt", ct.updated_at as "updatedAt",
      p.first_name || ' ' || p.last_name as "patientName",
      pr.first_name || ' ' || pr.last_name as "providerName"
    FROM cosmetic_treatments ct
    JOIN patients p ON ct.patient_id = p.id
    JOIN providers pr ON ct.provider_id = pr.id
    WHERE ct.tenant_id = $1 AND ct.deleted_at IS NULL
  `;

  const params: any[] = [tenantId];

  if (patientId && typeof patientId === "string") {
    params.push(patientId);
    query += ` AND ct.patient_id = $${params.length}`;
  }

  if (providerId && typeof providerId === "string") {
    params.push(providerId);
    query += ` AND ct.provider_id = $${params.length}`;
  }

  if (treatmentType && typeof treatmentType === "string") {
    params.push(treatmentType);
    query += ` AND ct.treatment_type = $${params.length}`;
  }

  if (fromDate && typeof fromDate === "string") {
    params.push(fromDate);
    query += ` AND ct.treatment_date >= $${params.length}`;
  }

  if (toDate && typeof toDate === "string") {
    params.push(toDate);
    query += ` AND ct.treatment_date <= $${params.length}`;
  }

  params.push(parseInt(limit as string));
  query += ` ORDER BY ct.treatment_date DESC LIMIT $${params.length}`;

  const result = await pool.query(query, params);
  res.json({ treatments: result.rows });
});

// Get single cosmetic treatment with detailed injection sites
cosmeticTreatmentsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const [treatmentResult, botoxSites, fillerSites, events] = await Promise.all([
    pool.query(
      `SELECT
        ct.id, ct.patient_id as "patientId", ct.encounter_id as "encounterId",
        ct.treatment_type as "treatmentType", ct.product_name as "productName",
        ct.treatment_date as "treatmentDate", ct.provider_id as "providerId",
        ct.injection_sites as "injectionSites", ct.total_units as "totalUnits",
        ct.dilution_ratio as "dilutionRatio",
        ct.filler_sites as "fillerSites", ct.total_ml as "totalMl", ct.filler_type as "fillerType",
        ct.lot_number as "lotNumber", ct.expiration_date as "expirationDate",
        ct.device_name as "deviceName", ct.settings, ct.treatment_areas as "treatmentAreas",
        ct.passes, ct.peel_strength as "peelStrength", ct.peel_agent as "peelAgent",
        ct.before_photo_id as "beforePhotoId", ct.after_photo_id as "afterPhotoId",
        ct.patient_consent_signed as "patientConsentSigned",
        ct.consent_form_id as "consentFormId",
        ct.complications, ct.adverse_reactions as "adverseReactions",
        ct.follow_up_date as "followUpDate", ct.follow_up_instructions as "followUpInstructions",
        ct.cpt_codes as "cptCodes", ct.charged_amount_cents as "chargedAmountCents",
        ct.indication, ct.pre_treatment_assessment as "preTreatmentAssessment",
        ct.post_treatment_instructions as "postTreatmentInstructions",
        ct.notes, ct.created_at as "createdAt", ct.updated_at as "updatedAt",
        p.first_name || ' ' || p.last_name as "patientName", p.mrn,
        pr.first_name || ' ' || pr.last_name as "providerName"
      FROM cosmetic_treatments ct
      JOIN patients p ON ct.patient_id = p.id
      JOIN providers pr ON ct.provider_id = pr.id
      WHERE ct.id = $1 AND ct.tenant_id = $2 AND ct.deleted_at IS NULL`,
      [id, tenantId]
    ),
    pool.query(
      `SELECT
        id, anatomical_region as "anatomicalRegion", body_view as "bodyView",
        x_coordinate as "xCoordinate", y_coordinate as "yCoordinate",
        units_injected as "unitsInjected", number_of_injection_points as "numberOfInjectionPoints",
        injection_depth as "injectionDepth", needle_gauge as "needleGauge", notes
      FROM botox_injection_map WHERE treatment_id = $1 ORDER BY created_at`,
      [id]
    ),
    pool.query(
      `SELECT
        id, anatomical_region as "anatomicalRegion", body_view as "bodyView",
        x_coordinate as "xCoordinate", y_coordinate as "yCoordinate",
        ml_injected as "mlInjected", syringe_size as "syringeSize",
        injection_depth as "injectionDepth", injection_technique as "injectionTechnique",
        cannula_vs_needle as "cannulaVsNeedle", gauge_size as "gaugeSize", notes
      FROM filler_injection_map WHERE treatment_id = $1 ORDER BY created_at`,
      [id]
    ),
    pool.query(
      `SELECT
        id, event_type as "eventType", event_date as "eventDate",
        description, severity, resolution, photo_id as "photoId",
        provider_id as "providerId", notes, created_at as "createdAt"
      FROM cosmetic_treatment_events WHERE treatment_id = $1 ORDER BY event_date DESC`,
      [id]
    ),
  ]);

  if (!treatmentResult.rowCount) {
    return res.status(404).json({ error: "Treatment not found" });
  }

  const treatment = treatmentResult.rows[0];
  treatment.botoxInjectionSites = botoxSites.rows;
  treatment.fillerInjectionSites = fillerSites.rows;
  treatment.events = events.rows;

  res.json({ treatment });
});

// Create cosmetic treatment
cosmeticTreatmentsRouter.post("/", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = cosmeticTreatmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  const result = await pool.query(
    `INSERT INTO cosmetic_treatments(
      tenant_id, patient_id, encounter_id, treatment_type, product_name, treatment_date, provider_id,
      injection_sites, total_units, dilution_ratio,
      filler_sites, total_ml, filler_type,
      lot_number, expiration_date,
      device_name, settings, treatment_areas, passes,
      peel_strength, peel_agent,
      before_photo_id, after_photo_id,
      patient_consent_signed, consent_form_id, complications, adverse_reactions,
      follow_up_date, follow_up_instructions,
      cpt_codes, charged_amount_cents,
      indication, pre_treatment_assessment, post_treatment_instructions, notes,
      created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36
    )
    RETURNING id`,
    [
      tenantId,
      payload.patientId,
      payload.encounterId || null,
      payload.treatmentType,
      payload.productName || null,
      payload.treatmentDate,
      payload.providerId,
      payload.injectionSites ? JSON.stringify(payload.injectionSites) : null,
      payload.totalUnits || null,
      payload.dilutionRatio || null,
      payload.fillerSites ? JSON.stringify(payload.fillerSites) : null,
      payload.totalMl || null,
      payload.fillerType || null,
      payload.lotNumber || null,
      payload.expirationDate || null,
      payload.deviceName || null,
      payload.settings ? JSON.stringify(payload.settings) : null,
      payload.treatmentAreas || null,
      payload.passes || null,
      payload.peelStrength || null,
      payload.peelAgent || null,
      payload.beforePhotoId || null,
      payload.afterPhotoId || null,
      payload.patientConsentSigned,
      payload.consentFormId || null,
      payload.complications || null,
      payload.adverseReactions || null,
      payload.followUpDate || null,
      payload.followUpInstructions || null,
      payload.cptCodes || null,
      payload.chargedAmountCents || null,
      payload.indication || null,
      payload.preTreatmentAssessment || null,
      payload.postTreatmentInstructions || null,
      payload.notes || null,
      req.user!.id,
    ]
  );

  const treatmentId = result.rows[0].id;
  await auditLog(tenantId, req.user!.id, "cosmetic_treatment_create", "cosmetic_treatment", treatmentId);

  res.status(201).json({ id: treatmentId });
});

// Update cosmetic treatment
cosmeticTreatmentsRouter.put("/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = updateCosmeticTreatmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const payload = parsed.data;

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (payload.encounterId !== undefined) {
    updates.push(`encounter_id = $${paramCount++}`);
    values.push(payload.encounterId);
  }
  if (payload.treatmentType !== undefined) {
    updates.push(`treatment_type = $${paramCount++}`);
    values.push(payload.treatmentType);
  }
  if (payload.productName !== undefined) {
    updates.push(`product_name = $${paramCount++}`);
    values.push(payload.productName);
  }
  if (payload.treatmentDate !== undefined) {
    updates.push(`treatment_date = $${paramCount++}`);
    values.push(payload.treatmentDate);
  }
  if (payload.injectionSites !== undefined) {
    updates.push(`injection_sites = $${paramCount++}`);
    values.push(JSON.stringify(payload.injectionSites));
  }
  if (payload.totalUnits !== undefined) {
    updates.push(`total_units = $${paramCount++}`);
    values.push(payload.totalUnits);
  }
  if (payload.dilutionRatio !== undefined) {
    updates.push(`dilution_ratio = $${paramCount++}`);
    values.push(payload.dilutionRatio);
  }
  if (payload.fillerSites !== undefined) {
    updates.push(`filler_sites = $${paramCount++}`);
    values.push(JSON.stringify(payload.fillerSites));
  }
  if (payload.totalMl !== undefined) {
    updates.push(`total_ml = $${paramCount++}`);
    values.push(payload.totalMl);
  }
  if (payload.fillerType !== undefined) {
    updates.push(`filler_type = $${paramCount++}`);
    values.push(payload.fillerType);
  }
  if (payload.lotNumber !== undefined) {
    updates.push(`lot_number = $${paramCount++}`);
    values.push(payload.lotNumber);
  }
  if (payload.expirationDate !== undefined) {
    updates.push(`expiration_date = $${paramCount++}`);
    values.push(payload.expirationDate);
  }
  if (payload.deviceName !== undefined) {
    updates.push(`device_name = $${paramCount++}`);
    values.push(payload.deviceName);
  }
  if (payload.settings !== undefined) {
    updates.push(`settings = $${paramCount++}`);
    values.push(JSON.stringify(payload.settings));
  }
  if (payload.treatmentAreas !== undefined) {
    updates.push(`treatment_areas = $${paramCount++}`);
    values.push(payload.treatmentAreas);
  }
  if (payload.passes !== undefined) {
    updates.push(`passes = $${paramCount++}`);
    values.push(payload.passes);
  }
  if (payload.peelStrength !== undefined) {
    updates.push(`peel_strength = $${paramCount++}`);
    values.push(payload.peelStrength);
  }
  if (payload.peelAgent !== undefined) {
    updates.push(`peel_agent = $${paramCount++}`);
    values.push(payload.peelAgent);
  }
  if (payload.beforePhotoId !== undefined) {
    updates.push(`before_photo_id = $${paramCount++}`);
    values.push(payload.beforePhotoId);
  }
  if (payload.afterPhotoId !== undefined) {
    updates.push(`after_photo_id = $${paramCount++}`);
    values.push(payload.afterPhotoId);
  }
  if (payload.patientConsentSigned !== undefined) {
    updates.push(`patient_consent_signed = $${paramCount++}`);
    values.push(payload.patientConsentSigned);
  }
  if (payload.consentFormId !== undefined) {
    updates.push(`consent_form_id = $${paramCount++}`);
    values.push(payload.consentFormId);
  }
  if (payload.complications !== undefined) {
    updates.push(`complications = $${paramCount++}`);
    values.push(payload.complications);
  }
  if (payload.adverseReactions !== undefined) {
    updates.push(`adverse_reactions = $${paramCount++}`);
    values.push(payload.adverseReactions);
  }
  if (payload.followUpDate !== undefined) {
    updates.push(`follow_up_date = $${paramCount++}`);
    values.push(payload.followUpDate);
  }
  if (payload.followUpInstructions !== undefined) {
    updates.push(`follow_up_instructions = $${paramCount++}`);
    values.push(payload.followUpInstructions);
  }
  if (payload.cptCodes !== undefined) {
    updates.push(`cpt_codes = $${paramCount++}`);
    values.push(payload.cptCodes);
  }
  if (payload.chargedAmountCents !== undefined) {
    updates.push(`charged_amount_cents = $${paramCount++}`);
    values.push(payload.chargedAmountCents);
  }
  if (payload.indication !== undefined) {
    updates.push(`indication = $${paramCount++}`);
    values.push(payload.indication);
  }
  if (payload.preTreatmentAssessment !== undefined) {
    updates.push(`pre_treatment_assessment = $${paramCount++}`);
    values.push(payload.preTreatmentAssessment);
  }
  if (payload.postTreatmentInstructions !== undefined) {
    updates.push(`post_treatment_instructions = $${paramCount++}`);
    values.push(payload.postTreatmentInstructions);
  }
  if (payload.notes !== undefined) {
    updates.push(`notes = $${paramCount++}`);
    values.push(payload.notes);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  await pool.query(
    `UPDATE cosmetic_treatments SET ${updates.join(", ")} WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL`,
    values
  );

  await auditLog(tenantId, req.user!.id, "cosmetic_treatment_update", "cosmetic_treatment", id!);

  res.json({ success: true });
});

// Soft delete cosmetic treatment
cosmeticTreatmentsRouter.delete("/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(
    `UPDATE cosmetic_treatments SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  await auditLog(tenantId, req.user!.id, "cosmetic_treatment_delete", "cosmetic_treatment", id!);

  res.json({ success: true });
});

// Get patient cosmetic history
cosmeticTreatmentsRouter.get("/patient/:patientId/history", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId } = req.params;

  const result = await pool.query(
    `SELECT * FROM get_patient_cosmetic_history($1, $2)`,
    [patientId, tenantId]
  );

  res.json({ history: result.rows });
});

// Get treatments needing follow-up
cosmeticTreatmentsRouter.get("/alerts/follow-ups", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { days } = req.query;
  const daysAhead = days && typeof days === "string" ? parseInt(days) : 14;

  const result = await pool.query(
    `SELECT * FROM get_treatments_needing_followup($1, $2)`,
    [tenantId, daysAhead]
  );

  res.json({ treatments: result.rows });
});

// ==================== BOTOX INJECTION MAP ENDPOINTS ====================

// Add Botox injection site
cosmeticTreatmentsRouter.post("/botox-sites", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = botoxInjectionMapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // Verify treatment exists and belongs to tenant
  const treatmentCheck = await pool.query(
    `SELECT id FROM cosmetic_treatments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [payload.treatmentId, tenantId]
  );

  if (!treatmentCheck.rowCount) {
    return res.status(404).json({ error: "Treatment not found" });
  }

  const result = await pool.query(
    `INSERT INTO botox_injection_map(
      treatment_id, anatomical_region, body_view, x_coordinate, y_coordinate,
      units_injected, number_of_injection_points, injection_depth, needle_gauge, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id`,
    [
      payload.treatmentId,
      payload.anatomicalRegion,
      payload.bodyView,
      payload.xCoordinate,
      payload.yCoordinate,
      payload.unitsInjected,
      payload.numberOfInjectionPoints || null,
      payload.injectionDepth || null,
      payload.needleGauge || null,
      payload.notes || null,
    ]
  );

  await auditLog(tenantId, req.user!.id, "botox_site_create", "botox_injection_map", result.rows[0].id);

  res.status(201).json({ id: result.rows[0].id });
});

// Get Botox injection sites for a treatment
cosmeticTreatmentsRouter.get("/:treatmentId/botox-sites", requireAuth, async (req: AuthedRequest, res) => {
  const { treatmentId } = req.params;

  const result = await pool.query(
    `SELECT
      id, anatomical_region as "anatomicalRegion", body_view as "bodyView",
      x_coordinate as "xCoordinate", y_coordinate as "yCoordinate",
      units_injected as "unitsInjected", number_of_injection_points as "numberOfInjectionPoints",
      injection_depth as "injectionDepth", needle_gauge as "needleGauge", notes
    FROM botox_injection_map WHERE treatment_id = $1 ORDER BY created_at`,
    [treatmentId]
  );

  res.json({ sites: result.rows });
});

// Delete Botox injection site
cosmeticTreatmentsRouter.delete("/botox-sites/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(
    `DELETE FROM botox_injection_map
     WHERE id = $1
       AND treatment_id IN (SELECT id FROM cosmetic_treatments WHERE tenant_id = $2)`,
    [id, tenantId]
  );

  await auditLog(tenantId, req.user!.id, "botox_site_delete", "botox_injection_map", id!);

  res.json({ success: true });
});

// ==================== FILLER INJECTION MAP ENDPOINTS ====================

// Add filler injection site
cosmeticTreatmentsRouter.post("/filler-sites", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = fillerInjectionMapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // Verify treatment exists and belongs to tenant
  const treatmentCheck = await pool.query(
    `SELECT id FROM cosmetic_treatments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [payload.treatmentId, tenantId]
  );

  if (!treatmentCheck.rowCount) {
    return res.status(404).json({ error: "Treatment not found" });
  }

  const result = await pool.query(
    `INSERT INTO filler_injection_map(
      treatment_id, anatomical_region, body_view, x_coordinate, y_coordinate,
      ml_injected, syringe_size, injection_depth, injection_technique,
      cannula_vs_needle, gauge_size, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id`,
    [
      payload.treatmentId,
      payload.anatomicalRegion,
      payload.bodyView,
      payload.xCoordinate,
      payload.yCoordinate,
      payload.mlInjected,
      payload.syringeSize || null,
      payload.injectionDepth || null,
      payload.injectionTechnique || null,
      payload.cannulaVsNeedle || null,
      payload.gaugeSize || null,
      payload.notes || null,
    ]
  );

  await auditLog(tenantId, req.user!.id, "filler_site_create", "filler_injection_map", result.rows[0].id);

  res.status(201).json({ id: result.rows[0].id });
});

// Get filler injection sites for a treatment
cosmeticTreatmentsRouter.get("/:treatmentId/filler-sites", requireAuth, async (req: AuthedRequest, res) => {
  const { treatmentId } = req.params;

  const result = await pool.query(
    `SELECT
      id, anatomical_region as "anatomicalRegion", body_view as "bodyView",
      x_coordinate as "xCoordinate", y_coordinate as "yCoordinate",
      ml_injected as "mlInjected", syringe_size as "syringeSize",
      injection_depth as "injectionDepth", injection_technique as "injectionTechnique",
      cannula_vs_needle as "cannulaVsNeedle", gauge_size as "gaugeSize", notes
    FROM filler_injection_map WHERE treatment_id = $1 ORDER BY created_at`,
    [treatmentId]
  );

  res.json({ sites: result.rows });
});

// Delete filler injection site
cosmeticTreatmentsRouter.delete("/filler-sites/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(
    `DELETE FROM filler_injection_map
     WHERE id = $1
       AND treatment_id IN (SELECT id FROM cosmetic_treatments WHERE tenant_id = $2)`,
    [id, tenantId]
  );

  await auditLog(tenantId, req.user!.id, "filler_site_delete", "filler_injection_map", id!);

  res.json({ success: true });
});

// ==================== TREATMENT EVENTS ENDPOINTS ====================

// Add treatment event
cosmeticTreatmentsRouter.post("/events", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = treatmentEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // Verify treatment exists and belongs to tenant
  const treatmentCheck = await pool.query(
    `SELECT id FROM cosmetic_treatments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [payload.treatmentId, tenantId]
  );

  if (!treatmentCheck.rowCount) {
    return res.status(404).json({ error: "Treatment not found" });
  }

  const result = await pool.query(
    `INSERT INTO cosmetic_treatment_events(
      treatment_id, event_type, event_date, description, severity, resolution,
      photo_id, provider_id, notes, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id`,
    [
      payload.treatmentId,
      payload.eventType,
      payload.eventDate || new Date().toISOString(),
      payload.description,
      payload.severity || null,
      payload.resolution || null,
      payload.photoId || null,
      payload.providerId || null,
      payload.notes || null,
      req.user!.id,
    ]
  );

  await auditLog(tenantId, req.user!.id, "cosmetic_event_create", "cosmetic_treatment_event", result.rows[0].id);

  res.status(201).json({ id: result.rows[0].id });
});

// Get events for a treatment
cosmeticTreatmentsRouter.get("/:treatmentId/events", requireAuth, async (req: AuthedRequest, res) => {
  const { treatmentId } = req.params;

  const result = await pool.query(
    `SELECT
      id, event_type as "eventType", event_date as "eventDate",
      description, severity, resolution, photo_id as "photoId",
      provider_id as "providerId", notes, created_at as "createdAt"
    FROM cosmetic_treatment_events WHERE treatment_id = $1 ORDER BY event_date DESC`,
    [treatmentId]
  );

  res.json({ events: result.rows });
});

// Delete treatment event
cosmeticTreatmentsRouter.delete("/events/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(
    `DELETE FROM cosmetic_treatment_events
     WHERE id = $1
       AND treatment_id IN (SELECT id FROM cosmetic_treatments WHERE tenant_id = $2)`,
    [id, tenantId]
  );

  await auditLog(tenantId, req.user!.id, "cosmetic_event_delete", "cosmetic_treatment_event", id!);

  res.json({ success: true });
});

// ==================== ANALYTICS & REPORTS ====================

// Get cosmetic treatment statistics
cosmeticTreatmentsRouter.get("/stats/summary", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { fromDate, toDate } = req.query;

  let dateFilter = "";
  const params: any[] = [tenantId];

  if (fromDate && typeof fromDate === "string") {
    params.push(fromDate);
    dateFilter += ` AND ct.treatment_date >= $${params.length}`;
  }

  if (toDate && typeof toDate === "string") {
    params.push(toDate);
    dateFilter += ` AND ct.treatment_date <= $${params.length}`;
  }

  const [totalTreatments, byType, revenue, complications] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) as count FROM cosmetic_treatments WHERE tenant_id = $1 AND deleted_at IS NULL` + dateFilter,
      params
    ),
    pool.query(
      `SELECT treatment_type, COUNT(*) as count
       FROM cosmetic_treatments ct
       WHERE tenant_id = $1 AND deleted_at IS NULL` + dateFilter + `
       GROUP BY treatment_type
       ORDER BY count DESC`,
      params
    ),
    pool.query(
      `SELECT SUM(charged_amount_cents) as total
       FROM cosmetic_treatments ct
       WHERE tenant_id = $1 AND deleted_at IS NULL AND charged_amount_cents IS NOT NULL` + dateFilter,
      params
    ),
    pool.query(
      `SELECT COUNT(DISTINCT cte.treatment_id) as count
       FROM cosmetic_treatment_events cte
       JOIN cosmetic_treatments ct ON cte.treatment_id = ct.id
       WHERE ct.tenant_id = $1 AND ct.deleted_at IS NULL AND cte.event_type = 'complication'` + dateFilter,
      params
    ),
  ]);

  res.json({
    totalTreatments: parseInt(totalTreatments.rows[0].count),
    byType: byType.rows,
    totalRevenueCents: parseInt(revenue.rows[0].total || "0"),
    treatmentsWithComplications: parseInt(complications.rows[0].count),
  });
});
