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

// ============================================================
// X12 270/271 Transaction Format Support
// ============================================================

/**
 * X12 270 Request Interface
 * Health Care Eligibility/Benefit Inquiry
 */
export interface X12_270_Request {
  transactionSetControlNumber: string;
  informationSourceName: string; // Payer name
  informationSourceId: string; // Payer ID
  informationReceiverName: string; // Provider/Practice name
  informationReceiverNPI: string;
  subscriberLastName: string;
  subscriberFirstName: string;
  subscriberMemberId: string;
  subscriberGroupNumber?: string;
  subscriberDateOfBirth: string; // YYYYMMDD format
  dependentLastName?: string;
  dependentFirstName?: string;
  dependentDateOfBirth?: string;
  dependentRelationship?: string; // 01=Spouse, 19=Child, etc.
  serviceTypeCode: string; // 30=Health Benefit Plan Coverage
  serviceDate: string; // YYYYMMDD format
}

/**
 * X12 271 Response Interface
 * Health Care Eligibility/Benefit Information
 */
export interface X12_271_Response {
  transactionSetControlNumber: string;
  informationSourceName: string;
  informationSourceId: string;
  subscriberEligibilityInfo: {
    eligibilityOrBenefitInfo: string; // 1=Active, 6=Inactive, etc.
    coverageLevel: string; // IND=Individual, FAM=Family
    serviceTypeCode: string;
    planCoverageDescription?: string;
    timePeriodQualifier?: string;
    monetaryAmount?: number;
    percentageAsDecimal?: number;
    quantityQualifier?: string;
    quantity?: number;
  }[];
  subscriberName: string;
  subscriberMemberId: string;
  subscriberGroupNumber?: string;
  additionalInfo?: {
    loopIdentifier: string;
    referenceId?: string;
    date?: string;
    message?: string;
  }[];
  rejectReasons?: {
    code: string;
    message: string;
  }[];
}

/**
 * Generate X12 270 transaction string
 * This creates a production-ready X12 format request
 */
export function generateX12_270_Request(request: X12_270_Request): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = today.toTimeString().slice(0, 5).replace(':', '');

  const segments: string[] = [];

  // ISA - Interchange Control Header
  segments.push(
    `ISA*00*          *00*          *ZZ*${padRight(request.informationReceiverNPI, 15)}*ZZ*${padRight(request.informationSourceId, 15)}*${dateStr.slice(2)}*${timeStr}*^*00501*${padLeft(request.transactionSetControlNumber, 9, '0')}*0*P*:~`
  );

  // GS - Functional Group Header
  segments.push(
    `GS*HS*${request.informationReceiverNPI}*${request.informationSourceId}*${dateStr}*${timeStr}*1*X*005010X279A1~`
  );

  // ST - Transaction Set Header
  segments.push(
    `ST*270*0001*005010X279A1~`
  );

  // BHT - Beginning of Hierarchical Transaction
  segments.push(
    `BHT*0022*13*${request.transactionSetControlNumber}*${dateStr}*${timeStr}~`
  );

  // 2000A - Information Source Level
  segments.push(`HL*1**20*1~`);

  // 2100A - Information Source Name
  segments.push(
    `NM1*PR*2*${request.informationSourceName}*****PI*${request.informationSourceId}~`
  );

  // 2000B - Information Receiver Level
  segments.push(`HL*2*1*21*1~`);

  // 2100B - Information Receiver Name
  segments.push(
    `NM1*1P*2*${request.informationReceiverName}*****XX*${request.informationReceiverNPI}~`
  );

  // 2000C - Subscriber Level
  segments.push(`HL*3*2*22*0~`);

  // TRN - Trace Number
  segments.push(
    `TRN*1*${request.transactionSetControlNumber}*${request.informationReceiverNPI}~`
  );

  // 2100C - Subscriber Name
  segments.push(
    `NM1*IL*1*${request.subscriberLastName}*${request.subscriberFirstName}****MI*${request.subscriberMemberId}~`
  );

  // DMG - Subscriber Demographics
  segments.push(
    `DMG*D8*${request.subscriberDateOfBirth}~`
  );

  // DTP - Service Date
  segments.push(
    `DTP*291*D8*${request.serviceDate}~`
  );

  // EQ - Eligibility/Benefit Inquiry
  segments.push(
    `EQ*${request.serviceTypeCode}~`
  );

  // SE - Transaction Set Trailer
  const segmentCount = segments.length - 2 + 1; // Exclude ISA and GS, add SE
  segments.push(
    `SE*${segmentCount}*0001~`
  );

  // GE - Functional Group Trailer
  segments.push(`GE*1*1~`);

  // IEA - Interchange Control Trailer
  segments.push(
    `IEA*1*${padLeft(request.transactionSetControlNumber, 9, '0')}~`
  );

  return segments.join('\n');
}

