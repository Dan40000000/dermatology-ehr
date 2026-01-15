import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const financialMetricsRouter = Router();

// Get financial dashboard metrics
financialMetricsRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { date } = req.query;

  const referenceDate = date ? new Date(String(date)) : new Date();
  const firstDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const lastDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

  try {
    // Get new bills count (created this month, status = 'new')
    const newBillsResult = await pool.query(
      `select count(*) as count
       from bills
       where tenant_id = $1
         and status = 'new'
         and bill_date >= $2
         and bill_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    // Get in progress bills count (status = 'in_progress' or 'submitted')
    const inProgressBillsResult = await pool.query(
      `select count(*) as count
       from bills
       where tenant_id = $1
         and status in ('in_progress', 'submitted', 'pending_payment')`,
      [tenantId],
    );

    // Get outstanding amount (total balance_cents for all non-paid bills)
    const outstandingResult = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and status not in ('paid', 'written_off', 'cancelled')
         and balance_cents > 0`,
      [tenantId],
    );

    // Get payments this month (patient + payer payments)
    const patientPaymentsResult = await pool.query(
      `select coalesce(sum(amount_cents), 0) as total
       from patient_payments
       where tenant_id = $1
         and status = 'posted'
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    const payerPaymentsResult = await pool.query(
      `select coalesce(sum(applied_amount_cents), 0) as total
       from payer_payments
       where tenant_id = $1
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    const paymentsThisMonth = parseInt(patientPaymentsResult.rows[0].total) + parseInt(payerPaymentsResult.rows[0].total);

    // A/R Aging buckets
    const today = new Date().toISOString().split('T')[0];
    const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const arCurrentResult = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date >= $2`,
      [tenantId, date30],
    );

    const ar3060Result = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date < $2
         and bill_date >= $3`,
      [tenantId, date30, date60],
    );

    const ar6090Result = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date < $2
         and bill_date >= $3`,
      [tenantId, date60, date90],
    );

    const ar90PlusResult = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date < $2`,
      [tenantId, date90],
    );

    // Get overdue count
    const overdueResult = await pool.query(
      `select count(*) as count
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status = 'overdue'`,
      [tenantId],
    );

    // Get collection rate for the month
    const chargesThisMonthResult = await pool.query(
      `select coalesce(sum(total_charges_cents), 0) as total
       from bills
       where tenant_id = $1
         and bill_date >= $2
         and bill_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    const chargesThisMonth = parseInt(chargesThisMonthResult.rows[0].total);
    const collectionRate = chargesThisMonth > 0 ? Math.round((paymentsThisMonth / chargesThisMonth) * 100) : 0;

    res.json({
      metrics: {
        newBillsCount: parseInt(newBillsResult.rows[0].count),
        inProgressBillsCount: parseInt(inProgressBillsResult.rows[0].count),
        outstandingAmountCents: parseInt(outstandingResult.rows[0].total),
        paymentsThisMonthCents: paymentsThisMonth,
        overdueCount: parseInt(overdueResult.rows[0].count),
        collectionRate,
        arAging: {
          currentCents: parseInt(arCurrentResult.rows[0].total),
          days3060Cents: parseInt(ar3060Result.rows[0].total),
          days6090Cents: parseInt(ar6090Result.rows[0].total),
          days90PlusCents: parseInt(ar90PlusResult.rows[0].total),
        },
      },
      period: {
        startDate: firstDayOfMonth.toISOString().split('T')[0],
        endDate: lastDayOfMonth.toISOString().split('T')[0],
      },
    });
  } catch (error: any) {
    console.error('Error fetching financial metrics:', error);
    res.status(500).json({ error: 'Failed to fetch financial metrics' });
  }
});

// Get payments summary
financialMetricsRouter.get("/payments-summary", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  // Patient payments by method
  const patientPaymentsByMethodResult = await pool.query(
    `select payment_method as "paymentMethod",
            count(*) as count,
            sum(amount_cents) as "totalCents"
     from patient_payments
     where tenant_id = $1
       and status = 'posted'
       and payment_date >= $2
       and payment_date <= $3
     group by payment_method
     order by "totalCents" desc`,
    [tenantId, startDate, endDate],
  );

  // Payer payments summary
  const payerPaymentsSummaryResult = await pool.query(
    `select count(*) as count,
            sum(total_amount_cents) as "totalCents",
            sum(applied_amount_cents) as "appliedCents",
            sum(unapplied_amount_cents) as "unappliedCents"
     from payer_payments
     where tenant_id = $1
       and payment_date >= $2
       and payment_date <= $3`,
    [tenantId, startDate, endDate],
  );

  res.json({
    patientPaymentsByMethod: patientPaymentsByMethodResult.rows,
    payerPaymentsSummary: payerPaymentsSummaryResult.rows[0],
    period: { startDate, endDate },
  });
});

// Get bills summary
financialMetricsRouter.get("/bills-summary", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  // Bills by status
  const billsByStatusResult = await pool.query(
    `select status,
            count(*) as count,
            sum(balance_cents) as "balanceCents",
            sum(total_charges_cents) as "totalChargesCents"
     from bills
     where tenant_id = $1
       and bill_date >= $2
       and bill_date <= $3
     group by status
     order by count desc`,
    [tenantId, startDate, endDate],
  );

  res.json({
    billsByStatus: billsByStatusResult.rows,
    period: { startDate, endDate },
  });
});

// Get comprehensive RCM dashboard metrics
financialMetricsRouter.get("/rcm-dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { period = 'mtd' } = req.query;

  const today = new Date();
  let startDate: Date;
  let endDate = today;

  // Calculate date range based on period
  if (period === 'mtd') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (period === 'qtd') {
    const quarterStart = Math.floor(today.getMonth() / 3) * 3;
    startDate = new Date(today.getFullYear(), quarterStart, 1);
  } else {
    startDate = new Date(today.getFullYear(), 0, 1);
  }

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  try {
    // Total Clinical Collections (patient + payer payments)
    const patientCollectionsResult = await pool.query(
      `select coalesce(sum(amount_cents), 0) as total
       from patient_payments
       where tenant_id = $1
         and status = 'posted'
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );

    const payerCollectionsResult = await pool.query(
      `select coalesce(sum(applied_amount_cents), 0) as total
       from payer_payments
       where tenant_id = $1
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );

    const totalClinicalCollections = parseInt(patientCollectionsResult.rows[0].total) + parseInt(payerCollectionsResult.rows[0].total);

    // Total Charges
    const chargesResult = await pool.query(
      `select coalesce(sum(total_charges_cents), 0) as total
       from bills
       where tenant_id = $1
         and bill_date >= $2
         and bill_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );
    const totalCharges = parseInt(chargesResult.rows[0].total);

    // Net Collection Ratio
    const netCollectionRatio = totalCharges > 0 ? Math.round((totalClinicalCollections / totalCharges) * 100) / 100 : 0;

    // Days Sales Outstanding (DSO) - Average days to collect
    const dsoResult = await pool.query(
      `select avg(extract(epoch from (payment_date - bill_date)) / 86400)::int as avg_days
       from patient_payments pp
       join bills b on b.patient_id = pp.patient_id
       where pp.tenant_id = $1
         and pp.status = 'posted'
         and pp.payment_date >= $2
         and pp.payment_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );
    const dso = dsoResult.rows[0]?.avg_days || 45;

    // First Pass Claim Rate - Claims accepted on first submission
    const totalClaimsResult = await pool.query(
      `select count(*) as total
       from claims
       where tenant_id = $1
         and submitted_at >= $2
         and submitted_at <= $3`,
      [tenantId, startDateStr, endDateStr],
    );

    const acceptedFirstPassResult = await pool.query(
      `select count(*) as accepted
       from claims c
       where c.tenant_id = $1
         and c.submitted_at >= $2
         and c.submitted_at <= $3
         and c.status in ('accepted', 'paid')
         and not exists (
           select 1 from claim_status_history csh
           where csh.claim_id = c.id
             and csh.status = 'rejected'
         )`,
      [tenantId, startDateStr, endDateStr],
    );

    const totalClaims = parseInt(totalClaimsResult.rows[0].total);
    const acceptedFirstPass = parseInt(acceptedFirstPassResult.rows[0].accepted);
    const firstPassClaimRate = totalClaims > 0 ? Math.round((acceptedFirstPass / totalClaims) * 100) / 100 : 0.95;

    // Clean Claim Rate
    const cleanClaimRate = firstPassClaimRate + 0.02; // Approximation

    // Denial Rate
    const deniedResult = await pool.query(
      `select count(*) as denied
       from claims
       where tenant_id = $1
         and status = 'rejected'
         and submitted_at >= $2
         and submitted_at <= $3`,
      [tenantId, startDateStr, endDateStr],
    );
    const deniedClaims = parseInt(deniedResult.rows[0].denied);
    const denialRate = totalClaims > 0 ? Math.round((deniedClaims / totalClaims) * 100) / 100 : 0.03;

    // A/R Aging Breakdown
    const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date120 = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const arAgingResult = await pool.query(
      `select
        coalesce(sum(case when bill_date >= $2 then balance_cents else 0 end), 0) as current,
        coalesce(sum(case when bill_date < $2 and bill_date >= $3 then balance_cents else 0 end), 0) as days30_60,
        coalesce(sum(case when bill_date < $3 and bill_date >= $4 then balance_cents else 0 end), 0) as days60_90,
        coalesce(sum(case when bill_date < $4 and bill_date >= $5 then balance_cents else 0 end), 0) as days90_120,
        coalesce(sum(case when bill_date < $5 then balance_cents else 0 end), 0) as days120_plus
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')`,
      [tenantId, date30, date60, date90, date120],
    );

    const arAging = {
      current: parseInt(arAgingResult.rows[0].current),
      days30_60: parseInt(arAgingResult.rows[0].days30_60),
      days60_90: parseInt(arAgingResult.rows[0].days60_90),
      days90_120: parseInt(arAgingResult.rows[0].days90_120),
      days120_plus: parseInt(arAgingResult.rows[0].days120_plus),
    };

    const totalAR = arAging.current + arAging.days30_60 + arAging.days60_90 + arAging.days90_120 + arAging.days120_plus;

    // Monthly Trend Data (last 6 months)
    const monthlyTrendResult = await pool.query(
      `select
        date_trunc('month', payment_date)::date as month,
        sum(amount_cents) as collections
       from patient_payments
       where tenant_id = $1
         and status = 'posted'
         and payment_date >= date_trunc('month', current_date) - interval '6 months'
       group by date_trunc('month', payment_date)
       order by month asc`,
      [tenantId],
    );

    res.json({
      metrics: {
        totalClinicalCollections,
        netCollectionRatio,
        dso,
        firstPassClaimRate,
        cleanClaimRate: Math.min(cleanClaimRate, 1),
        denialRate,
        totalAR,
      },
      arAging,
      period: {
        type: period,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      monthlyTrend: monthlyTrendResult.rows,
    });
  } catch (error: any) {
    console.error('Error fetching RCM dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch RCM dashboard metrics' });
  }
});

