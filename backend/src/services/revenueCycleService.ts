/**
 * Revenue Cycle Optimization Service
 * Handles charge capture, denial management, payment plans, underpayment detection,
 * and revenue cycle KPIs for dermatology practices.
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

export enum DenialCategory {
  ELIGIBILITY = 'ELIGIBILITY',
  AUTHORIZATION = 'AUTHORIZATION',
  CODING = 'CODING',
  DOCUMENTATION = 'DOCUMENTATION',
  DUPLICATE = 'DUPLICATE',
  TIMELY_FILING = 'TIMELY_FILING',
}

export interface ChargeCapture {
  id: string;
  tenantId: string;
  encounterId: string;
  patientId: string;
  providerId?: string;
  cptCodes: CptCodeEntry[];
  icdCodes: IcdCodeEntry[];
  charges: ChargeEntry[];
  totalCents: number;
  status: string;
  validationErrors?: string[];
  capturedAt: string;
  capturedBy?: string;
  submittedAt?: string;
}

export interface CptCodeEntry {
  code: string;
  description?: string;
  modifiers?: string[];
  units: number;
}

export interface IcdCodeEntry {
  code: string;
  description?: string;
  isPrimary?: boolean;
}

export interface ChargeEntry {
  cptCode: string;
  units: number;
  feeCents: number;
  totalCents: number;
}

export interface ClaimDenial {
  id: string;
  tenantId: string;
  claimId: string;
  patientId?: string;
  payerId?: string;
  payerName?: string;
  denialCode: string;
  denialReason: string;
  denialCategory: DenialCategory;
  amountCents: number;
  recoveryLikelihood: string;
  appealStatus: string;
  appealDeadline?: string;
  createdAt: string;
}

export interface ClaimAppeal {
  id: string;
  tenantId: string;
  denialId: string;
  appealLevel: number;
  appealType: string;
  appealLetter?: string;
  supportingDocs?: SupportingDoc[];
  submittedAt?: string;
  outcome?: string;
  createdAt: string;
}

export interface SupportingDoc {
  docId: string;
  docType: string;
  description?: string;
}

export interface PaymentPlan {
  id: string;
  tenantId: string;
  patientId: string;
  planNumber?: string;
  totalAmountCents: number;
  remainingAmountCents: number;
  monthlyAmountCents: number;
  numberOfPayments: number;
  paymentsMade: number;
  startDate: string;
  nextPaymentDate?: string;
  status: string;
  autopayEnabled: boolean;
  createdAt: string;
}

export interface PaymentPlanTransaction {
  id: string;
  planId: string;
  paymentNumber: number;
  scheduledDate: string;
  amountCents: number;
  status: string;
  paymentDate?: string;
  actualAmountCents?: number;
  paymentMethod?: string;
}

export interface Underpayment {
  id: string;
  tenantId: string;
  claimId: string;
  payerId?: string;
  payerName?: string;
  cptCode?: string;
  expectedAmountCents: number;
  paidAmountCents: number;
  varianceCents: number;
  variancePercentage?: number;
  status: string;
  identifiedAt: string;
}

export interface PayerContract {
  id: string;
  tenantId: string;
  payerId: string;
  payerName: string;
  feeSchedule: Record<string, FeeScheduleEntry>;
  effectiveDate: string;
  expirationDate?: string;
  status: string;
}

export interface FeeScheduleEntry {
  allowedCents: number;
  effectiveDate?: string;
  expirationDate?: string;
}

export interface RevenueDashboard {
  arMetrics: {
    totalARCents: number;
    daysInAR: number;
    arAgingBuckets: {
      current: number;
      days31_60: number;
      days61_90: number;
      days91_120: number;
      over120: number;
    };
  };
  denialMetrics: {
    totalDenials: number;
    denialRate: number;
    denialAmountCents: number;
    pendingAppeals: number;
    appealSuccessRate: number;
    denialsByCategory: Record<string, number>;
  };
  collectionMetrics: {
    grossChargesCents: number;
    netCollectionsCents: number;
    netCollectionRate: number;
    patientCollectionsCents: number;
    insuranceCollectionsCents: number;
  };
  paymentPlanMetrics: {
    activePlans: number;
    totalBalanceCents: number;
    monthlyExpectedCents: number;
    defaultRate: number;
  };
  underpaymentMetrics: {
    totalIdentified: number;
    totalVarianceCents: number;
    recoveredCents: number;
    pendingReview: number;
  };
}

// ============================================================================
// Charge Capture Functions
// ============================================================================

/**
 * Capture charges for an encounter
 */
