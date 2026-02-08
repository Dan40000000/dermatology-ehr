/**
 * Ambient AI Medical Scribe Routes
 *
 * Handles recording, transcription, and AI-powered clinical note generation
 */

import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { auditLog } from '../services/audit';
import {
  transcribeAudio,
  generateClinicalNote,
  maskPHI,
  TranscriptionResult
} from '../services/ambientAI';

const router = Router();

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'ambient-recordings');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error: any) {
      cb(error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomUUID();
    cb(null, `recording-${uniqueId}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.webm', '.mp4', '.mp3', '.wav', '.m4a', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format'));
    }
  }
});

// Validation schemas
const startRecordingSchema = z.object({
  encounterId: z.string().optional(),
  patientId: z.string(),
  providerId: z.string(),
  consentObtained: z.boolean(),
  consentMethod: z.enum(['verbal', 'written', 'electronic']).optional()
});

const completeRecordingSchema = z.object({
  durationSeconds: z.coerce.number().min(1)
});

const updateNoteSchema = z.object({
  chiefComplaint: z.string().optional(),
  hpi: z.string().optional(),
  ros: z.string().optional(),
  physicalExam: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  editReason: z.string().optional()
}).strict();

const reviewActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_regeneration']),
  reason: z.string().optional()
});

// ============================================================================
// RECORDING ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/recordings/start
 * Start a new recording session
 */
router.post('/recordings/start', requireAuth, requireRoles(['provider', 'ma', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const parsed = startRecordingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { encounterId, patientId, providerId, consentObtained, consentMethod } = parsed.data;
    const tenantId = req.user!.tenantId;
    const recordingId = crypto.randomUUID();

    if (!consentObtained) {
      return res.status(400).json({ error: 'Patient consent required before recording' });
    }

    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );
    if (patientCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const providerCheck = await pool.query(
      'SELECT id FROM providers WHERE id = $1 AND tenant_id = $2',
      [providerId, tenantId]
    );
    if (providerCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    if (encounterId) {
      const encounterCheck = await pool.query(
        'SELECT id, patient_id FROM encounters WHERE id = $1 AND tenant_id = $2',
        [encounterId, tenantId]
      );
      if (encounterCheck.rowCount === 0) {
        return res.status(404).json({ error: 'Encounter not found' });
      }
      if (encounterCheck.rows[0].patient_id !== patientId) {
        return res.status(400).json({ error: 'Encounter does not match patient' });
      }
    }

    await pool.query(
      `INSERT INTO ambient_recordings (
        id, tenant_id, encounter_id, patient_id, provider_id,
        status, recording_status, consent_obtained, consent_method, consent_timestamp,
        started_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW())`,
      [
        recordingId,
        tenantId,
        encounterId || null,
        patientId,
        providerId,
        'recording',
        'recording',
        consentObtained,
        consentMethod || null,
      ]
    );

    await auditLog(tenantId, req.user?.id || null, 'ambient_recording_start', 'ambient_recording', recordingId);

    res.status(201).json({
      recordingId,
      status: 'recording',
      startedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Start recording error:', error);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

/**
 * POST /api/ambient/recordings/:id/upload
 * Upload audio file for an existing recording
 */
router.post('/recordings/:id/upload', requireAuth, upload.single('audio'), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id!;
    const tenantId = req.user!.tenantId;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const parsed = completeRecordingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    const { durationSeconds } = parsed.data;

    // Verify recording exists and belongs to tenant
    const recordingCheck = await pool.query(
      'SELECT id FROM ambient_recordings WHERE id = $1 AND tenant_id = $2',
      [recordingId, tenantId]
    );

    if (recordingCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Update recording with file info
    await pool.query(
      `UPDATE ambient_recordings
       SET file_path = $1,
           file_size_bytes = $2,
           mime_type = $3,
           duration_seconds = $4,
           recording_status = 'completed',
           status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6`,
      [req.file.path, req.file.size, req.file.mimetype, durationSeconds, recordingId, tenantId]
    );

    await auditLog(tenantId, req.user?.id || null, 'ambient_recording_upload', 'ambient_recording', recordingId);

    // Automatically start transcription
    try {
      await startTranscription(recordingId, tenantId, req.file!.path, durationSeconds);
    } catch (error) {
      console.error('Auto-transcription failed:', error);
      // Don't fail the upload if transcription fails
    }

    res.json({
      recordingId,
      status: 'completed',
      fileSize: req.file.size,
      duration: durationSeconds
    });
  } catch (error: any) {
    console.error('Upload recording error:', error);
    res.status(500).json({ error: 'Failed to upload recording' });
  }
});

/**
 * GET /api/ambient/recordings
 * List recordings for the current tenant
 */
router.get('/recordings', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { encounterId, patientId, status, limit = 50 } = req.query;

    let query = `
      SELECT
        r.id,
        r.encounter_id as "encounterId",
        r.patient_id as "patientId",
        r.provider_id as "providerId",
        r.recording_status as "status",
        r.duration_seconds as "durationSeconds",
        r.consent_obtained as "consentObtained",
        r.consent_method as "consentMethod",
        r.started_at as "startedAt",
        r.completed_at as "completedAt",
        r.created_at as "createdAt",
        p.first_name || ' ' || p.last_name as "patientName",
        pr.full_name as "providerName"
      FROM ambient_recordings r
      JOIN patients p ON p.id = r.patient_id
      JOIN providers pr ON pr.id = r.provider_id
      WHERE r.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (encounterId) {
      query += ` AND r.encounter_id = $${paramIndex++}`;
      params.push(encounterId);
    }

    if (patientId) {
      query += ` AND r.patient_id = $${paramIndex++}`;
      params.push(patientId);
    }

    if (status) {
      query += ` AND r.recording_status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex}`;
    params.push(Number(limit));

    const result = await pool.query(query, params);

    res.json({ recordings: result.rows });
  } catch (error: any) {
    console.error('List recordings error:', error);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

/**
 * GET /api/ambient/recordings/:id
 * Get recording details
 */
router.get('/recordings/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        r.id,
        r.encounter_id as "encounterId",
        r.patient_id as "patientId",
        r.provider_id as "providerId",
        r.recording_status as "status",
        r.duration_seconds as "durationSeconds",
        r.consent_obtained as "consentObtained",
        r.consent_method as "consentMethod",
        r.started_at as "startedAt",
        r.completed_at as "completedAt",
        r.created_at as "createdAt",
        p.first_name || ' ' || p.last_name as "patientName",
        pr.full_name as "providerName"
      FROM ambient_recordings r
      JOIN patients p ON p.id = r.patient_id
      JOIN providers pr ON pr.id = r.provider_id
      WHERE r.id = $1 AND r.tenant_id = $2`,
      [recordingId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json({ recording: result.rows[0] });
  } catch (error: any) {
    console.error('Get recording error:', error);
    res.status(500).json({ error: 'Failed to get recording' });
  }
});

// ============================================================================
// TRANSCRIPTION ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/recordings/:id/transcribe
 * Manually trigger transcription for a recording
 */
router.post('/recordings/:id/transcribe', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id!;
    const tenantId = req.user!.tenantId;

    const recording = await pool.query(
      'SELECT file_path, duration_seconds FROM ambient_recordings WHERE id = $1 AND tenant_id = $2',
      [recordingId, tenantId]
    );

    if (recording.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const { file_path, duration_seconds } = recording.rows[0];

    if (!file_path) {
      return res.status(400).json({ error: 'No audio file uploaded yet' });
    }

    const transcriptId = await startTranscription(recordingId, tenantId, file_path!, duration_seconds!);

    res.json({
      transcriptId,
      status: 'processing',
      message: 'Transcription started'
    });
  } catch (error: any) {
    console.error('Transcribe error:', error);
    res.status(500).json({ error: 'Failed to start transcription' });
  }
});

/**
 * GET /api/ambient/transcripts/:id
 * Get transcript details
 */
router.get('/transcripts/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const transcriptId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        id,
        recording_id as "recordingId",
        encounter_id as "encounterId",
        transcript_text as "transcriptText",
        transcript_segments as "transcriptSegments",
        language,
        speakers,
        speaker_count as "speakerCount",
        confidence_score as "confidenceScore",
        word_count as "wordCount",
        phi_masked as "phiMasked",
        transcription_status as "transcriptionStatus",
        created_at as "createdAt",
        completed_at as "completedAt"
      FROM ambient_transcripts
      WHERE id = $1 AND tenant_id = $2`,
      [transcriptId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    res.json({ transcript: result.rows[0] });
  } catch (error: any) {
    console.error('Get transcript error:', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

/**
 * GET /api/ambient/recordings/:id/transcript
 * Get transcript for a recording
 */
router.get('/recordings/:id/transcript', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        id,
        recording_id as "recordingId",
        encounter_id as "encounterId",
        transcript_text as "transcriptText",
        transcript_segments as "transcriptSegments",
        language,
        speakers,
        speaker_count as "speakerCount",
        confidence_score as "confidenceScore",
        word_count as "wordCount",
        phi_masked as "phiMasked",
        transcription_status as "transcriptionStatus",
        created_at as "createdAt",
        completed_at as "completedAt"
      FROM ambient_transcripts
      WHERE recording_id = $1 AND tenant_id = $2`,
      [recordingId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    res.json({ transcript: result.rows[0] });
  } catch (error: any) {
    console.error('Get recording transcript error:', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

// ============================================================================
// GENERATED NOTES ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/transcripts/:id/generate-note
 * Generate clinical note from transcript
 */
router.post('/transcripts/:id/generate-note', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const transcriptId = req.params.id!;
    const tenantId = req.user!.tenantId;

    const transcript = await pool.query(
      `SELECT transcript_text, transcript_segments, encounter_id, recording_id
       FROM ambient_transcripts WHERE id = $1 AND tenant_id = $2`,
      [transcriptId, tenantId]
    );

    if (transcript.rowCount === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const { transcript_text, transcript_segments, encounter_id, recording_id } = transcript.rows[0];

    if (!transcript_text) {
      return res.status(400).json({ error: 'Transcript not completed yet' });
    }

    const noteId = await generateNote(tenantId, transcriptId, encounter_id, transcript_text!, transcript_segments);

    res.json({
      noteId,
      status: 'processing',
      message: 'Note generation started'
    });
  } catch (error: any) {
    console.error('Generate note error:', error);
    res.status(500).json({ error: 'Failed to generate note' });
  }
});

/**
 * GET /api/ambient/notes/:id
 * Get generated note details
 */
router.get('/notes/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        n.id,
        n.transcript_id as "transcriptId",
        n.encounter_id as "encounterId",
        n.chief_complaint as "chiefComplaint",
        n.hpi,
        n.ros,
        n.physical_exam as "physicalExam",
        n.assessment,
        n.plan,
        n.suggested_icd10_codes as "suggestedIcd10Codes",
        n.suggested_cpt_codes as "suggestedCptCodes",
        n.mentioned_medications as "mentionedMedications",
        n.mentioned_allergies as "mentionedAllergies",
        n.follow_up_tasks as "followUpTasks",
        n.differential_diagnoses as "differentialDiagnoses",
        n.recommended_tests as "recommendedTests",
        n.overall_confidence as "overallConfidence",
        n.section_confidence as "sectionConfidence",
        n.review_status as "reviewStatus",
        n.generation_status as "generationStatus",
        n.reviewed_by as "reviewedBy",
        n.reviewed_at as "reviewedAt",
        n.created_at as "createdAt",
        n.completed_at as "completedAt",
        t.transcript_text as "transcriptText",
        r.patient_id as "patientId",
        r.provider_id as "providerId"
      FROM ambient_generated_notes n
      JOIN ambient_transcripts t ON t.id = n.transcript_id
      JOIN ambient_recordings r ON r.id = t.recording_id
      WHERE n.id = $1 AND n.tenant_id = $2`,
      [noteId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Generated note not found' });
    }

    res.json({ note: result.rows[0] });
  } catch (error: any) {
    console.error('Get note error:', error);
    res.status(500).json({ error: 'Failed to get note' });
  }
});

/**
 * GET /api/ambient/encounters/:encounterId/notes
 * Get all generated notes for an encounter
 */
router.get('/encounters/:encounterId/notes', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const encounterId = req.params.encounterId;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        n.id,
        n.transcript_id as "transcriptId",
        n.encounter_id as "encounterId",
        n.chief_complaint as "chiefComplaint",
        n.hpi,
        n.ros,
        n.physical_exam as "physicalExam",
        n.assessment,
        n.plan,
        n.suggested_icd10_codes as "suggestedIcd10Codes",
        n.suggested_cpt_codes as "suggestedCptCodes",
        n.mentioned_medications as "mentionedMedications",
        n.mentioned_allergies as "mentionedAllergies",
        n.follow_up_tasks as "followUpTasks",
        n.differential_diagnoses as "differentialDiagnoses",
        n.recommended_tests as "recommendedTests",
        n.overall_confidence as "overallConfidence",
        n.section_confidence as "sectionConfidence",
        n.review_status as "reviewStatus",
        n.generation_status as "generationStatus",
        n.reviewed_by as "reviewedBy",
        n.reviewed_at as "reviewedAt",
        n.created_at as "createdAt",
        n.completed_at as "completedAt",
        t.created_at as "transcriptCreatedAt"
      FROM ambient_generated_notes n
      JOIN ambient_transcripts t ON t.id = n.transcript_id
      WHERE n.encounter_id = $1 AND n.tenant_id = $2
      ORDER BY n.created_at DESC`,
      [encounterId, tenantId]
    );

    res.json({ notes: result.rows });
  } catch (error: any) {
    console.error('Get encounter notes error:', error);
    res.status(500).json({ error: 'Failed to get encounter notes' });
  }
});

/**
 * PATCH /api/ambient/notes/:id
 * Update a generated note (creates audit trail)
 */
router.patch('/notes/:id', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id!;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const updates = parsed.data;

    // Get current note values for audit trail
    const current = await pool.query(
      'SELECT * FROM ambient_generated_notes WHERE id = $1 AND tenant_id = $2',
      [noteId, tenantId]
    );

    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const currentNote = current.rows[0];

    // Update note
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== 'editReason') {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
        updateFields.push(`${dbKey} = $${paramIndex++}`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(noteId, tenantId);

    await pool.query(
      `UPDATE ambient_generated_notes SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}`,
      updateValues
    );

    // Create audit trail entries for each changed field
    for (const [key, newValue] of Object.entries(updates)) {
      if (newValue !== undefined && key !== 'editReason') {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        const oldValue = currentNote[dbKey];

        if (oldValue !== newValue) {
          await pool.query(
            `INSERT INTO ambient_note_edits (
              id, tenant_id, generated_note_id, edited_by, section,
              previous_value, new_value, change_type, edit_reason, is_significant
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              crypto.randomUUID(),
              tenantId,
              noteId,
              userId,
              dbKey,
              oldValue,
              newValue,
              'update',
              updates.editReason || null,
              true
            ]
          );
        }
      }
    }

    await auditLog(tenantId, userId || null, 'ambient_note_edit', 'ambient_note', noteId);

    res.json({ success: true, message: 'Note updated successfully' });
  } catch (error: any) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

