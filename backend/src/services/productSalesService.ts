import crypto from "crypto";
import { pool } from "../db/pool";

// Types
export type ProductCategory = 'skincare' | 'sunscreen' | 'cosmetic' | 'prescription' | 'post_procedure';
export type PaymentMethod = 'cash' | 'credit' | 'debit' | 'check' | 'insurance' | 'gift_card';
export type SaleStatus = 'pending' | 'completed' | 'refunded' | 'cancelled';
export type TransactionType = 'received' | 'sold' | 'adjustment' | 'return' | 'damaged' | 'expired';
export type DiscountType = 'percentage' | 'fixed' | 'loyalty';

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description?: string;
  category: ProductCategory;
  brand?: string;
  price: number; // in cents
  cost: number; // in cents
  inventoryCount: number;
  reorderPoint: number;
  isActive: boolean;
  imageUrl?: string;
  barcode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  quantity: number;
  unitPrice?: number; // Override price if needed
  discountAmount?: number;
}

export interface PaymentInfo {
  method: PaymentMethod;
  reference?: string;
}

export interface Sale {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string;
  soldBy: string;
  saleDate: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  status: SaleStatus;
  items?: SaleItemDetail[];
  patientFirstName?: string;
  patientLastName?: string;
}

export interface SaleItemDetail {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  productName: string;
  productSku: string;
}

export interface ProductRecommendation {
  id: string;
  tenantId: string;
  conditionCode: string;
  conditionDescription?: string;
  productIds: string[];
  recommendationText?: string;
  priority: number;
  isActive: boolean;
  products?: Product[];
}

export interface SalesReportFilters {
  startDate?: string;
  endDate?: string;
  category?: ProductCategory;
  soldBy?: string;
}

export interface SalesReport {
  totalSales: number;
  totalRevenue: number;
  totalDiscounts: number;
  totalTax: number;
  uniqueCustomers: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
  salesByCategory: Array<{
    category: ProductCategory;
    count: number;
    revenue: number;
  }>;
  dailySales: Array<{
    date: string;
    count: number;
    revenue: number;
  }>;
}

// Tax rate (configurable per tenant in production)
const DEFAULT_TAX_RATE = 0.0825; // 8.25%

/**
 * Create a new product sale
 */
