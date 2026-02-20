import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { userHasRole } from "../lib/roles";
import { logger } from "../lib/logger";

const noteFilterSchema = z.object({
  status: z.enum(["draft", "preliminary", "final", "signed"]).optional(),
  providerId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  patientId: z.string().optional(),
});

const bulkFinalizeSchema = z.object({
  noteIds: z.array(z.string()).min(1),
});

const bulkAssignSchema = z.object({
  noteIds: z.array(z.string()).min(1),
  providerId: z.string(),
});

const addendumSchema = z.object({
  addendum: z.string().min(1),
});

export const notesRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logNotesError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// GET /api/notes - List notes with filters
notesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const parsed = noteFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const filters = parsed.data;
  let query = `
    SELECT
      e.id,
      e.patient_id as "patientId",
      e.provider_id as "providerId",
      e.appointment_id as "appointmentId",
      e.status,
      e.chief_complaint as "chiefComplaint",
      e.hpi,
      e.ros,
      e.exam,
      e.assessment_plan as "assessmentPlan",
      e.visit_code as "visitCode",
      e.signed_at as "signedAt",
      e.signed_by as "signedBy",
      e.created_at as "createdAt",
      e.updated_at as "updatedAt",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      pr.full_name as "providerName",
      pr.id as "providerId"
    FROM encounters e
    LEFT JOIN patients p ON p.id = e.patient_id
    LEFT JOIN providers pr ON pr.id = e.provider_id
    WHERE e.tenant_id = $1
  `;

  const queryParams: any[] = [tenantId];
  let paramCounter = 2;

  if (filters.status) {
    query += ` AND e.status = $${paramCounter}`;
    queryParams.push(filters.status);
    paramCounter++;
  }

  if (filters.providerId) {
    query += ` AND e.provider_id = $${paramCounter}`;
    queryParams.push(filters.providerId);
    paramCounter++;
  }

  if (filters.patientId) {
    query += ` AND e.patient_id = $${paramCounter}`;
    queryParams.push(filters.patientId);
    paramCounter++;
  }

  if (filters.startDate) {
    query += ` AND e.created_at >= $${paramCounter}`;
    queryParams.push(filters.startDate);
    paramCounter++;
  }

  if (filters.endDate) {
    query += ` AND e.created_at <= $${paramCounter}`;
    queryParams.push(filters.endDate);
    paramCounter++;
  }

  query += ` ORDER BY e.created_at DESC LIMIT 100`;

  const result = await pool.query(query, queryParams);
  res.json({ notes: result.rows });
});

// POST /api/notes/bulk/finalize - Finalize multiple notes at once
notesRouter.post(
  "/bulk/finalize",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = bulkFinalizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { noteIds } = parsed.data;

    try {
      // Validate all notes belong to tenant and are not signed
      const checkResult = await pool.query(
        `SELECT id, status FROM encounters WHERE id = ANY($1) AND tenant_id = $2`,
        [noteIds, tenantId]
      );

      if (checkResult.rowCount !== noteIds.length) {
        return res.status(404).json({ error: "One or more notes not found" });
      }

      const signedNotes = checkResult.rows.filter((n) => n.status === "signed");
      if (signedNotes.length > 0) {
        return res.status(409).json({
          error: "Cannot finalize signed notes",
          signedNotes: signedNotes.map((n) => n.id),
        });
      }

      // Bulk update to final status
      await pool.query(
        `UPDATE encounters
         SET status = 'final', updated_at = now()
         WHERE id = ANY($1) AND tenant_id = $2`,
        [noteIds, tenantId]
      );

      // Audit log for each note
      for (const noteId of noteIds) {
        await auditLog(tenantId, req.user!.id, "note_bulk_finalize", "encounter", noteId);
      }

      res.json({
        success: true,
        finalizedCount: noteIds.length,
        message: `${noteIds.length} notes finalized successfully`
      });
    } catch (error: any) {
      logNotesError("Bulk finalize error:", error);
      res.status(500).json({ error: "Failed to finalize notes" });
    }
  }
);

