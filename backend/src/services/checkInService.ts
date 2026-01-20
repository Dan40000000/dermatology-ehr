/**
 * Patient Check-In Service
 *
 * Handles patient check-in workflow including:
 * - Insurance eligibility status display
 * - Copay collection
 * - Insurance updates
 * - Auto-refresh stale eligibility
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { verifyPatientEligibility } from './eligibilityService';

export interface CheckInData {
  patientId: string;
  appointmentId: string;
  tenantId: string;
  eligibilityStatus?: {
    status: string;
    verifiedAt: Date;
    copayAmount: number;
    deductibleRemaining: number;
    coinsurancePercent: number;
    payerName: string;
    hasIssues: boolean;
    issueNotes?: string;
  };
  insuranceNeedsUpdate: boolean;
  copayCollected?: boolean;
  copayAmountCents?: number;
  paymentMethod?: string;
  insuranceUpdates?: {
    insuranceProvider?: string;
    insuranceMemberId?: string;
    insuranceGroupNumber?: string;
    insurancePayerId?: string;
  };
}

export interface CheckInResult {
  success: boolean;
  checkInId: string;
  patientId: string;
  appointmentId: string;
  eligibilityRefreshed: boolean;
  copayCollected: boolean;
  insuranceUpdated: boolean;
  warnings: string[];
}

/**
 * Get patient eligibility for check-in
 * Auto-refreshes if eligibility is stale (>24 hours old)
 */