/**
 * POST /api/ambient/notes/:id/review
 * Submit review decision (approve/reject)
 */
router.post('/notes/:id/review', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id!;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = reviewActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { action, reason } = parsed.data;

    let newStatus: string;
    switch (action) {
      case 'approve':
        newStatus = 'approved';
        break;
      case 'reject':
        newStatus = 'rejected';
        break;
      case 'request_regeneration':
        newStatus = 'regenerating';
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    await pool.query(
      `UPDATE ambient_generated_notes
       SET review_status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [newStatus, userId, noteId, tenantId]
    );

    // Create audit entry
    await pool.query(
      `INSERT INTO ambient_note_edits (
        id, tenant_id, generated_note_id, edited_by, section,
        previous_value, new_value, change_type, edit_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [crypto.randomUUID(), tenantId, noteId, userId, 'review_status', 'pending', newStatus, action, reason || null]
    );

    await auditLog(tenantId, userId || null, `ambient_note_${action}`, 'ambient_note', noteId);

    res.json({
      success: true,
      status: newStatus,
      message: `Note ${action}d successfully`
    });
  } catch (error: any) {
    console.error('Review note error:', error);
    res.status(500).json({ error: 'Failed to review note' });
  }
});

/**
 * POST /api/ambient/notes/:id/apply-to-encounter
 * Apply approved note to encounter
 */
