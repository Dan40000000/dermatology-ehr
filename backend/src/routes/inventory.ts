import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";

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

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logInventoryError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

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

// ==================== ENHANCED INVENTORY ROUTES ====================
// Import enhanced service
import {
  inventoryService,
  PROCEDURE_TEMPLATES,
  InventoryCategory,
  PurchaseOrderStatus,
  EquipmentStatus,
} from "../services/inventoryService";

// ==================== INVENTORY DASHBOARD ====================

/**
 * GET /api/inventory/dashboard
 * Get comprehensive inventory dashboard
 */
inventoryRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const dashboard = await inventoryService.getInventoryDashboard(tenantId);
    res.json(dashboard);
  } catch (error: any) {
    logInventoryError("Error fetching inventory dashboard:", error);
    res.status(500).json({ error: "Failed to fetch inventory dashboard" });
  }
});

/**
 * GET /api/inventory/alerts
 * Get low stock and expiration alerts
 */
inventoryRouter.get("/alerts", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const daysThreshold = parseInt(req.query.days as string) || 90;

    const [lowStock, expiration] = await Promise.all([
      inventoryService.checkReorderPoints(tenantId),
      inventoryService.trackExpiration(tenantId, daysThreshold),
    ]);

    res.json({
      lowStock,
      expiringSoon: expiration.expiringSoon,
      expired: expiration.expired,
    });
  } catch (error: any) {
    logInventoryError("Error fetching inventory alerts:", error);
    res.status(500).json({ error: "Failed to fetch inventory alerts" });
  }
});

/**
 * GET /api/inventory/reorder-suggestions
 * Get items that need reordering with vendor info
 */
inventoryRouter.get("/reorder-suggestions", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const suggestions = await inventoryService.getReorderSuggestions(tenantId);
    res.json({ suggestions });
  } catch (error: any) {
    logInventoryError("Error fetching reorder suggestions:", error);
    res.status(500).json({ error: "Failed to fetch reorder suggestions" });
  }
});

/**
 * GET /api/inventory/value-by-category
 * Get inventory value grouped by category
 */
inventoryRouter.get("/value-by-category", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const valueByCategory = await inventoryService.getInventoryValueByCategory(tenantId);
    res.json({ categories: valueByCategory });
  } catch (error: any) {
    logInventoryError("Error fetching inventory value by category:", error);
    res.status(500).json({ error: "Failed to fetch inventory value by category" });
  }
});

// ==================== LOT MANAGEMENT ====================

/**
 * GET /api/inventory/lots/:itemId
 * Get lots for an inventory item
 */
inventoryRouter.get("/lots/:itemId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { itemId } = req.params;

    const lots = await inventoryService.getItemLots(tenantId, itemId!);
    res.json({ lots });
  } catch (error: any) {
    logInventoryError("Error fetching item lots:", error);
    res.status(500).json({ error: "Failed to fetch item lots" });
  }
});

const createLotSchema = z.object({
  lotNumber: z.string().min(1).max(100),
  quantity: z.number().int().min(0),
  expirationDate: z.string().optional(),
});

/**
 * POST /api/inventory/:itemId/lots
 * Create or update a lot for an item
 */
inventoryRouter.post("/:itemId/lots", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = createLotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  try {
    const tenantId = req.user!.tenantId;
    const { itemId } = req.params;

    const lot = await inventoryService.upsertLot(
      tenantId,
      itemId!,
      parsed.data.lotNumber,
      parsed.data.quantity,
      parsed.data.expirationDate
    );

    await auditLog(tenantId, req.user!.id, "inventory_lot_create", "inventory_lot", lot.id);
    res.status(201).json({ lot });
  } catch (error: any) {
    logInventoryError("Error creating lot:", error);
    res.status(500).json({ error: error.message || "Failed to create lot" });
  }
});

// ==================== PROCEDURE DEDUCTION ====================

const procedureDeductSchema = z.object({
  procedureType: z.string(),
  patientId: z.string(),
  providerId: z.string(),
  encounterId: z.string(),
  customQuantities: z.array(z.object({
    itemSku: z.string(),
    quantity: z.number().int().min(1),
  })).optional(),
});

/**
 * POST /api/inventory/deduct
 * Deduct supplies for a procedure
 */