export async function getPatientEligibilityForCheckIn(
  patientId: string,
  tenantId: string,
  appointmentId?: string
): Promise<CheckInData> {
  logger.info('Getting patient eligibility for check-in', { patientId, appointmentId });

  // Fetch patient with latest eligibility
  const patientResult = await pool.query(
    `SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.eligibility_status,
      p.eligibility_checked_at,
      p.copay_amount_cents,
      p.deductible_remaining_cents,
      p.coinsurance_percent,
      p.insurance_payer_id,
      p.insurance_plan_name,
      p.insurance_member_id,
      p.insurance_group_number,
      p.latest_verification_id,
      iv.payer_name,
      iv.has_issues,
      iv.issue_notes,
      iv.verified_at
     FROM patients p
     LEFT JOIN insurance_verifications iv ON iv.id = p.latest_verification_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [patientId, tenantId]
  );

  if (patientResult.rows.length === 0) {
    throw new Error('Patient not found');
  }

  const patient = patientResult.rows[0];

  // Check if eligibility needs refresh (older than 24 hours or missing)
  const needsRefresh = !patient.eligibility_checked_at ||
    new Date().getTime() - new Date(patient.eligibility_checked_at).getTime() > 24 * 60 * 60 * 1000;

  let eligibilityStatus = null;

  if (patient.eligibility_status) {
    eligibilityStatus = {
      status: patient.eligibility_status,
      verifiedAt: patient.eligibility_checked_at,
      copayAmount: patient.copay_amount_cents || 0,
      deductibleRemaining: patient.deductible_remaining_cents || 0,
      coinsurancePercent: patient.coinsurance_percent || 0,
      payerName: patient.payer_name || 'Unknown',
      hasIssues: patient.has_issues || false,
      issueNotes: patient.issue_notes,
    };
  }

  return {
    patientId,
    appointmentId: appointmentId || '',
    tenantId,
    eligibilityStatus: eligibilityStatus || undefined,
    insuranceNeedsUpdate: needsRefresh,
  };
}

/**
 * Refresh patient eligibility during check-in
 */
export async function refreshEligibilityAtCheckIn(
  patientId: string,
  tenantId: string,
  appointmentId?: string,
  verifiedBy?: string
): Promise<any> {
  logger.info('Refreshing eligibility at check-in', { patientId, appointmentId });

  // Verify eligibility
  const verification = await verifyPatientEligibility(
    patientId,
    tenantId,
    verifiedBy,
    appointmentId
  );

  // The patient record is automatically updated via trigger
  return verification;
}

/**
 * Complete patient check-in
 */
export async function completeCheckIn(
  data: CheckInData,
  checkedInBy: string
): Promise<CheckInResult> {
  logger.info('Completing patient check-in', {
    patientId: data.patientId,
    appointmentId: data.appointmentId,
  });

  const warnings: string[] = [];
  let eligibilityRefreshed = false;
  let copayCollected = false;
  let insuranceUpdated = false;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Refresh eligibility if needed
    if (data.insuranceNeedsUpdate) {
      try {
        await refreshEligibilityAtCheckIn(
          data.patientId,
          data.tenantId,
          data.appointmentId,
          checkedInBy
        );
        eligibilityRefreshed = true;
      } catch (error) {
        logger.error('Failed to refresh eligibility at check-in', {
          error: (error as Error).message,
          patientId: data.patientId,
        });
        warnings.push('Failed to refresh insurance eligibility');
      }
    }

    // 2. Update insurance information if provided
    if (data.insuranceUpdates) {
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (data.insuranceUpdates.insuranceProvider) {
        updates.push(`insurance = $${paramIndex}`);
        values.push(data.insuranceUpdates.insuranceProvider);
        paramIndex++;
      }

      if (data.insuranceUpdates.insuranceMemberId) {
        updates.push(`insurance_member_id = $${paramIndex}`);
        values.push(data.insuranceUpdates.insuranceMemberId);
        paramIndex++;
      }

      if (data.insuranceUpdates.insuranceGroupNumber) {
        updates.push(`insurance_group_number = $${paramIndex}`);
        values.push(data.insuranceUpdates.insuranceGroupNumber);
        paramIndex++;
      }

      if (data.insuranceUpdates.insurancePayerId) {
        updates.push(`insurance_payer_id = $${paramIndex}`);
        values.push(data.insuranceUpdates.insurancePayerId);
        paramIndex++;
      }

      if (updates.length > 0) {
        values.push(data.patientId);
        values.push(data.tenantId);

        await client.query(
          `UPDATE patients
           SET ${updates.join(', ')}, updated_at = NOW()
           WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
          values
        );

        insuranceUpdated = true;
      }
    }

    // 3. Record copay payment if collected
    if (data.copayCollected && data.copayAmountCents && data.copayAmountCents > 0) {
      const paymentId = require('crypto').randomUUID();

      await client.query(
        `INSERT INTO patient_payments (
          id, tenant_id, patient_id, appointment_id, amount_cents,
          payment_type, payment_method, payment_date, created_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)`,
        [
          paymentId,
          data.tenantId,
          data.patientId,
          data.appointmentId || null,
          data.copayAmountCents,
          'copay',
          data.paymentMethod || 'cash',
          checkedInBy,
          'Copay collected at check-in',
        ]
      );

      copayCollected = true;
    }

    // 4. Update appointment status to checked_in
    if (data.appointmentId) {
      await client.query(
        `UPDATE appointments
         SET status = 'checked_in', checked_in_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [data.appointmentId, data.tenantId]
      );
    }

    // 5. Create check-in record
    const checkInId = require('crypto').randomUUID();

    await client.query(
      `INSERT INTO patient_check_ins (
        id, tenant_id, patient_id, appointment_id, checked_in_at,
        checked_in_by, eligibility_verified, copay_collected_cents
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
      [
        checkInId,
        data.tenantId,
        data.patientId,
        data.appointmentId || null,
        checkedInBy,
        eligibilityRefreshed,
        data.copayAmountCents || 0,
      ]
    );

    await client.query('COMMIT');

    logger.info('Check-in completed successfully', {
      checkInId,
      patientId: data.patientId,
      appointmentId: data.appointmentId,
    });

    return {
      success: true,
      checkInId,
      patientId: data.patientId,
      appointmentId: data.appointmentId || '',
      eligibilityRefreshed,
      copayCollected,
      insuranceUpdated,
      warnings,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error completing check-in', {
      error: (error as Error).message,
      patientId: data.patientId,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get check-in status for an appointment
 */
export async function getCheckInStatus(
  appointmentId: string,
  tenantId: string
): Promise<any> {
  const result = await pool.query(
    `SELECT
      ci.id,
      ci.checked_in_at,
      ci.eligibility_verified,
      ci.copay_collected_cents,
      u.full_name as checked_in_by_name
     FROM patient_check_ins ci
     LEFT JOIN users u ON u.id = ci.checked_in_by
     WHERE ci.appointment_id = $1 AND ci.tenant_id = $2
     ORDER BY ci.checked_in_at DESC
     LIMIT 1`,
    [appointmentId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * Calculate estimated patient responsibility
 */
export function calculateEstimatedResponsibility(
  eligibility: any,
  estimatedServiceCostCents: number
): {
  copay: number;
  deductible: number;
  coinsurance: number;
  total: number;
} {
  const copay = eligibility.copay_amount_cents || 0;
  const deductibleRemaining = eligibility.deductible_remaining_cents || 0;
  const coinsurancePercent = eligibility.coinsurance_percent || 0;

  // Apply deductible first
  const deductibleApplied = Math.min(estimatedServiceCostCents, deductibleRemaining);
  const afterDeductible = estimatedServiceCostCents - deductibleApplied;

  // Apply coinsurance to remaining
  const coinsurance = Math.round(afterDeductible * (coinsurancePercent / 100));

  return {
    copay,
    deductible: deductibleApplied,
    coinsurance,
    total: copay + deductibleApplied + coinsurance,
  };
}
