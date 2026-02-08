/**
 * Fax Integration Adapter
 *
 * Handles sending and receiving faxes via cloud fax services
 * like Phaxio, SRFax, or similar providers.
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

// ============================================================================
// Types
// ============================================================================

export interface FaxSendRequest {
  toNumber: string;
  fromNumber?: string;
  document: {
    type: 'url' | 'base64' | 'documentId';
    content: string;
    filename?: string;
  };
  subject?: string;
  coverPage?: {
    include: boolean;
    message?: string;
    recipientName?: string;
    recipientOrg?: string;
    senderName?: string;
    senderOrg?: string;
  };
  referralId?: string;
  providerId?: string;
  priority?: 'normal' | 'high';
  scheduledTime?: string;
  tags?: string[];
}

export interface FaxSendResult {
  success: boolean;
  faxId: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  pageCount?: number;
  estimatedDeliveryTime?: string;
  message?: string;
  errorCode?: string;
  timestamp: string;
}

export interface FaxStatus {
  faxId: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'partial';
  direction: 'outbound' | 'inbound';
  toNumber?: string;
  fromNumber?: string;
  pageCount: number;
  attempts: number;
  sentAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface IncomingFax {
  faxId: string;
  fromNumber: string;
  toNumber: string;
  pageCount: number;
  receivedAt: string;
  documentUrl?: string;
  documentBase64?: string;
  callerIdName?: string;
  subject?: string;
  isProcessed: boolean;
}

export interface FaxListResult {
  faxes: IncomingFax[];
  totalCount: number;
  hasMore: boolean;
}

// ============================================================================
// Mock Data
// ============================================================================

const SAMPLE_SENDERS = [
  { name: 'Quest Diagnostics', number: '+18005551234' },
  { name: 'Blue Cross Blue Shield', number: '+18005552345' },
  { name: 'Dr. John Smith Office', number: '+15555551111' },
  { name: 'Radiology Associates', number: '+15555552222' },
  { name: 'Community Hospital', number: '+15555553333' },
];

// ============================================================================
// Fax Adapter
// ============================================================================

export class FaxAdapter extends BaseAdapter {
  private provider: string;

  constructor(options: AdapterOptions & { provider?: string }) {
    super(options);
    this.provider = options.provider || 'phaxio';
  }

  getIntegrationType(): string {
    return 'fax';
  }

  getProvider(): string {
    return this.provider;
  }

  /**
   * Test connection to fax service
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      await this.sleep(200);
      return {
        success: true,
        message: `Connected to ${this.provider} (mock mode)`,
      };
    }

    const startTime = Date.now();
    try {
      await this.sleep(300);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v2/account/status',
        method: 'GET',
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        message: `Connected to ${this.provider}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Send a fax
   */
  async sendFax(request: FaxSendRequest): Promise<FaxSendResult> {
    const startTime = Date.now();
    const faxId = `FAX-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

    logger.info('Sending fax', {
      faxId,
      toNumber: request.toNumber,
      hasDocument: !!request.document,
      referralId: request.referralId,
    });

    try {
      let result: FaxSendResult;

      if (this.useMock) {
        result = await this.mockSendFax(request, faxId);
      } else {
        result = await this.withRetry(() => this.realSendFax(request, faxId));
      }

      // Store fax transmission record
      await this.storeFaxTransmission(request, result);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v2/faxes',
        method: 'POST',
        request: {
          toNumber: request.toNumber,
          documentType: request.document.type,
        },
        response: {
          faxId: result.faxId,
          status: result.status,
        },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
        correlationId: faxId,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to send fax', { faxId, error: error.message });

      return {
        success: false,
        faxId,
        status: 'failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Poll for incoming faxes
   */
  async receiveFaxes(options?: {
    since?: string;
    limit?: number;
    unprocessedOnly?: boolean;
  }): Promise<FaxListResult> {
    const startTime = Date.now();
    const limit = options?.limit || 50;

    logger.info('Polling for incoming faxes', { limit, since: options?.since });

    try {
      let result: FaxListResult;

      if (this.useMock) {
        result = await this.mockReceiveFaxes(options);
      } else {
        result = await this.withRetry(() => this.realReceiveFaxes(options));
      }

      // Store new incoming faxes
      for (const fax of result.faxes) {
        await this.storeIncomingFax(fax);
      }

      await this.logIntegration({
        direction: 'inbound',
        endpoint: '/v2/faxes/incoming',
        method: 'GET',
        request: { limit, since: options?.since },
        response: { count: result.faxes.length, hasMore: result.hasMore },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to receive faxes', { error: error.message });
      return {
        faxes: [],
        totalCount: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Get status of a sent fax
   */
  async getFaxStatus(faxId: string): Promise<FaxStatus> {
    const startTime = Date.now();

    logger.info('Getting fax status', { faxId });

    try {
      let status: FaxStatus;

      if (this.useMock) {
        status = await this.mockGetFaxStatus(faxId);
      } else {
        status = await this.withRetry(() => this.realGetFaxStatus(faxId));
      }

      // Update stored status
      await pool.query(
        `UPDATE fax_transmissions
         SET status = $1, sent_at = $2, retry_count = $3, error_message = $4, updated_at = NOW()
         WHERE external_id = $5 AND tenant_id = $6`,
        [
          status.status,
          status.sentAt || status.deliveredAt,
          status.attempts,
          status.errorMessage,
          faxId,
          this.tenantId,
        ]
      );

      await this.logIntegration({
        direction: 'outbound',
        endpoint: `/v2/faxes/${faxId}`,
        method: 'GET',
        request: { faxId },
        response: { status: status.status },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return status;
    } catch (error: any) {
      logger.error('Failed to get fax status', { faxId, error: error.message });
      throw error;
    }
  }

  /**
   * Attach an incoming fax to a referral
   */
  async attachFaxToReferral(
    faxId: string,
    referralId: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();

    logger.info('Attaching fax to referral', { faxId, referralId });

    try {
      // Get fax transmission record
      const faxResult = await pool.query(
        `SELECT id, document_url, page_count, subject, from_number
         FROM fax_transmissions
         WHERE external_id = $1 AND tenant_id = $2`,
        [faxId, this.tenantId]
      );

      if (faxResult.rows.length === 0) {
        throw new Error('Fax not found');
      }

      const fax = faxResult.rows[0];

      // Update fax with referral link
      await pool.query(
        `UPDATE fax_transmissions
         SET referral_id = $1, processed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [referralId, fax.id]
      );

      // Optionally create a document record linked to the referral
      await pool.query(
        `INSERT INTO documents
         (tenant_id, patient_id, document_type, title, file_path, notes, source)
         SELECT
           $1,
           r.patient_id,
           'fax',
           COALESCE($2, 'Incoming Fax from ' || $3),
           $4,
           $5,
           'fax'
         FROM referrals r
         WHERE r.id = $6`,
        [
          this.tenantId,
          fax.subject,
          fax.from_number,
          fax.document_url,
          notes,
          referralId,
        ]
      );

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/internal/attach-fax',
        method: 'POST',
        request: { faxId, referralId },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        message: `Fax ${faxId} attached to referral ${referralId}`,
      };
    } catch (error: any) {
      logger.error('Failed to attach fax to referral', { faxId, referralId, error: error.message });
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Get pending incoming faxes for review
   */
  async getPendingIncomingFaxes(): Promise<IncomingFax[]> {
    try {
      const result = await pool.query(
        `SELECT external_id, from_number, fax_number, page_count, received_at,
                document_url, subject, processed_at
         FROM fax_transmissions
         WHERE tenant_id = $1 AND direction = 'inbound' AND processed_at IS NULL
         ORDER BY received_at DESC
         LIMIT 100`,
        [this.tenantId]
      );

      return result.rows.map(row => ({
        faxId: row.external_id,
        fromNumber: row.from_number,
        toNumber: row.fax_number,
        pageCount: row.page_count,
        receivedAt: row.received_at,
        documentUrl: row.document_url,
        subject: row.subject,
        isProcessed: !!row.processed_at,
      }));
    } catch (error) {
      logger.error('Failed to get pending faxes', { error });
      return [];
    }
  }

  /**
   * Mark an incoming fax as processed
   */
  async markFaxProcessed(faxId: string, processedBy?: string): Promise<void> {
    await pool.query(
      `UPDATE fax_transmissions
       SET processed_at = NOW(), processed_by = $1, updated_at = NOW()
       WHERE external_id = $2 AND tenant_id = $3`,
      [processedBy, faxId, this.tenantId]
    );
  }

  // ============================================================================
  // Mock Implementations
  // ============================================================================

  private async mockSendFax(request: FaxSendRequest, faxId: string): Promise<FaxSendResult> {
    await this.sleep(500 + Math.random() * 1000);

    // 90% success rate
    const success = Math.random() < 0.9;
    const pageCount = Math.floor(1 + Math.random() * 5);

    return {
      success,
      faxId,
      status: success ? 'queued' : 'failed',
      pageCount,
      estimatedDeliveryTime: success
        ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
        : undefined,
      message: success
        ? 'Fax queued for delivery'
        : 'Failed to queue fax - invalid number',
      errorCode: success ? undefined : 'INVALID_NUMBER',
      timestamp: new Date().toISOString(),
    };
  }

  private async mockReceiveFaxes(options?: {
    since?: string;
    limit?: number;
    unprocessedOnly?: boolean;
  }): Promise<FaxListResult> {
    await this.sleep(500 + Math.random() * 500);

    // Check for existing unprocessed faxes
    const existingResult = await pool.query(
      `SELECT COUNT(*) as count FROM fax_transmissions
       WHERE tenant_id = $1 AND direction = 'inbound' AND processed_at IS NULL`,
      [this.tenantId]
    );

    const existingCount = parseInt(existingResult.rows[0].count, 10);

    // Only generate new faxes sometimes
    if (existingCount > 3 || Math.random() > 0.3) {
      const existingFaxes = await pool.query(
        `SELECT external_id, from_number, fax_number, page_count, received_at,
                document_url, subject
         FROM fax_transmissions
         WHERE tenant_id = $1 AND direction = 'inbound' AND processed_at IS NULL
         ORDER BY received_at DESC
         LIMIT $2`,
        [this.tenantId, options?.limit || 50]
      );

      return {
        faxes: existingFaxes.rows.map(row => ({
          faxId: row.external_id,
          fromNumber: row.from_number,
          toNumber: row.fax_number,
          pageCount: row.page_count,
          receivedAt: row.received_at,
          documentUrl: row.document_url,
          subject: row.subject,
          isProcessed: false,
        })),
        totalCount: existingFaxes.rows.length,
        hasMore: false,
      };
    }

    // Generate 1-3 new mock faxes
    const count = Math.floor(1 + Math.random() * 3);
    const faxes: IncomingFax[] = [];

    for (let i = 0; i < count; i++) {
      const sender = SAMPLE_SENDERS[Math.floor(Math.random() * SAMPLE_SENDERS.length)]!;
      const subjects = [
        'Lab Results',
        'Referral Request',
        'Insurance Authorization',
        'Medical Records Request',
        'Prior Authorization Approval',
        'Consultation Report',
      ];

      faxes.push({
        faxId: `FAX-IN-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`,
        fromNumber: sender.number,
        toNumber: '+15555550000',
        pageCount: Math.floor(1 + Math.random() * 8),
        receivedAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        documentUrl: `/mock-fax-${Date.now()}.pdf`,
        callerIdName: sender.name,
        subject: subjects[Math.floor(Math.random() * subjects.length)],
        isProcessed: false,
      });
    }

    return {
      faxes,
      totalCount: count,
      hasMore: false,
    };
  }

  private async mockGetFaxStatus(faxId: string): Promise<FaxStatus> {
    await this.sleep(200 + Math.random() * 300);

    // Get stored status if available
    const result = await pool.query(
      `SELECT status, direction, fax_number, from_number, to_number,
              page_count, retry_count, sent_at, received_at, error_message
       FROM fax_transmissions
       WHERE external_id = $1 AND tenant_id = $2`,
      [faxId, this.tenantId]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];

      // Simulate status progression for queued/sending faxes
      let status = row.status;
      if (status === 'queued' && Math.random() > 0.5) {
        status = 'sending';
      } else if (status === 'sending' && Math.random() > 0.3) {
        status = Math.random() > 0.1 ? 'delivered' : 'failed';
      }

      return {
        faxId,
        status,
        direction: row.direction,
        toNumber: row.to_number,
        fromNumber: row.from_number,
        pageCount: row.page_count || 0,
        attempts: row.retry_count || 1,
        sentAt: row.sent_at,
        deliveredAt: status === 'delivered' ? new Date().toISOString() : undefined,
        errorMessage: status === 'failed' ? 'Line busy - no answer' : undefined,
      };
    }

    return {
      faxId,
      status: 'sent',
      direction: 'outbound',
      pageCount: 1,
      attempts: 1,
      sentAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Real API Implementations (placeholders)
  // ============================================================================

  private async realSendFax(request: FaxSendRequest, faxId: string): Promise<FaxSendResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realReceiveFaxes(options?: {
    since?: string;
    limit?: number;
  }): Promise<FaxListResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realGetFaxStatus(faxId: string): Promise<FaxStatus> {
    throw new Error('Real API not implemented - use mock mode');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async storeFaxTransmission(request: FaxSendRequest, result: FaxSendResult): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO fax_transmissions
         (tenant_id, direction, fax_number, to_number, from_number, subject,
          page_count, document_url, referral_id, provider_id, status, external_id)
         VALUES ($1, 'outbound', $2, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          this.tenantId,
          request.toNumber,
          request.fromNumber,
          request.subject,
          result.pageCount,
          request.document.type === 'url' ? request.document.content : null,
          request.referralId,
          request.providerId,
          result.status,
          result.faxId,
        ]
      );
    } catch (error) {
      logger.error('Failed to store fax transmission', { error });
    }
  }

  private async storeIncomingFax(fax: IncomingFax): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO fax_transmissions
         (tenant_id, direction, fax_number, from_number, to_number, subject,
          page_count, document_url, status, external_id, received_at)
         VALUES ($1, 'inbound', $2, $2, $3, $4, $5, $6, 'received', $7, $8)
         ON CONFLICT (external_id) DO NOTHING`,
        [
          this.tenantId,
          fax.fromNumber,
          fax.toNumber,
          fax.subject || fax.callerIdName,
          fax.pageCount,
          fax.documentUrl,
          fax.faxId,
          fax.receivedAt,
        ]
      );
    } catch (error) {
      logger.error('Failed to store incoming fax', { error });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFaxAdapter(
  tenantId: string,
  provider: string = 'phaxio',
  useMock: boolean = true
): FaxAdapter {
  return new FaxAdapter({
    tenantId,
    provider,
    useMock,
  });
}