/**
 * Parse X12 271 response string into structured data
 */
export function parseX12_271_Response(x12Response: string): X12_271_Response {
  const segments = x12Response.split('~').map(s => s.trim()).filter(s => s);
  const response: X12_271_Response = {
    transactionSetControlNumber: '',
    informationSourceName: '',
    informationSourceId: '',
    subscriberEligibilityInfo: [],
    subscriberName: '',
    subscriberMemberId: '',
  };

  for (const segment of segments) {
    const elements = segment.split('*');
    const segmentId = elements[0];

    switch (segmentId) {
      case 'ST':
        response.transactionSetControlNumber = elements[2] || '';
        break;

      case 'NM1':
        if (elements[1] === 'PR') {
          // Information Source (Payer)
          response.informationSourceName = elements[3] || '';
          response.informationSourceId = elements[9] || '';
        } else if (elements[1] === 'IL') {
          // Subscriber
          response.subscriberName = `${elements[4] || ''} ${elements[3] || ''}`.trim();
          response.subscriberMemberId = elements[9] || '';
        }
        break;

      case 'REF':
        if (elements[1] === '6P') {
          response.subscriberGroupNumber = elements[2];
        }
        break;

      case 'EB':
        // Eligibility/Benefit Information
        const ebInfo: X12_271_Response['subscriberEligibilityInfo'][0] = {
          eligibilityOrBenefitInfo: elements[1] || '',
          coverageLevel: elements[2] || '',
          serviceTypeCode: elements[3] || '',
          planCoverageDescription: elements[4],
          timePeriodQualifier: elements[5],
          monetaryAmount: elements[6] ? parseFloat(elements[6]) : undefined,
          percentageAsDecimal: elements[7] ? parseFloat(elements[7]) : undefined,
        };
        response.subscriberEligibilityInfo.push(ebInfo);
        break;

      case 'AAA':
        // Reject/Error information
        if (!response.rejectReasons) response.rejectReasons = [];
        response.rejectReasons.push({
          code: elements[3] || 'UNKNOWN',
          message: elements[4] || 'Unknown error',
        });
        break;
    }
  }

  return response;
}

// Helper functions for X12 formatting
function padRight(str: string, length: number, char = ' '): string {
  return str.padEnd(length, char).slice(0, length);
}

function padLeft(str: string, length: number, char = ' '): string {
  return str.padStart(length, char).slice(0, length);
}

// ============================================================
// Caching System (24-hour cache)
// ============================================================

const CACHE_DURATION_HOURS = 24;

/**
 * Generate cache key for eligibility lookup
 */
function generateCacheKey(patientId: string, payerId: string, serviceType = '30'): string {
  return `eligibility:${patientId}:${payerId}:${serviceType}`;
}

/**
 * Check cache for existing eligibility result
 */
