import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import type { PoolClient } from 'pg';

// =============================================================================
// Type Definitions
// =============================================================================

export interface CosmeticService {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  basePriceCents: number;
  unitType: 'units' | 'area' | 'session' | 'syringe' | 'vial' | 'treatment';
  unitsPerSession?: number;
  loyaltyPointsPerDollar: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PackageServiceItem {
  serviceId: string;
  name?: string;
  quantity: number;
  discountedUnits?: number;
  discountPercent?: number;
}

export interface CosmeticPackage {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category?: string;
  services: PackageServiceItem[];
  packagePriceCents: number;
  originalPriceCents?: number;
  savingsAmountCents?: number;
  savingsPercent?: number;
  validityDays: number;
  maxRedemptionsPerService?: Record<string, number>;
  termsConditions?: string;
  isFeatured: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RemainingService {
  original: number;
  remaining: number;
  serviceName?: string;
}

export interface PatientPackage {
  id: string;
  tenantId: string;
  patientId: string;
  packageId: string;
  packageName?: string;
  purchaseDate: string;
  expirationDate: string;
  amountPaidCents: number;
  paymentMethod?: string;
  paymentReference?: string;
  remainingServices: Record<string, RemainingService>;
  status: 'active' | 'expired' | 'fully_redeemed' | 'cancelled' | 'refunded';
  notes?: string;
  purchasedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipBenefit {
  type: string;
  description: string;
  value: number | string | boolean;
}

export interface MembershipPlan {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  tier: string;
  monthlyPriceCents: number;
  annualPriceCents?: number;
  benefits: MembershipBenefit[];
  discountPercent: number;
  includedServices: string[];
  serviceDiscounts: Record<string, number>;
  priorityBooking: boolean;
  freeConsultations: boolean;
  loyaltyPointsMultiplier: number;
  minCommitmentMonths: number;
  cancellationNoticeDays: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatientMembership {
  id: string;
  tenantId: string;
  patientId: string;
  planId: string;
  planName?: string;
  startDate: string;
  endDate?: string;
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'pending';
  billingFrequency: 'monthly' | 'annual';
  billingDay?: number;
  nextBillingDate?: string;
  paymentMethodId?: string;
  paymentMethodType?: string;
  paymentMethodLast4?: string;
  cancellationDate?: string;
  cancellationReason?: string;
  pauseStartDate?: string;
  pauseEndDate?: string;
  enrolledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyPoints {
  id: string;
  tenantId: string;
  patientId: string;
  pointsBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  tier: string;
  tierUpdatedAt?: string;
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  tenantId: string;
  patientId: string;
  points: number;
  transactionType: 'earn' | 'redeem' | 'expire' | 'adjust' | 'bonus' | 'referral';
  referenceType?: string;
  referenceId?: string;
  description?: string;
  balanceAfter: number;
  expiresAt?: string;
  createdBy?: string;
  createdAt: string;
}

export interface MemberDiscount {
  discountPercent: number;
  discountAmountCents: number;
  finalPriceCents: number;
  membershipTier?: string;
  loyaltyTierDiscount?: number;
  isFreeService?: boolean;
}

// =============================================================================
// Input Types
// =============================================================================

export interface CreatePackageData {
  name: string;
  description?: string;
  category?: string;
  services: PackageServiceItem[];
  packagePriceCents: number;
  originalPriceCents?: number;
  savingsPercent?: number;
  validityDays?: number;
  termsConditions?: string;
  isFeatured?: boolean;
}

export interface PurchasePackageData {
  patientId: string;
  packageId: string;
  paymentMethod?: string;
  paymentReference?: string;
  amountPaidCents?: number;
  notes?: string;
}

export interface EnrollMembershipData {
  patientId: string;
  planId: string;
  billingFrequency?: 'monthly' | 'annual';
  billingDay?: number;
  paymentMethodId?: string;
  paymentMethodType?: string;
  paymentMethodLast4?: string;
  startDate?: string;
}

export interface EarnPointsData {
  patientId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  expiresInDays?: number;
}

export interface RedeemPointsData {
  patientId: string;
  points: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

// =============================================================================
// Cosmetic Service Class
// =============================================================================

export class CosmeticPackagesService {

  // ---------------------------------------------------------------------------
  // COSMETIC SERVICES
  // ---------------------------------------------------------------------------

  async getServices(
    tenantId: string,
    options?: {
      category?: string;
      activeOnly?: boolean;
      search?: string;
    }
  ): Promise<CosmeticService[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: (string | boolean)[] = [tenantId];
    let paramIndex = 2;

    if (options?.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(options.category);
      paramIndex++;
    }

    if (options?.activeOnly !== false) {
      conditions.push(`is_active = $${paramIndex}`);
      params.push(true);
      paramIndex++;
    }

    if (options?.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT * FROM cosmetic_services
       WHERE ${conditions.join(' AND ')}
       ORDER BY display_order, name`,
      params
    );

    return result.rows.map(this.mapService);
  }

  async getServiceById(tenantId: string, serviceId: string): Promise<CosmeticService | null> {
    const result = await pool.query(
      `SELECT * FROM cosmetic_services WHERE id = $1 AND tenant_id = $2`,
      [serviceId, tenantId]
    );
    return result.rows[0] ? this.mapService(result.rows[0]) : null;
  }

  // ---------------------------------------------------------------------------
  // PACKAGES
  // ---------------------------------------------------------------------------

  async getPackages(
    tenantId: string,
    options?: {
      category?: string;
      activeOnly?: boolean;
      featuredOnly?: boolean;
    }
  ): Promise<CosmeticPackage[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: (string | boolean)[] = [tenantId];
    let paramIndex = 2;

    if (options?.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(options.category);
      paramIndex++;
    }

    if (options?.activeOnly !== false) {
      conditions.push(`is_active = $${paramIndex}`);
      params.push(true);
      paramIndex++;
    }

    if (options?.featuredOnly) {
      conditions.push(`is_featured = $${paramIndex}`);
      params.push(true);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT * FROM cosmetic_packages
       WHERE ${conditions.join(' AND ')}
       ORDER BY display_order, name`,
      params
    );

    return result.rows.map(this.mapPackage);
  }

  async getPackageById(tenantId: string, packageId: string): Promise<CosmeticPackage | null> {
    const result = await pool.query(
      `SELECT * FROM cosmetic_packages WHERE id = $1 AND tenant_id = $2`,
      [packageId, tenantId]
    );
    return result.rows[0] ? this.mapPackage(result.rows[0]) : null;
  }

  async createPackage(tenantId: string, data: CreatePackageData, userId?: string): Promise<CosmeticPackage> {
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO cosmetic_packages (
        id, tenant_id, name, description, category, services,
        package_price_cents, original_price_cents, savings_percent,
        validity_days, terms_conditions, is_featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        tenantId,
        data.name,
        data.description || null,
        data.category || null,
        JSON.stringify(data.services),
        data.packagePriceCents,
        data.originalPriceCents || null,
        data.savingsPercent || null,
        data.validityDays || 365,
        data.termsConditions || null,
        data.isFeatured || false,
      ]
    );

    logger.info('Created cosmetic package', { packageId: id, tenantId, userId });
    return this.mapPackage(result.rows[0]);
  }

  async updatePackage(
    tenantId: string,
    packageId: string,
    data: Partial<CreatePackageData>,
    userId?: string
  ): Promise<CosmeticPackage | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(data.description);
      paramIndex++;
    }
    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(data.category);
      paramIndex++;
    }
    if (data.services !== undefined) {
      updates.push(`services = $${paramIndex}`);
      params.push(JSON.stringify(data.services));
      paramIndex++;
    }
    if (data.packagePriceCents !== undefined) {
      updates.push(`package_price_cents = $${paramIndex}`);
      params.push(data.packagePriceCents);
      paramIndex++;
    }
    if (data.originalPriceCents !== undefined) {
      updates.push(`original_price_cents = $${paramIndex}`);
      params.push(data.originalPriceCents);
      paramIndex++;
    }
    if (data.validityDays !== undefined) {
      updates.push(`validity_days = $${paramIndex}`);
      params.push(data.validityDays);
      paramIndex++;
    }
    if (data.isFeatured !== undefined) {
      updates.push(`is_featured = $${paramIndex}`);
      params.push(data.isFeatured);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getPackageById(tenantId, packageId);
    }