router.post('/notes/:id/apply-to-encounter', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const note = await pool.query(
      `SELECT * FROM ambient_generated_notes WHERE id = $1 AND tenant_id = $2`,
      [noteId, tenantId]
    );

    if (note.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const noteData = note.rows[0];

    if (noteData.review_status !== 'approved') {
      return res.status(400).json({ error: 'Note must be approved before applying to encounter' });
    }

    if (!noteData.encounter_id) {
      return res.status(400).json({ error: 'No encounter associated with this note' });
    }

    // Update encounter with note content
    await pool.query(
      `UPDATE encounters
       SET chief_complaint = COALESCE($1, chief_complaint),
           hpi = COALESCE($2, hpi),
           ros = COALESCE($3, ros),
           exam = COALESCE($4, exam),
           assessment_plan = COALESCE($5, assessment_plan),
           updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7`,
      [
        noteData.chief_complaint,
        noteData.hpi,
        noteData.ros,
        noteData.physical_exam,
        noteData.assessment + '\n\n' + noteData.plan,
        noteData.encounter_id,
        tenantId
      ]
    );

    await auditLog(tenantId, userId || null, 'ambient_note_applied', 'encounter', noteData.encounter_id!);

    res.json({
      success: true,
      encounterId: noteData.encounter_id,
      message: 'Note applied to encounter successfully'
    });
  } catch (error: any) {
    console.error('Apply note error:', error);
    res.status(500).json({ error: 'Failed to apply note to encounter' });
  }
});