// POST /api/notes/bulk/assign - Assign multiple notes to provider
notesRouter.post(
  "/bulk/assign",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = bulkAssignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { noteIds, providerId } = parsed.data;

    try {
      // Validate provider exists
      const providerCheck = await pool.query(
        `SELECT id FROM providers WHERE id = $1 AND tenant_id = $2`,
        [providerId, tenantId]
      );

      if (!providerCheck.rowCount) {
        return res.status(404).json({ error: "Provider not found" });
      }

      // Validate all notes belong to tenant and are not signed
      const checkResult = await pool.query(
        `SELECT id, status FROM encounters WHERE id = ANY($1) AND tenant_id = $2`,
        [noteIds, tenantId]
      );

      if (checkResult.rowCount !== noteIds.length) {
        return res.status(404).json({ error: "One or more notes not found" });
      }

      const signedNotes = checkResult.rows.filter((n) => n.status === "signed");
      if (signedNotes.length > 0) {
        return res.status(409).json({
          error: "Cannot reassign signed notes",
          signedNotes: signedNotes.map((n) => n.id),
        });
      }

      // Bulk update provider assignment
      await pool.query(
        `UPDATE encounters
         SET provider_id = $1, updated_at = now()
         WHERE id = ANY($2) AND tenant_id = $3`,
        [providerId, noteIds, tenantId]
      );

      // Audit log for each note
      for (const noteId of noteIds) {
        await auditLog(tenantId, req.user!.id, "note_bulk_assign", "encounter", noteId);
      }

      res.json({
        success: true,
        assignedCount: noteIds.length,
        message: `${noteIds.length} notes assigned to provider successfully`
      });
    } catch (error: any) {
      logNotesError("Bulk assign error:", error);
      res.status(500).json({ error: "Failed to assign notes" });
    }
  }
);