    updates.push(`updated_at = NOW()`);
    params.push(packageId);
    params.push(tenantId);

    const result = await pool.query(
      `UPDATE cosmetic_packages
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    if (result.rows[0]) {
      logger.info('Updated cosmetic package', { packageId, tenantId, userId });
      return this.mapPackage(result.rows[0]);
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // PATIENT PACKAGES (PURCHASES)
  // ---------------------------------------------------------------------------

  async purchasePackage(
    tenantId: string,
    data: PurchasePackageData,
    userId: string
  ): Promise<PatientPackage> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get the package
      const packageResult = await client.query(
        `SELECT * FROM cosmetic_packages WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [data.packageId, tenantId]
      );

      if (!packageResult.rows[0]) {
        throw new Error('Package not found or inactive');
      }

      const pkg = packageResult.rows[0] as { services: PackageServiceItem[]; validity_days: number; package_price_cents: number };

      // Calculate expiration date
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + (pkg.validity_days || 365));

      // Build remaining services from package services
      const remainingServices: Record<string, RemainingService> = {};
      const services = pkg.services as PackageServiceItem[];

      for (const svc of services) {
        remainingServices[svc.serviceId] = {
          original: svc.quantity,
          remaining: svc.quantity,
          serviceName: svc.name,
        };
      }