/**
 * GET /api/ambient/notes/:id/edits
 * Get edit history for a note
 */
router.get('/notes/:id/edits', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        e.id,
        e.generated_note_id as "generatedNoteId",
        e.edited_by as "editedBy",
        u.full_name as "editorName",
        e.section,
        e.previous_value as "previousValue",
        e.new_value as "newValue",
        e.change_type as "changeType",
        e.edit_reason as "editReason",
        e.is_significant as "isSignificant",
        e.created_at as "createdAt"
      FROM ambient_note_edits e
      JOIN users u ON u.id = e.edited_by
      WHERE e.generated_note_id = $1 AND e.tenant_id = $2
      ORDER BY e.created_at DESC`,
      [noteId, tenantId]
    );

    res.json({ edits: result.rows });
  } catch (error: any) {
    console.error('Get edits error:', error);
    res.status(500).json({ error: 'Failed to get edit history' });
  }
});

/**
 * DELETE /api/ambient/recordings/:id
 * Delete a recording and associated data
 */
router.delete('/recordings/:id', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id!;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Get file path for deletion
    const recording = await pool.query(
      'SELECT file_path FROM ambient_recordings WHERE id = $1 AND tenant_id = $2',
      [recordingId, tenantId]
    );

    if (recording.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const filePath = recording.rows[0].file_path;

    // Delete from database (cascades to transcripts and notes)
    await pool.query('DELETE FROM ambient_recordings WHERE id = $1 AND tenant_id = $2', [recordingId, tenantId]);

    // Delete file
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error('Failed to delete audio file:', error);
        // Don't fail the request if file deletion fails
      }
    }

    await auditLog(tenantId, userId || null, 'ambient_recording_delete', 'ambient_recording', recordingId);

    res.json({ success: true, message: 'Recording deleted successfully' });
  } catch (error: any) {
    console.error('Delete recording error:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Start transcription process for a recording
 */
async function startTranscription(
  recordingId: string,
  tenantId: string,
  filePath: string,
  durationSeconds: number
): Promise<string> {
  const transcriptId = crypto.randomUUID();

  // Create transcript record
  await pool.query(
    `INSERT INTO ambient_transcripts (
      id, tenant_id, recording_id, transcription_status, started_at
    ) VALUES ($1, $2, $3, $4, NOW())`,
    [transcriptId, tenantId, recordingId, 'processing']
  );

  // Get encounter_id from recording
  const recording = await pool.query(
    'SELECT encounter_id FROM ambient_recordings WHERE id = $1',
    [recordingId]
  );
  const encounterId = recording.rows[0]?.encounter_id;

  // Process transcription asynchronously
  processTranscription(transcriptId, tenantId, recordingId, encounterId, filePath, durationSeconds).catch(error => {
    console.error('Transcription processing error:', error);
  });

  return transcriptId;
}

/**
 * Process transcription (async)
 */
async function processTranscription(
  transcriptId: string,
  tenantId: string,
  recordingId: string,
  encounterId: string | null,
  filePath: string,
  durationSeconds: number
): Promise<void> {
  try {
    // Call mock AI service
    const result: TranscriptionResult = await transcribeAudio(filePath, durationSeconds);

    // Mask PHI
    const maskedText = maskPHI(result.text, result.phiEntities);

    // Update transcript
    await pool.query(
      `UPDATE ambient_transcripts
       SET transcript_text = $1,
           transcript_segments = $2,
           language = $3,
           speakers = $4,
           speaker_count = $5,
           confidence_score = $6,
           word_count = $7,
           original_text = $8,
           phi_entities = $9,
           phi_masked = $10,
           transcription_status = $11,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $12 AND tenant_id = $13`,
      [
        maskedText,
        JSON.stringify(result.segments),
        result.language,
        JSON.stringify(result.speakers),
        result.speakerCount,
        result.confidence,
        result.wordCount,
        result.text,
        JSON.stringify(result.phiEntities),
        result.phiEntities.length > 0,
        'completed',
        transcriptId,
        tenantId
      ]
    );

    // Auto-generate note if enabled
    const settings = await pool.query(
      'SELECT auto_generate_notes FROM ambient_scribe_settings WHERE tenant_id = $1 AND provider_id IS NULL',
      [tenantId]
    );

    if (settings.rows[0]?.auto_generate_notes) {
      await generateNote(tenantId, transcriptId, encounterId, maskedText, result.segments);
    }
  } catch (error: any) {
    console.error('Transcription error:', error);
    await pool.query(
      `UPDATE ambient_transcripts
       SET transcription_status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      ['failed', error.message, transcriptId, tenantId]
    );
  }
}

