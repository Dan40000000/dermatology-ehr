import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const usageSchema = z.object({
  itemId: z.string().uuid(),
  encounterId: z.string().optional(),
  appointmentId: z.string().optional(),
  patientId: z.string(),
  providerId: z.string(),
  quantityUsed: z.number().int().min(1),
  notes: z.string().optional(),
});

const batchUsageSchema = z.object({
  encounterId: z.string().optional(),
  appointmentId: z.string().optional(),
  patientId: z.string(),
  providerId: z.string(),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantityUsed: z.number().int().min(1),
      notes: z.string().optional(),
    })
  ),
});

export const inventoryUsageRouter = Router();

// Record inventory usage
inventoryUsageRouter.post("/", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = usageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // Get current unit cost from inventory item
  const itemResult = await pool.query(
    `SELECT unit_cost_cents, quantity FROM inventory_items WHERE id = $1 AND tenant_id = $2`,
    [payload.itemId, tenantId]
  );

  if (!itemResult.rowCount) {
    return res.status(404).json({ error: "Item not found" });
  }

  const item = itemResult.rows[0];

  // Check if we have enough quantity
  if (item.quantity < payload.quantityUsed) {
    return res.status(400).json({
      error: `Insufficient inventory: only ${item.quantity} units available`,
    });
  }

  const unitCostCents = item.unit_cost_cents;

  try {
    // Insert usage record (trigger will automatically decrease inventory)
    const result = await pool.query(
      `INSERT INTO inventory_usage(
        tenant_id, item_id, encounter_id, appointment_id, patient_id, provider_id,
        quantity_used, unit_cost_cents, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        tenantId,
        payload.itemId,
        payload.encounterId || null,
        payload.appointmentId || null,
        payload.patientId,
        payload.providerId,
        payload.quantityUsed,
        unitCostCents,
        payload.notes || null,
        req.user!.id,
      ]
    );

    const usageId = result.rows[0].id;

    await auditLog(tenantId, req.user!.id, "inventory_usage_record", "inventory_usage", usageId);

    res.status(201).json({ id: usageId });
  } catch (error: any) {
    // Handle database errors (e.g., insufficient inventory from trigger)
    if (error.message?.includes("Insufficient inventory")) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
});

// Record batch inventory usage (multiple items at once)
inventoryUsageRouter.post("/batch", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = batchUsageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const usageIds: string[] = [];

    for (const item of payload.items) {
      // Get current unit cost from inventory item
      const itemResult = await client.query(
        `SELECT unit_cost_cents, quantity FROM inventory_items WHERE id = $1 AND tenant_id = $2`,
        [item.itemId, tenantId]
      );

      if (!itemResult.rowCount) {
        throw new Error(`Item ${item.itemId} not found`);
      }

      const inventoryItem = itemResult.rows[0];

      // Check if we have enough quantity
      if (inventoryItem.quantity < item.quantityUsed) {
        throw new Error(
          `Insufficient inventory for item ${item.itemId}: only ${inventoryItem.quantity} units available`
        );
      }

      const unitCostCents = inventoryItem.unit_cost_cents;

      // Insert usage record
      const result = await client.query(
        `INSERT INTO inventory_usage(
          tenant_id, item_id, encounter_id, appointment_id, patient_id, provider_id,
          quantity_used, unit_cost_cents, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          tenantId,
          item.itemId,
          payload.encounterId || null,
          payload.appointmentId || null,
          payload.patientId,
          payload.providerId,
          item.quantityUsed,
          unitCostCents,
          item.notes || null,
          req.user!.id,
        ]
      );

      usageIds.push(result.rows[0].id);
    }

    await client.query("COMMIT");

    await auditLog(tenantId, req.user!.id, "inventory_usage_batch_record", "inventory_usage", "batch");

    res.status(201).json({ ids: usageIds, count: usageIds.length });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error.message?.includes("Insufficient inventory") || error.message?.includes("not found")) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  } finally {
    client.release();
  }
});

