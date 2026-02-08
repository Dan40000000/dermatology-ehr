import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import * as crypto from 'crypto';

// ============================================
// TYPES & INTERFACES
// ============================================

export enum InventoryCategory {
  MEDICATION = 'medication',
  INJECTABLE = 'injectable',
  SUPPLY = 'supply',
  SKINCARE_RETAIL = 'skincare_retail',
  EQUIPMENT = 'equipment',
  COSMETIC = 'cosmetic',
}

export enum TransactionType {
  RECEIVED = 'received',
  USED = 'used',
  ADJUSTED = 'adjusted',
  RETURNED = 'returned',
  EXPIRED = 'expired',
  DAMAGED = 'damaged',
  TRANSFERRED = 'transferred',
  SAMPLE_DISPENSED = 'sample_dispensed',
  CORRECTION = 'correction',
  WASTE = 'waste',
}

export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  SUBMITTED = 'submitted',
  PARTIAL = 'partial',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export enum EquipmentStatus {
  OPERATIONAL = 'operational',
  MAINTENANCE = 'maintenance',
  REPAIR = 'repair',
  OUT_OF_SERVICE = 'out_of_service',
  RETIRED = 'retired',
}

export enum LotStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  RECALLED = 'recalled',
  DEPLETED = 'depleted',
  QUARANTINE = 'quarantine',
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  name: string;
  sku?: string;
  category: InventoryCategory;
  unitCostCents: number;
  quantityOnHand: number;
  reorderPoint: number;
  reorderQuantity: number;
  location?: string;
  createdAt: string;
}

export interface InventoryLot {
  id: string;
  itemId: string;
  lotNumber: string;
  expirationDate?: string;
  quantity: number;
  receivedDate: string;
  status: LotStatus;
}

export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  leadTimeDays: number;
  rating?: number;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  vendorId: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  orderDate?: string;
  expectedDate?: string;
  receivedDate?: string;
  totalAmountCents: number;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  itemId: string;
  quantity: number;
  unitCostCents: number;
  receivedQuantity: number;
  lotNumber?: string;
  expirationDate?: string;
}

export interface MedicationSample {
  id: string;
  tenantId: string;
  drugName: string;
  manufacturer?: string;
  ndcCode?: string;
  lotNumber?: string;
  quantity: number;
  expirationDate?: string;
  receivedDate: string;
  receivedBy: string;
}

export interface SampleDispenseLog {
  id: string;
  sampleId: string;
  patientId: string;
  quantity: number;
  dispensedBy: string;
  dispensedAt: string;
  consentObtained: boolean;
}

export interface Equipment {
  id: string;
  tenantId: string;
  name: string;
  serialNumber?: string;
  category: string;
  purchaseDate?: string;
  lastMaintenance?: string;
  nextMaintenance?: string;
  status: EquipmentStatus;
}

export interface EquipmentMaintenanceLog {
  id: string;
  equipmentId: string;
  maintenanceType: string;
  performedBy: string;
  notes?: string;
  costCents: number;
  performedAt: string;
}

// Procedure Supply Templates
export interface ProcedureSupplyTemplate {
  procedureType: string;
  supplies: {
    itemSku: string;
    itemName: string;
    defaultQuantity: number;
    isOptional: boolean;
  }[];
}