/**
 * Generate clinical note from transcript
 */
async function generateNote(
  tenantId: string,
  transcriptId: string,
  encounterId: string | null,
  transcriptText: string,
  segments: any
): Promise<string> {
  const noteId = crypto.randomUUID();
  const transcriptMeta = await pool.query(
    'SELECT recording_id, encounter_id FROM ambient_transcripts WHERE id = $1 AND tenant_id = $2',
    [transcriptId, tenantId]
  );
  const recordingId = transcriptMeta.rows[0]?.recording_id || null;
  const effectiveEncounterId = encounterId || transcriptMeta.rows[0]?.encounter_id || null;

  // Create note record
  await pool.query(
    `INSERT INTO ambient_generated_notes (
      id, tenant_id, transcript_id, recording_id, encounter_id, generation_status, started_at, note_content
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
    [noteId, tenantId, transcriptId, recordingId, effectiveEncounterId, 'processing', JSON.stringify({})]
  );

  // Process note generation asynchronously
  processNoteGeneration(noteId, tenantId, transcriptText, segments).catch(error => {
    console.error('Note generation error:', error);
  });

  return noteId;
}

/**
 * Process note generation (async)
 */
async function processNoteGeneration(
  noteId: string,
  tenantId: string,
  transcriptText: string,
  segments: any
): Promise<void> {
  try {
    // Call mock AI service
    const result = await generateClinicalNote(transcriptText, segments);

    // Update note
    await pool.query(
      `UPDATE ambient_generated_notes
       SET chief_complaint = $1,
           hpi = $2,
           ros = $3,
           physical_exam = $4,
           assessment = $5,
           plan = $6,
           suggested_icd10_codes = $7,
           suggested_cpt_codes = $8,
           mentioned_medications = $9,
           mentioned_allergies = $10,
           follow_up_tasks = $11,
           overall_confidence = $12,
           section_confidence = $13,
           differential_diagnoses = $14,
           recommended_tests = $15,
           generation_status = $16,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $17 AND tenant_id = $18`,
      [
        result.chiefComplaint,
        result.hpi,
        result.ros,
        result.physicalExam,
        result.assessment,
        result.plan,
        JSON.stringify(result.suggestedIcd10),
        JSON.stringify(result.suggestedCpt),
        JSON.stringify(result.medications),
        JSON.stringify(result.allergies),
        JSON.stringify(result.followUpTasks),
        result.overallConfidence,
        JSON.stringify(result.sectionConfidence),
        JSON.stringify(result.differentialDiagnoses || []),
        JSON.stringify(result.recommendedTests || []),
        'completed',
        noteId,
        tenantId
      ]
    );
  } catch (error: any) {
    console.error('Note generation error:', error);
    await pool.query(
      `UPDATE ambient_generated_notes
       SET generation_status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      ['failed', error.message, noteId, tenantId]
    );
  }
}

