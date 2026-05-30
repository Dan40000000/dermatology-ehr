import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";
import type { Role } from "../types";

export const codingReviewRouter = Router();

const CODING_REVIEW_ROLES: Role[] = [
  "admin",
  "provider",
  "ma",
  "nurse",
  "billing",
  "manager",
  "compliance_officer",
];

const closedEncounterStatuses = new Set(["signed", "locked", "finalized", "completed", "closed"]);
const closedSuperbillStatuses = new Set(["approved", "submitted", "posted", "finalized", "void"]);
const nonCodableAppointmentStatuses = new Set(["cancelled", "canceled", "no_show", "no-show", "no show"]);

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  providerId: z.string().optional(),
  includeCleared: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

type CodingReviewIssue =
  | "missing_diagnosis"
  | "missing_primary_diagnosis"
  | "missing_charge"
  | "missing_cpt_code"
  | "diagnosis_link_needed"
  | "note_unsigned"
  | "superbill_open"
  | "claim_not_created"
  | "claim_coding_review";

interface CodingReviewRow {
  encounterId: string;
  appointmentId: string | null;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  serviceAt: string;
  appointmentStatus: string | null;
  encounterStatus: string;
  chiefComplaint: string | null;
  diagnosisCount: number;
  primaryDiagnosisCount: number;
  diagnosisCodes: string[];
  chargeCount: number;
  claimableChargeCount: number;
  missingCptCount: number;
  unlinkedChargeCount: number;
  totalChargeCents: number;
  cptCodes: string[];
  superbillId: string | null;
  superbillStatus: string | null;
  claimId: string | null;
  claimStatus: string | null;
}

