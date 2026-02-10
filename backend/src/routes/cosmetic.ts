import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { cosmeticService } from "../services/cosmeticService";
import { auditLog } from "../services/audit";

export const cosmeticRouter = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const purchasePackageSchema = z.object({
  patientId: z.string().uuid(),
  packageId: z.string().uuid(),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
  amountPaidCents: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const redeemServiceSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  encounterId: z.string().uuid().optional(),
});

const enrollMembershipSchema = z.object({
  patientId: z.string().uuid(),
  planId: z.string().uuid(),
  billingFrequency: z.enum(["monthly", "annual"]).optional(),
  billingDay: z.number().int().min(1).max(28).optional(),
  paymentMethodId: z.string().optional(),
  paymentMethodType: z.string().optional(),
  paymentMethodLast4: z.string().length(4).optional(),
  startDate: z.string().optional(),
});

const earnPointsSchema = z.object({
  patientId: z.string().uuid(),
  amount: z.number().positive(),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  description: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(),
});

const redeemPointsSchema = z.object({
  patientId: z.string().uuid(),
  points: z.number().int().positive(),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  description: z.string().optional(),
});

const createPackageSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  services: z.array(z.object({
    serviceId: z.string(),
    name: z.string().optional(),
    quantity: z.number().int().positive(),
    discountedUnits: z.number().int().optional(),
    discountPercent: z.number().min(0).max(100).optional(),
  })),
  packagePriceCents: z.number().int().positive(),
  originalPriceCents: z.number().int().positive().optional(),
  savingsPercent: z.number().min(0).max(100).optional(),
  validityDays: z.number().int().positive().optional(),
  termsConditions: z.string().optional(),
  isFeatured: z.boolean().optional(),
});

const calculateDiscountSchema = z.object({
  patientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  basePriceCents: z.number().int().positive(),
});

// =============================================================================
// COSMETIC SERVICES ENDPOINTS
// =============================================================================

/**
 * GET /api/cosmetic/services
 * List all cosmetic services
 */
