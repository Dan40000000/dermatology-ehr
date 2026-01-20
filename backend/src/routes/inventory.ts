import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const inventoryItemSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(["medication", "supply", "cosmetic", "equipment"]),
  sku: z.string().max(100).optional(),
  description: z.string().optional(),
  quantity: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(0),
  unitCostCents: z.number().int().min(0).default(0),
  supplier: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  expirationDate: z.string().optional(), // ISO date string
  lotNumber: z.string().max(100).optional(),
});

const updateInventoryItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.enum(["medication", "supply", "cosmetic", "equipment"]).optional(),
  sku: z.string().max(100).optional(),
  description: z.string().optional(),
  reorderLevel: z.number().int().min(0).optional(),
  unitCostCents: z.number().int().min(0).optional(),
  supplier: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  expirationDate: z.string().optional(), // ISO date string
  lotNumber: z.string().max(100).optional(),
});

const adjustmentSchema = z.object({
  itemId: z.string().uuid(),
  adjustmentQuantity: z.number().int(),
  reason: z.enum(["received", "expired", "damaged", "adjustment", "correction"]),
  notes: z.string().optional(),
});

export const inventoryRouter = Router();

// Get all inventory items
inventoryRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { category, lowStock } = req.query;

  let query = `
    SELECT
      id, name, category, sku, description, quantity, reorder_level as "reorderLevel",
      unit_cost_cents as "unitCostCents", supplier, location, expiration_date as "expirationDate",
      lot_number as "lotNumber", created_at as "createdAt", updated_at as "updatedAt"
    FROM inventory_items
    WHERE tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (category && typeof category === "string") {
    params.push(category);
    query += ` AND category = $${params.length}`;
  }

  if (lowStock === "true") {
    query += ` AND quantity <= reorder_level`;
  }

  query += ` ORDER BY name ASC`;

  const result = await pool.query(query, params);
  res.json({ items: result.rows });
});

// Get all usage records (with filters)
inventoryRouter.get("/usage", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, appointmentId, encounterId, limit = "100" } = req.query;

  let query = `
    SELECT
      u.id,
      u.quantity_used as "quantityUsed",
      u.unit_cost_cents as "unitCostCents",
      u.notes,
      u.used_at as "usedAt",
      u.encounter_id as "encounterId",
      u.appointment_id as "appointmentId",
      u.patient_id as "patientId",
      u.provider_id as "providerId",
      i.id as "itemId",
      i.name as "itemName",
      i.category as "itemCategory",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      pr.full_name as "providerName"
    FROM inventory_usage u
    JOIN inventory_items i ON u.item_id = i.id
    LEFT JOIN patients p ON u.patient_id = p.id
    LEFT JOIN users pr ON u.provider_id = pr.id
    WHERE u.tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (patientId && typeof patientId === "string") {
    params.push(patientId);
    query += ` AND u.patient_id = $${params.length}`;
  }

  if (appointmentId && typeof appointmentId === "string") {
    params.push(appointmentId);
    query += ` AND u.appointment_id = $${params.length}`;
  }

  if (encounterId && typeof encounterId === "string") {
    params.push(encounterId);
    query += ` AND u.encounter_id = $${params.length}`;
  }

  params.push(parseInt(limit as string));
  query += ` ORDER BY u.used_at DESC LIMIT $${params.length}`;

  const result = await pool.query(query, params);
  res.json({ usage: result.rows });
});

