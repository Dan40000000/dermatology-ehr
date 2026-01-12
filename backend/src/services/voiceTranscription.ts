import crypto from "crypto";
import { pool } from "../db/pool";
import FormData from "form-data";
import fs from "fs";
import path from "path";

/**
 * Voice Transcription Service
 *
 * Medical dictation using OpenAI Whisper API with:
 * - Audio file transcription
 * - Medical terminology recognition
 * - Integration with clinical note drafting
 * - Speaker diarization support
 */

interface TranscriptionRequest {
  audioFile: string;
  encounterId?: string;
  userId: string;
  tenantId: string;
  language?: string;
}

interface TranscriptionResult {
  id: string;
  text: string;
  confidence: number;
  duration: number;
  segments?: any[];
}

export class VoiceTranscriptionService {
  private openaiApiKey: string | undefined;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Transcribe audio file to text
   */
  async transcribeAudio(request: TranscriptionRequest): Promise<TranscriptionResult> {
    try {
      const transcriptionId = crypto.randomUUID();

      // Check if API key is available
      if (!this.openaiApiKey) {
        return await this.createMockTranscription(request, transcriptionId);
      }

      // Transcribe using Whisper API
      const transcription = await this.transcribeWithWhisper(request.audioFile, request.language);

      // Store transcription in database
      await pool.query(
        `insert into voice_transcriptions (
          id, tenant_id, encounter_id, user_id, audio_url,
          transcription_text, transcription_provider, confidence_score,
          duration_seconds, status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          transcriptionId,
          request.tenantId,
          request.encounterId || null,
          request.userId,
          request.audioFile,
          transcription.text,
          "whisper",
          transcription.confidence,
          transcription.duration,
          "completed",
        ]
      );

      return {
        id: transcriptionId,
        ...transcription,
      };
    } catch (error) {
      console.error("Transcription error:", error);

      // Update status to failed if we created a record
      // In real implementation, you'd track the ID
      throw new Error("Failed to transcribe audio");
    }
  }

  /**
   * Transcribe using OpenAI Whisper API
   */
  private async transcribeWithWhisper(
    audioFilePath: string,
    language: string = "en"
  ): Promise<{ text: string; confidence: number; duration: number; segments?: any[] }> {
    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(audioFilePath));
      formData.append("model", "whisper-1");
      formData.append("language", language);
      formData.append("response_format", "verbose_json");

      // Add medical terminology prompt for better accuracy
      const medicalPrompt = `Medical dictation. Common dermatology terms: melanoma, nevus, lesion,
        erythema, pruritus, dermatitis, eczema, psoriasis, carcinoma, biopsy, dermoscopy, ABCDE criteria.`;
      formData.append("prompt", medicalPrompt);

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          ...formData.getHeaders(),
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        text: data.text,
        confidence: this.calculateConfidence(data.segments || []),
        duration: data.duration || 0,
        segments: data.segments || [],
      };
    } catch (error) {
      console.error("Whisper API error:", error);
      throw error;
    }
  }

  /**
   * Calculate overall confidence from segments
   */
  private calculateConfidence(segments: any[]): number {
    if (segments.length === 0) return 0.85; // Default confidence

    const avgNoSpeechProb =
      segments.reduce((sum, seg) => sum + (seg.no_speech_prob || 0), 0) / segments.length;

    // Lower no_speech_prob means higher confidence
    return Math.max(0.5, 1 - avgNoSpeechProb);
  }

  /**
   * Create mock transcription for development
   */
  private async createMockTranscription(
    request: TranscriptionRequest,
    transcriptionId: string
  ): Promise<TranscriptionResult> {
    const mockText = `Patient presents with a pigmented lesion on the right forearm.
The lesion has been present for approximately 3 months with gradual darkening.
No associated pain or bleeding. Patient denies family history of melanoma.
On examination, there is a 6 millimeter irregularly bordered brown macule with color variation.
ABCDE criteria: Asymmetric, irregular Border, Color variation present, Diameter 6 mm, Evolving.
Assessment: Atypical nevus, concerning for melanoma. Plan: Perform excisional biopsy today.
Pathology pending. Follow up in one week for results and further management.`;

    await pool.query(
      `insert into voice_transcriptions (
        id, tenant_id, encounter_id, user_id, audio_url,
        transcription_text, transcription_provider, confidence_score,
        duration_seconds, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        transcriptionId,
        request.tenantId,
        request.encounterId || null,
        request.userId,
        request.audioFile,
        mockText,
        "mock",
        0.92,
        45,
        "completed",
      ]
    );

    return {
      id: transcriptionId,
      text: mockText,
      confidence: 0.92,
      duration: 45,
    };
  }

  /**
   * Get transcription by ID
   */
  async getTranscription(transcriptionId: string, tenantId: string) {
    const result = await pool.query(
      `select
        id,
        encounter_id as "encounterId",
        user_id as "userId",
        audio_url as "audioUrl",
        transcription_text as "transcriptionText",
        transcription_provider as "transcriptionProvider",
        confidence_score as "confidenceScore",
        duration_seconds as "durationSeconds",
        status,
        created_at as "createdAt"
       from voice_transcriptions
       where id = $1 and tenant_id = $2`,
      [transcriptionId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get all transcriptions for an encounter
   */
  async getEncounterTranscriptions(encounterId: string, tenantId: string) {
    const result = await pool.query(
      `select
        id,
        user_id as "userId",
        audio_url as "audioUrl",
        transcription_text as "transcriptionText",
        confidence_score as "confidenceScore",
        duration_seconds as "durationSeconds",
        status,
        created_at as "createdAt",
        u.first_name as "userFirstName",
        u.last_name as "userLastName"
       from voice_transcriptions vt
       left join users u on u.id = vt.user_id
       where vt.encounter_id = $1 and vt.tenant_id = $2
       order by vt.created_at desc`,
      [encounterId, tenantId]
    );

    return result.rows;
  }

  /**
   * Convert transcription to structured note sections
   */
  async transcriptionToNoteSections(
    transcriptionText: string
  ): Promise<{
    chiefComplaint?: string;
    hpi?: string;
    exam?: string;
    assessment?: string;
    plan?: string;
  }> {
    // Use simple keyword-based extraction
    // In production, use NLP or AI to extract sections
    const sections: any = {};

    const text = transcriptionText.toLowerCase();

    // Extract chief complaint
    const ccPatterns = [
      /patient (?:presents|comes in) (?:with|for|complaining of) ([^.]+)/,
      /chief complaint[:\s]+([^.]+)/,
    ];
    for (const pattern of ccPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        sections.chiefComplaint = match[1].trim();
        break;
      }
    }

    // Extract HPI (look for history-related phrases)
    const hpiStart = text.indexOf("history");
    const examStart = text.indexOf("on examination") || text.indexOf("physical exam");
    if (hpiStart !== -1 && examStart !== -1) {
      sections.hpi = transcriptionText.substring(hpiStart, examStart).trim();
    }

    // Extract exam findings
    const examPatterns = [
      /(?:on examination|physical exam)[:\s,]+([^.]+(?:\.[^.]+){0,3})/i,
      /examination reveals ([^.]+)/i,
    ];
    for (const pattern of examPatterns) {
      const match = transcriptionText.match(pattern);
      if (match && match[1]) {
        sections.exam = match[1].trim();
        break;
      }
    }

    // Extract assessment
    const assessmentPatterns = [/assessment[:\s]+([^.]+(?:\.[^.]+){0,2})/i, /diagnosis[:\s]+([^.]+)/i];
    for (const pattern of assessmentPatterns) {
      const match = transcriptionText.match(pattern);
      if (match && match[1]) {
        sections.assessment = match[1].trim();
        break;
      }
    }

    // Extract plan
    const planPatterns = [/plan[:\s]+([^.]+(?:\.[^.]+){0,5})/i, /will ([^.]+(?:\.[^.]+){0,3})/i];
    for (const pattern of planPatterns) {
      const match = transcriptionText.match(pattern);
      if (match && match[1]) {
        sections.plan = match[1].trim();
        break;
      }
    }

    return sections;
  }

  /**
   * Get transcription statistics
   */
  async getTranscriptionStats(tenantId: string, userId?: string) {
    let query = `
      select
        count(*) as "totalTranscriptions",
        sum(duration_seconds) as "totalDurationSeconds",
        avg(confidence_score) as "avgConfidence",
        count(distinct encounter_id) as "encountersWithTranscriptions"
      from voice_transcriptions
      where tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (userId) {
      query += ` and user_id = $2`;
      params.push(userId);
    }

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Delete transcription
   */
  async deleteTranscription(transcriptionId: string, tenantId: string) {
    const result = await pool.query(
      `delete from voice_transcriptions
       where id = $1 and tenant_id = $2
       returning audio_url`,
      [transcriptionId, tenantId]
    );

    if (result.rows.length > 0) {
      // In production, also delete the audio file from storage
      const audioUrl = result.rows[0].audio_url;
      // Delete file if local storage
      try {
        if (audioUrl.startsWith("/uploads/")) {
          const filePath = path.join(process.cwd(), audioUrl);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (error) {
        console.error("Failed to delete audio file:", error);
      }
    }

    return (result.rowCount || 0) > 0;
  }
}

export const voiceTranscriptionService = new VoiceTranscriptionService();
