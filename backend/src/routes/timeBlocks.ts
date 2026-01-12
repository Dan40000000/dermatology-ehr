import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import {
  hasSchedulingConflict,
  parseRecurrencePattern,
  expandRecurrence,
  RecurrencePattern,
} from "../services/timeBlockService";

const router = Router();

// Validation schemas
const recurrencePatternSchema = z.object({
  pattern: z.enum(["daily", "weekly", "biweekly", "monthly"]),
  days: z.array(z.number().min(0).max(6)).optional(), // For weekly/biweekly
  dayOfMonth: z.number().min(1).max(31).optional(), // For monthly
  until: z.string().optional(), // ISO date string
});

const createTimeBlockSchema = z.object({
  providerId: z.string().uuid(),
  locationId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255),
  blockType: z.enum(["blocked", "lunch", "meeting", "admin", "continuing_education", "out_of_office"]),
  description: z.string().optional().nullable(),
  startTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid start time" }),
  endTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid end time" }),
  isRecurring: z.boolean().default(false),
  recurrencePattern: recurrencePatternSchema.optional().nullable(),
});

const updateTimeBlockSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  blockType: z.enum(["blocked", "lunch", "meeting", "admin", "continuing_education", "out_of_office"]).optional(),
  description: z.string().optional().nullable(),
  startTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid start time" }).optional(),
  endTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid end time" }).optional(),
  locationId: z.string().uuid().optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurrencePattern: recurrencePatternSchema.optional().nullable(),
  recurrenceEndDate: z.string().optional().nullable(),
  status: z.enum(["active", "cancelled"]).optional(),
});

/**
 * GET /api/time-blocks
 * List time blocks with filters
 * Query params: providerId, locationId, startDate, endDate, status
 */
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { providerId, locationId, startDate, endDate, status, expand } = req.query;

    let query = `
      SELECT tb.id,
             tb.tenant_id as "tenantId",
             tb.provider_id as "providerId",
             tb.location_id as "locationId",
             tb.title,
             tb.block_type as "blockType",
             tb.description,
             tb.start_time as "startTime",
             tb.end_time as "endTime",
             tb.is_recurring as "isRecurring",
             tb.recurrence_pattern as "recurrencePattern",
             tb.recurrence_end_date as "recurrenceEndDate",
             tb.status,
             tb.created_at as "createdAt",
             tb.updated_at as "updatedAt",
             u.full_name as "providerName",
             l.name as "locationName"
      FROM time_blocks tb
      LEFT JOIN users u ON tb.provider_id = u.id
      LEFT JOIN locations l ON tb.location_id = l.id
      WHERE tb.tenant_id = $1
    `;

    const values: any[] = [tenantId];
    let paramCount = 1;

    if (providerId) {
      paramCount++;
      query += ` AND tb.provider_id = $${paramCount}`;
      values.push(providerId);
    }

    if (locationId) {
      paramCount++;
      query += ` AND tb.location_id = $${paramCount}`;
      values.push(locationId);
    }

    if (status) {
      paramCount++;
      query += ` AND tb.status = $${paramCount}`;
      values.push(status);
    } else {
      // Default to active only
      paramCount++;
      query += ` AND tb.status = $${paramCount}`;
      values.push("active");
    }

    if (startDate && endDate) {
      paramCount++;
      query += ` AND tb.start_time >= $${paramCount}`;
      values.push(startDate);
      paramCount++;
      query += ` AND tb.end_time <= $${paramCount}`;
      values.push(endDate);
    }

    query += " ORDER BY tb.start_time ASC";

    const result = await pool.query(query, values);

    // If expand=true, expand recurring blocks into instances
    let timeBlocks = result.rows;
    if (expand === "true" && startDate && endDate) {
      const expandedBlocks: any[] = [];

      for (const block of timeBlocks) {
        if (block.isRecurring && block.recurrencePattern) {
          try {
            const pattern = parseRecurrencePattern(block.recurrencePattern);
            if (pattern) {
              const instances = expandRecurrence(
                new Date(block.startTime),
                new Date(block.endTime),
                pattern,
                365
              );

              // Filter instances to date range and add as separate entries
              const start = new Date(startDate as string);
              const end = new Date(endDate as string);

              instances
                .filter((inst) => inst.startTime >= start && inst.endTime <= end)
                .forEach((inst) => {
                  expandedBlocks.push({
                    ...block,
                    startTime: inst.startTime,
                    endTime: inst.endTime,
                    isInstance: true,
                    parentId: block.id,
                  });
                });
            }
          } catch (err) {
            // If pattern parsing fails, include original block
            expandedBlocks.push(block);
          }
        } else {
          expandedBlocks.push(block);
        }
      }

      timeBlocks = expandedBlocks;
    }

    res.json({ timeBlocks });
  } catch (error) {
    console.error("Error fetching time blocks:", error);
    res.status(500).json({ error: "Failed to fetch time blocks" });
  }
});

