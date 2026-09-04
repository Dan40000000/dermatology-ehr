import crypto from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";
import { deidentifyTextForExternalAi, isClinicalAiProviderAllowed } from "../utils/aiPhiGuard";
import { getEnabledAnthropicApiKey, getEnabledOpenAiApiKey } from "../utils/externalAiGate";
import { meteredOpenAiFetch, OpenAiSpendGuardError } from "../utils/openAiSpendGuard";
import { redactValue, safeErrorCode } from "../utils/phiRedaction";

/**
 * AI Note Drafting Service
 *
 * Provides AI-powered clinical note generation with:
 * - Auto-drafting from templates and brief inputs
 * - Provider writing style learning
 * - Context-aware suggestions
 * - Smart auto-complete during documentation
 */

interface NoteDraftRequest {
  templateId?: string;
  chiefComplaint?: string;
  briefNotes?: string;
  patientId: string;
  providerId: string;
  priorEncounterIds?: string[];
}

export type QuickNoteSection =
  | "chiefComplaint"
  | "hpi"
  | "ros"
  | "exam"
  | "assessmentPlan";

export interface NoteSectionEvidence {
  source: "chief_complaint" | "brief_notes";
  excerpt: string;
}

export interface NoteSectionReview {
  status: "drafted" | "not_documented";
  confidence: number;
  evidence: NoteSectionEvidence[];
}

export type QuickNoteSectionReview = Record<QuickNoteSection, NoteSectionReview>;

export interface NoteDraft {
  chiefComplaint: string;
  hpi: string;
  ros: string;
  exam: string;
  assessmentPlan: string;
  confidenceScore: number;
  suggestions: any[];
  sectionReview: QuickNoteSectionReview;
}

const QUICK_NOTE_SECTIONS: QuickNoteSection[] = [
  "chiefComplaint",
  "hpi",
  "ros",
  "exam",
  "assessmentPlan",
];

type QuickNoteSource = NoteSectionEvidence["source"];

