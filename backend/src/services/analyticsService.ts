/**
 * Analytics Service
 * Comprehensive dashboards and analytics for dermatology CRM
 * Provides practice overview, provider performance, revenue analytics,
 * quality measures, operations, patient engagement, and inventory dashboards
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import * as crypto from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface PracticeOverview {
  appointmentsToday: {
    scheduled: number;
    completed: number;
    noShows: number;
    cancelled: number;
  };
  patientsStatus: {
    checkedIn: number;
    waiting: number;
    inRoom: number;
    checkedOut: number;
  };
  revenueToday: number;
  pendingTasksCount: number;
  criticalAlerts: CriticalAlert[];
  providerSummary: ProviderDaySummary[];
}

export interface CriticalAlert {
  id: string;
  type: string;
  message: string;
  severity: string;
  timestamp: string;
  actionUrl?: string;
}

export interface ProviderDaySummary {
  providerId: string;
  providerName: string;
  appointmentsScheduled: number;
  appointmentsCompleted: number;
  patientsWaiting: number;
}

export interface ProviderPerformance {
  providerId: string;
  providerName: string;
  dateRange: DateRange;
  patientsSeen: number;
  uniquePatients: number;
  rvusGenerated: number;
  avgVisitDurationMinutes: number;
  qualityMeasureScores: MeasureScore[];
  avgPatientSatisfaction: number;
  noShowRate: number;
  noShowCount: number;
  revenueGenerated: number;
  completedAppointments: number;
  cancelledAppointments: number;
  encountersCompleted: number;
  avgEncountersPerDay: number;
  comparison?: {
    previousPeriod: Partial<ProviderPerformance>;
    percentChange: Record<string, number>;
  };
}

export interface MeasureScore {
  measureId: string;
  measureName: string;
  score: number;
  benchmark: number;
  gap: number;
}

export interface RevenueAnalytics {
  dateRange: DateRange;
  totalRevenue: number;
  totalCollections: number;
  collectionRate: number;
  arAging: {
    current: number;
    days31_60: number;
    days61_90: number;
    days91Plus: number;
    total: number;
  };
  daysInAR: number;
  denialMetrics: {
    denialRate: number;
    denialCount: number;
    denialAmount: number;
    topDenialReasons: { reason: string; count: number; amount: number }[];
    pendingAppeals: number;
    appealSuccessRate: number;
  };
  payerMix: { payerName: string; amount: number; percentage: number; claimCount: number }[];
  avgDaysToCollect: number;
  paymentPlanMetrics: {
    activePlans: number;
    totalBalance: number;
    monthlyExpected: number;
    onTimePaymentRate: number;
    defaultRate: number;
  };
  underpaymentRecovery: {
    identified: number;
    recovered: number;
    pending: number;
    recoveryRate: number;
  };
  cleanClaimRate: number;
  comparison?: {
    previousPeriod: Partial<RevenueAnalytics>;
    percentChange: Record<string, number>;
  };
}

export interface QualityDashboard {
  dateRange: DateRange;
  mipsEstimatedScore: number;
  mipsComponents: {
    qualityScore: number;
    piScore: number;
    iaScore: number;
    costScore: number;
  };
  measurePerformance: MeasurePerformance[];
  careGapsSummary: {
    total: number;
    byMeasure: { measureId: string; measureName: string; count: number }[];
    byPriority: { priority: string; count: number }[];
  };
  piCompliance: PICompliance[];
  improvementActivities: ImprovementActivity[];
  benchmarkComparison: {
    measureId: string;
    measureName: string;
    practiceScore: number;
    benchmark: number;
    percentile: number;
  }[];
}

export interface MeasurePerformance {
  measureId: string;
  measureName: string;
  numerator: number;
  denominator: number;
  performanceRate: number;
  benchmark: number;
  isHighPriority: boolean;
  trend?: number;
}

export interface PICompliance {
  measureName: string;
  numerator: number;
  denominator: number;
  performanceRate: number;
  isRequired: boolean;
  status: string;
}

export interface ImprovementActivity {
  activityId: string;
  activityName: string;
  weight: string;
  points: number;
  status: string;
}

export interface OperationsDashboard {
  dateRange: DateRange;
  noShowMetrics: {
    rate: number;
    count: number;
    trend: { date: string; rate: number }[];
    byDayOfWeek: { day: string; rate: number }[];
  };
  appointmentUtilization: {
    totalSlots: number;
    bookedSlots: number;
    utilizationRate: number;
    byProvider: { providerId: string; providerName: string; rate: number }[];
    byLocation: { locationId: string; locationName: string; rate: number }[];
  };
  waitTimeMetrics: {
    avgWaitMinutes: number;
    medianWaitMinutes: number;
    maxWaitMinutes: number;
    byProvider: { providerId: string; providerName: string; avgWait: number }[];
    trend: { date: string; avgWait: number }[];
  };
  roomUtilization: {
    totalRooms: number;
    avgUtilizationRate: number;
    byRoom: { roomId: string; roomName: string; utilizationRate: number }[];
  };
  staffUtilization: {
    avgRate: number;
    byStaff: { staffId: string; staffName: string; rate: number }[];
  };
  referralConversion: {
    totalReferrals: number;
    convertedCount: number;
    conversionRate: number;
    avgDaysToConvert: number;
    pendingCount: number;
  };
  waitlistMetrics: {
    totalSize: number;
    avgWaitDays: number;
    byAppointmentType: { typeId: string; typeName: string; count: number }[];
    filledFromWaitlistCount: number;
  };
}

export interface EngagementDashboard {
  dateRange: DateRange;
  surveyMetrics: {
    responseRate: number;
    avgScore: number;
    totalResponses: number;
    byType: { type: string; count: number; avgScore: number }[];
    trend: { date: string; responseRate: number; avgScore: number }[];
  };
  npsMetrics: {
    score: number;
    promoters: number;
    passives: number;
    detractors: number;
    trend: { date: string; score: number }[];
  };
  loyaltyProgram: {
    totalMembers: number;
    byTier: { tier: string; count: number }[];
    pointsEarnedThisPeriod: number;
    pointsRedeemedThisPeriod: number;
    activeRedemptions: number;
  };
  reviewMetrics: {
    avgRating: number;
    totalReviews: number;
    byPlatform: { platform: string; count: number; avgRating: number }[];
    pendingResponses: number;
    responseRate: number;
  };
  recallMetrics: {
    sentCount: number;
    scheduledCount: number;
    successRate: number;
    overdueCount: number;
  };
  portalAdoption: {
    totalPatients: number;
    portalUsers: number;
    adoptionRate: number;
    activeUsersLast30Days: number;
    featureUsage: { feature: string; usageCount: number }[];
  };
}

export interface InventoryDashboard {
  lowStockAlerts: LowStockItem[];
  expiringItems: ExpiringItem[];
  pendingOrders: PendingOrder[];
  topUsedSupplies: TopUsedSupply[];
  inventoryValueByCategory: CategoryValue[];
  summary: {
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    expiringCount: number;
    pendingOrdersCount: number;
    equipmentMaintenanceDue: number;
  };
}

export interface LowStockItem {
  itemId: string;
  itemName: string;
  sku: string;
  currentQuantity: number;
  reorderLevel: number;
  reorderQuantity: number;
  daysUntilStockout?: number;
}

export interface ExpiringItem {
  itemId: string;
  itemName: string;
  lotNumber?: string;
  expirationDate: string;
  daysUntilExpiration: number;
  quantity: number;
}

export interface PendingOrder {
  orderId: string;
  poNumber: string;
  vendorName: string;
  orderDate: string;
  expectedDate: string;
  totalAmount: number;
  status: string;
  itemCount: number;
}

export interface TopUsedSupply {
  itemId: string;
  itemName: string;
  sku: string;
  usageCount: number;
  totalCost: number;
  avgUsagePerDay: number;
}

export interface CategoryValue {
  category: string;
  itemCount: number;
  totalQuantity: number;
  totalValue: number;
}

export interface TrendData {
  dates: string[];
  values: number[];
  label: string;
}

export interface ComparisonResult {
  current: number;
  previous: number;
  percentChange: number;
  trend: 'up' | 'down' | 'flat';
}

export interface KPIWithTarget {
  kpiName: string;
  kpiCategory: string;
  currentValue: number;
  targetValue: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  status: 'green' | 'yellow' | 'red';
  periodType: string;
  trend?: number;
  benchmark?: number;
}

// ============================================================================
// Analytics Service Class
// ============================================================================

export class AnalyticsService {
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes

  // ==========================================================================
  // Practice Overview Dashboard
  // ==========================================================================

  async getPracticeOverview(tenantId: string, date?: string): Promise<PracticeOverview> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [
      appointmentsResult,
      patientStatusResult,
      revenueResult,
      tasksResult,
      alertsResult,
      providerSummaryResult,
    ] = await Promise.all([
      // Appointments today
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status IN ('scheduled', 'checked_in', 'in_progress', 'completed')) as scheduled,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'no_show') as no_shows,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
        FROM appointments
        WHERE tenant_id = $1 AND DATE(scheduled_start) = $2`,
        [tenantId, targetDate]
      ),

      // Patient status
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'checked_in') as checked_in,
          COUNT(*) FILTER (WHERE status = 'checked_in' AND checked_in_at < NOW() - INTERVAL '15 minutes') as waiting,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_room,
          COUNT(*) FILTER (WHERE status = 'completed') as checked_out
        FROM appointments
        WHERE tenant_id = $1 AND DATE(scheduled_start) = $2`,
        [tenantId, targetDate]
      ),

      // Revenue today
      pool.query(
        `SELECT COALESCE(SUM(amount_cents), 0) as revenue
        FROM charges
        WHERE tenant_id = $1 AND DATE(created_at) = $2`,
        [tenantId, targetDate]
      ),

      // Pending tasks
      pool.query(
        `SELECT COUNT(*) as count
        FROM tasks
        WHERE tenant_id = $1 AND status IN ('pending', 'in_progress') AND is_active = true`,
        [tenantId]
      ),

      // Critical alerts - check various conditions
      this.getCriticalAlerts(tenantId),

      // Provider summary
      pool.query(
        `SELECT
          p.id as provider_id,
          p.full_name as provider_name,
          COUNT(*) FILTER (WHERE a.status IN ('scheduled', 'checked_in', 'in_progress', 'completed')) as scheduled,
          COUNT(*) FILTER (WHERE a.status = 'completed') as completed,
          COUNT(*) FILTER (WHERE a.status = 'checked_in' AND a.checked_in_at < NOW() - INTERVAL '10 minutes') as waiting
        FROM providers p
        LEFT JOIN appointments a ON a.provider_id = p.id
          AND a.tenant_id = p.tenant_id
          AND DATE(a.scheduled_start) = $2
        WHERE p.tenant_id = $1 AND p.is_active = true
        GROUP BY p.id, p.full_name`,
        [tenantId, targetDate]
      ),
    ]);

    const appts = appointmentsResult.rows[0];
    const patients = patientStatusResult.rows[0];

    return {
      appointmentsToday: {
        scheduled: parseInt(appts.scheduled) || 0,
        completed: parseInt(appts.completed) || 0,
        noShows: parseInt(appts.no_shows) || 0,
        cancelled: parseInt(appts.cancelled) || 0,
      },
      patientsStatus: {
        checkedIn: parseInt(patients.checked_in) || 0,
        waiting: parseInt(patients.waiting) || 0,
        inRoom: parseInt(patients.in_room) || 0,
        checkedOut: parseInt(patients.checked_out) || 0,
      },
      revenueToday: parseInt(revenueResult.rows[0].revenue) || 0,
      pendingTasksCount: parseInt(tasksResult.rows[0].count) || 0,
      criticalAlerts: alertsResult,
      providerSummary: providerSummaryResult.rows.map((row) => ({
        providerId: row.provider_id,
        providerName: row.provider_name,
        appointmentsScheduled: parseInt(row.scheduled) || 0,
        appointmentsCompleted: parseInt(row.completed) || 0,
        patientsWaiting: parseInt(row.waiting) || 0,
      })),
    };
  }

  private async getCriticalAlerts(tenantId: string): Promise<CriticalAlert[]> {
    const alerts: CriticalAlert[] = [];

    // Check for expiring credentials
    const credentialsResult = await pool.query(
      `SELECT sc.id, u.full_name, sc.credential_type, sc.expiration_date
      FROM staff_credentials sc
      JOIN users u ON u.id = sc.staff_id
      WHERE sc.tenant_id = $1
        AND sc.expiration_date <= CURRENT_DATE + INTERVAL '30 days'
        AND sc.expiration_date >= CURRENT_DATE
      ORDER BY sc.expiration_date ASC
      LIMIT 5`,
      [tenantId]
    );

    for (const row of credentialsResult.rows) {
      alerts.push({
        id: row.id,
        type: 'credential_expiring',
        message: `${row.full_name}'s ${row.credential_type} expires ${row.expiration_date}`,
        severity: 'warning',
        timestamp: new Date().toISOString(),
        actionUrl: `/staff/${row.staff_id}/credentials`,
      });
    }

    // Check for urgent prior auth deadlines
    const priorAuthResult = await pool.query(
      `SELECT id, patient_id, expiration_date
      FROM prior_authorizations
      WHERE tenant_id = $1
        AND status = 'approved'
        AND expiration_date <= CURRENT_DATE + INTERVAL '7 days'
        AND expiration_date >= CURRENT_DATE
      ORDER BY expiration_date ASC
      LIMIT 5`,
      [tenantId]
    );

    for (const row of priorAuthResult.rows) {
      alerts.push({
        id: row.id,
        type: 'prior_auth_expiring',
        message: `Prior authorization expiring ${row.expiration_date}`,
        severity: 'critical',
        timestamp: new Date().toISOString(),
        actionUrl: `/prior-auth/${row.id}`,
      });
    }

    // Check for urgent appeal deadlines
    const appealResult = await pool.query(
      `SELECT id, claim_id, appeal_deadline
      FROM claim_denials
      WHERE tenant_id = $1
        AND appeal_status IN ('pending', 'in_progress')
        AND appeal_deadline <= CURRENT_DATE + INTERVAL '14 days'
        AND appeal_deadline >= CURRENT_DATE
      ORDER BY appeal_deadline ASC
      LIMIT 5`,
      [tenantId]
    );

    for (const row of appealResult.rows) {
      alerts.push({
        id: row.id,
        type: 'appeal_deadline',
        message: `Appeal deadline ${row.appeal_deadline} for claim`,
        severity: 'critical',
        timestamp: new Date().toISOString(),
        actionUrl: `/claims/denials/${row.id}`,
      });
    }

    return alerts.slice(0, 10);
  }

  // ==========================================================================
  // Provider Performance Dashboard
  // ==========================================================================

  async getProviderPerformance(
    tenantId: string,
    providerId: string,
    dateRange: DateRange
  ): Promise<ProviderPerformance> {
    const { startDate, endDate } = dateRange;

    const [
      encountersResult,
      appointmentsResult,
      revenueResult,
      visitDurationResult,
      qualityResult,
      satisfactionResult,
    ] = await Promise.all([
      // Encounters and patients seen
      pool.query(
        `SELECT
          COUNT(*) as total_encounters,
          COUNT(DISTINCT patient_id) as unique_patients
        FROM encounters
        WHERE tenant_id = $1
          AND provider_id = $2
          AND created_at >= $3
          AND created_at <= $4
          AND status = 'signed'`,
        [tenantId, providerId, startDate, endDate]
      ),

      // Appointment metrics
      pool.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE status = 'no_show') as no_shows
        FROM appointments
        WHERE tenant_id = $1
          AND provider_id = $2
          AND scheduled_start >= $3
          AND scheduled_start <= $4`,
        [tenantId, providerId, startDate, endDate]
      ),

      // Revenue
      pool.query(
        `SELECT COALESCE(SUM(c.amount_cents), 0) as revenue
        FROM charges c
        JOIN encounters e ON e.id = c.encounter_id
        WHERE e.tenant_id = $1
          AND e.provider_id = $2
          AND c.created_at >= $3
          AND c.created_at <= $4`,
        [tenantId, providerId, startDate, endDate]
      ),

      // Average visit duration
      pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at)) / 60) as avg_duration
        FROM appointments
        WHERE tenant_id = $1
          AND provider_id = $2
          AND scheduled_start >= $3
          AND scheduled_start <= $4
          AND checked_in_at IS NOT NULL
          AND checked_out_at IS NOT NULL`,
        [tenantId, providerId, startDate, endDate]
      ),

      // Quality measure scores
      pool.query(
        `SELECT
          qm.measure_id,
          qm.measure_name,
          COUNT(*) FILTER (WHERE pmt.numerator_met = true) as numerator,
          COUNT(*) FILTER (WHERE pmt.denominator_met = true) as denominator,
          qm.benchmark_data->>'national_average' as benchmark
        FROM quality_measures qm
        LEFT JOIN patient_measure_tracking pmt ON pmt.measure_id = qm.id
          AND pmt.tenant_id = $1
          AND pmt.provider_id = $2
          AND pmt.evaluated_at >= $3
          AND pmt.evaluated_at <= $4
        WHERE qm.is_active = true AND qm.specialty IN ('dermatology', 'all')
        GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.benchmark_data`,
        [tenantId, providerId, startDate, endDate]
      ),

      // Patient satisfaction
      pool.query(
        `SELECT AVG(overall_score) as avg_score
        FROM patient_surveys
        WHERE tenant_id = $1
          AND provider_id = $2
          AND submitted_at >= $3
          AND submitted_at <= $4`,
        [tenantId, providerId, startDate, endDate]
      ),
    ]);

    // Get provider name
    const providerResult = await pool.query(
      `SELECT full_name FROM providers WHERE id = $1 AND tenant_id = $2`,
      [providerId, tenantId]
    );

    const encounters = encountersResult.rows[0];
    const appointments = appointmentsResult.rows[0];
    const totalAppts = parseInt(appointments.total) || 1;
    const noShows = parseInt(appointments.no_shows) || 0;

    // Calculate days in range for per-day metrics
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysInRange = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculate RVUs (simplified - would need actual RVU table)
    const rvuResult = await pool.query(
      `SELECT COALESCE(SUM(c.units * COALESCE(
        (SELECT rvu FROM cpt_codes WHERE code = c.cpt_code), 1.0
      )), 0) as rvus
      FROM charges c
      JOIN encounters e ON e.id = c.encounter_id
      WHERE e.tenant_id = $1
        AND e.provider_id = $2
        AND c.created_at >= $3
        AND c.created_at <= $4`,
      [tenantId, providerId, startDate, endDate]
    );

    const qualityScores: MeasureScore[] = qualityResult.rows.map((row) => {
      const num = parseInt(row.numerator) || 0;
      const denom = parseInt(row.denominator) || 1;
      const score = (num / denom) * 100;
      const benchmark = parseFloat(row.benchmark) || 75;
      return {
        measureId: row.measure_id,
        measureName: row.measure_name,
        score: Math.round(score * 100) / 100,
        benchmark,
        gap: Math.round((benchmark - score) * 100) / 100,
      };
    });

    return {
      providerId,
      providerName: providerResult.rows[0]?.full_name || 'Unknown',
      dateRange,
      patientsSeen: parseInt(encounters.total_encounters) || 0,
      uniquePatients: parseInt(encounters.unique_patients) || 0,
      rvusGenerated: parseFloat(rvuResult.rows[0]?.rvus) || 0,
      avgVisitDurationMinutes: Math.round(parseFloat(visitDurationResult.rows[0]?.avg_duration) || 0),
      qualityMeasureScores: qualityScores,
      avgPatientSatisfaction: parseFloat(satisfactionResult.rows[0]?.avg_score) || 0,
      noShowRate: Math.round((noShows / totalAppts) * 100 * 100) / 100,
      noShowCount: noShows,
      revenueGenerated: parseInt(revenueResult.rows[0].revenue) || 0,
      completedAppointments: parseInt(appointments.completed) || 0,
      cancelledAppointments: parseInt(appointments.cancelled) || 0,
      encountersCompleted: parseInt(encounters.total_encounters) || 0,
      avgEncountersPerDay: Math.round((parseInt(encounters.total_encounters) || 0) / daysInRange * 100) / 100,
    };
  }

  // ==========================================================================
  // Revenue Analytics Dashboard
  // ==========================================================================

  async getRevenueAnalytics(tenantId: string, dateRange: DateRange): Promise<RevenueAnalytics> {
    const { startDate, endDate } = dateRange;

    const [
      revenueResult,
      arAgingResult,
      daysInARResult,
      denialResult,
      denialReasonsResult,
      appealResult,
      payerMixResult,
      avgDaysResult,
      paymentPlanResult,
      underpaymentResult,
      cleanClaimResult,
    ] = await Promise.all([
      // Total revenue and collections
      pool.query(
        `SELECT
          COALESCE(SUM(amount_cents), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0) as total_collections
        FROM charges
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3`,
        [tenantId, startDate, endDate]
      ),

      // A/R aging
      pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN submitted_at > NOW() - INTERVAL '30 days' THEN total_cents ELSE 0 END), 0) as current_ar,
          COALESCE(SUM(CASE WHEN submitted_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN total_cents ELSE 0 END), 0) as days_31_60,
          COALESCE(SUM(CASE WHEN submitted_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '60 days' THEN total_cents ELSE 0 END), 0) as days_61_90,
          COALESCE(SUM(CASE WHEN submitted_at < NOW() - INTERVAL '90 days' THEN total_cents ELSE 0 END), 0) as days_91_plus,
          COALESCE(SUM(total_cents), 0) as total_ar
        FROM claims
        WHERE tenant_id = $1
          AND status IN ('submitted', 'pending')`,
        [tenantId]
      ),

      // Days in A/R calculation
      pool.query(
        `SELECT
          COALESCE(SUM(total_cents), 0) as total_ar,
          (SELECT COALESCE(SUM(amount_cents), 0) / NULLIF(365, 0)
           FROM charges
           WHERE tenant_id = $1
             AND created_at >= NOW() - INTERVAL '365 days') as daily_revenue
        FROM claims
        WHERE tenant_id = $1
          AND status IN ('submitted', 'pending')`,
        [tenantId]
      ),

      // Denial metrics
      pool.query(
        `SELECT
          COUNT(*) as denial_count,
          COALESCE(SUM(amount_cents), 0) as denial_amount
        FROM claim_denials
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3`,
        [tenantId, startDate, endDate]
      ),

      // Top denial reasons
      pool.query(
        `SELECT
          denial_reason as reason,
          COUNT(*) as count,
          COALESCE(SUM(amount_cents), 0) as amount
        FROM claim_denials
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY denial_reason
        ORDER BY count DESC
        LIMIT 5`,
        [tenantId, startDate, endDate]
      ),

      // Appeal metrics
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE appeal_status IN ('pending', 'in_progress')) as pending_appeals,
          COUNT(*) FILTER (WHERE appeal_status = 'approved') as approved,
          COUNT(*) FILTER (WHERE appeal_status IS NOT NULL) as total_appeals
        FROM claim_denials
        WHERE tenant_id = $1`,
        [tenantId]
      ),

      // Payer mix
      pool.query(
        `SELECT
          COALESCE(c.payer, 'Unknown') as payer_name,
          COALESCE(SUM(c.total_cents), 0) as amount,
          COUNT(*) as claim_count
        FROM claims c
        WHERE c.tenant_id = $1
          AND c.created_at >= $2
          AND c.created_at <= $3
        GROUP BY c.payer
        ORDER BY amount DESC
        LIMIT 10`,
        [tenantId, startDate, endDate]
      ),

      // Average days to collect
      pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - submitted_at)) / 86400) as avg_days
        FROM claims
        WHERE tenant_id = $1
          AND status = 'paid'
          AND submitted_at IS NOT NULL
          AND created_at >= $2
          AND created_at <= $3`,
        [tenantId, startDate, endDate]
      ),

      // Payment plan metrics
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_plans,
          COALESCE(SUM(remaining_amount_cents) FILTER (WHERE status = 'active'), 0) as total_balance,
          COALESCE(SUM(monthly_amount_cents) FILTER (WHERE status = 'active'), 0) as monthly_expected,
          COUNT(*) FILTER (WHERE status = 'defaulted') as defaulted_plans,
          COUNT(*) as total_plans
        FROM payment_plans
        WHERE tenant_id = $1`,
        [tenantId]
      ),

      // Underpayment recovery
      pool.query(
        `SELECT
          COUNT(*) as identified,
          COALESCE(SUM(ABS(variance_cents)), 0) as total_variance,
          COALESCE(SUM(recovered_amount_cents), 0) as recovered,
          COUNT(*) FILTER (WHERE status IN ('identified', 'under_review')) as pending
        FROM underpayments
        WHERE tenant_id = $1`,
        [tenantId]
      ),

      // Clean claim rate
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'paid' AND submitted_at IS NOT NULL) as paid_first,
          COUNT(*) as total_claims
        FROM claims
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3`,
        [tenantId, startDate, endDate]
      ),
    ]);

    const revenue = revenueResult.rows[0];
    const totalRevenue = parseInt(revenue.total_revenue) || 0;
    const totalCollections = parseInt(revenue.total_collections) || 0;
    const collectionRate = totalRevenue > 0 ? (totalCollections / totalRevenue) * 100 : 0;

    const arAging = arAgingResult.rows[0];
    const daysInARData = daysInARResult.rows[0];
    const dailyRevenue = parseFloat(daysInARData.daily_revenue) || 1;
    const totalAR = parseInt(daysInARData.total_ar) || 0;
    const daysInAR = totalAR / dailyRevenue;

    const denials = denialResult.rows[0];
    const totalClaims = parseInt(cleanClaimResult.rows[0].total_claims) || 1;
    const denialRate = (parseInt(denials.denial_count) / totalClaims) * 100;

    const appeals = appealResult.rows[0];
    const totalAppeals = parseInt(appeals.total_appeals) || 1;
    const appealSuccessRate = (parseInt(appeals.approved) / totalAppeals) * 100;

    const payerTotal = payerMixResult.rows.reduce(
      (sum, row) => sum + parseInt(row.amount), 0
    ) || 1;

    const paymentPlans = paymentPlanResult.rows[0];
    const totalPlans = parseInt(paymentPlans.total_plans) || 1;
    const defaultRate = (parseInt(paymentPlans.defaulted_plans) / totalPlans) * 100;

    const underpayments = underpaymentResult.rows[0];
    const totalVariance = parseInt(underpayments.total_variance) || 0;
    const recovered = parseInt(underpayments.recovered) || 0;
    const recoveryRate = totalVariance > 0 ? (recovered / totalVariance) * 100 : 0;

    const paidFirst = parseInt(cleanClaimResult.rows[0].paid_first) || 0;
    const cleanClaimRate = (paidFirst / totalClaims) * 100;

    return {
      dateRange,
      totalRevenue,
      totalCollections,
      collectionRate: Math.round(collectionRate * 100) / 100,
      arAging: {
        current: parseInt(arAging.current_ar) || 0,
        days31_60: parseInt(arAging.days_31_60) || 0,
        days61_90: parseInt(arAging.days_61_90) || 0,
        days91Plus: parseInt(arAging.days_91_plus) || 0,
        total: parseInt(arAging.total_ar) || 0,
      },
      daysInAR: Math.round(daysInAR),
      denialMetrics: {
        denialRate: Math.round(denialRate * 100) / 100,
        denialCount: parseInt(denials.denial_count) || 0,
        denialAmount: parseInt(denials.denial_amount) || 0,
        topDenialReasons: denialReasonsResult.rows.map((row) => ({
          reason: row.reason,
          count: parseInt(row.count),
          amount: parseInt(row.amount),
        })),
        pendingAppeals: parseInt(appeals.pending_appeals) || 0,
        appealSuccessRate: Math.round(appealSuccessRate * 100) / 100,
      },
      payerMix: payerMixResult.rows.map((row) => ({
        payerName: row.payer_name,
        amount: parseInt(row.amount),
        percentage: Math.round((parseInt(row.amount) / payerTotal) * 100 * 100) / 100,
        claimCount: parseInt(row.claim_count),
      })),
      avgDaysToCollect: Math.round(parseFloat(avgDaysResult.rows[0]?.avg_days) || 0),
      paymentPlanMetrics: {
        activePlans: parseInt(paymentPlans.active_plans) || 0,
        totalBalance: parseInt(paymentPlans.total_balance) || 0,
        monthlyExpected: parseInt(paymentPlans.monthly_expected) || 0,
        onTimePaymentRate: 85, // Would need separate tracking
        defaultRate: Math.round(defaultRate * 100) / 100,
      },
      underpaymentRecovery: {
        identified: parseInt(underpayments.identified) || 0,
        recovered,
        pending: parseInt(underpayments.pending) || 0,
        recoveryRate: Math.round(recoveryRate * 100) / 100,
      },
      cleanClaimRate: Math.round(cleanClaimRate * 100) / 100,
    };
  }

  // ==========================================================================
  // Quality Measures Dashboard
  // ==========================================================================

  async getQualityDashboard(tenantId: string, dateRange: DateRange): Promise<QualityDashboard> {
    const { startDate, endDate } = dateRange;
    const year = new Date(startDate).getFullYear();
    const periodStart = `${year}-01-01`;
    const periodEnd = `${year}-12-31`;

    const [
      measurePerformanceResult,
      careGapsResult,
      piResult,
      iaResult,
    ] = await Promise.all([
      // Measure performance
      pool.query(
        `SELECT
          qm.measure_id,
          qm.measure_name,
          qm.high_priority,
          qm.benchmark_data,
          COUNT(*) FILTER (WHERE pmt.numerator_met = true) as numerator,
          COUNT(*) FILTER (WHERE pmt.denominator_met = true) as denominator,
          COUNT(*) FILTER (WHERE pmt.exclusion_applied = true) as exclusions
        FROM quality_measures qm
        LEFT JOIN patient_measure_tracking pmt ON pmt.measure_id = qm.id
          AND pmt.tenant_id = $1
          AND pmt.tracking_period_start >= $2
          AND pmt.tracking_period_end <= $3
        WHERE qm.is_active = true
          AND qm.category = 'quality'
          AND qm.specialty IN ('dermatology', 'all')
        GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.high_priority, qm.benchmark_data`,
        [tenantId, periodStart, periodEnd]
      ),

      // Care gaps
      pool.query(
        `SELECT
          qm.measure_id,
          qm.measure_name,
          qg.priority,
          COUNT(*) as count
        FROM quality_gaps qg
        JOIN quality_measures qm ON qm.id = qg.measure_id
        WHERE qg.tenant_id = $1
          AND qg.status = 'open'
        GROUP BY qm.measure_id, qm.measure_name, qg.priority`,
        [tenantId]
      ),

      // PI tracking
      pool.query(
        `SELECT
          measure_name,
          numerator,
          denominator,
          performance_rate,
          is_required
        FROM promoting_interoperability_tracking
        WHERE tenant_id = $1
          AND tracking_period_start = $2`,
        [tenantId, periodStart]
      ),

      // Improvement activities
      pool.query(
        `SELECT
          activity_id,
          activity_name,
          weight,
          points,
          attestation_status as status
        FROM improvement_activities
        WHERE tenant_id = $1
          AND start_date >= $2`,
        [tenantId, periodStart]
      ),
    ]);

    // Calculate measure performance
    const measurePerformance: MeasurePerformance[] = measurePerformanceResult.rows.map((row) => {
      const num = parseInt(row.numerator) || 0;
      const denom = (parseInt(row.denominator) || 0) - (parseInt(row.exclusions) || 0);
      const rate = denom > 0 ? (num / denom) * 100 : 0;
      const benchmark = parseFloat(row.benchmark_data?.national_average) || 75;

      return {
        measureId: row.measure_id,
        measureName: row.measure_name,
        numerator: num,
        denominator: denom,
        performanceRate: Math.round(rate * 100) / 100,
        benchmark,
        isHighPriority: row.high_priority,
      };
    });

    // Calculate MIPS scores
    const qualityScore = this.calculateQualityScore(measurePerformance);
    const piScore = this.calculatePIScore(piResult.rows);
    const iaScore = this.calculateIAScore(iaResult.rows);
    const costScore = 0; // Calculated by CMS
    const mipsScore = qualityScore * 0.3 + piScore * 0.25 + iaScore * 0.15 + costScore * 0.3;

    // Aggregate care gaps
    const careGapsByMeasure: Record<string, { measureId: string; measureName: string; count: number }> = {};
    const careGapsByPriority: Record<string, number> = { high: 0, medium: 0, low: 0 };
    let totalCareGaps = 0;

    for (const row of careGapsResult.rows) {
      const count = parseInt(row.count);
      totalCareGaps += count;

      if (!careGapsByMeasure[row.measure_id]) {
        careGapsByMeasure[row.measure_id] = {
          measureId: row.measure_id,
          measureName: row.measure_name,
          count: 0,
        };
      }
      const measureGap = careGapsByMeasure[row.measure_id];
      if (measureGap) {
        measureGap.count += count;
      }

      careGapsByPriority[row.priority] = (careGapsByPriority[row.priority] || 0) + count;
    }

    return {
      dateRange,
      mipsEstimatedScore: Math.round(mipsScore * 100) / 100,
      mipsComponents: {
        qualityScore: Math.round(qualityScore * 100) / 100,
        piScore: Math.round(piScore * 100) / 100,
        iaScore: Math.round(iaScore * 100) / 100,
        costScore,
      },
      measurePerformance,
      careGapsSummary: {
        total: totalCareGaps,
        byMeasure: Object.values(careGapsByMeasure),
        byPriority: Object.entries(careGapsByPriority).map(([priority, count]) => ({
          priority,
          count,
        })),
      },
      piCompliance: piResult.rows.map((row) => ({
        measureName: row.measure_name,
        numerator: parseInt(row.numerator) || 0,
        denominator: parseInt(row.denominator) || 0,
        performanceRate: parseFloat(row.performance_rate) || 0,
        isRequired: row.is_required,
        status: parseFloat(row.performance_rate) >= 1 ? 'met' : 'not_met',
      })),
      improvementActivities: iaResult.rows.map((row) => ({
        activityId: row.activity_id,
        activityName: row.activity_name,
        weight: row.weight,
        points: parseInt(row.points) || 0,
        status: row.status,
      })),
      benchmarkComparison: measurePerformance.map((m) => ({
        measureId: m.measureId,
        measureName: m.measureName,
        practiceScore: m.performanceRate,
        benchmark: m.benchmark,
        percentile: this.calculatePercentile(m.performanceRate, m.benchmark),
      })),
    };
  }

  private calculateQualityScore(measures: MeasurePerformance[]): number {
    if (measures.length === 0) return 0;
    const totalPerformance = measures.reduce((sum, m) => sum + m.performanceRate, 0);
    return Math.min(100, totalPerformance / measures.length);
  }

  private calculatePIScore(piData: any[]): number {
    if (piData.length === 0) return 0;
    const requiredMeasures = piData.filter((m) => m.is_required);
    if (requiredMeasures.length === 0) return 0;
    const allMet = requiredMeasures.every((m) => parseFloat(m.performance_rate) >= 1);
    if (!allMet) return 0;
    const totalRate = piData.reduce((sum, m) => sum + (parseFloat(m.performance_rate) || 0), 0);
    return Math.min(100, (totalRate / piData.length) * 10);
  }

  private calculateIAScore(iaData: any[]): number {
    const totalPoints = iaData.reduce((sum, a) => sum + (parseInt(a.points) || 0), 0);
    return Math.min(100, (totalPoints / 40) * 100);
  }

  private calculatePercentile(score: number, benchmark: number): number {
    // Simplified percentile calculation
    if (score >= benchmark * 1.2) return 90;
    if (score >= benchmark * 1.1) return 75;
    if (score >= benchmark) return 50;
    if (score >= benchmark * 0.9) return 25;
    return 10;
  }

  // ==========================================================================
  // Operations Dashboard
  // ==========================================================================

  async getOperationsDashboard(tenantId: string, dateRange: DateRange): Promise<OperationsDashboard> {
    const { startDate, endDate } = dateRange;

    const [
      noShowResult,
      noShowTrendResult,
      utilizationResult,
      waitTimeResult,
      roomResult,
      staffResult,
      referralResult,
      waitlistResult,
    ] = await Promise.all([
      // No-show metrics
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'no_show') as no_shows,
          COUNT(*) as total
        FROM appointments
        WHERE tenant_id = $1
          AND scheduled_start >= $2
          AND scheduled_start <= $3`,
        [tenantId, startDate, endDate]
      ),

      // No-show trend
      pool.query(
        `SELECT
          DATE(scheduled_start) as date,
          COUNT(*) FILTER (WHERE status = 'no_show')::float / NULLIF(COUNT(*), 0) * 100 as rate
        FROM appointments
        WHERE tenant_id = $1
          AND scheduled_start >= $2
          AND scheduled_start <= $3
        GROUP BY DATE(scheduled_start)
        ORDER BY date`,
        [tenantId, startDate, endDate]
      ),

      // Appointment utilization by provider
      pool.query(
        `SELECT
          p.id as provider_id,
          p.full_name as provider_name,
          COUNT(a.id) as booked,
          (SELECT COUNT(*) FROM time_blocks tb
           WHERE tb.provider_id = p.id
             AND tb.block_date >= $2
             AND tb.block_date <= $3
             AND tb.is_available = true) as total_slots
        FROM providers p
        LEFT JOIN appointments a ON a.provider_id = p.id
          AND a.tenant_id = p.tenant_id
          AND a.scheduled_start >= $2
          AND a.scheduled_start <= $3
        WHERE p.tenant_id = $1 AND p.is_active = true
        GROUP BY p.id, p.full_name`,
        [tenantId, startDate, endDate]
      ),

      // Wait time metrics
      pool.query(
        `SELECT
          AVG(EXTRACT(EPOCH FROM (checked_in_at - scheduled_start)) / 60) as avg_wait,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (checked_in_at - scheduled_start)) / 60) as median_wait,
          MAX(EXTRACT(EPOCH FROM (checked_in_at - scheduled_start)) / 60) as max_wait
        FROM appointments
        WHERE tenant_id = $1
          AND scheduled_start >= $2
          AND scheduled_start <= $3
          AND checked_in_at IS NOT NULL
          AND status IN ('checked_in', 'in_progress', 'completed')`,
        [tenantId, startDate, endDate]
      ),

      // Room utilization
      pool.query(
        `SELECT
          r.id as room_id,
          r.name as room_name,
          COUNT(rs.id) as bookings,
          SUM(EXTRACT(EPOCH FROM (rs.end_time - rs.start_time)) / 3600) as hours_used
        FROM rooms r
        LEFT JOIN room_schedules rs ON rs.room_id = r.id
          AND rs.start_time >= $2
          AND rs.start_time <= $3
          AND rs.status != 'cancelled'
        WHERE r.tenant_id = $1
        GROUP BY r.id, r.name`,
        [tenantId, startDate, endDate]
      ),

      // Staff utilization
      pool.query(
        `SELECT
          u.id as staff_id,
          u.full_name as staff_name,
          COALESCE(spm.utilization_percent, 0) as rate
        FROM users u
        LEFT JOIN staff_productivity_metrics spm ON spm.staff_id = u.id
          AND spm.metric_date >= $2
          AND spm.metric_date <= $3
        WHERE u.tenant_id = $1
        GROUP BY u.id, u.full_name, spm.utilization_percent`,
        [tenantId, startDate, endDate]
      ),

      // Referral conversion
      pool.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE appointment_id IS NOT NULL) as converted,
          COUNT(*) FILTER (WHERE status IN ('received', 'verified')) as pending,
          AVG(EXTRACT(EPOCH FROM (scheduled_date - received_at::date)) / 86400) FILTER (WHERE scheduled_date IS NOT NULL) as avg_days
        FROM referrals
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3`,
        [tenantId, startDate, endDate]
      ),

      // Waitlist metrics
      pool.query(
        `SELECT
          COUNT(*) as total,
          AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) as avg_wait_days,
          COUNT(*) FILTER (WHERE status = 'scheduled') as filled
        FROM waitlist
        WHERE tenant_id = $1
          AND status IN ('pending', 'contacted', 'scheduled')`,
        [tenantId]
      ),
    ]);

    const noShow = noShowResult.rows[0];
    const total = parseInt(noShow.total) || 1;
    const noShowCount = parseInt(noShow.no_shows) || 0;
    const noShowRate = (noShowCount / total) * 100;

    const referral = referralResult.rows[0];
    const referralTotal = parseInt(referral.total) || 1;
    const converted = parseInt(referral.converted) || 0;

    const waitlist = waitlistResult.rows[0];

    // Calculate total slots for utilization
    let totalSlots = 0;
    let bookedSlots = 0;
    for (const row of utilizationResult.rows) {
      totalSlots += parseInt(row.total_slots) || 0;
      bookedSlots += parseInt(row.booked) || 0;
    }

    return {
      dateRange,
      noShowMetrics: {
        rate: Math.round(noShowRate * 100) / 100,
        count: noShowCount,
        trend: noShowTrendResult.rows.map((row) => ({
          date: row.date,
          rate: Math.round(parseFloat(row.rate) * 100) / 100,
        })),
        byDayOfWeek: [], // Would need additional query
      },
      appointmentUtilization: {
        totalSlots,
        bookedSlots,
        utilizationRate: totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100 * 100) / 100 : 0,
        byProvider: utilizationResult.rows.map((row) => ({
          providerId: row.provider_id,
          providerName: row.provider_name,
          rate: parseInt(row.total_slots) > 0
            ? Math.round((parseInt(row.booked) / parseInt(row.total_slots)) * 100 * 100) / 100
            : 0,
        })),
        byLocation: [], // Would need additional query
      },
      waitTimeMetrics: {
        avgWaitMinutes: Math.round(parseFloat(waitTimeResult.rows[0]?.avg_wait) || 0),
        medianWaitMinutes: Math.round(parseFloat(waitTimeResult.rows[0]?.median_wait) || 0),
        maxWaitMinutes: Math.round(parseFloat(waitTimeResult.rows[0]?.max_wait) || 0),
        byProvider: [], // Would need additional query
        trend: [],
      },
      roomUtilization: {
        totalRooms: roomResult.rows.length,
        avgUtilizationRate: 0, // Would need total available hours
        byRoom: roomResult.rows.map((row) => ({
          roomId: row.room_id,
          roomName: row.room_name,
          utilizationRate: parseFloat(row.hours_used) || 0,
        })),
      },
      staffUtilization: {
        avgRate: staffResult.rows.length > 0
          ? staffResult.rows.reduce((sum, r) => sum + parseFloat(r.rate), 0) / staffResult.rows.length
          : 0,
        byStaff: staffResult.rows.map((row) => ({
          staffId: row.staff_id,
          staffName: row.staff_name,
          rate: parseFloat(row.rate) || 0,
        })),
      },
      referralConversion: {
        totalReferrals: parseInt(referral.total) || 0,
        convertedCount: converted,
        conversionRate: Math.round((converted / referralTotal) * 100 * 100) / 100,
        avgDaysToConvert: Math.round(parseFloat(referral.avg_days) || 0),
        pendingCount: parseInt(referral.pending) || 0,
      },
      waitlistMetrics: {
        totalSize: parseInt(waitlist.total) || 0,
        avgWaitDays: Math.round(parseFloat(waitlist.avg_wait_days) || 0),
        byAppointmentType: [], // Would need additional query
        filledFromWaitlistCount: parseInt(waitlist.filled) || 0,
      },
    };
  }

  // ==========================================================================
  // Patient Engagement Dashboard
  // ==========================================================================

  async getEngagementDashboard(tenantId: string, dateRange: DateRange): Promise<EngagementDashboard> {
    const { startDate, endDate } = dateRange;

    const [
      surveyResult,
      npsResult,
      loyaltyResult,
      reviewResult,
      recallResult,
      portalResult,
    ] = await Promise.all([
      // Survey metrics
      pool.query(
        `SELECT
          survey_type,
          COUNT(*) as count,
          AVG(overall_score) as avg_score
        FROM patient_surveys
        WHERE tenant_id = $1
          AND submitted_at >= $2
          AND submitted_at <= $3
        GROUP BY survey_type`,
        [tenantId, startDate, endDate]
      ),

      // NPS metrics
      pool.query(
        `SELECT
          nps_score,
          COUNT(*) as count
        FROM patient_surveys
        WHERE tenant_id = $1
          AND nps_score IS NOT NULL
          AND submitted_at >= $2
          AND submitted_at <= $3`,
        [tenantId, startDate, endDate]
      ),

      // Loyalty program metrics
      pool.query(
        `SELECT
          tier,
          COUNT(*) as count,
          SUM(points_balance) as total_points
        FROM patient_loyalty_points
        WHERE tenant_id = $1 AND is_active = true
        GROUP BY tier`,
        [tenantId]
      ),

      // Review metrics
      pool.query(
        `SELECT
          platform,
          COUNT(*) as count,
          AVG(rating) as avg_rating,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_response
        FROM patient_reviews
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY platform`,
        [tenantId, startDate, endDate]
      ),

      // Recall metrics
      pool.query(
        `SELECT
          COUNT(*) as total_sent,
          COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue
        FROM reminders
        WHERE tenant_id = $1
          AND type = 'recall'
          AND created_at >= $2
          AND created_at <= $3`,
        [tenantId, startDate, endDate]
      ),

      // Portal adoption
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM patients WHERE tenant_id = $1) as total_patients,
          (SELECT COUNT(*) FROM patient_portal_accounts WHERE tenant_id = $1 AND is_active = true) as portal_users,
          (SELECT COUNT(*) FROM patient_portal_accounts
           WHERE tenant_id = $1 AND is_active = true
             AND last_login_at >= NOW() - INTERVAL '30 days') as active_30_days`,
        [tenantId]
      ),
    ]);

    // Calculate NPS
    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    for (const row of npsResult.rows) {
      const score = parseInt(row.nps_score);
      const count = parseInt(row.count);
      if (score >= 9) promoters += count;
      else if (score >= 7) passives += count;
      else detractors += count;
    }
    const totalNPS = promoters + passives + detractors || 1;
    const npsScore = ((promoters - detractors) / totalNPS) * 100;

    // Survey totals
    const totalSurveyResponses = surveyResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);

    // Review totals
    const totalReviews = reviewResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    const pendingResponses = reviewResult.rows.reduce((sum, r) => sum + parseInt(r.pending_response || 0), 0);
    const avgRating = totalReviews > 0
      ? reviewResult.rows.reduce((sum, r) => sum + parseFloat(r.avg_rating) * parseInt(r.count), 0) / totalReviews
      : 0;

    // Loyalty totals
    const totalMembers = loyaltyResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);

    const portal = portalResult.rows[0];
    const totalPatients = parseInt(portal.total_patients) || 1;
    const portalUsers = parseInt(portal.portal_users) || 0;

    const recall = recallResult.rows[0];
    const sentCount = parseInt(recall?.total_sent) || 0;
    const scheduledCount = parseInt(recall?.scheduled) || 0;

    return {
      dateRange,
      surveyMetrics: {
        responseRate: 0, // Would need to calculate based on sent surveys
        avgScore: totalSurveyResponses > 0
          ? surveyResult.rows.reduce((sum, r) => sum + parseFloat(r.avg_score) * parseInt(r.count), 0) / totalSurveyResponses
          : 0,
        totalResponses: totalSurveyResponses,
        byType: surveyResult.rows.map((row) => ({
          type: row.survey_type,
          count: parseInt(row.count),
          avgScore: parseFloat(row.avg_score) || 0,
        })),
        trend: [],
      },
      npsMetrics: {
        score: Math.round(npsScore),
        promoters,
        passives,
        detractors,
        trend: [],
      },
      loyaltyProgram: {
        totalMembers,
        byTier: loyaltyResult.rows.map((row) => ({
          tier: row.tier,
          count: parseInt(row.count),
        })),
        pointsEarnedThisPeriod: 0, // Would need transaction query
        pointsRedeemedThisPeriod: 0,
        activeRedemptions: 0,
      },
      reviewMetrics: {
        avgRating: Math.round(avgRating * 100) / 100,
        totalReviews,
        byPlatform: reviewResult.rows.map((row) => ({
          platform: row.platform,
          count: parseInt(row.count),
          avgRating: parseFloat(row.avg_rating) || 0,
        })),
        pendingResponses,
        responseRate: totalReviews > 0 ? ((totalReviews - pendingResponses) / totalReviews) * 100 : 0,
      },
      recallMetrics: {
        sentCount,
        scheduledCount,
        successRate: sentCount > 0 ? (scheduledCount / sentCount) * 100 : 0,
        overdueCount: parseInt(recall?.overdue) || 0,
      },
      portalAdoption: {
        totalPatients,
        portalUsers,
        adoptionRate: Math.round((portalUsers / totalPatients) * 100 * 100) / 100,
        activeUsersLast30Days: parseInt(portal.active_30_days) || 0,
        featureUsage: [],
      },
    };
  }

  // ==========================================================================
  // Inventory Dashboard
  // ==========================================================================

  async getInventoryDashboard(tenantId: string): Promise<InventoryDashboard> {
    const [
      lowStockResult,
      expiringResult,
      pendingOrdersResult,
      topUsedResult,
      categoryValueResult,
      summaryResult,
    ] = await Promise.all([
      // Low stock items
      pool.query(
        `SELECT
          id as item_id,
          name as item_name,
          sku,
          quantity as current_quantity,
          reorder_level,
          reorder_quantity
        FROM inventory_items
        WHERE tenant_id = $1
          AND quantity <= reorder_level
        ORDER BY (quantity - reorder_level) ASC
        LIMIT 20`,
        [tenantId]
      ),

      // Expiring items
      pool.query(
        `SELECT
          i.id as item_id,
          i.name as item_name,
          l.lot_number,
          l.expiration_date,
          (l.expiration_date - CURRENT_DATE) as days_until_expiration,
          l.quantity
        FROM inventory_lots l
        JOIN inventory_items i ON i.id = l.item_id
        WHERE i.tenant_id = $1
          AND l.expiration_date IS NOT NULL
          AND l.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
          AND l.status = 'active'
          AND l.quantity > 0
        ORDER BY l.expiration_date ASC
        LIMIT 20`,
        [tenantId]
      ),

      // Pending orders
      pool.query(
        `SELECT
          po.id as order_id,
          po.po_number,
          v.name as vendor_name,
          po.order_date,
          po.expected_date,
          po.total_amount_cents as total_amount,
          po.status,
          (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count
        FROM purchase_orders po
        JOIN vendors v ON v.id = po.vendor_id
        WHERE po.tenant_id = $1
          AND po.status IN ('submitted', 'partial')
        ORDER BY po.expected_date ASC
        LIMIT 10`,
        [tenantId]
      ),

      // Top used supplies (last 30 days)
      pool.query(
        `SELECT
          i.id as item_id,
          i.name as item_name,
          i.sku,
          COUNT(*) as usage_count,
          SUM(u.quantity_used * u.unit_cost_cents) as total_cost,
          COUNT(*)::float / 30 as avg_per_day
        FROM inventory_usage u
        JOIN inventory_items i ON i.id = u.item_id
        WHERE u.tenant_id = $1
          AND u.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY i.id, i.name, i.sku
        ORDER BY usage_count DESC
        LIMIT 10`,
        [tenantId]
      ),

      // Inventory value by category
      pool.query(
        `SELECT
          category,
          COUNT(*) as item_count,
          SUM(quantity) as total_quantity,
          SUM(quantity * unit_cost_cents) as total_value
        FROM inventory_items
        WHERE tenant_id = $1
        GROUP BY category
        ORDER BY total_value DESC`,
        [tenantId]
      ),

      // Summary stats
      pool.query(
        `SELECT
          COUNT(*) as total_items,
          SUM(quantity * unit_cost_cents) as total_value,
          COUNT(*) FILTER (WHERE quantity <= reorder_level) as low_stock_count,
          (SELECT COUNT(*) FROM inventory_lots l
           JOIN inventory_items i ON i.id = l.item_id
           WHERE i.tenant_id = $1
             AND l.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
             AND l.status = 'active') as expiring_count,
          (SELECT COUNT(*) FROM purchase_orders
           WHERE tenant_id = $1 AND status IN ('submitted', 'partial')) as pending_orders,
          (SELECT COUNT(*) FROM equipment
           WHERE tenant_id = $1
             AND next_maintenance <= CURRENT_DATE + INTERVAL '30 days') as maintenance_due
        FROM inventory_items
        WHERE tenant_id = $1`,
        [tenantId]
      ),
    ]);

    const summary = summaryResult.rows[0];

    return {
      lowStockAlerts: lowStockResult.rows.map((row) => ({
        itemId: row.item_id,
        itemName: row.item_name,
        sku: row.sku,
        currentQuantity: parseInt(row.current_quantity),
        reorderLevel: parseInt(row.reorder_level),
        reorderQuantity: parseInt(row.reorder_quantity),
      })),
      expiringItems: expiringResult.rows.map((row) => ({
        itemId: row.item_id,
        itemName: row.item_name,
        lotNumber: row.lot_number,
        expirationDate: row.expiration_date,
        daysUntilExpiration: parseInt(row.days_until_expiration),
        quantity: parseInt(row.quantity),
      })),
      pendingOrders: pendingOrdersResult.rows.map((row) => ({
        orderId: row.order_id,
        poNumber: row.po_number,
        vendorName: row.vendor_name,
        orderDate: row.order_date,
        expectedDate: row.expected_date,
        totalAmount: parseInt(row.total_amount),
        status: row.status,
        itemCount: parseInt(row.item_count),
      })),
      topUsedSupplies: topUsedResult.rows.map((row) => ({
        itemId: row.item_id,
        itemName: row.item_name,
        sku: row.sku,
        usageCount: parseInt(row.usage_count),
        totalCost: parseInt(row.total_cost),
        avgUsagePerDay: parseFloat(row.avg_per_day),
      })),
      inventoryValueByCategory: categoryValueResult.rows.map((row) => ({
        category: row.category,
        itemCount: parseInt(row.item_count),
        totalQuantity: parseInt(row.total_quantity),
        totalValue: parseInt(row.total_value),
      })),
      summary: {
        totalItems: parseInt(summary.total_items) || 0,
        totalValue: parseInt(summary.total_value) || 0,
        lowStockCount: parseInt(summary.low_stock_count) || 0,
        expiringCount: parseInt(summary.expiring_count) || 0,
        pendingOrdersCount: parseInt(summary.pending_orders) || 0,
        equipmentMaintenanceDue: parseInt(summary.maintenance_due) || 0,
      },
    };
  }

  // ==========================================================================
  // KPI Calculations
  // ==========================================================================

  async getKPIsWithTargets(tenantId: string): Promise<KPIWithTarget[]> {
    const [targetsResult, metricsResult] = await Promise.all([
      pool.query(
        `SELECT
          kpi_name,
          kpi_category,
          target_value,
          warning_threshold,
          critical_threshold,
          period_type,
          target_type
        FROM kpi_targets
        WHERE tenant_id = $1
          AND is_active = true
          AND effective_date <= CURRENT_DATE
          AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
        [tenantId]
      ),
      // Get actual metrics - this would be replaced with actual calculations
      pool.query(
        `SELECT
          metric_name,
          value
        FROM daily_metrics
        WHERE tenant_id = $1
          AND metric_date = CURRENT_DATE`,
        [tenantId]
      ),
    ]);

    const metricsMap = new Map(metricsResult.rows.map((r) => [r.metric_name, parseFloat(r.value)]));

    return targetsResult.rows.map((target) => {
      const currentValue = metricsMap.get(target.kpi_name) || 0;
      const targetValue = parseFloat(target.target_value);
      const warningThreshold = target.warning_threshold ? parseFloat(target.warning_threshold) : undefined;
      const criticalThreshold = target.critical_threshold ? parseFloat(target.critical_threshold) : undefined;

      // Determine status
      let status: 'green' | 'yellow' | 'red' = 'green';
      if (target.target_type === 'minimum') {
        if (criticalThreshold && currentValue <= criticalThreshold) status = 'red';
        else if (warningThreshold && currentValue <= warningThreshold) status = 'yellow';
        else if (currentValue < targetValue) status = 'yellow';
      } else if (target.target_type === 'maximum') {
        if (criticalThreshold && currentValue >= criticalThreshold) status = 'red';
        else if (warningThreshold && currentValue >= warningThreshold) status = 'yellow';
        else if (currentValue > targetValue) status = 'yellow';
      }

      return {
        kpiName: target.kpi_name,
        kpiCategory: target.kpi_category,
        currentValue,
        targetValue,
        warningThreshold,
        criticalThreshold,
        status,
        periodType: target.period_type,
      };
    });
  }

  // ==========================================================================
  // Trend and Comparison Methods
  // ==========================================================================

  async getTrendData(
    tenantId: string,
    metricName: string,
    dateRange: DateRange,
    granularity: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<TrendData> {
    const { startDate, endDate } = dateRange;

    let dateFormat: string;
    switch (granularity) {
      case 'weekly':
        dateFormat = 'YYYY-WW';
        break;
      case 'monthly':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    const result = await pool.query(
      `SELECT
        TO_CHAR(metric_date, $4) as period,
        AVG(value) as avg_value
      FROM daily_metrics
      WHERE tenant_id = $1
        AND metric_name = $2
        AND metric_date >= $3
        AND metric_date <= $4
      GROUP BY TO_CHAR(metric_date, $4)
      ORDER BY period`,
      [tenantId, metricName, startDate, endDate]
    );

    return {
      label: metricName,
      dates: result.rows.map((r) => r.period),
      values: result.rows.map((r) => parseFloat(r.avg_value) || 0),
    };
  }

  async comparePeriods(
    tenantId: string,
    metricName: string,
    currentRange: DateRange,
    previousRange: DateRange
  ): Promise<ComparisonResult> {
    const [currentResult, previousResult] = await Promise.all([
      pool.query(
        `SELECT AVG(value) as avg_value
        FROM daily_metrics
        WHERE tenant_id = $1
          AND metric_name = $2
          AND metric_date >= $3
          AND metric_date <= $4`,
        [tenantId, metricName, currentRange.startDate, currentRange.endDate]
      ),
      pool.query(
        `SELECT AVG(value) as avg_value
        FROM daily_metrics
        WHERE tenant_id = $1
          AND metric_name = $2
          AND metric_date >= $3
          AND metric_date <= $4`,
        [tenantId, metricName, previousRange.startDate, previousRange.endDate]
      ),
    ]);

    const current = parseFloat(currentResult.rows[0]?.avg_value) || 0;
    const previous = parseFloat(previousResult.rows[0]?.avg_value) || 0;
    const percentChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    return {
      current,
      previous,
      percentChange: Math.round(percentChange * 100) / 100,
      trend: percentChange > 1 ? 'up' : percentChange < -1 ? 'down' : 'flat',
    };
  }

  // ==========================================================================
  // Report Management
  // ==========================================================================

  async saveReport(
    tenantId: string,
    userId: string,
    report: {
      name: string;
      description?: string;
      reportType: string;
      filters: Record<string, any>;
      columns?: string[];
      sortBy?: string;
      sortOrder?: string;
      groupBy?: string[];
      isPublic?: boolean;
    }
  ): Promise<string> {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO saved_reports (
        id, tenant_id, name, description, report_type, filters,
        columns, sort_by, sort_order, group_by, is_public, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        tenantId,
        report.name,
        report.description || null,
        report.reportType,
        JSON.stringify(report.filters),
        JSON.stringify(report.columns || []),
        report.sortBy || null,
        report.sortOrder || 'DESC',
        report.groupBy || null,
        report.isPublic || false,
        userId,
      ]
    );

    logger.info('Saved report', { tenantId, reportId: id, name: report.name });
    return id;
  }

  async getSavedReports(tenantId: string, userId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT sr.*, u.full_name as created_by_name
      FROM saved_reports sr
      JOIN users u ON u.id = sr.created_by
      WHERE sr.tenant_id = $1
        AND (sr.created_by = $2 OR sr.is_public = true)
      ORDER BY sr.updated_at DESC`,
      [tenantId, userId]
    );

    return result.rows;
  }

  async getReport(tenantId: string, reportId: string): Promise<any> {
    const result = await pool.query(
      `SELECT * FROM saved_reports WHERE id = $1 AND tenant_id = $2`,
      [reportId, tenantId]
    );

    return result.rows[0] || null;
  }

  async runReport(tenantId: string, reportId: string): Promise<any> {
    const report = await this.getReport(tenantId, reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    // Update run count
    await pool.query(
      `UPDATE saved_reports
      SET last_run_at = NOW(), run_count = run_count + 1
      WHERE id = $1`,
      [reportId]
    );

    // Execute report based on type
    const filters = report.filters;
    const dateRange: DateRange = {
      startDate: filters.dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: filters.dateRange?.end || new Date().toISOString().split('T')[0],
    };

    switch (report.report_type) {
      case 'revenue':
        return this.getRevenueAnalytics(tenantId, dateRange);
      case 'quality':
        return this.getQualityDashboard(tenantId, dateRange);
      case 'operations':
        return this.getOperationsDashboard(tenantId, dateRange);
      case 'provider':
        if (filters.providerId) {
          return this.getProviderPerformance(tenantId, filters.providerId, dateRange);
        }
        break;
      case 'engagement':
        return this.getEngagementDashboard(tenantId, dateRange);
      default:
        throw new Error(`Unknown report type: ${report.report_type}`);
    }
  }

  // ==========================================================================
  // Widget Management
  // ==========================================================================

  async getWidgets(tenantId: string, dashboardType: string, userId?: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM dashboard_widgets
      WHERE tenant_id = $1
        AND dashboard_type = $2
        AND (user_id = $3 OR user_id IS NULL)
        AND is_visible = true
      ORDER BY position ASC`,
      [tenantId, dashboardType, userId || null]
    );

    return result.rows;
  }

  async updateWidget(
    tenantId: string,
    widgetId: string,
    updates: { position?: number; isVisible?: boolean; config?: Record<string, any> }
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [widgetId, tenantId];
    let paramIndex = 3;

    if (updates.position !== undefined) {
      setClauses.push(`position = $${paramIndex++}`);
      params.push(updates.position);
    }
    if (updates.isVisible !== undefined) {
      setClauses.push(`is_visible = $${paramIndex++}`);
      params.push(updates.isVisible);
    }
    if (updates.config !== undefined) {
      setClauses.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(updates.config));
    }

    if (setClauses.length > 0) {
      await pool.query(
        `UPDATE dashboard_widgets SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
        params
      );
    }
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  async getCached<T>(tenantId: string, cacheKey: string): Promise<T | null> {
    const result = await pool.query(
      `SELECT data FROM analytics_cache
      WHERE tenant_id = $1 AND cache_key = $2 AND expires_at > NOW()`,
      [tenantId, cacheKey]
    );

    return result.rows[0]?.data || null;
  }

  async setCache(tenantId: string, cacheKey: string, data: any, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.CACHE_TTL_SECONDS;
    await pool.query(
      `INSERT INTO analytics_cache (tenant_id, cache_key, data, expires_at)
      VALUES ($1, $2, $3, NOW() + $4 * INTERVAL '1 second')
      ON CONFLICT (tenant_id, cache_key)
      DO UPDATE SET data = $3, expires_at = NOW() + $4 * INTERVAL '1 second', created_at = NOW()`,
      [tenantId, cacheKey, JSON.stringify(data), ttl]
    );
  }

  async invalidateCache(tenantId: string, pattern?: string): Promise<void> {
    if (pattern) {
      await pool.query(
        `DELETE FROM analytics_cache WHERE tenant_id = $1 AND cache_key LIKE $2`,
        [tenantId, `%${pattern}%`]
      );
    } else {
      await pool.query(
        `DELETE FROM analytics_cache WHERE tenant_id = $1`,
        [tenantId]
      );
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