export const PROCEDURE_TEMPLATES: Record<string, ProcedureSupplyTemplate> = {
  BOTOX_INJECTION: {
    procedureType: 'BOTOX_INJECTION',
    supplies: [
      { itemSku: 'BOTOX-100', itemName: 'Botox 100 Units', defaultQuantity: 1, isOptional: false },
      { itemSku: 'NDL-30G-05', itemName: 'Needle 30G x 1/2"', defaultQuantity: 5, isOptional: false },
      { itemSku: 'ALC-PREP', itemName: 'Alcohol Prep Pads', defaultQuantity: 3, isOptional: false },
      { itemSku: 'LIDO-1-30', itemName: 'Lidocaine 1% (Topical)', defaultQuantity: 1, isOptional: true },
    ],
  },
  CHEMICAL_PEEL: {
    procedureType: 'CHEMICAL_PEEL',
    supplies: [
      { itemSku: 'PEEL-SOL', itemName: 'Chemical Peel Solution', defaultQuantity: 1, isOptional: false },
      { itemSku: 'Q-TIPS-STER', itemName: 'Applicators', defaultQuantity: 10, isOptional: false },
      { itemSku: 'GAUZE-4X4', itemName: 'Gauze Pads 4x4', defaultQuantity: 4, isOptional: false },
      { itemSku: 'POST-CARE', itemName: 'Post-Care Kit', defaultQuantity: 1, isOptional: false },
    ],
  },
  BIOPSY: {
    procedureType: 'BIOPSY',
    supplies: [
      { itemSku: 'PB-4MM', itemName: 'Punch Biopsy 4mm', defaultQuantity: 1, isOptional: false },
      { itemSku: 'SUT-4-0-NYL', itemName: 'Suture 4-0 Nylon', defaultQuantity: 1, isOptional: false },
      { itemSku: 'BANDAID-AST', itemName: 'Bandage', defaultQuantity: 2, isOptional: false },
      { itemSku: 'SPEC-CONT', itemName: 'Specimen Container', defaultQuantity: 1, isOptional: false },
      { itemSku: 'LIDO-1-EPI', itemName: 'Lidocaine w/ Epi', defaultQuantity: 3, isOptional: false },
    ],
  },
  CRYOTHERAPY: {
    procedureType: 'CRYOTHERAPY',
    supplies: [
      { itemSku: 'LN2-LITER', itemName: 'Liquid Nitrogen', defaultQuantity: 1, isOptional: false },
      { itemSku: 'CRYO-TIP-S', itemName: 'Cryotherapy Spray Tip', defaultQuantity: 1, isOptional: false },
    ],
  },
  DERMAL_FILLER: {
    procedureType: 'DERMAL_FILLER',
    supplies: [
      { itemSku: 'JUV-UXCL', itemName: 'Juvederm Ultra XC 1mL', defaultQuantity: 1, isOptional: false },
      { itemSku: 'NDL-27G-05', itemName: 'Needle 27G x 1/2"', defaultQuantity: 2, isOptional: false },
      { itemSku: 'ALC-PREP', itemName: 'Alcohol Prep Pads', defaultQuantity: 2, isOptional: false },
      { itemSku: 'GAUZE-2X2', itemName: 'Gauze Pads 2x2', defaultQuantity: 4, isOptional: false },
    ],
  },
};

// ============================================
// INVENTORY SERVICE CLASS
// ============================================

export class InventoryService {
  // ============================================
  // REORDER POINT MANAGEMENT
  // ============================================

  /**
   * Check items at or below reorder point
   */
  async checkReorderPoints(tenantId: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM get_reorder_items($1)`,
        [tenantId]
      );

      logger.info(`Found ${result.rowCount} items at or below reorder point`, { tenantId });
      return result.rows;
    } catch (error) {
      logger.error('Error checking reorder points:', error);
      throw error;
    }
  }

  /**
   * Get items that need to be reordered with vendor suggestions
   */
  async getReorderSuggestions(tenantId: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT
          i.id,
          i.name,
          i.sku,
          i.category,
          i.quantity,
          i.reorder_level as "reorderLevel",
          i.reorder_quantity as "reorderQuantity",
          i.unit_cost_cents as "unitCostCents",
          i.supplier,
          v.id as "vendorId",
          v.name as "vendorName",
          v.lead_time_days as "leadTimeDays"
        FROM inventory_items i
        LEFT JOIN vendors v ON v.tenant_id = i.tenant_id AND v.name = i.supplier AND v.is_active = true
        WHERE i.tenant_id = $1
          AND i.quantity <= i.reorder_level
        ORDER BY (i.quantity - i.reorder_level) ASC`,
        [tenantId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting reorder suggestions:', error);
      throw error;
    }
  }

  // ============================================
  // PURCHASE ORDER MANAGEMENT
  // ============================================

  /**
   * Create a new purchase order
   */
  async createPurchaseOrder(
    tenantId: string,
    vendorId: string,
    items: { itemId: string; quantity: number; unitCostCents: number }[],
    userId: string,
    options?: {
      expectedDate?: string;
      shippingAddress?: any;
      notes?: string;
    }
  ): Promise<PurchaseOrder> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate PO number
      const poNumberResult = await client.query(
        `SELECT generate_po_number($1) as po_number`,
        [tenantId]
      );
      const poNumber = poNumberResult.rows[0].po_number;

      // Calculate totals
      const subtotalCents = items.reduce((sum, item) => sum + (item.quantity * item.unitCostCents), 0);

      // Create purchase order
      const poId = crypto.randomUUID();
      const poResult = await client.query(
        `INSERT INTO purchase_orders (
          id, tenant_id, vendor_id, po_number, status, order_date,
          expected_date, subtotal_cents, total_amount_cents,
          shipping_address, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $7, $8, $9, $10)
        RETURNING *`,
        [
          poId,
          tenantId,
          vendorId,
          poNumber,
          PurchaseOrderStatus.DRAFT,
          options?.expectedDate || null,
          subtotalCents,
          options?.shippingAddress ? JSON.stringify(options.shippingAddress) : null,
          options?.notes || null,
          userId,
        ]
      );

