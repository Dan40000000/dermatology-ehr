import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import * as productSalesService from "../services/productSalesService";

const productCategorySchema = z.enum(['skincare', 'sunscreen', 'cosmetic', 'prescription', 'post_procedure']);
const paymentMethodSchema = z.enum(['cash', 'credit', 'debit', 'check', 'insurance', 'gift_card']);
const transactionTypeSchema = z.enum(['received', 'sold', 'adjustment', 'return', 'damaged', 'expired']);
const discountTypeSchema = z.enum(['percentage', 'fixed', 'loyalty']);

const createProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: productCategorySchema,
  brand: z.string().max(255).optional(),
  price: z.number().int().min(0),
  cost: z.number().int().min(0).optional(),
  inventoryCount: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
  barcode: z.string().max(100).optional(),
});

const updateProductSchema = z.object({
  sku: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: productCategorySchema.optional(),
  brand: z.string().max(255).optional(),
  price: z.number().int().min(0).optional(),
  cost: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  imageUrl: z.string().url().optional(),
  barcode: z.string().max(100).optional(),
});

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().int().min(0).optional(),
  discountAmount: z.number().int().min(0).optional(),
});

const createSaleSchema = z.object({
  patientId: z.string(),
  encounterId: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
  paymentMethod: paymentMethodSchema,
  paymentReference: z.string().optional(),
  discountAmount: z.number().int().min(0).optional(),
});

const adjustInventorySchema = z.object({
  quantity: z.number().int(),
  reason: transactionTypeSchema,
  notes: z.string().optional(),
});

const applyDiscountSchema = z.object({
  discountType: discountTypeSchema,
  amount: z.number().min(0),
});

export const productsRouter = Router();

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: List all products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [skincare, sunscreen, cosmetic, prescription, post_procedure]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: lowStockOnly
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of products
 */
productsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { category, isActive, search, lowStockOnly } = req.query;

    const products = await productSalesService.getProducts(tenantId, {
      category: category as productSalesService.ProductCategory | undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search: search as string | undefined,
      lowStockOnly: lowStockOnly === 'true',
    });

    res.json({ products });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch products' });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get a single product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
productsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const product = await productSalesService.getProduct(tenantId, id as string);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch product' });
  }
});

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sku
 *               - name
 *               - category
 *               - price
 *     responses:
 *       201:
 *         description: Product created
 */
productsRouter.post("/", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const product = await productSalesService.createProduct(tenantId, parsed.data, userId);

    res.status(201).json({ product });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A product with this SKU already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to create product' });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product updated
 */
productsRouter.put("/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const product = await productSalesService.updateProduct(tenantId, id as string, parsed.data);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A product with this SKU already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to update product' });
  }
});

/**
 * @swagger
 * /api/products/sales:
 *   post:
 *     summary: Create a new sale
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - items
 *               - paymentMethod
 *     responses:
 *       201:
 *         description: Sale created
 */
productsRouter.post("/sales", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const soldBy = req.user!.id;
    const { patientId, encounterId, items, paymentMethod, paymentReference, discountAmount } = parsed.data;

    const sale = await productSalesService.createSale(
      tenantId,
      patientId,
      items,
      { method: paymentMethod, reference: paymentReference },
      soldBy,
      encounterId,
      discountAmount
    );

    res.status(201).json({ sale });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create sale' });
  }
});

/**
 * @swagger
 * /api/products/sales/{id}:
 *   get:
 *     summary: Get sale details
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sale details
 */
productsRouter.get("/sales/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const sale = await productSalesService.getSale(tenantId, id as string);

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json({ sale });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch sale' });
  }
});

/**
 * @swagger
 * /api/products/sales/{id}/discount:
 *   post:
 *     summary: Apply discount to a sale
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - discountType
 *               - amount
 *     responses:
 *       200:
 *         description: Discount applied
 */
productsRouter.post("/sales/:id/discount", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = applyDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { discountType, amount } = parsed.data;

    const sale = await productSalesService.applyDiscount(tenantId, id as string, discountType, amount);

    res.json({ sale });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to apply discount' });
  }
});

/**
 * @swagger
 * /api/products/recommendations/{diagnosisCode}:
 *   get:
 *     summary: Get product recommendations for a diagnosis
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: diagnosisCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product recommendations
 */
productsRouter.get("/recommendations/:diagnosisCode", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { diagnosisCode } = req.params;

    const recommendations = await productSalesService.getProductRecommendations(
      tenantId,
      [diagnosisCode as string]
    );

    res.json({ recommendations });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch recommendations' });
  }
});

/**
 * @swagger
 * /api/products/recommendations:
 *   post:
 *     summary: Get product recommendations for multiple diagnoses
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - diagnosisCodes
 *             properties:
 *               diagnosisCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Product recommendations
 */
productsRouter.post("/recommendations", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { diagnosisCodes } = req.body;

    if (!Array.isArray(diagnosisCodes) || diagnosisCodes.length === 0) {
      return res.status(400).json({ error: 'diagnosisCodes array is required' });
    }

    const recommendations = await productSalesService.getProductRecommendations(
      tenantId,
      diagnosisCodes
    );

    res.json({ recommendations });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch recommendations' });
  }
});

/**
 * @swagger
 * /api/products/inventory:
 *   get:
 *     summary: Get inventory status
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Inventory status summary
 */
productsRouter.get("/inventory/status", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const status = await productSalesService.getInventoryStatus(tenantId);

    res.json({ status });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch inventory status' });
  }
});

/**
 * @swagger
 * /api/products/inventory/low-stock:
 *   get:
 *     summary: Get low stock products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of low stock products
 */
productsRouter.get("/inventory/low-stock", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const products = await productSalesService.getLowStockProducts(tenantId);

    res.json({ products });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch low stock products' });
  }
});

/**
 * @swagger
 * /api/products/{id}/inventory:
 *   put:
 *     summary: Adjust product inventory
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *               - reason
 *     responses:
 *       200:
 *         description: Inventory adjusted
 */
productsRouter.put("/:id/inventory", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = adjustInventorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const { quantity, reason, notes } = parsed.data;

    const result = await productSalesService.adjustInventory(
      tenantId,
      id as string,
      quantity,
      reason,
      notes,
      userId
    );

    res.json({ newCount: result.newCount });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to adjust inventory' });
  }
});

/**
 * @swagger
 * /api/products/sales/report:
 *   get:
 *     summary: Get sales report
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [skincare, sunscreen, cosmetic, prescription, post_procedure]
 *       - in: query
 *         name: soldBy
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sales report
 */
productsRouter.get("/sales/report", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { startDate, endDate, category, soldBy } = req.query;

    const report = await productSalesService.getSalesReport(tenantId, {
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      category: category as productSalesService.ProductCategory | undefined,
      soldBy: soldBy as string | undefined,
    });

    res.json({ report });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate sales report' });
  }
});

/**
 * @swagger
 * /api/products/patients/{patientId}/sales:
 *   get:
 *     summary: Get sales for a patient
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of patient sales
 */
productsRouter.get("/patients/:patientId/sales", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId } = req.params;

    const sales = await productSalesService.getPatientSales(tenantId, patientId as string);

    res.json({ sales });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch patient sales' });
  }
});
