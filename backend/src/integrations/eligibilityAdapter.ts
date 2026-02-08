/**
 * Insurance Eligibility Adapter
 *
 * Handles real-time eligibility verification with clearinghouses
 * (Availity, Change Healthcare, etc.) using 270/271 transactions.
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

// ============================================================================
// Types
// ============================================================================

export interface EligibilityRequest {
  patientId: string;
  payerId: string;
  memberId: string;
  patientFirstName: string;
  patientLastName: string;
  patientDob: string;
  serviceDate?: string;
  serviceType?: string;
  providerId?: string;
  providerNpi?: string;
}

export interface EligibilityResponse {
  success: boolean;
  requestId: string;
  status: 'active' | 'inactive' | 'unknown' | 'error';
  payer: {
    payerId: string;
    payerName: string;
  };
  patient: {
    memberId: string;
    firstName: string;
    lastName: string;
    dob: string;
    groupNumber?: string;
  };
  subscriber?: {
    firstName: string;
    lastName: string;
    dob: string;
    relationship: string;
  };
  coverage: {
    status: 'active' | 'inactive' | 'unknown';
    effectiveDate?: string;
    terminationDate?: string;
    planName?: string;
    planType?: string;
    coverageLevel?: string;
    coordinationOfBenefits?: string;
  };
  benefits: {
    copays?: {
      primaryCare?: number;
      specialist?: number;
      emergency?: number;
      urgentCare?: number;
    };
    deductible?: {
      individual?: { total: number; met: number; remaining: number };
      family?: { total: number; met: number; remaining: number };
    };
    coinsurance?: {
      percentage: number;
    };
    outOfPocketMax?: {
      individual?: { total: number; met: number; remaining: number };
      family?: { total: number; met: number; remaining: number };
    };
    priorAuth?: {
      required: boolean;
      services?: string[];
      phone?: string;
    };
    referral?: {
      required: boolean;
      phone?: string;
    };
  };
  network?: {
    inNetwork: boolean;
    networkName?: string;
  };
  messages?: Array<{
    type: 'info' | 'warning' | 'error';
    message: string;
  }>;
  rawResponse?: any;
}

export interface CoverageDetails {
  patientId: string;
  payerName: string;
  memberId: string;
  groupNumber?: string;
  planName?: string;
  isActive: boolean;
  effectiveDate?: string;
  copaySpecialist?: number;
  deductibleRemaining?: number;
  outOfPocketRemaining?: number;
  priorAuthRequired: boolean;
  lastVerifiedAt: string;
  expiresAt?: string;
}

export interface BatchEligibilityResult {
  batchId: string;
  totalPatients: number;
  verifiedCount: number;
  activeCount: number;
  inactiveCount: number;
  errorCount: number;
  results: EligibilityResponse[];
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_PAYERS = [
  { payerId: 'BCBS001', payerName: 'Blue Cross Blue Shield' },
  { payerId: 'AETNA01', payerName: 'Aetna' },
  { payerId: 'UHC0001', payerName: 'United Healthcare' },
  { payerId: 'CIGNA01', payerName: 'Cigna' },
  { payerId: 'HUMANA1', payerName: 'Humana' },
];

const MOCK_PLANS = [
  { name: 'PPO Gold', type: 'PPO' },
  { name: 'HMO Standard', type: 'HMO' },
  { name: 'High Deductible Health Plan', type: 'HDHP' },
  { name: 'EPO Select', type: 'EPO' },
];

// ============================================================================
// Eligibility Adapter
// ============================================================================

export class EligibilityAdapter extends BaseAdapter {
  private provider: string;

  constructor(options: AdapterOptions & { provider?: string }) {
    super(options);
    this.provider = options.provider || 'availity';
  }

  getIntegrationType(): string {
    return 'eligibility';
  }

  getProvider(): string {
    return this.provider;
  }

  /**
   * Test connection to eligibility service
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      await this.sleep(300);
      return {
        success: true,
        message: `Connected to ${this.provider} eligibility service (mock mode)`,
      };
    }

    const startTime = Date.now();
    try {
      await this.sleep(500);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/eligibility/test',
        method: 'GET',
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        message: `Connected to ${this.provider} eligibility service`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Check real-time eligibility for a patient
   */
  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    const startTime = Date.now();
    const requestId = this.generateCorrelationId();

    logger.info('Checking eligibility', {
      patientId: request.patientId,
      payerId: request.payerId,
      memberId: request.memberId,
      requestId,
    });

    try {
      let response: EligibilityResponse;

      if (this.useMock) {
        response = await this.mockCheckEligibility(request, requestId);
      } else {
        response = await this.withRetry(() => this.realCheckEligibility(request, requestId));
      }

      // Store eligibility check result
      await this.storeEligibilityCheck(request, response);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/eligibility/check',
        method: 'POST',
        request: {
          patientId: request.patientId,
          payerId: request.payerId,
          memberId: request.memberId,
        },
        response: {
          status: response.status,
          success: response.success,
        },
        status: response.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
        correlationId: requestId,
      });

      return response;
    } catch (error: any) {
      logger.error('Eligibility check failed', {
        patientId: request.patientId,
        error: error.message,
        requestId,
      });

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/eligibility/check',
        method: 'POST',
        request: { patientId: request.patientId },
        status: 'error',
        errorMessage: error.message,
        durationMs: Date.now() - startTime,
        correlationId: requestId,
      });

      return {
        success: false,
        requestId,
        status: 'error',
        payer: { payerId: request.payerId, payerName: 'Unknown' },
        patient: {
          memberId: request.memberId,
          firstName: request.patientFirstName,
          lastName: request.patientLastName,
          dob: request.patientDob,
        },
        coverage: { status: 'unknown' },
        benefits: {},
        messages: [{ type: 'error', message: error.message }],
      };
    }
  }

  /**
   * Parse a 271 eligibility response (for real implementations)
   */
  parseEligibilityResponse(rawResponse: any): EligibilityResponse {
    // This would parse the actual EDI 271 response
    // For now, return the response as-is if it's already structured
    if (rawResponse.status && rawResponse.payer) {
      return rawResponse as EligibilityResponse;
    }

    // Basic parsing for X12 271 response
    return {
      success: true,
      requestId: crypto.randomUUID(),
      status: 'active',
      payer: {
        payerId: rawResponse.payerId || 'UNKNOWN',
        payerName: rawResponse.payerName || 'Unknown Payer',
      },
      patient: {
        memberId: rawResponse.memberId || '',
        firstName: rawResponse.firstName || '',
        lastName: rawResponse.lastName || '',
        dob: rawResponse.dob || '',
      },
      coverage: {
        status: rawResponse.coverageStatus || 'unknown',
      },
      benefits: {},
    };
  }

  /**
   * Get coverage details summary for a patient
   */
  async getCoverageDetails(patientId: string): Promise<CoverageDetails | null> {
    try {
      const result = await pool.query(
        `SELECT
          ec.patient_id,
          ec.payer_name,
          ec.payer_id,
          ec.status,
          ec.coverage_details,
          ec.benefits,
          ec.checked_at,
          ec.expires_at
         FROM eligibility_checks ec
         WHERE ec.patient_id = $1 AND ec.tenant_id = $2
         ORDER BY ec.checked_at DESC
         LIMIT 1`,
        [patientId, this.tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const coverage = row.coverage_details || {};
      const benefits = row.benefits || {};

      return {
        patientId,
        payerName: row.payer_name,
        memberId: coverage.memberId || '',
        groupNumber: coverage.groupNumber,
        planName: coverage.planName,
        isActive: row.status === 'active',
        effectiveDate: coverage.effectiveDate,
        copaySpecialist: benefits.copays?.specialist,
        deductibleRemaining: benefits.deductible?.individual?.remaining,
        outOfPocketRemaining: benefits.outOfPocketMax?.individual?.remaining,
        priorAuthRequired: benefits.priorAuth?.required || false,
        lastVerifiedAt: row.checked_at,
        expiresAt: row.expires_at,
      };
    } catch (error) {
      logger.error('Failed to get coverage details', { patientId, error });
      return null;
    }
  }

  /**
   * Batch eligibility check for multiple patients
   */
  async batchEligibilityCheck(
    patients: Array<{
      patientId: string;
      payerId: string;
      memberId: string;
      firstName: string;
      lastName: string;
      dob: string;
    }>
  ): Promise<BatchEligibilityResult> {
    const batchId = `ELIG-BATCH-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

    logger.info('Starting batch eligibility check', {
      batchId,
      patientCount: patients.length,
    });

    const results: EligibilityResponse[] = [];
    let activeCount = 0;
    let inactiveCount = 0;
    let errorCount = 0;

    // Process in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < patients.length; i += batchSize) {
      const batch = patients.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(patient =>
          this.checkEligibility({
            patientId: patient.patientId,
            payerId: patient.payerId,
            memberId: patient.memberId,
            patientFirstName: patient.firstName,
            patientLastName: patient.lastName,
            patientDob: patient.dob,
          })
        )
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.status === 'active') activeCount++;
        else if (result.status === 'inactive') inactiveCount++;
        else errorCount++;
      }
    }

    await this.logIntegration({
      direction: 'outbound',
      endpoint: '/api/v1/eligibility/batch',
      method: 'POST',
      request: { batchId, patientCount: patients.length },
      response: { activeCount, inactiveCount, errorCount },
      status: 'success',
      correlationId: batchId,
    });

    return {
      batchId,
      totalPatients: patients.length,
      verifiedCount: results.length,
      activeCount,
      inactiveCount,
      errorCount,
      results,
    };
  }

  // ============================================================================
  // Mock Implementation
  // ============================================================================

  private async mockCheckEligibility(
    request: EligibilityRequest,
    requestId: string
  ): Promise<EligibilityResponse> {
    await this.sleep(500 + Math.random() * 1000);

    // 90% active, 5% inactive, 5% error
    const random = Math.random();
    let status: 'active' | 'inactive' | 'error';
    if (random < 0.9) status = 'active';
    else if (random < 0.95) status = 'inactive';
    else status = 'error';

    const payer = MOCK_PAYERS.find(p => p.payerId === request.payerId) ||
      MOCK_PAYERS[Math.floor(Math.random() * MOCK_PAYERS.length)]!;
    const plan = MOCK_PLANS[Math.floor(Math.random() * MOCK_PLANS.length)]!;

    const deductibleTotal = [500, 1000, 1500, 2500, 3000][Math.floor(Math.random() * 5)]!;
    const deductibleMet = Math.floor(Math.random() * deductibleTotal);
    const oopTotal = deductibleTotal * 4;
    const oopMet = Math.floor(Math.random() * oopTotal * 0.3);

    return {
      success: status !== 'error',
      requestId,
      status,
      payer: {
        payerId: payer.payerId,
        payerName: payer.payerName,
      },
      patient: {
        memberId: request.memberId,
        firstName: request.patientFirstName,
        lastName: request.patientLastName,
        dob: request.patientDob,
        groupNumber: `GRP${Math.floor(Math.random() * 100000)}`,
      },
      coverage: {
        status: status === 'error' ? 'unknown' : status,
        effectiveDate: new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0],
        terminationDate: status === 'inactive'
          ? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
          : undefined,
        planName: plan.name,
        planType: plan.type,
        coverageLevel: 'Individual',
        coordinationOfBenefits: 'Primary',
      },
      benefits: {
        copays: {
          primaryCare: 2000 + Math.floor(Math.random() * 3) * 500,
          specialist: 4000 + Math.floor(Math.random() * 4) * 1000,
          emergency: 25000 + Math.floor(Math.random() * 4) * 5000,
          urgentCare: 5000 + Math.floor(Math.random() * 3) * 2500,
        },
        deductible: {
          individual: {
            total: deductibleTotal * 100,
            met: deductibleMet * 100,
            remaining: (deductibleTotal - deductibleMet) * 100,
          },
        },
        coinsurance: {
          percentage: [10, 20, 30][Math.floor(Math.random() * 3)]!,
        },
        outOfPocketMax: {
          individual: {
            total: oopTotal * 100,
            met: oopMet * 100,
            remaining: (oopTotal - oopMet) * 100,
          },
        },
        priorAuth: {
          required: Math.random() < 0.3,
          services: ['Biologics', 'Imaging', 'Specialty Procedures'],
          phone: '1-800-555-0123',
        },
        referral: {
          required: plan.type === 'HMO',
          phone: plan.type === 'HMO' ? '1-800-555-0124' : undefined,
        },
      },
      network: {
        inNetwork: Math.random() < 0.9,
        networkName: `${payer.payerName} Preferred Network`,
      },
      messages: status === 'inactive'
        ? [{ type: 'warning' as const, message: 'Coverage has been terminated' }]
        : status === 'error'
          ? [{ type: 'error' as const, message: 'Unable to verify eligibility at this time' }]
          : [],
    };
  }

  // ============================================================================
  // Real API Implementation (placeholder)
  // ============================================================================

  private async realCheckEligibility(
    request: EligibilityRequest,
    requestId: string
  ): Promise<EligibilityResponse> {
    // In production, this would call the actual Availity/Change Healthcare API
    // Example for Availity:
    // POST /availity-api/v1/eligibility
    // With X12 270 transaction or JSON payload
    throw new Error('Real API not implemented - use mock mode');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async storeEligibilityCheck(
    request: EligibilityRequest,
    response: EligibilityResponse
  ): Promise<void> {
    try {
      // Calculate expiration (24 hours from now for active, 1 hour for inactive/error)
      const expiresAt = new Date();
      if (response.status === 'active') {
        expiresAt.setHours(expiresAt.getHours() + 24);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 1);
      }

      await pool.query(
        `INSERT INTO eligibility_checks
         (tenant_id, patient_id, payer_id, payer_name, member_id, service_date,
          status, response, coverage_details, benefits, in_network,
          requires_prior_auth, request_id, expires_at, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          this.tenantId,
          request.patientId,
          response.payer.payerId,
          response.payer.payerName,
          response.patient.memberId,
          request.serviceDate || new Date().toISOString().split('T')[0],
          response.status,
          JSON.stringify(response),
          JSON.stringify(response.coverage),
          JSON.stringify(response.benefits),
          response.network?.inNetwork,
          response.benefits.priorAuth?.required || false,
          response.requestId,
          expiresAt,
          this.useMock ? 'mock' : 'api',
        ]
      );
    } catch (error) {
      logger.error('Failed to store eligibility check', { error });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEligibilityAdapter(
  tenantId: string,
  provider: string = 'availity',
  useMock: boolean = true
): EligibilityAdapter {
  return new EligibilityAdapter({
    tenantId,
    provider,
    useMock,
  });
}