inventoryRouter.post("/deduct", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = procedureDeductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  try {
    const tenantId = req.user!.tenantId;

    const result = await inventoryService.deductProcedureSupplies(
      tenantId,
      parsed.data.procedureType,
      parsed.data.patientId,
      parsed.data.providerId,
      parsed.data.encounterId,
      req.user!.id,
      parsed.data.customQuantities
    );

    await auditLog(tenantId, req.user!.id, "inventory_procedure_deduct", "inventory", parsed.data.procedureType);
    res.json(result);
  } catch (error: any) {
    logInventoryError("Error deducting procedure supplies:", error);
    if (error.message?.includes("Insufficient")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to deduct supplies" });
  }
});

/**
 * GET /api/inventory/procedure-templates-list
 * Get available procedure templates
 */
inventoryRouter.get("/procedure-templates-list", requireAuth, async (_req: AuthedRequest, res) => {
  res.json({ templates: Object.keys(PROCEDURE_TEMPLATES).map(key => ({
    procedureType: key,
    ...PROCEDURE_TEMPLATES[key],
  })) });
});

// ==================== VENDORS ====================

const vendorSchema = z.object({
  name: z.string().min(1).max(255),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  leadTimeDays: z.number().int().min(0).default(7),
  paymentTerms: z.string().max(100).optional(),
  accountNumber: z.string().max(100).optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/inventory/vendors
 * List all vendors
 */
inventoryRouter.get("/vendors", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const activeOnly = req.query.active !== "false";

  let query = `
    SELECT
      id, name, contact_name as "contactName", contact_email as "contactEmail",
      contact_phone as "contactPhone", address, lead_time_days as "leadTimeDays",
      rating, payment_terms as "paymentTerms", account_number as "accountNumber",
      is_active as "isActive", notes, created_at as "createdAt"
    FROM vendors
    WHERE tenant_id = $1
  `;
  const params: any[] = [tenantId];

  if (activeOnly) {
    query += ` AND is_active = true`;
  }

  query += ` ORDER BY name ASC`;

  const result = await pool.query(query, params);
  res.json({ vendors: result.rows });
});

/**
 * POST /api/inventory/vendors
 * Create a vendor
 */
inventoryRouter.post("/vendors", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const parsed = vendorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `INSERT INTO vendors (
        tenant_id, name, contact_name, contact_email, contact_phone,
        address, lead_time_days, payment_terms, account_number, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        tenantId,
        parsed.data.name,
        parsed.data.contactName || null,
        parsed.data.contactEmail || null,
        parsed.data.contactPhone || null,
        parsed.data.address ? JSON.stringify(parsed.data.address) : null,
        parsed.data.leadTimeDays,
        parsed.data.paymentTerms || null,
        parsed.data.accountNumber || null,
        parsed.data.notes || null,
      ]
    );

    await auditLog(tenantId, req.user!.id, "vendor_create", "vendor", result.rows[0].id);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error: any) {
    if (error.constraint === "unique_vendor_name") {
      return res.status(409).json({ error: "Vendor with this name already exists" });
    }
    throw error;
  }
});

/**
 * GET /api/inventory/vendors/:id
 * Get vendor details
 */
inventoryRouter.get("/vendors/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const result = await pool.query(
    `SELECT
      id, name, contact_name as "contactName", contact_email as "contactEmail",
      contact_phone as "contactPhone", address, lead_time_days as "leadTimeDays",
      rating, payment_terms as "paymentTerms", account_number as "accountNumber",
      is_active as "isActive", notes, created_at as "createdAt", updated_at as "updatedAt"
    FROM vendors
    WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Vendor not found" });
  }

  res.json({ vendor: result.rows[0] });
});

/**
 * PATCH /api/inventory/vendors/:id
 * Update vendor
 */
inventoryRouter.patch("/vendors/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  const allowedFields = [
    'name', 'contactName', 'contactEmail', 'contactPhone', 'address',
    'leadTimeDays', 'paymentTerms', 'accountNumber', 'isActive', 'rating', 'notes'
  ];

  const fieldMap: Record<string, string> = {
    contactName: 'contact_name',
    contactEmail: 'contact_email',
    contactPhone: 'contact_phone',
    leadTimeDays: 'lead_time_days',
    paymentTerms: 'payment_terms',
    accountNumber: 'account_number',
    isActive: 'is_active',
  };

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      const dbField = fieldMap[field] || field;
      updates.push(`${dbField} = $${paramCount++}`);
      values.push(field === 'address' && req.body[field] ? JSON.stringify(req.body[field]) : req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  await pool.query(
    `UPDATE vendors SET ${updates.join(", ")} WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}`,
    values
  );

  await auditLog(tenantId, req.user!.id, "vendor_update", "vendor", id!);
  res.json({ success: true });
});