function defaultDateWindow() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 14);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function numberFrom(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringArrayFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizedAppointmentStatus(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function isCodableAppointmentStatus(value: string | null | undefined): boolean {
  const status = normalizedAppointmentStatus(value);
  return !status || !nonCodableAppointmentStatuses.has(status);
}

function mapReviewRow(row: Record<string, any>): CodingReviewRow {
  return {
    encounterId: String(row.encounterId),
    appointmentId: row.appointmentId ? String(row.appointmentId) : null,
    patientId: String(row.patientId),
    patientName: row.patientName || "Unknown patient",
    providerId: String(row.providerId),
    providerName: row.providerName || "Unknown provider",
    serviceAt: row.serviceAt,
    appointmentStatus: row.appointmentStatus || null,
    encounterStatus: row.encounterStatus || "draft",
    chiefComplaint: row.chiefComplaint || null,
    diagnosisCount: numberFrom(row.diagnosisCount),
    primaryDiagnosisCount: numberFrom(row.primaryDiagnosisCount),
    diagnosisCodes: stringArrayFrom(row.diagnosisCodes),
    chargeCount: numberFrom(row.chargeCount),
    claimableChargeCount: numberFrom(row.claimableChargeCount),
    missingCptCount: numberFrom(row.missingCptCount),
    unlinkedChargeCount: numberFrom(row.unlinkedChargeCount),
    totalChargeCents: numberFrom(row.totalChargeCents),
    cptCodes: stringArrayFrom(row.cptCodes),
    superbillId: row.superbillId ? String(row.superbillId) : null,
    superbillStatus: row.superbillStatus || null,
    claimId: row.claimId ? String(row.claimId) : null,
    claimStatus: row.claimStatus || null,
  };
}

function getIssues(item: CodingReviewRow): CodingReviewIssue[] {
  const issues: CodingReviewIssue[] = [];
  const encounterStatus = item.encounterStatus.toLowerCase();
  const superbillStatus = String(item.superbillStatus || "").toLowerCase();
  const claimStatus = String(item.claimStatus || "").toLowerCase();

  if (item.diagnosisCount === 0) {
    issues.push("missing_diagnosis");
  } else if (item.primaryDiagnosisCount === 0) {
    issues.push("missing_primary_diagnosis");
  }

  if (item.chargeCount === 0) {
    issues.push("missing_charge");
  }
  if (item.missingCptCount > 0) {
    issues.push("missing_cpt_code");
  }
  if (item.unlinkedChargeCount > 0) {
    issues.push("diagnosis_link_needed");
  }
  if (!closedEncounterStatuses.has(encounterStatus)) {
    issues.push("note_unsigned");
  }
  if (item.superbillId && !closedSuperbillStatuses.has(superbillStatus)) {
    issues.push("superbill_open");
  }
  if (item.claimableChargeCount > 0 && !item.claimId) {
    issues.push("claim_not_created");
  }
  if (claimStatus === "draft" || claimStatus === "coding_review") {
    issues.push("claim_coding_review");
  }

  return issues;
}

function ownerForIssues(issues: CodingReviewIssue[]) {
  if (issues.some((issue) => ["missing_diagnosis", "missing_primary_diagnosis", "note_unsigned"].includes(issue))) {
    return "provider";
  }
  if (issues.some((issue) => ["missing_charge", "missing_cpt_code", "diagnosis_link_needed"].includes(issue))) {
    return "clinical_coding";
  }
  return "billing";
}

function severityForIssues(issues: CodingReviewIssue[]) {
  if (issues.some((issue) => ["missing_diagnosis", "missing_charge", "missing_cpt_code"].includes(issue))) {
    return "high";
  }
  if (issues.some((issue) => ["diagnosis_link_needed", "note_unsigned", "claim_not_created"].includes(issue))) {
    return "medium";
  }
  return "low";
}

function reviewSectionForIssues(issues: CodingReviewIssue[]) {
  if (
    issues.some((issue) =>
      [
        "missing_diagnosis",
        "missing_primary_diagnosis",
        "missing_charge",
        "missing_cpt_code",
        "diagnosis_link_needed",
        "superbill_open",
        "claim_not_created",
        "claim_coding_review",
      ].includes(issue),
    )
  ) {
    return "billing";
  }
  return "note";
}

function buildSummary(items: Array<CodingReviewRow & { issues: CodingReviewIssue[] }>) {
  return items.reduce(
    (summary, item) => {
      summary.total += 1;
      if (item.issues.length === 0) summary.cleared += 1;
      for (const issue of item.issues) {
        summary.issueCounts[issue] = (summary.issueCounts[issue] || 0) + 1;
      }
      return summary;
    },
    {
      total: 0,
      cleared: 0,
      issueCounts: {} as Record<CodingReviewIssue, number>,
    },
  );
}

codingReviewRouter.get(
  "/post-visit",
  requireAuth,
  requireModuleAccess("coding_review"),
  requireRoles(CODING_REVIEW_ROLES),
  async (req: AuthedRequest, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const tenantId = req.user!.tenantId;
    const fallbackWindow = defaultDateWindow();
    const startDate = parsed.data.startDate || fallbackWindow.startDate;
    const endDate = parsed.data.endDate || fallbackWindow.endDate;
    const includeCleared = parsed.data.includeCleared === "true";
    const limit = parsed.data.limit || 200;

    const params: any[] = [tenantId, startDate, endDate];
    let providerFilter = "";
    if (parsed.data.providerId) {
      params.push(parsed.data.providerId);
      providerFilter = `and e.provider_id = $${params.length}`;
    }
    params.push(limit);
    const limitParam = params.length;

    try {
      const result = await pool.query(
        `with diagnosis_summary as (
           select
             tenant_id,
             encounter_id,
             count(*)::int as diagnosis_count,
             count(*) filter (where coalesce(is_primary, false))::int as primary_diagnosis_count,
             array_remove(array_agg(distinct icd10_code), null) as diagnosis_codes
           from encounter_diagnoses
           where tenant_id = $1
           group by tenant_id, encounter_id
         ),
         charge_summary as (
           select
             tenant_id,
             encounter_id,
             count(*)::int as charge_count,
             count(*) filter (
               where coalesce(
                 nullif(to_jsonb(charges)->>'billing_route', ''),
                 case when status = 'self_pay' then 'self_pay' else 'insurance' end
               ) = 'insurance'
                 and coalesce(status, 'pending') in ('pending', 'ready')
             )::int as claimable_charge_count,
             count(*) filter (where nullif(trim(coalesce(cpt_code, '')), '') is null)::int as missing_cpt_count,
             count(*) filter (
               where coalesce(array_length(linked_diagnosis_ids, 1), 0) = 0
                 and coalesce(array_length(icd_codes, 1), 0) = 0
             )::int as unlinked_charge_count,
             coalesce(sum(coalesce(fee_cents, amount_cents, 0) * coalesce(quantity, 1)), 0)::int as total_charge_cents,
             array_remove(array_agg(distinct cpt_code), null) as cpt_codes
           from charges
           where tenant_id = $1
             and encounter_id is not null
           group by tenant_id, encounter_id
         ),
         latest_superbill as (
           select distinct on (tenant_id, encounter_id)
             tenant_id,
             encounter_id,
             id,
             status
           from superbills
           where tenant_id = $1
           order by tenant_id, encounter_id, updated_at desc nulls last, created_at desc
         ),
         latest_claim as (
           select distinct on (tenant_id, encounter_id)
             tenant_id,
             encounter_id,
             id,
             status
           from claims
           where tenant_id = $1
             and encounter_id is not null
           order by tenant_id, encounter_id, updated_at desc nulls last, created_at desc
         )
         select
           e.id as "encounterId",
           e.appointment_id as "appointmentId",
           e.patient_id as "patientId",
           trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as "patientName",
           e.provider_id as "providerId",
           pr.full_name as "providerName",
           coalesce(a.scheduled_start, e.created_at) as "serviceAt",
           a.status as "appointmentStatus",
           e.status as "encounterStatus",
           e.chief_complaint as "chiefComplaint",
           coalesce(dx.diagnosis_count, 0) as "diagnosisCount",
           coalesce(dx.primary_diagnosis_count, 0) as "primaryDiagnosisCount",
           coalesce(dx.diagnosis_codes, array[]::text[]) as "diagnosisCodes",
           coalesce(ch.charge_count, 0) as "chargeCount",
           coalesce(ch.claimable_charge_count, 0) as "claimableChargeCount",
           coalesce(ch.missing_cpt_count, 0) as "missingCptCount",
           coalesce(ch.unlinked_charge_count, 0) as "unlinkedChargeCount",
           coalesce(ch.total_charge_cents, 0) as "totalChargeCents",
           coalesce(ch.cpt_codes, array[]::text[]) as "cptCodes",
           sb.id as "superbillId",
           sb.status as "superbillStatus",
           cl.id as "claimId",
           cl.status as "claimStatus"
         from encounters e
         left join appointments a on a.id = e.appointment_id and a.tenant_id = e.tenant_id
         left join patients p on p.id = e.patient_id and p.tenant_id = e.tenant_id
         left join providers pr on pr.id = e.provider_id and pr.tenant_id = e.tenant_id
         left join diagnosis_summary dx on dx.tenant_id = e.tenant_id and dx.encounter_id = e.id
         left join charge_summary ch on ch.tenant_id = e.tenant_id and ch.encounter_id = e.id
         left join latest_superbill sb on sb.tenant_id = e.tenant_id and sb.encounter_id = e.id
         left join latest_claim cl on cl.tenant_id = e.tenant_id and cl.encounter_id = e.id
         where e.tenant_id = $1
           and coalesce(a.scheduled_start, e.created_at)::date between $2::date and $3::date
           and coalesce(lower(a.status), '') not in ('cancelled', 'canceled', 'no_show', 'no-show', 'no show')
           ${providerFilter}
         order by coalesce(a.scheduled_start, e.created_at) desc, e.updated_at desc
         limit $${limitParam}`,
        params,
      );

      const codableRows = result.rows.map(mapReviewRow).filter((item) => isCodableAppointmentStatus(item.appointmentStatus));
      const mappedItems = codableRows.map((item) => {
        const issues = getIssues(item);
        return {
          ...item,
          issues,
          recommendedOwner: ownerForIssues(issues),
          severity: severityForIssues(issues),
          reviewRoute: `/patients/${item.patientId}/encounter/${item.encounterId}?section=${reviewSectionForIssues(issues)}`,
          claimRoute: item.claimId ? `/claims/${item.claimId}` : null,
        };
      });

      const items = includeCleared ? mappedItems : mappedItems.filter((item) => item.issues.length > 0);
      const summary = buildSummary(items);

      await auditLog(tenantId, req.user!.id, "post_visit_coding_review_view", "coding_review", tenantId);

      return res.json({
        startDate,
        endDate,
        includeCleared,
        items,
        summary,
      });
    } catch (error: any) {
      logger.error("Failed to load post-visit coding review", {
        error: error?.message || "Unknown error",
      });
      return res.status(500).json({ error: "Failed to load post-visit coding review" });
    }
  },
);
