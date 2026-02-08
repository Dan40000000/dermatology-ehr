/**
 * Insurance Eligibility Verification Service
 *
 * Handles all eligibility verification operations including:
 * - Single patient verification
 * - Batch verification
 * - Storing verification results
 * - Calculating patient responsibility
 * - Identifying verification issues
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import {
  mockEligibilityCheck,
  mockBatchEligibilityCheck,
  type EligibilityRequest,
  type EligibilityResponse,
} from './availityMock';

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  insuranceProvider?: string;
  insuranceMemberId?: string;
  insuranceGroupNumber?: string;
}

export interface VerificationResult {
  id: string;
  patientId: string;
  verificationStatus: string;
  verifiedAt: Date;
  payerName: string;
  hasIssues: boolean;
  issueNotes?: string;
  benefits: any;
}

export interface BatchVerificationRequest {
  patientIds: string[];
  tenantId: string;
  initiatedBy: string;
  batchName?: string;
}

export interface BatchVerificationResult {
  batchRunId: string;
  totalPatients: number;
  verifiedCount: number;
  activeCount: number;
  inactiveCount: number;
  errorCount: number;
  issueCount: number;
  results: VerificationResult[];
}

/**
 * Verify insurance eligibility for a single patient
 */
export async function verifyPatientEligibility(
  patientId: string,
  tenantId: string,
  verifiedBy?: string,
  appointmentId?: string
): Promise<VerificationResult> {
  logger.info('Verifying insurance eligibility', { patientId, tenantId });

  try {
    // Fetch patient data
    const patientResult = await pool.query(
      `SELECT id, first_name, last_name, dob as date_of_birth, insurance_provider,
              insurance_member_id, insurance_group_number, insurance_payer_id
       FROM patients
       WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      throw new Error('Patient not found');
    }

    const patient = patientResult.rows[0];

    // Validate insurance information
    if (!patient.insurance_member_id) {
      return await createErrorVerification(
        patientId,
        tenantId,
        'Patient has no insurance information on file',
        verifiedBy,
        appointmentId
      );
    }

    // Build eligibility request
    const eligibilityRequest: EligibilityRequest = {
      payerId: patient.insurance_payer_id || 'BCBS',
      memberId: patient.insurance_member_id,
      patientFirstName: patient.first_name,
      patientLastName: patient.last_name,
      patientDob: formatDateForApi(patient.date_of_birth),
      serviceDate: new Date().toISOString().split('T')[0],
    };

    // Call eligibility API (using mock for now)
    const eligibilityResponse = await mockEligibilityCheck(eligibilityRequest);

    // Parse and store the verification result
    const verification = await storeVerificationResult(
      eligibilityResponse,
      patientId,
      tenantId,
      verifiedBy,
      appointmentId
    );

    logger.info('Eligibility verification completed', {
      patientId,
      verificationId: verification.id,
      status: verification.verificationStatus,
    });

    return verification;
  } catch (error) {
    logger.error('Error verifying eligibility', {
      patientId,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Batch verify eligibility for multiple patients
 */
export async function batchVerifyEligibility(
  request: BatchVerificationRequest
): Promise<BatchVerificationResult> {
  logger.info('Starting batch eligibility verification', {
    tenantId: request.tenantId,
    patientCount: request.patientIds.length,
  });

  // Create batch run record
  const batchRunResult = await pool.query(
    `INSERT INTO eligibility_batch_runs
     (tenant_id, batch_name, batch_type, total_patients, status, started_at, initiated_by)
     VALUES ($1, $2, 'manual', $3, 'running', NOW(), $4)
     RETURNING id`,
    [
      request.tenantId,
      request.batchName || `Batch ${new Date().toISOString()}`,
      request.patientIds.length,
      request.initiatedBy,
    ]
  );

  const batchRunId = batchRunResult.rows[0].id;

  try {
    // Fetch all patients
    const patientsResult = await pool.query(
      `SELECT id, first_name, last_name, dob as date_of_birth, insurance_provider,
              insurance_member_id, insurance_group_number, insurance_payer_id
       FROM patients
       WHERE id = ANY($1) AND tenant_id = $2`,
      [request.patientIds, request.tenantId]
    );

    const patients = patientsResult.rows;

    // Build eligibility requests
    const eligiblePatients = patients.filter(p => p.insurance_member_id); // Only verify patients with insurance
    const eligibilityRequests: EligibilityRequest[] = eligiblePatients.map(p => ({
        payerId: p.insurance_payer_id || 'BCBS',
        memberId: p.insurance_member_id,
        patientFirstName: p.first_name,
        patientLastName: p.last_name,
        patientDob: formatDateForApi(p.date_of_birth),
        serviceDate: new Date().toISOString().split('T')[0],
      }));

    // Call batch eligibility API
    const responses = await mockBatchEligibilityCheck(eligibilityRequests);

    // Store all verification results
    const verifications: VerificationResult[] = [];
    let activeCount = 0;
    let inactiveCount = 0;
    let errorCount = 0;
    let issueCount = 0;

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i]!;
      const patient = eligiblePatients[i]!;

      try {
        const verification = await storeVerificationResult(
          response,
          patient.id,
          request.tenantId,
          request.initiatedBy
        );

        verifications.push(verification);

        // Track status counts
        if (verification.verificationStatus === 'active') activeCount++;
        else if (verification.verificationStatus === 'inactive') inactiveCount++;
        else if (verification.verificationStatus === 'error') errorCount++;

        if (verification.hasIssues) issueCount++;

        // Link verification to batch run
        await pool.query(
          `INSERT INTO eligibility_batch_verifications (batch_run_id, verification_id)
           VALUES ($1, $2)`,
          [batchRunId, verification.id]
        );
      } catch (error) {
        logger.error('Error storing batch verification result', {
          patientId: patient.id,
          error: (error as Error).message,
        });
        errorCount++;
      }
    }

    // Update batch run with results
    await pool.query(
      `UPDATE eligibility_batch_runs
       SET status = 'completed',
           completed_at = NOW(),
           verified_count = $1,
           active_count = $2,
           inactive_count = $3,
           error_count = $4,
           issue_count = $5
       WHERE id = $6`,
      [verifications.length, activeCount, inactiveCount, errorCount, issueCount, batchRunId]
    );

    logger.info('Batch eligibility verification completed', {
      batchRunId,
      totalPatients: request.patientIds.length,
      verifiedCount: verifications.length,
    });

    return {
      batchRunId,
      totalPatients: request.patientIds.length,
      verifiedCount: verifications.length,
      activeCount,
      inactiveCount,
      errorCount,
      issueCount,
      results: verifications,
    };
  } catch (error) {
    // Mark batch as failed
    await pool.query(
      `UPDATE eligibility_batch_runs
       SET status = 'failed',
           completed_at = NOW(),
           error_details = $1
       WHERE id = $2`,
      [JSON.stringify({ error: (error as Error).message }), batchRunId]
    );

    logger.error('Batch eligibility verification failed', {
      batchRunId,
      error: (error as Error).message,
    });

    throw error;
  }
}

/**
 * Store eligibility verification result in database
 */
async function storeVerificationResult(
  response: EligibilityResponse,
  patientId: string,
  tenantId: string,
  verifiedBy?: string,
  appointmentId?: string
): Promise<VerificationResult> {
  const { coverage, benefits, payer, patient: patientInfo, subscriber } = response;

  // Determine if there are issues
  const hasIssues = coverage.status !== 'active' || !response.success;
  const issueNotes = response.messages
    ?.map(m => `[${m.type.toUpperCase()}] ${m.message}`)
    .join('\n') || null;

  const issueType = coverage.status !== 'active' ? 'coverage_not_active' :
                    !response.success ? 'verification_failed' : null;

  // Calculate next verification date (30 days from now, or 1 day before appointment)
  const nextVerificationDate = new Date();
  nextVerificationDate.setDate(nextVerificationDate.getDate() + 30);

  const result = await pool.query(
    `INSERT INTO insurance_verifications (
      tenant_id, patient_id, payer_id, payer_name, member_id, group_number,
      plan_name, plan_type, verification_status, effective_date, termination_date,
      pcp_required, copay_specialist_cents, copay_pcp_cents, copay_er_cents, copay_urgent_care_cents,
      deductible_total_cents, deductible_met_cents, deductible_remaining_cents,
      coinsurance_pct, oop_max_cents, oop_met_cents, oop_remaining_cents,
      prior_auth_required, prior_auth_phone, referral_required,
      in_network, network_name, coverage_level, coordination_of_benefits,
      subscriber_relationship, subscriber_name, subscriber_dob,
      verified_at, verified_by, verification_source, verification_method,
      raw_response, has_issues, issue_type, issue_notes, appointment_id,
      next_verification_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
      $31, $32, $33, NOW(), $34, 'availity_mock', 'real_time', $35, $36, $37, $38, $39, $40
    ) RETURNING id, verification_status, verified_at, payer_name, has_issues, issue_notes`,
    [
      tenantId,
      patientId,
      payer.payerId,
      payer.payerName,
      patientInfo.memberId,
      patientInfo.groupNumber,
      coverage.planName,
      coverage.planType,
      coverage.status,
      coverage.effectiveDate || null,
      coverage.terminationDate || null,
      response.pcp?.required || false,
      benefits.copays?.specialist || null,
      benefits.copays?.primaryCare || null,
      benefits.copays?.emergency || null,
      benefits.copays?.urgentCare || null,
      benefits.deductible?.individual?.total || null,
      benefits.deductible?.individual?.met || null,
      benefits.deductible?.individual?.remaining || null,
      benefits.coinsurance?.percentage || null,
      benefits.outOfPocketMax?.individual?.total || null,
      benefits.outOfPocketMax?.individual?.met || null,
      benefits.outOfPocketMax?.individual?.remaining || null,
      benefits.priorAuth?.services || null,
      benefits.priorAuth?.phone || null,
      benefits.referral?.required || false,
      response.network?.inNetwork || true,
      response.network?.networkName || null,
      coverage.coverageLevel || null,
      coverage.coordinationOfBenefits || null,
      subscriber?.relationship || 'self',
      subscriber ? `${subscriber.firstName} ${subscriber.lastName}` : null,
      subscriber?.dob || null,
      verifiedBy || null,
      JSON.stringify(response),
      hasIssues,
      issueType,
      issueNotes,
      appointmentId || null,
      nextVerificationDate,
    ]
  );

  const verification = result.rows[0];

  return {
    id: verification.id,
    patientId,
    verificationStatus: verification.verification_status,
    verifiedAt: verification.verified_at,
    payerName: verification.payer_name,
    hasIssues: verification.has_issues,
    issueNotes: verification.issue_notes,
    benefits: {
      copays: benefits.copays,
      deductible: benefits.deductible,
      coinsurance: benefits.coinsurance,
      outOfPocketMax: benefits.outOfPocketMax,
      priorAuth: benefits.priorAuth,
    },
  };
}

/**
 * Create error verification record for patients with missing insurance
 */
async function createErrorVerification(
  patientId: string,
  tenantId: string,
  errorMessage: string,
  verifiedBy?: string,
  appointmentId?: string
): Promise<VerificationResult> {
  const result = await pool.query(
    `INSERT INTO insurance_verifications (
      tenant_id, patient_id, payer_name, verification_status,
      verified_at, verified_by, verification_source, verification_method,
      has_issues, issue_type, issue_notes, appointment_id
    ) VALUES (
      $1, $2, 'Unknown', 'error', NOW(), $3, 'manual', 'manual_entry',
      true, 'missing_insurance', $4, $5
    ) RETURNING id, verification_status, verified_at, payer_name, has_issues, issue_notes`,
    [tenantId, patientId, verifiedBy || null, errorMessage, appointmentId || null]
  );

  const verification = result.rows[0];

  return {
    id: verification.id,
    patientId,
    verificationStatus: verification.verification_status,
    verifiedAt: verification.verified_at,
    payerName: verification.payer_name,
    hasIssues: verification.has_issues,
    issueNotes: verification.issue_notes,
    benefits: {},
  };
}

/**
 * Get verification history for a patient
 */
export async function getVerificationHistory(
  patientId: string,
  tenantId: string
): Promise<any[]> {
  const result = await pool.query(
    `SELECT
      id, payer_name, member_id, verification_status, verified_at,
      copay_specialist_cents, deductible_total_cents, deductible_remaining_cents,
      oop_max_cents, oop_remaining_cents, has_issues, issue_notes,
      prior_auth_required
     FROM insurance_verifications
     WHERE patient_id = $1 AND tenant_id = $2
     ORDER BY verified_at DESC
     LIMIT 50`,
    [patientId, tenantId]
  );

  return result.rows;
}

/**
 * Get the latest verification record per patient in a single query
 */
export async function getLatestVerificationByPatients(
  patientIds: string[],
  tenantId: string
): Promise<Record<string, any | null>> {
  const uniquePatientIds = Array.from(new Set(patientIds.filter(Boolean)));
  if (uniquePatientIds.length === 0) {
    return {};
  }

  const result = await pool.query(
    `SELECT DISTINCT ON (patient_id)
      patient_id,
      id,
      payer_name,
      member_id,
      verification_status,
      verified_at,
      copay_specialist_cents,
      deductible_total_cents,
      deductible_remaining_cents,
      oop_max_cents,
      oop_remaining_cents,
      has_issues,
      issue_notes,
      prior_auth_required
     FROM insurance_verifications
     WHERE tenant_id = $1
       AND patient_id = ANY($2)
     ORDER BY patient_id, verified_at DESC`,
    [tenantId, uniquePatientIds]
  );

  const historyMap: Record<string, any | null> = {};
  uniquePatientIds.forEach((patientId) => {
    historyMap[patientId] = null;
  });
  result.rows.forEach((row) => {
    historyMap[row.patient_id] = row;
  });

  return historyMap;
}

/**
 * Get patients with insurance issues
 */
export async function getPatientsWithIssues(tenantId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT DISTINCT ON (iv.patient_id)
      iv.patient_id,
      p.first_name,
      p.last_name,
      iv.payer_name,
      iv.verification_status,
      iv.verified_at,
      iv.issue_type,
      iv.issue_notes,
      (
        SELECT a.scheduled_time
        FROM appointments a
        WHERE a.patient_id = iv.patient_id
          AND a.tenant_id = iv.tenant_id
          AND a.scheduled_time > NOW()
          AND a.status NOT IN ('cancelled', 'no_show')
        ORDER BY a.scheduled_time ASC
        LIMIT 1
      ) as next_appointment
     FROM insurance_verifications iv
     JOIN patients p ON p.id = iv.patient_id
     WHERE iv.tenant_id = $1
       AND iv.has_issues = true
       AND iv.issue_resolved_at IS NULL
     ORDER BY iv.patient_id, iv.verified_at DESC`,
    [tenantId]
  );

  return result.rows;
}

/**
 * Get patients needing verification
 */
export async function getPatientsNeedingVerification(
  tenantId: string,
  daysThreshold: number = 30
): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM get_patients_needing_verification($1, $2)`,
    [tenantId, daysThreshold]
  );

  return result.rows;
}

/**
 * Get patients with appointments tomorrow (for batch verification)
 */
export async function getTomorrowsPatients(tenantId: string): Promise<string[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = new Date(tomorrow.setHours(0, 0, 0, 0));
  const tomorrowEnd = new Date(tomorrow.setHours(23, 59, 59, 999));

  const result = await pool.query(
    `SELECT DISTINCT patient_id
     FROM appointments
     WHERE tenant_id = $1
       AND scheduled_time >= $2
       AND scheduled_time <= $3
       AND status NOT IN ('cancelled', 'no_show')`,
    [tenantId, tomorrowStart, tomorrowEnd]
  );

  return result.rows.map(row => row.patient_id);
}

/**
 * Calculate patient responsibility for a service
 */
export function calculatePatientResponsibility(
  verification: any,
  serviceCostCents: number
): {
  deductibleAmount: number;
  coinsuranceAmount: number;
  copayAmount: number;
  totalPatientResponsibility: number;
} {
  let deductibleAmount = 0;
  let coinsuranceAmount = 0;
  let copayAmount = verification.copay_specialist_cents || 0;

  // If deductible not met, patient pays deductible first
  if (verification.deductible_remaining_cents > 0) {
    deductibleAmount = Math.min(
      serviceCostCents,
      verification.deductible_remaining_cents
    );
  }

  // After deductible, patient pays coinsurance on remaining amount
  const amountAfterDeductible = serviceCostCents - deductibleAmount;
  if (amountAfterDeductible > 0 && verification.coinsurance_pct) {
    coinsuranceAmount = Math.round(
      amountAfterDeductible * (verification.coinsurance_pct / 100)
    );
  }

  const totalPatientResponsibility = deductibleAmount + coinsuranceAmount + copayAmount;

  return {
    deductibleAmount,
    coinsuranceAmount,
    copayAmount,
    totalPatientResponsibility,
  };
}

/**
 * Format date for API (YYYY-MM-DD)
 */
function formatDateForApi(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0]!;
  }
  return date.toISOString().split('T')[0]!;
}