// ==================== PURCHASE ORDERS ====================

const createPoSchema = z.object({
  vendorId: z.string().uuid(),
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1),
    unitCostCents: z.number().int().min(0),
  })).min(1),
  expectedDate: z.string().optional(),
  shippingAddress: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
  }).optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/inventory/purchase-orders
 * List purchase orders
 */
inventoryRouter.get("/purchase-orders", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, vendorId, limit = "100" } = req.query;

  let query = `
    SELECT
      po.id, po.po_number as "poNumber", po.status,
      po.order_date as "orderDate", po.expected_date as "expectedDate",
      po.received_date as "receivedDate", po.subtotal_cents as "subtotalCents",
      po.tax_cents as "taxCents", po.shipping_cents as "shippingCents",
      po.total_amount_cents as "totalAmountCents",
      po.created_at as "createdAt",
      v.id as "vendorId", v.name as "vendorName"
    FROM purchase_orders po
    JOIN vendors v ON po.vendor_id = v.id
    WHERE po.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 2;

  if (status && typeof status === "string") {
    query += ` AND po.status = $${paramCount++}`;
    params.push(status);
  }

  if (vendorId && typeof vendorId === "string") {
    query += ` AND po.vendor_id = $${paramCount++}`;
    params.push(vendorId);
  }

  query += ` ORDER BY po.created_at DESC LIMIT $${paramCount}`;
  params.push(parseInt(limit as string));

  const result = await pool.query(query, params);
  res.json({ purchaseOrders: result.rows });
});

/**
 * POST /api/inventory/purchase-orders
 * Create a purchase order
 */
inventoryRouter.post("/purchase-orders", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = createPoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  try {
    const tenantId = req.user!.tenantId;

    const po = await inventoryService.createPurchaseOrder(
      tenantId,
      parsed.data.vendorId,
      parsed.data.items,
      req.user!.id,
      {
        expectedDate: parsed.data.expectedDate,
        shippingAddress: parsed.data.shippingAddress,
        notes: parsed.data.notes,
      }
    );

    await auditLog(tenantId, req.user!.id, "purchase_order_create", "purchase_order", po.id);
    res.status(201).json({ purchaseOrder: po });
  } catch (error: any) {
    logInventoryError("Error creating purchase order:", error);
    res.status(500).json({ error: error.message || "Failed to create purchase order" });
  }
});

/**
 * GET /api/inventory/purchase-orders/:id
 * Get purchase order details
 */
inventoryRouter.get("/purchase-orders/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const po = await inventoryService.getPurchaseOrder(tenantId, id!);

    if (!po) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    res.json({ purchaseOrder: po });
  } catch (error: any) {
    logInventoryError("Error fetching purchase order:", error);
    res.status(500).json({ error: "Failed to fetch purchase order" });
  }
});

/**
 * POST /api/inventory/purchase-orders/:id/submit
 * Submit a purchase order
 */
inventoryRouter.post("/purchase-orders/:id/submit", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    await inventoryService.submitPurchaseOrder(tenantId, id!, req.user!.id);

    await auditLog(tenantId, req.user!.id, "purchase_order_submit", "purchase_order", id!);
    res.json({ success: true, message: "Purchase order submitted" });
  } catch (error: any) {
    logInventoryError("Error submitting purchase order:", error);
    res.status(500).json({ error: error.message || "Failed to submit purchase order" });
  }
});

const receivePoSchema = z.object({
  items: z.array(z.object({
    poItemId: z.string().uuid(),
    receivedQuantity: z.number().int().min(1),
    lotNumber: z.string().optional(),
    expirationDate: z.string().optional(),
  })).min(1),
});

/**
 * POST /api/inventory/purchase-orders/:id/receive
 * Receive items from a purchase order
 */
inventoryRouter.post("/purchase-orders/:id/receive", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = receivePoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    await inventoryService.receiveOrder(tenantId, id!, parsed.data.items, req.user!.id);

    await auditLog(tenantId, req.user!.id, "purchase_order_receive", "purchase_order", id!);
    res.json({ success: true, message: "Items received and inventory updated" });
  } catch (error: any) {
    logInventoryError("Error receiving purchase order:", error);
    res.status(500).json({ error: error.message || "Failed to receive order" });
  }
});

// ==================== MEDICATION SAMPLES ====================

const sampleSchema = z.object({
  drugName: z.string().min(1).max(255),
  manufacturer: z.string().max(255).optional(),
  ndcCode: z.string().max(50).optional(),
  lotNumber: z.string().max(100).optional(),
  quantity: z.number().int().min(1),
  unitSize: z.string().max(50).optional(),
  expirationDate: z.string().optional(),
  category: z.string().max(100).optional(),
  storageRequirements: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/inventory/samples
 * List medication samples
 */
inventoryRouter.get("/samples", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { category, activeOnly = "true" } = req.query;

  let query = `
    SELECT
      id, drug_name as "drugName", manufacturer, ndc_code as "ndcCode",
      lot_number as "lotNumber", quantity, unit_size as "unitSize",
      expiration_date as "expirationDate", received_date as "receivedDate",
      category, storage_requirements as "storageRequirements",
      is_active as "isActive", notes, created_at as "createdAt"
    FROM medication_samples
    WHERE tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 2;

  if (activeOnly === "true") {
    query += ` AND is_active = true`;
  }

  if (category && typeof category === "string") {
    query += ` AND category = $${paramCount++}`;
    params.push(category);
  }

  query += ` ORDER BY drug_name ASC`;

  const result = await pool.query(query, params);
  res.json({ samples: result.rows });
});