function normalizeEvidenceForComparison(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDocumentedContent(value: unknown): string {
  const content = toSafeString(value);
  if (!content || /^(not documented|not available|n\/a|none)$/i.test(content)) {
    return "";
  }
  return content;
}

function getQuickSourceText(source: QuickNoteSource, inputs: {
  chiefComplaint?: string;
  briefNotes?: string;
}): string {
  return source === "chief_complaint"
    ? toSafeString(inputs.chiefComplaint)
    : toSafeString(inputs.briefNotes);
}

function validateQuickEvidence(
  rawEvidence: unknown,
  inputs: { chiefComplaint?: string; briefNotes?: string },
): NoteSectionEvidence[] {
  if (!Array.isArray(rawEvidence)) {
    return [];
  }

  const validated: NoteSectionEvidence[] = [];
  const seen = new Set<string>();
  for (const item of rawEvidence) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const source = candidate.source;
    if (source !== "chief_complaint" && source !== "brief_notes") continue;
    const excerpt = toSafeString(candidate.excerpt);
    if (!excerpt) continue;

    const normalizedExcerpt = normalizeEvidenceForComparison(excerpt);
    const normalizedSource = normalizeEvidenceForComparison(getQuickSourceText(source, inputs));
    if (!normalizedSource || !normalizedSource.includes(normalizedExcerpt)) continue;

    const key = `${source}:${normalizedExcerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    validated.push({
      source,
      excerpt: excerpt.slice(0, 1000),
    });
  }

  return validated.slice(0, 8);
}

function toSafeErrorMessage(error: unknown): string {
  if (process.env.NODE_ENV !== "test") {
    return safeErrorCode(error);
  }
  if (error instanceof Error) {
    return String(redactValue(error.message));
  }

  if (typeof error === "string") {
    return String(redactValue(error));
  }

  return "Unknown error";
}

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfidence(value: unknown, fallback = 0.5): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, fallback));
  }
  const normalized = numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactPatientNameMentions(text: string, patientContext?: any): string {
  if (!text) {
    return text;
  }

  const firstName = toSafeString(patientContext?.first_name);
  const lastName = toSafeString(patientContext?.last_name);
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : "";
  const candidates = [fullName, firstName, lastName].filter((candidate): candidate is string => candidate.length >= 2);

  let redacted = text;
  for (const candidate of candidates) {
    const pattern = new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "gi");
    redacted = redacted.replace(pattern, "[PATIENT]");
  }

  return redacted;
}

function sanitizePromptTextForModel(value: unknown, patientContext?: any): string {
  const raw = toSafeString(value);
  if (!raw) {
    return "";
  }

  let sanitized = String(redactValue(raw));
  sanitized = deidentifyTextForExternalAi(sanitized).text;
  sanitized = sanitized.replace(
    /\b(patient|pt|name)\s*:\s*[^\n]+/gi,
    (_fullMatch: string, label: string) => `${label}: [PATIENT]`
  );
  sanitized = sanitized.replace(
    /\b(dob|date of birth)\s*:\s*[^\n]+/gi,
    (_fullMatch: string, label: string) => `${label}: [DATE-REDACTED]`
  );

  return redactPatientNameMentions(sanitized, patientContext);
}

function logAINoteDraftingError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function isSyntheticAiRuntime(): boolean {
  const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  if (nodeEnv === "production") {
    return false;
  }
  if (nodeEnv === "test" || nodeEnv === "development" || nodeEnv === "demo") {
    return true;
  }

  const mode = String(process.env.CLINICAL_AI_MODE || process.env.AI_MODE || "").trim().toLowerCase();
  return mode === "mock" || mode === "demo";
}

export class AINoteDraftingService {
  private openaiApiKey: string | undefined;
  private anthropicApiKey: string | undefined;

  constructor() {
    this.openaiApiKey = getEnabledOpenAiApiKey();
    this.anthropicApiKey = getEnabledAnthropicApiKey();
  }

  /**
   * Generate a draft clinical note using AI
   */
  async generateNoteDraft(
    request: NoteDraftRequest,
    tenantId: string
  ): Promise<NoteDraft> {
    try {
      // Get patient context
      const patientContext = await this.getPatientContext(request.patientId, tenantId);

      // Get provider writing style
      const providerStyle = await this.getProviderWritingStyle(request.providerId, tenantId);

      // Get template if specified
      let template = null;
      if (request.templateId) {
        const templateResult = await pool.query(
          `select template_content from note_templates
           where id = $1 and tenant_id = $2`,
          [request.templateId, tenantId]
        );
        if (templateResult.rows.length > 0) {
          template = templateResult.rows[0].template_content;
        }
      }

      // Get prior encounter notes for context
      const priorNotes = await this.getPriorEncounterNotes(
        request.patientId,
        request.priorEncounterIds || [],
        tenantId
      );

      // Generate draft using AI
      const openAiAllowed = Boolean(
        this.openaiApiKey && isClinicalAiProviderAllowed("openai", this.openaiApiKey)
      );
      const anthropicAllowed = Boolean(
        this.anthropicApiKey && isClinicalAiProviderAllowed("anthropic", this.anthropicApiKey)
      );

      if (openAiAllowed) {
        return await this.generateWithOpenAI(
          request,
          tenantId,
          patientContext,
          providerStyle,
          template,
          priorNotes
        );
      } else if (anthropicAllowed) {
        return await this.generateWithAnthropic(
          request,
          patientContext,
          providerStyle,
          template,
          priorNotes
        );
      } else if (isSyntheticAiRuntime()) {
        return this.getMockDraft(request, template);
      }

      throw new Error("AI note drafting provider is unavailable");
    } catch (error) {
      logAINoteDraftingError("Note draft generation error", error);
      if (error instanceof Error) {
        const message = error.message;
        if (
          message.startsWith("OpenAI API error:") ||
          message.startsWith("Invalid response from OpenAI API") ||
          error instanceof OpenAiSpendGuardError ||
          message.startsWith("Anthropic API error:") ||
          message.startsWith("Invalid response from Anthropic API")
        ) {
          throw error;
        }
      }
      throw new Error("Failed to generate note draft");
    }
  }

  /**
   * Get patient context for AI
   */
  private async getPatientContext(patientId: string, tenantId: string) {
    const result = await pool.query(
      `select
        p.first_name,
        p.last_name,
        p.dob as date_of_birth,
        p.sex,
        p.medical_history,
        p.allergies,
        p.current_medications
       from patients p
       where p.id = $1 and p.tenant_id = $2`,
      [patientId, tenantId]
    );

    return result.rows[0] || {};
  }

  /**
   * Analyze provider's writing style from past notes
   */
  private async getProviderWritingStyle(providerId: string, tenantId: string) {
    const result = await pool.query(
      `select
        concat_ws(E'\\n\\n',
          case when nullif(trim(e.chief_complaint), '') is not null
            then 'Chief Complaint: ' || trim(e.chief_complaint) end,
          case when nullif(trim(e.hpi), '') is not null
            then 'HPI: ' || trim(e.hpi) end,
          case when nullif(trim(e.ros), '') is not null
            then 'ROS: ' || trim(e.ros) end,
          case when nullif(trim(e.exam), '') is not null
            then 'Exam: ' || trim(e.exam) end,
          case when nullif(trim(e.assessment_plan), '') is not null
            then 'Assessment and Plan: ' || trim(e.assessment_plan) end
        ) as soap_note,
        coalesce(e.updated_at, e.created_at) as encounter_date
       from encounters e
       join providers p
         on p.id = e.provider_id
        and p.tenant_id = e.tenant_id
       join users u
         on u.id = p.user_id
        and u.tenant_id = p.tenant_id
       where u.id = $1
         and e.tenant_id = $2
         and e.status in ('final', 'signed', 'locked', 'finalized', 'completed', 'closed')
         and (
           nullif(trim(e.chief_complaint), '') is not null
           or nullif(trim(e.hpi), '') is not null
           or nullif(trim(e.ros), '') is not null
           or nullif(trim(e.exam), '') is not null
           or nullif(trim(e.assessment_plan), '') is not null
         )
       order by coalesce(e.updated_at, e.created_at) desc
       limit 10`,
      [providerId, tenantId]
    );

    return result.rows;
  }

  /**
   * Get prior encounter notes for context
   */
  private async getPriorEncounterNotes(
    patientId: string,
    encounterIds: string[],
    tenantId: string
  ) {
    if (encounterIds.length === 0) {
      // Do not silently import recent chart history into a current-encounter
      // draft. Callers must explicitly opt in to prior encounter IDs.
      return [];
    }

    const result = await pool.query(
      `select
        concat_ws(E'\\n\\n',
          case when nullif(trim(e.chief_complaint), '') is not null
            then 'Chief Complaint: ' || trim(e.chief_complaint) end,
          case when nullif(trim(e.hpi), '') is not null
            then 'HPI: ' || trim(e.hpi) end,
          case when nullif(trim(e.ros), '') is not null
            then 'ROS: ' || trim(e.ros) end,
          case when nullif(trim(e.exam), '') is not null
            then 'Exam: ' || trim(e.exam) end,
          case when nullif(trim(e.assessment_plan), '') is not null
            then 'Assessment and Plan: ' || trim(e.assessment_plan) end
        ) as soap_note,
        coalesce(e.updated_at, e.created_at) as encounter_date,
        e.chief_complaint
       from encounters e
       where e.id = any($1)
         and e.tenant_id = $2
         and e.patient_id = $3
         and e.status in ('final', 'signed', 'locked', 'finalized', 'completed', 'closed')
         and (
           nullif(trim(e.chief_complaint), '') is not null
           or nullif(trim(e.hpi), '') is not null
           or nullif(trim(e.ros), '') is not null
           or nullif(trim(e.exam), '') is not null
           or nullif(trim(e.assessment_plan), '') is not null
         )
       order by coalesce(e.updated_at, e.created_at) desc`,
      [encounterIds, tenantId, patientId]
    );
    return result.rows;
  }

  /**
   * Generate note draft using OpenAI
   */
  private async generateWithOpenAI(
    request: NoteDraftRequest,
    tenantId: string,
    patientContext: any,
    providerStyle: any[],
    template: any,
    priorNotes: any[]
  ): Promise<NoteDraft> {
    const systemPrompt = this.buildSystemPrompt(providerStyle, template);
    const userPrompt = this.buildUserPrompt(request, patientContext, priorNotes);
    const model = process.env.OPENAI_NOTE_MODEL || "gpt-4o-mini";

    const response = await meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model,
        store: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    }, {
      feature: "ai_note_drafting",
      model,
      tenantId,
      userId: request.providerId,
      resourceType: "patient",
      resourceId: request.patientId,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error('Invalid response from OpenAI API');
    }

    const content = data.choices[0].message.content;

    // Parse structured response
    return this.parseNoteDraft(content, {
      chiefComplaint: sanitizePromptTextForModel(request.chiefComplaint, patientContext),
      briefNotes: sanitizePromptTextForModel(request.briefNotes, patientContext),
    });
  }

  /**
   * Generate note draft using Anthropic Claude
   */
  private async generateWithAnthropic(
    request: NoteDraftRequest,
    patientContext: any,
    providerStyle: any[],
    template: any,
    priorNotes: any[]
  ): Promise<NoteDraft> {
    const systemPrompt = this.buildSystemPrompt(providerStyle, template);
    const userPrompt = this.buildUserPrompt(request, patientContext, priorNotes);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.anthropicApiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    if (!data.content || !data.content[0]?.text) {
      throw new Error('Invalid response from Anthropic API');
    }

    const content = data.content[0].text;

    return this.parseNoteDraft(content, {
      chiefComplaint: sanitizePromptTextForModel(request.chiefComplaint, patientContext),
      briefNotes: sanitizePromptTextForModel(request.briefNotes, patientContext),
    });
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(providerStyle: any[], template: any): string {
    let prompt = `You are an expert dermatology clinical documentation assistant. Your role is to help providers create accurate, professional, problem-oriented clinical note drafts from the current encounter inputs.

Guidelines:
1. Use clear, professional medical terminology
2. Be concise and include only clinically relevant facts supported by the current encounter inputs
3. Follow SOAP note format
4. Include dermatological examination details only when they are explicitly supported
5. Document findings objectively
6. Provide an actionable assessment and plan only when supported by the current encounter inputs

SOURCE AND SAFETY RULES:
- Use only facts in the current Chief Complaint and Provider Brief Notes supplied with this request.
- Omit small talk, scheduling, billing, administrative, and other nonclinical conversation.
- Never invent normal ROS, normal examination findings, a diagnosis, medication, order, procedure, consent, code, or follow-up.
- Templates and provider style affect wording and structure only; they are not clinical evidence and must not add facts.
- Use an empty string for every unsupported section.
- Keep the Assessment/Plan problem-oriented when the current inputs support a problem and plan.
- Every drafted section must include evidence quoted exactly from the current Chief Complaint or Provider Brief Notes (case-insensitive, whitespace-normalized matching is used for validation).
- If a section has no exact supporting evidence, preserve it only as a low-confidence draft for clinician review (confidence at most 0.5); it is never safe for automatic application.`;

    if (providerStyle && providerStyle.length > 0) {
      const sanitizedStyleSamples = providerStyle
        .slice(0, 2)
        .map((note) => sanitizePromptTextForModel(note?.soap_note))
        .filter((sample) => sample.length > 0);

      if (sanitizedStyleSamples.length > 0) {
      prompt += `\n\nProvider Writing Style Context:
The provider typically writes notes in the following style. Please match their tone and structure:
${sanitizedStyleSamples.join("\n\n---\n\n")}`;
      }
    }

    if (template) {
      const sanitizedTemplate = sanitizePromptTextForModel(JSON.stringify(template, null, 2));
      prompt += `\n\nTemplate to follow:
${sanitizedTemplate}`;
    }

    prompt += `\n\nProvide your response in the following JSON format:
{
  "chiefComplaint": "string",
  "hpi": "string",
  "ros": "string",
  "exam": "string",
  "assessmentPlan": "string",
  "sectionReview": {
    "chiefComplaint": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "chief_complaint|brief_notes", "excerpt": "exact source excerpt" }] },
    "hpi": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "chief_complaint|brief_notes", "excerpt": "exact source excerpt" }] },
    "ros": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "chief_complaint|brief_notes", "excerpt": "exact source excerpt" }] },
    "exam": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "chief_complaint|brief_notes", "excerpt": "exact source excerpt" }] },
    "assessmentPlan": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "chief_complaint|brief_notes", "excerpt": "exact source excerpt" }] }
  }
}`;

    return prompt;
  }

  /**
   * Build user prompt with encounter details
   */
  private buildUserPrompt(
    request: NoteDraftRequest,
    patientContext: any,
    priorNotes: any[]
  ): string {
    let prompt = "Generate a clinical note with the following information:\n\n";
    const age = this.calculateAge(patientContext.date_of_birth);
    const sex = toSafeString(patientContext.sex) || "Unknown";

    prompt += `Patient: [PATIENT]
