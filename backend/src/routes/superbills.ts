import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { superbillService, SuperbillStatus } from "../services/superbillService";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";

export const superbillsRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logSuperbillsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// Schema for adding/updating line items
const lineItemSchema = z.object({
  cptCode: z.string().min(3).max(10),
  description: z.string().optional(),
  icd10Codes: z.array(z.string()).optional(),
  units: z.number().int().min(1).max(100).optional(),
  fee: z.number().int().min(0).optional(),
  modifier: z.string().max(10).optional(),
});

const updateLineItemSchema = z.object({
  cptCode: z.string().min(3).max(10).optional(),
  description: z.string().optional(),
  icd10Codes: z.array(z.string()).optional(),
  units: z.number().int().min(1).max(100).optional(),
  fee: z.number().int().min(0).optional(),
  modifier: z.string().max(10).optional(),
});

/**
 * @swagger
 * /api/superbills/generate/{encounterId}:
 *   post:
 *     summary: Generate superbill from encounter
 *     description: Auto-generate a superbill from an encounter's diagnoses and procedures
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: encounterId
 *         required: true
 *         schema:
 *           type: string
 *         description: The encounter ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serviceDate:
 *                 type: string
 *                 format: date
 *                 description: Override service date (optional)
 *     responses:
 *       201:
 *         description: Superbill created successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Encounter not found
 */
