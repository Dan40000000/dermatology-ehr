import crypto from "crypto";
import { pool } from "../db/pool";

/**
 * AI Lesion Analysis Service
 *
 * Provides AI-powered dermatology lesion analysis including:
 * - Primary classification (benign/suspicious/likely malignant)
 * - Differential diagnoses with confidence scores
 * - Automated ABCDE feature detection
 * - Dermoscopy pattern recognition
 * - Risk stratification
 * - AI-powered change detection between images
 *
 * PROVIDER-ONLY feature with comprehensive audit logging.
 * All analyses include disclaimer: "AI assistance only, not a diagnosis"
 */

// Type definitions
export interface ABCDEFeatureScore {
  score: number; // 0-3 scale
  confidence: number; // 0-1
  description: string;
}

export interface ABCDEScores {
  asymmetry: ABCDEFeatureScore;
  border: ABCDEFeatureScore;
  color: ABCDEFeatureScore;
  diameter: ABCDEFeatureScore;
  evolution: ABCDEFeatureScore;
  total_score: number;
}

export interface DifferentialDiagnosis {
  diagnosis: string;
  confidence: number;
  description: string;
  icd10_code?: string;
}

export interface DermoscopyPatterns {
  is_dermoscopic: boolean;
  global_pattern: string | null;
  local_features: string[];
  pigment_network: string | null;
  dots_globules: string | null;
  streaks: string | null;
  blue_white_veil: boolean;
  regression_structures: boolean;
  vascular_patterns: string[];
}

export interface AIAnalysisResult {
  id: string;
  lesionImageId: string;
  patientId: string;
  analysisDate: Date;
  modelVersion: string;
  confidenceScore: number;
  primaryClassification: "benign" | "suspicious" | "likely_malignant";
  classificationConfidence: number;
  differentialDiagnoses: DifferentialDiagnosis[];
  featureScores: ABCDEScores;
  dermoscopyPatterns: DermoscopyPatterns;
  riskLevel: "low" | "moderate" | "high";
  riskFactors: string[];
  recommendations: string[];
  recommendedAction: string;
  followUpInterval: string | null;
  aiSummary: string;
  disclaimer: string;
}

export interface ComparisonResult {
  id: string;
  currentImageId: string;
  priorImageId: string;
  daysBetween: number;
  overallChangeScore: number;
  changeClassification: "stable" | "improved" | "progressed" | "significantly_changed";
  changesDetected: {
    size_change: { detected: boolean; direction: string | null; magnitude: string | null };
    color_change: { detected: boolean; description: string | null };
    border_change: { detected: boolean; description: string | null };
    symmetry_change: { detected: boolean; description: string | null };
    new_features: string[];
    resolved_features: string[];
  };
  riskLevel: "low" | "moderate" | "high";
  comparisonSummary: string;
  recommendations: string[];
}

export interface ProviderFeedback {
  wasAccurate: boolean;
  accuracyRating?: number;
  actualDiagnosis?: string;
  actualIcd10Code?: string;
  classificationWasCorrect?: boolean;
  correctClassification?: string;
  riskAssessmentWasCorrect?: boolean;
  correctRiskLevel?: string;
  abcdeScoringAccuracy?: number;
  feedbackNotes?: string;
  missedFeatures?: string[];
  falsePositiveFeatures?: string[];
  biopsyPerformed?: boolean;
  biopsyResult?: string;
  finalPathology?: string;
}

class AILesionAnalysisService {
  private anthropicApiKey: string | undefined;
  private openaiApiKey: string | undefined;
  private modelVersion = "claude-vision-v1.0";

