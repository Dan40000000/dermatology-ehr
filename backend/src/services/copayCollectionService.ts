/**
 * Copay Collection Service
 *
 * Handles copay collection workflows including:
 * - Looking up expected copay for appointments
 * - Creating and managing collection prompts
 * - Recording payments
 * - Managing payment plans
 * - Card on file operations
 * - Stripe integration (mock initially)
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ExpectedCopay {
  appointmentId: string;
  patientId: string;
  copayAmountCents: number;
  source: 'eligibility_check' | 'manual' | 'default' | 'payer_contract';
  visitType: string;
  payerId: string | null;
  payerName: string | null;
  patientBalance: number;
  totalDue: number;
}

export interface CollectionPrompt {
  id: string;
  appointmentId: string | null;
  patientId: string;
  promptType: 'copay' | 'balance' | 'deductible' | 'coinsurance' | 'prepayment' | 'deposit';
  collectionPoint: 'pre_visit' | 'check_in' | 'checkout' | 'post_visit';
  amountDueCents: number;
  collectedAmountCents: number;
  collectionMethod: string | null;
  status: string;
  displayedAt: Date | null;
  collectedBy: string | null;
}

export interface PaymentRecord {
  promptId: string;
  amount: number;
  method: 'cash' | 'check' | 'credit_card' | 'debit_card' | 'hsa_fsa' | 'card_on_file';
  referenceNumber?: string;
  collectedBy: string;
}

export interface PatientBalance {
  patientId: string;
  totalBalanceCents: number;
  currentBalanceCents: number;
  balance31_60Cents: number;
  balance61_90Cents: number;
  balanceOver90Cents: number;
  hasPaymentPlan: boolean;
  hasCardOnFile: boolean;
  oldestChargeDate: string | null;
  lastPaymentDate: string | null;
}

export interface PaymentPlanSetup {
  patientId: string;
  originalAmountCents: number;
  monthlyPaymentCents: number;
  numberOfPayments: number;
  startDate: string;
  autoCharge: boolean;
  cardOnFileId?: string;
  notes?: string;
}

export interface PaymentPlan {
  id: string;
  planNumber: string;
  patientId: string;
  originalAmountCents: number;
  remainingAmountCents: number;
  monthlyPaymentCents: number;
  numberOfPayments: number;
  paymentsMade: number;
  nextDueDate: string | null;
  status: string;
  autoCharge: boolean;
}

export interface CardOnFile {
  id: string;
  patientId: string;
  lastFour: string;
  cardType: 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string | null;
  isDefault: boolean;
  isValid: boolean;
}

export interface ChargeResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  declineCode?: string;
}

export interface CollectionSummary {
  date: string;
  copaysDueCents: number;
  copaysCollectedCents: number;
  copaysCollectedCount: number;
  balancesDueCents: number;
  balancesCollectedCents: number;
  collectionRate: number;
  byCollectionPoint: {
    checkIn: number;
    checkout: number;
    portal: number;
  };
  byPaymentMethod: {
    cash: number;
    check: number;
    card: number;
    hsaFsa: number;
  };
  paymentPlansCreated: number;
}

// ============================================================================
// Main Service Functions
// ============================================================================

/**
 * Get expected copay for an appointment
 */