export async function createSale(
  tenantId: string,
  patientId: string,
  items: SaleItem[],
  paymentInfo: PaymentInfo,
  soldBy: string,
  encounterId?: string,
  discountAmount?: number
): Promise<Sale> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const saleId = crypto.randomUUID();
    let subtotal = 0;
    const saleItems: SaleItemDetail[] = [];

    // Validate and calculate items
    for (const item of items) {
      // Get product info
      const productResult = await client.query(
        `SELECT id, sku, name, price, inventory_count, is_active
         FROM products
         WHERE id = $1 AND tenant_id = $2`,
        [item.productId, tenantId]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const product = productResult.rows[0];

      if (!product.is_active) {
        throw new Error(`Product is not active: ${product.name}`);
      }

      if (product.inventory_count < item.quantity) {
        throw new Error(`Insufficient inventory for ${product.name}: only ${product.inventory_count} available`);
      }

      const unitPrice = item.unitPrice ?? product.price;
      const itemDiscount = item.discountAmount ?? 0;
      const lineTotal = (unitPrice * item.quantity) - itemDiscount;

      subtotal += lineTotal;

      saleItems.push({
        id: crypto.randomUUID(),
        saleId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        discountAmount: itemDiscount,
        lineTotal,
        productName: product.name,
        productSku: product.sku,
      });
    }

    // Calculate totals
    const saleDiscount = discountAmount ?? 0;
    const taxableAmount = subtotal - saleDiscount;
    const tax = Math.round(taxableAmount * DEFAULT_TAX_RATE);
    const total = taxableAmount + tax;

    // Create sale record
    await client.query(
      `INSERT INTO product_sales (
        id, tenant_id, patient_id, encounter_id, sold_by,
        sale_date, subtotal, tax, discount, total,
        payment_method, payment_reference, status
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, 'completed')`,
      [
        saleId,
        tenantId,
        patientId,
        encounterId || null,
        soldBy,
        subtotal,
        tax,
        saleDiscount,
        total,
        paymentInfo.method,
        paymentInfo.reference || null,
      ]
    );

    // Create sale items (triggers will update inventory)
    for (const item of saleItems) {
      await client.query(
        `INSERT INTO product_sale_items (
          id, sale_id, product_id, quantity, unit_price,
          discount_amount, line_total, product_name, product_sku
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.id,
          saleId,
          item.productId,
          item.quantity,
          item.unitPrice,
          item.discountAmount,
          item.lineTotal,
          item.productName,
          item.productSku,
        ]
      );
    }

    await client.query('COMMIT');

    return {
      id: saleId,
      tenantId,
      patientId,
      encounterId,
      soldBy,
      saleDate: new Date().toISOString(),
      subtotal,
      tax,
      discount: saleDiscount,
      total,
      paymentMethod: paymentInfo.method,
      paymentReference: paymentInfo.reference,
      status: 'completed',
      items: saleItems,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get product recommendations based on diagnosis codes
 */
export async function getProductRecommendations(
  tenantId: string,
  diagnosisCodes: string[]
): Promise<ProductRecommendation[]> {
  if (!diagnosisCodes || diagnosisCodes.length === 0) {
    return [];
  }

  // Get recommendations for the given diagnosis codes
  const result = await pool.query(
    `SELECT
      pr.id,
      pr.tenant_id as "tenantId",
      pr.condition_code as "conditionCode",
      pr.condition_description as "conditionDescription",
      pr.product_ids as "productIds",
      pr.recommendation_text as "recommendationText",
      pr.priority,
      pr.is_active as "isActive"
    FROM product_recommendations pr
    WHERE pr.tenant_id = $1
      AND pr.condition_code = ANY($2)
      AND pr.is_active = true
    ORDER BY pr.priority ASC`,
    [tenantId, diagnosisCodes]
  );

  const recommendations = result.rows as ProductRecommendation[];

  // Fetch product details for each recommendation
  for (const rec of recommendations) {
    if (rec.productIds && rec.productIds.length > 0) {
      const productsResult = await pool.query(
        `SELECT
          id, tenant_id as "tenantId", sku, name, description,
          category, brand, price, cost, inventory_count as "inventoryCount",
          reorder_point as "reorderPoint", is_active as "isActive",
          image_url as "imageUrl", barcode
        FROM products
        WHERE id = ANY($1)
          AND tenant_id = $2
          AND is_active = true
        ORDER BY name`,
        [rec.productIds, tenantId]
      );
      rec.products = productsResult.rows;
    }
  }

  return recommendations;
}

/**
 * Adjust inventory for a product
 */
export async function adjustInventory(
  tenantId: string,
  productId: string,
  quantity: number,
  reason: TransactionType,
  notes?: string,
  userId?: string
): Promise<{ newCount: number }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update inventory count
    const updateResult = await client.query(
      `UPDATE products
       SET inventory_count = inventory_count + $1,
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING inventory_count`,
      [quantity, productId, tenantId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const newCount = updateResult.rows[0].inventory_count;

    if (newCount < 0) {
      throw new Error('Adjustment would result in negative inventory');
    }

    // Log the transaction
    await client.query(
      `INSERT INTO product_inventory_transactions (
        tenant_id, product_id, transaction_type, quantity, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, productId, reason, quantity, notes || null, userId || null]
    );

    await client.query('COMMIT');

    return { newCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get products with low stock
 */
export async function getLowStockProducts(tenantId: string): Promise<Product[]> {
  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"
    FROM products
    WHERE tenant_id = $1
      AND inventory_count <= reorder_point
      AND is_active = true
    ORDER BY inventory_count ASC`,
    [tenantId]
  );

  return result.rows;
}

/**
 * Get sales report with analytics
 */
export async function getSalesReport(
  tenantId: string,
  filters: SalesReportFilters
): Promise<SalesReport> {
  const { startDate, endDate, category, soldBy } = filters;

  // Build date filter
  const dateConditions: string[] = [];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (startDate) {
    dateConditions.push(`ps.sale_date >= $${paramIndex}::timestamp`);
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    dateConditions.push(`ps.sale_date <= $${paramIndex}::timestamp`);
    params.push(endDate);
    paramIndex++;
  }

  if (soldBy) {
    dateConditions.push(`ps.sold_by = $${paramIndex}`);
    params.push(soldBy);
    paramIndex++;
  }

  const dateFilter = dateConditions.length > 0
    ? `AND ${dateConditions.join(' AND ')}`
    : '';

  // Summary stats
  const summaryResult = await pool.query(
    `SELECT
      COUNT(DISTINCT ps.id) as total_sales,
      COALESCE(SUM(ps.total), 0) as total_revenue,
      COALESCE(SUM(ps.discount), 0) as total_discounts,
      COALESCE(SUM(ps.tax), 0) as total_tax,
      COUNT(DISTINCT ps.patient_id) as unique_customers
    FROM product_sales ps
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${dateFilter}`,
    params
  );

  const summary = summaryResult.rows[0];

  // Top products
  const topProductsResult = await pool.query(
    `SELECT
      psi.product_id as "productId",
      psi.product_name as "productName",
      SUM(psi.quantity) as "quantitySold",
      SUM(psi.line_total) as "revenue"
    FROM product_sale_items psi
    JOIN product_sales ps ON psi.sale_id = ps.id
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${dateFilter}
    GROUP BY psi.product_id, psi.product_name
    ORDER BY "quantitySold" DESC
    LIMIT 10`,
    params
  );

  // Sales by category
  let categoryParams = [...params];
  let categoryFilter = dateFilter;

  if (category) {
    categoryFilter += ` AND p.category = $${paramIndex}`;
    categoryParams.push(category);
  }

  const categoryResult = await pool.query(
    `SELECT
      p.category,
      COUNT(DISTINCT ps.id) as count,
      COALESCE(SUM(psi.line_total), 0) as revenue
    FROM product_sale_items psi
    JOIN product_sales ps ON psi.sale_id = ps.id
    JOIN products p ON psi.product_id = p.id
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${categoryFilter}
    GROUP BY p.category
    ORDER BY revenue DESC`,
    categoryParams
  );

  // Daily sales
  const dailyResult = await pool.query(
    `SELECT
      DATE(ps.sale_date) as date,
      COUNT(DISTINCT ps.id) as count,
      COALESCE(SUM(ps.total), 0) as revenue
    FROM product_sales ps
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${dateFilter}
    GROUP BY DATE(ps.sale_date)
    ORDER BY date DESC
    LIMIT 30`,
    params
  );

  return {
    totalSales: parseInt(summary.total_sales) || 0,
    totalRevenue: parseInt(summary.total_revenue) || 0,
    totalDiscounts: parseInt(summary.total_discounts) || 0,
    totalTax: parseInt(summary.total_tax) || 0,
    uniqueCustomers: parseInt(summary.unique_customers) || 0,
    topProducts: topProductsResult.rows.map(row => ({
      productId: row.productId,
      productName: row.productName,
      quantitySold: parseInt(row.quantitySold) || 0,
      revenue: parseInt(row.revenue) || 0,
    })),
    salesByCategory: categoryResult.rows.map(row => ({
      category: row.category as ProductCategory,
      count: parseInt(row.count) || 0,
      revenue: parseInt(row.revenue) || 0,
    })),
    dailySales: dailyResult.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count) || 0,
      revenue: parseInt(row.revenue) || 0,
    })),
  };
}

/**
 * Apply discount to a pending sale
 */
export async function applyDiscount(
  tenantId: string,
  saleId: string,
  discountType: DiscountType,
  amount: number
): Promise<Sale> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current sale
    const saleResult = await client.query(
      `SELECT * FROM product_sales
       WHERE id = $1 AND tenant_id = $2`,
      [saleId, tenantId]
    );

    if (saleResult.rows.length === 0) {
      throw new Error('Sale not found');
    }

    const sale = saleResult.rows[0];

    if (sale.status !== 'pending') {
      throw new Error('Can only apply discount to pending sales');
    }

    // Calculate new discount
    let newDiscount = 0;

    switch (discountType) {
      case 'percentage':
        newDiscount = Math.round(sale.subtotal * (amount / 100));
        break;
      case 'fixed':
        newDiscount = amount;
        break;
      case 'loyalty':
        // Loyalty discount: 10% for amount >= 100 points, 5% otherwise
        const loyaltyRate = amount >= 100 ? 0.10 : 0.05;
        newDiscount = Math.round(sale.subtotal * loyaltyRate);
        break;
    }

    // Ensure discount doesn't exceed subtotal
    newDiscount = Math.min(newDiscount, sale.subtotal);

    // Recalculate totals
    const taxableAmount = sale.subtotal - newDiscount;
    const newTax = Math.round(taxableAmount * DEFAULT_TAX_RATE);
    const newTotal = taxableAmount + newTax;

    // Update sale
    await client.query(
      `UPDATE product_sales
       SET discount = $1, tax = $2, total = $3, updated_at = NOW()
       WHERE id = $4`,
      [newDiscount, newTax, newTotal, saleId]
    );

    await client.query('COMMIT');

    // Get updated sale
    const updatedResult = await client.query(
      `SELECT
        ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
        ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
        ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
        ps.total, ps.payment_method as "paymentMethod",
        ps.payment_reference as "paymentReference", ps.status,
        p.first_name as "patientFirstName", p.last_name as "patientLastName"
      FROM product_sales ps
      LEFT JOIN patients p ON ps.patient_id = p.id
      WHERE ps.id = $1`,
      [saleId]
    );

    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all products
 */
export async function getProducts(
  tenantId: string,
  options?: {
    category?: ProductCategory;
    isActive?: boolean;
    search?: string;
    lowStockOnly?: boolean;
  }
): Promise<Product[]> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options?.category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(options.category);
    paramIndex++;
  }

  if (options?.isActive !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    params.push(options.isActive);
    paramIndex++;
  }

  if (options?.search) {
    conditions.push(`(name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR brand ILIKE $${paramIndex})`);
    params.push(`%${options.search}%`);
    paramIndex++;
  }

  if (options?.lowStockOnly) {
    conditions.push('inventory_count <= reorder_point');
  }

  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"
    FROM products
    WHERE ${conditions.join(' AND ')}
    ORDER BY name ASC`,
    params
  );

  return result.rows;
}

/**
 * Get a single product by ID
 */
export async function getProduct(
  tenantId: string,
  productId: string
): Promise<Product | null> {
  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"
    FROM products
    WHERE id = $1 AND tenant_id = $2`,
    [productId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * Create a new product
 */
export async function createProduct(
  tenantId: string,
  data: {
    sku: string;
    name: string;
    description?: string;
    category: ProductCategory;
    brand?: string;
    price: number;
    cost?: number;
    inventoryCount?: number;
    reorderPoint?: number;
    imageUrl?: string;
    barcode?: string;
  },
  createdBy?: string
): Promise<Product> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO products (
      id, tenant_id, sku, name, description, category, brand,
      price, cost, inventory_count, reorder_point, is_active,
      image_url, barcode, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13, $14)
    RETURNING
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"`,
    [
      id,
      tenantId,
      data.sku,
      data.name,
      data.description || null,
      data.category,
      data.brand || null,
      data.price,
      data.cost || 0,
      data.inventoryCount || 0,
      data.reorderPoint || 10,
      data.imageUrl || null,
      data.barcode || null,
      createdBy || null,
    ]
  );

  return result.rows[0];
}

/**
 * Update a product
 */
export async function updateProduct(
  tenantId: string,
  productId: string,
  data: Partial<{
    sku: string;
    name: string;
    description: string;
    category: ProductCategory;
    brand: string;
    price: number;
    cost: number;
    reorderPoint: number;
    isActive: boolean;
    imageUrl: string;
    barcode: string;
  }>
): Promise<Product | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.sku !== undefined) {
    updates.push(`sku = $${paramCount++}`);
    values.push(data.sku);
  }
  if (data.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(data.description);
  }
  if (data.category !== undefined) {
    updates.push(`category = $${paramCount++}`);
    values.push(data.category);
  }
  if (data.brand !== undefined) {
    updates.push(`brand = $${paramCount++}`);
    values.push(data.brand);
  }
  if (data.price !== undefined) {
    updates.push(`price = $${paramCount++}`);
    values.push(data.price);
  }
  if (data.cost !== undefined) {
    updates.push(`cost = $${paramCount++}`);
    values.push(data.cost);
  }
  if (data.reorderPoint !== undefined) {
    updates.push(`reorder_point = $${paramCount++}`);
    values.push(data.reorderPoint);
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.isActive);
  }
  if (data.imageUrl !== undefined) {
    updates.push(`image_url = $${paramCount++}`);
    values.push(data.imageUrl);
  }
  if (data.barcode !== undefined) {
    updates.push(`barcode = $${paramCount++}`);
    values.push(data.barcode);
  }

  if (updates.length === 0) {
    return getProduct(tenantId, productId);
  }

  updates.push('updated_at = NOW()');
  values.push(productId, tenantId);

  const result = await pool.query(
    `UPDATE products
     SET ${updates.join(', ')}
     WHERE id = $${paramCount++} AND tenant_id = $${paramCount}
     RETURNING
       id, tenant_id as "tenantId", sku, name, description,
       category, brand, price, cost, inventory_count as "inventoryCount",
       reorder_point as "reorderPoint", is_active as "isActive",
       image_url as "imageUrl", barcode,
       created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Get sales for a patient
 */
export async function getPatientSales(
  tenantId: string,
  patientId: string
): Promise<Sale[]> {
  const result = await pool.query(
    `SELECT
      ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
      ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
      ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
      ps.total, ps.payment_method as "paymentMethod",
      ps.payment_reference as "paymentReference", ps.status,
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    FROM product_sales ps
    LEFT JOIN patients p ON ps.patient_id = p.id
    WHERE ps.tenant_id = $1 AND ps.patient_id = $2
    ORDER BY ps.sale_date DESC`,
    [tenantId, patientId]
  );

  return result.rows;
}

/**
 * Get sale by ID with items
 */
export async function getSale(
  tenantId: string,
  saleId: string
): Promise<Sale | null> {
  const saleResult = await pool.query(
    `SELECT
      ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
      ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
      ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
      ps.total, ps.payment_method as "paymentMethod",
      ps.payment_reference as "paymentReference", ps.status,
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    FROM product_sales ps
    LEFT JOIN patients p ON ps.patient_id = p.id
    WHERE ps.id = $1 AND ps.tenant_id = $2`,
    [saleId, tenantId]
  );

  if (saleResult.rows.length === 0) {
    return null;
  }

  const sale = saleResult.rows[0] as Sale;

  // Get sale items
  const itemsResult = await pool.query(
    `SELECT
      id, sale_id as "saleId", product_id as "productId",
      quantity, unit_price as "unitPrice", discount_amount as "discountAmount",
      line_total as "lineTotal", product_name as "productName",
      product_sku as "productSku"
    FROM product_sale_items
    WHERE sale_id = $1
    ORDER BY product_name`,
    [saleId]
  );

  sale.items = itemsResult.rows;

  return sale;
}

/**
 * Get inventory status summary
 */
export async function getInventoryStatus(tenantId: string): Promise<{
  totalProducts: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  byCategory: Array<{
    category: ProductCategory;
    count: number;
    value: number;
  }>;
}> {
  const summaryResult = await pool.query(
    `SELECT
      COUNT(*) as total_products,
      COALESCE(SUM(inventory_count * cost), 0) as total_value,
      COUNT(*) FILTER (WHERE inventory_count <= reorder_point AND inventory_count > 0) as low_stock_count,
      COUNT(*) FILTER (WHERE inventory_count = 0) as out_of_stock_count
    FROM products
    WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );

  const categoryResult = await pool.query(
    `SELECT
      category,
      COUNT(*) as count,
      COALESCE(SUM(inventory_count * cost), 0) as value
    FROM products
    WHERE tenant_id = $1 AND is_active = true
    GROUP BY category
    ORDER BY category`,
    [tenantId]
  );

  const summary = summaryResult.rows[0];

  return {
    totalProducts: parseInt(summary.total_products) || 0,
    totalValue: parseInt(summary.total_value) || 0,
    lowStockCount: parseInt(summary.low_stock_count) || 0,
    outOfStockCount: parseInt(summary.out_of_stock_count) || 0,
    byCategory: categoryResult.rows.map(row => ({
      category: row.category as ProductCategory,
      count: parseInt(row.count) || 0,
      value: parseInt(row.value) || 0,
    })),
  };
}