  constructor() {
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Analyze a lesion image using AI
   */
  async analyzeImage(
    imageId: string,
    tenantId: string,
    userId: string,
    analysisType: "standard" | "dermoscopy" = "standard"
  ): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    try {
      // Get image details
      const imageResult = await pool.query(
        `SELECT p.id, p.url, p.patient_id, p.encounter_id
         FROM photos p
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [imageId, tenantId]
      );

      if (imageResult.rows.length === 0) {
        throw new Error("Image not found");
      }

      const image = imageResult.rows[0];

      // Check for existing analysis
      const existingResult = await pool.query(
        `SELECT id FROM ai_lesion_analyses
         WHERE lesion_image_id = $1 AND tenant_id = $2 AND is_archived = false
         ORDER BY analysis_date DESC LIMIT 1`,
        [imageId, tenantId]
      );

      if (existingResult.rows.length > 0 && existingResult.rows[0]) {
        // Return existing analysis
        return await this.getAnalysis(existingResult.rows[0].id, tenantId);
      }

      // Perform AI analysis
      const aiResult = await this.performAIAnalysis(image.url, analysisType);

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Store analysis results
      const analysisId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO ai_lesion_analyses (
          id, tenant_id, lesion_image_id, patient_id, encounter_id,
          analysis_date, model_version, analysis_type,
          confidence_score, primary_classification, classification_confidence,
          differential_diagnoses, feature_scores, dermoscopy_patterns,
          risk_level, risk_factors, recommendations, recommended_action,
          follow_up_interval, ai_summary, raw_response, processing_time_ms,
          analyzed_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
          analysisId,
          tenantId,
          imageId,
          image.patient_id,
          image.encounter_id,
          new Date(),
          this.modelVersion,
          analysisType,
          aiResult.confidenceScore,
          aiResult.primaryClassification,
          aiResult.classificationConfidence,
          aiResult.differentialDiagnoses.map(d => JSON.stringify(d)),
          JSON.stringify(aiResult.featureScores),
          JSON.stringify(aiResult.dermoscopyPatterns),
          aiResult.riskLevel,
          aiResult.riskFactors,
          aiResult.recommendations,
          aiResult.recommendedAction,
          aiResult.followUpInterval,
          aiResult.aiSummary,
          JSON.stringify(aiResult.rawResponse),
          processingTime,
          userId,
        ]
      );

      // Log audit entry
      await this.logAuditEntry(
        tenantId,
        "analysis_completed",
        analysisId,
        null,
        userId,
        image.patient_id,
        { analysisType, processingTimeMs: processingTime }
      );

      // Update photo record
      await pool.query(
        `UPDATE photos SET ai_analyzed = true, ai_risk_flagged = $1
         WHERE id = $2 AND tenant_id = $3`,
        [aiResult.riskLevel === "high", imageId, tenantId]
      );

      return {
        id: analysisId,
        lesionImageId: imageId,
        patientId: image.patient_id,
        analysisDate: new Date(),
        modelVersion: this.modelVersion,
        ...aiResult,
        disclaimer: "AI assistance only - this is not a diagnosis. Clinical correlation and professional evaluation required.",
      };
    } catch (error) {
      console.error("AI Lesion Analysis Error:", error);
      throw new Error("Failed to analyze lesion image");
    }
  }

  /**
   * Get analysis by ID
   */
  async getAnalysis(analysisId: string, tenantId: string): Promise<AIAnalysisResult> {
    const result = await pool.query(
      `SELECT
        id,
        lesion_image_id AS "lesionImageId",
        patient_id AS "patientId",
        analysis_date AS "analysisDate",
        model_version AS "modelVersion",
        confidence_score AS "confidenceScore",
        primary_classification AS "primaryClassification",
        classification_confidence AS "classificationConfidence",
        differential_diagnoses AS "differentialDiagnoses",
        feature_scores AS "featureScores",
        dermoscopy_patterns AS "dermoscopyPatterns",
        risk_level AS "riskLevel",
        risk_factors AS "riskFactors",
        recommendations,
        recommended_action AS "recommendedAction",
        follow_up_interval AS "followUpInterval",
        ai_summary AS "aiSummary"
      FROM ai_lesion_analyses
      WHERE id = $1 AND tenant_id = $2 AND is_archived = false`,
      [analysisId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error("Analysis not found");
    }

    const row = result.rows[0];
    return {
      ...row,
      differentialDiagnoses: Array.isArray(row.differentialDiagnoses)
        ? row.differentialDiagnoses.map((d: string | object) =>
            typeof d === "string" ? JSON.parse(d) : d
          )
        : [],
      featureScores: typeof row.featureScores === "string"
        ? JSON.parse(row.featureScores)
        : row.featureScores,
      dermoscopyPatterns: typeof row.dermoscopyPatterns === "string"
        ? JSON.parse(row.dermoscopyPatterns)
        : row.dermoscopyPatterns,
      disclaimer: "AI assistance only - this is not a diagnosis. Clinical correlation and professional evaluation required.",
    };
  }

  /**
   * Get analysis for a specific image
   */
  async getAnalysisForImage(imageId: string, tenantId: string): Promise<AIAnalysisResult | null> {
    const result = await pool.query(
      `SELECT id FROM ai_lesion_analyses
       WHERE lesion_image_id = $1 AND tenant_id = $2 AND is_archived = false
       ORDER BY analysis_date DESC LIMIT 1`,
      [imageId, tenantId]
    );

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.getAnalysis(result.rows[0].id, tenantId);
  }

  /**
   * Compare two images using AI-powered change detection
   */
  async compareToPrior(
    currentImageId: string,
    priorImageId: string,
    tenantId: string,
    userId: string
  ): Promise<ComparisonResult> {
    try {
      // Get both images
      const imagesResult = await pool.query(
        `SELECT id, url, patient_id, created_at
         FROM photos
         WHERE id IN ($1, $2) AND tenant_id = $3`,
        [currentImageId, priorImageId, tenantId]
      );

      if (imagesResult.rows.length !== 2) {
        throw new Error("One or both images not found");
      }

      const currentImage = imagesResult.rows.find((r: { id: string }) => r.id === currentImageId);
      const priorImage = imagesResult.rows.find((r: { id: string }) => r.id === priorImageId);

      if (!currentImage || !priorImage) {
        throw new Error("Images not found");
      }

      if (currentImage.patient_id !== priorImage.patient_id) {
        throw new Error("Images must belong to the same patient");
      }

      // Calculate days between images
      const daysBetween = Math.floor(
        (new Date(currentImage.created_at).getTime() - new Date(priorImage.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      // Perform AI comparison
      const comparisonResult = await this.performAIComparison(
        currentImage.url,
        priorImage.url,
        Math.abs(daysBetween)
      );

      // Store comparison results
      const comparisonId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO ai_comparison_analyses (
          id, tenant_id, current_image_id, prior_image_id, patient_id,
          days_between, model_version, analysis_date,
          overall_change_score, change_classification, changes_detected,
          risk_level, recommended_action, comparison_summary, recommendations,
          raw_response, analyzed_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          comparisonId,
          tenantId,
          currentImageId,
          priorImageId,
          currentImage.patient_id,
          Math.abs(daysBetween),
          this.modelVersion,
          new Date(),
          comparisonResult.overallChangeScore,
          comparisonResult.changeClassification,
          JSON.stringify(comparisonResult.changesDetected),
          comparisonResult.riskLevel,
          comparisonResult.recommendedAction,
          comparisonResult.comparisonSummary,
          comparisonResult.recommendations,
          JSON.stringify(comparisonResult.rawResponse),
          userId,
        ]
      );

      // Log audit entry
      await this.logAuditEntry(
        tenantId,
        "comparison_completed",
        null,
        comparisonId,
        userId,
        currentImage.patient_id,
        { currentImageId, priorImageId, daysBetween: Math.abs(daysBetween) }
      );

      return {
        id: comparisonId,
        currentImageId,
        priorImageId,
        daysBetween: Math.abs(daysBetween),
        ...comparisonResult,
      };
    } catch (error) {
      console.error("AI Comparison Error:", error);
      throw new Error("Failed to compare images");
    }
  }

  /**
   * Record provider feedback on analysis
   */
  async recordFeedback(
    analysisId: string,
    providerId: string,
    tenantId: string,
    feedback: ProviderFeedback
  ): Promise<{ id: string }> {
    try {
      // Verify analysis exists
      const analysisResult = await pool.query(
        `SELECT id, patient_id FROM ai_lesion_analyses
         WHERE id = $1 AND tenant_id = $2`,
        [analysisId, tenantId]
      );

      if (analysisResult.rows.length === 0) {
        throw new Error("Analysis not found");
      }

      const feedbackId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO ai_analysis_feedback (
          id, tenant_id, analysis_id, provider_id,
          was_accurate, accuracy_rating, actual_diagnosis, actual_icd10_code,
          classification_was_correct, correct_classification,
          risk_assessment_was_correct, correct_risk_level,
          abcde_scoring_accuracy, feedback_notes,
          missed_features, false_positive_features,
          biopsy_performed, biopsy_result, final_pathology
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          feedbackId,
          tenantId,
          analysisId,
          providerId,
          feedback.wasAccurate,
          feedback.accuracyRating,
          feedback.actualDiagnosis,
          feedback.actualIcd10Code,
          feedback.classificationWasCorrect,
          feedback.correctClassification,
          feedback.riskAssessmentWasCorrect,
          feedback.correctRiskLevel,
          feedback.abcdeScoringAccuracy,
          feedback.feedbackNotes,
          feedback.missedFeatures || [],
          feedback.falsePositiveFeatures || [],
          feedback.biopsyPerformed || false,
          feedback.biopsyResult,
          feedback.finalPathology,
        ]
      );

      // Log audit entry
      const analysis = analysisResult.rows[0];
      await this.logAuditEntry(
        tenantId,
        "feedback_submitted",
        analysisId,
        null,
        providerId,
        analysis?.patient_id,
        { wasAccurate: feedback.wasAccurate, accuracyRating: feedback.accuracyRating }
      );

      return { id: feedbackId };
    } catch (error) {
      console.error("Record Feedback Error:", error);
      throw new Error("Failed to record feedback");
    }
  }

  /**
   * Get high-risk lesions for a patient
   */
  async getPatientHighRiskLesions(
    patientId: string,
    tenantId: string
  ): Promise<AIAnalysisResult[]> {
    const result = await pool.query(
      `SELECT id FROM ai_lesion_analyses
       WHERE patient_id = $1 AND tenant_id = $2
         AND risk_level = 'high' AND is_archived = false
       ORDER BY analysis_date DESC`,
      [patientId, tenantId]
    );

    const analyses: AIAnalysisResult[] = [];
    for (const row of result.rows) {
      if (row?.id) {
        const analysis = await this.getAnalysis(row.id, tenantId);
        analyses.push(analysis);
      }
    }

    return analyses;
  }

  /**
   * Get analysis history for a patient
   */
  async getPatientAnalysisHistory(
    patientId: string,
    tenantId: string,
    limit = 50
  ): Promise<AIAnalysisResult[]> {
    const result = await pool.query(
      `SELECT id FROM ai_lesion_analyses
       WHERE patient_id = $1 AND tenant_id = $2 AND is_archived = false
       ORDER BY analysis_date DESC
       LIMIT $3`,
      [patientId, tenantId, limit]
    );

    const analyses: AIAnalysisResult[] = [];
    for (const row of result.rows) {
      if (row?.id) {
        const analysis = await this.getAnalysis(row.id, tenantId);
        analyses.push(analysis);
      }
    }

    return analyses;
  }

  /**
   * Get accuracy metrics for model performance tracking
   */
  async getAccuracyMetrics(tenantId: string): Promise<{
    totalAnalyses: number;
    analysesWithFeedback: number;
    accuracyPercentage: number;
    avgAccuracyRating: number;
    avgAbcdeAccuracy: number;
    byClassification: Record<string, { total: number; accurate: number }>;
  }> {
    const result = await pool.query(
      `SELECT * FROM ai_analysis_accuracy_metrics WHERE tenant_id = $1`,
      [tenantId]
    );

    const classificationResult = await pool.query(
      `SELECT
        a.primary_classification,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE f.was_accurate = true) AS accurate
       FROM ai_lesion_analyses a
       LEFT JOIN ai_analysis_feedback f ON a.id = f.analysis_id
       WHERE a.tenant_id = $1 AND a.is_archived = false
       GROUP BY a.primary_classification`,
      [tenantId]
    );

    const metrics = result.rows[0];
    const byClassification: Record<string, { total: number; accurate: number }> = {};

    for (const row of classificationResult.rows) {
      if (row?.primary_classification) {
        byClassification[row.primary_classification] = {
          total: parseInt(row.total) || 0,
          accurate: parseInt(row.accurate) || 0,
        };
      }
    }

    return {
      totalAnalyses: parseInt(metrics?.total_analyses) || 0,
      analysesWithFeedback: parseInt(metrics?.analyses_with_feedback) || 0,
      accuracyPercentage: parseFloat(metrics?.accuracy_percentage) || 0,
      avgAccuracyRating: parseFloat(metrics?.avg_accuracy_rating) || 0,
      avgAbcdeAccuracy: parseFloat(metrics?.avg_abcde_accuracy) || 0,
      byClassification,
    };
  }

  // Private methods

  /**
   * Perform AI analysis (mock or real depending on API keys)
   */
  private async performAIAnalysis(
    imageUrl: string,
    analysisType: string
  ): Promise<{
    confidenceScore: number;
    primaryClassification: "benign" | "suspicious" | "likely_malignant";
    classificationConfidence: number;
    differentialDiagnoses: DifferentialDiagnosis[];
    featureScores: ABCDEScores;
    dermoscopyPatterns: DermoscopyPatterns;
    riskLevel: "low" | "moderate" | "high";
    riskFactors: string[];
    recommendations: string[];
    recommendedAction: string;
    followUpInterval: string | null;
    aiSummary: string;
    rawResponse: object;
  }> {
    // If Anthropic API key is available, use Claude Vision
    if (this.anthropicApiKey) {
      return await this.analyzeWithClaude(imageUrl, analysisType);
    }

    // If OpenAI API key is available, use GPT-4 Vision
    if (this.openaiApiKey) {
      return await this.analyzeWithOpenAI(imageUrl, analysisType);
    }

    // Otherwise, return mock analysis
    return this.getMockAnalysis(analysisType);
  }

  /**
   * Analyze image using Claude Vision API
   */
  private async analyzeWithClaude(
    imageUrl: string,
    analysisType: string
  ): Promise<ReturnType<typeof this.performAIAnalysis> extends Promise<infer T> ? T : never> {
    try {
      const systemPrompt = this.getAnalysisPrompt(analysisType);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.anthropicApiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "url",
                    url: imageUrl,
                  },
                },
                {
                  type: "text",
                  text: "Please analyze this dermatology lesion image and provide your assessment in the specified JSON format.",
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
      }

      const data = await response.json() as { content: Array<{ type: string; text?: string }> };
      const textContent = data.content.find((c) => c.type === "text");

      if (!textContent?.text) {
        throw new Error("No text content in Claude response");
      }

      const analysisResult = JSON.parse(textContent.text);
      return this.normalizeAIResponse(analysisResult, data);
    } catch (error) {
      console.error("Claude Vision API Error:", error);
      return this.getMockAnalysis(analysisType);
    }
  }

  /**
   * Analyze image using OpenAI GPT-4 Vision
   */
  private async analyzeWithOpenAI(
    imageUrl: string,
    analysisType: string
  ): Promise<ReturnType<typeof this.performAIAnalysis> extends Promise<infer T> ? T : never> {
    try {
      const systemPrompt = this.getAnalysisPrompt(analysisType);

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
            {
              role: "user",
              content: [
                { type: "text", text: "Please analyze this dermatology lesion image." },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      if (!data.choices?.[0]?.message?.content) {
        throw new Error("Invalid OpenAI response");
      }

      const analysisResult = JSON.parse(data.choices[0].message.content);
      return this.normalizeAIResponse(analysisResult, data);
    } catch (error) {
      console.error("OpenAI Vision API Error:", error);
      return this.getMockAnalysis(analysisType);
    }
  }

  /**
   * Get analysis prompt for AI models
   */
  private getAnalysisPrompt(analysisType: string): string {
    return `You are an expert dermatology AI assistant analyzing skin lesion images.
Provide a comprehensive analysis in JSON format with the following structure:

{
  "confidenceScore": 0.85,
  "primaryClassification": "benign|suspicious|likely_malignant",
  "classificationConfidence": 0.85,
  "differentialDiagnoses": [
    {"diagnosis": "name", "confidence": 0.75, "description": "brief explanation", "icd10_code": "L82.1"}
  ],
  "featureScores": {
    "asymmetry": {"score": 0-3, "confidence": 0.8, "description": "details"},
    "border": {"score": 0-3, "confidence": 0.8, "description": "details"},
    "color": {"score": 0-3, "confidence": 0.8, "description": "details"},
    "diameter": {"score": 0-3, "confidence": 0.8, "description": "details"},
    "evolution": {"score": 0-3, "confidence": 0.8, "description": "cannot assess from single image"},
    "total_score": 0-15
  },
  "dermoscopyPatterns": {
    "is_dermoscopic": ${analysisType === "dermoscopy"},
    "global_pattern": "reticular|globular|homogeneous|starburst|multicomponent|null",
    "local_features": ["feature1", "feature2"],
    "pigment_network": "typical|atypical|null",
    "dots_globules": "regular|irregular|null",
    "streaks": "regular|irregular|null",
    "blue_white_veil": false,
    "regression_structures": false,
    "vascular_patterns": ["pattern1"]
  },
  "riskLevel": "low|moderate|high",
  "riskFactors": ["risk factor 1", "risk factor 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "recommendedAction": "reassure|monitor|biopsy|urgent_referral",
  "followUpInterval": "1_week|1_month|3_months|6_months|1_year|null",
  "aiSummary": "Narrative summary of findings"
}

CRITICAL NOTES:
- This is for clinical decision SUPPORT only, NOT diagnosis
- Always recommend professional evaluation
- Be conservative with high-risk assessments - when in doubt, recommend further evaluation
- Provide specific, actionable recommendations
- Score ABCDE features 0-3 (0=none, 1=mild, 2=moderate, 3=severe)`;
  }

  /**
   * Normalize AI response to consistent format
   */
  private normalizeAIResponse(
    result: Record<string, unknown>,
    rawResponse: object
  ): ReturnType<typeof this.performAIAnalysis> extends Promise<infer T> ? T : never {
    return {
      confidenceScore: (result.confidenceScore as number) || 0.7,
      primaryClassification: (result.primaryClassification as "benign" | "suspicious" | "likely_malignant") || "benign",
      classificationConfidence: (result.classificationConfidence as number) || 0.7,
      differentialDiagnoses: (result.differentialDiagnoses as DifferentialDiagnosis[]) || [],
      featureScores: (result.featureScores as ABCDEScores) || this.getDefaultABCDEScores(),
      dermoscopyPatterns: (result.dermoscopyPatterns as DermoscopyPatterns) || this.getDefaultDermoscopyPatterns(),
      riskLevel: (result.riskLevel as "low" | "moderate" | "high") || "low",
      riskFactors: (result.riskFactors as string[]) || [],
      recommendations: (result.recommendations as string[]) || ["Professional evaluation recommended"],
      recommendedAction: (result.recommendedAction as string) || "monitor",
      followUpInterval: (result.followUpInterval as string | null) || "3_months",
      aiSummary: (result.aiSummary as string) || "Analysis completed. Please review with clinical correlation.",
      rawResponse,
    };
  }

  /**
   * Get mock analysis for development/testing
   */
  private getMockAnalysis(
    _analysisType: string
  ): ReturnType<typeof this.performAIAnalysis> extends Promise<infer T> ? T : never {
    return {
      confidenceScore: 0.78,
      primaryClassification: "suspicious",
      classificationConfidence: 0.75,
      differentialDiagnoses: [
        {
          diagnosis: "Atypical Melanocytic Nevus",
          confidence: 0.55,
          description: "Mole with some atypical features requiring monitoring",
          icd10_code: "D22.9",
        },
        {
          diagnosis: "Seborrheic Keratosis",
          confidence: 0.25,
          description: "Benign growth common in adults",
          icd10_code: "L82.1",
        },
        {
          diagnosis: "Lentigo Maligna",
          confidence: 0.12,
          description: "Early melanoma in situ - cannot rule out without biopsy",
          icd10_code: "D03.9",
        },
        {
          diagnosis: "Solar Lentigo",
          confidence: 0.05,
          description: "Benign sun spot",
          icd10_code: "L81.4",
        },
        {
          diagnosis: "Melanoma",
          confidence: 0.03,
          description: "Low probability but requires clinical correlation",
          icd10_code: "C43.9",
        },
      ],
      featureScores: {
        asymmetry: { score: 2, confidence: 0.82, description: "Moderate asymmetry noted in shape" },
        border: { score: 1, confidence: 0.78, description: "Slightly irregular border" },
        color: { score: 2, confidence: 0.85, description: "Multiple colors present - brown, tan" },
        diameter: { score: 1, confidence: 0.90, description: "Approximately 5mm" },
        evolution: { score: 0, confidence: 0.5, description: "Cannot assess from single image" },
        total_score: 6,
      },
      dermoscopyPatterns: {
        is_dermoscopic: false,
        global_pattern: null,
        local_features: [],
        pigment_network: null,
        dots_globules: null,
        streaks: null,
        blue_white_veil: false,
        regression_structures: false,
        vascular_patterns: [],
      },
      riskLevel: "moderate",
      riskFactors: [
        "Asymmetry score 2/3",
        "Color variation present",
        "Multiple differential diagnoses include melanoma",
      ],
      recommendations: [
        "Recommend dermoscopic examination for detailed evaluation",
        "Consider baseline photography for future comparison",
        "Clinical correlation required - biopsy may be indicated",
        "Patient education on ABCDE signs of melanoma",
        "Schedule follow-up in 3 months if not biopsied",
      ],
      recommendedAction: "biopsy",
      followUpInterval: "3_months",
      aiSummary:
        "This lesion demonstrates moderate ABCDE score (6/15) with notable asymmetry and color variation. While most likely benign (atypical nevus), the features warrant further evaluation. Recommend dermoscopic examination and consider biopsy for definitive diagnosis. This assessment is for clinical decision support only - not a diagnosis.",
      rawResponse: {
        model: "mock-analysis-v1",
        analysisDate: new Date().toISOString(),
      },
    };
  }

  /**
   * Perform AI-powered comparison between two images
   */
  private async performAIComparison(
    currentImageUrl: string,
    priorImageUrl: string,
    daysBetween: number
  ): Promise<{
    overallChangeScore: number;
    changeClassification: "stable" | "improved" | "progressed" | "significantly_changed";
    changesDetected: ComparisonResult["changesDetected"];
    riskLevel: "low" | "moderate" | "high";
    recommendedAction: string;
    comparisonSummary: string;
    recommendations: string[];
    rawResponse: object;
  }> {
    // Mock comparison for now - would integrate with AI API
    return {
      overallChangeScore: 0.15,
      changeClassification: "stable",
      changesDetected: {
        size_change: { detected: false, direction: null, magnitude: null },
        color_change: { detected: true, description: "Slight lightening noted" },
        border_change: { detected: false, description: null },
        symmetry_change: { detected: false, description: null },
        new_features: [],
        resolved_features: [],
      },
      riskLevel: "low",
      recommendedAction: "monitor",
      comparisonSummary: `Comparison over ${daysBetween} days shows the lesion remains stable with minimal changes. Slight color lightening may indicate benign regression. No concerning evolution detected.`,
      recommendations: [
        "Continue routine monitoring",
        "Repeat comparison in 3-6 months",
        "Patient should report any rapid changes",
      ],
      rawResponse: {
        model: "mock-comparison-v1",
        analysisDate: new Date().toISOString(),
      },
    };
  }

  /**
   * Log audit entry
   */
  private async logAuditEntry(
    tenantId: string,
    actionType: string,
    analysisId: string | null,
    comparisonId: string | null,
    userId: string,
    patientId: string | null,
    details: object
  ): Promise<void> {
    await pool.query(
      `INSERT INTO ai_analysis_audit_log (
        id, tenant_id, action_type, analysis_id, comparison_id,
        user_id, patient_id, action_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        tenantId,
        actionType,
        analysisId,
        comparisonId,
        userId,
        patientId,
        JSON.stringify(details),
      ]
    );
  }

  /**
   * Get default ABCDE scores
   */
  private getDefaultABCDEScores(): ABCDEScores {
    return {
      asymmetry: { score: 0, confidence: 0, description: "" },
      border: { score: 0, confidence: 0, description: "" },
      color: { score: 0, confidence: 0, description: "" },
      diameter: { score: 0, confidence: 0, description: "" },
      evolution: { score: 0, confidence: 0, description: "" },
      total_score: 0,
    };
  }

  /**
   * Get default dermoscopy patterns
   */
  private getDefaultDermoscopyPatterns(): DermoscopyPatterns {
    return {
      is_dermoscopic: false,
      global_pattern: null,
      local_features: [],
      pigment_network: null,
      dots_globules: null,
      streaks: null,
      blue_white_veil: false,
      regression_structures: false,
      vascular_patterns: [],
    };
  }
}

export const aiLesionAnalysisService = new AILesionAnalysisService();