export async function getCachedEligibility(
  tenantId: string,
  patientId: string,
  payerId: string,
  serviceType = '30'
): Promise<EligibilityCheckResult | null> {
  const cacheKey = generateCacheKey(patientId, payerId, serviceType);

  try {
    const result = await pool.query(
      `SELECT er.*, ec.cached_at, ec.expires_at
       FROM eligibility_cache ec
       JOIN eligibility_responses er ON ec.response_id = er.id
       WHERE ec.tenant_id = $1
         AND ec.cache_key = $2
         AND ec.expires_at > NOW()
       LIMIT 1`,
      [tenantId, cacheKey]
    );

    if (result.rows.length > 0) {
      const cached = result.rows[0];

      // Update hit count
      await pool.query(
        `UPDATE eligibility_cache
         SET hit_count = hit_count + 1, last_accessed_at = NOW()
         WHERE tenant_id = $1 AND cache_key = $2`,
        [tenantId, cacheKey]
      );

      logger.info('Eligibility cache hit', { patientId, payerId, cacheKey });

      return {
        success: true,
        cached: true,
        cachedAt: cached.cached_at,
        expiresAt: cached.expires_at,
        coverageActive: cached.coverage_active,
        copayAmount: cached.copay_amount,
        deductibleRemaining: cached.deductible_remaining,
        coinsurancePct: cached.coinsurance_pct,
        outOfPocketRemaining: cached.out_of_pocket_remaining,
        coverageDetails: cached.coverage_details,
      };
    }

    return null;
  } catch (error) {
    logger.warn('Error checking eligibility cache', {
      error: (error as Error).message,
      patientId,
      payerId,
    });
    return null;
  }
}

/**
 * Store eligibility result in cache
 */
export async function cacheEligibilityResult(
  tenantId: string,
  patientId: string,
  payerId: string,
  responseId: string,
  response: {
    coverageActive: boolean;
    copayAmount?: number;
    deductibleRemaining?: number;
    coinsurancePct?: number;
    outOfPocketRemaining?: number;
  },
  serviceType = '30'
): Promise<void> {
  const cacheKey = generateCacheKey(patientId, payerId, serviceType);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CACHE_DURATION_HOURS);

  try {
    await pool.query(
      `INSERT INTO eligibility_cache (
        tenant_id, cache_key, patient_id, payer_id, service_type,
        response_id, expires_at, coverage_active, copay_amount,
        deductible_remaining, coinsurance_pct, out_of_pocket_remaining
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (tenant_id, cache_key)
      DO UPDATE SET
        response_id = EXCLUDED.response_id,
        expires_at = EXCLUDED.expires_at,
        coverage_active = EXCLUDED.coverage_active,
        copay_amount = EXCLUDED.copay_amount,
        deductible_remaining = EXCLUDED.deductible_remaining,
        coinsurance_pct = EXCLUDED.coinsurance_pct,
        out_of_pocket_remaining = EXCLUDED.out_of_pocket_remaining,
        hit_count = 0,
        cached_at = NOW()`,
      [
        tenantId, cacheKey, patientId, payerId, serviceType,
        responseId, expiresAt, response.coverageActive,
        response.copayAmount || null, response.deductibleRemaining || null,
        response.coinsurancePct || null, response.outOfPocketRemaining || null,
      ]
    );

    logger.info('Eligibility result cached', {
      patientId, payerId, cacheKey, expiresAt,
    });
  } catch (error) {
    logger.error('Error caching eligibility result', {
      error: (error as Error).message,
      patientId, payerId,
    });
  }
}

// ============================================================
// Retry Logic with Exponential Backoff
// ============================================================

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Execute function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let delay = retryConfig.initialDelayMs;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === retryConfig.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      logger.warn('Eligibility check failed, retrying', {
        attempt: attempt + 1,
        maxRetries: retryConfig.maxRetries,
        delay,
        error: lastError.message,
      });

      // Wait before retry
      await sleep(delay);

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelayMs);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on timeout, network, or temporary errors
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('temporary') ||
      message.includes('unavailable') ||
      message.includes('503') ||
      message.includes('504')
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Enhanced Eligibility Check with All Features
// ============================================================

