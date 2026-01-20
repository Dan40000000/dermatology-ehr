import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { parsePagination, paginatedResponse } from "../middleware/pagination";
import { logger } from "../lib/logger";
import crypto from "crypto";

const protocolSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(['medical', 'procedure', 'cosmetic', 'administrative']),
  type: z.string().min(1).max(100),
  description: z.string().optional(),
  indication: z.string().optional(),
  contraindications: z.string().optional(),
  version: z.string().default('1.0'),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
});

const protocolStepSchema = z.object({
  step_number: z.number().int().positive(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  action_type: z.enum(['assessment', 'treatment', 'medication', 'procedure', 'lab_order', 'imaging', 'referral', 'patient_instruction', 'decision_point', 'observation']),
  medication_name: z.string().optional(),
  medication_dosage: z.string().optional(),
  medication_frequency: z.string().optional(),
  medication_duration: z.string().optional(),
  procedure_code: z.string().optional(),
  procedure_instructions: z.string().optional(),
  order_codes: z.array(z.string()).optional(),
  decision_criteria: z.string().optional(),
  next_step_id: z.string().optional(),
  conditional_next_steps: z.any().optional(), // JSONB
  timing: z.string().optional(),
  duration_days: z.number().int().optional(),
  monitoring_required: z.string().optional(),
  side_effects: z.string().optional(),
  warnings: z.string().optional(),
});

const protocolApplicationSchema = z.object({
  protocol_id: z.string(),
  patient_id: z.string(),
  encounter_id: z.string().optional(),
  notes: z.string().optional(),
});

export const protocolsRouter = Router();

// Get all protocols
protocolsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { tenantId } = req.user!;
    const { category, status, type, search } = req.query;

    let query = `
      select p.*,
        u.full_name as created_by_name,
        (select count(*) from protocol_steps where protocol_id = p.id) as step_count,
        (select count(*) from protocol_applications where protocol_id = p.id and status = 'active') as active_applications
      from protocols p
      left join users u on p.created_by = u.id
      where p.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` and p.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (status) {
      query += ` and p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` and p.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (search) {
      query += ` and (p.name ilike $${paramIndex} or p.description ilike $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` order by p.created_at desc`;

    // Get total count
    const countResult = await pool.query(
      `select count(*) from (${query}) as count_query`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    query += ` limit $${paramIndex} offset $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json(
      paginatedResponse(result.rows, total, page, limit)
    );
  } catch (error) {
    logger.error("Error fetching protocols:", error);
    res.status(500).json({ error: "Failed to fetch protocols" });
  }
});

// Get protocol by ID with full details
protocolsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    // Get protocol
    const protocolResult = await pool.query(
      `select p.*,
        u.full_name as created_by_name
      from protocols p
      left join users u on p.created_by = u.id
      where p.id = $1 and p.tenant_id = $2`,
      [id, tenantId]
    );

    if (protocolResult.rows.length === 0) {
      return res.status(404).json({ error: "Protocol not found" });
    }

    const protocol = protocolResult.rows[0];

    // Get steps
    const stepsResult = await pool.query(
      `select * from protocol_steps
      where protocol_id = $1 and tenant_id = $2
      order by step_number`,
      [id, tenantId]
    );

    // Get order sets
    const orderSetsResult = await pool.query(
      `select * from protocol_order_sets
      where protocol_id = $1 and tenant_id = $2`,
      [id, tenantId]
    );

    // Get handouts
    const handoutsResult = await pool.query(
      `select * from protocol_handouts
      where protocol_id = $1 and tenant_id = $2`,
      [id, tenantId]
    );

    res.json({
      ...protocol,
      steps: stepsResult.rows,
      order_sets: orderSetsResult.rows,
      handouts: handoutsResult.rows,
    });
  } catch (error) {
    logger.error("Error fetching protocol details:", error);
    res.status(500).json({ error: "Failed to fetch protocol details" });
  }
});

// Create protocol
protocolsRouter.post(
  "/",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const validated = protocolSchema.parse(req.body);

      const id = crypto.randomBytes(16).toString("hex");

      const result = await pool.query(
        `insert into protocols (
          id, tenant_id, name, category, type, description, indication,
          contraindications, version, status, created_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning *`,
        [
          id,
          tenantId,
          validated.name,
          validated.category,
          validated.type,
          validated.description,
          validated.indication,
          validated.contraindications,
          validated.version,
          validated.status,
          userId,
        ]
      );

      logger.info(`Protocol created: ${id}`, { tenantId, userId });
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      logger.error("Error creating protocol:", error);
      res.status(500).json({ error: "Failed to create protocol" });
    }
  }
);

