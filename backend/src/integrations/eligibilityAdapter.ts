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
  return match?.[1] || undefined;
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
      await this.fetchAvailityAccessToken();

      await this.logIntegration({
        direction: 'outbound',
        endpoint: `${this.getTokenPath()}`,
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
    return String(this.config?.config?.baseUrl || 'https://api.availity.com').replace(/\/+$/, '');
  }

  private getTokenPath(): string {
    return String(this.config?.config?.tokenPath || '/v1/token');
  }

  private getCoveragesPath(): string {
    return String(this.config?.config?.coveragesPath || '/v1/coverages');
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
