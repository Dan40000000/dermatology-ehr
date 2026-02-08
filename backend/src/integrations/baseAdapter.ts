/**
 * Base Integration Adapter
 *
 * Abstract base class for all external integrations.
 * Provides common functionality for logging, error handling, retry logic,
 * and credential management.
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface IntegrationConfig {
  id: string;
  tenantId: string;
  integrationType: string;
  provider: string;
  config: Record<string, any>;
  credentialsEncrypted?: string;
  isActive: boolean;
  lastSyncAt?: Date;
  syncFrequencyMinutes: number;
}

export interface IntegrationLogEntry {
  tenantId: string;
  integrationType: string;
  provider?: string;
  direction: 'inbound' | 'outbound';
  endpoint?: string;
  method?: string;
  request?: any;
  response?: any;
  status: 'success' | 'error' | 'timeout' | 'pending';
  statusCode?: number;
  errorMessage?: string;
  durationMs?: number;
  correlationId?: string;
}

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses?: number[];
}

export interface AdapterOptions {
  tenantId: string;
  config?: IntegrationConfig;
  useMock?: boolean;
}

// ============================================================================
// Credential Encryption Utilities
// ============================================================================

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || 'default-key-change-in-production!';

function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from the environment variable
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
}

export function encryptCredentials(credentials: Record<string, any>): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  const jsonStr = JSON.stringify(credentials);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted,
  });
}

export function decryptCredentials(encryptedStr: string): Record<string, any> {
  try {
    const { iv, authTag, data } = JSON.parse(encryptedStr);
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    logger.error('Failed to decrypt credentials', { error });
    throw new Error('Failed to decrypt integration credentials');
  }
}

// ============================================================================
// Base Adapter Class
// ============================================================================

export abstract class BaseAdapter {
  protected tenantId: string;
  protected config: IntegrationConfig | null;
  protected useMock: boolean;
  protected correlationId: string;

  protected defaultRetryOptions: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  };

  constructor(options: AdapterOptions) {
    this.tenantId = options.tenantId;
    this.config = options.config || null;
    this.useMock = options.useMock ?? (process.env.NODE_ENV !== 'production');
    this.correlationId = crypto.randomUUID();
  }

  /**
   * Get the integration type identifier
   */
  abstract getIntegrationType(): string;

  /**
   * Get the provider name (e.g., 'stripe', 'labcorp')
   */
  abstract getProvider(): string;

  /**
   * Test the connection to the external service
   */
  abstract testConnection(): Promise<{ success: boolean; message: string }>;

  /**
   * Load configuration from database
   */
  async loadConfig(): Promise<IntegrationConfig | null> {
    try {
      const result = await pool.query(
        `SELECT id, tenant_id, integration_type, provider, config,
                credentials_encrypted, is_active, last_sync_at, sync_frequency_minutes
         FROM integration_configs
         WHERE tenant_id = $1 AND integration_type = $2 AND is_active = true
         LIMIT 1`,
        [this.tenantId, this.getIntegrationType()]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      this.config = {
        id: row.id,
        tenantId: row.tenant_id,
        integrationType: row.integration_type,
        provider: row.provider,
        config: row.config || {},
        credentialsEncrypted: row.credentials_encrypted,
        isActive: row.is_active,
        lastSyncAt: row.last_sync_at,
        syncFrequencyMinutes: row.sync_frequency_minutes || 60,
      };

      return this.config;
    } catch (error) {
      logger.error('Failed to load integration config', {
        tenantId: this.tenantId,
        integrationType: this.getIntegrationType(),
        error,
      });
      return null;
    }
  }

  /**
   * Get decrypted credentials
   */
  protected getCredentials(): Record<string, any> {
    if (!this.config?.credentialsEncrypted) {
      return {};
    }
    return decryptCredentials(this.config.credentialsEncrypted);
  }

  /**
   * Log an integration API call
   */
  protected async logIntegration(entry: Omit<IntegrationLogEntry, 'tenantId' | 'integrationType'>): Promise<void> {
    try {
      const logEntry: IntegrationLogEntry = {
        tenantId: this.tenantId,
        integrationType: this.getIntegrationType(),
        provider: entry.provider || this.getProvider(),
        ...entry,
        correlationId: entry.correlationId || this.correlationId,
      };

      await pool.query(
        `INSERT INTO integration_logs
         (tenant_id, integration_type, provider, direction, endpoint, method,
          request, response, status, status_code, error_message, duration_ms, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          logEntry.tenantId,
          logEntry.integrationType,
          logEntry.provider,
          logEntry.direction,
          logEntry.endpoint,
          logEntry.method,
          logEntry.request ? JSON.stringify(this.sanitizeForLog(logEntry.request)) : null,
          logEntry.response ? JSON.stringify(this.sanitizeForLog(logEntry.response)) : null,
          logEntry.status,
          logEntry.statusCode,
          logEntry.errorMessage,
          logEntry.durationMs,
          logEntry.correlationId,
        ]
      );
    } catch (error) {
      logger.error('Failed to log integration call', { error });
    }
  }

  /**
   * Sanitize data for logging (remove sensitive information)
   */
  protected sanitizeForLog(data: any): any {
    if (!data) return data;

    const sensitiveKeys = [
      'password', 'apiKey', 'api_key', 'secret', 'token', 'authorization',
      'ssn', 'social_security', 'credit_card', 'card_number', 'cvv',
      'credentials', 'private_key', 'access_token', 'refresh_token',
    ];

    const sanitize = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }

      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          sanitized[key] = sanitize(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    };

    return sanitize(data);
  }

  /**
   * Execute a function with retry logic
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    options?: Partial<RetryOptions>
  ): Promise<T> {
    const retryOpts = { ...this.defaultRetryOptions, ...options };
    let lastError: Error | null = null;
    let delay = retryOpts.initialDelayMs;

    for (let attempt = 0; attempt <= retryOpts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Check if we should retry
        const statusCode = error.statusCode || error.status || error.response?.status;
        const isRetryable = retryOpts.retryableStatuses?.includes(statusCode) ||
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND';

        if (attempt === retryOpts.maxRetries || !isRetryable) {
          throw error;
        }

        logger.warn('Integration call failed, retrying', {
          attempt: attempt + 1,
          maxRetries: retryOpts.maxRetries,
          delay,
          error: error.message,
        });

        await this.sleep(delay);
        delay = Math.min(delay * retryOpts.backoffMultiplier, retryOpts.maxDelayMs);
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique correlation ID for tracking requests
   */
  protected generateCorrelationId(): string {
    return `${this.getIntegrationType()}-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
  }

  /**
   * Update the last sync timestamp
   */
  protected async updateLastSync(): Promise<void> {
    if (!this.config?.id) return;

    try {
      await pool.query(
        `UPDATE integration_configs SET last_sync_at = NOW() WHERE id = $1`,
        [this.config.id]
      );
    } catch (error) {
      logger.error('Failed to update last sync timestamp', { error });
    }
  }

  /**
   * Check if the adapter is configured and active
   */
  isConfigured(): boolean {
    return this.config !== null && this.config.isActive;
  }

  /**
   * Get mock mode status
   */
  isMockMode(): boolean {
    return this.useMock;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Save or update integration configuration
 */
export async function saveIntegrationConfig(
  tenantId: string,
  integrationType: string,
  provider: string,
  config: Record<string, any>,
  credentials?: Record<string, any>
): Promise<string> {
  const credentialsEncrypted = credentials ? encryptCredentials(credentials) : null;

  const result = await pool.query(
    `INSERT INTO integration_configs
     (tenant_id, integration_type, provider, config, credentials_encrypted, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (tenant_id, integration_type, provider)
     DO UPDATE SET
       config = EXCLUDED.config,
       credentials_encrypted = COALESCE(EXCLUDED.credentials_encrypted, integration_configs.credentials_encrypted),
       updated_at = NOW()
     RETURNING id`,
    [tenantId, integrationType, provider, JSON.stringify(config), credentialsEncrypted]
  );

  return result.rows[0].id;
}

/**
 * Get integration configuration
 */
export async function getIntegrationConfig(
  tenantId: string,
  integrationType: string
): Promise<IntegrationConfig | null> {
  const result = await pool.query(
    `SELECT id, tenant_id, integration_type, provider, config,
            credentials_encrypted, is_active, last_sync_at, sync_frequency_minutes
     FROM integration_configs
     WHERE tenant_id = $1 AND integration_type = $2 AND is_active = true
     LIMIT 1`,
    [tenantId, integrationType]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    integrationType: row.integration_type,
    provider: row.provider,
    config: row.config || {},
    credentialsEncrypted: row.credentials_encrypted,
    isActive: row.is_active,
    lastSyncAt: row.last_sync_at,
    syncFrequencyMinutes: row.sync_frequency_minutes || 60,
  };
}

/**
 * Deactivate an integration
 */
export async function deactivateIntegration(
  tenantId: string,
  integrationType: string
): Promise<void> {
  await pool.query(
    `UPDATE integration_configs SET is_active = false, updated_at = NOW()
     WHERE tenant_id = $1 AND integration_type = $2`,
    [tenantId, integrationType]
  );
}

/**
 * Get all integrations for a tenant
 */
export async function getAllIntegrations(tenantId: string): Promise<IntegrationConfig[]> {
  const result = await pool.query(
    `SELECT id, tenant_id, integration_type, provider, config,
            is_active, last_sync_at, sync_frequency_minutes
     FROM integration_configs
     WHERE tenant_id = $1
     ORDER BY integration_type`,
    [tenantId]
  );

  return result.rows.map(row => ({
    id: row.id,
    tenantId: row.tenant_id,
    integrationType: row.integration_type,
    provider: row.provider,
    config: row.config || {},
    isActive: row.is_active,
    lastSyncAt: row.last_sync_at,
    syncFrequencyMinutes: row.sync_frequency_minutes || 60,
  }));
}
