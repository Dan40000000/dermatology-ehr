import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { quickPickService } from '../services/quickPickService';
import { logger } from '../lib/logger';

export const quickpicksRouter = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  displayOrder: z.number().int().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
});

const createItemSchema = z.object({
  categoryId: z.string().uuid(),
  code: z.string().min(1).max(20),
  codeType: z.enum(['CPT', 'ICD10']),
  description: z.string().min(1),
  shortName: z.string().max(50).optional(),
});

const createBundleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  items: z.array(z.object({
    code: z.string(),
    codeType: z.enum(['CPT', 'ICD10']),
    description: z.string().optional(),
  })),
});

const addToEncounterSchema = z.object({
  encounterId: z.string().uuid(),
  codes: z.array(z.object({
    code: z.string(),
    codeType: z.enum(['CPT', 'ICD10']),
    description: z.string().optional(),
    isPrimary: z.boolean().optional(),
    modifier: z.string().max(10).optional(),
    units: z.number().int().positive().optional(),
  })),
});

const updateFavoritesSchema = z.object({
  favorites: z.array(z.object({
    itemId: z.string().uuid(),
    isFavorite: z.boolean(),
  })),
});

const setCustomOrderSchema = z.object({
  orderedItems: z.array(z.object({
    itemId: z.string().uuid(),
    order: z.number().int(),
  })),
});

const updateEncounterCodeSchema = z.object({
  isPrimary: z.boolean().optional(),
  modifier: z.string().max(10).optional(),
  units: z.number().int().positive().optional(),
});

// ============================================
// CATEGORY ROUTES
// ============================================

/**
 * @swagger
 * /api/quickpicks/categories:
 *   get:
 *     summary: Get all quick pick categories
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of categories
 */
quickpicksRouter.get('/categories', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const categories = await quickPickService.getCategories(tenantId);
    res.json({ categories });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * @swagger
 * /api/quickpicks/categories:
 *   post:
 *     summary: Create a new category
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/categories', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const category = await quickPickService.createCategory(tenantId, parsed.data);
    res.status(201).json({ category });
  } catch (error) {
    logger.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ============================================
// QUICK PICK ITEM ROUTES
// ============================================

/**
 * @swagger
 * /api/quickpicks:
 *   get:
 *     summary: Get all quick picks with optional filtering
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: codeType
 *         schema:
 *           type: string
 *           enum: [CPT, ICD10]
 *         description: Filter by code type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: favoritesOnly
 *         schema:
 *           type: boolean
 *         description: Only return favorites
 */
quickpicksRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    // Use user ID as provider ID for provider-specific preferences
    const providerId = req.user!.id;

    const filters = {
      category: req.query.category as string | undefined,
      codeType: req.query.codeType as 'CPT' | 'ICD10' | undefined,
      search: req.query.search as string | undefined,
      favoritesOnly: req.query.favoritesOnly === 'true',
    };

    const items = await quickPickService.getQuickPicks(tenantId, providerId, filters);
    res.json({ items });
  } catch (error) {
    logger.error('Error fetching quick picks:', error);
    res.status(500).json({ error: 'Failed to fetch quick picks' });
  }
});