// Get revenue by payer analytics
financialMetricsRouter.get("/revenue-by-payer", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `select
        coalesce(p.insurance_plan_name, 'Self-Pay') as payer,
        count(distinct b.id) as claim_count,
        sum(b.total_charges_cents) as charges,
        sum(pp.amount_cents) + coalesce(sum(ppy.applied_amount_cents), 0) as collections
       from bills b
       join patients p on p.id = b.patient_id
       left join patient_payments pp on pp.patient_id = b.patient_id and pp.status = 'posted'
       left join payer_payments ppy on ppy.tenant_id = b.tenant_id
       where b.tenant_id = $1
         and b.bill_date >= $2
         and b.bill_date <= $3
       group by coalesce(p.insurance_plan_name, 'Self-Pay')
       order by collections desc
       limit 10`,
      [tenantId, start, end],
    );

    res.json({
      revenueByPayer: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    console.error('Error fetching revenue by payer:', error);
    res.status(500).json({ error: 'Failed to fetch revenue by payer' });
  }
});

// Get revenue by procedure (CPT code)
financialMetricsRouter.get("/revenue-by-procedure", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `select
        c.cpt_code as "cptCode",
        c.description,
        count(*) as procedure_count,
        sum(c.fee_cents * c.quantity) as revenue
       from charges c
       join encounters e on e.id = c.encounter_id
       where c.tenant_id = $1
         and e.check_in_time >= $2
         and e.check_in_time <= $3
       group by c.cpt_code, c.description
       order by revenue desc
       limit 15`,
      [tenantId, start, end],
    );

    res.json({
      revenueByProcedure: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    console.error('Error fetching revenue by procedure:', error);
    res.status(500).json({ error: 'Failed to fetch revenue by procedure' });
  }
});