// Get single inventory item with usage stats
inventoryRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const result = await pool.query(
    `SELECT
      id, name, category, sku, description, quantity, reorder_level as "reorderLevel",
      unit_cost_cents as "unitCostCents", supplier, location, expiration_date as "expirationDate",
      lot_number as "lotNumber", created_at as "createdAt", updated_at as "updatedAt"
    FROM inventory_items
    WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Item not found" });
  }

  res.json({ item: result.rows[0] });
});

// Create inventory item
inventoryRouter.post("/", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = inventoryItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  const result = await pool.query(
    `INSERT INTO inventory_items(
      tenant_id, name, category, sku, description, quantity, reorder_level,
      unit_cost_cents, supplier, location, expiration_date, lot_number, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id`,
    [
      tenantId,
      payload.name,
      payload.category,
      payload.sku || null,
      payload.description || null,
      payload.quantity,
      payload.reorderLevel,
      payload.unitCostCents,
      payload.supplier || null,
      payload.location || null,
      payload.expirationDate || null,
      payload.lotNumber || null,
      req.user!.id,
    ]
  );

  const itemId = result.rows[0].id;
  await auditLog(tenantId, req.user!.id, "inventory_item_create", "inventory_item", itemId);

  res.status(201).json({ id: itemId });
});

// Update inventory item
inventoryRouter.put("/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = updateInventoryItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const payload = parsed.data;

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (payload.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(payload.name);
  }
  if (payload.category !== undefined) {
    updates.push(`category = $${paramCount++}`);
    values.push(payload.category);
  }
  if (payload.sku !== undefined) {
    updates.push(`sku = $${paramCount++}`);
    values.push(payload.sku);
  }
  if (payload.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(payload.description);
  }
  if (payload.reorderLevel !== undefined) {
    updates.push(`reorder_level = $${paramCount++}`);
    values.push(payload.reorderLevel);
  }
  if (payload.unitCostCents !== undefined) {
    updates.push(`unit_cost_cents = $${paramCount++}`);
    values.push(payload.unitCostCents);
  }
  if (payload.supplier !== undefined) {
    updates.push(`supplier = $${paramCount++}`);
    values.push(payload.supplier);
  }
  if (payload.location !== undefined) {
    updates.push(`location = $${paramCount++}`);
    values.push(payload.location);
  }
  if (payload.expirationDate !== undefined) {
    updates.push(`expiration_date = $${paramCount++}`);
    values.push(payload.expirationDate);
  }
  if (payload.lotNumber !== undefined) {
    updates.push(`lot_number = $${paramCount++}`);
    values.push(payload.lotNumber);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  await pool.query(
    `UPDATE inventory_items SET ${updates.join(", ")} WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}`,
    values
  );

  await auditLog(tenantId, req.user!.id, "inventory_item_update", "inventory_item", id!);

  res.json({ success: true });
});

// Delete inventory item
inventoryRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  // Check if item has any usage records
  const usageCheck = await pool.query(
    `SELECT COUNT(*) as count FROM inventory_usage WHERE item_id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (parseInt(usageCheck.rows[0].count) > 0) {
    return res.status(409).json({
      error: "Cannot delete inventory item with usage history. Consider marking as inactive instead.",
    });
  }

  await pool.query(`DELETE FROM inventory_items WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);

  await auditLog(tenantId, req.user!.id, "inventory_item_delete", "inventory_item", id!);

  res.json({ success: true });
});

// Manual adjustment
inventoryRouter.post("/adjust", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // Verify item exists and belongs to tenant
  const itemCheck = await pool.query(
    `SELECT id, name FROM inventory_items WHERE id = $1 AND tenant_id = $2`,
    [payload.itemId, tenantId]
  );

  if (!itemCheck.rowCount) {
    return res.status(404).json({ error: "Item not found" });
  }

  // Insert adjustment (trigger will update quantity)
  const result = await pool.query(
    `INSERT INTO inventory_adjustments(tenant_id, item_id, adjustment_quantity, reason, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [tenantId, payload.itemId, payload.adjustmentQuantity, payload.reason, payload.notes || null, req.user!.id]
  );

  await auditLog(tenantId, req.user!.id, "inventory_adjustment", "inventory_item", payload.itemId);

  res.status(201).json({ id: result.rows[0].id });
});

// Get adjustment history for an item
inventoryRouter.get("/:id/adjustments", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const result = await pool.query(
    `SELECT
      id, adjustment_quantity as "adjustmentQuantity", reason, notes,
      created_at as "createdAt", created_by as "createdBy"
    FROM inventory_adjustments
    WHERE item_id = $1 AND tenant_id = $2
    ORDER BY created_at DESC
    LIMIT 100`,
    [id, tenantId]
  );

  res.json({ adjustments: result.rows });
});

