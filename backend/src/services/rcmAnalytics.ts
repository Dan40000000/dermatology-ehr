import { pool } from '../db/pool';

export interface RCMKPIs {
  totalCharges: number;
  totalCollections: number;
  collectionRate: number;
  daysInAR: number;
  denialRate: number;
  cleanClaimRate: number;
  netCollectionRate: number;
  totalAR: number;
}

export interface ARAgingData {
  current: number;
  days31_60: number;
  days61_90: number;
  days91_120: number;
  days120Plus: number;
  total: number;
}

export interface CollectionsTrendItem {
  date: string;
  collections: number;
  charges: number;
  gap: number;
}

export interface DenialReasonItem {
  reason: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface PayerPerformance {
  payerName: string;
  charges: number;
  payments: number;
  denials: number;
  denialRate: number;
  avgDaysToPay: number;
  collectionRate: number;
}

export interface ProviderProductivity {
  providerId: string;
  providerName: string;
  encounters: number;
  patients: number;
  charges: number;
  collections: number;
  chargesPerPatient: number;
  collectionRate: number;
  denialRate: number;
}

export interface ActionItem {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string;
  patientId?: string;
  patientName?: string;
  amountCents?: number;
  dueDate?: string;
  status: string;
}

export interface FinancialEvent {
  date: string;
  type: string;
  description: string;
  amountCents?: number;
  status: string;
}

export class RCMAnalyticsService {
  /**
   * Calculate Key Performance Indicators
   */
  static async calculateKPIs(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    previousStartDate: Date,
    previousEndDate: Date
  ): Promise<{ current: RCMKPIs; previous: RCMKPIs }> {
    const currentKPIs = await this.calculatePeriodKPIs(tenantId, startDate, endDate);
    const previousKPIs = await this.calculatePeriodKPIs(tenantId, previousStartDate, previousEndDate);

    return { current: currentKPIs, previous: previousKPIs };
  }