export async function getExpectedCopay(
  tenantId: string,
  appointmentId: string
): Promise<ExpectedCopay | null> {
  logger.info('Getting expected copay', { tenantId, appointmentId });

  try {
    // Get appointment and patient info
    const appointmentResult = await pool.query(
      `SELECT a.id, a.patient_id, a.appointment_type_id,
              p.insurance_payer_id, p.insurance_provider, p.insurance_copay,
              at.name as appointment_type_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN appointment_types at ON at.id = a.appointment_type_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (appointmentResult.rows.length === 0) {
      return null;
    }

    const appointment = appointmentResult.rows[0];
    const patientId = appointment.patient_id;

    // Use database function to get copay
    const copayResult = await pool.query(
      `SELECT * FROM get_expected_copay($1, $2)`,
      [tenantId, appointmentId]
    );

    let copayAmountCents = 0;
    let source: 'eligibility_check' | 'manual' | 'default' | 'payer_contract' = 'default';
    let visitType = 'established_patient';
    let payerId: string | null = null;
    let payerName: string | null = null;

    if (copayResult.rows.length > 0) {
      const row = copayResult.rows[0];
      copayAmountCents = row?.copay_amount_cents ?? 0;
      source = (row?.source ?? 'default') as 'eligibility_check' | 'manual' | 'default' | 'payer_contract';
      visitType = row?.visit_type ?? 'established_patient';
      payerId = row?.payer_id ?? null;
      payerName = row?.payer_name ?? null;
    }

    // Get patient balance
    const balanceResult = await pool.query(
      `SELECT total_balance FROM patient_balances
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    const patientBalance = balanceResult.rows[0]?.total_balance ?? 0;
    const totalDue = copayAmountCents / 100 + patientBalance;

    return {
      appointmentId,
      patientId,
      copayAmountCents,
      source,
      visitType,
      payerId,
      payerName,
      patientBalance,
      totalDue,
    };
  } catch (error) {
    logger.error('Error getting expected copay', {
      tenantId,
      appointmentId,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Create a collection prompt for an appointment
 */
export async function createCollectionPrompt(
  tenantId: string,
  appointmentId: string,
  patientId: string,
  promptType: 'copay' | 'balance' | 'deductible' | 'coinsurance' | 'prepayment' | 'deposit',
  amountCents: number,
  collectionPoint: 'pre_visit' | 'check_in' | 'checkout' | 'post_visit'
): Promise<CollectionPrompt> {
  logger.info('Creating collection prompt', {
    tenantId,
    appointmentId,
    patientId,
    promptType,
    amountCents,
    collectionPoint,
  });

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO collection_prompts (
      id, tenant_id, appointment_id, patient_id, prompt_type,
      collection_point, amount_due_cents, status, displayed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'displayed', NOW())
    RETURNING *`,
    [id, tenantId, appointmentId, patientId, promptType, collectionPoint, amountCents]
  );

  const row = result.rows[0];
  return mapCollectionPromptRow(row);
}

/**
 * Record a payment against a collection prompt
 */
export async function recordPayment(
  tenantId: string,
  promptId: string,
  amountCents: number,
  method: string,
  collectedBy: string,
  referenceNumber?: string
): Promise<{ promptId: string; paymentId: string; receiptNumber: string }> {
  logger.info('Recording payment', {
    tenantId,
    promptId,
    amountCents,
    method,
    collectedBy,
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get the prompt details
    const promptResult = await client.query(
      `SELECT * FROM collection_prompts
       WHERE id = $1 AND tenant_id = $2`,
      [promptId, tenantId]
    );

    if (promptResult.rows.length === 0) {
      throw new Error('Collection prompt not found');
    }

    const prompt = promptResult.rows[0];
    const patientId = prompt.patient_id;

    // Generate receipt number
    const receiptResult = await client.query(
      `SELECT COUNT(*) as count FROM patient_payments WHERE tenant_id = $1`,
      [tenantId]
    );
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(
      parseInt(receiptResult.rows[0]?.count ?? '0') + 1
    ).padStart(6, '0')}`;

    // Create payment record
    const paymentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO patient_payments (
        id, tenant_id, patient_id, payment_date, amount_cents,
        payment_method, reference_number, receipt_number, status,
        collection_point, collected_by, encounter_id
      ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, 'posted', $8, $9, $10)`,
      [
        paymentId,
        tenantId,
        patientId,
        amountCents,
        method,
        referenceNumber || null,
        receiptNumber,
        prompt.collection_point,
        collectedBy,
        prompt.encounter_id || null,
      ]
    );

    // Update collection prompt
    const status =
      amountCents >= prompt.amount_due_cents ? 'collected_full' : 'collected_partial';

    await client.query(
      `UPDATE collection_prompts
       SET collected_amount_cents = $1,
           collection_method = $2,
           status = $3,
           collected_by = $4,
           payment_id = $5,
           payment_reference = $6,
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $7`,
      [amountCents, method, status, collectedBy, paymentId, referenceNumber || null, promptId]
    );

    // Update patient balance
    await client.query('SELECT update_patient_balance($1, $2)', [tenantId, patientId]);

    await client.query('COMMIT');

    logger.info('Payment recorded successfully', {
      promptId,
      paymentId,
      receiptNumber,
      amountCents,
    });

    return { promptId, paymentId, receiptNumber };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording payment', {
      promptId,
      error: (error as Error).message,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get patient balance details
 */
export async function getPatientBalance(
  tenantId: string,
  patientId: string
): Promise<PatientBalance | null> {
  logger.info('Getting patient balance', { tenantId, patientId });

  // Refresh balance first
  await pool.query('SELECT update_patient_balance($1, $2)', [tenantId, patientId]);

  const result = await pool.query(
    `SELECT
      pb.patient_id,
      COALESCE(pb.total_balance, 0) * 100 as total_balance_cents,
      COALESCE(pb.current_balance, 0) * 100 as current_balance_cents,
      COALESCE(pb.balance_31_60, 0) * 100 as balance_31_60_cents,
      COALESCE(pb.balance_61_90, 0) * 100 as balance_61_90_cents,
      COALESCE(pb.balance_over_90, 0) * 100 as balance_over_90_cents,
      pb.has_payment_plan,
      pb.oldest_charge_date,
      pb.last_payment_date,
      EXISTS(
        SELECT 1 FROM card_on_file cof
        WHERE cof.patient_id = pb.patient_id AND cof.is_valid = true AND cof.deactivated_at IS NULL
      ) as has_card_on_file
     FROM patient_balances pb
     WHERE pb.tenant_id = $1 AND pb.patient_id = $2`,
    [tenantId, patientId]
  );

  if (result.rows.length === 0) {
    // Patient exists but no balance record
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return null;
    }

    return {
      patientId,
      totalBalanceCents: 0,
      currentBalanceCents: 0,
      balance31_60Cents: 0,
      balance61_90Cents: 0,
      balanceOver90Cents: 0,
      hasPaymentPlan: false,
      hasCardOnFile: false,
      oldestChargeDate: null,
      lastPaymentDate: null,
    };
  }

  const row = result.rows[0];
  return {
    patientId: row.patient_id,
    totalBalanceCents: Math.round(row.total_balance_cents),
    currentBalanceCents: Math.round(row.current_balance_cents),
    balance31_60Cents: Math.round(row.balance_31_60_cents),
    balance61_90Cents: Math.round(row.balance_61_90_cents),
    balanceOver90Cents: Math.round(row.balance_over_90_cents),
    hasPaymentPlan: row.has_payment_plan,
    hasCardOnFile: row.has_card_on_file,
    oldestChargeDate: row.oldest_charge_date,
    lastPaymentDate: row.last_payment_date,
  };
}

/**
 * Setup a payment plan for a patient
 */
export async function setupPaymentPlan(
  tenantId: string,
  setup: PaymentPlanSetup,
  createdBy: string
): Promise<PaymentPlan> {
  logger.info('Setting up payment plan', {
    tenantId,
    patientId: setup.patientId,
    originalAmount: setup.originalAmountCents,
    monthlyPayment: setup.monthlyPaymentCents,
    numberOfPayments: setup.numberOfPayments,
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Generate plan number
    const countResult = await client.query(
      `SELECT COUNT(*) as count FROM payment_plans WHERE tenant_id = $1`,
      [tenantId]
    );
    const planNumber = `PP-${new Date().getFullYear()}-${String(
      parseInt(countResult.rows[0]?.count ?? '0') + 1
    ).padStart(6, '0')}`;

    // Calculate end date
    const startDate = new Date(setup.startDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + setup.numberOfPayments);

    // Create payment plan
    const planId = crypto.randomUUID();
    const planResult = await client.query(
      `INSERT INTO payment_plans (
        id, tenant_id, patient_id, plan_number,
        original_amount_cents, remaining_amount_cents, monthly_payment_cents,
        number_of_payments, start_date, next_due_date, end_date,
        auto_charge, card_on_file_id, notes, status,
        terms_agreed_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $8, $9, $10, $11, $12, 'active', NOW(), $13)
      RETURNING *`,
      [
        planId,
        tenantId,
        setup.patientId,
        planNumber,
        setup.originalAmountCents,
        setup.monthlyPaymentCents,
        setup.numberOfPayments,
        setup.startDate,
        endDate.toISOString().split('T')[0],
        setup.autoCharge,
        setup.cardOnFileId || null,
        setup.notes || null,
        createdBy,
      ]
    );

    // Create individual payment schedule
    let currentDueDate = new Date(setup.startDate);
    for (let i = 1; i <= setup.numberOfPayments; i++) {
      await client.query(
        `INSERT INTO payment_plan_payments (
          id, tenant_id, payment_plan_id, payment_number,
          amount_cents, due_date, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [
          crypto.randomUUID(),
          tenantId,
          planId,
          i,
          setup.monthlyPaymentCents,
          currentDueDate.toISOString().split('T')[0],
        ]
      );

      currentDueDate.setMonth(currentDueDate.getMonth() + 1);
    }

    // Update patient balance to reflect payment plan
    await client.query(
      `UPDATE patient_balances
       SET has_payment_plan = true, updated_at = NOW()
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, setup.patientId]
    );

    await client.query('COMMIT');

    const plan = planResult.rows[0];
    return mapPaymentPlanRow(plan);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error setting up payment plan', {
      patientId: setup.patientId,
      error: (error as Error).message,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get patient's card on file
 */
export async function getCardOnFile(
  tenantId: string,
  patientId: string
): Promise<CardOnFile[]> {
  const result = await pool.query(
    `SELECT id, patient_id, last_four, card_type, expiry_month, expiry_year,
            cardholder_name, is_default, is_valid
     FROM card_on_file
     WHERE tenant_id = $1 AND patient_id = $2 AND deactivated_at IS NULL
     ORDER BY is_default DESC, created_at DESC`,
    [tenantId, patientId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    lastFour: row.last_four,
    cardType: row.card_type,
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    cardholderName: row.cardholder_name,
    isDefault: row.is_default,
    isValid: row.is_valid,
  }));
}

/**
 * Save a new card on file
 */
export async function saveCardOnFile(
  tenantId: string,
  patientId: string,
  cardData: {
    lastFour: string;
    cardType: 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';
    expiryMonth: number;
    expiryYear: number;
    cardholderName?: string;
    billingZip?: string;
    stripePaymentMethodId?: string;
    stripeCustomerId?: string;
    isDefault?: boolean;
    consentMethod?: 'in_person' | 'patient_portal' | 'phone' | 'written';
  },
  createdBy: string
): Promise<CardOnFile> {
  logger.info('Saving card on file', {
    tenantId,
    patientId,
    lastFour: cardData.lastFour,
    cardType: cardData.cardType,
  });

  const id = crypto.randomUUID();
  const isDefault = cardData.isDefault !== false;

  const result = await pool.query(
    `INSERT INTO card_on_file (
      id, tenant_id, patient_id, last_four, card_type,
      expiry_month, expiry_year, cardholder_name, billing_zip,
      stripe_payment_method_id, stripe_customer_id,
      is_default, is_valid, consent_given_at, consent_method,
      verified_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), $13, NOW(), $14)
    RETURNING *`,
    [
      id,
      tenantId,
      patientId,
      cardData.lastFour,
      cardData.cardType,
      cardData.expiryMonth,
      cardData.expiryYear,
      cardData.cardholderName || null,
      cardData.billingZip || null,
      cardData.stripePaymentMethodId || null,
      cardData.stripeCustomerId || null,
      isDefault,
      cardData.consentMethod || 'in_person',
      createdBy,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    patientId: row.patient_id,
    lastFour: row.last_four,
    cardType: row.card_type,
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    cardholderName: row.cardholder_name,
    isDefault: row.is_default,
    isValid: row.is_valid,
  };
}

/**
 * Charge a card on file (mock implementation)
 */
export async function chargeCardOnFile(
  tenantId: string,
  patientId: string,
  amountCents: number,
  description?: string,
  cardId?: string
): Promise<ChargeResult> {
  logger.info('Charging card on file', {
    tenantId,
    patientId,
    amountCents,
    cardId,
  });

  // Get the card to charge
  let cardQuery = `
    SELECT * FROM card_on_file
    WHERE tenant_id = $1 AND patient_id = $2 AND is_valid = true AND deactivated_at IS NULL
  `;
  const params: (string | number)[] = [tenantId, patientId];

  if (cardId) {
    cardQuery += ` AND id = $3`;
    params.push(cardId);
  } else {
    cardQuery += ` ORDER BY is_default DESC LIMIT 1`;
  }

  const cardResult = await pool.query(cardQuery, params);

  if (cardResult.rows.length === 0) {
    return {
      success: false,
      error: 'No valid card on file',
    };
  }

  const card = cardResult.rows[0];

  // Mock Stripe integration
  // In production, this would call the actual Stripe API
  const mockChargeResult = await mockStripeCharge(
    card.stripe_payment_method_id || 'pm_mock',
    card.stripe_customer_id || 'cus_mock',
    amountCents,
    description || 'Medical services payment'
  );

  // Update card last used
  await pool.query(
    `UPDATE card_on_file
     SET last_used_at = NOW(),
         last_charge_result = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [mockChargeResult.success ? 'success' : 'declined', card.id]
  );

  return mockChargeResult;
}

/**
 * Get collection summary for a date range
 */
export async function getCollectionSummary(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<CollectionSummary[]> {
  // First update summaries for the date range
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    await pool.query(
      `SELECT update_daily_collection_summary($1, $2)`,
      [tenantId, current.toISOString().split('T')[0]]
    );
    current.setDate(current.getDate() + 1);
  }

  const result = await pool.query(
    `SELECT
      summary_date,
      copays_due_cents,
      copays_collected_cents,
      copays_collected_count,
      balances_due_cents,
      balances_collected_cents,
      collection_rate,
      collected_at_checkin_cents,
      collected_at_checkout_cents,
      collected_via_portal_cents,
      collected_cash_cents,
      collected_check_cents,
      collected_card_cents,
      collected_hsa_fsa_cents,
      payment_plans_created
     FROM daily_collection_summary
     WHERE tenant_id = $1
       AND summary_date >= $2
       AND summary_date <= $3
     ORDER BY summary_date DESC`,
    [tenantId, startDate, endDate]
  );

  return result.rows.map((row) => ({
    date: row.summary_date,
    copaysDueCents: row.copays_due_cents,
    copaysCollectedCents: row.copays_collected_cents,
    copaysCollectedCount: row.copays_collected_count,
    balancesDueCents: row.balances_due_cents,
    balancesCollectedCents: row.balances_collected_cents,
    collectionRate: parseFloat(row.collection_rate) || 0,
    byCollectionPoint: {
      checkIn: row.collected_at_checkin_cents,
      checkout: row.collected_at_checkout_cents,
      portal: row.collected_via_portal_cents,
    },
    byPaymentMethod: {
      cash: row.collected_cash_cents,
      check: row.collected_check_cents,
      card: row.collected_card_cents,
      hsaFsa: row.collected_hsa_fsa_cents,
    },
    paymentPlansCreated: row.payment_plans_created,
  }));
}

/**
 * Send pre-visit notification to patient
 */
export async function sendPreVisitNotification(
  tenantId: string,
  appointmentId: string,
  method: 'sms' | 'email' | 'both' = 'both'
): Promise<{ sent: boolean; promptId: string }> {
  logger.info('Sending pre-visit notification', {
    tenantId,
    appointmentId,
    method,
  });

  // Get expected copay
  const copay = await getExpectedCopay(tenantId, appointmentId);
  if (!copay) {
    throw new Error('Appointment not found');
  }

  // Create a pre-visit collection prompt
  const prompt = await createCollectionPrompt(
    tenantId,
    appointmentId,
    copay.patientId,
    'copay',
    copay.copayAmountCents,
    'pre_visit'
  );

  // Update prompt with notification info
  await pool.query(
    `UPDATE collection_prompts
     SET notification_sent = true,
         notification_sent_at = NOW(),
         notification_method = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [method, prompt.id]
  );

  // In production, this would integrate with SMS/email services
  // For now, just log and return success
  logger.info('Pre-visit notification sent', {
    promptId: prompt.id,
    appointmentId,
    amount: copay.copayAmountCents,
  });

  return { sent: true, promptId: prompt.id };
}

/**
 * Get pending collection prompts for an appointment
 */
export async function getPendingPrompts(
  tenantId: string,
  appointmentId: string
): Promise<CollectionPrompt[]> {
  const result = await pool.query(
    `SELECT * FROM collection_prompts
     WHERE tenant_id = $1 AND appointment_id = $2
       AND status NOT IN ('collected_full', 'waived', 'expired')
     ORDER BY created_at DESC`,
    [tenantId, appointmentId]
  );

  return result.rows.map(mapCollectionPromptRow);
}

/**
 * Skip/defer a collection prompt
 */
export async function skipCollectionPrompt(
  tenantId: string,
  promptId: string,
  reason: string,
  notes: string | null,
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE collection_prompts
     SET status = 'deferred',
         skip_reason = $1,
         skip_notes = $2,
         collected_by = $3,
         responded_at = NOW(),
         updated_at = NOW()
     WHERE id = $4 AND tenant_id = $5`,
    [reason, notes, userId, promptId, tenantId]
  );
}

/**
 * Waive a collection prompt
 */
export async function waiveCollectionPrompt(
  tenantId: string,
  promptId: string,
  reason: string,
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE collection_prompts
     SET status = 'waived',
         skip_reason = $1,
         collected_by = $2,
         responded_at = NOW(),
         updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [reason, userId, promptId, tenantId]
  );
}

/**
 * Get patient's payment plans
 */
export async function getPatientPaymentPlans(
  tenantId: string,
  patientId: string
): Promise<PaymentPlan[]> {
  const result = await pool.query(
    `SELECT * FROM payment_plans
     WHERE tenant_id = $1 AND patient_id = $2
     ORDER BY created_at DESC`,
    [tenantId, patientId]
  );

  return result.rows.map(mapPaymentPlanRow);
}

/**
 * Generate a receipt for a payment
 */
export async function generateReceipt(
  tenantId: string,
  paymentId: string
): Promise<{
  receiptNumber: string;
  patientName: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  practice: { name: string; address: string; phone: string };
}> {
  const result = await pool.query(
    `SELECT pp.receipt_number, pp.amount_cents, pp.payment_method, pp.payment_date,
            p.first_name, p.last_name
     FROM patient_payments pp
     JOIN patients p ON p.id = pp.patient_id
     WHERE pp.id = $1 AND pp.tenant_id = $2`,
    [paymentId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error('Payment not found');
  }

  const payment = result.rows[0];

  // Get practice info (would come from tenant settings in production)
  return {
    receiptNumber: payment.receipt_number,
    patientName: `${payment.first_name} ${payment.last_name}`,
    amount: payment.amount_cents / 100,
    paymentMethod: payment.payment_method,
    paymentDate: payment.payment_date,
    practice: {
      name: 'Dermatology Associates',
      address: '123 Medical Center Dr, Suite 100',
      phone: '(555) 123-4567',
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapCollectionPromptRow(row: Record<string, unknown>): CollectionPrompt {
  return {
    id: row.id as string,
    appointmentId: row.appointment_id as string | null,
    patientId: row.patient_id as string,
    promptType: row.prompt_type as CollectionPrompt['promptType'],
    collectionPoint: row.collection_point as CollectionPrompt['collectionPoint'],
    amountDueCents: row.amount_due_cents as number,
    collectedAmountCents: (row.collected_amount_cents as number) || 0,
    collectionMethod: row.collection_method as string | null,
    status: row.status as string,
    displayedAt: row.displayed_at as Date | null,
    collectedBy: row.collected_by as string | null,
  };
}

function mapPaymentPlanRow(row: Record<string, unknown>): PaymentPlan {
  return {
    id: row.id as string,
    planNumber: row.plan_number as string,
    patientId: row.patient_id as string,
    originalAmountCents: row.original_amount_cents as number,
    remainingAmountCents: row.remaining_amount_cents as number,
    monthlyPaymentCents: row.monthly_payment_cents as number,
    numberOfPayments: row.number_of_payments as number,
    paymentsMade: (row.payments_made as number) || 0,
    nextDueDate: row.next_due_date as string | null,
    status: row.status as string,
    autoCharge: row.auto_charge as boolean,
  };
}

/**
 * Mock Stripe charge (for development/testing)
 */
async function mockStripeCharge(
  paymentMethodId: string,
  customerId: string,
  amountCents: number,
  _description: string
): Promise<ChargeResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Mock success 95% of the time
  const isSuccess = Math.random() > 0.05;

  if (isSuccess) {
    return {
      success: true,
      transactionId: `ch_mock_${crypto.randomUUID().slice(0, 8)}`,
    };
  } else {
    const declineCodes = ['insufficient_funds', 'card_declined', 'expired_card'];
    const declineCode = declineCodes[Math.floor(Math.random() * declineCodes.length)];
    return {
      success: false,
      error: `Card declined: ${declineCode}`,
      declineCode,
    };
  }
}

// Export all functions
export default {
  getExpectedCopay,
  createCollectionPrompt,
  recordPayment,
  getPatientBalance,
  setupPaymentPlan,
  getCardOnFile,
  saveCardOnFile,
  chargeCardOnFile,
  getCollectionSummary,
  sendPreVisitNotification,
  getPendingPrompts,
  skipCollectionPrompt,
  waiveCollectionPrompt,
  getPatientPaymentPlans,
  generateReceipt,
};