      const id = crypto.randomUUID();
      const result = await client.query(
        `INSERT INTO patient_packages (
          id, tenant_id, patient_id, package_id, expiration_date,
          amount_paid_cents, payment_method, payment_reference,
          remaining_services, notes, purchased_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          id,
          tenantId,
          data.patientId,
          data.packageId,
          expirationDate,
          data.amountPaidCents || pkg.package_price_cents,
          data.paymentMethod || null,
          data.paymentReference || null,
          JSON.stringify(remainingServices),
          data.notes || null,
          userId,
        ]
      );

      // Award loyalty points for purchase
      const amountDollars = Math.floor((data.amountPaidCents || pkg.package_price_cents) / 100);
      if (amountDollars > 0) {
        await this.earnPointsInternal(client, tenantId, {
          patientId: data.patientId,
          amount: amountDollars,
          referenceType: 'package_purchase',
          referenceId: id,
          description: `Points earned from package purchase`,
        }, userId);
      }

      await client.query('COMMIT');
      logger.info('Patient purchased package', {
        patientPackageId: id,
        packageId: data.packageId,
        patientId: data.patientId,
        tenantId,
      });

      return this.mapPatientPackage(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error purchasing package:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPatientPackages(
    tenantId: string,
    patientId: string,
    options?: {
      status?: string;
      includeExpired?: boolean;
    }
  ): Promise<PatientPackage[]> {
    const conditions: string[] = ['pp.tenant_id = $1', 'pp.patient_id = $2'];
    const params: (string | boolean)[] = [tenantId, patientId];
    let paramIndex = 3;

    if (options?.status) {
      conditions.push(`pp.status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    } else if (!options?.includeExpired) {
      conditions.push(`pp.status IN ('active')`);
    }

    const result = await pool.query(
      `SELECT pp.*, cp.name as package_name
       FROM patient_packages pp
       JOIN cosmetic_packages cp ON cp.id = pp.package_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pp.purchase_date DESC`,
      params
    );

    return result.rows.map(this.mapPatientPackage);
  }

  async getPatientPackageById(
    tenantId: string,
    patientPackageId: string
  ): Promise<PatientPackage | null> {
    const result = await pool.query(
      `SELECT pp.*, cp.name as package_name
       FROM patient_packages pp
       JOIN cosmetic_packages cp ON cp.id = pp.package_id
       WHERE pp.id = $1 AND pp.tenant_id = $2`,
      [patientPackageId, tenantId]
    );

    return result.rows[0] ? this.mapPatientPackage(result.rows[0]) : null;
  }

  async redeemService(
    tenantId: string,
    patientPackageId: string,
    serviceId: string,
    quantity: number = 1,
    encounterId?: string,
    userId?: string
  ): Promise<PatientPackage> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get patient package
      const pkgResult = await client.query(
        `SELECT * FROM patient_packages
         WHERE id = $1 AND tenant_id = $2 AND status = 'active'
         FOR UPDATE`,
        [patientPackageId, tenantId]
      );

      if (!pkgResult.rows[0]) {
        throw new Error('Package not found or not active');
      }