// Get low stock items
inventoryRouter.get("/alerts/low-stock", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT * FROM get_low_stock_items($1)`,
    [tenantId]
  );

  res.json({ items: result.rows });
});

// Get expiring items
inventoryRouter.get("/alerts/expiring", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { days } = req.query;
  const daysThreshold = days && typeof days === "string" ? parseInt(days) : 90;

  const result = await pool.query(
    `SELECT * FROM get_expiring_items($1, $2)`,
    [tenantId, daysThreshold]
  );

  res.json({ items: result.rows });
});

// Get usage history for an item
inventoryRouter.get("/:id/usage", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { limit = "50" } = req.query;

  const result = await pool.query(
    `SELECT
      u.id,
      u.quantity_used as "quantityUsed",
      u.unit_cost_cents as "unitCostCents",
      u.notes,
      u.used_at as "usedAt",
      u.encounter_id as "encounterId",
      u.appointment_id as "appointmentId",
      u.patient_id as "patientId",
      u.provider_id as "providerId",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      pr.full_name as "providerName"
    FROM inventory_usage u
    LEFT JOIN patients p ON u.patient_id = p.id
    LEFT JOIN users pr ON u.provider_id = pr.id
    WHERE u.item_id = $1 AND u.tenant_id = $2
    ORDER BY u.used_at DESC
    LIMIT $3`,
    [id, tenantId, parseInt(limit as string)]
  );

  res.json({ usage: result.rows });
});

// Get inventory stats
inventoryRouter.get("/stats/summary", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const [totalItems, totalValue, lowStock, expiring] = await Promise.all([
    pool.query(`SELECT COUNT(*) as count FROM inventory_items WHERE tenant_id = $1`, [tenantId]),
    pool.query(
      `SELECT SUM(quantity * unit_cost_cents) as total FROM inventory_items WHERE tenant_id = $1`,
      [tenantId]
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM inventory_items WHERE tenant_id = $1 AND quantity <= reorder_level`,
      [tenantId]
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM inventory_items
       WHERE tenant_id = $1 AND expiration_date IS NOT NULL
         AND expiration_date <= CURRENT_DATE + INTERVAL '90 days'`,
      [tenantId]
    ),
  ]);

  res.json({
    totalItems: parseInt(totalItems.rows[0].count),
    totalValueCents: parseInt(totalValue.rows[0].total || "0"),
    lowStockCount: parseInt(lowStock.rows[0].count),
    expiringCount: parseInt(expiring.rows[0].count),
  });
});

// ==================== PROCEDURE TEMPLATES ====================

// Get all procedure templates
inventoryRouter.get("/procedure-templates", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { category } = req.query;

  let query = `
    SELECT
      id,
      procedure_name as "procedureName",
      procedure_code as "procedureCode",
      category,
      description,
      is_active as "isActive",
      created_at as "createdAt"
    FROM procedure_inventory_templates
    WHERE tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (category && typeof category === "string") {
    params.push(category);
    query += ` AND category = $${params.length}`;
  }

  query += ` ORDER BY category, procedure_name`;

  const result = await pool.query(query, params);
  res.json({ templates: result.rows });
});

// Get items for a specific procedure template
inventoryRouter.get("/procedure-templates/:procedureName/items", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { procedureName } = req.params;

  const result = await pool.query(
    `SELECT * FROM get_procedure_inventory_items($1, $2)`,
    [tenantId, procedureName]
  );

  res.json({ items: result.rows });
});

// Record procedure-based inventory usage (batch)
const procedureUsageSchema = z.object({
  procedureName: z.string(),
  patientId: z.string(),
  providerId: z.string(),
  encounterId: z.string().optional(),
  appointmentId: z.string().optional(),
  notes: z.string().optional(),
  customItems: z.array(z.object({
    itemId: z.string().uuid(),
    quantityUsed: z.number().int().min(1),
  })).optional(),
});

inventoryRouter.post(
  "/procedure-usage",
  requireAuth,
  requireRoles(["admin", "provider", "ma"]),
  async (req: AuthedRequest, res) => {
    const parsed = procedureUsageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const tenantId = req.user!.tenantId;
    const payload = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get procedure template items
      const templateItems = await client.query(
        `SELECT * FROM get_procedure_inventory_items($1, $2)`,
        [tenantId, payload.procedureName]
      );

      const usageIds: string[] = [];
      const itemsUsed: any[] = [];

      // Use template items or custom items
      const itemsToUse = payload.customItems || templateItems.rows.map(row => ({
        itemId: row.item_id,
        quantityUsed: row.default_quantity,
      }));

      for (const item of itemsToUse) {
        // Get current item info
        const itemResult = await client.query(
          `SELECT id, name, quantity, unit_cost_cents FROM inventory_items WHERE id = $1 AND tenant_id = $2`,
          [item.itemId, tenantId]
        );

        if (!itemResult.rowCount) {
          throw new Error(`Inventory item ${item.itemId} not found`);
        }

        const inventoryItem = itemResult.rows[0];

        // Check if we have enough quantity
        if (inventoryItem.quantity < item.quantityUsed) {
          throw new Error(
            `Insufficient inventory for ${inventoryItem.name}: only ${inventoryItem.quantity} units available`
          );
        }

        // Insert usage record (trigger will automatically decrease inventory)
        const result = await client.query(
          `INSERT INTO inventory_usage(
            tenant_id, item_id, quantity_used, unit_cost_cents,
            patient_id, provider_id, encounter_id, appointment_id, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id, used_at`,
          [
            tenantId,
            item.itemId,
            item.quantityUsed,
            inventoryItem.unit_cost_cents,
            payload.patientId,
            payload.providerId,
            payload.encounterId || null,
            payload.appointmentId || null,
            payload.notes || `Used in procedure: ${payload.procedureName}`,
            req.user!.id,
          ]
        );

        usageIds.push(result.rows[0].id);
        itemsUsed.push({
          itemId: item.itemId,
          itemName: inventoryItem.name,
          quantityUsed: item.quantityUsed,
        });
      }

      await client.query("COMMIT");

      await auditLog(
        tenantId,
        req.user!.id,
        "inventory_procedure_usage",
        "inventory_usage",
        `Procedure: ${payload.procedureName}`
      );

      res.status(201).json({
        usageIds,
        itemsUsed,
        message: `Recorded inventory usage for procedure: ${payload.procedureName}`,
      });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error.message?.includes("Insufficient inventory") || error.message?.includes("not found")) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    } finally {
      client.release();
    }
  }
);

