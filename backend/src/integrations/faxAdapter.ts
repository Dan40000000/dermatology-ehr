/**
 * Fax Integration Adapter
 *
 * Handles sending and receiving faxes via cloud fax services
 * like Phaxio, SRFax, or similar providers.
 */

import crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';
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
      await this.requestPhaxio('GET', '/account/status');

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
    const { fromNumber } = this.getPhaxioConfig();
    const form = new FormData();
    form.append('to', request.toNumber);
    if (request.fromNumber || fromNumber) {
      form.append('from_number', request.fromNumber || fromNumber);
    }

    if (request.document.type === 'url') {
      form.append('content_url', request.document.content);
    } else if (request.document.type === 'base64') {
      const fileBuffer = Buffer.from(request.document.content, 'base64');
      form.append('file', fileBuffer, {
        filename: request.document.filename || `fax-${Date.now()}.pdf`,
      });
    } else {
      throw new Error('document.type=documentId is not supported for real fax sending');
    }

    if (request.tags?.length) {
      form.append('tags', request.tags.join(','));
    }

    const payload = await this.requestPhaxio('POST', '/faxes', form, {
      headers: form.getHeaders(),
    });
    const record = this.extractRecord(payload);
    const outboundStatus = this.mapOutboundStatus(record?.status);

    return {
      success: outboundStatus !== 'failed',
      faxId: String(record?.id || faxId),
      status: outboundStatus,
      pageCount: Number(record?.num_pages || record?.pages || 0) || undefined,
      message: record?.message || undefined,
      errorCode: record?.error_code || undefined,
      timestamp: new Date().toISOString(),
    };
  }

  private async realReceiveFaxes(options?: {
    since?: string;
    limit?: number;
  }): Promise<FaxListResult> {
    const payload = await this.requestPhaxio('GET', '/faxes', undefined, {
      params: {
        direction: 'received',
        per_page: options?.limit || 50,
      },
    });

    const rows = this.extractCollection(payload);
    const sinceEpoch = options?.since ? new Date(options.since).getTime() : 0;
    const mapped = rows
      .map((row) => {
        const receivedAt = String(
          row?.created_at ||
          row?.received_at ||
          new Date().toISOString()
        );
        return {
          faxId: String(row?.id || row?.fax_id || crypto.randomUUID()),
          fromNumber: String(row?.from_number || ''),
          toNumber: String(row?.to_number || ''),
          pageCount: Number(row?.num_pages || row?.pages || 0) || 0,
          receivedAt,
          documentUrl: row?.file_url || row?.content_url || row?.document_url || undefined,
          callerIdName: row?.caller_id_name || row?.from_display_name || undefined,
          subject: row?.subject || undefined,
          isProcessed: false,
        } as IncomingFax;
      })
      .filter((fax) => {
        if (!sinceEpoch) return true;
        return new Date(fax.receivedAt).getTime() >= sinceEpoch;
      });

    return {
      faxes: mapped,
      totalCount: mapped.length,
      hasMore: Boolean(payload?.paging?.next_page || payload?.next_page_url),
    };
  }

  private async realGetFaxStatus(faxId: string): Promise<FaxStatus> {
    const payload = await this.requestPhaxio('GET', `/faxes/${encodeURIComponent(faxId)}`);
    const row = this.extractRecord(payload);
    const normalized = this.mapStatus(row?.status);

    return {
      faxId: String(row?.id || faxId),
      status: normalized,
      direction: this.mapDirection(row?.direction),
      toNumber: row?.to_number || undefined,
      fromNumber: row?.from_number || undefined,
      pageCount: Number(row?.num_pages || row?.pages || 0) || 0,
      attempts: Number(row?.attempts || row?.retry_count || row?.retries || 1) || 1,
      sentAt: row?.completed_at || row?.sent_at || row?.updated_at || undefined,
      deliveredAt:
        normalized === 'delivered'
          ? row?.completed_at || row?.delivered_at || row?.updated_at || undefined
          : undefined,
      errorMessage: row?.error_message || undefined,
      errorCode: row?.error_code || undefined,
    };
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

  private getPhaxioConfig(): {
    apiKey: string;
    apiSecret: string;
    fromNumber: string;
    baseUrl: string;
  } {
    const credentials = this.getCredentials();
    const apiKey = String(
      credentials.phaxioApiKey ||
      credentials.apiKey ||
      credentials.api_key ||
      process.env.PHAXIO_API_KEY ||
      ''
    ).trim();
    const apiSecret = String(
      credentials.phaxioApiSecret ||
      credentials.apiSecret ||
      credentials.api_secret ||
      process.env.PHAXIO_API_SECRET ||
      ''
    ).trim();
    const fromNumber = String(
      credentials.phaxioFromNumber ||
      credentials.fromNumber ||
      credentials.from_number ||
      process.env.PHAXIO_FROM_NUMBER ||
      ''
    ).trim();
    const baseUrl = String(
      credentials.baseUrl ||
      process.env.PHAXIO_BASE_URL ||
      'https://api.phaxio.com/v2'
    ).trim();

    if (!apiKey || !apiSecret) {
      throw new Error('Phaxio credentials not configured');
    }

    return { apiKey, apiSecret, fromNumber, baseUrl };
  }

  private async requestPhaxio(
    method: 'GET' | 'POST',
    path: string,
    data?: unknown,
    options?: { params?: Record<string, unknown>; headers?: Record<string, string> }
  ): Promise<any> {
    const { apiKey, apiSecret, baseUrl } = this.getPhaxioConfig();
    const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
    const response = await axios.request({
      method,
      url,
      auth: {
        username: apiKey,
        password: apiSecret,
      },
      params: options?.params,
      headers: options?.headers,
      data,
      timeout: 15000,
    });
    return response.data;
  }

  private extractRecord(payload: any): any {
    if (payload?.data && !Array.isArray(payload.data)) {
      return payload.data;
    }
    return payload;
  }

  private extractCollection(payload: any): any[] {
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.faxes)) return payload.faxes;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  private mapDirection(direction: string | undefined): 'outbound' | 'inbound' {
    return String(direction || '').toLowerCase() === 'received' ? 'inbound' : 'outbound';
  }

  private mapOutboundStatus(status: string | undefined): FaxSendResult['status'] {
    const normalized = this.mapStatus(status);
    if (normalized === 'failed') return 'failed';
    if (normalized === 'queued') return 'queued';
    if (normalized === 'sending') return 'sending';
    return 'sent';
  }

  private mapStatus(status: string | undefined): FaxStatus['status'] {
    const normalized = String(status || '').toLowerCase();
    if (['queued', 'queueing'].includes(normalized)) return 'queued';
    if (['in_progress', 'sending', 'processing'].includes(normalized)) return 'sending';
    if (['success', 'sent', 'complete', 'completed'].includes(normalized)) return 'delivered';
    if (['partial_success', 'partial'].includes(normalized)) return 'partial';
    if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
    return 'sent';
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