export interface EligibilityCheckResult {
  success: boolean;
  cached?: boolean;
  cachedAt?: Date;
  expiresAt?: Date;
  coverageActive: boolean;
  copayAmount?: number;
  deductibleRemaining?: number;
  coinsurancePct?: number;
  outOfPocketRemaining?: number;
  coverageDetails?: Record<string, unknown>;
  requestId?: string;
  responseId?: string;
  error?: string;
}

export interface CheckEligibilityOptions {
  patientId: string;
  payerId: string;
  serviceDate?: Date;
  serviceType?: string;
  bypassCache?: boolean;
  timeout?: number;
}

/**
 * Main eligibility check function with caching and retry support
 */
export async function checkEligibility(
  tenantId: string,
  options: CheckEligibilityOptions
): Promise<EligibilityCheckResult> {
  const {
    patientId,
    payerId,
    serviceDate = new Date(),
    serviceType = '30',
    bypassCache = false,
    timeout = 30000,
  } = options;

  logger.info('Starting eligibility check', {
    tenantId, patientId, payerId, serviceType, bypassCache,
  });

  // Check cache first (unless bypassed)
  if (!bypassCache) {
    const cached = await getCachedEligibility(tenantId, patientId, payerId, serviceType);
    if (cached) {
      return cached;
    }
  }

  // Create request record
  const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    await pool.query(
      `INSERT INTO eligibility_requests (
        id, tenant_id, patient_id, payer_id, service_type,
        service_date, status, processing_started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'processing', NOW())`,
      [requestId, tenantId, patientId, payerId, serviceType, serviceDate]
    );
  } catch (insertError) {
    logger.warn('Could not create eligibility request record', {
      error: (insertError as Error).message,
    });
  }

  try {
    // Execute with retry logic and timeout
    const result = await withRetry(
      async () => {
        // Get payer configuration
        const payerConfig = await getPayerConfiguration(tenantId, payerId);

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        );

        // Execute eligibility check with timeout
        const checkPromise = executeEligibilityCheck(
          tenantId, patientId, payerId, payerConfig, serviceDate, serviceType
        );

        return await Promise.race([checkPromise, timeoutPromise]);
      },
      { maxRetries: 3, initialDelayMs: 1000 }
    );

    // Store response
    const responseId = `RES-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    try {
      await pool.query(
        `INSERT INTO eligibility_responses (
          id, tenant_id, request_id, coverage_active, copay_amount,
          deductible_remaining, coinsurance_pct, out_of_pocket_remaining,
          coverage_details, response_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'mock')`,
        [
          responseId, tenantId, requestId, result.coverageActive,
          result.copayAmount, result.deductibleRemaining,
          result.coinsurancePct, result.outOfPocketRemaining,
          JSON.stringify(result.coverageDetails || {}),
        ]
      );

      // Update request as completed
      await pool.query(
        `UPDATE eligibility_requests
         SET status = 'completed',
             processing_completed_at = NOW(),
             processing_duration_ms = EXTRACT(EPOCH FROM (NOW() - processing_started_at)) * 1000
         WHERE id = $1`,
        [requestId]
      );

      // Cache the result
      await cacheEligibilityResult(
        tenantId, patientId, payerId, responseId,
        {
          coverageActive: result.coverageActive,
          copayAmount: result.copayAmount,
          deductibleRemaining: result.deductibleRemaining,
          coinsurancePct: result.coinsurancePct,
          outOfPocketRemaining: result.outOfPocketRemaining,
        },
        serviceType
      );
    } catch (storeError) {
      logger.warn('Could not store eligibility response', {
        error: (storeError as Error).message,
      });
    }

    return {
      ...result,
      requestId,
      responseId,
    };
  } catch (error) {
    // Update request as failed
    try {
      await pool.query(
        `UPDATE eligibility_requests
         SET status = 'failed',
             error_code = 'CHECK_FAILED',
             error_message = $1,
             processing_completed_at = NOW()
         WHERE id = $2`,
        [(error as Error).message, requestId]
      );
    } catch (updateError) {
      logger.warn('Could not update failed eligibility request', {
        error: (updateError as Error).message,
      });
    }

    logger.error('Eligibility check failed', {
      patientId, payerId, error: (error as Error).message,
    });

    return {
      success: false,
      coverageActive: false,
      error: (error as Error).message,
      requestId,
    };
  }
}

/**
 * Get payer configuration from database
 */
async function getPayerConfiguration(tenantId: string, payerId: string): Promise<{
  timeoutMs: number;
  maxRetries: number;
  cacheDurationHours: number;
  eligibilityEndpoint?: string;
}> {
  try {
    const result = await pool.query(
      `SELECT timeout_ms, max_retries, cache_duration_hours, eligibility_endpoint
       FROM payer_configurations
       WHERE (tenant_id = $1 OR tenant_id = 'default')
         AND payer_id = $2
         AND is_active = true
       ORDER BY CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [tenantId, payerId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Return defaults if no configuration found
    return {
      timeoutMs: 30000,
      maxRetries: 3,
      cacheDurationHours: 24,
    };
  } catch (error) {
    logger.warn('Could not get payer configuration, using defaults', {
      error: (error as Error).message,
      payerId,
    });
    return {
      timeoutMs: 30000,
      maxRetries: 3,
      cacheDurationHours: 24,
    };
  }
}