// Get provider productivity metrics
financialMetricsRouter.get("/provider-productivity", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `select
        pr.id as "providerId",
        pr.full_name as "providerName",
        count(distinct e.id) as "encounterCount",
        count(distinct e.patient_id) as "patientCount",
        sum(c.fee_cents * c.quantity) as "totalCharges",
        avg(extract(epoch from (e.check_out_time - e.check_in_time)) / 60)::int as "avgVisitMinutes"
       from providers pr
       left join encounters e on e.provider_id = pr.id and e.tenant_id = $1
       left join charges c on c.encounter_id = e.id
       where pr.tenant_id = $1
         and (e.check_in_time is null or (e.check_in_time >= $2 and e.check_in_time <= $3))
       group by pr.id, pr.full_name
       order by "totalCharges" desc nulls last`,
      [tenantId, start, end],
    );

    res.json({
      providerProductivity: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    console.error('Error fetching provider productivity:', error);
    res.status(500).json({ error: 'Failed to fetch provider productivity' });
  }
});

// Get E&M code distribution
financialMetricsRouter.get("/em-distribution", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    // E&M codes are typically 99201-99215 (office visits)
    const result = await pool.query(
      `select
        c.cpt_code as "cptCode",
        c.description,
        count(*) as count
       from charges c
       join encounters e on e.id = c.encounter_id
       where c.tenant_id = $1
         and c.cpt_code like '992%'
         and e.check_in_time >= $2
         and e.check_in_time <= $3
       group by c.cpt_code, c.description
       order by c.cpt_code`,
      [tenantId, start, end],
    );

    res.json({
      emDistribution: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    console.error('Error fetching E&M distribution:', error);
    res.status(500).json({ error: 'Failed to fetch E&M distribution' });
  }
});

