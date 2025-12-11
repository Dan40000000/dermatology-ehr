import client from 'prom-client';

/**
 * Prometheus metrics for monitoring
 */

// Create a Registry
export const register = new client.Registry();

// Add default metrics (memory, CPU, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

/**
 * HTTP request total counter
 */
export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Active database connections gauge
 */
export const activeConnections = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

/**
 * Database query duration histogram
 */
export const databaseQueryDuration = new client.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

/**
 * File upload counter
 */
export const fileUploadTotal = new client.Counter({
  name: 'file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['file_type', 'status'],
  registers: [register],
});

/**
 * File upload size histogram
 */
export const fileUploadSize = new client.Histogram({
  name: 'file_upload_size_bytes',
  help: 'Size of uploaded files in bytes',
  labelNames: ['file_type'],
  buckets: [1024, 10240, 102400, 1024000, 10240000, 52428800],
  registers: [register],
});

/**
 * Authentication attempts counter
 */
export const authAttempts = new client.Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['status', 'method'],
  registers: [register],
});

/**
 * Active sessions gauge
 */
export const activeSessions = new client.Gauge({
  name: 'sessions_active',
  help: 'Number of active user sessions',
  registers: [register],
});

/**
 * Cache hit/miss counter
 */
export const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_name'],
  registers: [register],
});

export const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_name'],
  registers: [register],
});

/**
 * HIPAA audit log counter
 */
export const auditLogTotal = new client.Counter({
  name: 'audit_log_events_total',
  help: 'Total number of audit log events',
  labelNames: ['event_type', 'user_role'],
  registers: [register],
});

/**
 * Patient records gauge
 */
export const patientRecordsTotal = new client.Gauge({
  name: 'patient_records_total',
  help: 'Total number of patient records',
  registers: [register],
});

/**
 * Appointments gauge
 */
export const appointmentsScheduled = new client.Gauge({
  name: 'appointments_scheduled',
  help: 'Number of scheduled appointments',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Virus scan counter
 */
export const virusScanTotal = new client.Counter({
  name: 'virus_scans_total',
  help: 'Total number of virus scans',
  labelNames: ['result'],
  registers: [register],
});

/**
 * Helper function to track HTTP request metrics
 */
export function trackHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number
): void {
  httpRequestTotal.inc({ method, route, status_code: statusCode });
  httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
}

/**
 * Helper function to track database query metrics
 */
export function trackDatabaseQuery(queryType: string, duration: number): void {
  databaseQueryDuration.observe({ query_type: queryType }, duration);
}

/**
 * Helper function to track authentication attempts
 */
export function trackAuthAttempt(status: 'success' | 'failure', method: string): void {
  authAttempts.inc({ status, method });
}

/**
 * Helper function to track cache operations
 */
export function trackCacheHit(cacheName: string): void {
  cacheHits.inc({ cache_name: cacheName });
}

export function trackCacheMiss(cacheName: string): void {
  cacheMisses.inc({ cache_name: cacheName });
}

/**
 * Helper function to track audit events
 */
export function trackAuditEvent(eventType: string, userRole: string): void {
  auditLogTotal.inc({ event_type: eventType, user_role: userRole });
}