/**
 * POST /api/inventory/samples
 * Log receipt of medication samples
 */
inventoryRouter.post("/samples", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = sampleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  try {
    const tenantId = req.user!.tenantId;

    const sample = await inventoryService.logSampleReceipt(tenantId, parsed.data, req.user!.id);

    await auditLog(tenantId, req.user!.id, "sample_receipt", "medication_sample", sample.id);
    res.status(201).json({ sample });
  } catch (error: any) {
    logInventoryError("Error logging sample receipt:", error);
    res.status(500).json({ error: error.message || "Failed to log sample receipt" });
  }
});

const dispenseSchema = z.object({
  sampleId: z.string().uuid(),
  patientId: z.string(),
  quantity: z.number().int().min(1),
  consentObtained: z.boolean().default(false),
  encounterId: z.string().optional(),
  diagnosisCode: z.string().max(20).optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/inventory/samples/dispense
 * Dispense sample to patient
 */
inventoryRouter.post("/samples/dispense", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = dispenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  try {
    const tenantId = req.user!.tenantId;

    const dispenseLog = await inventoryService.dispenseSample(
      tenantId,
      parsed.data.sampleId,
      parsed.data.patientId,
      parsed.data.quantity,
      req.user!.id,
      {
        consentObtained: parsed.data.consentObtained,
        encounterId: parsed.data.encounterId,
        diagnosisCode: parsed.data.diagnosisCode,
        notes: parsed.data.notes,
      }
    );

    await auditLog(tenantId, req.user!.id, "sample_dispense", "sample_dispensing_log", dispenseLog.id);
    res.status(201).json({ dispenseLog });
  } catch (error: any) {
    logInventoryError("Error dispensing sample:", error);
    if (error.message?.includes("Insufficient")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to dispense sample" });
  }
});

/**
 * GET /api/inventory/samples/dispense-log
 * Get sample dispensing history
 */
inventoryRouter.get("/samples/dispense-log", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, sampleId, limit = "100" } = req.query;

  let query = `
    SELECT
      sdl.id, sdl.quantity, sdl.dispensed_at as "dispensedAt",
      sdl.consent_obtained as "consentObtained", sdl.diagnosis_code as "diagnosisCode",
      sdl.notes,
      ms.drug_name as "drugName", ms.manufacturer,
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      u.full_name as "dispensedByName"
    FROM sample_dispensing_log sdl
    JOIN medication_samples ms ON sdl.sample_id = ms.id
    JOIN patients p ON sdl.patient_id = p.id
    LEFT JOIN users u ON sdl.dispensed_by = u.id
    WHERE sdl.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 2;

  if (patientId && typeof patientId === "string") {
    query += ` AND sdl.patient_id = $${paramCount++}`;
    params.push(patientId);
  }

  if (sampleId && typeof sampleId === "string") {
    query += ` AND sdl.sample_id = $${paramCount++}`;
    params.push(sampleId);
  }

  query += ` ORDER BY sdl.dispensed_at DESC LIMIT $${paramCount}`;
  params.push(parseInt(limit as string));

  const result = await pool.query(query, params);
  res.json({ dispenseLog: result.rows });
});

// ==================== EQUIPMENT ====================

const equipmentSchema = z.object({
  name: z.string().min(1).max(255),
  serialNumber: z.string().max(100).optional(),
  model: z.string().max(255).optional(),
  manufacturer: z.string().max(255).optional(),
  category: z.enum(["diagnostic", "treatment", "surgical", "laser", "imaging", "sterilization", "other"]),
  purchaseDate: z.string().optional(),
  purchasePriceCents: z.number().int().min(0).optional(),
  warrantyExpiration: z.string().optional(),
  maintenanceIntervalDays: z.number().int().min(1).default(365),
  location: z.string().max(255).optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/inventory/equipment
 * List equipment
 */
inventoryRouter.get("/equipment", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { category, status } = req.query;

  let query = `
    SELECT
      id, name, serial_number as "serialNumber", model, manufacturer, category,
      purchase_date as "purchaseDate", purchase_price_cents as "purchasePriceCents",
      warranty_expiration as "warrantyExpiration",
      last_maintenance as "lastMaintenance", next_maintenance as "nextMaintenance",
      maintenance_interval_days as "maintenanceIntervalDays",
      status, location, notes, created_at as "createdAt"
    FROM equipment
    WHERE tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 2;

  if (category && typeof category === "string") {
    query += ` AND category = $${paramCount++}`;
    params.push(category);
  }

  if (status && typeof status === "string") {
    query += ` AND status = $${paramCount++}`;
    params.push(status);
  }

  query += ` ORDER BY name ASC`;

  const result = await pool.query(query, params);
  res.json({ equipment: result.rows });
});

