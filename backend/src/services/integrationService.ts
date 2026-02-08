/**
 * Integration Service
 *
 * Facade service that coordinates all external integrations.
 * Provides a unified interface for managing integration configurations,
 * testing connections, and syncing data.
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import {
  BaseAdapter,
  saveIntegrationConfig,
  getIntegrationConfig,
  getAllIntegrations,
  deactivateIntegration,
  IntegrationConfig,
} from '../integrations/baseAdapter';
import { ClearinghouseAdapter, createClearinghouseAdapter } from '../integrations/clearinghouseAdapter';
import { EligibilityAdapter, createEligibilityAdapter } from '../integrations/eligibilityAdapter';
import { EPrescribeAdapter, createEPrescribeAdapter } from '../integrations/ePrescribeAdapter';
import { LabAdapter, createLabAdapter } from '../integrations/labAdapter';
import { PaymentAdapter, createPaymentAdapter } from '../integrations/paymentAdapter';
import { FaxAdapter, createFaxAdapter } from '../integrations/faxAdapter';

// ============================================================================
// Types
// ============================================================================

export type IntegrationType =
  | 'clearinghouse'
  | 'eligibility'
  | 'eprescribe'
  | 'lab'
  | 'payment'
  | 'fax';

export interface IntegrationStatus {
  type: IntegrationType;
  provider: string;
  isConfigured: boolean;
  isActive: boolean;
  lastSyncAt?: string;
  syncFrequencyMinutes?: number;
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'unknown';
  lastError?: string;
}

export interface AllIntegrationStatuses {
  clearinghouse: IntegrationStatus;
  eligibility: IntegrationStatus;
  eprescribe: IntegrationStatus;
  lab: IntegrationStatus;
  payment: IntegrationStatus;
  fax: IntegrationStatus;
}

export interface IntegrationConfigInput {
  provider: string;
  config: Record<string, any>;
  credentials?: Record<string, any>;
  isActive?: boolean;
  syncFrequencyMinutes?: number;
}

export interface SyncResult {
  success: boolean;
  itemsProcessed: number;
  errors: string[];
  timestamp: string;
}

// ============================================================================
// Integration Service
// ============================================================================

export class IntegrationService {
  private tenantId: string;
  private adapters: Map<IntegrationType, BaseAdapter> = new Map();
  private useMock: boolean;

  constructor(tenantId: string, useMock: boolean = true) {
    this.tenantId = tenantId;
    this.useMock = useMock;
  }

  /**
   * Get status of all integrations
   */
  async getIntegrationStatus(): Promise<AllIntegrationStatuses> {
    const integrationTypes: IntegrationType[] = [
      'clearinghouse', 'eligibility', 'eprescribe', 'lab', 'payment', 'fax',
    ];

    const statuses: Record<string, IntegrationStatus> = {};

    for (const type of integrationTypes) {
      const config = await getIntegrationConfig(this.tenantId, type);

      statuses[type] = {
        type,
        provider: config?.provider || this.getDefaultProvider(type),
        isConfigured: !!config,
        isActive: config?.isActive || false,
        lastSyncAt: config?.lastSyncAt?.toISOString(),
        syncFrequencyMinutes: config?.syncFrequencyMinutes,
        connectionStatus: config?.isActive ? 'unknown' : 'disconnected',
      };
    }

    return statuses as unknown as AllIntegrationStatuses;
  }

  /**
   * Get status of a specific integration
   */
  async getIntegrationTypeStatus(type: IntegrationType): Promise<IntegrationStatus> {
    const config = await getIntegrationConfig(this.tenantId, type);

    let connectionStatus: IntegrationStatus['connectionStatus'] = 'disconnected';
    let lastError: string | undefined;

    if (config?.isActive) {
      try {
        const result = await this.testConnection(type);
        connectionStatus = result.success ? 'connected' : 'error';
        if (!result.success) {
          lastError = result.message;
        }
      } catch (error: any) {
        connectionStatus = 'error';
        lastError = error.message;
      }
    }

    return {
      type,
      provider: config?.provider || this.getDefaultProvider(type),
      isConfigured: !!config,
      isActive: config?.isActive || false,
      lastSyncAt: config?.lastSyncAt?.toISOString(),
      syncFrequencyMinutes: config?.syncFrequencyMinutes,
      connectionStatus,
      lastError,
    };
  }

  /**
   * Test connection to an integration
   */
  async testConnection(type: IntegrationType): Promise<{ success: boolean; message: string }> {
    logger.info('Testing integration connection', { type, tenantId: this.tenantId });

    try {
      const adapter = await this.getAdapter(type);
      const result = await adapter.testConnection();

      // Log test result
      await pool.query(
        `INSERT INTO integration_logs
         (tenant_id, integration_type, provider, direction, endpoint, method, status, durationMs)
         VALUES ($1, $2, $3, 'outbound', '/test', 'GET', $4, 0)`,
        [this.tenantId, type, adapter.getProvider(), result.success ? 'success' : 'error']
      );

      return result;
    } catch (error: any) {
      logger.error('Integration test failed', { type, error: error.message });
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Configure an integration
   */
  async configureIntegration(
    type: IntegrationType,
    input: IntegrationConfigInput
  ): Promise<{ success: boolean; configId: string }> {
    logger.info('Configuring integration', { type, provider: input.provider, tenantId: this.tenantId });

    try {
      const configId = await saveIntegrationConfig(
        this.tenantId,
        type,
        input.provider,
        {
          ...input.config,
          syncFrequencyMinutes: input.syncFrequencyMinutes || 60,
        },
        input.credentials
      );

      // Clear cached adapter
      this.adapters.delete(type);

      logger.info('Integration configured successfully', { type, configId });

      return {
        success: true,
        configId,
      };
    } catch (error: any) {
      logger.error('Failed to configure integration', { type, error: error.message });
      throw error;
    }
  }

  /**
   * Deactivate an integration
   */
  async deactivateIntegration(type: IntegrationType): Promise<void> {
    logger.info('Deactivating integration', { type, tenantId: this.tenantId });

    await deactivateIntegration(this.tenantId, type);
    this.adapters.delete(type);
  }

  /**
   * Trigger manual sync for an integration
   */
  async syncIntegration(type: IntegrationType): Promise<SyncResult> {
    logger.info('Starting manual sync', { type, tenantId: this.tenantId });

    const startTime = Date.now();
    const errors: string[] = [];
    let itemsProcessed = 0;

    try {
      switch (type) {
        case 'clearinghouse':
          const clearinghouse = await this.getClearinghouseAdapter();
          // Sync ERA files
          const eraFiles = await clearinghouse.getERAFiles();
          for (const file of eraFiles) {
            try {
              await clearinghouse.processERA(file.id);
              itemsProcessed++;
            } catch (error: any) {
              errors.push(`ERA ${file.id}: ${error.message}`);
            }
          }
          break;

        case 'eligibility':
          // Batch verify patients with upcoming appointments
          const eligibility = await this.getEligibilityAdapter();
          const patientsToVerify = await this.getPatientsNeedingVerification();
          if (patientsToVerify.length > 0) {
            const result = await eligibility.batchEligibilityCheck(patientsToVerify);
            itemsProcessed = result.verifiedCount;
            if (result.errorCount > 0) {
              errors.push(`${result.errorCount} eligibility checks failed`);
            }
          }
          break;

        case 'lab':
          // Poll for lab results
          const lab = await this.getLabAdapter();
          const labResults = await lab.receiveResults();
          itemsProcessed = labResults.resultsCount;
          break;

        case 'fax':
          // Poll for incoming faxes
          const fax = await this.getFaxAdapter();
          const faxResult = await fax.receiveFaxes({ unprocessedOnly: true });
          itemsProcessed = faxResult.faxes.length;
          break;

        default:
          // No sync action for other types
          break;
      }

      // Update last sync timestamp
      await pool.query(
        `UPDATE integration_configs SET last_sync_at = NOW()
         WHERE tenant_id = $1 AND integration_type = $2`,
        [this.tenantId, type]
      );

      logger.info('Manual sync completed', {
        type,
        itemsProcessed,
        errorCount: errors.length,
        durationMs: Date.now() - startTime,
      });

      return {
        success: errors.length === 0,
        itemsProcessed,
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error('Sync failed', { type, error: error.message });
      return {
        success: false,
        itemsProcessed,
        errors: [...errors, error.message],
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get integration logs
   */
  async getIntegrationLogs(
    type?: IntegrationType,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{
    logs: any[];
    total: number;
  }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = `
      SELECT id, integration_type, provider, direction, endpoint, method,
             status, status_code, error_message, duration_ms, correlation_id, created_at
      FROM integration_logs
      WHERE tenant_id = $1
    `;
    const params: any[] = [this.tenantId];
    let paramIndex = 2;

    if (type) {
      query += ` AND integration_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (options?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    if (options?.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    if (options?.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(options.endDate);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM'),
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get logs with pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      logs: result.rows,
      total,
    };
  }

  /**
   * Get integration statistics
   */
  async getIntegrationStats(
    type?: IntegrationType,
    days: number = 7
  ): Promise<{
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageDurationMs: number;
    callsByType: Record<string, number>;
    errorsByType: Record<string, number>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query = `
      SELECT
        integration_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'error') as errors,
        AVG(duration_ms) as avg_duration
      FROM integration_logs
      WHERE tenant_id = $1 AND created_at >= $2
    `;
    const params: any[] = [this.tenantId, startDate];

    if (type) {
      query += ` AND integration_type = $3`;
      params.push(type);
    }

    query += ` GROUP BY integration_type`;

    const result = await pool.query(query, params);

    let totalCalls = 0;
    let successfulCalls = 0;
    let failedCalls = 0;
    let totalDuration = 0;
    const callsByType: Record<string, number> = {};
    const errorsByType: Record<string, number> = {};

    for (const row of result.rows) {
      const calls = parseInt(row.total, 10);
      const success = parseInt(row.success, 10);
      const errors = parseInt(row.errors, 10);

      totalCalls += calls;
      successfulCalls += success;
      failedCalls += errors;
      totalDuration += parseFloat(row.avg_duration) * calls;

      callsByType[row.integration_type] = calls;
      errorsByType[row.integration_type] = errors;
    }

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      averageDurationMs: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
      callsByType,
      errorsByType,
    };
  }

  // ============================================================================
  // Adapter Getters
  // ============================================================================

  async getClearinghouseAdapter(): Promise<ClearinghouseAdapter> {
    if (!this.adapters.has('clearinghouse')) {
      const config = await getIntegrationConfig(this.tenantId, 'clearinghouse');
      const adapter = createClearinghouseAdapter(
        this.tenantId,
        config?.provider || 'change_healthcare',
        this.useMock
      );
      if (config) {
        adapter.loadConfig();
      }
      this.adapters.set('clearinghouse', adapter);
    }
    return this.adapters.get('clearinghouse') as ClearinghouseAdapter;
  }

  async getEligibilityAdapter(): Promise<EligibilityAdapter> {
    if (!this.adapters.has('eligibility')) {
      const config = await getIntegrationConfig(this.tenantId, 'eligibility');
      const adapter = createEligibilityAdapter(
        this.tenantId,
        config?.provider || 'availity',
        this.useMock
      );
      if (config) {
        adapter.loadConfig();
      }
      this.adapters.set('eligibility', adapter);
    }
    return this.adapters.get('eligibility') as EligibilityAdapter;
  }

  async getEPrescribeAdapter(): Promise<EPrescribeAdapter> {
    if (!this.adapters.has('eprescribe')) {
      const config = await getIntegrationConfig(this.tenantId, 'eprescribe');
      const adapter = createEPrescribeAdapter(this.tenantId, this.useMock);
      if (config) {
        adapter.loadConfig();
      }
      this.adapters.set('eprescribe', adapter);
    }
    return this.adapters.get('eprescribe') as EPrescribeAdapter;
  }

  async getLabAdapter(): Promise<LabAdapter> {
    if (!this.adapters.has('lab')) {
      const config = await getIntegrationConfig(this.tenantId, 'lab');
      const adapter = createLabAdapter(
        this.tenantId,
        config?.provider || 'labcorp',
        this.useMock
      );
      if (config) {
        adapter.loadConfig();
      }
      this.adapters.set('lab', adapter);
    }
    return this.adapters.get('lab') as LabAdapter;
  }

  async getPaymentAdapter(): Promise<PaymentAdapter> {
    if (!this.adapters.has('payment')) {
      const config = await getIntegrationConfig(this.tenantId, 'payment');
      const adapter = createPaymentAdapter(this.tenantId, this.useMock);
      if (config) {
        adapter.loadConfig();
      }
      this.adapters.set('payment', adapter);
    }
    return this.adapters.get('payment') as PaymentAdapter;
  }

  async getFaxAdapter(): Promise<FaxAdapter> {
    if (!this.adapters.has('fax')) {
      const config = await getIntegrationConfig(this.tenantId, 'fax');
      const adapter = createFaxAdapter(
        this.tenantId,
        config?.provider || 'phaxio',
        this.useMock
      );
      if (config) {
        adapter.loadConfig();
      }
      this.adapters.set('fax', adapter);
    }
    return this.adapters.get('fax') as FaxAdapter;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getAdapter(type: IntegrationType): Promise<BaseAdapter> {
    switch (type) {
      case 'clearinghouse':
        return this.getClearinghouseAdapter();
      case 'eligibility':
        return this.getEligibilityAdapter();
      case 'eprescribe':
        return this.getEPrescribeAdapter();
      case 'lab':
        return this.getLabAdapter();
      case 'payment':
        return this.getPaymentAdapter();
      case 'fax':
        return this.getFaxAdapter();
      default:
        throw new Error(`Unknown integration type: ${type}`);
    }
  }

  private getDefaultProvider(type: IntegrationType): string {
    const defaults: Record<IntegrationType, string> = {
      clearinghouse: 'change_healthcare',
      eligibility: 'availity',
      eprescribe: 'surescripts',
      lab: 'labcorp',
      payment: 'stripe',
      fax: 'phaxio',
    };
    return defaults[type];
  }

  private async getPatientsNeedingVerification(): Promise<Array<{
    patientId: string;
    payerId: string;
    memberId: string;
    firstName: string;
    lastName: string;
    dob: string;
  }>> {
    // Get patients with appointments in the next 3 days who haven't been verified recently
    const result = await pool.query(
      `SELECT DISTINCT
        p.id as patient_id,
        COALESCE(p.insurance_payer_id, 'UNKNOWN') as payer_id,
        p.insurance_member_id as member_id,
        p.first_name,
        p.last_name,
        TO_CHAR(p.dob, 'YYYY-MM-DD') as dob
       FROM patients p
       JOIN appointments a ON a.patient_id = p.id
       LEFT JOIN eligibility_checks ec ON ec.patient_id = p.id
         AND ec.checked_at > NOW() - INTERVAL '7 days'
       WHERE a.tenant_id = $1
         AND a.scheduled_time BETWEEN NOW() AND NOW() + INTERVAL '3 days'
         AND a.status NOT IN ('cancelled', 'no_show')
         AND p.insurance_member_id IS NOT NULL
         AND ec.id IS NULL
       LIMIT 50`,
      [this.tenantId]
    );

    return result.rows.map(row => ({
      patientId: row.patient_id,
      payerId: row.payer_id,
      memberId: row.member_id,
      firstName: row.first_name,
      lastName: row.last_name,
      dob: row.dob,
    }));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createIntegrationService(
  tenantId: string,
  useMock: boolean = true
): IntegrationService {
  return new IntegrationService(tenantId, useMock);
}

// Singleton-like accessor for convenience
const integrationServices = new Map<string, IntegrationService>();

export function getIntegrationService(tenantId: string): IntegrationService {
  if (!integrationServices.has(tenantId)) {
    integrationServices.set(
      tenantId,
      createIntegrationService(tenantId, process.env.NODE_ENV !== 'production')
    );
  }
  return integrationServices.get(tenantId)!;
}