/**
 * GET /api/time-blocks/:id
 * Get a single time block by ID
 */
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT tb.id,
              tb.tenant_id as "tenantId",
              tb.provider_id as "providerId",
              tb.location_id as "locationId",
              tb.title,
              tb.block_type as "blockType",
              tb.description,
              tb.start_time as "startTime",
              tb.end_time as "endTime",
              tb.is_recurring as "isRecurring",
              tb.recurrence_pattern as "recurrencePattern",
              tb.recurrence_end_date as "recurrenceEndDate",
              tb.status,
              tb.created_at as "createdAt",
              tb.updated_at as "updatedAt",
              tb.created_by as "createdBy",
              u.full_name as "providerName",
              l.name as "locationName"
       FROM time_blocks tb
       LEFT JOIN users u ON tb.provider_id = u.id
       LEFT JOIN locations l ON tb.location_id = l.id
       WHERE tb.id = $1 AND tb.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Time block not found" });
    }

    res.json({ timeBlock: result.rows[0] });
  } catch (error) {
    console.error("Error fetching time block:", error);
    res.status(500).json({ error: "Failed to fetch time block" });
  }
});

/**
 * POST /api/time-blocks
 * Create a new time block with optional recurrence
 * Checks for conflicts with existing blocks and appointments
 */
router.post("/", requireAuth, requireRoles(["admin", "provider", "front_desk"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = createTimeBlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const data = parsed.data;

    // Validate time range
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    if (endTime <= startTime) {
      return res.status(400).json({ error: "End time must be after start time" });
    }

    // Validate recurrence pattern
    if (data.isRecurring && !data.recurrencePattern) {
      return res.status(400).json({ error: "Recurrence pattern required when isRecurring is true" });
    }

    if (!data.isRecurring && data.recurrencePattern) {
      return res.status(400).json({ error: "Cannot set recurrence pattern when isRecurring is false" });
    }

    // Check for conflicts
    const conflict = await hasSchedulingConflict(
      tenantId,
      data.providerId,
      data.startTime,
      data.endTime
    );

    if (conflict.hasConflict) {
      return res.status(409).json({
        error: `Conflict detected with existing ${conflict.conflictType === "time_block" ? "time block" : "appointment"}`,
        conflictType: conflict.conflictType,
      });
    }

    // Create time block
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO time_blocks (
        id, tenant_id, provider_id, location_id, title, block_type, description,
        start_time, end_time, is_recurring, recurrence_pattern, recurrence_end_date,
        status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        id,
        tenantId,
        data.providerId,
        data.locationId || null,
        data.title,
        data.blockType,
        data.description || null,
        data.startTime,
        data.endTime,
        data.isRecurring,
        data.recurrencePattern ? JSON.stringify(data.recurrencePattern) : null,
        data.recurrencePattern?.until || null,
        "active",
        userId,
      ]
    );

    // Audit log
    await auditLog(tenantId, userId, "time_block_create", "time_block", id);

    res.status(201).json({ timeBlock: result.rows[0], id });
  } catch (error) {
    console.error("Error creating time block:", error);
    res.status(500).json({ error: "Failed to create time block" });
  }
});

