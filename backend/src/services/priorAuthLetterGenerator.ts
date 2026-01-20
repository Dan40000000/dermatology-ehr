/**
 * Prior Authorization Letter Generator
 * AI-assisted medical necessity letter generation
 * Saves massive time by auto-generating compelling justification letters
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// Lazy-load Anthropic SDK to avoid crashes if not installed
let anthropic: any = null;
try {
  const Anthropic = require('@anthropic-ai/sdk').default;
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });
} catch (e) {
  logger.warn('Anthropic SDK not installed - AI letter generation disabled');
}

export interface LetterGenerationParams {
  patientId: string;
  tenantId: string;
  medicationName?: string;
  procedureCode?: string;
  diagnosisCodes: string[];
  diagnosisDescriptions: string[];
  payerName?: string;
  clinicalJustification?: string;
  previousTreatments?: string;
  previousFailures?: string;
}

export interface GeneratedLetter {
  letterText: string;
  suggestedDiagnosisCodes: string[];
  keyPoints: string[];
}

export class PriorAuthLetterGenerator {
  /**
   * Generate comprehensive medical necessity letter using AI
   */
  static async generateLetter(params: LetterGenerationParams): Promise<GeneratedLetter> {
    // Get patient demographics and history
    const patientData = await this.getPatientData(params.patientId, params.tenantId);

    // Get template if available
    const template = await this.findMatchingTemplate(params);

    // Build context for AI
    const context = this.buildLetterContext(params, patientData, template);

    // Generate letter using Claude
    const letterText = await this.generateWithAI(context, params);

    // Extract key points
    const keyPoints = this.extractKeyPoints(letterText);

    return {
      letterText,
      suggestedDiagnosisCodes: params.diagnosisCodes,
      keyPoints,
    };
  }

  /**
   * Get patient demographics and relevant medical history
   */
  private static async getPatientData(patientId: string, tenantId: string) {
    const query = `
      SELECT
        p.first_name,
        p.last_name,
        p.dob,
        p.sex,
        p.insurance,
        p.allergies,
        p.medications,
        -- Get recent diagnoses
        (
          SELECT json_agg(DISTINCT diagnosis)
          FROM encounters e,
          LATERAL jsonb_array_elements_text(e.diagnoses) as diagnosis
          WHERE e.patient_id = p.id
            AND e.created_at > NOW() - INTERVAL '2 years'
          LIMIT 10
        ) as recent_diagnoses,
        -- Get recent prescriptions
        (
          SELECT json_agg(
            json_build_object(
              'medication', medication_name,
              'date', created_at,
              'sig', sig
            )
          )
          FROM prescriptions
          WHERE patient_id = p.id
            AND created_at > NOW() - INTERVAL '2 years'
          ORDER BY created_at DESC
          LIMIT 20
        ) as recent_prescriptions,
        -- Get recent procedures
        (
          SELECT json_agg(DISTINCT procedure)
          FROM encounters e,
          LATERAL jsonb_array_elements_text(e.procedures) as procedure
          WHERE e.patient_id = p.id
            AND e.created_at > NOW() - INTERVAL '2 years'
          LIMIT 10
        ) as recent_procedures
      FROM patients p
      WHERE p.id = $1 AND p.tenant_id = $2
    `;

    const result = await pool.query(query, [patientId, tenantId]);
    return result.rows[0];
  }

  /**
   * Find matching template for this scenario
   */
  private static async findMatchingTemplate(params: LetterGenerationParams) {
    const query = `
      SELECT *
      FROM prior_auth_templates
      WHERE (tenant_id = $1 OR tenant_id = 'default')
        AND is_active = true
        AND (
          ($2 IS NOT NULL AND medication_name ILIKE '%' || $2 || '%')
          OR ($3 IS NOT NULL AND procedure_code = $3)
        )
      ORDER BY tenant_id DESC, usage_count DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [params.tenantId, params.medicationName, params.procedureCode]);
    return result.rows[0] || null;
  }

  /**
   * Build context for letter generation
   */
  private static buildLetterContext(
    params: LetterGenerationParams,
    patientData: any,
    template: any
  ): string {
    let context = 'Generate a medical necessity letter for prior authorization.\n\n';

    // Patient info
    context += `PATIENT INFORMATION:\n`;
    context += `Name: ${patientData.first_name} ${patientData.last_name}\n`;
    context += `DOB: ${patientData.dob}\n`;
    context += `Sex: ${patientData.sex}\n`;
    context += `Insurance: ${params.payerName || patientData.insurance}\n\n`;

    // Request details
    context += `AUTHORIZATION REQUEST:\n`;
    if (params.medicationName) {
      context += `Medication: ${params.medicationName}\n`;
    }
    if (params.procedureCode) {
      context += `Procedure: ${params.procedureCode}\n`;
    }
    context += `Diagnosis Codes: ${params.diagnosisCodes.join(', ')}\n`;
    context += `Diagnosis Descriptions: ${params.diagnosisDescriptions.join(', ')}\n\n`;

    // Medical history
    if (patientData.recent_diagnoses) {
      context += `RECENT DIAGNOSES:\n${JSON.stringify(patientData.recent_diagnoses, null, 2)}\n\n`;
    }

    if (patientData.recent_prescriptions) {
      context += `RECENT MEDICATIONS:\n${JSON.stringify(patientData.recent_prescriptions, null, 2)}\n\n`;
    }

    // Previous treatments
    if (params.previousTreatments) {
      context += `PREVIOUS TREATMENTS:\n${params.previousTreatments}\n\n`;
    }

    if (params.previousFailures) {
      context += `PREVIOUS TREATMENT FAILURES:\n${params.previousFailures}\n\n`;
    }

    // Template guidance
    if (template) {
      context += `TEMPLATE GUIDANCE:\n`;
      context += `Clinical Justification Template: ${template.clinical_justification_template}\n`;
      context += `Previous Treatments Template: ${template.previous_treatments_template}\n`;
      if (template.payer_specific_requirements) {
        context += `Payer Requirements: ${template.payer_specific_requirements}\n`;
      }
      context += `\n`;
    }

    return context;
  }

  /**
   * Generate letter using Claude AI
   */
  private static async generateWithAI(context: string, params: LetterGenerationParams): Promise<string> {
    const prompt = `${context}

Please generate a professional, comprehensive medical necessity letter for this prior authorization request.

The letter should:
1. Be addressed "To Whom It May Concern" at the insurance company
2. Clearly state the patient's diagnosis and medical condition
3. Explain why this medication/procedure is medically necessary
4. Document previous treatments attempted and why they failed or were inappropriate
5. Cite clinical evidence and guidelines when relevant
6. Be persuasive but factual and professional
7. Include specific details about disease severity and impact on quality of life
8. Follow standard medical letter format

Generate ONLY the letter text, no additional commentary.`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type === 'text') {
        return content.text;
      }

      throw new Error('Unexpected response format from Claude');
    } catch (error) {
      logger.error('Error generating PA letter with AI:', error);

      // Fallback to template-based generation
      return this.generateFallbackLetter(params);
    }
  }

  /**
   * Fallback letter generation if AI fails
   */
  private static generateFallbackLetter(params: LetterGenerationParams): string {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let letter = `${today}\n\n`;
    letter += `To Whom It May Concern,\n\n`;
    letter += `RE: Prior Authorization Request for ${params.medicationName || params.procedureCode}\n\n`;

    letter += `I am writing to request prior authorization for the above-referenced `;
    letter += params.medicationName ? `medication` : `procedure`;
    letter += ` for my patient.\n\n`;

    letter += `DIAGNOSIS:\n`;
    params.diagnosisDescriptions.forEach((desc, idx) => {
      letter += `- ${desc} (ICD-10: ${params.diagnosisCodes[idx]})\n`;
    });
    letter += `\n`;

    if (params.clinicalJustification) {
      letter += `CLINICAL JUSTIFICATION:\n${params.clinicalJustification}\n\n`;
    }

    if (params.previousTreatments) {
      letter += `PREVIOUS TREATMENTS:\n${params.previousTreatments}\n\n`;
    }

    if (params.previousFailures) {
      letter += `TREATMENT FAILURES:\n${params.previousFailures}\n\n`;
    }

    letter += `This ${params.medicationName ? 'medication' : 'procedure'} is medically necessary and appropriate for this patient's condition. `;
    letter += `The patient has exhausted other treatment options without adequate response.\n\n`;

    letter += `Please approve this prior authorization request. If you need any additional information, `;
    letter += `please do not hesitate to contact me.\n\n`;

    letter += `Sincerely,\n\n`;
    letter += `[Provider Name]\n`;
    letter += `[Provider NPI]\n`;

    return letter;
  }

  /**
   * Extract key points from letter for summary
   */
  private static extractKeyPoints(letterText: string): string[] {
    const keyPoints: string[] = [];

    // Simple extraction - look for bullet points or numbered items
    const lines = letterText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match bullet points or numbered lists
      if (
        trimmed.match(/^[-•*]\s/) ||
        trimmed.match(/^\d+\.\s/) ||
        trimmed.toLowerCase().includes('failed') ||
        trimmed.toLowerCase().includes('contraindicated') ||
        trimmed.toLowerCase().includes('medically necessary')
      ) {
        const point = trimmed.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '');
        if (point.length > 10 && point.length < 200) {
          keyPoints.push(point);
        }
      }
    }

    return keyPoints.slice(0, 5); // Return top 5 key points
  }

  /**
   * Generate appeal letter for denied PA
   */
  static async generateAppealLetter(
    priorAuthId: string,
    tenantId: string,
    denialReason: string,
    additionalInfo?: string
  ): Promise<string> {
    // Get original PA data
    const paQuery = `
      SELECT pa.*, p.first_name, p.last_name, p.dob, p.sex
      FROM prior_authorizations pa
      JOIN patients p ON pa.patient_id = p.id
      WHERE pa.id = $1 AND pa.tenant_id = $2
    `;

    const paResult = await pool.query(paQuery, [priorAuthId, tenantId]);
    const pa = paResult.rows[0];

    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let letter = `${today}\n\n`;
    letter += `RE: APPEAL OF DENIED PRIOR AUTHORIZATION\n`;
    letter += `Original Reference Number: ${pa.reference_number}\n`;
    if (pa.auth_number) {
      letter += `Payer Authorization Number: ${pa.auth_number}\n`;
    }
    letter += `Patient: ${pa.first_name} ${pa.last_name}\n`;
    letter += `DOB: ${pa.dob}\n\n`;

    letter += `To Whom It May Concern,\n\n`;

    letter += `I am writing to formally appeal the denial of the prior authorization request for `;
    letter += `${pa.medication_name || pa.procedure_code} for the above-referenced patient.\n\n`;

    letter += `REASON FOR DENIAL:\n${denialReason}\n\n`;

    letter += `GROUNDS FOR APPEAL:\n`;
    letter += `The denial of this request is not appropriate for the following reasons:\n\n`;

    if (additionalInfo) {
      letter += `${additionalInfo}\n\n`;
    }

    letter += `This ${pa.medication_name ? 'medication' : 'procedure'} remains medically necessary `;
    letter += `for optimal patient care. The patient's condition warrants this treatment, and alternative `;
    letter += `options have been exhausted or are inappropriate.\n\n`;

    letter += `I respectfully request that you reconsider this denial and approve the prior authorization. `;
    letter += `I am available for peer-to-peer discussion if needed to clarify any aspects of this request.\n\n`;

    letter += `Please provide a timely response to this appeal, as delay in treatment may result in `;
    letter += `clinical deterioration and increased healthcare costs.\n\n`;

    letter += `Sincerely,\n\n`;
    letter += `[Provider Name]\n`;
    letter += `[Provider NPI]\n`;

    return letter;
  }

  /**
   * Get pre-written templates for common scenarios
   */
  static async getCommonTemplates(tenantId: string, authType: string) {
    const query = `
      SELECT
        name,
        medication_name,
        procedure_code,
        clinical_justification_template,
        previous_treatments_template,
        common_diagnosis_codes
      FROM prior_auth_templates
      WHERE (tenant_id = $1 OR tenant_id = 'default')
        AND auth_type = $2
        AND is_active = true
      ORDER BY usage_count DESC
      LIMIT 10
    `;

    const result = await pool.query(query, [tenantId, authType]);
    return result.rows;
  }
}