  private static async calculatePeriodKPIs(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RCMKPIs> {
    // Total Charges
    const chargesResult = await pool.query(
      `select coalesce(sum(total_charges_cents), 0) as total
       from bills
       where tenant_id = $1 and bill_date >= $2 and bill_date <= $3`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );
    const totalCharges = parseInt(chargesResult.rows[0].total);

    // Total Collections (insurance + patient)
    const insuranceResult = await pool.query(
      `select coalesce(sum(applied_amount_cents), 0) as total
       from payer_payments
       where tenant_id = $1 and payment_date >= $2 and payment_date <= $3`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    const patientResult = await pool.query(
      `select coalesce(sum(amount_cents), 0) as total
       from patient_payments
       where tenant_id = $1 and payment_date >= $2 and payment_date <= $3 and status = 'posted'`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    const totalCollections = parseInt(insuranceResult.rows[0].total) + parseInt(patientResult.rows[0].total);

    // Collection Rate
    const collectionRate = totalCharges > 0 ? (totalCollections / totalCharges) * 100 : 0;

    // Days in A/R (weighted average age of receivables)
    const arResult = await pool.query(
      `select
        coalesce(avg(extract(epoch from (current_date - bill_date)) / 86400), 0)::numeric as avg_days,
        coalesce(sum(balance_cents), 0) as total_ar
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')`,
      [tenantId]
    );
    const daysInAR = parseFloat(arResult.rows[0].avg_days);
    const totalAR = parseInt(arResult.rows[0].total_ar);

    // Denial Rate
    const claimsResult = await pool.query(
      `select
        count(*) as total,
        count(*) filter (where status = 'rejected') as denied
       from claims
       where tenant_id = $1 and submitted_at >= $2 and submitted_at <= $3`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );
    const totalClaims = parseInt(claimsResult.rows[0].total);
    const deniedClaims = parseInt(claimsResult.rows[0].denied);
    const denialRate = totalClaims > 0 ? (deniedClaims / totalClaims) * 100 : 0;

    // Clean Claim Rate (first-pass acceptance)
    const cleanClaimsResult = await pool.query(
      `select count(*) as clean
       from claims c
       where c.tenant_id = $1
         and c.submitted_at >= $2
         and c.submitted_at <= $3
         and c.status in ('accepted', 'paid')
         and not exists (
           select 1 from claim_status_history csh
           where csh.claim_id = c.id and csh.status = 'rejected'
         )`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );
    const cleanClaims = parseInt(cleanClaimsResult.rows[0].clean);
    const cleanClaimRate = totalClaims > 0 ? (cleanClaims / totalClaims) * 100 : 100;

    // Net Collection Rate (collections / (charges - contractual adjustments))
    const netCollectionRate = collectionRate; // Simplified for now

    return {
      totalCharges,
      totalCollections,
      collectionRate,
      daysInAR,
      denialRate,
      cleanClaimRate,
      netCollectionRate,
      totalAR,
    };
  }

  /**
   * Get A/R Aging breakdown
   */
  static async getARAgingData(tenantId: string): Promise<ARAgingData> {
    const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const date60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const date120 = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `select
        coalesce(sum(case when bill_date >= $2 then balance_cents else 0 end), 0) as current,
        coalesce(sum(case when bill_date < $2 and bill_date >= $3 then balance_cents else 0 end), 0) as days31_60,
        coalesce(sum(case when bill_date < $3 and bill_date >= $4 then balance_cents else 0 end), 0) as days61_90,
        coalesce(sum(case when bill_date < $4 and bill_date >= $5 then balance_cents else 0 end), 0) as days91_120,
        coalesce(sum(case when bill_date < $5 then balance_cents else 0 end), 0) as days120_plus
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')`,
      [
        tenantId,
        date30.toISOString().split('T')[0],
        date60.toISOString().split('T')[0],
        date90.toISOString().split('T')[0],
        date120.toISOString().split('T')[0],
      ]
    );

    const row = result.rows[0];
    const current = parseInt(row.current);
    const days31_60 = parseInt(row.days31_60);
    const days61_90 = parseInt(row.days61_90);
    const days91_120 = parseInt(row.days91_120);
    const days120Plus = parseInt(row.days120_plus);
    const total = current + days31_60 + days61_90 + days91_120 + days120Plus;

    return {
      current,
      days31_60,
      days61_90,
      days91_120,
      days120Plus,
      total,
    };
  }

  /**
   * Get collections trend over time
   */
  static async getCollectionsTrend(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): Promise<CollectionsTrendItem[]> {
    let dateFormat: string;
    let interval: string;

    switch (granularity) {
      case 'daily':
        dateFormat = 'YYYY-MM-DD';
        interval = '1 day';
        break;
      case 'weekly':
        dateFormat = 'YYYY-"W"IW';
        interval = '1 week';
        break;
      case 'monthly':
      default:
        dateFormat = 'YYYY-MM';
        interval = '1 month';
        break;
    }

    const result = await pool.query(
      `with date_series as (
        select generate_series($2::date, $3::date, $4::interval)::date as period_date
      ),
      collections as (
        select
          date_trunc($5, payment_date)::date as period,
          sum(applied_amount_cents) as insurance_collections
        from payer_payments
        where tenant_id = $1 and payment_date >= $2 and payment_date <= $3
        group by date_trunc($5, payment_date)
        union all
        select
          date_trunc($5, payment_date)::date as period,
          sum(amount_cents) as patient_collections
        from patient_payments
        where tenant_id = $1 and payment_date >= $2 and payment_date <= $3 and status = 'posted'
        group by date_trunc($5, payment_date)
      ),
      charges as (
        select
          date_trunc($5, bill_date)::date as period,
          sum(total_charges_cents) as total_charges
        from bills
        where tenant_id = $1 and bill_date >= $2 and bill_date <= $3
        group by date_trunc($5, bill_date)
      )
      select
        to_char(ds.period_date, $6) as date,
        coalesce(sum(col.insurance_collections + col.patient_collections), 0) as collections,
        coalesce(ch.total_charges, 0) as charges,
        coalesce(ch.total_charges, 0) - coalesce(sum(col.insurance_collections + col.patient_collections), 0) as gap
      from date_series ds
      left join collections col on date_trunc($5, col.period)::date = ds.period_date
      left join charges ch on date_trunc($5, ch.period)::date = ds.period_date
      group by ds.period_date, ch.total_charges
      order by ds.period_date`,
      [
        tenantId,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        interval,
        granularity,
        dateFormat,
      ]
    );

    return result.rows.map((row) => ({
      date: row.date,
      collections: parseInt(row.collections),
      charges: parseInt(row.charges),
      gap: parseInt(row.gap),
    }));
  }

  /**
   * Get denial analysis
   */
  static async getDenialAnalysis(tenantId: string, startDate: Date, endDate: Date): Promise<{
    topReasons: DenialReasonItem[];
    totalDenials: number;
    totalDenialAmount: number;
    recoveryRate: number;
  }> {
    // Get top denial reasons (simulated - in real system would come from claims)
    const denialReasonsResult = await pool.query(
      `select
        'Missing Prior Authorization' as reason,
        count(*) filter (where status = 'rejected') * 3 / 10 as count,
        sum(total_cents) filter (where status = 'rejected') * 3 / 10 as amount
       from claims
       where tenant_id = $1 and submitted_at >= $2 and submitted_at <= $3
       union all
       select
        'Missing or Invalid Modifier' as reason,
        count(*) filter (where status = 'rejected') * 3 / 10 as count,
        sum(total_cents) filter (where status = 'rejected') * 3 / 10 as amount
       from claims
       where tenant_id = $1 and submitted_at >= $2 and submitted_at <= $3
       union all
       select
        'Cosmetic Service Flag' as reason,
        count(*) filter (where status = 'rejected') * 2 / 10 as count,
        sum(total_cents) filter (where status = 'rejected') * 2 / 10 as amount
       from claims
       where tenant_id = $1 and submitted_at >= $2 and submitted_at <= $3
       union all
       select
        'Duplicate Claim' as reason,
        count(*) filter (where status = 'rejected') * 1 / 10 as count,
        sum(total_cents) filter (where status = 'rejected') * 1 / 10 as amount
       from claims
       where tenant_id = $1 and submitted_at >= $2 and submitted_at <= $3
       union all
       select
        'Other/Not Specified' as reason,
        count(*) filter (where status = 'rejected') * 1 / 10 as count,
        sum(total_cents) filter (where status = 'rejected') * 1 / 10 as amount
       from claims
       where tenant_id = $1 and submitted_at >= $2 and submitted_at <= $3`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    const totalDenialsResult = await pool.query(
      `select
        count(*) filter (where status = 'rejected') as total_denials,
        coalesce(sum(total_cents) filter (where status = 'rejected'), 0) as total_amount
       from claims
       where tenant_id = $1 and submitted_at >= $2 and submitted_at <= $3`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    const totalDenials = parseInt(totalDenialsResult.rows[0].total_denials);
    const totalDenialAmount = parseInt(totalDenialsResult.rows[0].total_amount);

    const topReasons = denialReasonsResult.rows
      .map((row) => ({
        reason: row.reason,
        count: parseInt(row.count) || 0,
        amount: parseInt(row.amount) || 0,
        percentage: totalDenials > 0 ? ((parseInt(row.count) || 0) / totalDenials) * 100 : 0,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recovery rate (simulated - in real system would track appeals)
    const recoveryRate = 35.0; // 35% recovery on appealed denials

    return {
      topReasons,
      totalDenials,
      totalDenialAmount,
      recoveryRate,
    };
  }

  /**
   * Get payer performance mix
   */
  static async getPayerPerformance(tenantId: string, startDate: Date, endDate: Date): Promise<PayerPerformance[]> {
    const result = await pool.query(
      `select
        coalesce(p.insurance_plan_name, 'Self-Pay') as payer_name,
        count(distinct b.id) as claim_count,
        coalesce(sum(b.total_charges_cents), 0) as charges,
        coalesce(sum(pp.applied_amount_cents), 0) as payments,
        count(*) filter (where c.status = 'rejected') as denials,
        avg(extract(epoch from (pp.payment_date - b.bill_date)) / 86400)::int as avg_days
       from bills b
       join patients p on p.id = b.patient_id
       left join claims c on c.tenant_id = b.tenant_id
       left join payer_payments pp on pp.payer_name = p.insurance_plan_name and pp.tenant_id = b.tenant_id
       where b.tenant_id = $1
         and b.bill_date >= $2
         and b.bill_date <= $3
       group by coalesce(p.insurance_plan_name, 'Self-Pay')
       having count(distinct b.id) > 0
       order by charges desc
       limit 10`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    return result.rows.map((row) => {
      const charges = parseInt(row.charges);
      const payments = parseInt(row.payments);
      const denials = parseInt(row.denials);
      const claimCount = parseInt(row.claim_count);

      return {
        payerName: row.payer_name,
        charges,
        payments,
        denials,
        denialRate: claimCount > 0 ? (denials / claimCount) * 100 : 0,
        avgDaysToPay: parseInt(row.avg_days) || 0,
        collectionRate: charges > 0 ? (payments / charges) * 100 : 0,
      };
    });
  }

  /**
   * Get provider productivity metrics
   */
  static async getProviderProductivity(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProviderProductivity[]> {
    const result = await pool.query(
      `select
        pr.id as provider_id,
        pr.full_name as provider_name,
        count(distinct e.id) as encounters,
        count(distinct e.patient_id) as patients,
        coalesce(sum(c.fee_cents * c.quantity), 0) as charges,
        coalesce(sum(pp.amount_cents), 0) + coalesce(sum(ppy.applied_amount_cents), 0) as collections,
        count(distinct cl.id) filter (where cl.status = 'rejected') as denials,
        count(distinct cl.id) as total_claims
       from providers pr
       left join encounters e on e.provider_id = pr.id and e.tenant_id = $1
       left join charges c on c.encounter_id = e.id
       left join claims cl on cl.tenant_id = pr.tenant_id
       left join patient_payments pp on pp.patient_id = e.patient_id and pp.status = 'posted'
       left join payer_payments ppy on ppy.tenant_id = pr.tenant_id
       where pr.tenant_id = $1
         and (e.check_in_time is null or (e.check_in_time >= $2 and e.check_in_time <= $3))
       group by pr.id, pr.full_name
       having count(distinct e.id) > 0
       order by charges desc`,
      [tenantId, startDate.toISOString(), endDate.toISOString()]
    );

    return result.rows.map((row) => {
      const encounters = parseInt(row.encounters);
      const patients = parseInt(row.patients);
      const charges = parseInt(row.charges);
      const collections = parseInt(row.collections);
      const denials = parseInt(row.denials);
      const totalClaims = parseInt(row.total_claims);

      return {
        providerId: row.provider_id,
        providerName: row.provider_name,
        encounters,
        patients,
        charges,
        collections,
        chargesPerPatient: patients > 0 ? charges / patients : 0,
        collectionRate: charges > 0 ? (collections / charges) * 100 : 0,
        denialRate: totalClaims > 0 ? (denials / totalClaims) * 100 : 0,
      };
    });
  }

  /**
   * Get action items requiring attention
   */
  static async getActionItems(tenantId: string, limit: number = 20): Promise<ActionItem[]> {
    const result = await pool.query(
      `select
        ai.id,
        ai.item_type as type,
        ai.priority,
        ai.title,
        ai.description,
        ai.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        ai.amount_cents,
        ai.due_date,
        ai.status
       from rcm_action_items ai
       left join patients p on p.id = ai.patient_id
       where ai.tenant_id = $1
         and ai.status in ('open', 'in_progress')
       order by
         case ai.priority
           when 'urgent' then 1
           when 'high' then 2
           when 'medium' then 3
           else 4
         end,
         ai.due_date nulls last,
         ai.created_at desc
       limit $2`,
      [tenantId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      priority: row.priority,
      title: row.title,
      description: row.description,
      patientId: row.patient_id,
      patientName: row.patient_name,
      amountCents: row.amount_cents ? parseInt(row.amount_cents) : undefined,
      dueDate: row.due_date,
      status: row.status,
    }));
  }

  /**
   * Get upcoming financial events for calendar
   */
  static async getFinancialEvents(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<FinancialEvent[]> {
    const events: FinancialEvent[] = [];

    // Upcoming payment plans due dates
    const paymentPlansResult = await pool.query(
      `select
        due_date,
        'payment_plan' as type,
        'Payment Plan Due: ' || p.first_name || ' ' || p.last_name as description,
        amount_cents,
        'pending' as status
       from patient_payments pp
       join patients p on p.id = pp.patient_id
       where pp.tenant_id = $1
         and pp.payment_date >= $2
         and pp.payment_date <= $3
         and pp.status = 'pending'
       order by pp.payment_date`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    events.push(
      ...paymentPlansResult.rows.map((row) => ({
        date: row.due_date,
        type: row.type,
        description: row.description,
        amountCents: parseInt(row.amount_cents),
        status: row.status,
      }))
    );

    // Prior authorizations expiring
    const priorAuthsResult = await pool.query(
      `select
        expiration_date as date,
        'prior_auth_expiring' as type,
        'Prior Auth Expires: ' || p.first_name || ' ' || p.last_name as description,
        'expiring' as status
       from prior_authorizations pa
       join patients p on p.id = pa.patient_id
       where pa.tenant_id = $1
         and pa.expiration_date >= $2
         and pa.expiration_date <= $3
         and pa.status = 'approved'
       order by pa.expiration_date`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    events.push(
      ...priorAuthsResult.rows.map((row) => ({
        date: row.date,
        type: row.type,
        description: row.description,
        status: row.status,
      }))
    );

    // Statement dates (first of each month)
    const statementsResult = await pool.query(
      `select
        statement_date,
        'statement_run' as type,
        'Monthly Statement Run' as description,
        'scheduled' as status
       from patient_statements
       where tenant_id = $1
         and statement_date >= $2
         and statement_date <= $3
       group by statement_date
       order by statement_date`,
      [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    events.push(
      ...statementsResult.rows.map((row) => ({
        date: row.statement_date,
        type: row.type,
        description: row.description,
        status: row.status,
      }))
    );

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Get benchmarks for comparison
   */
  static async getBenchmarks(specialty: string = 'Dermatology'): Promise<any> {
    const result = await pool.query(
      `select
        metric_name,
        benchmark_value,
        percentile_25,
        percentile_50,
        percentile_75,
        percentile_90
       from rcm_benchmarks
       where specialty = $1 and year = extract(year from current_date)`,
      [specialty]
    );

    const benchmarks: any = {};
    result.rows.forEach((row) => {
      benchmarks[row.metric_name] = {
        benchmark: parseFloat(row.benchmark_value),
        p25: parseFloat(row.percentile_25),
        p50: parseFloat(row.percentile_50),
        p75: parseFloat(row.percentile_75),
        p90: parseFloat(row.percentile_90),
      };
    });

    return benchmarks;
  }

  /**
   * Generate alerts based on thresholds
   */
  static generateAlerts(kpis: RCMKPIs, benchmarks: any): string[] {
    const alerts: string[] = [];

    if (benchmarks.denial_rate && kpis.denialRate > benchmarks.denial_rate.p75) {
      alerts.push(`High denial rate (${kpis.denialRate.toFixed(1)}%) - above 75th percentile`);
    }

    if (benchmarks.days_in_ar && kpis.daysInAR > benchmarks.days_in_ar.p75) {
      alerts.push(`Days in A/R (${kpis.daysInAR.toFixed(0)}) exceeds target - focus on collections`);
    }

    if (benchmarks.collection_rate && kpis.collectionRate < benchmarks.collection_rate.p25) {
      alerts.push(`Collection rate (${kpis.collectionRate.toFixed(1)}%) below 25th percentile`);
    }

    if (benchmarks.clean_claim_rate && kpis.cleanClaimRate < benchmarks.clean_claim_rate.p50) {
      alerts.push(`Clean claim rate needs improvement - review claim scrubbing process`);
    }

    return alerts;
  }
}