superbillsRouter.post(
  "/generate/:encounterId",
  requireAuth,
  requireRoles(["provider", "admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { encounterId } = req.params;
    const { serviceDate } = req.body as { serviceDate?: string };

    try {
      const superbill = await superbillService.generateFromEncounter({
        encounterId: String(encounterId),
        tenantId,
        userId,
        serviceDate,
      });

      return res.status(201).json(superbill);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to generate superbill";
      logSuperbillsError("Error generating superbill:", error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/superbills/{id}:
 *   get:
 *     summary: Get superbill details
 *     description: Get a superbill with all line items and patient/provider info
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The superbill ID
 *     responses:
 *       200:
 *         description: Superbill details
 *       404:
 *         description: Superbill not found
 */
superbillsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const details = await superbillService.getSuperbillDetails(tenantId, String(id));

    if (!details) {
      return res.status(404).json({ error: "Superbill not found" });
    }

    await auditLog(tenantId, req.user!.id, "superbill_viewed", "superbill", String(id));
    return res.json(details);
  } catch (error) {
    logSuperbillsError("Error fetching superbill:", error);
    return res.status(500).json({ error: "Failed to fetch superbill" });
  }
});

/**
 * @swagger
 * /api/superbills/encounter/{encounterId}:
 *   get:
 *     summary: Get superbill by encounter
 *     description: Get the superbill associated with an encounter
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: encounterId
 *         required: true
 *         schema:
 *           type: string
 *         description: The encounter ID
 *     responses:
 *       200:
 *         description: Superbill details
 *       404:
 *         description: No superbill for this encounter
 */
superbillsRouter.get(
  "/encounter/:encounterId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { encounterId } = req.params;

    try {
      const superbill = await superbillService.getSuperbillByEncounter(tenantId, String(encounterId));

      if (!superbill) {
        return res.status(404).json({ error: "No superbill found for this encounter" });
      }

      const details = await superbillService.getSuperbillDetails(tenantId, superbill.id);
      return res.json(details);
    } catch (error) {
      logSuperbillsError("Error fetching superbill by encounter:", error);
      return res.status(500).json({ error: "Failed to fetch superbill" });
    }
  }
);

/**
 * @swagger
 * /api/superbills/{id}/items:
 *   post:
 *     summary: Add line item to superbill
 *     description: Add a new CPT charge line item to a superbill
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cptCode
 *             properties:
 *               cptCode:
 *                 type: string
 *               description:
 *                 type: string
 *               icd10Codes:
 *                 type: array
 *                 items:
 *                   type: string
 *               units:
 *                 type: integer
 *               fee:
 *                 type: integer
 *               modifier:
 *                 type: string
 *     responses:
 *       201:
 *         description: Line item added
 *       400:
 *         description: Invalid request or superbill locked
 */
superbillsRouter.post(
  "/:id/items",
  requireAuth,
  requireRoles(["provider", "admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = lineItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    try {
      const lineItem = await superbillService.addLineItem({
        superbillId: String(id),
        tenantId,
        cptCode: parsed.data.cptCode,
        icd10Codes: parsed.data.icd10Codes,
        units: parsed.data.units,
        fee: parsed.data.fee,
        modifier: parsed.data.modifier,
        description: parsed.data.description,
      });

      return res.status(201).json(lineItem);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add line item";
      logSuperbillsError("Error adding line item:", error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/superbills/{id}/items/{itemId}:
 *   put:
 *     summary: Update line item
 *     description: Update an existing line item on a superbill
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cptCode:
 *                 type: string
 *               description:
 *                 type: string
 *               icd10Codes:
 *                 type: array
 *                 items:
 *                   type: string
 *               units:
 *                 type: integer
 *               fee:
 *                 type: integer
 *               modifier:
 *                 type: string
 *     responses:
 *       200:
 *         description: Line item updated
 *       400:
 *         description: Invalid request or superbill locked
 */
superbillsRouter.put(
  "/:id/items/:itemId",
  requireAuth,
  requireRoles(["provider", "admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = updateLineItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { itemId } = req.params;

    try {
      const lineItem = await superbillService.updateLineItem(tenantId, String(itemId), parsed.data);
      return res.json(lineItem);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update line item";
      logSuperbillsError("Error updating line item:", error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/superbills/{id}/items/{itemId}:
 *   delete:
 *     summary: Delete line item
 *     description: Remove a line item from a superbill
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Line item deleted
 *       400:
 *         description: Superbill locked
 */
superbillsRouter.delete(
  "/:id/items/:itemId",
  requireAuth,
  requireRoles(["provider", "admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { itemId } = req.params;

    try {
      await superbillService.deleteLineItem(tenantId, String(itemId));
      return res.status(204).send();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete line item";
      logSuperbillsError("Error deleting line item:", error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/superbills/{id}/totals:
 *   get:
 *     summary: Calculate superbill totals
 *     description: Get calculated totals and line items for a superbill
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Totals calculated
 */
superbillsRouter.get("/:id/totals", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const totals = await superbillService.calculateTotals(tenantId, String(id));
    return res.json(totals);
  } catch (error) {
    logSuperbillsError("Error calculating totals:", error);
    return res.status(500).json({ error: "Failed to calculate totals" });
  }
});

/**
 * @swagger
 * /api/superbills/{id}/finalize:
 *   post:
 *     summary: Finalize superbill
 *     description: Lock the superbill for billing submission
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Superbill finalized
 *       400:
 *         description: Cannot finalize (already finalized or no line items)
 */
superbillsRouter.post(
  "/:id/finalize",
  requireAuth,
  requireRoles(["provider", "admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;

    try {
      const superbill = await superbillService.finalizeSuperbill(tenantId, String(id), userId);
      return res.json(superbill);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to finalize superbill";
      logSuperbillsError("Error finalizing superbill:", error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/superbills/{id}/void:
 *   post:
 *     summary: Void superbill
 *     description: Mark a superbill as void
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Superbill voided
 */
superbillsRouter.post(
  "/:id/void",
  requireAuth,
  requireRoles(["admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    try {
      const superbill = await superbillService.voidSuperbill(tenantId, String(id), userId, reason);
      return res.json(superbill);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to void superbill";
      logSuperbillsError("Error voiding superbill:", error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/superbills/patient/{patientId}:
 *   get:
 *     summary: Get patient's superbill history
 *     description: List all superbills for a patient
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, pending_review, approved, finalized, submitted, void]
 *     responses:
 *       200:
 *         description: List of superbills
 */
superbillsRouter.get(
  "/patient/:patientId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { patientId } = req.params;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset)) : undefined;
    const status = req.query.status as SuperbillStatus | undefined;

    try {
      const result = await superbillService.getPatientSuperbills(tenantId, String(patientId), {
        limit,
        offset,
        status,
      });

      return res.json(result);
    } catch (error) {
      logSuperbillsError("Error fetching patient superbills:", error);
      return res.status(500).json({ error: "Failed to fetch superbills" });
    }
  }
);

/**
 * @swagger
 * /api/superbills/codes/common:
 *   get:
 *     summary: Get common dermatology codes
 *     description: Get frequently used CPT or ICD-10 codes
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [CPT, ICD10]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: favoritesOnly
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of common codes
 */
superbillsRouter.get("/codes/common", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const codeType = req.query.type as 'CPT' | 'ICD10';
  const category = req.query.category as string | undefined;
  const favoritesOnly = req.query.favoritesOnly === 'true';
  const limit = req.query.limit ? parseInt(String(req.query.limit)) : undefined;

  if (!codeType || (codeType !== 'CPT' && codeType !== 'ICD10')) {
    return res.status(400).json({ error: "Query parameter 'type' must be 'CPT' or 'ICD10'" });
  }

  try {
    const codes = await superbillService.getCommonCodes(tenantId, codeType, {
      category,
      favoritesOnly,
      limit,
    });

    return res.json({ codes });
  } catch (error) {
    logSuperbillsError("Error fetching common codes:", error);
    return res.status(500).json({ error: "Failed to fetch codes" });
  }
});

/**
 * @swagger
 * /api/superbills/codes/search:
 *   get:
 *     summary: Search dermatology codes
 *     description: Search CPT or ICD-10 codes by code or description
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [CPT, ICD10]
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Search results
 */
superbillsRouter.get("/codes/search", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const codeType = req.query.type as 'CPT' | 'ICD10';
  const searchTerm = req.query.q as string;
  const limit = req.query.limit ? parseInt(String(req.query.limit)) : 50;

  if (!codeType || (codeType !== 'CPT' && codeType !== 'ICD10')) {
    return res.status(400).json({ error: "Query parameter 'type' must be 'CPT' or 'ICD10'" });
  }

  if (!searchTerm) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const codes = await superbillService.searchCodes(tenantId, codeType, searchTerm, limit);
    return res.json({ codes });
  } catch (error) {
    logSuperbillsError("Error searching codes:", error);
    return res.status(500).json({ error: "Failed to search codes" });
  }
});

/**
 * @swagger
 * /api/superbills/codes/{id}/favorite:
 *   post:
 *     summary: Toggle favorite status
 *     description: Toggle the favorite status of a code
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Favorite status toggled
 */
superbillsRouter.post(
  "/codes/:id/favorite",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    try {
      const isFavorite = await superbillService.toggleFavorite(tenantId, String(id));
      return res.json({ isFavorite });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to toggle favorite";
      logSuperbillsError("Error toggling favorite:", error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/superbills/fee/{cptCode}:
 *   get:
 *     summary: Get fee for CPT code
 *     description: Look up the fee for a CPT code from the fee schedule
 *     tags:
 *       - Superbills
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: cptCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: payerId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fee information
 */
superbillsRouter.get("/fee/:cptCode", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { cptCode } = req.params;
  const payerId = req.query.payerId as string | undefined;

  try {
    const fee = await superbillService.getFeeForCpt(tenantId, String(cptCode), payerId);
    return res.json({ cptCode: String(cptCode), fee, payerId: payerId || null });
  } catch (error) {
    logSuperbillsError("Error fetching fee:", error);
    return res.status(500).json({ error: "Failed to fetch fee" });
  }
});