// Get usage history (with filters)
inventoryUsageRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, encounterId, appointmentId, providerId, itemId, limit = "50" } = req.query;

  let query = `
    SELECT
      u.id,
      u.item_id as "itemId",
      u.quantity_used as "quantityUsed",
      u.unit_cost_cents as "unitCostCents",
      u.notes,
      u.used_at as "usedAt",
      u.encounter_id as "encounterId",
      u.appointment_id as "appointmentId",
      u.patient_id as "patientId",
      u.provider_id as "providerId",
      i.name as "itemName",
      i.category as "itemCategory",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      pr.full_name as "providerName"
    FROM inventory_usage u
    LEFT JOIN inventory_items i ON u.item_id = i.id
    LEFT JOIN patients p ON u.patient_id = p.id
    LEFT JOIN users pr ON u.provider_id = pr.id
    WHERE u.tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (patientId && typeof patientId === "string") {
    params.push(patientId);
    query += ` AND u.patient_id = $${params.length}`;
  }

  if (encounterId && typeof encounterId === "string") {
    params.push(encounterId);
    query += ` AND u.encounter_id = $${params.length}`;
  }

  if (appointmentId && typeof appointmentId === "string") {
    params.push(appointmentId);
    query += ` AND u.appointment_id = $${params.length}`;
  }

  if (providerId && typeof providerId === "string") {
    params.push(providerId);
    query += ` AND u.provider_id = $${params.length}`;
  }

  if (itemId && typeof itemId === "string") {
    params.push(itemId);
    query += ` AND u.item_id = $${params.length}`;
  }

  params.push(parseInt(limit as string));
  query += ` ORDER BY u.used_at DESC LIMIT $${params.length}`;

  const result = await pool.query(query, params);

  res.json({ usage: result.rows });
});

// Get usage for specific encounter
inventoryUsageRouter.get("/encounter/:encounterId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { encounterId } = req.params;

  const result = await pool.query(
    `SELECT
      u.id,
      u.item_id as "itemId",
      u.quantity_used as "quantityUsed",
      u.unit_cost_cents as "unitCostCents",
      u.notes,
      u.used_at as "usedAt",
      i.name as "itemName",
      i.category as "itemCategory",
      i.sku
    FROM inventory_usage u
    LEFT JOIN inventory_items i ON u.item_id = i.id
    WHERE u.encounter_id = $1 AND u.tenant_id = $2
    ORDER BY u.used_at DESC`,
    [encounterId, tenantId]
  );

  res.json({ usage: result.rows });
});

// Get usage statistics for a patient
inventoryUsageRouter.get("/patient/:patientId/stats", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId } = req.params;

  const result = await pool.query(
    `SELECT
      i.id as "itemId",
      i.name as "itemName",
      i.category,
      COUNT(u.id) as "usageCount",
      SUM(u.quantity_used) as "totalQuantityUsed",
      SUM(u.quantity_used * u.unit_cost_cents) as "totalCostCents",
      MAX(u.used_at) as "lastUsedAt"
    FROM inventory_usage u
    JOIN inventory_items i ON u.item_id = i.id
    WHERE u.patient_id = $1 AND u.tenant_id = $2
    GROUP BY i.id, i.name, i.category
    ORDER BY "usageCount" DESC`,
    [patientId, tenantId]
  );

  res.json({ stats: result.rows });
});

// Get usage statistics by category
inventoryUsageRouter.get("/stats/by-category", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  let query = `
    SELECT
      i.category,
      COUNT(u.id) as "usageCount",
      SUM(u.quantity_used) as "totalQuantityUsed",
      SUM(u.quantity_used * u.unit_cost_cents) as "totalCostCents"
    FROM inventory_usage u
    JOIN inventory_items i ON u.item_id = i.id
    WHERE u.tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (startDate && typeof startDate === "string") {
    params.push(startDate);
    query += ` AND u.used_at >= $${params.length}`;
  }

  if (endDate && typeof endDate === "string") {
    params.push(endDate);
    query += ` AND u.used_at <= $${params.length}`;
  }

  query += ` GROUP BY i.category ORDER BY "totalCostCents" DESC`;

  const result = await pool.query(query, params);

  res.json({ stats: result.rows });
});

// Get top used items
inventoryUsageRouter.get("/stats/top-items", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { limit = "10", startDate, endDate } = req.query;

  let query = `
    SELECT
      i.id as "itemId",
      i.name as "itemName",
      i.category,
      COUNT(u.id) as "usageCount",
      SUM(u.quantity_used) as "totalQuantityUsed",
      SUM(u.quantity_used * u.unit_cost_cents) as "totalCostCents"
    FROM inventory_usage u
    JOIN inventory_items i ON u.item_id = i.id
    WHERE u.tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (startDate && typeof startDate === "string") {
    params.push(startDate);
    query += ` AND u.used_at >= $${params.length}`;
  }

  if (endDate && typeof endDate === "string") {
    params.push(endDate);
    query += ` AND u.used_at <= $${params.length}`;
  }

  query += ` GROUP BY i.id, i.name, i.category ORDER BY "usageCount" DESC`;

  params.push(parseInt(limit as string));
  query += ` LIMIT $${params.length}`;

  const result = await pool.query(query, params);

  res.json({ items: result.rows });
});

// Delete usage record (admin only, for corrections)
inventoryUsageRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  // Get usage details before deletion for rollback
  const usageResult = await pool.query(
    `SELECT item_id, quantity_used FROM inventory_usage WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (!usageResult.rowCount) {
    return res.status(404).json({ error: "Usage record not found" });
  }

  const usage = usageResult.rows[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete usage record
    await client.query(`DELETE FROM inventory_usage WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);

    // Add back the quantity to inventory
    await client.query(
      `UPDATE inventory_items SET quantity = quantity + $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [usage.quantity_used, usage.item_id, tenantId]
    );

    await client.query("COMMIT");

    await auditLog(tenantId, req.user!.id, "inventory_usage_delete", "inventory_usage", id!);

    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