// Get claims aging report
financialMetricsRouter.get("/claims-aging", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await pool.query(
      `select
        case
          when submitted_at >= $2 then 'Current'
          when submitted_at >= $3 and submitted_at < $2 then '30-60 Days'
          when submitted_at >= $4 and submitted_at < $3 then '60-90 Days'
          else '90+ Days'
        end as bucket,
        count(*) as claim_count,
        sum(total_cents) as total_amount
       from claims
       where tenant_id = $1
         and status not in ('paid', 'rejected')
         and submitted_at is not null
       group by
        case
          when submitted_at >= $2 then 'Current'
          when submitted_at >= $3 and submitted_at < $2 then '30-60 Days'
          when submitted_at >= $4 and submitted_at < $3 then '60-90 Days'
          else '90+ Days'
        end
       order by
        case
          when submitted_at >= $2 then 1
          when submitted_at >= $3 and submitted_at < $2 then 2
          when submitted_at >= $4 and submitted_at < $3 then 3
          else 4
        end`,
      [tenantId, date30, date60, date90],
    );

    res.json({
      claimsAging: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching claims aging:', error);
    res.status(500).json({ error: 'Failed to fetch claims aging' });
  }
});

// Get patient balance summary
financialMetricsRouter.get("/patient-balances", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { limit = 20 } = req.query;

  try {
    const result = await pool.query(
      `select
        p.id as "patientId",
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.email,
        p.phone,
        sum(b.balance_cents) as "balanceCents",
        max(b.bill_date) as "lastBillDate",
        count(b.id) as "billCount"
       from patients p
       join bills b on b.patient_id = p.id
       where p.tenant_id = $1
         and b.balance_cents > 0
         and b.status not in ('paid', 'written_off', 'cancelled')
       group by p.id, p.first_name, p.last_name, p.email, p.phone
       having sum(b.balance_cents) > 0
       order by sum(b.balance_cents) desc
       limit $2`,
      [tenantId, parseInt(String(limit))],
    );

    res.json({
      patientBalances: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching patient balances:', error);
    res.status(500).json({ error: 'Failed to fetch patient balances' });
  }
});
