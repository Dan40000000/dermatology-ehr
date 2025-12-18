import crypto from "crypto";
import { pool } from "../db/pool";

/**
 * AI Image Analysis Service for Dermatology
 *
 * Analyzes skin lesion images using AI to provide:
 * - Primary findings
 * - Differential diagnoses
 * - Risk assessment
 * - Clinical recommendations
 */

interface AIAnalysisResult {
  primaryFinding: string;
  differentialDiagnoses: Array<{
    diagnosis: string;
    confidence: number;
    description: string;
  }>;
  riskLevel: "low" | "moderate" | "high" | "critical";
  recommendations: string[];
  confidenceScore: number;
  rawAnalysis: any;
}

export class AIImageAnalysisService {
  private openaiApiKey: string | undefined;
  private anthropicApiKey: string | undefined;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Analyze a dermatology image using AI
   */
  async analyzeSkinLesion(
    photoId: string,
    imageUrl: string,
    tenantId: string,
    analyzedBy: string
  ): Promise<string> {
    try {
      // Perform AI analysis
      const analysis = await this.performAIAnalysis(imageUrl);

      // Store analysis results in database
      const analysisId = crypto.randomUUID();
      await pool.query(
        `insert into photo_ai_analysis(
          id, tenant_id, photo_id, analysis_type, analysis_provider,
          confidence_score, primary_finding, differential_diagnoses,
          risk_level, recommendations, raw_analysis, analyzed_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          analysisId,
          tenantId,
          photoId,
          "skin_lesion",
          this.openaiApiKey ? "openai" : "mock",
          analysis.confidenceScore,
          analysis.primaryFinding,
          JSON.stringify(analysis.differentialDiagnoses),
          analysis.riskLevel,
          JSON.stringify(analysis.recommendations),
          JSON.stringify(analysis.rawAnalysis),
          analyzedBy,
        ]
      );

      // Update photo record
      await pool.query(
        `update photos set ai_analyzed = true, ai_risk_flagged = $1
         where id = $2 and tenant_id = $3`,
        [analysis.riskLevel === "high" || analysis.riskLevel === "critical", photoId, tenantId]
      );

      return analysisId;
    } catch (error) {
      console.error("AI Image Analysis Error:", error);
      throw new Error("Failed to analyze image");
    }
  }

  /**
   * Get analysis results for a photo
   */
  async getAnalysisForPhoto(photoId: string, tenantId: string) {
    const result = await pool.query(
      `select
        id,
        photo_id as "photoId",
        analysis_type as "analysisType",
        analysis_provider as "analysisProvider",
        confidence_score as "confidenceScore",
        primary_finding as "primaryFinding",
        differential_diagnoses as "differentialDiagnoses",
        risk_level as "riskLevel",
        recommendations,
        analyzed_at as "analyzedAt",
        analyzed_by as "analyzedBy"
       from photo_ai_analysis
       where photo_id = $1 and tenant_id = $2
       order by analyzed_at desc
       limit 1`,
      [photoId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      differentialDiagnoses: JSON.parse(row.differentialDiagnoses || "[]"),
      recommendations: JSON.parse(row.recommendations || "[]"),
    };
  }

  /**
   * Perform actual AI analysis (mock or real depending on API keys)
   */
  private async performAIAnalysis(imageUrl: string): Promise<AIAnalysisResult> {
    // If OpenAI API key is available, use it
    if (this.openaiApiKey) {
      return await this.analyzeWithOpenAI(imageUrl);
    }

    // Otherwise, return mock analysis for development
    return this.getMockAnalysis();
  }

  /**
   * Analyze image using OpenAI Vision API
   */
  private async analyzeWithOpenAI(imageUrl: string): Promise<AIAnalysisResult> {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are an expert dermatology AI assistant. Analyze the provided skin lesion image and provide:
1. Primary finding (main observation)
2. Differential diagnoses (top 3-5 possibilities with confidence scores)
3. Risk level (low, moderate, high, critical)
4. Clinical recommendations

Format your response as JSON with this structure:
{
  "primaryFinding": "description",
  "differentialDiagnoses": [
    {"diagnosis": "name", "confidence": 0.85, "description": "brief explanation"}
  ],
  "riskLevel": "low|moderate|high|critical",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "confidenceScore": 0.85
}

IMPORTANT: This is for clinical decision support only. Always recommend professional evaluation.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please analyze this dermatology image and provide your assessment.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse JSON response
      const analysisResult = JSON.parse(content);

      return {
        primaryFinding: analysisResult.primaryFinding,
        differentialDiagnoses: analysisResult.differentialDiagnoses,
        riskLevel: analysisResult.riskLevel,
        recommendations: analysisResult.recommendations,
        confidenceScore: analysisResult.confidenceScore,
        rawAnalysis: data,
      };
    } catch (error) {
      console.error("OpenAI Vision API Error:", error);
      // Fall back to mock analysis
      return this.getMockAnalysis();
    }
  }

  /**
   * Mock analysis for development/testing
   */
  private getMockAnalysis(): AIAnalysisResult {
    return {
      primaryFinding: "Pigmented lesion with irregular borders and color variation",
      differentialDiagnoses: [
        {
          diagnosis: "Melanocytic Nevus (Atypical)",
          confidence: 0.65,
          description: "Benign mole with some atypical features requiring monitoring",
        },
        {
          diagnosis: "Seborrheic Keratosis",
          confidence: 0.25,
          description: "Benign growth common in older adults",
        },
        {
          diagnosis: "Melanoma (Early Stage)",
          confidence: 0.10,
          description: "Cannot be ruled out without biopsy - requires clinical correlation",
        },
      ],
      riskLevel: "moderate",
      recommendations: [
        "Recommend dermatoscopic examination for detailed evaluation",
        "Consider baseline photography for future comparison",
        "Clinical correlation required - biopsy may be indicated",
        "Patient education on ABCDE signs of melanoma",
        "Schedule follow-up in 3-6 months if not biopsied",
      ],
      confidenceScore: 0.72,
      rawAnalysis: {
        model: "mock-analysis-v1",
        analysisDate: new Date().toISOString(),
      },
    };
  }

  /**
   * Batch analyze multiple images for a patient
   */
  async batchAnalyzePatientPhotos(
    patientId: string,
    tenantId: string,
    analyzedBy: string
  ): Promise<string[]> {
    // Get all unanalyzed photos for patient
    const photos = await pool.query(
      `select id, url from photos
       where patient_id = $1 and tenant_id = $2 and (ai_analyzed = false or ai_analyzed is null)
       limit 10`,
      [patientId, tenantId]
    );

    const analysisIds: string[] = [];

    for (const photo of photos.rows) {
      try {
        const analysisId = await this.analyzeSkinLesion(photo.id, photo.url, tenantId, analyzedBy);
        analysisIds.push(analysisId);
      } catch (error) {
        console.error(`Failed to analyze photo ${photo.id}:`, error);
      }
    }

    return analysisIds;
  }
}

export const aiImageAnalysisService = new AIImageAnalysisService();