cosmeticRouter.get("/services", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const category = req.query.category as string | undefined;
  const search = req.query.search as string | undefined;
  const activeOnly = req.query.activeOnly !== "false";

  try {
    const services = await cosmeticService.getServices(tenantId, {
      category,
      search,
      activeOnly,
    });

    return res.json({ services, count: services.length });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching cosmetic services:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/cosmetic/services/:id
 * Get a specific cosmetic service
 */
cosmeticRouter.get("/services/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const serviceId = req.params.id as string;

  try {
    const service = await cosmeticService.getServiceById(tenantId, serviceId);

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    return res.json(service);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching service:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

// =============================================================================
// PACKAGES ENDPOINTS
// =============================================================================

/**
 * GET /api/cosmetic/packages
 * List all available packages
 */
cosmeticRouter.get("/packages", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const category = req.query.category as string | undefined;
  const featuredOnly = req.query.featured === "true";
  const activeOnly = req.query.activeOnly !== "false";

  try {
    const packages = await cosmeticService.getPackages(tenantId, {
      category,
      featuredOnly,
      activeOnly,
    });

    return res.json({ packages, count: packages.length });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching packages:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/cosmetic/packages/:id
 * Get a specific package
 */
cosmeticRouter.get("/packages/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const packageId = req.params.id as string;

  try {
    const pkg = await cosmeticService.getPackageById(tenantId, packageId);

    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    return res.json(pkg);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching package:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/cosmetic/packages
 * Create a new package (admin only)
 */
cosmeticRouter.post(
  "/packages",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = createPackageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    try {
      const pkg = await cosmeticService.createPackage(tenantId, parsed.data, userId);
      await auditLog(tenantId, userId, "cosmetic_package_created", "cosmetic_package", pkg.id);

      return res.status(201).json(pkg);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error creating package:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * POST /api/cosmetic/packages/purchase
 * Purchase a package for a patient
 */
cosmeticRouter.post("/packages/purchase", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = purchasePackageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  try {
    const patientPackage = await cosmeticService.purchasePackage(
      tenantId,
      parsed.data,
      userId
    );

    await auditLog(
      tenantId,
      userId,
      "cosmetic_package_purchased",
      "patient_package",
      patientPackage.id
    );

    return res.status(201).json(patientPackage);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error purchasing package:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/cosmetic/patient/:patientId/packages
 * Get all packages for a patient
 */
cosmeticRouter.get(
  "/patient/:patientId/packages",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;
    const status = req.query.status as string | undefined;
    const includeExpired = req.query.includeExpired === "true";

    try {
      const packages = await cosmeticService.getPatientPackages(tenantId, patientId, {
        status,
        includeExpired,
      });

      return res.json({ packages, count: packages.length });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching patient packages:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * POST /api/cosmetic/packages/:patientPackageId/redeem
 * Redeem a service from a patient package
 */
cosmeticRouter.post(
  "/packages/:patientPackageId/redeem",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = redeemServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientPackageId = req.params.patientPackageId as string;

    try {
      const updatedPackage = await cosmeticService.redeemService(
        tenantId,
        patientPackageId,
        parsed.data.serviceId,
        parsed.data.quantity,
        parsed.data.encounterId,
        userId
      );

      await auditLog(
        tenantId,
        userId,
        "cosmetic_service_redeemed",
        "patient_package",
        patientPackageId
      );

      return res.json(updatedPackage);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error redeeming service:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

// =============================================================================
// MEMBERSHIP ENDPOINTS
// =============================================================================

/**
 * GET /api/cosmetic/memberships/plans
 * List all membership plans
 */
cosmeticRouter.get("/memberships/plans", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const activeOnly = req.query.activeOnly !== "false";

  try {
    const plans = await cosmeticService.getMembershipPlans(tenantId, { activeOnly });

    return res.json({ plans, count: plans.length });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching membership plans:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/cosmetic/memberships/plans/:id
 * Get a specific membership plan
 */
cosmeticRouter.get(
  "/memberships/plans/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const planId = req.params.id as string;

    try {
      const plan = await cosmeticService.getMembershipPlanById(tenantId, planId);

      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      return res.json(plan);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching plan:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * POST /api/cosmetic/memberships/enroll
 * Enroll a patient in a membership
 */
cosmeticRouter.post("/memberships/enroll", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = enrollMembershipSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  try {
    const membership = await cosmeticService.enrollMembership(
      tenantId,
      parsed.data,
      userId
    );

    await auditLog(
      tenantId,
      userId,
      "membership_enrolled",
      "patient_membership",
      membership.id
    );

    return res.status(201).json(membership);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error enrolling membership:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/cosmetic/patient/:patientId/membership
 * Get patient's active membership
 */
cosmeticRouter.get(
  "/patient/:patientId/membership",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;

    try {
      const membership = await cosmeticService.getPatientMembership(tenantId, patientId);

      return res.json({ membership });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching patient membership:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * POST /api/cosmetic/memberships/:id/cancel
 * Cancel a membership
 */
cosmeticRouter.post(
  "/memberships/:id/cancel",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const membershipId = req.params.id as string;
    const reason = req.body.reason as string | undefined;

    try {
      const membership = await cosmeticService.cancelMembership(
        tenantId,
        membershipId,
        reason,
        userId
      );

      await auditLog(
        tenantId,
        userId,
        "membership_cancelled",
        "patient_membership",
        membershipId
      );

      return res.json(membership);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error cancelling membership:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * POST /api/cosmetic/memberships/:id/pause
 * Pause a membership
 */
cosmeticRouter.post(
  "/memberships/:id/pause",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const membershipId = req.params.id as string;
    const pauseEndDate = new Date(req.body.pauseEndDate);

    if (isNaN(pauseEndDate.getTime())) {
      return res.status(400).json({ error: "Invalid pauseEndDate" });
    }

    try {
      const membership = await cosmeticService.pauseMembership(
        tenantId,
        membershipId,
        pauseEndDate,
        userId
      );

      await auditLog(
        tenantId,
        userId,
        "membership_paused",
        "patient_membership",
        membershipId
      );

      return res.json(membership);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error pausing membership:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

// =============================================================================
// LOYALTY POINTS ENDPOINTS
// =============================================================================

/**
 * GET /api/cosmetic/patient/:patientId/loyalty
 * Get patient's loyalty balance and tier
 */
cosmeticRouter.get(
  "/patient/:patientId/loyalty",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;

    try {
      const loyalty = await cosmeticService.getLoyaltyBalance(tenantId, patientId);

      return res.json(loyalty);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching loyalty balance:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * GET /api/cosmetic/patient/:patientId/loyalty/transactions
 * Get patient's loyalty transaction history
 */
cosmeticRouter.get(
  "/patient/:patientId/loyalty/transactions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    try {
      const transactions = await cosmeticService.getLoyaltyTransactions(
        tenantId,
        patientId,
        limit
      );

      return res.json({ transactions, count: transactions.length });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching loyalty transactions:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * POST /api/cosmetic/loyalty/earn
 * Award loyalty points to a patient
 */
cosmeticRouter.post("/loyalty/earn", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = earnPointsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  try {
    const transaction = await cosmeticService.earnPoints(
      tenantId,
      parsed.data,
      userId
    );

    await auditLog(
      tenantId,
      userId,
      "loyalty_points_earned",
      "loyalty_transaction",
      transaction.id
    );

    return res.status(201).json(transaction);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error earning points:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/cosmetic/loyalty/redeem
 * Redeem loyalty points
 */
cosmeticRouter.post("/loyalty/redeem", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = redeemPointsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  try {
    const transaction = await cosmeticService.redeemPoints(
      tenantId,
      parsed.data,
      userId
    );

    await auditLog(
      tenantId,
      userId,
      "loyalty_points_redeemed",
      "loyalty_transaction",
      transaction.id
    );

    return res.json(transaction);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error redeeming points:", error);
    return res.status(500).json({ error: errorMessage });
  }
});

// =============================================================================
// PRICING / DISCOUNT ENDPOINTS
// =============================================================================

/**
 * POST /api/cosmetic/pricing/calculate-discount
 * Calculate member discount for a service
 */
cosmeticRouter.post(
  "/pricing/calculate-discount",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = calculateDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;

    try {
      const discount = await cosmeticService.calculateMemberDiscount(
        tenantId,
        parsed.data.patientId,
        parsed.data.serviceId,
        parsed.data.basePriceCents
      );

      return res.json(discount);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error calculating discount:", error);
      return res.status(500).json({ error: errorMessage });
    }
  }
);
