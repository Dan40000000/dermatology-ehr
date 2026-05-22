/**
 * Insurance Eligibility Adapter
 *
 * Handles real-time eligibility verification with clearinghouses
 * (Stedi, Availity, Change Healthcare, etc.) using 270/271 transactions.
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

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const raw = typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : String(value);
  if (!raw.trim()) return undefined;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match?.[1]) return match[1];

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  return undefined;
}

function formatStediDate(value: unknown): string | undefined {
  const normalized = normalizeDate(value);
  return normalized ? normalized.replace(/-/g, '') : undefined;
}

function normalizeMoney(value: unknown, amountUnit: 'dollars' | 'cents'): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = typeof value === 'number'
    ? value
    : Number.parseFloat(String(value).replace(/[$,]/g, '').trim());

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return amountUnit === 'cents' ? Math.round(numeric) : Math.round(numeric * 100);
}

function walkEntries(
  input: unknown,
  visit: (path: string, key: string, value: unknown) => void,
  path = ''
): void {
  if (!input || typeof input !== 'object') {
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item, index) => walkEntries(item, visit, `${path}[${index}]`));
    return;
  }

  for (const [key, value] of Object.entries(input)) {
    const nextPath = path ? `${path}.${key}` : key;
    visit(nextPath, key, value);
    walkEntries(value, visit, nextPath);
  }
}

function findStringByPatterns(input: unknown, patterns: RegExp[]): string | undefined {
  let match: string | undefined;

  walkEntries(input, (path, key, value) => {
    if (match || typeof value !== 'string' || !value.trim()) {
      return;
    }

    const haystack = `${path}.${key}`;
    if (patterns.some((pattern) => pattern.test(haystack))) {
      match = value.trim();
    }
  });

  return match;
}

function findBooleanByPatterns(input: unknown, patterns: RegExp[]): boolean | undefined {
  let match: boolean | undefined;

  walkEntries(input, (path, key, value) => {
    if (match !== undefined) {
      return;
    }

    const haystack = `${path}.${key}`;
    if (!patterns.some((pattern) => pattern.test(haystack))) {
      return;
    }

    if (typeof value === 'boolean') {
      match = value;
      return;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', 'required', 'active', 'covered'].includes(normalized)) {
        match = true;
      } else if (['false', 'no', 'not required', 'inactive', 'not covered'].includes(normalized)) {
        match = false;
      }
    }
  });

  return match;
}

function findMoneyByPatterns(
  input: unknown,
  patterns: RegExp[],
  amountUnit: 'dollars' | 'cents'
): number | undefined {
  let match: number | undefined;

  walkEntries(input, (path, key, value) => {
    if (match !== undefined) {
      return;
    }

    const haystack = `${path}.${key}`;
    if (patterns.some((pattern) => pattern.test(haystack))) {
      match = normalizeMoney(value, amountUnit);
    }
  });

  return match;
}

function findCoverageStatus(rawCoverage: any): 'active' | 'inactive' | 'unknown' {
  const planStatuses: string[] = Array.isArray(rawCoverage?.plans)
    ? rawCoverage.plans
        .map((plan: any) => firstNonEmptyString(plan?.status, plan?.statusCode))
        .filter((status: string | undefined): status is string => Boolean(status))
        .map((status: string) => status.toLowerCase())
    : [];

  if (planStatuses.some((status) => status.includes('active'))) {
    return 'active';
  }

  if (planStatuses.some((status) => status.includes('inactive') || status.includes('terminated'))) {
    return 'inactive';
  }

  const generic = findStringByPatterns(rawCoverage, [
    /coverage.*status/i,
    /plan.*status/i,
    /eligib.*status/i,
  ])?.toLowerCase();

  if (generic?.includes('active')) return 'active';
  if (generic?.includes('inactive') || generic?.includes('terminated')) return 'inactive';

  return 'unknown';
}

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
      if (this.provider === 'stedi') {
        await this.testStediConnection();
      } else {
        await this.fetchAvailityAccessToken();
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: this.provider === 'stedi'
          ? `${this.getBaseUrl()}${this.getStediEligibilityPath()}`
          : `${this.getTokenPath()}`,
        method: 'POST',
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
    if (this.provider === 'stedi') {
      const stediResponse = await this.requestStediEligibility(request);
      return this.parseStediEligibilityResponse(stediResponse, request, requestId);
    }

    if (this.provider !== 'availity') {
      throw new Error(`Unsupported live eligibility provider: ${this.provider}`);
    }

    const token = await this.fetchAvailityAccessToken();
    const coverageResponse = await this.requestAvailityCoverage(token, request, requestId);

    return this.parseAvailityCoverageResponse(coverageResponse, request, requestId);
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

  private getBaseUrl(): string {
    if (this.provider === 'stedi') {
      return String(
        this.config?.config?.baseUrl ||
        process.env.STEDI_API_BASE_URL ||
        'https://healthcare.us.stedi.com/2024-04-01'
      ).replace(/\/+$/, '');
    }

    return String(this.config?.config?.baseUrl || 'https://api.availity.com').replace(/\/+$/, '');
  }

  private getTokenPath(): string {
    return String(this.config?.config?.tokenPath || '/v1/token');
  }

  private getCoveragesPath(): string {
    return String(this.config?.config?.coveragesPath || '/v1/coverages');
  }

  private getStediEligibilityPath(): string {
    return String(
      this.config?.config?.eligibilityPath ||
      process.env.STEDI_ELIGIBILITY_PATH ||
      '/change/medicalnetwork/eligibility/v3'
    );
  }

  private getAmountUnit(): 'dollars' | 'cents' {
    const configured = String(this.config?.config?.amountUnit || 'dollars').trim().toLowerCase();
    return configured === 'cents' ? 'cents' : 'dollars';
  }

  private getTokenAuthMethod(): 'basic' | 'client_secret_post' {
    const configured = String(this.config?.config?.tokenAuthMethod || '').trim().toLowerCase();
    return configured === 'basic' ? 'basic' : 'client_secret_post';
  }

  private getScopes(): string | undefined {
    const configured = this.config?.config?.scope ?? this.config?.config?.scopes;
    if (Array.isArray(configured)) {
      const scopes = configured
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      return scopes.length > 0 ? scopes.join(' ') : undefined;
    }
    if (typeof configured === 'string' && configured.trim()) {
      return configured.trim();
    }
    return undefined;
  }

  private getStediApiKey(): string {
    const credentials = this.getCredentials();
    const apiKey = firstNonEmptyString(
      credentials.apiKey,
      credentials.api_key,
      credentials.stediApiKey,
      process.env.STEDI_API_KEY
    );

    if (!apiKey) {
      throw new Error('Missing Stedi API key');
    }

    return apiKey;
  }

  private getStediProvider(): Record<string, string> {
    const config = this.config?.config || {};
    const configuredProvider = config.provider && typeof config.provider === 'object'
      ? config.provider
      : {};

    const provider: Record<string, string> = {};
    const organizationName = firstNonEmptyString(
      configuredProvider.organizationName,
      config.providerOrganizationName,
      config.organizationName,
      'Dermatology Test Clinic'
    );
    const providerNpi = firstNonEmptyString(
      configuredProvider.npi,
      config.providerNpi
    );
    const firstName = firstNonEmptyString(configuredProvider.firstName, config.providerFirstName);
    const lastName = firstNonEmptyString(configuredProvider.lastName, config.providerLastName);
    const taxId = firstNonEmptyString(configuredProvider.taxId, config.providerTaxId);

    if (organizationName) provider.organizationName = organizationName;
    if (providerNpi) provider.npi = providerNpi;
    if (!organizationName && firstName && lastName) {
      provider.firstName = firstName;
      provider.lastName = lastName;
    }
    if (taxId) provider.taxId = taxId;

    return provider;
  }

  private buildStediEligibilityBody(request: EligibilityRequest): Record<string, any> {
    const config = this.config?.config || {};
    const serviceType = request.serviceType || config.defaultServiceType || '30';
    const serviceDate = formatStediDate(request.serviceDate);

    const body: Record<string, any> = {
      externalPatientId: request.patientId.substring(0, 36),
      tradingPartnerServiceId: request.payerId,
      provider: this.getStediProvider(),
      subscriber: {
        memberId: request.memberId,
        firstName: request.patientFirstName,
        lastName: request.patientLastName,
        dateOfBirth: formatStediDate(request.patientDob),
      },
      encounter: {
        serviceTypeCodes: Array.isArray(serviceType) ? serviceType : [String(serviceType)],
      },
    };

    const tradingPartnerName = firstNonEmptyString(config.tradingPartnerName, config.payerName);
    if (tradingPartnerName) {
      body.tradingPartnerName = tradingPartnerName;
    }

    if (serviceDate) {
      body.encounter.dateOfService = serviceDate;
    }

    return body;
  }

  private buildStediConnectionTestBody(): Record<string, any> {
    const configured = this.config?.config?.testRequest;
    if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
      return configured;
    }

    return {
      encounter: {
        serviceTypeCodes: ['30'],
      },
      externalPatientId: 'STEDI-TEST-PATIENT',
      provider: {
        npi: '1999999984',
        organizationName: 'Provider Name',
      },
      subscriber: {
        firstName: 'John',
        lastName: 'Doe',
        memberId: 'AETNA9wcSu',
      },
      dependents: [
        {
          firstName: 'Jordan',
          lastName: 'Doe',
          dateOfBirth: '20010714',
        },
      ],
      tradingPartnerServiceId: '60054',
    };
  }

  private isStediTestMode(): boolean {
    const mode = String(
      this.config?.config?.environment ||
      this.config?.config?.mode ||
      ''
    ).trim().toLowerCase();

    return mode === 'test' || mode === 'sandbox';
  }

  private async testStediConnection(): Promise<void> {
    if (!this.isStediTestMode()) {
      this.getStediApiKey();
      return;
    }

    await this.postStediEligibility(this.buildStediConnectionTestBody());
  }

  private async requestStediEligibility(request: EligibilityRequest): Promise<any> {
    const useApprovedMockRequest = this.isStediTestMode() &&
      this.config?.config?.useApprovedMockRequestForEligibility !== false;
    const body = useApprovedMockRequest
      ? this.buildStediConnectionTestBody()
      : this.buildStediEligibilityBody(request);

    return this.postStediEligibility(body);
  }

  private async postStediEligibility(body: Record<string, any>): Promise<any> {
    const endpoint = `${this.getBaseUrl()}${this.getStediEligibilityPath()}`;
    const apiKey = this.getStediApiKey();
    const authorization = /^(key|bearer)\s+/i.test(apiKey) ? apiKey : `Key ${apiKey}`;
    const headers: Record<string, string> = {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.config?.config?.sendStediTestHeader === true) {
      headers['stedi-test'] = 'true';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stedi eligibility request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  private async fetchAvailityAccessToken(): Promise<string> {
    const credentials = this.getCredentials();
    const clientId = credentials.clientId || credentials.client_id || credentials.apiKey || credentials.api_key;
    const clientSecret = credentials.clientSecret || credentials.client_secret || credentials.apiSecret || credentials.api_secret;

    if (!clientId || !clientSecret) {
      throw new Error('Missing Availity client credentials');
    }

    const endpoint = `${this.getBaseUrl()}${this.getTokenPath()}`;
    const authMethod = this.getTokenAuthMethod();
    const scope = this.getScopes();
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
    });
    if (scope) {
      body.set('scope', scope);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    if (authMethod === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Availity auth failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json() as { access_token?: string };
    if (!payload.access_token) {
      throw new Error('Availity auth response did not include an access token');
    }

    return payload.access_token;
  }

  private buildAvailityCoverageBody(request: EligibilityRequest): URLSearchParams {
    const config = this.config?.config || {};
    const serviceDate = request.serviceDate || new Date().toISOString().split('T')[0]!;
    const providerNpi = request.providerNpi || config.providerNpi;
    const providerFirstName = config.providerFirstName;
    const providerLastName = config.providerLastName;
    const providerType = config.providerType;
    const patientGender = config.patientGender;
    const patientState = config.patientState;
    const requestedSearchOption =
      config.requestedPatientSearchOption ||
      (patientState ? 'memberId,patientBirthDate,patientState' : 'memberId,patientBirthDate');
    const serviceType = request.serviceType || config.defaultServiceType || '30';

    const body = new URLSearchParams();
    body.set('payerId', request.payerId);
    body.set('memberId', request.memberId);
    body.set('patientBirthDate', request.patientDob);
    body.set('patientLastName', request.patientLastName);
    body.set('patientFirstName', request.patientFirstName);
    body.set('asOfDate', serviceDate);
    body.append('serviceType[]', serviceType);
    body.set('subscriberRelationship', '18');
    body.set('requestedPatientSearchOption', requestedSearchOption);

    if (providerNpi) body.set('providerNpi', providerNpi);
    if (providerFirstName) body.set('providerFirstName', providerFirstName);
    if (providerLastName) body.set('providerLastName', providerLastName);
    if (providerType) body.set('providerType', providerType);
    if (patientGender) body.set('patientGender', patientGender);
    if (patientState) body.set('patientState', patientState);

    return body;
  }

  private async requestAvailityCoverage(
    token: string,
    request: EligibilityRequest,
    requestId: string
  ): Promise<any> {
    const endpoint = `${this.getBaseUrl()}${this.getCoveragesPath()}`;
    const body = this.buildAvailityCoverageBody(request);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Availity eligibility request failed: ${response.status} ${errorText}`);
    }

    let payload: any = await response.json();
    const coverage = this.extractCoverageRecord(payload);
    const statusCode = firstNonEmptyString(coverage?.statusCode, payload?.statusCode);
    const status = firstNonEmptyString(coverage?.status, payload?.status);

    if (statusCode === '0' || status?.toLowerCase() === 'in progress') {
      const pollId = firstNonEmptyString(coverage?.id, payload?.id);
      const selfHref = firstNonEmptyString(coverage?.links?.self?.href, payload?.links?.self?.href);

      if (pollId || selfHref) {
        payload = await this.pollAvailityCoverage(token, pollId, selfHref, requestId);
      }
    }

    return payload;
  }

  private async pollAvailityCoverage(
    token: string,
    coverageId?: string,
    selfHref?: string,
    requestId?: string
  ): Promise<any> {
    const attempts = Number(this.config?.config?.pollAttempts || 5);
    const delayMs = Number(this.config?.config?.pollDelayMs || 1500);
    const fallbackEndpoint = coverageId
      ? `${this.getBaseUrl()}${this.getCoveragesPath()}/${coverageId}`
      : null;
    const endpoint = selfHref || fallbackEndpoint;

    if (!endpoint) {
      throw new Error('Availity returned an in-progress response without a coverage ID');
    }

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.sleep(delayMs);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Availity eligibility poll failed: ${response.status} ${errorText}`);
      }

      const payload: any = await response.json();
      const coverage = this.extractCoverageRecord(payload);
      const statusCode = firstNonEmptyString(coverage?.statusCode, payload?.statusCode);
      const status = firstNonEmptyString(coverage?.status, payload?.status);

      if (statusCode !== '0' && status?.toLowerCase() !== 'in progress') {
        return payload;
      }

      logger.info('Availity eligibility still in progress', {
        requestId,
        attempt: attempt + 1,
        attempts,
        coverageId,
      });
    }

    throw new Error('Availity eligibility response remained in progress after polling');
  }

  private extractCoverageRecord(rawResponse: any): any {
    if (Array.isArray(rawResponse?.coverages) && rawResponse.coverages.length > 0) {
      return rawResponse.coverages[0];
    }
    if (Array.isArray(rawResponse?.data) && rawResponse.data.length > 0) {
      return rawResponse.data[0];
    }
    return rawResponse;
  }

  private parseAvailityCoverageResponse(
    rawResponse: any,
    request: EligibilityRequest,
    requestId: string
  ): EligibilityResponse {
    const coverage = this.extractCoverageRecord(rawResponse);
    const amountUnit = this.getAmountUnit();
    const coverageStatus = findCoverageStatus(coverage);

    const payerId = firstNonEmptyString(coverage?.payer?.payerId, coverage?.payer?.responsePayerId, request.payerId) || request.payerId;
    const payerName = firstNonEmptyString(coverage?.payer?.name, coverage?.payer?.responseName, rawResponse?.payer?.name, 'Unknown Payer') || 'Unknown Payer';

    const memberId = firstNonEmptyString(
      coverage?.subscriber?.memberId,
      coverage?.patient?.memberId,
      request.memberId
    ) || request.memberId;

    const plan = Array.isArray(coverage?.plans) && coverage.plans.length > 0 ? coverage.plans[0] : null;

    const benefitsSource = {
      coverage,
      plan,
      rawResponse,
    };

    const priorAuthRequired = findBooleanByPatterns(benefitsSource, [
      /prior.*auth/i,
      /pre[-_ ]?auth/i,
      /authorization.*required/i,
    ]) || false;

    const referralRequired = findBooleanByPatterns(benefitsSource, [
      /referral.*required/i,
      /requires?.*referral/i,
    ]) || false;

    const validationMessages = Array.isArray(coverage?.validationMessages)
      ? coverage.validationMessages
      : Array.isArray(rawResponse?.validationMessages)
        ? rawResponse.validationMessages
        : [];

    const messages = validationMessages
      .filter((item: any) => item && item.errorMessage)
      .map((item: any) => ({
        type: item.field ? 'warning' as const : 'info' as const,
        message: String(item.errorMessage),
      }));

    return {
      success: coverageStatus !== 'unknown',
      requestId,
      status: coverageStatus === 'unknown' && messages.length > 0 ? 'error' : coverageStatus,
      payer: {
        payerId,
        payerName,
      },
      patient: {
        memberId,
        firstName: firstNonEmptyString(coverage?.patient?.firstName, request.patientFirstName) || request.patientFirstName,
        lastName: firstNonEmptyString(coverage?.patient?.lastName, request.patientLastName) || request.patientLastName,
        dob: normalizeDate(coverage?.patient?.birthDate) || request.patientDob,
        groupNumber: firstNonEmptyString(
          plan?.groupNumber,
          coverage?.subscriber?.caseNumber,
          coverage?.patient?.familyUnitNumber
        ),
      },
      subscriber: {
        firstName: firstNonEmptyString(coverage?.subscriber?.firstName, coverage?.patient?.firstName, request.patientFirstName) || request.patientFirstName,
        lastName: firstNonEmptyString(coverage?.subscriber?.lastName, coverage?.patient?.lastName, request.patientLastName) || request.patientLastName,
        dob: normalizeDate(coverage?.subscriber?.birthDate) || request.patientDob,
        relationship: firstNonEmptyString(
          coverage?.patient?.subscriberRelationship,
          coverage?.patient?.subscriberRelationshipCode,
          'self'
        ) || 'self',
      },
      coverage: {
        status: coverageStatus,
        effectiveDate: normalizeDate(plan?.effectiveDate || coverage?.effectiveDate),
        terminationDate: normalizeDate(plan?.terminationDate || coverage?.terminationDate),
        planName: firstNonEmptyString(plan?.groupName, plan?.name, coverage?.payer?.name),
        planType: firstNonEmptyString(plan?.type, plan?.category),
        coverageLevel: firstNonEmptyString(plan?.coverageLevel, coverage?.coverageLevel),
        coordinationOfBenefits: firstNonEmptyString(coverage?.coordinationOfBenefits, coverage?.cob),
      },
      benefits: {
        copays: {
          specialist: findMoneyByPatterns(benefitsSource, [/special.*copay/i, /copay.*special/i], amountUnit),
          primaryCare: findMoneyByPatterns(benefitsSource, [/primary.*care.*copay/i, /pcp.*copay/i], amountUnit),
          emergency: findMoneyByPatterns(benefitsSource, [/emergency.*copay/i, /er.*copay/i], amountUnit),
          urgentCare: findMoneyByPatterns(benefitsSource, [/urgent.*care.*copay/i], amountUnit),
        },
        deductible: {
          individual: {
            total: findMoneyByPatterns(benefitsSource, [/deductible.*total/i], amountUnit) || 0,
            met: findMoneyByPatterns(benefitsSource, [/deductible.*met/i], amountUnit) || 0,
            remaining: findMoneyByPatterns(benefitsSource, [/deductible.*remaining/i], amountUnit) || 0,
          },
        },
        coinsurance: (() => {
          const percentage = normalizeMoney(findStringByPatterns(benefitsSource, [/coinsurance/i]), 'cents');
          if (percentage === undefined) return undefined;
          return { percentage: percentage > 100 ? Math.round(percentage / 100) : percentage };
        })(),
        outOfPocketMax: {
          individual: {
            total: findMoneyByPatterns(benefitsSource, [/out.*of.*pocket.*total/i, /oop.*max/i], amountUnit) || 0,
            met: findMoneyByPatterns(benefitsSource, [/out.*of.*pocket.*met/i], amountUnit) || 0,
            remaining: findMoneyByPatterns(benefitsSource, [/out.*of.*pocket.*remaining/i], amountUnit) || 0,
          },
        },
        priorAuth: {
          required: priorAuthRequired,
          phone: findStringByPatterns(benefitsSource, [/prior.*auth.*phone/i, /authorization.*phone/i]),
        },
        referral: {
          required: referralRequired,
          phone: findStringByPatterns(benefitsSource, [/referral.*phone/i]),
        },
      },
      network: {
        inNetwork: findBooleanByPatterns(benefitsSource, [/in.*network/i]) ?? true,
        networkName: firstNonEmptyString(plan?.networkName, coverage?.networkName),
      },
      messages,
      rawResponse,
    };
  }

  private parseStediEligibilityResponse(
    rawResponse: any,
    request: EligibilityRequest,
    requestId: string
  ): EligibilityResponse {
    const benefits = Array.isArray(rawResponse?.benefitsInformation)
      ? rawResponse.benefitsInformation
      : [];
    const errors = [
      ...(Array.isArray(rawResponse?.errors) ? rawResponse.errors : []),
      ...(Array.isArray(rawResponse?.payer?.aaaErrors) ? rawResponse.payer.aaaErrors : []),
      ...(Array.isArray(rawResponse?.subscriber?.aaaErrors) ? rawResponse.subscriber.aaaErrors : []),
    ];
    const warnings = Array.isArray(rawResponse?.warnings) ? rawResponse.warnings : [];

    const hasActiveCoverage = benefits.some((benefit: any) =>
      String(benefit?.code || '').trim() === '1' ||
      String(benefit?.name || '').toLowerCase().includes('active coverage')
    );
    const hasInactiveCoverage = benefits.some((benefit: any) =>
      String(benefit?.code || '').trim() === '6' ||
      String(benefit?.name || '').toLowerCase().includes('inactive')
    );
    const coverageStatus: 'active' | 'inactive' | 'unknown' | 'error' = errors.length > 0
      ? 'error'
      : hasActiveCoverage
        ? 'active'
        : hasInactiveCoverage
          ? 'inactive'
          : 'unknown';

    const subscriber = rawResponse?.subscriber || {};
    const mapTestResponseToRequestedPatient = this.isStediTestMode() &&
      this.config?.config?.mapTestResponseToRequestedPatient !== false;
    const planInfo = rawResponse?.planInformation || {};
    const planDates = rawResponse?.planDateInformation || {};
    const activeBenefit = benefits.find((benefit: any) =>
      String(benefit?.code || '').trim() === '1' ||
      String(benefit?.name || '').toLowerCase().includes('active coverage')
    );

    const individualInNetworkDeductible = this.findStediBenefit(benefits, {
      code: 'C',
      coverageLevelCode: 'IND',
      inPlanNetworkIndicatorCode: 'Y',
    }) || this.findStediBenefit(benefits, { code: 'C', coverageLevelCode: 'IND' });
    const familyInNetworkDeductible = this.findStediBenefit(benefits, {
      code: 'C',
      coverageLevelCode: 'FAM',
      inPlanNetworkIndicatorCode: 'Y',
    }) || this.findStediBenefit(benefits, { code: 'C', coverageLevelCode: 'FAM' });
    const individualInNetworkOop = this.findStediBenefit(benefits, {
      code: 'G',
      coverageLevelCode: 'IND',
      inPlanNetworkIndicatorCode: 'Y',
    }) || this.findStediBenefit(benefits, { code: 'G', coverageLevelCode: 'IND' });
    const familyInNetworkOop = this.findStediBenefit(benefits, {
      code: 'G',
      coverageLevelCode: 'FAM',
      inPlanNetworkIndicatorCode: 'Y',
    }) || this.findStediBenefit(benefits, { code: 'G', coverageLevelCode: 'FAM' });
    const copay = this.findStediCopay(benefits);
    const coinsurance = this.findStediBenefit(benefits, {
      code: 'A',
      coverageLevelCode: 'IND',
      inPlanNetworkIndicatorCode: 'Y',
    }) || this.findStediBenefit(benefits, { code: 'A', coverageLevelCode: 'IND' });

    const priorAuthBenefits = benefits.filter((benefit: any) =>
      String(benefit?.authOrCertIndicator || '').trim().toUpperCase() === 'Y'
    );

    const messages = [
      ...errors.map((item: any) => ({
        type: 'error' as const,
        message: firstNonEmptyString(item?.message, item?.description, item?.followupAction, item?.code) || 'Stedi eligibility error',
      })),
      ...warnings.map((item: any) => ({
        type: 'warning' as const,
        message: firstNonEmptyString(item?.message, item?.description, item?.code) || 'Stedi eligibility warning',
      })),
    ];

    return {
      success: coverageStatus !== 'error' && coverageStatus !== 'unknown',
      requestId: rawResponse?.id || requestId,
      status: coverageStatus,
      payer: {
        payerId: firstNonEmptyString(rawResponse?.tradingPartnerServiceId, request.payerId) || request.payerId,
        payerName: firstNonEmptyString(rawResponse?.payer?.name, rawResponse?.payer?.payorIdentification, request.payerId) || request.payerId,
      },
      patient: {
        memberId: mapTestResponseToRequestedPatient
          ? request.memberId
          : firstNonEmptyString(subscriber.memberId, planInfo.memberId, request.memberId) || request.memberId,
        firstName: mapTestResponseToRequestedPatient
          ? request.patientFirstName
          : firstNonEmptyString(subscriber.firstName, request.patientFirstName) || request.patientFirstName,
        lastName: mapTestResponseToRequestedPatient
          ? request.patientLastName
          : firstNonEmptyString(subscriber.lastName, request.patientLastName) || request.patientLastName,
        dob: mapTestResponseToRequestedPatient
          ? request.patientDob
          : normalizeDate(subscriber.dateOfBirth) || request.patientDob,
        groupNumber: firstNonEmptyString(subscriber.groupNumber, planInfo.groupNumber, planInfo.policyNumber),
      },
      subscriber: {
        firstName: mapTestResponseToRequestedPatient
          ? request.patientFirstName
          : firstNonEmptyString(subscriber.firstName, request.patientFirstName) || request.patientFirstName,
        lastName: mapTestResponseToRequestedPatient
          ? request.patientLastName
          : firstNonEmptyString(subscriber.lastName, request.patientLastName) || request.patientLastName,
        dob: mapTestResponseToRequestedPatient
          ? request.patientDob
          : normalizeDate(subscriber.dateOfBirth) || request.patientDob,
        relationship: firstNonEmptyString(subscriber.relationToSubscriber, subscriber.relationToSubscriberCode, 'self') || 'self',
      },
      coverage: {
        status: coverageStatus === 'error' ? 'unknown' : coverageStatus,
        effectiveDate: normalizeDate(planDates.planBegin || planDates.eligibilityBegin || planDates.policyEffective || planDates.plan),
        terminationDate: normalizeDate(planDates.planEnd || planDates.eligibilityEnd || planDates.policyExpiration),
        planName: firstNonEmptyString(
          activeBenefit?.planCoverage,
          subscriber.planDescription,
          planInfo.planDescription,
          planInfo.groupDescription,
          planInfo.planNetworkIdDescription
        ),
        planType: firstNonEmptyString(activeBenefit?.insuranceType, activeBenefit?.insuranceTypeCode),
        coverageLevel: firstNonEmptyString(activeBenefit?.coverageLevel, activeBenefit?.coverageLevelCode),
      },
      benefits: {
        copays: {
          specialist: this.normalizeStediBenefitAmount(copay),
        },
        deductible: {
          individual: this.buildStediMoneySummary(individualInNetworkDeductible),
          family: this.buildStediMoneySummary(familyInNetworkDeductible),
        },
        coinsurance: this.buildStediCoinsurance(coinsurance),
        outOfPocketMax: {
          individual: this.buildStediMoneySummary(individualInNetworkOop),
          family: this.buildStediMoneySummary(familyInNetworkOop),
        },
        priorAuth: {
          required: priorAuthBenefits.length > 0,
          services: priorAuthBenefits.flatMap((benefit: any) =>
            Array.isArray(benefit?.serviceTypes) ? benefit.serviceTypes.map(String) : []
          ),
        },
        referral: {
          required: benefits.some((benefit: any) =>
            this.stediBenefitAdditionalText(benefit).toLowerCase().includes('referral')
          ),
        },
      },
      network: {
        inNetwork: benefits.some((benefit: any) => String(benefit?.inPlanNetworkIndicatorCode || '').toUpperCase() === 'Y') ||
          !benefits.some((benefit: any) => String(benefit?.inPlanNetworkIndicatorCode || '').toUpperCase() === 'N'),
        networkName: firstNonEmptyString(subscriber.planNetworkDescription, planInfo.planNetworkIdDescription),
      },
      messages,
      rawResponse,
    };
  }

  private findStediBenefit(
    benefits: any[],
    filters: {
      code?: string;
      coverageLevelCode?: string;
      inPlanNetworkIndicatorCode?: string;
    }
  ): any | undefined {
    return benefits.find((benefit: any) => {
      if (filters.code && String(benefit?.code || '').trim() !== filters.code) return false;
      if (filters.coverageLevelCode && String(benefit?.coverageLevelCode || '').trim() !== filters.coverageLevelCode) return false;
      if (filters.inPlanNetworkIndicatorCode && String(benefit?.inPlanNetworkIndicatorCode || '').trim() !== filters.inPlanNetworkIndicatorCode) return false;
      return true;
    });
  }

  private findStediCopay(benefits: any[]): any | undefined {
    const inNetworkCopays = benefits.filter((benefit: any) =>
      String(benefit?.code || '').trim() === 'B' &&
      String(benefit?.inPlanNetworkIndicatorCode || '').trim() !== 'N'
    );

    return inNetworkCopays.find((benefit: any) => {
      const haystack = [
        benefit?.name,
        ...(Array.isArray(benefit?.serviceTypes) ? benefit.serviceTypes : []),
        this.stediBenefitAdditionalText(benefit),
      ].join(' ').toLowerCase();

      return haystack.includes('specialist') ||
        haystack.includes('physician') ||
        haystack.includes('office') ||
        haystack.includes('professional');
    }) || inNetworkCopays[0];
  }

  private stediBenefitAdditionalText(benefit: any): string {
    const additional = [
      ...(Array.isArray(benefit?.additionalInformation) ? benefit.additionalInformation : []),
      ...(Array.isArray(benefit?.eligibilityAdditionalInformationList) ? benefit.eligibilityAdditionalInformationList : []),
    ];

    return additional
      .map((item: any) => firstNonEmptyString(item?.description, item?.industry, item?.industryCode))
      .filter(Boolean)
      .join(' ');
  }

  private normalizeStediBenefitAmount(benefit: any): number | undefined {
    return normalizeMoney(benefit?.benefitAmount, 'dollars');
  }

  private buildStediMoneySummary(benefit: any): { total: number; met: number; remaining: number } | undefined {
    const total = this.normalizeStediBenefitAmount(benefit);
    if (total === undefined) return undefined;
    return {
      total,
      met: 0,
      remaining: total,
    };
  }

  private buildStediCoinsurance(benefit: any): { percentage: number } | undefined {
    const percent = Number.parseFloat(String(benefit?.benefitPercent || '').trim());
    if (!Number.isFinite(percent)) return undefined;
    return {
      percentage: percent <= 1 ? Math.round(percent * 100) : Math.round(percent),
    };
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