/**
 * PATCH /api/time-blocks/:id
 * Update or cancel a time block
 * Checks for conflicts when updating time
 */
router.patch("/:id", requireAuth, requireRoles(["admin", "provider", "front_desk"]), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = updateTimeBlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.format() });
    }

    const data = parsed.data;

    // Get existing time block
    const existing = await pool.query(
      "SELECT * FROM time_blocks WHERE id = $1 AND tenant_id = $2",
      [id, tenantId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Time block not found" });
    }

    const existingBlock = existing.rows[0];

    // Determine final start and end times
    const finalStartTime = data.startTime || existingBlock.start_time;
    const finalEndTime = data.endTime || existingBlock.end_time;

    // Validate time range if either time is being updated
    if (data.startTime || data.endTime) {
      const start = new Date(finalStartTime);
      const end = new Date(finalEndTime);
      if (end <= start) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for conflicts when updating time (only if not cancelling)
      if (data.status !== "cancelled") {
        const conflict = await hasSchedulingConflict(
          tenantId,
          existingBlock.provider_id,
          finalStartTime,
          finalEndTime,
          id // Exclude this block from conflict check
        );

        if (conflict.hasConflict) {
          return res.status(409).json({
            error: `Conflict detected with existing ${conflict.conflictType === "time_block" ? "time block" : "appointment"}`,
            conflictType: conflict.conflictType,
          });
        }
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(data.title);
      paramCount++;
    }

    if (data.blockType !== undefined) {
      updates.push(`block_type = $${paramCount}`);
      values.push(data.blockType);
      paramCount++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(data.description);
      paramCount++;
    }

    if (data.startTime !== undefined) {
      updates.push(`start_time = $${paramCount}`);
      values.push(data.startTime);
      paramCount++;
    }

    if (data.endTime !== undefined) {
      updates.push(`end_time = $${paramCount}`);
      values.push(data.endTime);
      paramCount++;
    }

    if (data.locationId !== undefined) {
      updates.push(`location_id = $${paramCount}`);
      values.push(data.locationId);
      paramCount++;
    }

    if (data.isRecurring !== undefined) {
      updates.push(`is_recurring = $${paramCount}`);
      values.push(data.isRecurring);
      paramCount++;
    }

    if (data.recurrencePattern !== undefined) {
      updates.push(`recurrence_pattern = $${paramCount}`);
      values.push(data.recurrencePattern ? JSON.stringify(data.recurrencePattern) : null);
      paramCount++;
    }

    if (data.recurrenceEndDate !== undefined) {
      updates.push(`recurrence_end_date = $${paramCount}`);
      values.push(data.recurrenceEndDate);
      paramCount++;
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(data.status);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // Always update the updated_at timestamp
    updates.push(`updated_at = NOW()`);

    values.push(id, tenantId);

    const query = `
      UPDATE time_blocks
      SET ${updates.join(", ")}
      WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    // Audit log
    const action = data.status === "cancelled" ? "time_block_cancel" : "time_block_update";
    await auditLog(tenantId, userId, action, "time_block", id!);

    res.json({ timeBlock: result.rows[0] });
  } catch (error) {
    console.error("Error updating time block:", error);
    res.status(500).json({ error: "Failed to update time block" });
  }
});

/**
 * DELETE /api/time-blocks/:id
 * Delete (soft delete by setting status to cancelled) a time block
 */
router.delete("/:id", requireAuth, requireRoles(["admin", "provider", "front_desk"]), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const result = await pool.query(
      `UPDATE time_blocks
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Time block not found" });
    }

    // Audit log
    await auditLog(tenantId, userId, "time_block_delete", "time_block", id!);

    res.json({ message: "Time block deleted successfully", id });
  } catch (error) {
    console.error("Error deleting time block:", error);
    res.status(500).json({ error: "Failed to delete time block" });
  }
});

export default router;
