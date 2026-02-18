import crypto from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";
import { redactValue } from "../utils/phiRedaction";

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

interface NoteDraft {
  chiefComplaint: string;
  hpi: string;
  ros: string;
  exam: string;
  assessmentPlan: string;
  confidenceScore: number;
  suggestions: any[];
}

function toSafeErrorMessage(error: unknown): string {
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

export class AINoteDraftingService {
  private openaiApiKey: string | undefined;
  private anthropicApiKey: string | undefined;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
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
      if (this.openaiApiKey) {
        return await this.generateWithOpenAI(
          request,
          patientContext,
          providerStyle,
          template,
          priorNotes
        );
      } else if (this.anthropicApiKey) {
        return await this.generateWithAnthropic(
          request,
          patientContext,
          providerStyle,
          template,
          priorNotes
        );
      } else {
        // Return mock draft for development
        return this.getMockDraft(request, template);
      }
    } catch (error) {
      logAINoteDraftingError("Note draft generation error", error);
      if (error instanceof Error) {
        const message = error.message;
        if (
          message.startsWith("OpenAI API error:") ||
          message.startsWith("Invalid response from OpenAI API") ||
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
        soap_note
       from encounters
       where provider_id = $1 and tenant_id = $2
       and soap_note is not null
       order by encounter_date desc
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
      // Get last 3 encounters if not specified
      const result = await pool.query(
        `select soap_note, encounter_date, chief_complaint
         from encounters
         where patient_id = $1 and tenant_id = $2
         and soap_note is not null
         order by encounter_date desc
         limit 3`,
        [patientId, tenantId]
      );
      return result.rows;
    }

    const result = await pool.query(
      `select soap_note, encounter_date, chief_complaint
       from encounters
       where id = any($1) and tenant_id = $2`,
      [encounterIds, tenantId]
    );
    return result.rows;
  }

  /**
   * Generate note draft using OpenAI
   */
  private async generateWithOpenAI(
    request: NoteDraftRequest,
    patientContext: any,
    providerStyle: any[],
    template: any,
    priorNotes: any[]
  ): Promise<NoteDraft> {
    const systemPrompt = this.buildSystemPrompt(providerStyle, template);
    const userPrompt = this.buildUserPrompt(request, patientContext, priorNotes);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
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
    return this.parseNoteDraft(content);
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

    return this.parseNoteDraft(content);
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(providerStyle: any[], template: any): string {
    let prompt = `You are an expert dermatology clinical documentation assistant. Your role is to help providers create accurate, professional, and comprehensive clinical notes.

Guidelines:
1. Use clear, professional medical terminology
2. Be concise yet thorough
3. Follow SOAP note format
4. Include relevant dermatological examination details
5. Document findings objectively
6. Provide actionable assessment and plan`;

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
  "assessmentPlan": "string"
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
      prompt += `\nMedical History: ${medicalHistory}`;
    }

    const allergies = sanitizePromptTextForModel(patientContext.allergies, patientContext);
    if (allergies) {
      prompt += `\nAllergies: ${allergies}`;
    }

    const medications = sanitizePromptTextForModel(patientContext.current_medications, patientContext);
    if (medications) {
      prompt += `\nCurrent Medications: ${medications}`;
    }

    if (request.chiefComplaint) {
      prompt += `\n\nChief Complaint: ${sanitizePromptTextForModel(request.chiefComplaint, patientContext)}`;
    }

    if (request.briefNotes) {
      prompt += `\n\nProvider's Brief Notes:\n${sanitizePromptTextForModel(request.briefNotes, patientContext)}`;
    }

    if (priorNotes && priorNotes.length > 0) {
      prompt += `\n\nRecent Visit Context:`;
      priorNotes.forEach((note, index) => {
        const priorComplaint = sanitizePromptTextForModel(note?.chief_complaint || "", patientContext);
        if (priorComplaint) {
          prompt += `\n\n[Visit ${index + 1}] ${priorComplaint}`;
        }
      });
    }

    prompt += `\n\nPlease generate a comprehensive dermatology note based on this information.`;

    return prompt;
  }

  /**
   * Parse AI response into structured note draft
   */
  private parseNoteDraft(aiResponse: string): NoteDraft {
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          chiefComplaint: parsed.chiefComplaint || "",
          hpi: parsed.hpi || "",
          ros: parsed.ros || "",
          exam: parsed.exam || "",
          assessmentPlan: parsed.assessmentPlan || "",
          confidenceScore: 0.85,
          suggestions: [],
        };
      }

      // Fallback: parse as structured text
      return this.parsePlainTextNote(aiResponse);
    } catch (error) {
      logAINoteDraftingError("Failed to parse AI response", error);
      throw new Error("Invalid AI response format");
    }
  }

  /**
   * Parse plain text note into sections
   */
  private parsePlainTextNote(text: string): NoteDraft {
    const sections = {
      chiefComplaint: "",
      hpi: "",
      ros: "",
      exam: "",
      assessmentPlan: "",
      confidenceScore: 0.75,
      suggestions: [],
    };

    // Simple pattern matching for SOAP sections
    const ccMatch = text.match(/Chief Complaint[:\n]+(.*?)(?=\n\n|HPI|$)/is);
    const hpiMatch = text.match(/HPI[:\n]+(.*?)(?=\n\n|ROS|$)/is);
    const rosMatch = text.match(/ROS[:\n]+(.*?)(?=\n\n|Exam|$)/is);
    const examMatch = text.match(/(?:Exam|Physical Exam)[:\n]+(.*?)(?=\n\n|Assessment|$)/is);
    const apMatch = text.match(/(?:Assessment|A\/P|Assessment and Plan)[:\n]+(.*?)$/is);

    if (ccMatch && ccMatch[1]) sections.chiefComplaint = ccMatch[1].trim();
    if (hpiMatch && hpiMatch[1]) sections.hpi = hpiMatch[1].trim();
    if (rosMatch && rosMatch[1]) sections.ros = rosMatch[1].trim();
    if (examMatch && examMatch[1]) sections.exam = examMatch[1].trim();
    if (apMatch && apMatch[1]) sections.assessmentPlan = apMatch[1].trim();

    return sections;
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
  private getMockDraft(request: NoteDraftRequest, template: any): NoteDraft {
    const baseTemplate = template || {
      chiefComplaint: request.chiefComplaint || "Skin concern",
      hpi: "Patient presents with [condition]. Duration: [time]. Associated symptoms: [symptoms]. Aggravating factors: [factors]. Prior treatments: [treatments].",
      ros: "Constitutional: No fever, weight loss\nSkin: As described in HPI\nOther systems reviewed and negative except as noted",
      exam: "Skin Exam:\n- Location: [location]\n- Morphology: [description]\n- Distribution: [pattern]\n- Size: [measurements]",
      assessmentPlan: "Assessment:\n1. [Diagnosis]\n\nPlan:\n1. [Treatment]\n2. Follow-up in [timeframe]\n3. Patient education provided",
    };

    return {
      chiefComplaint: baseTemplate.chiefComplaint || request.chiefComplaint || "",
      hpi: baseTemplate.hpi || "",
      ros: baseTemplate.ros || "",
      exam: baseTemplate.exam || "",
      assessmentPlan: baseTemplate.assessmentPlan || "",
      confidenceScore: 0.7,
      suggestions: [
        {
          section: "hpi",
          suggestion: "Consider adding onset timeline",
          confidence: 0.8,
        },
        {
          section: "exam",
          suggestion: "Document lesion measurements",
          confidence: 0.85,
        },
      ],
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

    // In production, use ML to extract and rank relevant phrases
    // For now, return common dermatology phrases based on section
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
