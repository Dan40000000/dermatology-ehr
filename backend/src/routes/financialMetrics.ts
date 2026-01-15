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