/**
 * @swagger
 * /api/quickpicks/search:
 *   get:
 *     summary: Search all codes
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.get('/search', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const codeType = req.query.codeType as 'CPT' | 'ICD10' | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const results = await quickPickService.searchCodes(tenantId, query, codeType, limit);
    res.json({ results });
  } catch (error) {
    logger.error('Error searching codes:', error);
    res.status(500).json({ error: 'Failed to search codes' });
  }
});

/**
 * @swagger
 * /api/quickpicks:
 *   post:
 *     summary: Create a new quick pick item
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const item = await quickPickService.createQuickPickItem(tenantId, parsed.data);
    res.status(201).json({ item });
  } catch (error) {
    logger.error('Error creating quick pick item:', error);
    res.status(500).json({ error: 'Failed to create quick pick item' });
  }
});

/**
 * @swagger
 * /api/quickpicks/use/{itemId}:
 *   post:
 *     summary: Record usage of a quick pick item
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/use/:itemId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;
    const itemId = req.params.itemId as string;

    await quickPickService.recordUsage(tenantId, itemId, providerId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error recording usage:', error);
    res.status(500).json({ error: 'Failed to record usage' });
  }
});

/**
 * @swagger
 * /api/quickpicks/top:
 *   get:
 *     summary: Get most frequently used codes for the provider
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.get('/top', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;

    const codeType = req.query.codeType as 'CPT' | 'ICD10' | undefined;
    const limit = parseInt(req.query.limit as string) || 10;

    const items = await quickPickService.getTopCodes(tenantId, providerId, codeType, limit);
    res.json({ items });
  } catch (error) {
    logger.error('Error fetching top codes:', error);
    res.status(500).json({ error: 'Failed to fetch top codes' });
  }
});

// ============================================
// FAVORITES ROUTES
// ============================================

/**
 * @swagger
 * /api/quickpicks/favorites:
 *   put:
 *     summary: Update provider favorites
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.put('/favorites', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateFavoritesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;

    await quickPickService.updateFavorites(tenantId, providerId, parsed.data.favorites);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating favorites:', error);
    res.status(500).json({ error: 'Failed to update favorites' });
  }
});

// ============================================
// BUNDLE ROUTES
// ============================================

/**
 * @swagger
 * /api/quickpicks/bundles:
 *   get:
 *     summary: Get all code bundles
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.get('/bundles', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const bundles = await quickPickService.getBundles(tenantId);
    res.json({ bundles });
  } catch (error) {
    logger.error('Error fetching bundles:', error);
    res.status(500).json({ error: 'Failed to fetch bundles' });
  }
});

/**
 * @swagger
 * /api/quickpicks/bundles:
 *   post:
 *     summary: Create a new code bundle
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/bundles', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  try {
    const parsed = createBundleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const bundle = await quickPickService.createBundle(tenantId, userId, parsed.data);
    res.status(201).json({ bundle });
  } catch (error) {
    logger.error('Error creating bundle:', error);
    res.status(500).json({ error: 'Failed to create bundle' });
  }
});

/**
 * @swagger
 * /api/quickpicks/bundles/{bundleId}/apply:
 *   post:
 *     summary: Apply a bundle to an encounter
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/bundles/:bundleId/apply', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const bundleId = req.params.bundleId as string;
    const { encounterId } = req.body;

    if (!encounterId) {
      return res.status(400).json({ error: 'Encounter ID is required' });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const codes = await quickPickService.applyBundle(tenantId, bundleId, encounterId as string, userId);
    res.json({ codes });
  } catch (error) {
    logger.error('Error applying bundle:', error);
    res.status(500).json({ error: 'Failed to apply bundle' });
  }
});

// ============================================
// ENCOUNTER CODE ROUTES
// ============================================

/**
 * @swagger
 * /api/quickpicks/encounter/{encounterId}:
 *   get:
 *     summary: Get codes for an encounter
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.get('/encounter/:encounterId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const encounterId = req.params.encounterId as string;

    const codes = await quickPickService.getEncounterCodes(tenantId, encounterId);
    res.json({ codes });
  } catch (error) {
    logger.error('Error fetching encounter codes:', error);
    res.status(500).json({ error: 'Failed to fetch encounter codes' });
  }
});

/**
 * @swagger
 * /api/quickpicks/encounter:
 *   post:
 *     summary: Add codes to an encounter
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/encounter', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const parsed = addToEncounterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const codes = await quickPickService.addToEncounter(
      tenantId,
      parsed.data.encounterId,
      parsed.data.codes,
      userId
    );

    res.status(201).json({ codes });
  } catch (error) {
    logger.error('Error adding codes to encounter:', error);
    res.status(500).json({ error: 'Failed to add codes to encounter' });
  }
});

/**
 * @swagger
 * /api/quickpicks/encounter/code/{codeId}:
 *   put:
 *     summary: Update an encounter code
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.put('/encounter/code/:codeId', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const parsed = updateEncounterCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const codeId = req.params.codeId as string;

    const code = await quickPickService.updateEncounterCode(tenantId, codeId, parsed.data);

    if (!code) {
      return res.status(404).json({ error: 'Code not found' });
    }

    res.json({ code });
  } catch (error) {
    logger.error('Error updating encounter code:', error);
    res.status(500).json({ error: 'Failed to update encounter code' });
  }
});

/**
 * @swagger
 * /api/quickpicks/encounter/code/{codeId}:
 *   delete:
 *     summary: Remove a code from an encounter
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.delete('/encounter/code/:codeId', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const codeId = req.params.codeId as string;

    await quickPickService.removeFromEncounter(tenantId, codeId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing code from encounter:', error);
    res.status(500).json({ error: 'Failed to remove code from encounter' });
  }
});

// ============================================
// PROVIDER PREFERENCE ROUTES
// ============================================

/**
 * @swagger
 * /api/quickpicks/hide/{itemId}:
 *   post:
 *     summary: Hide a quick pick for the current provider
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/hide/:itemId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;
    const itemId = req.params.itemId as string;

    await quickPickService.hideQuickPick(tenantId, providerId, itemId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error hiding quick pick:', error);
    res.status(500).json({ error: 'Failed to hide quick pick' });
  }
});

/**
 * @swagger
 * /api/quickpicks/unhide/{itemId}:
 *   post:
 *     summary: Unhide a quick pick for the current provider
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/unhide/:itemId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;
    const itemId = req.params.itemId as string;

    await quickPickService.unhideQuickPick(tenantId, providerId, itemId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error unhiding quick pick:', error);
    res.status(500).json({ error: 'Failed to unhide quick pick' });
  }
});

/**
 * @swagger
 * /api/quickpicks/order:
 *   put:
 *     summary: Set custom order for provider's quick picks
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.put('/order', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = setCustomOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;

    await quickPickService.setCustomOrder(tenantId, providerId, parsed.data.orderedItems);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error setting custom order:', error);
    res.status(500).json({ error: 'Failed to set custom order' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * @swagger
 * /api/quickpicks/seed:
 *   post:
 *     summary: Seed quick pick data for the tenant
 *     tags: [QuickPicks]
 *     security:
 *       - bearerAuth: []
 */
quickpicksRouter.post('/seed', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    await quickPickService.seedQuickPickData(tenantId);
    res.json({ success: true, message: 'Quick pick data seeded successfully' });
  } catch (error) {
    logger.error('Error seeding quick pick data:', error);
    res.status(500).json({ error: 'Failed to seed quick pick data' });
  }
});