      const patientPackage = pkgResult.rows[0] as { remaining_services: Record<string, RemainingService>; expiration_date: Date };

      // Check expiration
      if (new Date(patientPackage.expiration_date) < new Date()) {
        await client.query(
          `UPDATE patient_packages SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [patientPackageId]
        );
        throw new Error('Package has expired');
      }

      // Check remaining services
      const remainingServices = patientPackage.remaining_services as Record<string, RemainingService>;
      if (!remainingServices[serviceId]) {
        throw new Error('Service not included in this package');
      }
      if (remainingServices[serviceId].remaining < quantity) {
        throw new Error(`Insufficient remaining services. Available: ${remainingServices[serviceId].remaining}`);
      }

      // Update remaining services
      remainingServices[serviceId].remaining -= quantity;

      // Check if fully redeemed
      const totalRemaining = Object.values(remainingServices).reduce(
        (sum, svc) => sum + svc.remaining,
        0
      );
      const newStatus = totalRemaining === 0 ? 'fully_redeemed' : 'active';

      // Update patient package
      const result = await client.query(
        `UPDATE patient_packages
         SET remaining_services = $1, status = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [JSON.stringify(remainingServices), newStatus, patientPackageId]
      );

      // Record redemption
      await client.query(
        `INSERT INTO package_redemptions (
          id, tenant_id, patient_package_id, service_id, encounter_id,
          quantity, redeemed_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          tenantId,
          patientPackageId,
          serviceId,
          encounterId || null,
          quantity,
          userId || null,
        ]
      );

      await client.query('COMMIT');
      logger.info('Redeemed package service', {
        patientPackageId,
        serviceId,
        quantity,
        tenantId,
      });

      return this.mapPatientPackage(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error redeeming service:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // MEMBERSHIPS
  // ---------------------------------------------------------------------------

  async getMembershipPlans(
    tenantId: string,
    options?: { activeOnly?: boolean }
  ): Promise<MembershipPlan[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: (string | boolean)[] = [tenantId];

    if (options?.activeOnly !== false) {
      conditions.push(`is_active = true`);
    }

    const result = await pool.query(
      `SELECT * FROM membership_plans
       WHERE ${conditions.join(' AND ')}
       ORDER BY display_order, monthly_price_cents`,
      params
    );

    return result.rows.map(this.mapMembershipPlan);
  }

  async getMembershipPlanById(
    tenantId: string,
    planId: string
  ): Promise<MembershipPlan | null> {
    const result = await pool.query(
      `SELECT * FROM membership_plans WHERE id = $1 AND tenant_id = $2`,
      [planId, tenantId]
    );
    return result.rows[0] ? this.mapMembershipPlan(result.rows[0]) : null;
  }

  async enrollMembership(
    tenantId: string,
    data: EnrollMembershipData,
    userId: string
  ): Promise<PatientMembership> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if patient already has active membership
      const existingResult = await client.query(
        `SELECT id FROM patient_memberships
         WHERE tenant_id = $1 AND patient_id = $2 AND status = 'active'`,
        [tenantId, data.patientId]
      );

      if (existingResult.rows[0]) {
        throw new Error('Patient already has an active membership');
      }

      // Get plan details
      const planResult = await client.query(
        `SELECT * FROM membership_plans WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [data.planId, tenantId]
      );

      if (!planResult.rows[0]) {
        throw new Error('Membership plan not found or inactive');
      }

      const startDate = data.startDate ? new Date(data.startDate) : new Date();
      const billingDay = data.billingDay || startDate.getDate();

      // Calculate next billing date
      const nextBillingDate = new Date(startDate);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      nextBillingDate.setDate(Math.min(billingDay, 28));

      const id = crypto.randomUUID();
      const result = await client.query(
        `INSERT INTO patient_memberships (
          id, tenant_id, patient_id, plan_id, start_date,
          billing_frequency, billing_day, next_billing_date,
          payment_method_id, payment_method_type, payment_method_last4,
          enrolled_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          id,
          tenantId,
          data.patientId,
          data.planId,
          startDate,
          data.billingFrequency || 'monthly',
          billingDay,
          nextBillingDate,
          data.paymentMethodId || null,
          data.paymentMethodType || null,
          data.paymentMethodLast4 || null,
          userId,
        ]
      );

      // Award bonus points for enrollment
      await this.earnPointsInternal(client, tenantId, {
        patientId: data.patientId,
        amount: 100, // Bonus points for joining
        referenceType: 'membership_enrollment',
        referenceId: id,
        description: 'Welcome bonus for membership enrollment',
      }, userId);

      await client.query('COMMIT');
      logger.info('Patient enrolled in membership', {
        membershipId: id,
        planId: data.planId,
        patientId: data.patientId,
        tenantId,
      });

      return this.mapPatientMembership(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error enrolling membership:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPatientMembership(
    tenantId: string,
    patientId: string
  ): Promise<PatientMembership | null> {
    const result = await pool.query(
      `SELECT pm.*, mp.name as plan_name
       FROM patient_memberships pm
       JOIN membership_plans mp ON mp.id = pm.plan_id
       WHERE pm.tenant_id = $1 AND pm.patient_id = $2 AND pm.status = 'active'`,
      [tenantId, patientId]
    );

    return result.rows[0] ? this.mapPatientMembership(result.rows[0]) : null;
  }

  async cancelMembership(
    tenantId: string,
    membershipId: string,
    reason?: string,
    userId?: string
  ): Promise<PatientMembership> {
    const result = await pool.query(
      `UPDATE patient_memberships
       SET status = 'cancelled', cancellation_date = NOW(), cancellation_reason = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [reason || null, membershipId, tenantId]
    );

    if (!result.rows[0]) {
      throw new Error('Membership not found');
    }

    logger.info('Membership cancelled', { membershipId, tenantId, userId });
    return this.mapPatientMembership(result.rows[0]);
  }