// Update protocol
protocolsRouter.put(
  "/:id",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const { tenantId } = req.user!;
      const { id } = req.params;
      const validated = protocolSchema.partial().parse(req.body);

      const setClauses: string[] = [];
      const values: any[] = [id, tenantId];
      let paramIndex = 3;

      Object.entries(validated).forEach(([key, value]) => {
        if (value !== undefined) {
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      setClauses.push(`updated_at = now()`);

      const result = await pool.query(
        `update protocols set ${setClauses.join(", ")}
        where id = $1 and tenant_id = $2
        returning *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Protocol not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      logger.error("Error updating protocol:", error);
      res.status(500).json({ error: "Failed to update protocol" });
    }
  }
);

// Delete protocol
protocolsRouter.delete(
  "/:id",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { tenantId } = req.user!;
      const { id } = req.params;

      const result = await pool.query(
        `delete from protocols where id = $1 and tenant_id = $2 returning id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Protocol not found" });
      }

      res.json({ message: "Protocol deleted successfully" });
    } catch (error) {
      logger.error("Error deleting protocol:", error);
      res.status(500).json({ error: "Failed to delete protocol" });
    }
  }
);

// ==================== PROTOCOL STEPS ====================

// Add step to protocol
protocolsRouter.post(
  "/:protocolId/steps",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const { tenantId } = req.user!;
      const { protocolId } = req.params;
      const validated = protocolStepSchema.parse(req.body);

      const id = crypto.randomBytes(16).toString("hex");

      const result = await pool.query(
        `insert into protocol_steps (
          id, tenant_id, protocol_id, step_number, title, description,
          action_type, medication_name, medication_dosage, medication_frequency,
          medication_duration, procedure_code, procedure_instructions, order_codes,
          decision_criteria, next_step_id, conditional_next_steps, timing,
          duration_days, monitoring_required, side_effects, warnings
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        returning *`,
        [
          id,
          tenantId,
          protocolId,
          validated.step_number,
          validated.title,
          validated.description,
          validated.action_type,
          validated.medication_name,
          validated.medication_dosage,
          validated.medication_frequency,
          validated.medication_duration,
          validated.procedure_code,
          validated.procedure_instructions,
          validated.order_codes,
          validated.decision_criteria,
          validated.next_step_id,
          validated.conditional_next_steps ? JSON.stringify(validated.conditional_next_steps) : null,
          validated.timing,
          validated.duration_days,
          validated.monitoring_required,
          validated.side_effects,
          validated.warnings,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      logger.error("Error adding protocol step:", error);
      res.status(500).json({ error: "Failed to add protocol step" });
    }
  }
);

// Update protocol step
protocolsRouter.put(
  "/:protocolId/steps/:stepId",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const { tenantId } = req.user!;
      const { stepId } = req.params;
      const validated = protocolStepSchema.partial().parse(req.body);

      const setClauses: string[] = [];
      const values: any[] = [stepId, tenantId];
      let paramIndex = 3;

      Object.entries(validated).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'conditional_next_steps' && typeof value === 'object') {
            setClauses.push(`${key} = $${paramIndex}`);
            values.push(JSON.stringify(value));
          } else {
            setClauses.push(`${key} = $${paramIndex}`);
            values.push(value);
          }
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const result = await pool.query(
        `update protocol_steps set ${setClauses.join(", ")}
        where id = $1 and tenant_id = $2
        returning *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Protocol step not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      logger.error("Error updating protocol step:", error);
      res.status(500).json({ error: "Failed to update protocol step" });
    }
  }
);

// Delete protocol step
protocolsRouter.delete(
  "/:protocolId/steps/:stepId",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const { tenantId } = req.user!;
      const { stepId } = req.params;

      const result = await pool.query(
        `delete from protocol_steps where id = $1 and tenant_id = $2 returning id`,
        [stepId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Protocol step not found" });
      }

      res.json({ message: "Protocol step deleted successfully" });
    } catch (error) {
      logger.error("Error deleting protocol step:", error);
      res.status(500).json({ error: "Failed to delete protocol step" });
    }
  }
);

// ==================== PROTOCOL APPLICATIONS ====================

// Apply protocol to patient
protocolsRouter.post(
  "/applications",
  requireAuth,
  requireRoles(["admin", "provider", "nurse"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const validated = protocolApplicationSchema.parse(req.body);

      const id = crypto.randomBytes(16).toString("hex");

      // Get first step of protocol
      const firstStepResult = await pool.query(
        `select id from protocol_steps
        where protocol_id = $1 and tenant_id = $2
        order by step_number
        limit 1`,
        [validated.protocol_id, tenantId]
      );

      const current_step_id = firstStepResult.rows[0]?.id || null;

      const result = await pool.query(
        `insert into protocol_applications (
          id, tenant_id, protocol_id, patient_id, encounter_id,
          applied_by, current_step_id, status, notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning *`,
        [
          id,
          tenantId,
          validated.protocol_id,
          validated.patient_id,
          validated.encounter_id,
          userId,
          current_step_id,
          'active',
          validated.notes,
        ]
      );

      logger.info(`Protocol applied to patient: ${validated.patient_id}`, {
        tenantId,
        protocolId: validated.protocol_id,
        applicationId: id,
      });

      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      logger.error("Error applying protocol:", error);
      res.status(500).json({ error: "Failed to apply protocol" });
    }
  }
);

// Get protocol applications for patient
protocolsRouter.get(
  "/applications/patient/:patientId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { tenantId } = req.user!;
      const { patientId } = req.params;

      const result = await pool.query(
        `select pa.*,
          p.name as protocol_name,
          p.category as protocol_category,
          u.full_name as applied_by_name,
          ps.title as current_step_title,
          (select count(*) from protocol_step_completions where application_id = pa.id) as completed_steps,
          (select count(*) from protocol_steps where protocol_id = pa.protocol_id) as total_steps
        from protocol_applications pa
        join protocols p on pa.protocol_id = p.id
        join users u on pa.applied_by = u.id
        left join protocol_steps ps on pa.current_step_id = ps.id
        where pa.patient_id = $1 and pa.tenant_id = $2
        order by pa.started_at desc`,
        [patientId, tenantId]
      );

      res.json({ data: result.rows });
    } catch (error) {
      logger.error("Error fetching patient protocol applications:", error);
      res.status(500).json({ error: "Failed to fetch protocol applications" });
    }
  }
);

// Complete protocol step
protocolsRouter.post(
  "/applications/:applicationId/complete-step",
  requireAuth,
  requireRoles(["admin", "provider", "nurse"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { applicationId } = req.params;
      const { step_id, outcome, outcome_notes, orders_generated } = req.body;

      const id = crypto.randomBytes(16).toString("hex");

      // Record step completion
      await pool.query(
        `insert into protocol_step_completions (
          id, tenant_id, application_id, step_id, completed_by,
          outcome, outcome_notes, orders_generated
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          tenantId,
          applicationId,
          step_id,
          userId,
          outcome || 'completed',
          outcome_notes,
          orders_generated,
        ]
      );

      // Get next step
      const nextStepResult = await pool.query(
        `select next_step_id from protocol_steps where id = $1`,
        [step_id]
      );

      const next_step_id = nextStepResult.rows[0]?.next_step_id;

      // Update application current step
      if (next_step_id) {
        await pool.query(
          `update protocol_applications
          set current_step_id = $1
          where id = $2 and tenant_id = $3`,
          [next_step_id, applicationId, tenantId]
        );
      } else {
        // No more steps - mark as completed
        await pool.query(
          `update protocol_applications
          set status = 'completed', completed_at = now()
          where id = $1 and tenant_id = $2`,
          [applicationId, tenantId]
        );
      }

      res.json({ message: "Step completed successfully", next_step_id });
    } catch (error) {
      logger.error("Error completing protocol step:", error);
      res.status(500).json({ error: "Failed to complete protocol step" });
    }
  }
);