      // Add line items
      for (const item of items) {
        await client.query(
          `INSERT INTO purchase_order_items (po_id, item_id, quantity, unit_cost_cents)
           VALUES ($1, $2, $3, $4)`,
          [poId, item.itemId, item.quantity, item.unitCostCents]
        );
      }

      await client.query('COMMIT');

      logger.info(`Created purchase order ${poNumber}`, { tenantId, poId, vendorId });

      return this.mapPurchaseOrder(poResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating purchase order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get purchase order with items
   */
  async getPurchaseOrder(tenantId: string, poId: string): Promise<any> {
    try {
      const poResult = await pool.query(
        `SELECT
          po.*,
          v.name as vendor_name,
          v.contact_email as vendor_email,
          v.contact_phone as vendor_phone
        FROM purchase_orders po
        JOIN vendors v ON po.vendor_id = v.id
        WHERE po.id = $1 AND po.tenant_id = $2`,
        [poId, tenantId]
      );

      if (!poResult.rowCount) {
        return null;
      }

      const itemsResult = await pool.query(
        `SELECT
          poi.*,
          i.name as item_name,
          i.sku as item_sku,
          i.category as item_category
        FROM purchase_order_items poi
        JOIN inventory_items i ON poi.item_id = i.id
        WHERE poi.po_id = $1`,
        [poId]
      );

      return {
        ...this.mapPurchaseOrder(poResult.rows[0]),
        vendorName: poResult.rows[0].vendor_name,
        vendorEmail: poResult.rows[0].vendor_email,
        vendorPhone: poResult.rows[0].vendor_phone,
        items: itemsResult.rows.map(row => ({
          id: row.id,
          itemId: row.item_id,
          itemName: row.item_name,
          itemSku: row.item_sku,
          itemCategory: row.item_category,
          quantity: row.quantity,
          unitCostCents: row.unit_cost_cents,
          totalCents: row.total_cents,
          receivedQuantity: row.received_quantity,
          lotNumber: row.lot_number,
          expirationDate: row.expiration_date,
        })),
      };
    } catch (error) {
      logger.error('Error getting purchase order:', error);
      throw error;
    }
  }

  /**
   * Submit purchase order
   */
  async submitPurchaseOrder(tenantId: string, poId: string, userId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE purchase_orders
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3 AND status = $4`,
        [PurchaseOrderStatus.SUBMITTED, poId, tenantId, PurchaseOrderStatus.DRAFT]
      );

      logger.info(`Submitted purchase order ${poId}`, { tenantId });
    } catch (error) {
      logger.error('Error submitting purchase order:', error);
      throw error;
    }
  }

  // ============================================
  // RECEIVING ORDERS
  // ============================================

  /**
   * Receive order shipment with lot tracking
   */
  async receiveOrder(
    tenantId: string,
    poId: string,
    receivedItems: {
      poItemId: string;
      receivedQuantity: number;
      lotNumber?: string;
      expirationDate?: string;
    }[],
    userId: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify PO exists and is in correct status
      const poResult = await client.query(
        `SELECT id, status FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
        [poId, tenantId]
      );

      if (!poResult.rowCount) {
        throw new Error('Purchase order not found');
      }

      const po = poResult.rows[0];
      if (!['submitted', 'partial'].includes(po.status)) {
        throw new Error(`Cannot receive items for PO with status: ${po.status}`);
      }

      let allReceived = true;

      for (const item of receivedItems) {
        // Get PO item details
        const poItemResult = await client.query(
          `SELECT poi.*, i.tenant_id
           FROM purchase_order_items poi
           JOIN inventory_items i ON poi.item_id = i.id
           WHERE poi.id = $1 AND poi.po_id = $2`,
          [item.poItemId, poId]
        );

        if (!poItemResult.rowCount) {
          throw new Error(`PO item ${item.poItemId} not found`);
        }

        const poItem = poItemResult.rows[0];
        const totalReceived = poItem.received_quantity + item.receivedQuantity;

        // Update PO item received quantity
        await client.query(
          `UPDATE purchase_order_items
           SET received_quantity = $1, lot_number = COALESCE($2, lot_number),
               expiration_date = COALESCE($3, expiration_date)
           WHERE id = $4`,
          [totalReceived, item.lotNumber, item.expirationDate, item.poItemId]
        );

        // Update inventory quantity
        await client.query(
          `UPDATE inventory_items
           SET quantity = quantity + $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [item.receivedQuantity, poItem.item_id, tenantId]
        );

        // Create lot record if lot number provided
        if (item.lotNumber) {
          await client.query(
            `INSERT INTO inventory_lots (item_id, lot_number, expiration_date, quantity, received_date)
             VALUES ($1, $2, $3, $4, CURRENT_DATE)
             ON CONFLICT (item_id, lot_number) DO UPDATE
             SET quantity = inventory_lots.quantity + $4, updated_at = NOW()`,
            [poItem.item_id, item.lotNumber, item.expirationDate || null, item.receivedQuantity]
          );
        }

        // Record transaction
        await client.query(
          `INSERT INTO inventory_transactions (
            tenant_id, item_id, transaction_type, quantity,
            reference_id, reference_type, performed_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            poItem.item_id,
            TransactionType.RECEIVED,
            item.receivedQuantity,
            poId,
            'purchase_order',
            userId,
            `Received from PO. Lot: ${item.lotNumber || 'N/A'}`,
          ]
        );

        // Check if all items received
        if (totalReceived < poItem.quantity) {
          allReceived = false;
        }
      }

      // Check if all PO items are fully received
      const remainingResult = await client.query(
        `SELECT COUNT(*) as count
         FROM purchase_order_items
         WHERE po_id = $1 AND received_quantity < quantity`,
        [poId]
      );

      const hasRemaining = parseInt(remainingResult.rows[0].count) > 0;

      // Update PO status
      const newStatus = hasRemaining ? PurchaseOrderStatus.PARTIAL : PurchaseOrderStatus.RECEIVED;
      await client.query(
        `UPDATE purchase_orders
         SET status = $1, received_date = CASE WHEN $1 = 'received' THEN CURRENT_DATE ELSE received_date END,
             received_by = $2, updated_at = NOW()
         WHERE id = $3`,
        [newStatus, userId, poId]
      );

      await client.query('COMMIT');

      logger.info(`Received items for PO ${poId}`, { tenantId, status: newStatus });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error receiving order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // PROCEDURE SUPPLY DEDUCTION
  // ============================================

  /**
   * Deduct supplies based on procedure type
   */
  async deductProcedureSupplies(
    tenantId: string,
    procedureType: string,
    patientId: string,
    providerId: string,
    encounterId: string,
    userId: string,
    customQuantities?: { itemSku: string; quantity: number }[]
  ): Promise<{ itemsDeducted: any[]; totalCostCents: number }> {
    const template = PROCEDURE_TEMPLATES[procedureType];
    if (!template) {
      throw new Error(`Unknown procedure type: ${procedureType}`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemsDeducted: any[] = [];
      let totalCostCents = 0;

      for (const supply of template.supplies) {
        // Skip optional items unless custom quantity provided
        const customQty = customQuantities?.find(c => c.itemSku === supply.itemSku);
        if (supply.isOptional && !customQty) {
          continue;
        }

        const quantity = customQty?.quantity || supply.defaultQuantity;

        // Find item by SKU
        const itemResult = await client.query(
          `SELECT id, name, quantity, unit_cost_cents
           FROM inventory_items
           WHERE tenant_id = $1 AND sku = $2`,
          [tenantId, supply.itemSku]
        );

        if (!itemResult.rowCount) {
          logger.warn(`Item not found for procedure deduction: ${supply.itemSku}`, { tenantId, procedureType });
          continue;
        }

        const item = itemResult.rows[0];

        // Check if sufficient quantity
        if (item.quantity < quantity) {
          throw new Error(`Insufficient inventory for ${item.name}: need ${quantity}, have ${item.quantity}`);
        }

        // Deduct from inventory
        await client.query(
          `UPDATE inventory_items
           SET quantity = quantity - $1, updated_at = NOW()
           WHERE id = $2`,
          [quantity, item.id]
        );

        // Record usage
        await client.query(
          `INSERT INTO inventory_usage (
            tenant_id, item_id, quantity_used, unit_cost_cents,
            patient_id, provider_id, encounter_id, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            item.id,
            quantity,
            item.unit_cost_cents,
            patientId,
            providerId,
            encounterId,
            `Procedure: ${procedureType}`,
            userId,
          ]
        );

        // Record transaction
        await client.query(
          `INSERT INTO inventory_transactions (
            tenant_id, item_id, transaction_type, quantity,
            reference_id, reference_type, performed_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            item.id,
            TransactionType.USED,
            -quantity,
            encounterId,
            'encounter',
            userId,
            `Procedure: ${procedureType}`,
          ]
        );

        const itemCost = quantity * item.unit_cost_cents;
        totalCostCents += itemCost;

        itemsDeducted.push({
          itemId: item.id,
          itemName: item.name,
          itemSku: supply.itemSku,
          quantity,
          unitCostCents: item.unit_cost_cents,
          totalCostCents: itemCost,
        });
      }

      await client.query('COMMIT');

      logger.info(`Deducted supplies for procedure ${procedureType}`, {
        tenantId,
        encounterId,
        itemCount: itemsDeducted.length,
        totalCostCents,
      });

      return { itemsDeducted, totalCostCents };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deducting procedure supplies:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // EXPIRATION TRACKING
  // ============================================

  /**
   * Get items/lots approaching or past expiration
   */
  async trackExpiration(tenantId: string, daysThreshold: number = 90): Promise<{
    expiringSoon: any[];
    expired: any[];
  }> {
    try {
      // Get expiring lots
      const expiringResult = await pool.query(
        `SELECT * FROM get_expiring_lots($1, $2)`,
        [tenantId, daysThreshold]
      );

      const expiringSoon = expiringResult.rows.filter(row => row.days_until_expiration > 0);
      const expired = expiringResult.rows.filter(row => row.days_until_expiration <= 0);

      // Also check items without lot tracking
      const itemExpiringResult = await pool.query(
        `SELECT
          id, name, category, expiration_date,
          (expiration_date - CURRENT_DATE) as days_until_expiration,
          quantity
        FROM inventory_items
        WHERE tenant_id = $1
          AND expiration_date IS NOT NULL
          AND expiration_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
          AND quantity > 0
        ORDER BY expiration_date ASC`,
        [tenantId, daysThreshold]
      );

      return {
        expiringSoon: [
          ...expiringSoon.map(row => ({
            type: 'lot',
            ...row,
          })),
          ...itemExpiringResult.rows
            .filter(row => row.days_until_expiration > 0)
            .map(row => ({
              type: 'item',
              itemId: row.id,
              itemName: row.name,
              expirationDate: row.expiration_date,
              daysUntilExpiration: row.days_until_expiration,
              quantity: row.quantity,
            })),
        ],
        expired: [
          ...expired.map(row => ({
            type: 'lot',
            ...row,
          })),
          ...itemExpiringResult.rows
            .filter(row => row.days_until_expiration <= 0)
            .map(row => ({
              type: 'item',
              itemId: row.id,
              itemName: row.name,
              expirationDate: row.expiration_date,
              daysUntilExpiration: row.days_until_expiration,
              quantity: row.quantity,
            })),
        ],
      };
    } catch (error) {
      logger.error('Error tracking expiration:', error);
      throw error;
    }
  }

  /**
   * Mark expired lots and update status
   */
  async processExpiredItems(tenantId: string, userId: string): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update expired lots
      const expiredLots = await client.query(
        `UPDATE inventory_lots l
         SET status = 'expired', updated_at = NOW()
         FROM inventory_items i
         WHERE l.item_id = i.id
           AND i.tenant_id = $1
           AND l.status = 'active'
           AND l.expiration_date < CURRENT_DATE
         RETURNING l.id, l.item_id, l.quantity`,
        [tenantId]
      );

      // Adjust inventory quantities and record transactions
      for (const lot of expiredLots.rows) {
        // Deduct expired quantity from main inventory
        await client.query(
          `UPDATE inventory_items
           SET quantity = quantity - $1, updated_at = NOW()
           WHERE id = $2`,
          [lot.quantity, lot.item_id]
        );

        // Record transaction
        await client.query(
          `INSERT INTO inventory_transactions (
            tenant_id, item_id, lot_id, transaction_type, quantity,
            reference_type, performed_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            lot.item_id,
            lot.id,
            TransactionType.EXPIRED,
            -lot.quantity,
            'system',
            userId,
            'Auto-expired due to expiration date',
          ]
        );
      }

      await client.query('COMMIT');

      logger.info(`Processed ${expiredLots.rowCount} expired lots`, { tenantId });
      return expiredLots.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing expired items:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // MEDICATION SAMPLE MANAGEMENT
  // ============================================

  /**
   * Log medication sample receipt
   */
  async logSampleReceipt(
    tenantId: string,
    sample: {
      drugName: string;
      manufacturer?: string;
      ndcCode?: string;
      lotNumber?: string;
      quantity: number;
      unitSize?: string;
      expirationDate?: string;
      category?: string;
      storageRequirements?: string;
      notes?: string;
    },
    receivedBy: string
  ): Promise<MedicationSample> {
    try {
      const result = await pool.query(
        `INSERT INTO medication_samples (
          tenant_id, drug_name, manufacturer, ndc_code, lot_number,
          quantity, unit_size, expiration_date, category,
          storage_requirements, notes, received_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          tenantId,
          sample.drugName,
          sample.manufacturer || null,
          sample.ndcCode || null,
          sample.lotNumber || null,
          sample.quantity,
          sample.unitSize || null,
          sample.expirationDate || null,
          sample.category || null,
          sample.storageRequirements || null,
          sample.notes || null,
          receivedBy,
        ]
      );

      logger.info(`Logged sample receipt: ${sample.drugName}`, { tenantId, quantity: sample.quantity });

      return this.mapMedicationSample(result.rows[0]);
    } catch (error) {
      logger.error('Error logging sample receipt:', error);
      throw error;
    }
  }

  /**
   * Dispense medication sample to patient
   */
  async dispenseSample(
    tenantId: string,
    sampleId: string,
    patientId: string,
    quantity: number,
    dispensedBy: string,
    options?: {
      consentObtained?: boolean;
      encounterId?: string;
      diagnosisCode?: string;
      notes?: string;
    }
  ): Promise<SampleDispenseLog> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify sample exists and has sufficient quantity
      const sampleResult = await client.query(
        `SELECT id, drug_name, quantity FROM medication_samples
         WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [sampleId, tenantId]
      );

      if (!sampleResult.rowCount) {
        throw new Error('Sample not found or inactive');
      }

      const sample = sampleResult.rows[0];
      if (sample.quantity < quantity) {
        throw new Error(`Insufficient sample quantity: need ${quantity}, have ${sample.quantity}`);
      }

      // Create dispense log (trigger will decrement sample quantity)
      const dispenseResult = await client.query(
        `INSERT INTO sample_dispensing_log (
          tenant_id, sample_id, patient_id, quantity, dispensed_by,
          consent_obtained, consent_date, encounter_id, diagnosis_code, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          tenantId,
          sampleId,
          patientId,
          quantity,
          dispensedBy,
          options?.consentObtained || false,
          options?.consentObtained ? new Date() : null,
          options?.encounterId || null,
          options?.diagnosisCode || null,
          options?.notes || null,
        ]
      );

      // Record transaction
      await client.query(
        `INSERT INTO inventory_transactions (
          tenant_id, item_id, transaction_type, quantity,
          reference_id, reference_type, performed_by, notes
        )
        SELECT $1, NULL, $2, $3, $4, $5, $6, $7`,
        [
          tenantId,
          TransactionType.SAMPLE_DISPENSED,
          -quantity,
          sampleId,
          'sample_dispense',
          dispensedBy,
          `Sample ${sample.drug_name} dispensed to patient`,
        ]
      );

      await client.query('COMMIT');

      logger.info(`Dispensed sample ${sample.drug_name}`, { tenantId, patientId, quantity });

      return this.mapSampleDispenseLog(dispenseResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error dispensing sample:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // EQUIPMENT MANAGEMENT
  // ============================================

  /**
   * Schedule equipment maintenance
   */
  async scheduleEquipmentMaintenance(
    tenantId: string,
    equipmentId: string,
    nextMaintenanceDate: string
  ): Promise<void> {
    try {
      const result = await pool.query(
        `UPDATE equipment
         SET next_maintenance = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, name`,
        [nextMaintenanceDate, equipmentId, tenantId]
      );

      if (!result.rowCount) {
        throw new Error('Equipment not found');
      }

      logger.info(`Scheduled maintenance for ${result.rows[0].name}`, {
        tenantId,
        equipmentId,
        nextMaintenanceDate,
      });
    } catch (error) {
      logger.error('Error scheduling equipment maintenance:', error);
      throw error;
    }
  }

  /**
   * Log equipment maintenance
   */
  async logEquipmentMaintenance(
    tenantId: string,
    equipmentId: string,
    maintenance: {
      maintenanceType: string;
      performedBy: string;
      costCents?: number;
      findings?: string;
      actionsTaken?: string;
      partsReplaced?: string;
      nextScheduled?: string;
      externalTechnician?: string;
      serviceCompany?: string;
      notes?: string;
    }
  ): Promise<EquipmentMaintenanceLog> {
    try {
      // Verify equipment belongs to tenant
      const equipResult = await pool.query(
        `SELECT id FROM equipment WHERE id = $1 AND tenant_id = $2`,
        [equipmentId, tenantId]
      );

      if (!equipResult.rowCount) {
        throw new Error('Equipment not found');
      }

      // Insert maintenance log (trigger will update equipment)
      const result = await pool.query(
        `INSERT INTO equipment_maintenance_log (
          equipment_id, maintenance_type, performed_by, cost_cents,
          findings, actions_taken, parts_replaced, next_scheduled,
          external_technician, service_company, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          equipmentId,
          maintenance.maintenanceType,
          maintenance.performedBy,
          maintenance.costCents || 0,
          maintenance.findings || null,
          maintenance.actionsTaken || null,
          maintenance.partsReplaced || null,
          maintenance.nextScheduled || null,
          maintenance.externalTechnician || null,
          maintenance.serviceCompany || null,
          maintenance.notes || null,
        ]
      );

      logger.info(`Logged maintenance for equipment ${equipmentId}`, { tenantId });

      return this.mapMaintenanceLog(result.rows[0]);
    } catch (error) {
      logger.error('Error logging equipment maintenance:', error);
      throw error;
    }
  }

  /**
   * Get equipment due for maintenance
   */
  async getEquipmentDueMaintenance(tenantId: string, daysThreshold: number = 30): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM get_equipment_due_maintenance($1, $2)`,
        [tenantId, daysThreshold]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting equipment due maintenance:', error);
      throw error;
    }
  }

  // ============================================
  // DASHBOARD & ANALYTICS
  // ============================================

  /**
   * Get comprehensive inventory dashboard
   */
  async getInventoryDashboard(tenantId: string): Promise<{
    summary: any;
    lowStockItems: any[];
    expiringItems: any[];
    pendingOrders: any[];
    equipmentMaintenance: any[];
    recentTransactions: any[];
  }> {
    try {
      // Get summary stats
      const summaryResult = await pool.query(
        `SELECT * FROM get_inventory_dashboard($1)`,
        [tenantId]
      );
      const summary = summaryResult.rows[0];

      // Get low stock items
      const lowStockResult = await pool.query(
        `SELECT * FROM get_reorder_items($1) LIMIT 10`,
        [tenantId]
      );

      // Get expiring items
      const expiringResult = await pool.query(
        `SELECT * FROM get_expiring_lots($1, 90) LIMIT 10`,
        [tenantId]
      );

      // Get pending orders
      const ordersResult = await pool.query(
        `SELECT
          po.id, po.po_number as "poNumber", po.status,
          po.order_date as "orderDate", po.expected_date as "expectedDate",
          po.total_amount_cents as "totalAmountCents",
          v.name as "vendorName"
        FROM purchase_orders po
        JOIN vendors v ON po.vendor_id = v.id
        WHERE po.tenant_id = $1 AND po.status IN ('submitted', 'partial')
        ORDER BY po.expected_date ASC
        LIMIT 10`,
        [tenantId]
      );

      // Get equipment due maintenance
      const maintenanceResult = await pool.query(
        `SELECT * FROM get_equipment_due_maintenance($1, 30) LIMIT 10`,
        [tenantId]
      );

      // Get recent transactions
      const transactionsResult = await pool.query(
        `SELECT
          t.id, t.transaction_type as "transactionType",
          t.quantity, t.created_at as "createdAt",
          t.notes, t.reference_type as "referenceType",
          i.name as "itemName", i.sku as "itemSku"
        FROM inventory_transactions t
        JOIN inventory_items i ON t.item_id = i.id
        WHERE t.tenant_id = $1
        ORDER BY t.created_at DESC
        LIMIT 20`,
        [tenantId]
      );

      return {
        summary: {
          totalItems: parseInt(summary.total_items),
          totalValueCents: parseInt(summary.total_value_cents),
          lowStockCount: parseInt(summary.low_stock_count),
          expiringCount: parseInt(summary.expiring_count),
          pendingOrders: parseInt(summary.pending_orders),
          equipmentMaintenanceDue: parseInt(summary.equipment_maintenance_due),
        },
        lowStockItems: lowStockResult.rows,
        expiringItems: expiringResult.rows,
        pendingOrders: ordersResult.rows,
        equipmentMaintenance: maintenanceResult.rows,
        recentTransactions: transactionsResult.rows,
      };
    } catch (error) {
      logger.error('Error getting inventory dashboard:', error);
      throw error;
    }
  }

  /**
   * Get inventory value by category
   */
  async getInventoryValueByCategory(tenantId: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT
          category,
          COUNT(*) as "itemCount",
          SUM(quantity) as "totalQuantity",
          SUM(quantity * unit_cost_cents) as "totalValueCents"
        FROM inventory_items
        WHERE tenant_id = $1
        GROUP BY category
        ORDER BY "totalValueCents" DESC`,
        [tenantId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting inventory value by category:', error);
      throw error;
    }
  }

  // ============================================
  // LOT MANAGEMENT
  // ============================================

  /**
   * Get lots for an item
   */
  async getItemLots(tenantId: string, itemId: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT
          l.id, l.lot_number as "lotNumber",
          l.expiration_date as "expirationDate",
          l.quantity, l.received_date as "receivedDate",
          l.status, l.created_at as "createdAt"
        FROM inventory_lots l
        JOIN inventory_items i ON l.item_id = i.id
        WHERE i.id = $1 AND i.tenant_id = $2
        ORDER BY l.expiration_date ASC NULLS LAST`,
        [itemId, tenantId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting item lots:', error);
      throw error;
    }
  }

  /**
   * Create or update a lot
   */
  async upsertLot(
    tenantId: string,
    itemId: string,
    lotNumber: string,
    quantity: number,
    expirationDate?: string
  ): Promise<InventoryLot> {
    try {
      // Verify item belongs to tenant
      const itemResult = await pool.query(
        `SELECT id FROM inventory_items WHERE id = $1 AND tenant_id = $2`,
        [itemId, tenantId]
      );

      if (!itemResult.rowCount) {
        throw new Error('Inventory item not found');
      }

      const result = await pool.query(
        `INSERT INTO inventory_lots (item_id, lot_number, expiration_date, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (item_id, lot_number) DO UPDATE
         SET quantity = inventory_lots.quantity + $4, updated_at = NOW()
         RETURNING *`,
        [itemId, lotNumber, expirationDate || null, quantity]
      );

      return this.mapInventoryLot(result.rows[0]);
    } catch (error) {
      logger.error('Error upserting lot:', error);
      throw error;
    }
  }

  /**
   * Update lot status (e.g., expired, depleted, recalled)
   */
  async updateLotStatus(
    tenantId: string,
    lotId: string,
    status: LotStatus
  ): Promise<InventoryLot | null> {
    try {
      const result = await pool.query(
        `UPDATE inventory_lots l
         SET status = $1, updated_at = NOW()
         FROM inventory_items i
         WHERE l.id = $2 AND l.item_id = i.id AND i.tenant_id = $3
         RETURNING l.*`,
        [status, lotId, tenantId]
      );

      if (!result.rowCount) {
        return null;
      }

      logger.info('Lot status updated', { lotId, status, tenantId });
      return this.mapInventoryLot(result.rows[0]);
    } catch (error) {
      logger.error('Error updating lot status:', error);
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private mapPurchaseOrder(row: any): PurchaseOrder {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      vendorId: row.vendor_id,
      poNumber: row.po_number,
      status: row.status,
      orderDate: row.order_date,
      expectedDate: row.expected_date,
      receivedDate: row.received_date,
      totalAmountCents: row.total_amount_cents,
    };
  }

  private mapMedicationSample(row: any): MedicationSample {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      drugName: row.drug_name,
      manufacturer: row.manufacturer,
      ndcCode: row.ndc_code,
      lotNumber: row.lot_number,
      quantity: row.quantity,
      expirationDate: row.expiration_date,
      receivedDate: row.received_date,
      receivedBy: row.received_by,
    };
  }

  private mapSampleDispenseLog(row: any): SampleDispenseLog {
    return {
      id: row.id,
      sampleId: row.sample_id,
      patientId: row.patient_id,
      quantity: row.quantity,
      dispensedBy: row.dispensed_by,
      dispensedAt: row.dispensed_at,
      consentObtained: row.consent_obtained,
    };
  }

  private mapInventoryLot(row: any): InventoryLot {
    return {
      id: row.id,
      itemId: row.item_id,
      lotNumber: row.lot_number,
      expirationDate: row.expiration_date,
      quantity: row.quantity,
      receivedDate: row.received_date,
      status: row.status,
    };
  }

  private mapMaintenanceLog(row: any): EquipmentMaintenanceLog {
    return {
      id: row.id,
      equipmentId: row.equipment_id,
      maintenanceType: row.maintenance_type,
      performedBy: row.performed_by,
      notes: row.notes,
      costCents: row.cost_cents,
      performedAt: row.performed_at,
    };
  }
}

export const inventoryService = new InventoryService();
