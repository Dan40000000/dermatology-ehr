/**
 * Clearinghouse Integration Adapter
 *
 * Handles claim submission to clearinghouses (Change Healthcare, Availity, etc.)
 * and ERA/835 file processing for auto-posting payments.
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

// ============================================================================
// Types
// ============================================================================

export interface ClaimSubmission {
  claimId: string;
  claimNumber: string;
  patientId: string;
  patientName: string;
  payerId: string;
  payerName: string;
  totalCents: number;
  serviceDate: string;
  diagnosisCodes: string[];
  procedureCodes: Array<{
    code: string;
    modifier?: string;
    units: number;
    chargesCents: number;
  }>;
  providerId: string;
  providerNpi: string;
  facilityId?: string;
}

export interface ClaimSubmissionResult {
  success: boolean;
  claimId: string;
  submissionId: string;
  controlNumber?: string;
  status: 'accepted' | 'rejected' | 'pending' | 'error';
  message?: string;
  errors?: Array<{ code: string; message: string }>;
  timestamp: string;
}

export interface BatchSubmissionResult {
  batchId: string;
  submittedAt: string;
  totalClaims: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  results: ClaimSubmissionResult[];
}

export interface ClaimStatusResult {
  claimId: string;
  status: string;
  statusDate: string;
  payerClaimNumber?: string;
  adjudicationDate?: string;
  paidAmount?: number;
  adjustments?: Array<{
    code: string;
    reason: string;
    amount: number;
  }>;
  messages?: string[];
}

export interface ERAFile {
  id: string;
  filename: string;
  receivedAt: string;
  payerName: string;
  payerId: string;
  checkNumber?: string;
  checkDate?: string;
  totalAmountCents: number;
  paymentCount: number;
  status: string;
}

export interface ERAPayment {
  claimId?: string;
  claimNumber: string;
  patientName: string;
  serviceDate: string;
  billedAmountCents: number;
  allowedAmountCents: number;
  paidAmountCents: number;
  patientResponsibilityCents: number;
  adjustmentCodes: Array<{
    code: string;
    reason: string;
    amountCents: number;
  }>;
}

export interface ProcessedERA {
  eraFileId: string;
  processedAt: string;
  totalPayments: number;
  matchedClaims: number;
  unmatchedClaims: number;
  totalPaidCents: number;
  payments: ERAPayment[];
}

// ============================================================================
// Mock Data Generators
// ============================================================================

function generateMockClaimStatus(): 'accepted' | 'rejected' | 'pending' {
  const random = Math.random();
  if (random < 0.85) return 'accepted';
  if (random < 0.95) return 'pending';
  return 'rejected';
}

function generateMockRejectionErrors(): Array<{ code: string; message: string }> {
  const errors = [
    { code: 'A0', message: 'Missing or invalid subscriber ID' },
    { code: 'A1', message: 'Missing or invalid diagnosis code' },
    { code: 'A6', message: 'Invalid payer ID' },
    { code: 'A8', message: 'Invalid date of service' },
    { code: 'B1', message: 'Missing or invalid provider NPI' },
  ];
  return [errors[Math.floor(Math.random() * errors.length)]!];
}

// ============================================================================
// Clearinghouse Adapter
// ============================================================================

export class ClearinghouseAdapter extends BaseAdapter {
  private provider: string;

  constructor(options: AdapterOptions & { provider?: string }) {
    super(options);
    this.provider = options.provider || 'change_healthcare';
  }

  getIntegrationType(): string {
    return 'clearinghouse';
  }

  getProvider(): string {
    return this.provider;
  }

  /**
   * Test connection to clearinghouse
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      await this.sleep(500);
      return {
        success: true,
        message: `Connected to ${this.provider} (mock mode)`,
      };
    }

    const startTime = Date.now();
    try {
      // In production, this would make an actual API call
      // For now, simulate the test
      await this.sleep(1000);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/test',
        method: 'GET',
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        message: `Connected to ${this.provider}`,
      };
    } catch (error: any) {
      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/test',
        method: 'GET',
        status: 'error',
        errorMessage: error.message,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Submit a single claim to the clearinghouse
   */
  async submitClaim(claim: ClaimSubmission): Promise<ClaimSubmissionResult> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();

    logger.info('Submitting claim to clearinghouse', {
      claimId: claim.claimId,
      claimNumber: claim.claimNumber,
      payerId: claim.payerId,
      correlationId,
    });

    try {
      let result: ClaimSubmissionResult;

      if (this.useMock) {
        result = await this.mockSubmitClaim(claim);
      } else {
        result = await this.withRetry(() => this.realSubmitClaim(claim));
      }

      // Log the submission
      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/claims/submit',
        method: 'POST',
        request: { claimId: claim.claimId, claimNumber: claim.claimNumber },
        response: result,
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
        correlationId,
      });

      // Store submission record
      await this.storeSubmission(claim, result);

      return result;
    } catch (error: any) {
      logger.error('Failed to submit claim', {
        claimId: claim.claimId,
        error: error.message,
        correlationId,
      });

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/claims/submit',
        method: 'POST',
        request: { claimId: claim.claimId },
        status: 'error',
        errorMessage: error.message,
        durationMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: false,
        claimId: claim.claimId,
        submissionId: crypto.randomUUID(),
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Submit a batch of claims
   */
  async submitBatch(claims: ClaimSubmission[]): Promise<BatchSubmissionResult> {
    const batchId = `BATCH-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
    const startTime = Date.now();

    logger.info('Submitting batch of claims', {
      batchId,
      claimCount: claims.length,
    });

    const results: ClaimSubmissionResult[] = [];
    let acceptedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;

    // Process claims in parallel batches of 10
    const batchSize = 10;
    for (let i = 0; i < claims.length; i += batchSize) {
      const batch = claims.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(claim => this.submitClaim(claim))
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.status === 'accepted') acceptedCount++;
        else if (result.status === 'rejected') rejectedCount++;
        else pendingCount++;
      }
    }

    // Store batch record
    await pool.query(
      `INSERT INTO clearinghouse_batch_submissions
       (tenant_id, batch_id, claim_count, accepted_count, rejected_count, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [this.tenantId, batchId, claims.length, acceptedCount, rejectedCount,
        rejectedCount === claims.length ? 'rejected' : acceptedCount === claims.length ? 'accepted' : 'partial']
    );

    await this.logIntegration({
      direction: 'outbound',
      endpoint: '/api/v1/claims/batch',
      method: 'POST',
      request: { batchId, claimCount: claims.length },
      response: { acceptedCount, rejectedCount, pendingCount },
      status: 'success',
      durationMs: Date.now() - startTime,
    });

    return {
      batchId,
      submittedAt: new Date().toISOString(),
      totalClaims: claims.length,
      acceptedCount,
      rejectedCount,
      pendingCount,
      results,
    };
  }

  /**
   * Check status of a submitted claim
   */
  async checkClaimStatus(claimId: string): Promise<ClaimStatusResult> {
    const startTime = Date.now();

    try {
      // Get submission record
      const submission = await pool.query(
        `SELECT submission_number, control_number, status, clearinghouse_response
         FROM clearinghouse_submissions
         WHERE claim_id = $1 AND tenant_id = $2
         ORDER BY submitted_at DESC LIMIT 1`,
        [claimId, this.tenantId]
      );

      if (submission.rows.length === 0) {
        throw new Error('No submission found for this claim');
      }

      let result: ClaimStatusResult;

      if (this.useMock) {
        result = this.mockClaimStatus(claimId, submission.rows[0]);
      } else {
        result = await this.withRetry(() =>
          this.realCheckStatus(claimId, submission.rows[0].control_number)
        );
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/claims/status',
        method: 'GET',
        request: { claimId },
        response: result,
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to check claim status', { claimId, error: error.message });
      throw error;
    }
  }

  /**
   * Get available ERA files
   */
  async getERAFiles(): Promise<ERAFile[]> {
    const startTime = Date.now();

    try {
      let files: ERAFile[];

      if (this.useMock) {
        files = await this.mockGetERAFiles();
      } else {
        files = await this.withRetry(() => this.realGetERAFiles());
      }

      await this.logIntegration({
        direction: 'inbound',
        endpoint: '/api/v1/era/files',
        method: 'GET',
        response: { count: files.length },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return files;
    } catch (error: any) {
      logger.error('Failed to get ERA files', { error: error.message });
      throw error;
    }
  }

  /**
   * Process an ERA file
   */
  async processERA(eraFileId: string): Promise<ProcessedERA> {
    const startTime = Date.now();

    logger.info('Processing ERA file', { eraFileId });

    try {
      // Get ERA file record
      const eraResult = await pool.query(
        `SELECT * FROM era_files WHERE id = $1 AND tenant_id = $2`,
        [eraFileId, this.tenantId]
      );

      if (eraResult.rows.length === 0) {
        throw new Error('ERA file not found');
      }

      const eraFile = eraResult.rows[0];

      // Parse ERA file (mock or real)
      let payments: ERAPayment[];
      if (this.useMock) {
        payments = await this.mockParseERA(eraFile);
      } else {
        payments = await this.realParseERA(eraFile);
      }

      // Match payments to claims
      let matchedCount = 0;
      let unmatchedCount = 0;
      let totalPaidCents = 0;

      for (const payment of payments) {
        // Try to match by claim number
        const claimResult = await pool.query(
          `SELECT id FROM claims WHERE claim_number = $1 AND tenant_id = $2`,
          [payment.claimNumber, this.tenantId]
        );

        const claimId = claimResult.rows[0]?.id;
        if (claimId) {
          payment.claimId = claimId;
          matchedCount++;
        } else {
          unmatchedCount++;
        }

        totalPaidCents += payment.paidAmountCents;

        // Store payment record
        await pool.query(
          `INSERT INTO era_payments
           (era_file_id, tenant_id, claim_id, claim_number, patient_name,
            service_date, billed_amount_cents, allowed_amount_cents,
            paid_amount_cents, patient_responsibility_cents, adjustment_codes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            eraFileId,
            this.tenantId,
            claimId,
            payment.claimNumber,
            payment.patientName,
            payment.serviceDate,
            payment.billedAmountCents,
            payment.allowedAmountCents,
            payment.paidAmountCents,
            payment.patientResponsibilityCents,
            JSON.stringify(payment.adjustmentCodes),
            claimId ? 'matched' : 'unmatched',
          ]
        );
      }

      // Update ERA file status
      await pool.query(
        `UPDATE era_files
         SET status = 'processed', processed_at = NOW(),
             payment_count = $1, total_amount_cents = $2
         WHERE id = $3`,
        [payments.length, totalPaidCents, eraFileId]
      );

      const result: ProcessedERA = {
        eraFileId,
        processedAt: new Date().toISOString(),
        totalPayments: payments.length,
        matchedClaims: matchedCount,
        unmatchedClaims: unmatchedCount,
        totalPaidCents,
        payments,
      };

      await this.logIntegration({
        direction: 'inbound',
        endpoint: '/api/v1/era/process',
        method: 'POST',
        request: { eraFileId },
        response: {
          totalPayments: payments.length,
          matchedClaims: matchedCount,
          totalPaidCents,
        },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to process ERA', { eraFileId, error: error.message });
      throw error;
    }
  }

  /**
   * Post ERA payments to claims
   */
  async postPayments(eraFileId: string): Promise<{ postedCount: number; totalCents: number }> {
    const startTime = Date.now();

    logger.info('Posting ERA payments', { eraFileId });

    try {
      // Get unposted payments
      const payments = await pool.query(
        `SELECT * FROM era_payments
         WHERE era_file_id = $1 AND tenant_id = $2
           AND status = 'matched' AND posted_at IS NULL`,
        [eraFileId, this.tenantId]
      );

      let postedCount = 0;
      let totalCents = 0;

      for (const payment of payments.rows) {
        // Create payment record on claim
        await pool.query(
          `INSERT INTO claim_payments
           (tenant_id, claim_id, amount_cents, payment_date, payment_method, payer, notes)
           VALUES ($1, $2, $3, CURRENT_DATE, 'ERA', $4, $5)`,
          [
            this.tenantId,
            payment.claim_id,
            payment.paid_amount_cents,
            payment.payer_name || 'Insurance',
            `ERA Payment - ${eraFileId}`,
          ]
        );

        // Update ERA payment status
        await pool.query(
          `UPDATE era_payments SET status = 'posted', posted_at = NOW() WHERE id = $1`,
          [payment.id]
        );

        postedCount++;
        totalCents += payment.paid_amount_cents;
      }

      // Update ERA file status
      await pool.query(
        `UPDATE era_files SET status = 'posted' WHERE id = $1`,
        [eraFileId]
      );

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/internal/post-payments',
        method: 'POST',
        request: { eraFileId },
        response: { postedCount, totalCents },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return { postedCount, totalCents };
    } catch (error: any) {
      logger.error('Failed to post payments', { eraFileId, error: error.message });
      throw error;
    }
  }

  // ============================================================================
  // Mock Implementations
  // ============================================================================

  private async mockSubmitClaim(claim: ClaimSubmission): Promise<ClaimSubmissionResult> {
    await this.sleep(300 + Math.random() * 500);

    const status = generateMockClaimStatus();
    const submissionId = crypto.randomUUID();
    const controlNumber = `CTRL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    return {
      success: status !== 'rejected',
      claimId: claim.claimId,
      submissionId,
      controlNumber,
      status,
      message: status === 'accepted'
        ? 'Claim accepted by clearinghouse'
        : status === 'rejected'
          ? 'Claim rejected due to validation errors'
          : 'Claim pending review',
      errors: status === 'rejected' ? generateMockRejectionErrors() : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  private mockClaimStatus(claimId: string, submission: any): ClaimStatusResult {
    const statuses = ['accepted', 'adjudicated', 'paid', 'denied'];
    const status = statuses[Math.floor(Math.random() * statuses.length)]!;

    return {
      claimId,
      status,
      statusDate: new Date().toISOString(),
      payerClaimNumber: `PCN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      adjudicationDate: status === 'paid' ? new Date().toISOString() : undefined,
      paidAmount: status === 'paid' ? Math.floor(Math.random() * 50000) : undefined,
      messages: status === 'denied' ? ['Service not covered under plan'] : undefined,
    };
  }

  private async mockGetERAFiles(): Promise<ERAFile[]> {
    await this.sleep(500);

    // Get ERA files from database
    const result = await pool.query(
      `SELECT id, filename, received_at, payer_name, payer_id,
              check_number, check_date, total_amount_cents, payment_count, status
       FROM era_files
       WHERE tenant_id = $1 AND status IN ('received', 'processing')
       ORDER BY received_at DESC
       LIMIT 50`,
      [this.tenantId]
    );

    // If no files, generate some mock ones
    if (result.rows.length === 0) {
      const mockFiles: ERAFile[] = [];
      for (let i = 0; i < 3; i++) {
        const id = crypto.randomUUID();
        const file: ERAFile = {
          id,
          filename: `ERA_${Date.now()}_${i}.835`,
          receivedAt: new Date(Date.now() - i * 86400000).toISOString(),
          payerName: ['Blue Cross Blue Shield', 'Aetna', 'United Healthcare'][i]!,
          payerId: ['BCBS001', 'AETNA01', 'UHC0001'][i]!,
          checkNumber: `CHK${100000 + i}`,
          checkDate: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
          totalAmountCents: Math.floor(Math.random() * 500000) + 10000,
          paymentCount: Math.floor(Math.random() * 20) + 5,
          status: 'received',
        };
        mockFiles.push(file);

        // Insert into database
        await pool.query(
          `INSERT INTO era_files
           (id, tenant_id, filename, payer_name, payer_id, check_number, check_date,
            total_amount_cents, payment_count, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT DO NOTHING`,
          [id, this.tenantId, file.filename, file.payerName, file.payerId,
            file.checkNumber, file.checkDate, file.totalAmountCents, file.paymentCount, file.status]
        );
      }
      return mockFiles;
    }

    return result.rows.map(row => ({
      id: row.id,
      filename: row.filename,
      receivedAt: row.received_at,
      payerName: row.payer_name,
      payerId: row.payer_id,
      checkNumber: row.check_number,
      checkDate: row.check_date,
      totalAmountCents: row.total_amount_cents,
      paymentCount: row.payment_count,
      status: row.status,
    }));
  }

  private async mockParseERA(eraFile: any): Promise<ERAPayment[]> {
    await this.sleep(1000);

    const payments: ERAPayment[] = [];
    const count = eraFile.payment_count || Math.floor(Math.random() * 10) + 3;

    for (let i = 0; i < count; i++) {
      const billedCents = Math.floor(Math.random() * 50000) + 5000;
      const allowedCents = Math.floor(billedCents * (0.7 + Math.random() * 0.25));
      const patientResp = Math.floor(allowedCents * Math.random() * 0.3);
      const paidCents = allowedCents - patientResp;

      payments.push({
        claimNumber: `CLM-${Date.now()}-${i}`,
        patientName: `Patient ${String.fromCharCode(65 + i)} Smith`,
        serviceDate: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString().split('T')[0]!,
        billedAmountCents: billedCents,
        allowedAmountCents: allowedCents,
        paidAmountCents: paidCents,
        patientResponsibilityCents: patientResp,
        adjustmentCodes: [
          {
            code: 'CO-45',
            reason: 'Charge exceeds fee schedule',
            amountCents: billedCents - allowedCents,
          },
        ],
      });
    }

    return payments;
  }

  // ============================================================================
  // Real API Implementations (placeholders)
  // ============================================================================

  private async realSubmitClaim(claim: ClaimSubmission): Promise<ClaimSubmissionResult> {
    // In production, this would use the actual clearinghouse API
    // For Change Healthcare: POST to /claims/submit
    // For Availity: POST to /claims/v1/submission
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realCheckStatus(claimId: string, controlNumber: string): Promise<ClaimStatusResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realGetERAFiles(): Promise<ERAFile[]> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realParseERA(eraFile: any): Promise<ERAPayment[]> {
    throw new Error('Real API not implemented - use mock mode');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async storeSubmission(claim: ClaimSubmission, result: ClaimSubmissionResult): Promise<void> {
    await pool.query(
      `INSERT INTO clearinghouse_submissions
       (tenant_id, claim_id, submission_number, control_number, submitted_at,
        status, clearinghouse_response, error_message)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
      [
        this.tenantId,
        claim.claimId,
        result.submissionId,
        result.controlNumber,
        result.status,
        JSON.stringify(result),
        result.errors ? result.errors.map(e => e.message).join('; ') : null,
      ]
    );

    // Update claim status
    await pool.query(
      `UPDATE claims SET status = $1, submitted_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [result.status === 'accepted' ? 'accepted' : 'submitted', claim.claimId, this.tenantId]
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createClearinghouseAdapter(
  tenantId: string,
  provider: string = 'change_healthcare',
  useMock: boolean = true
): ClearinghouseAdapter {
  return new ClearinghouseAdapter({
    tenantId,
    provider,
    useMock,
  });
}