export async function captureCharges(
  tenantId: string,
  encounterId: string,
  patientId: string,
  data: {
    providerId?: string;
    cptCodes: CptCodeEntry[];
    icdCodes: IcdCodeEntry[];
    capturedBy?: string;
    notes?: string;
  }
): Promise<ChargeCapture> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Calculate charges from fee schedule
    const charges: ChargeEntry[] = [];
    let totalCents = 0;

    for (const cpt of data.cptCodes) {
      // Look up fee from default fee schedule
      const feeResult = await client.query(
        `SELECT fsi.fee_cents
         FROM fee_schedule_items fsi
         JOIN fee_schedules fs ON fs.id = fsi.fee_schedule_id
         WHERE fs.tenant_id = $1
           AND fs.is_default = true
           AND fsi.cpt_code = $2
         LIMIT 1`,
        [tenantId, cpt.code]
      );

      const feeCents = feeResult.rows[0]?.fee_cents || 0;
      const chargeTotal = feeCents * cpt.units;

      charges.push({
        cptCode: cpt.code,
        units: cpt.units,
        feeCents,
        totalCents: chargeTotal,
      });

      totalCents += chargeTotal;
    }

    const id = crypto.randomUUID();

    const result = await client.query(
      `INSERT INTO charge_captures (
        id, tenant_id, encounter_id, patient_id, provider_id,
        cpt_codes, icd_codes, charges, total_cents, status,
        captured_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        tenantId,
        encounterId,
        patientId,
        data.providerId || null,
        JSON.stringify(data.cptCodes),
        JSON.stringify(data.icdCodes),
        JSON.stringify(charges),
        totalCents,
        'pending',
        data.capturedBy || null,
        data.notes || null,
      ]
    );

    await client.query('COMMIT');
    logger.info('Charges captured', { tenantId, encounterId, totalCents });

    return mapChargeCapture(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error capturing charges', { error, tenantId, encounterId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate charges against chargemaster and coding rules
 */
export async function validateCharges(
  tenantId: string,
  chargeCaptureId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const captureResult = await client.query(
      `SELECT * FROM charge_captures WHERE id = $1 AND tenant_id = $2`,
      [chargeCaptureId, tenantId]
    );

    if (!captureResult.rows[0]) {
      throw new Error('Charge capture not found');
    }

    const capture = captureResult.rows[0];
    const cptCodes = capture.cpt_codes as CptCodeEntry[];
    const icdCodes = capture.icd_codes as IcdCodeEntry[];
    const errors: string[] = [];

    // Validation rules
    // 1. Check for valid CPT codes
    for (const cpt of cptCodes) {
      const cptResult = await client.query(
        `SELECT code FROM cpt_codes WHERE code = $1`,
        [cpt.code]
      );
      if (!cptResult.rows[0]) {
        errors.push(`Invalid CPT code: ${cpt.code}`);
      }
    }

    // 2. Check for valid ICD codes
    for (const icd of icdCodes) {
      const icdResult = await client.query(
        `SELECT code FROM icd10_codes WHERE code = $1`,
        [icd.code]
      );
      if (!icdResult.rows[0]) {
        errors.push(`Invalid ICD-10 code: ${icd.code}`);
      }
    }

    // 3. Check for at least one primary diagnosis
    const hasPrimary = icdCodes.some((icd) => icd.isPrimary);
    if (!hasPrimary && icdCodes.length > 0) {
      errors.push('No primary diagnosis specified');
    }

    // 4. Check for fee schedule entries
    for (const cpt of cptCodes) {
      const feeResult = await client.query(
        `SELECT fsi.fee_cents
         FROM fee_schedule_items fsi
         JOIN fee_schedules fs ON fs.id = fsi.fee_schedule_id
         WHERE fs.tenant_id = $1 AND fs.is_default = true AND fsi.cpt_code = $2`,
        [tenantId, cpt.code]
      );
      if (!feeResult.rows[0]) {
        errors.push(`No fee schedule entry for CPT: ${cpt.code}`);
      }
    }

    // Update capture with validation results
    const newStatus = errors.length === 0 ? 'validated' : 'error';
    await client.query(
      `UPDATE charge_captures
       SET status = $1, validation_errors = $2, validated_at = NOW()
       WHERE id = $3`,
      [newStatus, errors.length > 0 ? JSON.stringify(errors) : null, chargeCaptureId]
    );

    await client.query('COMMIT');

    logger.info('Charges validated', {
      tenantId,
      chargeCaptureId,
      valid: errors.length === 0,
      errorCount: errors.length,
    });

    return { valid: errors.length === 0, errors };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error validating charges', { error, tenantId, chargeCaptureId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get charges for an encounter
 */
export async function getEncounterCharges(
  tenantId: string,
  encounterId: string
): Promise<ChargeCapture[]> {
  const result = await pool.query(
    `SELECT * FROM charge_captures
     WHERE tenant_id = $1 AND encounter_id = $2
     ORDER BY captured_at DESC`,
    [tenantId, encounterId]
  );

  return result.rows.map(mapChargeCapture);
}

// ============================================================================
// Denial Management Functions
// ============================================================================

/**
 * Process and categorize a claim denial
 */
export async function processDenial(
  tenantId: string,
  data: {
    claimId: string;
    patientId?: string;
    payerId?: string;
    payerName?: string;
    denialCode: string;
    denialReason: string;
    remarkCodes?: string[];
    serviceDate?: string;
    billedAmountCents?: number;
    amountCents: number;
  }
): Promise<ClaimDenial> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Categorize denial based on denial code patterns
    const category = categorizeDenial(data.denialCode, data.denialReason);
    const recoveryLikelihood = assessRecoveryLikelihood(category, data.denialCode);

    // Calculate appeal deadline (typically 60-180 days from denial)
    const appealDays = await getAppealFilingDays(tenantId, data.payerId, client);
    const appealDeadline = new Date();
    appealDeadline.setDate(appealDeadline.getDate() + appealDays);

    const id = crypto.randomUUID();

    const result = await client.query(
      `INSERT INTO claim_denials (
        id, tenant_id, claim_id, patient_id, payer_id, payer_name,
        denial_code, denial_reason, denial_category, remark_codes,
        service_date, billed_amount_cents, amount_cents,
        recovery_likelihood, appeal_deadline, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        id,
        tenantId,
        data.claimId,
        data.patientId || null,
        data.payerId || null,
        data.payerName || null,
        data.denialCode,
        data.denialReason,
        category,
        data.remarkCodes ? JSON.stringify(data.remarkCodes) : null,
        data.serviceDate || null,
        data.billedAmountCents || null,
        data.amountCents,
        recoveryLikelihood,
        appealDeadline.toISOString().split('T')[0],
        getPriorityFromAmount(data.amountCents),
      ]
    );

    // Update claim status
    await client.query(
      `UPDATE claims SET status = 'denied', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [data.claimId, tenantId]
    );

    await client.query('COMMIT');

    logger.info('Denial processed', {
      tenantId,
      claimId: data.claimId,
      category,
      recoveryLikelihood,
    });

    return mapClaimDenial(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error processing denial', { error, tenantId, claimId: data.claimId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate an appeal letter from template
 */
export async function generateAppeal(
  tenantId: string,
  denialId: string,
  data: {
    appealLevel?: number;
    appealType: string;
    templateId?: string;
    customLetter?: string;
    supportingDocs?: SupportingDoc[];
    submittedBy?: string;
  }
): Promise<ClaimAppeal> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get denial details
    const denialResult = await client.query(
      `SELECT d.*, c.claim_number, p.first_name, p.last_name,
              p.insurance_id as member_id
       FROM claim_denials d
       JOIN claims c ON c.id = d.claim_id
       LEFT JOIN patients p ON p.id = d.patient_id
       WHERE d.id = $1 AND d.tenant_id = $2`,
      [denialId, tenantId]
    );

    if (!denialResult.rows[0]) {
      throw new Error('Denial not found');
    }

    const denial = denialResult.rows[0];

    // Get previous appeal count for this denial
    const appealCountResult = await client.query(
      `SELECT COALESCE(MAX(appeal_level), 0) as max_level
       FROM claim_appeals WHERE denial_id = $1`,
      [denialId]
    );
    const currentLevel = data.appealLevel || appealCountResult.rows[0].max_level + 1;

    // Generate appeal letter
    let appealLetter = data.customLetter;
    let templateUsed: string | undefined;

    if (!appealLetter && data.templateId) {
      const templateResult = await client.query(
        `SELECT * FROM appeal_templates
         WHERE (id = $1 OR (tenant_id = $2 AND denial_category = $3))
         AND is_active = true
         LIMIT 1`,
        [data.templateId, tenantId, denial.denial_category]
      );

      if (templateResult.rows[0]) {
        const template = templateResult.rows[0];
        appealLetter = mergeAppealTemplate(template.template_content, {
          PAYER_NAME: denial.payer_name || 'Insurance Company',
          CLAIM_NUMBER: denial.claim_number,
          PATIENT_NAME: `${denial.first_name || ''} ${denial.last_name || ''}`.trim(),
          MEMBER_ID: denial.member_id || '',
          SERVICE_DATE: denial.service_date || '',
          DENIAL_REASON: denial.denial_reason,
        });
        templateUsed = template.name;

        // Update template usage count
        await client.query(
          `UPDATE appeal_templates SET usage_count = usage_count + 1 WHERE id = $1`,
          [template.id]
        );
      }
    }

    const id = crypto.randomUUID();

    const result = await client.query(
      `INSERT INTO claim_appeals (
        id, tenant_id, denial_id, appeal_level, appeal_type,
        appeal_letter, appeal_template_used, supporting_docs, submitted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        id,
        tenantId,
        denialId,
        currentLevel,
        data.appealType,
        appealLetter || null,
        templateUsed || null,
        data.supportingDocs ? JSON.stringify(data.supportingDocs) : null,
        data.submittedBy || null,
      ]
    );

    // Update denial status
    await client.query(
      `UPDATE claim_denials SET appeal_status = 'in_progress', updated_at = NOW()
       WHERE id = $1`,
      [denialId]
    );

    await client.query('COMMIT');

    logger.info('Appeal generated', { tenantId, denialId, appealLevel: currentLevel });

    return mapClaimAppeal(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error generating appeal', { error, tenantId, denialId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get denials with filters
 */
export async function getDenials(
  tenantId: string,
  filters: {
    status?: string;
    category?: string;
    payerId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ denials: ClaimDenial[]; total: number }> {
  let query = `
    SELECT d.*, c.claim_number,
           p.first_name || ' ' || p.last_name as patient_name
    FROM claim_denials d
    LEFT JOIN claims c ON c.id = d.claim_id
    LEFT JOIN patients p ON p.id = d.patient_id
    WHERE d.tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (filters.status) {
    query += ` AND d.appeal_status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters.category) {
    query += ` AND d.denial_category = $${paramIndex++}`;
    params.push(filters.category);
  }
  if (filters.payerId) {
    query += ` AND d.payer_id = $${paramIndex++}`;
    params.push(filters.payerId);
  }
  if (filters.startDate) {
    query += ` AND d.created_at >= $${paramIndex++}`;
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    query += ` AND d.created_at <= $${paramIndex++}`;
    params.push(filters.endDate);
  }

  // Get total count
  const countResult = await pool.query(
    query.replace('SELECT d.*, c.claim_number,\n           p.first_name || \' \' || p.last_name as patient_name', 'SELECT COUNT(*)'),
    params
  );
  const total = parseInt(countResult.rows[0].count);

  // Add ordering and pagination
  query += ` ORDER BY d.created_at DESC`;
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(filters.limit || 50, filters.offset || 0);

  const result = await pool.query(query, params);

  return {
    denials: result.rows.map(mapClaimDenial),
    total,
  };
}

// ============================================================================
// Payment Plan Functions
// ============================================================================

/**
 * Create a patient payment plan
 */
export async function createPaymentPlan(
  tenantId: string,
  patientId: string,
  data: {
    totalAmountCents: number;
    numberOfPayments: number;
    startDate: string;
    downPaymentCents?: number;
    interestRate?: number;
    autopayEnabled?: boolean;
    autopayPaymentMethodId?: string;
    associatedEncounters?: string[];
    associatedClaims?: string[];
    paymentDayOfMonth?: number;
    createdBy?: string;
    notes?: string;
  }
): Promise<PaymentPlan> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const downPayment = data.downPaymentCents || 0;
    const remainingAmount = data.totalAmountCents - downPayment;
    const monthlyAmount = Math.ceil(remainingAmount / data.numberOfPayments);

    // Generate plan number
    const countResult = await client.query(
      `SELECT COUNT(*) FROM payment_plans WHERE tenant_id = $1`,
      [tenantId]
    );
    const planNumber = `PP-${new Date().getFullYear()}-${String(
      parseInt(countResult.rows[0].count) + 1
    ).padStart(6, '0')}`;

    // Calculate end date
    const startDate = new Date(data.startDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + data.numberOfPayments);

    // Calculate first payment date
    const nextPaymentDate = new Date(startDate);
    if (downPayment > 0) {
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    }

    const id = crypto.randomUUID();

    const result = await client.query(
      `INSERT INTO payment_plans (
        id, tenant_id, patient_id, plan_number,
        total_amount_cents, remaining_amount_cents, monthly_amount_cents,
        down_payment_cents, interest_rate, number_of_payments,
        start_date, end_date, next_payment_date, payment_day_of_month,
        autopay_enabled, autopay_payment_method_id,
        associated_encounters, associated_claims, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        id,
        tenantId,
        patientId,
        planNumber,
        data.totalAmountCents,
        remainingAmount,
        monthlyAmount,
        downPayment,
        data.interestRate || 0,
        data.numberOfPayments,
        data.startDate,
        endDate.toISOString().split('T')[0],
        nextPaymentDate.toISOString().split('T')[0],
        data.paymentDayOfMonth || startDate.getDate(),
        data.autopayEnabled || false,
        data.autopayPaymentMethodId || null,
        data.associatedEncounters ? JSON.stringify(data.associatedEncounters) : null,
        data.associatedClaims ? JSON.stringify(data.associatedClaims) : null,
        data.notes || null,
        data.createdBy || null,
      ]
    );

    // Create scheduled payment transactions
    let paymentDate = new Date(nextPaymentDate);
    for (let i = 1; i <= data.numberOfPayments; i++) {
      await client.query(
        `INSERT INTO payment_plan_transactions (
          id, tenant_id, plan_id, payment_number, scheduled_date, amount_cents, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')`,
        [
          crypto.randomUUID(),
          tenantId,
          id,
          i,
          paymentDate.toISOString().split('T')[0],
          monthlyAmount,
        ]
      );
      paymentDate.setMonth(paymentDate.getMonth() + 1);
    }

    // Process down payment if provided
    if (downPayment > 0) {
      await client.query(
        `INSERT INTO payment_plan_transactions (
          id, tenant_id, plan_id, payment_number, scheduled_date, amount_cents,
          payment_date, actual_amount_cents, status
        ) VALUES ($1, $2, $3, 0, $4, $5, $4, $5, 'completed')`,
        [crypto.randomUUID(), tenantId, id, data.startDate, downPayment]
      );
    }

    await client.query('COMMIT');

    logger.info('Payment plan created', {
      tenantId,
      patientId,
      planNumber,
      totalAmountCents: data.totalAmountCents,
      numberOfPayments: data.numberOfPayments,
    });

    return mapPaymentPlan(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating payment plan', { error, tenantId, patientId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process a payment plan payment
 */
export async function processPaymentPlanPayment(
  tenantId: string,
  planId: string,
  data: {
    amountCents: number;
    paymentMethod: string;
    paymentMethodLastFour?: string;
    transactionReference?: string;
    processedBy?: string;
    notes?: string;
  }
): Promise<PaymentPlanTransaction> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get plan and next scheduled payment
    const planResult = await client.query(
      `SELECT * FROM payment_plans WHERE id = $1 AND tenant_id = $2`,
      [planId, tenantId]
    );

    if (!planResult.rows[0]) {
      throw new Error('Payment plan not found');
    }

    const plan = planResult.rows[0];

    if (plan.status !== 'active' && plan.status !== 'pending') {
      throw new Error(`Payment plan is ${plan.status}`);
    }

    // Find next scheduled payment
    const transactionResult = await client.query(
      `SELECT * FROM payment_plan_transactions
       WHERE plan_id = $1 AND status = 'scheduled'
       ORDER BY scheduled_date ASC
       LIMIT 1`,
      [planId]
    );

    if (!transactionResult.rows[0]) {
      throw new Error('No scheduled payments found');
    }

    const transaction = transactionResult.rows[0];

    // Update transaction
    const today = new Date().toISOString().split('T')[0];
    await client.query(
      `UPDATE payment_plan_transactions SET
        payment_date = $1,
        actual_amount_cents = $2,
        status = 'completed',
        payment_method = $3,
        payment_method_last_four = $4,
        transaction_reference = $5,
        processed_by = $6,
        notes = $7,
        updated_at = NOW()
       WHERE id = $8`,
      [
        today,
        data.amountCents,
        data.paymentMethod,
        data.paymentMethodLastFour || null,
        data.transactionReference || null,
        data.processedBy || null,
        data.notes || null,
        transaction.id,
      ]
    );

    // Update plan
    const newRemainingAmount = plan.remaining_amount_cents - data.amountCents;
    const newPaymentsMade = plan.payments_made + 1;

    // Find next payment date
    const nextPaymentResult = await client.query(
      `SELECT scheduled_date FROM payment_plan_transactions
       WHERE plan_id = $1 AND status = 'scheduled'
       ORDER BY scheduled_date ASC
       LIMIT 1`,
      [planId]
    );

    const nextPaymentDate = nextPaymentResult.rows[0]?.scheduled_date || null;
    const newStatus =
      newRemainingAmount <= 0 ? 'completed' : plan.status === 'pending' ? 'active' : plan.status;

    await client.query(
      `UPDATE payment_plans SET
        remaining_amount_cents = $1,
        payments_made = $2,
        next_payment_date = $3,
        last_payment_date = $4,
        last_payment_amount_cents = $5,
        status = $6,
        updated_at = NOW()
       WHERE id = $7`,
      [newRemainingAmount, newPaymentsMade, nextPaymentDate, today, data.amountCents, newStatus, planId]
    );

    await client.query('COMMIT');

    logger.info('Payment plan payment processed', {
      tenantId,
      planId,
      amountCents: data.amountCents,
      remainingAmountCents: newRemainingAmount,
    });

    const updatedTransaction = await pool.query(
      `SELECT * FROM payment_plan_transactions WHERE id = $1`,
      [transaction.id]
    );

    return mapPaymentPlanTransaction(updatedTransaction.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error processing payment plan payment', { error, tenantId, planId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get payment plans for a patient
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

  return result.rows.map(mapPaymentPlan);
}

/**
 * Get payment plan transactions
 */
export async function getPaymentPlanTransactions(
  tenantId: string,
  planId: string
): Promise<PaymentPlanTransaction[]> {
  const result = await pool.query(
    `SELECT * FROM payment_plan_transactions
     WHERE tenant_id = $1 AND plan_id = $2
     ORDER BY payment_number ASC`,
    [tenantId, planId]
  );

  return result.rows.map(mapPaymentPlanTransaction);
}

// ============================================================================
// Underpayment Detection Functions
// ============================================================================

/**
 * Identify underpayment by comparing payment to contract
 */
export async function identifyUnderpayment(
  tenantId: string,
  data: {
    claimId: string;
    eraId?: string;
    payerId?: string;
    payerName?: string;
    cptCode: string;
    serviceDate?: string;
    units?: number;
    paidAmountCents: number;
    adjustmentCodes?: string[];
  }
): Promise<Underpayment | null> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get expected amount from payer contract
    const contractResult = await client.query(
      `SELECT id, fee_schedule FROM payer_contracts
       WHERE tenant_id = $1 AND payer_id = $2
         AND status = 'active'
         AND effective_date <= CURRENT_DATE
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
       ORDER BY effective_date DESC
       LIMIT 1`,
      [tenantId, data.payerId]
    );

    if (!contractResult.rows[0]) {
      // No contract found, use default fee schedule
      const feeResult = await client.query(
        `SELECT fsi.fee_cents
         FROM fee_schedule_items fsi
         JOIN fee_schedules fs ON fs.id = fsi.fee_schedule_id
         WHERE fs.tenant_id = $1 AND fs.is_default = true AND fsi.cpt_code = $2`,
        [tenantId, data.cptCode]
      );

      if (!feeResult.rows[0]) {
        await client.query('COMMIT');
        return null; // Cannot determine expected amount
      }
    }

    const contract = contractResult.rows[0];
    const feeSchedule = contract?.fee_schedule || {};
    const units = data.units || 1;

    let expectedAmountCents = 0;
    if (feeSchedule[data.cptCode]) {
      expectedAmountCents = feeSchedule[data.cptCode].allowedCents * units;
    } else {
      // Fall back to default fee schedule
      const feeResult = await client.query(
        `SELECT fsi.fee_cents
         FROM fee_schedule_items fsi
         JOIN fee_schedules fs ON fs.id = fsi.fee_schedule_id
         WHERE fs.tenant_id = $1 AND fs.is_default = true AND fsi.cpt_code = $2`,
        [tenantId, data.cptCode]
      );
      expectedAmountCents = (feeResult.rows[0]?.fee_cents || 0) * units;
    }

    // Calculate variance (negative means underpayment)
    const varianceCents = data.paidAmountCents - expectedAmountCents;

    // Only flag significant underpayments (> $1 or > 5% variance)
    const variancePercentage =
      expectedAmountCents > 0 ? (varianceCents / expectedAmountCents) * 100 : 0;

    if (varianceCents >= -100 && variancePercentage >= -5) {
      // Within acceptable tolerance
      await client.query('COMMIT');
      return null;
    }

    const id = crypto.randomUUID();

    const result = await client.query(
      `INSERT INTO underpayments (
        id, tenant_id, claim_id, era_id, payer_id, payer_name, contract_id,
        cpt_code, service_date, units, expected_amount_cents, paid_amount_cents,
        variance_cents, variance_percentage, adjustment_codes, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        id,
        tenantId,
        data.claimId,
        data.eraId || null,
        data.payerId || null,
        data.payerName || null,
        contract?.id || null,
        data.cptCode,
        data.serviceDate || null,
        units,
        expectedAmountCents,
        data.paidAmountCents,
        varianceCents,
        Math.round(variancePercentage * 100) / 100,
        data.adjustmentCodes ? JSON.stringify(data.adjustmentCodes) : null,
        getPriorityFromAmount(Math.abs(varianceCents)),
      ]
    );

    await client.query('COMMIT');

    logger.info('Underpayment identified', {
      tenantId,
      claimId: data.claimId,
      cptCode: data.cptCode,
      varianceCents,
      variancePercentage,
    });

    return mapUnderpayment(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error identifying underpayment', { error, tenantId, claimId: data.claimId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Verify contract rate for a service
 */
export async function verifyContractRate(
  tenantId: string,
  payerId: string,
  cptCode: string
): Promise<{ hasContract: boolean; allowedCents?: number; effectiveDate?: string }> {
  const result = await pool.query(
    `SELECT fee_schedule, effective_date FROM payer_contracts
     WHERE tenant_id = $1 AND payer_id = $2
       AND status = 'active'
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY effective_date DESC
     LIMIT 1`,
    [tenantId, payerId]
  );

  if (!result.rows[0]) {
    return { hasContract: false };
  }

  const feeSchedule = result.rows[0].fee_schedule || {};
  const cptEntry = feeSchedule[cptCode];

  return {
    hasContract: true,
    allowedCents: cptEntry?.allowedCents,
    effectiveDate: result.rows[0].effective_date,
  };
}

/**
 * Get underpayments with filters
 */
export async function getUnderpayments(
  tenantId: string,
  filters: {
    status?: string;
    payerId?: string;
    minVarianceCents?: number;
    limit?: number;
    offset?: number;
  }
): Promise<{ underpayments: Underpayment[]; total: number }> {
  let query = `
    SELECT u.*, c.claim_number
    FROM underpayments u
    LEFT JOIN claims c ON c.id = u.claim_id
    WHERE u.tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (filters.status) {
    query += ` AND u.status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters.payerId) {
    query += ` AND u.payer_id = $${paramIndex++}`;
    params.push(filters.payerId);
  }
  if (filters.minVarianceCents) {
    query += ` AND ABS(u.variance_cents) >= $${paramIndex++}`;
    params.push(filters.minVarianceCents);
  }

  // Get total count
  const countResult = await pool.query(
    query.replace('SELECT u.*, c.claim_number', 'SELECT COUNT(*)'),
    params
  );
  const total = parseInt(countResult.rows[0].count);

  query += ` ORDER BY ABS(u.variance_cents) DESC`;
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(filters.limit || 50, filters.offset || 0);

  const result = await pool.query(query, params);

  return {
    underpayments: result.rows.map(mapUnderpayment),
    total,
  };
}

// ============================================================================
// Payer Contract Functions
// ============================================================================

/**
 * Get payer contracts
 */
export async function getPayerContracts(
  tenantId: string,
  filters?: {
    status?: string;
    payerId?: string;
    includeExpired?: boolean;
  }
): Promise<PayerContract[]> {
  let query = `SELECT * FROM payer_contracts WHERE tenant_id = $1`;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (filters?.status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters?.payerId) {
    query += ` AND payer_id = $${paramIndex++}`;
    params.push(filters.payerId);
  }
  if (!filters?.includeExpired) {
    query += ` AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)`;
  }

  query += ` ORDER BY payer_name ASC`;

  const result = await pool.query(query, params);
  return result.rows.map(mapPayerContract);
}

// ============================================================================
// Collection Escalation Functions
// ============================================================================

/**
 * Escalate collection based on rules
 */
export async function escalateCollection(
  tenantId: string,
  patientId: string,
  balanceCents: number,
  daysPastDue: number
): Promise<{ actionTaken: string; details: any } | null> {
  const client = await pool.connect();

  try {
    // Get applicable escalation rule
    const ruleResult = await client.query(
      `SELECT * FROM collection_escalation_rules
       WHERE (tenant_id = $1 OR tenant_id = 'default')
         AND days_past_due <= $2
         AND min_balance_cents <= $3
         AND is_active = true
       ORDER BY days_past_due DESC, priority ASC
       LIMIT 1`,
      [tenantId, daysPastDue, balanceCents]
    );

    if (!ruleResult.rows[0]) {
      return null;
    }

    const rule = ruleResult.rows[0];

    // Check if this action was already taken recently
    const recentActionResult = await client.query(
      `SELECT id FROM collection_actions_log
       WHERE tenant_id = $1 AND patient_id = $2 AND rule_id = $3
         AND created_at > NOW() - INTERVAL '7 days'`,
      [tenantId, patientId, rule.id]
    );

    if (recentActionResult.rows[0]) {
      return null; // Action already taken recently
    }

    // Log the action
    await client.query(
      `INSERT INTO collection_actions_log (
        id, tenant_id, patient_id, balance_cents, days_past_due,
        action_type, action_details, rule_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        tenantId,
        patientId,
        balanceCents,
        daysPastDue,
        rule.action_type,
        rule.action_config,
        rule.id,
      ]
    );

    logger.info('Collection escalation triggered', {
      tenantId,
      patientId,
      actionType: rule.action_type,
      daysPastDue,
    });

    return {
      actionTaken: rule.action_type,
      details: rule.action_config,
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// Dashboard and Metrics Functions
// ============================================================================

/**
 * Get revenue cycle dashboard KPIs
 */
export async function getRevenueDashboard(tenantId: string): Promise<RevenueDashboard> {
  // A/R Metrics
  const arResult = await pool.query(
    `SELECT
      COALESCE(SUM(total_cents), 0) as total_ar,
      COALESCE(SUM(CASE WHEN status = 'submitted' AND submitted_at > NOW() - INTERVAL '30 days' THEN total_cents ELSE 0 END), 0) as ar_current,
      COALESCE(SUM(CASE WHEN status = 'submitted' AND submitted_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN total_cents ELSE 0 END), 0) as ar_31_60,
      COALESCE(SUM(CASE WHEN status = 'submitted' AND submitted_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '60 days' THEN total_cents ELSE 0 END), 0) as ar_61_90,
      COALESCE(SUM(CASE WHEN status = 'submitted' AND submitted_at BETWEEN NOW() - INTERVAL '120 days' AND NOW() - INTERVAL '90 days' THEN total_cents ELSE 0 END), 0) as ar_91_120,
      COALESCE(SUM(CASE WHEN status = 'submitted' AND submitted_at < NOW() - INTERVAL '120 days' THEN total_cents ELSE 0 END), 0) as ar_over_120
     FROM claims
     WHERE tenant_id = $1 AND status IN ('submitted', 'pending')`,
    [tenantId]
  );

  // Calculate days in A/R
  const daysInARResult = await pool.query(
    `SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - submitted_at)) / 86400), 0) as avg_days
     FROM claims
     WHERE tenant_id = $1 AND status = 'submitted' AND submitted_at IS NOT NULL`,
    [tenantId]
  );

  // Denial Metrics
  const denialResult = await pool.query(
    `SELECT
      COUNT(*) as total_denials,
      COALESCE(SUM(amount_cents), 0) as denial_amount,
      COUNT(*) FILTER (WHERE appeal_status = 'pending' OR appeal_status = 'in_progress') as pending_appeals
     FROM claim_denials
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  // Denial rate calculation
  const claimCountResult = await pool.query(
    `SELECT COUNT(*) as total FROM claims
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '90 days'`,
    [tenantId]
  );
  const totalClaims = parseInt(claimCountResult.rows[0].total) || 1;
  const totalDenials = parseInt(denialResult.rows[0].total_denials) || 0;
  const denialRate = (totalDenials / totalClaims) * 100;

  // Appeal success rate
  const appealResult = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE outcome = 'approved' OR outcome = 'partially_approved') as success_count,
      COUNT(*) FILTER (WHERE outcome IS NOT NULL) as total_resolved
     FROM claim_appeals
     WHERE tenant_id = $1`,
    [tenantId]
  );
  const appealSuccessRate =
    parseInt(appealResult.rows[0].total_resolved) > 0
      ? (parseInt(appealResult.rows[0].success_count) /
          parseInt(appealResult.rows[0].total_resolved)) *
        100
      : 0;

  // Denials by category
  const categoryResult = await pool.query(
    `SELECT denial_category, COUNT(*) as count
     FROM claim_denials
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '90 days'
     GROUP BY denial_category`,
    [tenantId]
  );
  const denialsByCategory: Record<string, number> = {};
  categoryResult.rows.forEach((row) => {
    denialsByCategory[row.denial_category] = parseInt(row.count);
  });

  // Collection Metrics
  const collectionResult = await pool.query(
    `SELECT
      COALESCE(SUM(total_cents), 0) as gross_charges
     FROM charges
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  const paymentResult = await pool.query(
    `SELECT
      COALESCE(SUM(amount_cents), 0) as total_payments
     FROM patient_payments
     WHERE tenant_id = $1 AND payment_date > NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  const grossCharges = parseInt(collectionResult.rows[0].gross_charges) || 1;
  const totalPayments = parseInt(paymentResult.rows[0].total_payments) || 0;
  const netCollectionRate = (totalPayments / grossCharges) * 100;

  // Payment Plan Metrics
  const planResult = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'active') as active_plans,
      COALESCE(SUM(remaining_amount_cents) FILTER (WHERE status = 'active'), 0) as total_balance,
      COALESCE(SUM(monthly_amount_cents) FILTER (WHERE status = 'active'), 0) as monthly_expected,
      COUNT(*) FILTER (WHERE status = 'defaulted') as defaulted_plans,
      COUNT(*) as total_plans
     FROM payment_plans
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const totalPlans = parseInt(planResult.rows[0].total_plans) || 1;
  const defaultedPlans = parseInt(planResult.rows[0].defaulted_plans) || 0;
  const defaultRate = (defaultedPlans / totalPlans) * 100;

  // Underpayment Metrics
  const underpaymentResult = await pool.query(
    `SELECT
      COUNT(*) as total_identified,
      COALESCE(SUM(ABS(variance_cents)), 0) as total_variance,
      COALESCE(SUM(recovered_amount_cents), 0) as recovered,
      COUNT(*) FILTER (WHERE status = 'identified' OR status = 'under_review') as pending_review
     FROM underpayments
     WHERE tenant_id = $1`,
    [tenantId]
  );

  return {
    arMetrics: {
      totalARCents: parseInt(arResult.rows[0].total_ar) || 0,
      daysInAR: Math.round(parseFloat(daysInARResult.rows[0].avg_days) || 0),
      arAgingBuckets: {
        current: parseInt(arResult.rows[0].ar_current) || 0,
        days31_60: parseInt(arResult.rows[0].ar_31_60) || 0,
        days61_90: parseInt(arResult.rows[0].ar_61_90) || 0,
        days91_120: parseInt(arResult.rows[0].ar_91_120) || 0,
        over120: parseInt(arResult.rows[0].ar_over_120) || 0,
      },
    },
    denialMetrics: {
      totalDenials,
      denialRate: Math.round(denialRate * 100) / 100,
      denialAmountCents: parseInt(denialResult.rows[0].denial_amount) || 0,
      pendingAppeals: parseInt(denialResult.rows[0].pending_appeals) || 0,
      appealSuccessRate: Math.round(appealSuccessRate * 100) / 100,
      denialsByCategory,
    },
    collectionMetrics: {
      grossChargesCents: grossCharges,
      netCollectionsCents: totalPayments,
      netCollectionRate: Math.round(netCollectionRate * 100) / 100,
      patientCollectionsCents: 0, // Would need separate tracking
      insuranceCollectionsCents: 0, // Would need separate tracking
    },
    paymentPlanMetrics: {
      activePlans: parseInt(planResult.rows[0].active_plans) || 0,
      totalBalanceCents: parseInt(planResult.rows[0].total_balance) || 0,
      monthlyExpectedCents: parseInt(planResult.rows[0].monthly_expected) || 0,
      defaultRate: Math.round(defaultRate * 100) / 100,
    },
    underpaymentMetrics: {
      totalIdentified: parseInt(underpaymentResult.rows[0].total_identified) || 0,
      totalVarianceCents: parseInt(underpaymentResult.rows[0].total_variance) || 0,
      recoveredCents: parseInt(underpaymentResult.rows[0].recovered) || 0,
      pendingReview: parseInt(underpaymentResult.rows[0].pending_review) || 0,
    },
  };
}

// ============================================================================
// Automation Jobs
// ============================================================================

/**
 * Daily denial processing job
 * Processes new denials, updates appeal deadlines, and flags urgent items
 */
export async function runDailyDenialProcessing(tenantId: string): Promise<{
  processed: number;
  urgentFlags: number;
  expiredAppeals: number;
}> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Flag denials with approaching deadlines (< 14 days)
    const urgentResult = await client.query(
      `UPDATE claim_denials
       SET priority = 'urgent', updated_at = NOW()
       WHERE tenant_id = $1
         AND appeal_status IN ('pending', 'in_progress')
         AND appeal_deadline IS NOT NULL
         AND appeal_deadline <= CURRENT_DATE + INTERVAL '14 days'
         AND priority != 'urgent'
       RETURNING id`,
      [tenantId]
    );

    // Mark expired appeals
    const expiredResult = await client.query(
      `UPDATE claim_denials
       SET appeal_status = 'written_off',
           resolution_notes = 'Appeal deadline expired',
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND appeal_status = 'pending'
         AND appeal_deadline < CURRENT_DATE
       RETURNING id`,
      [tenantId]
    );

    await client.query('COMMIT');

    logger.info('Daily denial processing completed', {
      tenantId,
      urgentFlags: urgentResult.rowCount || 0,
      expiredAppeals: expiredResult.rowCount || 0,
    });

    return {
      processed: (urgentResult.rowCount || 0) + (expiredResult.rowCount || 0),
      urgentFlags: urgentResult.rowCount || 0,
      expiredAppeals: expiredResult.rowCount || 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in daily denial processing', { error, tenantId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get payment plans due for reminder SMS
 */
export async function getPaymentPlansForReminder(
  tenantId: string,
  daysBeforeDue: number = 3
): Promise<
  Array<{
    planId: string;
    patientId: string;
    patientPhone?: string;
    patientName: string;
    nextPaymentDate: string;
    amountDueCents: number;
  }>
> {
  const result = await pool.query(
    `SELECT pp.id as plan_id, pp.patient_id, pp.next_payment_date, pp.monthly_amount_cents,
            p.first_name, p.last_name, p.phone
     FROM payment_plans pp
     JOIN patients p ON p.id = pp.patient_id
     WHERE pp.tenant_id = $1
       AND pp.status = 'active'
       AND pp.reminder_enabled = true
       AND pp.next_payment_date = CURRENT_DATE + $2 * INTERVAL '1 day'`,
    [tenantId, daysBeforeDue]
  );

  return result.rows.map((row) => ({
    planId: row.plan_id,
    patientId: row.patient_id,
    patientPhone: row.phone,
    patientName: `${row.first_name} ${row.last_name}`,
    nextPaymentDate: row.next_payment_date,
    amountDueCents: row.monthly_amount_cents,
  }));
}

// ============================================================================
// Helper Functions
// ============================================================================

function categorizeDenial(code: string, reason: string): DenialCategory {
  const upperCode = code.toUpperCase();
  const upperReason = reason.toUpperCase();

  // Eligibility-related codes
  if (
    upperCode.match(/^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)$/) ||
    upperReason.includes('ELIGIBILITY') ||
    upperReason.includes('NOT COVERED') ||
    upperReason.includes('INACTIVE') ||
    upperReason.includes('TERMINATED')
  ) {
    return DenialCategory.ELIGIBILITY;
  }

  // Authorization-related
  if (
    upperCode.match(/^(55|56|58|196|197|198|199)$/) ||
    upperReason.includes('AUTHORIZATION') ||
    upperReason.includes('PRIOR AUTH') ||
    upperReason.includes('PRE-CERT')
  ) {
    return DenialCategory.AUTHORIZATION;
  }

  // Coding-related
  if (
    upperCode.match(/^(4|5|6|7|8|9|49|50|51|52|53|54|146|147|148|149)$/) ||
    upperReason.includes('CODING') ||
    upperReason.includes('INVALID CODE') ||
    upperReason.includes('MODIFIER') ||
    upperReason.includes('BUNDLED')
  ) {
    return DenialCategory.CODING;
  }

  // Documentation-related
  if (
    upperCode.match(/^(32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48)$/) ||
    upperReason.includes('DOCUMENTATION') ||
    upperReason.includes('MEDICAL NECESSITY') ||
    upperReason.includes('RECORDS')
  ) {
    return DenialCategory.DOCUMENTATION;
  }

  // Duplicate
  if (upperCode.match(/^(18|19)$/) || upperReason.includes('DUPLICATE')) {
    return DenialCategory.DUPLICATE;
  }

  // Timely filing
  if (
    upperCode.match(/^(29|30)$/) ||
    upperReason.includes('TIMELY') ||
    upperReason.includes('FILING LIMIT')
  ) {
    return DenialCategory.TIMELY_FILING;
  }

  // Default to documentation if unclear
  return DenialCategory.DOCUMENTATION;
}

function assessRecoveryLikelihood(category: DenialCategory, code: string): string {
  // Eligibility denials are often hard to recover
  if (category === DenialCategory.ELIGIBILITY) {
    return 'low';
  }

  // Timely filing is usually not recoverable
  if (category === DenialCategory.TIMELY_FILING) {
    return 'low';
  }

  // Duplicates need investigation
  if (category === DenialCategory.DUPLICATE) {
    return 'medium';
  }

  // Coding and documentation often have good appeal success
  if (category === DenialCategory.CODING || category === DenialCategory.DOCUMENTATION) {
    return 'high';
  }

  // Authorization depends on circumstances
  if (category === DenialCategory.AUTHORIZATION) {
    return 'medium';
  }

  return 'medium';
}

async function getAppealFilingDays(
  tenantId: string,
  payerId: string | undefined,
  client: any
): Promise<number> {
  if (!payerId) return 60; // Default

  const result = await client.query(
    `SELECT appeal_filing_days FROM payer_contracts
     WHERE tenant_id = $1 AND payer_id = $2 AND status = 'active'
     LIMIT 1`,
    [tenantId, payerId]
  );

  return result.rows[0]?.appeal_filing_days || 60;
}

function getPriorityFromAmount(amountCents: number): string {
  if (amountCents >= 100000) return 'urgent'; // $1000+
  if (amountCents >= 50000) return 'high'; // $500+
  if (amountCents >= 10000) return 'normal'; // $100+
  return 'low';
}

function mergeAppealTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\[${key}\\]`, 'g'), value || `[${key}]`);
  }
  return result;
}

// ============================================================================
// Mapping Functions
// ============================================================================

function mapChargeCapture(row: any): ChargeCapture {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    providerId: row.provider_id,
    cptCodes: row.cpt_codes || [],
    icdCodes: row.icd_codes || [],
    charges: row.charges || [],
    totalCents: row.total_cents || 0,
    status: row.status,
    validationErrors: row.validation_errors,
    capturedAt: row.captured_at,
    capturedBy: row.captured_by,
    submittedAt: row.submitted_at,
  };
}

function mapClaimDenial(row: any): ClaimDenial {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    claimId: row.claim_id,
    patientId: row.patient_id,
    payerId: row.payer_id,
    payerName: row.payer_name,
    denialCode: row.denial_code,
    denialReason: row.denial_reason,
    denialCategory: row.denial_category as DenialCategory,
    amountCents: row.amount_cents || 0,
    recoveryLikelihood: row.recovery_likelihood,
    appealStatus: row.appeal_status,
    appealDeadline: row.appeal_deadline,
    createdAt: row.created_at,
  };
}

function mapClaimAppeal(row: any): ClaimAppeal {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    denialId: row.denial_id,
    appealLevel: row.appeal_level,
    appealType: row.appeal_type,
    appealLetter: row.appeal_letter,
    supportingDocs: row.supporting_docs,
    submittedAt: row.submitted_at,
    outcome: row.outcome,
    createdAt: row.created_at,
  };
}

function mapPaymentPlan(row: any): PaymentPlan {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    planNumber: row.plan_number,
    totalAmountCents: row.total_amount_cents,
    remainingAmountCents: row.remaining_amount_cents,
    monthlyAmountCents: row.monthly_amount_cents,
    numberOfPayments: row.number_of_payments,
    paymentsMade: row.payments_made || 0,
    startDate: row.start_date,
    nextPaymentDate: row.next_payment_date,
    status: row.status,
    autopayEnabled: row.autopay_enabled || false,
    createdAt: row.created_at,
  };
}

function mapPaymentPlanTransaction(row: any): PaymentPlanTransaction {
  return {
    id: row.id,
    planId: row.plan_id,
    paymentNumber: row.payment_number,
    scheduledDate: row.scheduled_date,
    amountCents: row.amount_cents,
    status: row.status,
    paymentDate: row.payment_date,
    actualAmountCents: row.actual_amount_cents,
    paymentMethod: row.payment_method,
  };
}

function mapUnderpayment(row: any): Underpayment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    claimId: row.claim_id,
    payerId: row.payer_id,
    payerName: row.payer_name,
    cptCode: row.cpt_code,
    expectedAmountCents: row.expected_amount_cents,
    paidAmountCents: row.paid_amount_cents,
    varianceCents: row.variance_cents,
    variancePercentage: row.variance_percentage,
    status: row.status,
    identifiedAt: row.identified_at,
  };
}

function mapPayerContract(row: any): PayerContract {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    payerId: row.payer_id,
    payerName: row.payer_name,
    feeSchedule: row.fee_schedule || {},
    effectiveDate: row.effective_date,
    expirationDate: row.expiration_date,
    status: row.status,
  };
}

// Export service as singleton
export const revenueCycleService = {
  captureCharges,
  validateCharges,
  getEncounterCharges,
  processDenial,
  generateAppeal,
  getDenials,
  createPaymentPlan,
  processPaymentPlanPayment,
  getPatientPaymentPlans,
  getPaymentPlanTransactions,
  identifyUnderpayment,
  verifyContractRate,
  getUnderpayments,
  getPayerContracts,
  escalateCollection,
  getRevenueDashboard,
  runDailyDenialProcessing,
  getPaymentPlansForReminder,
};