/**
 * Execute the actual eligibility check (uses mock for now)
 */
async function executeEligibilityCheck(
  tenantId: string,
  patientId: string,
  payerId: string,
  _payerConfig: { eligibilityEndpoint?: string },
  serviceDate: Date,
  _serviceType: string
): Promise<EligibilityCheckResult> {
  // Get patient data
  const patientResult = await pool.query(
    `SELECT first_name, last_name, dob, insurance_member_id
     FROM patients
     WHERE id = $1 AND tenant_id = $2`,
    [patientId, tenantId]
  );

  if (patientResult.rows.length === 0) {
    throw new Error('Patient not found');
  }

  const patient = patientResult.rows[0];

  // Use mock eligibility check for now
  // In production, this would call the actual payer API
  const response = await mockEligibilityCheck({
    payerId,
    memberId: patient.insurance_member_id || '',
    patientFirstName: patient.first_name,
    patientLastName: patient.last_name,
    patientDob: formatDateForApi(patient.dob),
    serviceDate: formatDateForApi(serviceDate),
  });

  return {
    success: response.success,
    coverageActive: response.coverage.status === 'active',
    copayAmount: response.benefits.copays?.specialist,
    deductibleRemaining: response.benefits.deductible?.individual?.remaining,
    coinsurancePct: response.benefits.coinsurance?.percentage,
    outOfPocketRemaining: response.benefits.outOfPocketMax?.individual?.remaining,
    coverageDetails: {
      planName: response.coverage.planName,
      planType: response.coverage.planType,
      effectiveDate: response.coverage.effectiveDate,
      terminationDate: response.coverage.terminationDate,
      network: response.network,
      priorAuth: response.benefits.priorAuth,
      referral: response.benefits.referral,
    },
  };
}

/**
 * Get eligibility by patient ID (convenience wrapper)
 */
export async function getPatientEligibility(
  tenantId: string,
  patientId: string
): Promise<EligibilityCheckResult | null> {
  // First try to get from existing insurance_verifications table
  const result = await pool.query(
    `SELECT
      verification_status,
      copay_specialist_cents,
      deductible_remaining_cents,
      coinsurance_pct,
      oop_remaining_cents,
      verified_at
     FROM insurance_verifications
     WHERE tenant_id = $1 AND patient_id = $2
     ORDER BY verified_at DESC
     LIMIT 1`,
    [tenantId, patientId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    success: true,
    coverageActive: row.verification_status === 'active',
    copayAmount: row.copay_specialist_cents,
    deductibleRemaining: row.deductible_remaining_cents,
    coinsurancePct: row.coinsurance_pct,
    outOfPocketRemaining: row.oop_remaining_cents,
  };
}