// ============================================================================
// PATIENT SUMMARY ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/notes/:noteId/generate-patient-summary
 * Generate and save a patient-friendly summary from an approved note
 */
router.post('/notes/:noteId/generate-patient-summary', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.noteId;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Get the note with patient and provider info
    const noteResult = await pool.query(
      `SELECT
        n.*,
        r.patient_id,
        r.provider_id,
        p.first_name || ' ' || p.last_name as patient_name,
        pr.full_name as provider_name,
        e.encounter_date
      FROM ambient_generated_notes n
      JOIN ambient_transcripts t ON t.id = n.transcript_id
      JOIN ambient_recordings r ON r.id = t.recording_id
      JOIN patients p ON p.id = r.patient_id
      JOIN providers pr ON pr.id = r.provider_id
      LEFT JOIN encounters e ON e.id = n.encounter_id
      WHERE n.id = $1 AND n.tenant_id = $2`,
      [noteId, tenantId]
    );

    if (noteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const note = noteResult.rows[0];

    // Check if note is approved
    if (note.review_status !== 'approved') {
      return res.status(400).json({ error: 'Note must be approved before generating patient summary' });
    }

    // Avoid duplicate summaries for the same ambient note
    const existingSummary = await pool.query(
      `SELECT id FROM visit_summaries WHERE ambient_note_id = $1 AND tenant_id = $2`,
      [noteId, tenantId]
    );

    if (existingSummary.rowCount && existingSummary.rowCount > 0) {
      return res.json({
        summaryId: existingSummary.rows[0].id,
        message: 'Patient summary already exists',
        existing: true
      });
    }

    // Generate patient-friendly summary
    const visitDate = note.encounter_date || new Date();

    // Extract symptoms from HPI
    const symptomsDiscussed: string[] = [];
    if (note.hpi) {
      const hpiLower = note.hpi.toLowerCase();
      if (hpiLower.includes('rash')) symptomsDiscussed.push('Rash');
      if (hpiLower.includes('itch') || hpiLower.includes('pruritus')) symptomsDiscussed.push('Itching');
      if (hpiLower.includes('pain')) symptomsDiscussed.push('Pain');
      if (hpiLower.includes('swell')) symptomsDiscussed.push('Swelling');
      if (hpiLower.includes('red') || hpiLower.includes('erythema')) symptomsDiscussed.push('Redness');
    }

    // Extract diagnosis from assessment
    let diagnosisShared = '';
    if (note.assessment) {
      // Take first line or first diagnosis
      const firstLine = note.assessment.split('\n')[0];
      diagnosisShared = firstLine.replace(/^\d+\.\s*/, '').split('-')[0].trim();
    }

    // Generate patient-friendly summary text
    const summaryText = generatePatientFriendlySummary(note);

    // Extract treatment plan
    let treatmentPlan = '';
    if (note.plan) {
      const planLines = note.plan.split('\n').filter((line: string) => line.trim());
      treatmentPlan = planLines.slice(0, 5).join('\n'); // Take first few lines
    }

    // Extract next steps and follow-up
    let nextSteps = '';
    let followUpDate = null;
    if (note.follow_up_tasks && Array.isArray(note.follow_up_tasks)) {
      const tasks = note.follow_up_tasks.map((t: any) => t.task).join('\n');
      nextSteps = tasks;

      // Extract follow-up date if available
      const followUpTask = note.follow_up_tasks.find((t: any) => t.dueDate);
      if (followUpTask) {
        followUpDate = followUpTask.dueDate;
      }
    }

    // Create visit summary record
    const summaryId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO visit_summaries (
        id, tenant_id, patient_id, encounter_id, ambient_note_id,
        visit_date, provider_name, summary_text, symptoms_discussed,
        diagnosis_shared, treatment_plan, next_steps, follow_up_date,
        generated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        summaryId,
        tenantId,
        note.patient_id,
        note.encounter_id || null,
        noteId,
        visitDate,
        note.provider_name,
        summaryText,
        symptomsDiscussed,
        diagnosisShared,
        treatmentPlan,
        nextSteps,
        followUpDate,
        userId
      ]
    );

    await auditLog(tenantId, userId || null, 'patient_summary_generated', 'visit_summary', summaryId);

    res.status(201).json({
      summaryId,
      message: 'Patient summary generated successfully'
    });
  } catch (error: any) {
    console.error('Generate patient summary error:', error);
    res.status(500).json({ error: 'Failed to generate patient summary' });
  }
});