Age/Sex: ${age}/${sex}
`;

    const medicalHistory = sanitizePromptTextForModel(patientContext.medical_history, patientContext);
    if (medicalHistory) {
      prompt += `\nReference history (do not document unless explicitly confirmed in current inputs): ${medicalHistory}`;
    }

    const allergies = sanitizePromptTextForModel(patientContext.allergies, patientContext);
    if (allergies) {
      prompt += `\nReference allergies (do not document unless explicitly confirmed in current inputs): ${allergies}`;
    }

    const medications = sanitizePromptTextForModel(patientContext.current_medications, patientContext);
    if (medications) {
      prompt += `\nReference medications (do not document unless explicitly confirmed in current inputs): ${medications}`;
    }

    if (request.chiefComplaint) {
      prompt += `\n\nChief Complaint: ${sanitizePromptTextForModel(request.chiefComplaint, patientContext)}`;
    }

    if (request.briefNotes) {
      prompt += `\n\nProvider's Brief Notes:\n${sanitizePromptTextForModel(request.briefNotes, patientContext)}`;
    }

    if (priorNotes && priorNotes.length > 0) {
      prompt += `\n\nRecent Visit Context (style/reference only; do not import facts unless explicitly confirmed in current inputs):`;
      priorNotes.forEach((note, index) => {
        const priorComplaint = sanitizePromptTextForModel(note?.chief_complaint || "", patientContext);
        if (priorComplaint) {
          prompt += `\n\n[Visit ${index + 1}] ${priorComplaint}`;
        }
      });
    }

    prompt += `\n\nPlease generate a problem-oriented dermatology note using only the current encounter inputs. Leave unsupported sections empty.`;

    return prompt;
  }

  /**
   * Parse AI response into structured note draft
   */
  private parseNoteDraft(
    aiResponse: string,
    sourceInputs: { chiefComplaint?: string; briefNotes?: string } = {},
  ): NoteDraft {
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.buildReviewedDraft(
          {
            chiefComplaint: normalizeDocumentedContent(parsed?.chiefComplaint),
            hpi: normalizeDocumentedContent(parsed?.hpi),
            ros: normalizeDocumentedContent(parsed?.ros),
            exam: normalizeDocumentedContent(parsed?.exam),
            assessmentPlan: normalizeDocumentedContent(parsed?.assessmentPlan),
          },
          parsed?.sectionReview,
          sourceInputs,
        );
      }

      // Fallback: parse as structured text
      return this.parsePlainTextNote(aiResponse, sourceInputs);
    } catch (error) {
      logAINoteDraftingError("Failed to parse AI response", error);
      throw new Error("Invalid AI response format");
    }
  }

  /**
   * Parse plain text note into sections
   */
  private parsePlainTextNote(
    text: string,
    sourceInputs: { chiefComplaint?: string; briefNotes?: string } = {},
  ): NoteDraft {
    const sections = {
      chiefComplaint: "",
      hpi: "",
      ros: "",
      exam: "",
      assessmentPlan: "",
    };

    // Simple pattern matching for SOAP sections
    const ccMatch = text.match(/Chief Complaint[:\n]+(.*?)(?=\n\n|HPI|$)/is);
    const hpiMatch = text.match(/HPI[:\n]+(.*?)(?=\n\n|ROS|$)/is);
    const rosMatch = text.match(/ROS[:\n]+(.*?)(?=\n\n|Exam|$)/is);
    const examMatch = text.match(/(?:Exam|Physical Exam)[:\n]+(.*?)(?=\n\n|Assessment|$)/is);
    const apMatch = text.match(/(?:Assessment|A\/P|Assessment and Plan)[:\n]+(.*?)$/is);

    if (ccMatch && ccMatch[1]) sections.chiefComplaint = normalizeDocumentedContent(ccMatch[1]);
    if (hpiMatch && hpiMatch[1]) sections.hpi = normalizeDocumentedContent(hpiMatch[1]);
    if (rosMatch && rosMatch[1]) sections.ros = normalizeDocumentedContent(rosMatch[1]);
    if (examMatch && examMatch[1]) sections.exam = normalizeDocumentedContent(examMatch[1]);
    if (apMatch && apMatch[1]) sections.assessmentPlan = normalizeDocumentedContent(apMatch[1]);

    return this.buildReviewedDraft(sections, undefined, sourceInputs);
  }

  private buildReviewedDraft(
    sections: Record<QuickNoteSection, string>,
    rawSectionReview: unknown,
    sourceInputs: { chiefComplaint?: string; briefNotes?: string },
  ): NoteDraft {
    const review: Partial<QuickNoteSectionReview> = {};

    for (const section of QUICK_NOTE_SECTIONS) {
      const content = normalizeDocumentedContent(sections[section]);
      const rawReview = rawSectionReview && typeof rawSectionReview === "object"
        ? (rawSectionReview as Record<string, unknown>)[section]
        : undefined;
      const rawReviewObject = rawReview && typeof rawReview === "object"
        ? rawReview as Record<string, unknown>
        : {};
      const evidence = validateQuickEvidence(rawReviewObject.evidence, sourceInputs);
      let confidence = content
        ? normalizeConfidence(rawReviewObject.confidence, 0.5)
        : 0;

      // A non-empty section without source-validated evidence is retained as a
      // reviewable draft but may not be treated as an auto-fill candidate.
      if (content && evidence.length === 0) {
        confidence = Math.min(confidence, 0.5);
      }

      review[section] = {
        status: content ? "drafted" : "not_documented",
        confidence,
        evidence,
      };
    }

    const sectionReview = review as QuickNoteSectionReview;
    const documentedConfidenceValues = QUICK_NOTE_SECTIONS
      .filter((section) => sectionReview[section].status === "drafted")
      .map((section) => sectionReview[section].confidence)
      .filter((value) => Number.isFinite(value));

    return {
      ...sections,
      confidenceScore: documentedConfidenceValues.length > 0
        ? Number((documentedConfidenceValues.reduce((sum, value) => sum + value, 0) / documentedConfidenceValues.length).toFixed(4))
        : 0,
      suggestions: [],
      sectionReview,
    };
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dob: string): number {
    if (!dob) return 0;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Mock draft for development
   */
  private getMockDraft(request: NoteDraftRequest, _template: any): NoteDraft {
    // The synthetic runtime must exercise the same source-boundary as a live
    // provider. Templates are formatting guidance only and may not contribute
    // clinical facts to a draft.
    const chiefComplaint = normalizeDocumentedContent(request.chiefComplaint);
    const hpi = normalizeDocumentedContent(request.briefNotes);
    const sectionReview = {} as QuickNoteSectionReview;

    for (const section of QUICK_NOTE_SECTIONS) {
      const content = section === "chiefComplaint"
        ? chiefComplaint
        : section === "hpi"
          ? hpi
          : "";
      const evidence: NoteSectionEvidence[] = content
        ? [{
            source: section === "chiefComplaint" ? "chief_complaint" : "brief_notes",
            excerpt: content,
          }]
        : [];
      sectionReview[section] = {
        status: content ? "drafted" : "not_documented",
        confidence: content ? 0.9 : 0,
        evidence,
      };
    }

    const documentedCount = [chiefComplaint, hpi].filter(Boolean).length;
    const suggestions = [] as any[];
    if (chiefComplaint) {
      suggestions.push({
        section: "hpi",
        suggestion: "Add onset, duration, or severity only if discussed in the encounter.",
        confidence: 0.5,
      });
    }
    if (hpi) {
      suggestions.push({
        section: "exam",
        suggestion: "Add observed findings only if documented by the clinician.",
        confidence: 0.5,
      });
    }
    return {
      chiefComplaint,
      hpi,
      ros: "",
      exam: "",
      assessmentPlan: "",
      confidenceScore: documentedCount > 0 ? 0.9 : 0,
      suggestions,
      sectionReview,
    };
  }

  /**
   * Record provider feedback on AI suggestions for learning
   */
  async recordSuggestionFeedback(
    suggestionId: string,
    accepted: boolean,
    feedback: string | null,
    tenantId: string
  ): Promise<void> {
    await pool.query(
      `update ai_note_suggestions
       set accepted = $1, feedback = $2
       where id = $3 and tenant_id = $4`,
      [accepted, feedback, suggestionId, tenantId]
    );
  }

  /**
   * Get smart suggestions for a note section
   */
  async getSmartSuggestions(
    encounterId: string,
    section: string,
    currentText: string,
    tenantId: string
  ): Promise<string[]> {
    // Get provider ID from encounter
    const encounterResult = await pool.query(
      `select provider_id from encounters where id = $1 and tenant_id = $2`,
      [encounterId, tenantId]
    );

    if (encounterResult.rows.length === 0) {
      return [];
    }

    if (!isSyntheticAiRuntime()) {
      return [];
    }

    const providerId = encounterResult.rows[0].provider_id;

    // Get common phrases from provider's past notes in this section
    const pastPhrases = await pool.query(
      `select soap_note
       from encounters
       where provider_id = $1 and tenant_id = $2
       and soap_note is not null
       order by encounter_date desc
       limit 20`,
      [providerId, tenantId]
    );

    // Synthetic suggestions are limited to test/development/demo runtimes.
    return this.getCommonPhrases(section);
  }

  /**
   * Get common dermatology phrases for auto-complete
   */
  private getCommonPhrases(section: string): string[] {
    const phrases: Record<string, string[]> = {
      hpi: [
        "gradual onset over",
        "sudden appearance of",
        "associated with itching",
        "no prior history of",
        "previous treatment with",
        "no improvement with",
        "worsening despite",
      ],
      exam: [
        "well-demarcated",
        "ill-defined borders",
        "erythematous plaque",
        "hyperpigmented macule",
        "no tenderness to palpation",
        "symmetric distribution",
        "affecting bilateral",
      ],
      assessmentPlan: [
        "Continue current regimen",
        "Trial of topical",
        "Consider biopsy if no improvement",
        "Avoid irritants and allergens",
        "Follow up in 4-6 weeks",
        "Refer to specialist if",
        "Patient counseled on",
      ],
    };

    return phrases[section] || [];
  }
}

export const aiNoteDraftingService = new AINoteDraftingService();