// ==================== INVENTORY USAGE ENDPOINTS ====================

const createUsageSchema = z.object({
  itemId: z.string().uuid(),
  quantityUsed: z.number().int().min(1),
  patientId: z.string().min(1),
  providerId: z.string().min(1),
  encounterId: z.string().optional(),
  appointmentId: z.string().optional(),
  notes: z.string().optional(),
});

// Record inventory usage during appointment/encounter
inventoryRouter.post("/usage", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = createUsageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // Verify item exists and get current cost
  const itemCheck = await pool.query(
    `SELECT id, name, quantity, unit_cost_cents FROM inventory_items WHERE id = $1 AND tenant_id = $2`,
    [payload.itemId, tenantId]
  );

  if (!itemCheck.rowCount) {
    return res.status(404).json({ error: "Inventory item not found" });
  }

  const item = itemCheck.rows[0];

  // Check if we have enough quantity
  if (item.quantity < payload.quantityUsed) {
    return res.status(400).json({
      error: `Insufficient inventory: only ${item.quantity} units available`,
      availableQuantity: item.quantity
    });
  }

  // Insert usage record (trigger will automatically decrease inventory)
  const result = await pool.query(
    `INSERT INTO inventory_usage(
      tenant_id, item_id, quantity_used, unit_cost_cents,
      patient_id, provider_id, encounter_id, appointment_id, notes, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, used_at`,
    [
      tenantId,
      payload.itemId,
      payload.quantityUsed,
      item.unit_cost_cents,
      payload.patientId,
      payload.providerId,
      payload.encounterId || null,
      payload.appointmentId || null,
      payload.notes || null,
      req.user!.id,
    ]
  );

  await auditLog(tenantId, req.user!.id, "inventory_usage_create", "inventory_item", payload.itemId);

  res.status(201).json({
    id: result.rows[0].id,
    usedAt: result.rows[0].used_at,
    message: `${payload.quantityUsed} units of ${item.name} recorded`
  });
});

// Get usage record by ID
inventoryRouter.get("/usage/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const result = await pool.query(
    `SELECT
      u.id,
      u.quantity_used as "quantityUsed",
      u.unit_cost_cents as "unitCostCents",
      u.notes,
      u.used_at as "usedAt",
      u.encounter_id as "encounterId",
      u.appointment_id as "appointmentId",
      u.patient_id as "patientId",
      u.provider_id as "providerId",
      i.id as "itemId",
      i.name as "itemName",
      i.category as "itemCategory",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      pr.full_name as "providerName"
    FROM inventory_usage u
    JOIN inventory_items i ON u.item_id = i.id
    LEFT JOIN patients p ON u.patient_id = p.id
    LEFT JOIN users pr ON u.provider_id = pr.id
    WHERE u.id = $1 AND u.tenant_id = $2`,
    [id, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Usage record not found" });
  }

  res.json({ usage: result.rows[0] });
});

// Delete/void a usage record (admin only - will add quantity back)
inventoryRouter.delete("/usage/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get usage details
    const usageResult = await client.query(
      `SELECT item_id, quantity_used FROM inventory_usage WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (!usageResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usage record not found" });
    }

    const usage = usageResult.rows[0];

    // Add quantity back to inventory
    await client.query(
      `UPDATE inventory_items SET quantity = quantity + $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [usage.quantity_used, usage.item_id, tenantId]
    );

    // Delete usage record
    await client.query(
      `DELETE FROM inventory_usage WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    await client.query("COMMIT");

    await auditLog(tenantId, req.user!.id, "inventory_usage_void", "inventory_usage", id!);

    res.json({ success: true, message: "Usage record voided and quantity restored" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