// Update protocol application status
protocolsRouter.patch(
  "/applications/:applicationId",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const { tenantId } = req.user!;
      const { applicationId } = req.params;
      const { status, discontinuation_reason, notes } = req.body;

      const setClauses: string[] = [];
      const values: any[] = [applicationId, tenantId];
      let paramIndex = 3;

      if (status) {
        setClauses.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;

        if (status === 'completed') {
          setClauses.push(`completed_at = now()`);
        }
      }

      if (discontinuation_reason) {
        setClauses.push(`discontinuation_reason = $${paramIndex}`);
        values.push(discontinuation_reason);
        paramIndex++;
      }

      if (notes !== undefined) {
        setClauses.push(`notes = $${paramIndex}`);
        values.push(notes);
        paramIndex++;
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const result = await pool.query(
        `update protocol_applications set ${setClauses.join(", ")}
        where id = $1 and tenant_id = $2
        returning *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Protocol application not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error("Error updating protocol application:", error);
      res.status(500).json({ error: "Failed to update protocol application" });
    }
  }
);

// Get protocol statistics
protocolsRouter.get("/stats/overview", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;

    const stats = await pool.query(
      `select
        count(distinct p.id) as total_protocols,
        count(distinct case when p.status = 'active' then p.id end) as active_protocols,
        count(distinct pa.id) as total_applications,
        count(distinct case when pa.status = 'active' then pa.id end) as active_applications,
        count(distinct case when pa.status = 'completed' then pa.id end) as completed_applications
      from protocols p
      left join protocol_applications pa on p.id = pa.protocol_id and pa.tenant_id = p.tenant_id
      where p.tenant_id = $1`,
      [tenantId]
    );

    res.json(stats.rows[0]);
  } catch (error) {
    logger.error("Error fetching protocol statistics:", error);
    res.status(500).json({ error: "Failed to fetch protocol statistics" });
  }
});