// PATCH /api/notes/:id/sign - Sign and lock note
notesRouter.patch(
  "/:id/sign",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const noteId = String(req.params.id);

    try {
      // Check note exists and is not already signed
      const noteCheck = await pool.query(
        `SELECT id, status, provider_id FROM encounters WHERE id = $1 AND tenant_id = $2`,
        [noteId, tenantId]
      );

      if (!noteCheck.rowCount) {
        return res.status(404).json({ error: "Note not found" });
      }

      const note = noteCheck.rows[0];
      if (note.status === "signed") {
        return res.status(409).json({ error: "Note is already signed" });
      }

      // Only allow provider to sign their own notes or admin to sign any
      if (!userHasRole(req.user, "admin") && note.provider_id !== req.user!.id) {
        return res.status(403).json({ error: "You can only sign your own notes" });
      }

      // Sign and lock the note
      await pool.query(
        `UPDATE encounters
         SET status = 'signed',
             signed_at = now(),
             signed_by = $1,
             updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [req.user!.id, noteId, tenantId]
      );

      await auditLog(tenantId, req.user!.id, "note_sign", "encounter", noteId);

      res.json({
        success: true,
        message: "Note signed and locked successfully",
        signedAt: new Date().toISOString(),
        signedBy: req.user!.id
      });
    } catch (error: any) {
      logNotesError("Sign note error:", error);
      res.status(500).json({ error: "Failed to sign note" });
    }
  }
);

// PATCH /api/notes/:id/addendum - Add addendum to signed note
notesRouter.patch(
  "/:id/addendum",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = addendumSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const noteId = String(req.params.id);
    const { addendum } = parsed.data;

    try {
      // Check note exists and is signed
      const noteCheck = await pool.query(
        `SELECT id, status, assessment_plan, provider_id FROM encounters WHERE id = $1 AND tenant_id = $2`,
        [noteId, tenantId]
      );

      if (!noteCheck.rowCount) {
        return res.status(404).json({ error: "Note not found" });
      }

      const note = noteCheck.rows[0];
      if (note.status !== "signed") {
        return res.status(409).json({ error: "Only signed notes can have addendums" });
      }

      // Only allow provider to add addendum to their own notes or admin to add to any
      if (!userHasRole(req.user, "admin") && note.provider_id !== req.user!.id) {
        return res.status(403).json({ error: "You can only add addendums to your own notes" });
      }

      // Create addendum entry in a new table
      const addendumId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      // Store addendum in separate table for audit trail
      await pool.query(
        `INSERT INTO note_addendums (id, tenant_id, encounter_id, addendum_text, added_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [addendumId, tenantId, noteId, addendum, req.user!.id, timestamp]
      );

      // Update the note with addendum marker
      const addendumNote = `\n\n--- ADDENDUM (${timestamp}) by ${req.user!.fullName || req.user!.id} ---\n${addendum}`;
      const updatedAssessmentPlan = (note.assessment_plan || "") + addendumNote;

      await pool.query(
        `UPDATE encounters
         SET assessment_plan = $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [updatedAssessmentPlan, noteId, tenantId]
      );

      await auditLog(tenantId, req.user!.id, "note_addendum", "encounter", noteId);

      res.json({
        success: true,
        message: "Addendum added successfully",
        addendumId,
        addedAt: timestamp
      });
    } catch (error: any) {
      logNotesError("Add addendum error:", error);

      // If table doesn't exist, create it
      if (error.code === '42P01') {
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS note_addendums (
              id TEXT PRIMARY KEY,
              tenant_id TEXT NOT NULL,
              encounter_id TEXT NOT NULL,
              addendum_text TEXT NOT NULL,
              added_by TEXT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT now()
            )
          `);

          // Retry the operation
          const addendumId = crypto.randomUUID();
          const timestamp = new Date().toISOString();

          await pool.query(
            `INSERT INTO note_addendums (id, tenant_id, encounter_id, addendum_text, added_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [addendumId, tenantId, noteId, addendum, req.user!.id, timestamp]
          );

          const addendumNote = `\n\n--- ADDENDUM (${timestamp}) by ${req.user!.fullName || req.user!.id} ---\n${addendum}`;
          const noteCheck = await pool.query(
            `SELECT assessment_plan FROM encounters WHERE id = $1 AND tenant_id = $2`,
            [noteId, tenantId]
          );
          const updatedAssessmentPlan = (noteCheck.rows[0].assessment_plan || "") + addendumNote;

          await pool.query(
            `UPDATE encounters
             SET assessment_plan = $1, updated_at = now()
             WHERE id = $2 AND tenant_id = $3`,
            [updatedAssessmentPlan, noteId, tenantId]
          );

          await auditLog(tenantId, req.user!.id, "note_addendum", "encounter", noteId);

          return res.json({
            success: true,
            message: "Addendum added successfully (table created)",
            addendumId,
            addedAt: timestamp
          });
        } catch (retryError: any) {
          logNotesError("Retry addendum error:", retryError);
          return res.status(500).json({ error: "Failed to add addendum after retry" });
        }
      }

      res.status(500).json({ error: "Failed to add addendum" });
    }
  }
);

// GET /api/notes/:id/addendums - Get all addendums for a note
notesRouter.get("/:id/addendums", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const noteId = String(req.params.id);

  try {
    const result = await pool.query(
      `SELECT
        a.id,
        a.addendum_text as "addendumText",
        a.added_by as "addedBy",
        a.created_at as "createdAt",
        pr.full_name as "addedByName"
       FROM note_addendums a
       LEFT JOIN providers pr ON pr.id = a.added_by
       WHERE a.encounter_id = $1 AND a.tenant_id = $2
       ORDER BY a.created_at DESC`,
      [noteId, tenantId]
    );

    res.json({ addendums: result.rows });
  } catch (error: any) {
    // If table doesn't exist yet, return empty array
    if (error.code === '42P01') {
      return res.json({ addendums: [] });
    }
    logNotesError("Get addendums error:", error);
    res.status(500).json({ error: "Failed to fetch addendums" });
  }
});