/**
 * GET /api/ambient/patient-summaries/:patientId
 * Get all summaries for a patient (provider view)
 */
router.get('/patient-summaries/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const patientId = req.params.patientId;
    const tenantId = req.user!.tenantId;

    // Verify patient exists and belongs to tenant
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );

    if (patientCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await pool.query(
      `SELECT
        vs.id,
        vs.encounter_id as "encounterId",
        vs.ambient_note_id as "ambientNoteId",
        vs.visit_date as "visitDate",
        vs.provider_name as "providerName",
        vs.summary_text as "summaryText",
        vs.symptoms_discussed as "symptomsDiscussed",
        vs.diagnosis_shared as "diagnosisShared",
        vs.treatment_plan as "treatmentPlan",
        vs.next_steps as "nextSteps",
        vs.follow_up_date as "followUpDate",
        vs.shared_at as "sharedAt",
        vs.created_at as "createdAt",
        u.name as "generatedByName"
      FROM visit_summaries vs
      LEFT JOIN users u ON u.id = vs.generated_by
      WHERE vs.patient_id = $1 AND vs.tenant_id = $2
      ORDER BY vs.visit_date DESC`,
      [patientId, tenantId]
    );

    res.json({ summaries: result.rows });
  } catch (error: any) {
    console.error('Get patient summaries error:', error);
    res.status(500).json({ error: 'Failed to get patient summaries' });
  }
});