  async pauseMembership(
    tenantId: string,
    membershipId: string,
    pauseEndDate: Date,
    userId?: string
  ): Promise<PatientMembership> {
    const result = await pool.query(
      `UPDATE patient_memberships
       SET status = 'paused', pause_start_date = NOW(), pause_end_date = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND status = 'active'
       RETURNING *`,
      [pauseEndDate, membershipId, tenantId]
    );

    if (!result.rows[0]) {
      throw new Error('Active membership not found');
    }

    logger.info('Membership paused', { membershipId, pauseEndDate, tenantId, userId });
    return this.mapPatientMembership(result.rows[0]);
  }

  // ---------------------------------------------------------------------------
  // LOYALTY POINTS
  // ---------------------------------------------------------------------------

  async getLoyaltyBalance(
    tenantId: string,
    patientId: string
  ): Promise<LoyaltyPoints> {
    // Get or create loyalty record
    let result = await pool.query(
      `SELECT * FROM loyalty_points WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (!result.rows[0]) {
      // Create initial record
      result = await pool.query(
        `INSERT INTO loyalty_points (id, tenant_id, patient_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [crypto.randomUUID(), tenantId, patientId]
      );
    }

    return this.mapLoyaltyPoints(result.rows[0]);
  }

  async earnPoints(
    tenantId: string,
    data: EarnPointsData,
    userId: string
  ): Promise<LoyaltyTransaction> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const transaction = await this.earnPointsInternal(client, tenantId, data, userId);
      await client.query('COMMIT');
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async earnPointsInternal(
    client: PoolClient,
    tenantId: string,
    data: EarnPointsData,
    userId: string
  ): Promise<LoyaltyTransaction> {
    // Get patient's membership for multiplier
    const membershipResult = await client.query(
      `SELECT mp.loyalty_points_multiplier
       FROM patient_memberships pm
       JOIN membership_plans mp ON mp.id = pm.plan_id
       WHERE pm.tenant_id = $1 AND pm.patient_id = $2 AND pm.status = 'active'`,
      [tenantId, data.patientId]
    );

    const multiplier = membershipResult.rows[0]?.loyalty_points_multiplier || 1.0;
    const points = Math.floor(data.amount * (multiplier as number));

    // Ensure loyalty record exists
    await client.query(
      `INSERT INTO loyalty_points (id, tenant_id, patient_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, patient_id) DO NOTHING`,
      [crypto.randomUUID(), tenantId, data.patientId]
    );

    // Update balance
    const balanceResult = await client.query(
      `UPDATE loyalty_points
       SET points_balance = points_balance + $1,
           lifetime_earned = lifetime_earned + $1,
           last_activity = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $2 AND patient_id = $3
       RETURNING points_balance`,
      [points, tenantId, data.patientId]
    );

    const newBalance = (balanceResult.rows[0]?.points_balance as number) || points;

    // Calculate expiration (default 2 years)
    let expiresAt: Date | null = null;
    if (data.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
    }

    // Record transaction
    const txId = crypto.randomUUID();
    await client.query(
      `INSERT INTO loyalty_transactions (
        id, tenant_id, patient_id, points, transaction_type,
        reference_type, reference_id, description, balance_after, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        txId,
        tenantId,
        data.patientId,
        points,
        'earn',
        data.referenceType || null,
        data.referenceId || null,
        data.description || `Earned ${points} points`,
        newBalance,
        expiresAt,
        userId,
      ]
    );

    // Update tier if needed
    await this.updateLoyaltyTier(client, tenantId, data.patientId);

    logger.info('Loyalty points earned', {
      patientId: data.patientId,
      points,
      newBalance,
      tenantId,
    });

    return {
      id: txId,
      tenantId,
      patientId: data.patientId,
      points,
      transactionType: 'earn',
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      description: data.description || `Earned ${points} points`,
      balanceAfter: newBalance,
      expiresAt: expiresAt?.toISOString(),
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
  }

  async redeemPoints(
    tenantId: string,
    data: RedeemPointsData,
    userId: string
  ): Promise<LoyaltyTransaction> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check balance
      const balanceResult = await client.query(
        `SELECT points_balance FROM loyalty_points
         WHERE tenant_id = $1 AND patient_id = $2
         FOR UPDATE`,
        [tenantId, data.patientId]
      );

      const currentBalance = (balanceResult.rows[0]?.points_balance as number) || 0;

      if (currentBalance < data.points) {
        throw new Error(`Insufficient points. Available: ${currentBalance}`);
      }

      // Update balance
      const updateResult = await client.query(
        `UPDATE loyalty_points
         SET points_balance = points_balance - $1,
             lifetime_redeemed = lifetime_redeemed + $1,
             last_activity = NOW(),
             updated_at = NOW()
         WHERE tenant_id = $2 AND patient_id = $3
         RETURNING points_balance`,
        [data.points, tenantId, data.patientId]
      );

      const newBalance = updateResult.rows[0]?.points_balance as number;

      // Record transaction
      const txId = crypto.randomUUID();
      await client.query(
        `INSERT INTO loyalty_transactions (
          id, tenant_id, patient_id, points, transaction_type,
          reference_type, reference_id, description, balance_after, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          txId,
          tenantId,
          data.patientId,
          -data.points,
          'redeem',
          data.referenceType || null,
          data.referenceId || null,
          data.description || `Redeemed ${data.points} points`,
          newBalance,
          userId,
        ]
      );

      await client.query('COMMIT');

      logger.info('Loyalty points redeemed', {
        patientId: data.patientId,
        points: data.points,
        newBalance,
        tenantId,
      });

      return {
        id: txId,
        tenantId,
        patientId: data.patientId,
        points: -data.points,
        transactionType: 'redeem',
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        description: data.description || `Redeemed ${data.points} points`,
        balanceAfter: newBalance,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error redeeming points:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getLoyaltyTransactions(
    tenantId: string,
    patientId: string,
    limit: number = 50
  ): Promise<LoyaltyTransaction[]> {
    const result = await pool.query(
      `SELECT * FROM loyalty_transactions
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, patientId, limit]
    );

    return result.rows.map(this.mapLoyaltyTransaction);
  }

  private async updateLoyaltyTier(
    client: PoolClient,
    tenantId: string,
    patientId: string
  ): Promise<void> {
    // Get lifetime points
    const pointsResult = await client.query(
      `SELECT lifetime_earned FROM loyalty_points
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (!pointsResult.rows[0]) return;

    const lifetimePoints = pointsResult.rows[0].lifetime_earned as number;

    // Get applicable tier
    const tierResult = await client.query(
      `SELECT name FROM loyalty_tiers
       WHERE tenant_id = $1 AND min_lifetime_points <= $2
       ORDER BY min_lifetime_points DESC
       LIMIT 1`,
      [tenantId, lifetimePoints]
    );

    if (tierResult.rows[0]) {
      await client.query(
        `UPDATE loyalty_points
         SET tier = $1, tier_updated_at = NOW()
         WHERE tenant_id = $2 AND patient_id = $3`,
        [tierResult.rows[0].name, tenantId, patientId]
      );
    }
  }

  // ---------------------------------------------------------------------------
  // MEMBER PRICING / DISCOUNTS
  // ---------------------------------------------------------------------------

  async calculateMemberDiscount(
    tenantId: string,
    patientId: string,
    serviceId: string,
    basePriceCents: number
  ): Promise<MemberDiscount> {
    let totalDiscountPercent = 0;
    let membershipTier: string | undefined;
    let loyaltyTierDiscount = 0;
    let isFreeService = false;

    // Check membership
    const membershipResult = await pool.query(
      `SELECT mp.discount_percent, mp.tier, mp.included_services, mp.service_discounts
       FROM patient_memberships pm
       JOIN membership_plans mp ON mp.id = pm.plan_id
       WHERE pm.tenant_id = $1 AND pm.patient_id = $2 AND pm.status = 'active'`,
      [tenantId, patientId]
    );

    if (membershipResult.rows[0]) {
      const membership = membershipResult.rows[0] as {
        discount_percent: number;
        tier: string;
        included_services: string[];
        service_discounts: Record<string, number>;
      };
      membershipTier = membership.tier;

      // Check if service is included free
      const includedServices = membership.included_services || [];
      if (includedServices.includes(serviceId)) {
        isFreeService = true;
      }

      // Check for service-specific discount
      const serviceDiscounts = membership.service_discounts || {};
      if (serviceDiscounts[serviceId]) {
        totalDiscountPercent += serviceDiscounts[serviceId];
      } else {
        // Apply general membership discount
        totalDiscountPercent += Number(membership.discount_percent) || 0;
      }
    }

    // Check loyalty tier discount
    const loyaltyResult = await pool.query(
      `SELECT lp.tier, lt.discount_percent
       FROM loyalty_points lp
       JOIN loyalty_tiers lt ON lt.tenant_id = lp.tenant_id AND lt.name = lp.tier
       WHERE lp.tenant_id = $1 AND lp.patient_id = $2`,
      [tenantId, patientId]
    );

    if (loyaltyResult.rows[0]) {
      loyaltyTierDiscount = Number(loyaltyResult.rows[0].discount_percent) || 0;
      totalDiscountPercent += loyaltyTierDiscount;
    }

    // Cap discount at 50%
    totalDiscountPercent = Math.min(totalDiscountPercent, 50);

    let discountAmountCents: number;
    let finalPriceCents: number;

    if (isFreeService) {
      discountAmountCents = basePriceCents;
      finalPriceCents = 0;
    } else {
      discountAmountCents = Math.floor(basePriceCents * (totalDiscountPercent / 100));
      finalPriceCents = basePriceCents - discountAmountCents;
    }

    return {
      discountPercent: totalDiscountPercent,
      discountAmountCents,
      finalPriceCents,
      membershipTier,
      loyaltyTierDiscount,
      isFreeService,
    };
  }

  // ---------------------------------------------------------------------------
  // MAPPERS
  // ---------------------------------------------------------------------------

  private mapService(row: Record<string, unknown>): CosmeticService {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      category: row.category as string,
      subcategory: row.subcategory as string | undefined,
      basePriceCents: row.base_price_cents as number,
      unitType: row.unit_type as CosmeticService['unitType'],
      unitsPerSession: row.units_per_session as number | undefined,
      loyaltyPointsPerDollar: row.loyalty_points_per_dollar as number,
      isActive: row.is_active as boolean,
      displayOrder: row.display_order as number,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private mapPackage(row: Record<string, unknown>): CosmeticPackage {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      category: row.category as string | undefined,
      services: row.services as PackageServiceItem[],
      packagePriceCents: row.package_price_cents as number,
      originalPriceCents: row.original_price_cents as number | undefined,
      savingsAmountCents: row.savings_amount_cents as number | undefined,
      savingsPercent: row.savings_percent ? Number(row.savings_percent) : undefined,
      validityDays: row.validity_days as number,
      maxRedemptionsPerService: row.max_redemptions_per_service as Record<string, number> | undefined,
      termsConditions: row.terms_conditions as string | undefined,
      isFeatured: row.is_featured as boolean,
      isActive: row.is_active as boolean,
      displayOrder: row.display_order as number,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private mapPatientPackage(row: Record<string, unknown>): PatientPackage {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      patientId: row.patient_id as string,
      packageId: row.package_id as string,
      packageName: row.package_name as string | undefined,
      purchaseDate: (row.purchase_date as Date).toISOString(),
      expirationDate: (row.expiration_date as Date).toISOString(),
      amountPaidCents: row.amount_paid_cents as number,
      paymentMethod: row.payment_method as string | undefined,
      paymentReference: row.payment_reference as string | undefined,
      remainingServices: row.remaining_services as Record<string, RemainingService>,
      status: row.status as PatientPackage['status'],
      notes: row.notes as string | undefined,
      purchasedBy: row.purchased_by as string | undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private mapMembershipPlan(row: Record<string, unknown>): MembershipPlan {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      tier: row.tier as string,
      monthlyPriceCents: row.monthly_price_cents as number,
      annualPriceCents: row.annual_price_cents as number | undefined,
      benefits: row.benefits as MembershipBenefit[],
      discountPercent: Number(row.discount_percent) || 0,
      includedServices: row.included_services as string[] || [],
      serviceDiscounts: row.service_discounts as Record<string, number> || {},
      priorityBooking: row.priority_booking as boolean,
      freeConsultations: row.free_consultations as boolean,
      loyaltyPointsMultiplier: Number(row.loyalty_points_multiplier) || 1.0,
      minCommitmentMonths: row.min_commitment_months as number,
      cancellationNoticeDays: row.cancellation_notice_days as number,
      isActive: row.is_active as boolean,
      displayOrder: row.display_order as number,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private mapPatientMembership(row: Record<string, unknown>): PatientMembership {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      patientId: row.patient_id as string,
      planId: row.plan_id as string,
      planName: row.plan_name as string | undefined,
      startDate: (row.start_date as Date).toISOString().split('T')[0] as string,
      endDate: row.end_date ? (row.end_date as Date).toISOString().split('T')[0] : undefined,
      status: row.status as PatientMembership['status'],
      billingFrequency: row.billing_frequency as PatientMembership['billingFrequency'],
      billingDay: row.billing_day as number | undefined,
      nextBillingDate: row.next_billing_date ? (row.next_billing_date as Date).toISOString().split('T')[0] : undefined,
      paymentMethodId: row.payment_method_id as string | undefined,
      paymentMethodType: row.payment_method_type as string | undefined,
      paymentMethodLast4: row.payment_method_last4 as string | undefined,
      cancellationDate: row.cancellation_date ? (row.cancellation_date as Date).toISOString().split('T')[0] : undefined,
      cancellationReason: row.cancellation_reason as string | undefined,
      pauseStartDate: row.pause_start_date ? (row.pause_start_date as Date).toISOString().split('T')[0] : undefined,
      pauseEndDate: row.pause_end_date ? (row.pause_end_date as Date).toISOString().split('T')[0] : undefined,
      enrolledBy: row.enrolled_by as string | undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private mapLoyaltyPoints(row: Record<string, unknown>): LoyaltyPoints {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      patientId: row.patient_id as string,
      pointsBalance: row.points_balance as number,
      lifetimeEarned: row.lifetime_earned as number,
      lifetimeRedeemed: row.lifetime_redeemed as number,
      tier: row.tier as string,
      tierUpdatedAt: row.tier_updated_at ? (row.tier_updated_at as Date).toISOString() : undefined,
      lastActivity: (row.last_activity as Date).toISOString(),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private mapLoyaltyTransaction(row: Record<string, unknown>): LoyaltyTransaction {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      patientId: row.patient_id as string,
      points: row.points as number,
      transactionType: row.transaction_type as LoyaltyTransaction['transactionType'],
      referenceType: row.reference_type as string | undefined,
      referenceId: row.reference_id as string | undefined,
      description: row.description as string | undefined,
      balanceAfter: row.balance_after as number,
      expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : undefined,
      createdBy: row.created_by as string | undefined,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }
}

export const cosmeticService = new CosmeticPackagesService();