/**
 * POST /api/inventory/equipment
 * Add equipment
 */
inventoryRouter.post("/equipment", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const parsed = equipmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `INSERT INTO equipment (
      tenant_id, name, serial_number, model, manufacturer, category,
      purchase_date, purchase_price_cents, warranty_expiration,
      maintenance_interval_days, location, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id`,
    [
      tenantId,
      parsed.data.name,
      parsed.data.serialNumber || null,
      parsed.data.model || null,
      parsed.data.manufacturer || null,
      parsed.data.category,
      parsed.data.purchaseDate || null,
      parsed.data.purchasePriceCents || null,
      parsed.data.warrantyExpiration || null,
      parsed.data.maintenanceIntervalDays,
      parsed.data.location || null,
      parsed.data.notes || null,
    ]
  );

  await auditLog(tenantId, req.user!.id, "equipment_create", "equipment", result.rows[0].id);
  res.status(201).json({ id: result.rows[0].id });
});

/**
 * GET /api/inventory/equipment/:id
 * Get equipment details
 */
inventoryRouter.get("/equipment/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const result = await pool.query(
    `SELECT
      id, name, serial_number as "serialNumber", model, manufacturer, category,
      purchase_date as "purchaseDate", purchase_price_cents as "purchasePriceCents",
      warranty_expiration as "warrantyExpiration",
      last_maintenance as "lastMaintenance", next_maintenance as "nextMaintenance",
      maintenance_interval_days as "maintenanceIntervalDays",
      status, location, notes, created_at as "createdAt", updated_at as "updatedAt"
    FROM equipment
    WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Equipment not found" });
  }

  // Get maintenance history
  const maintenanceResult = await pool.query(
    `SELECT
      id, maintenance_type as "maintenanceType", performed_by as "performedBy",
      performed_at as "performedAt", cost_cents as "costCents",
      findings, actions_taken as "actionsTaken", parts_replaced as "partsReplaced",
      notes
    FROM equipment_maintenance_log
    WHERE equipment_id = $1
    ORDER BY performed_at DESC
    LIMIT 10`,
    [id]
  );

  res.json({
    equipment: result.rows[0],
    maintenanceHistory: maintenanceResult.rows,
  });
});

/**
 * PATCH /api/inventory/equipment/:id
 * Update equipment
 */
inventoryRouter.patch("/equipment/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  const allowedFields = [
    'name', 'serialNumber', 'model', 'manufacturer', 'category',
    'purchaseDate', 'purchasePriceCents', 'warrantyExpiration',
    'maintenanceIntervalDays', 'status', 'location', 'notes'
  ];

  const fieldMap: Record<string, string> = {
    serialNumber: 'serial_number',
    purchaseDate: 'purchase_date',
    purchasePriceCents: 'purchase_price_cents',
    warrantyExpiration: 'warranty_expiration',
    maintenanceIntervalDays: 'maintenance_interval_days',
  };

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      const dbField = fieldMap[field] || field;
      updates.push(`${dbField} = $${paramCount++}`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  await pool.query(
    `UPDATE equipment SET ${updates.join(", ")} WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}`,
    values
  );

  await auditLog(tenantId, req.user!.id, "equipment_update", "equipment", id!);
  res.json({ success: true });
});

const maintenanceLogSchema = z.object({
  equipmentId: z.string().uuid(),
  maintenanceType: z.enum(["preventive", "corrective", "calibration", "inspection", "cleaning", "repair", "upgrade"]),
  costCents: z.number().int().min(0).default(0),
  findings: z.string().optional(),
  actionsTaken: z.string().optional(),
  partsReplaced: z.string().optional(),
  nextScheduled: z.string().optional(),
  externalTechnician: z.string().optional(),
  serviceCompany: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/inventory/equipment/maintenance
 * Log equipment maintenance
 */
inventoryRouter.post("/equipment/maintenance", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = maintenanceLogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  try {
    const tenantId = req.user!.tenantId;

    const maintenanceLog = await inventoryService.logEquipmentMaintenance(tenantId, parsed.data.equipmentId, {
      maintenanceType: parsed.data.maintenanceType,
      performedBy: req.user!.id,
      costCents: parsed.data.costCents,
      findings: parsed.data.findings,
      actionsTaken: parsed.data.actionsTaken,
      partsReplaced: parsed.data.partsReplaced,
      nextScheduled: parsed.data.nextScheduled,
      externalTechnician: parsed.data.externalTechnician,
      serviceCompany: parsed.data.serviceCompany,
      notes: parsed.data.notes,
    });

    await auditLog(tenantId, req.user!.id, "equipment_maintenance", "equipment_maintenance_log", maintenanceLog.id);
    res.status(201).json({ maintenanceLog });
  } catch (error: any) {
    logInventoryError("Error logging equipment maintenance:", error);
    res.status(500).json({ error: error.message || "Failed to log maintenance" });
  }
});

/**
 * GET /api/inventory/equipment/maintenance-due
 * Get equipment due for maintenance
 */
inventoryRouter.get("/equipment/maintenance-due", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const daysThreshold = parseInt(req.query.days as string) || 30;

    const equipment = await inventoryService.getEquipmentDueMaintenance(tenantId, daysThreshold);
    res.json({ equipment });
  } catch (error: any) {
    logInventoryError("Error fetching equipment due maintenance:", error);
    res.status(500).json({ error: "Failed to fetch equipment due maintenance" });
  }
});

// ==================== EXPIRATION MANAGEMENT ====================

/**
 * POST /api/inventory/process-expired
 * Process expired items (mark lots as expired, adjust quantities)
 */
inventoryRouter.post("/process-expired", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const processedCount = await inventoryService.processExpiredItems(tenantId, req.user!.id);

    await auditLog(tenantId, req.user!.id, "inventory_process_expired", "inventory", `${processedCount} lots`);
    res.json({ success: true, processedCount, message: `Processed ${processedCount} expired lots` });
  } catch (error: any) {
    logInventoryError("Error processing expired items:", error);
    res.status(500).json({ error: "Failed to process expired items" });
  }
});

// ==================== INVENTORY TRANSACTIONS ====================

/**
 * GET /api/inventory/transactions
 * Get inventory transaction history
 */
inventoryRouter.get("/transactions", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { itemId, transactionType, limit = "100" } = req.query;

  let query = `
    SELECT
      t.id, t.transaction_type as "transactionType", t.quantity,
      t.reference_id as "referenceId", t.reference_type as "referenceType",
      t.notes, t.created_at as "createdAt",
      i.id as "itemId", i.name as "itemName", i.sku as "itemSku",
      l.lot_number as "lotNumber",
      u.full_name as "performedByName"
    FROM inventory_transactions t
    JOIN inventory_items i ON t.item_id = i.id
    LEFT JOIN inventory_lots l ON t.lot_id = l.id
    LEFT JOIN users u ON t.performed_by = u.id
    WHERE t.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 2;

  if (itemId && typeof itemId === "string") {
    query += ` AND t.item_id = $${paramCount++}`;
    params.push(itemId);
  }

  if (transactionType && typeof transactionType === "string") {
    query += ` AND t.transaction_type = $${paramCount++}`;
    params.push(transactionType);
  }

  query += ` ORDER BY t.created_at DESC LIMIT $${paramCount}`;
  params.push(parseInt(limit as string));

  const result = await pool.query(query, params);
  res.json({ transactions: result.rows });
});