/**
 * POST /api/ambient/patient-summaries/:summaryId/share
 * Share a summary with the patient (sets shared_at timestamp)
 */
router.post('/patient-summaries/:summaryId/share', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const summaryId = req.params.summaryId;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const result = await pool.query(
      `UPDATE visit_summaries
       SET shared_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [summaryId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    await auditLog(tenantId, userId || '', 'patient_summary_shared', 'visit_summary', summaryId || '');

    res.json({ success: true, message: 'Summary shared with patient' });
  } catch (error: any) {
    console.error('Share patient summary error:', error);
    res.status(500).json({ error: 'Failed to share patient summary' });
  }
});

/**
 * Helper function to generate patient-friendly summary
 */
function generatePatientFriendlySummary(note: any): string {
  const sections: string[] = [];

  // Introduction
  sections.push('Visit Summary');
  sections.push('');

  // What was discussed
  if (note.chief_complaint) {
    sections.push('What We Discussed:');
    sections.push(simplifyMedicalText(note.chief_complaint));
    sections.push('');
  }

  // What we found
  if (note.physical_exam) {
    sections.push('What We Found:');
    sections.push(simplifyMedicalText(note.physical_exam));
    sections.push('');
  }

  // What it means
  if (note.assessment) {
    sections.push('What It Means:');
    sections.push(simplifyMedicalText(note.assessment));
    sections.push('');
  }

  // What to do
  if (note.plan) {
    sections.push('What To Do:');
    sections.push(simplifyMedicalText(note.plan));
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Helper function to simplify medical terminology for patients
 */
function simplifyMedicalText(text: string): string {
  // Remove medical jargon and simplify
  let simplified = text
    .replace(/\berythematous\b/gi, 'red')
    .replace(/\bpruritic\b/gi, 'itchy')
    .replace(/\bbilateral\b/gi, 'both sides')
    .replace(/\bvesicular\b/gi, 'blistered')
    .replace(/\bpapular\b/gi, 'bumpy')
    .replace(/\bmacular\b/gi, 'flat')
    .replace(/\bhpi\b/gi, 'history')
    .replace(/\bBID\b/g, 'twice daily')
    .replace(/\bTID\b/g, 'three times daily')
    .replace(/\bQHS\b/g, 'at bedtime')
    .replace(/\bPO\b/g, 'by mouth');

  return simplified;
}

export default router;
