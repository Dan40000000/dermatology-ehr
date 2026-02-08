import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface ScheduledJob {
  id: string;
  jobName: string;
  jobType: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  handlerService: string;
  handlerMethod: string;
  config: Record<string, any>;
  isActive: boolean;
  isSystemJob: boolean;
  lastRunAt?: Date;
  lastRunStatus?: string;
  lastRunDurationMs?: number;
  lastError?: string;
  nextRunAt?: Date;
  maxRetries: number;
  retryDelayMs: number;
  currentRetryCount: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  tags: string[];
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobExecution {
  id: string;
  jobId: string;
  jobName?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  status: 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';
  result?: Record<string, any>;
  errorMessage?: string;
  errorStack?: string;
  triggeredBy: string;
  triggeredByUser?: string;
  retryNumber: number;
}

export interface JobHandler {
  (config: Record<string, any>, context: JobExecutionContext): Promise<Record<string, any>>;
}

export interface JobExecutionContext {
  jobId: string;
  jobName: string;
  executionId: string;
  startedAt: Date;
  config: Record<string, any>;
  extendLock: () => Promise<boolean>;
}

export interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export interface JobStatistics {
  jobId: string;
  jobName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  successRate: number;
}

// ============================================
// CRON PARSER
// ============================================

export class CronParser {
  /**
   * Parse a cron expression into its component parts
   * Format: minute hour dayOfMonth month dayOfWeek
   */
  static parse(expression: string): CronParts {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expression}. Expected 5 parts.`);
    }

    return {
      minute: parts[0] as string,
      hour: parts[1] as string,
      dayOfMonth: parts[2] as string,
      month: parts[3] as string,
      dayOfWeek: parts[4] as string,
    };
  }

  /**
   * Calculate the next run time from a cron expression
   */
  static getNextRunTime(expression: string, fromDate: Date = new Date()): Date {
    const parts = this.parse(expression);
    const next = new Date(fromDate);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // Add 1 minute to start checking from
    next.setMinutes(next.getMinutes() + 1);

    // Try to find next valid time within the next year
    const maxIterations = 525600; // minutes in a year
    let iterations = 0;

    while (iterations < maxIterations) {
      if (
        this.matchesCronPart(parts.month, next.getMonth() + 1) &&
        this.matchesCronPart(parts.dayOfMonth, next.getDate()) &&
        this.matchesDayOfWeek(parts.dayOfWeek, next.getDay()) &&
        this.matchesCronPart(parts.hour, next.getHours()) &&
        this.matchesCronPart(parts.minute, next.getMinutes())
      ) {
        return next;
      }

      // Increment by 1 minute
      next.setMinutes(next.getMinutes() + 1);
      iterations++;
    }

    // Fallback: return tomorrow at midnight
    const fallback = new Date(fromDate);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  /**
   * Check if a value matches a cron part expression
   */
  static matchesCronPart(cronPart: string, value: number): boolean {
    // Wildcard
    if (cronPart === '*') return true;

    // List (e.g., "1,4,7,10")
    if (cronPart.includes(',')) {
      const values = cronPart.split(',').map(Number);
      return values.includes(value);
    }

    // Range (e.g., "1-5")
    if (cronPart.includes('-')) {
      const rangeParts = cronPart.split('-').map(Number);
      const start = rangeParts[0] ?? 0;
      const end = rangeParts[1] ?? 0;
      return value >= start && value <= end;
    }

    // Step (e.g., "*/15")
    if (cronPart.includes('/')) {
      const stepParts = cronPart.split('/');
      const range = stepParts[0] ?? '*';
      const step = stepParts[1] ?? '1';
      const stepNum = Number(step);
      if (range === '*') {
        return value % stepNum === 0;
      }
      // Handle range with step (e.g., "0-30/5")
      if (range.includes('-')) {
        const rangeParts = range.split('-').map(Number);
        const start = rangeParts[0] ?? 0;
        const end = rangeParts[1] ?? 0;
        return value >= start && value <= end && (value - start) % stepNum === 0;
      }
    }

    // Exact match
    return Number(cronPart) === value;
  }

  /**
   * Special handling for day of week (0 = Sunday, 6 = Saturday)
   */
  static matchesDayOfWeek(cronPart: string, dayOfWeek: number): boolean {
    if (cronPart === '*') return true;

    // Convert 7 to 0 for Sunday if needed
    const normalizedPart = cronPart.replace(/7/g, '0');
    return this.matchesCronPart(normalizedPart, dayOfWeek);
  }

  /**
   * Validate a cron expression
   */
  static isValid(expression: string): boolean {
    try {
      this.parse(expression);
      this.getNextRunTime(expression);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a human-readable description of a cron expression
   */
  static describe(expression: string): string {
    try {
      const parts = this.parse(expression);
      const descriptions: string[] = [];

      // Time
      if (parts.minute !== '*' && parts.hour !== '*') {
        const minute = parts.minute.padStart(2, '0');
        const hour = Number(parts.hour);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        descriptions.push(`at ${displayHour}:${minute} ${ampm}`);
      } else if (parts.minute.includes('/')) {
        const step = parts.minute.split('/')[1];
        descriptions.push(`every ${step} minutes`);
      }

      // Day of month
      if (parts.dayOfMonth !== '*') {
        if (parts.dayOfMonth === '1') {
          descriptions.push('on the 1st');
        } else if (parts.dayOfMonth.includes(',')) {
          descriptions.push(`on the ${parts.dayOfMonth}`);
        }
      }

      // Month
      if (parts.month !== '*') {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (parts.month.includes(',')) {
          const months = parts.month.split(',').map(m => monthNames[Number(m) - 1]).join(', ');
          descriptions.push(`in ${months}`);
        }
      }

      // Day of week
      if (parts.dayOfWeek !== '*') {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const day = dayNames[Number(parts.dayOfWeek)];
        if (day) {
          descriptions.push(`on ${day}`);
        }
      }

      return descriptions.join(' ') || 'custom schedule';
    } catch {
      return 'invalid cron expression';
    }
  }
}

// ============================================
// JOB SCHEDULER SERVICE
// ============================================

export class JobSchedulerService {
  private instanceId: string;
  private handlers: Map<string, Map<string, JobHandler>> = new Map();
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_LOCK_DURATION_MS = 300000; // 5 minutes
  private readonly CHECK_INTERVAL_MS = 60000; // 1 minute

  constructor() {
    this.instanceId = `${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    logger.info('Job Scheduler Service initialized', { instanceId: this.instanceId });
  }

  // ============================================
  // JOB REGISTRATION
  // ============================================

  /**
   * Register a job handler
   */
  registerHandler(serviceName: string, methodName: string, handler: JobHandler): void {
    if (!this.handlers.has(serviceName)) {
      this.handlers.set(serviceName, new Map());
    }
    this.handlers.get(serviceName)!.set(methodName, handler);
    logger.debug('Registered job handler', { serviceName, methodName });
  }

  /**
   * Register a new scheduled job
   */
  async registerJob(
    jobName: string,
    cronExpression: string,
    handlerService: string,
    handlerMethod: string,
    options?: {
      description?: string;
      jobType?: string;
      config?: Record<string, any>;
      maxRetries?: number;
      priority?: number;
      tags?: string[];
      timezone?: string;
    }
  ): Promise<ScheduledJob> {
    // Validate cron expression
    if (!CronParser.isValid(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const nextRunAt = CronParser.getNextRunTime(cronExpression);

    try {
      const result = await pool.query(
        `INSERT INTO scheduled_jobs (
          job_name, job_type, description, cron_expression, timezone,
          handler_service, handler_method, config, max_retries, priority,
          tags, next_run_at, is_system_job
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
        ON CONFLICT (job_name) DO UPDATE SET
          cron_expression = EXCLUDED.cron_expression,
          handler_service = EXCLUDED.handler_service,
          handler_method = EXCLUDED.handler_method,
          config = EXCLUDED.config,
          description = COALESCE(EXCLUDED.description, scheduled_jobs.description),
          max_retries = COALESCE(EXCLUDED.max_retries, scheduled_jobs.max_retries),
          priority = COALESCE(EXCLUDED.priority, scheduled_jobs.priority),
          tags = COALESCE(EXCLUDED.tags, scheduled_jobs.tags),
          next_run_at = EXCLUDED.next_run_at,
          updated_at = now()
        RETURNING *`,
        [
          jobName,
          options?.jobType || 'custom',
          options?.description || null,
          cronExpression,
          options?.timezone || 'America/New_York',
          handlerService,
          handlerMethod,
          JSON.stringify(options?.config || {}),
          options?.maxRetries ?? 3,
          options?.priority ?? 5,
          options?.tags || [],
          nextRunAt,
        ]
      );

      logger.info('Registered scheduled job', { jobName, cronExpression, nextRunAt });
      return this.mapJob(result.rows[0]);
    } catch (error) {
      logger.error('Error registering job', { jobName, error });
      throw error;
    }
  }

  // ============================================
  // JOB CONTROL
  // ============================================

  /**
   * Manually trigger a job execution
   */
  async runJob(jobName: string, triggeredByUser?: string): Promise<JobExecution> {
    const job = await this.getJob(jobName);
    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    return this.executeJob(job, 'manual', triggeredByUser);
  }

  /**
   * Pause a job (disable future executions)
   */
  async pauseJob(jobName: string): Promise<void> {
    try {
      const result = await pool.query(
        `UPDATE scheduled_jobs SET is_active = false, updated_at = now()
         WHERE job_name = $1 RETURNING id`,
        [jobName]
      );

      if (!result.rowCount) {
        throw new Error(`Job not found: ${jobName}`);
      }

      logger.info('Paused job', { jobName });
    } catch (error) {
      logger.error('Error pausing job', { jobName, error });
      throw error;
    }
  }

  /**
   * Resume a paused job
   */
  async resumeJob(jobName: string): Promise<void> {
    try {
      // Calculate next run time
      const jobResult = await pool.query(
        `SELECT cron_expression FROM scheduled_jobs WHERE job_name = $1`,
        [jobName]
      );

      if (!jobResult.rowCount) {
        throw new Error(`Job not found: ${jobName}`);
      }

      const nextRunAt = CronParser.getNextRunTime(jobResult.rows[0].cron_expression);

      await pool.query(
        `UPDATE scheduled_jobs
         SET is_active = true, next_run_at = $1, updated_at = now()
         WHERE job_name = $2`,
        [nextRunAt, jobName]
      );

      logger.info('Resumed job', { jobName, nextRunAt });
    } catch (error) {
      logger.error('Error resuming job', { jobName, error });
      throw error;
    }
  }

  /**
   * Get job status and details
   */
  async getJobStatus(jobName: string): Promise<ScheduledJob | null> {
    return this.getJob(jobName);
  }

  /**
   * Get job execution history
   */
  async getJobHistory(
    jobName: string,
    limit: number = 20
  ): Promise<JobExecution[]> {
    try {
      const result = await pool.query(
        `SELECT je.*, sj.job_name
         FROM job_executions je
         JOIN scheduled_jobs sj ON je.job_id = sj.id
         WHERE sj.job_name = $1
         ORDER BY je.started_at DESC
         LIMIT $2`,
        [jobName, limit]
      );

      return result.rows.map(this.mapExecution);
    } catch (error) {
      logger.error('Error getting job history', { jobName, error });
      throw error;
    }
  }

  // ============================================
  // LOCKING
  // ============================================

  /**
   * Acquire a lock for a job
   */
  async acquireLock(
    jobName: string,
    lockDurationMs: number = this.DEFAULT_LOCK_DURATION_MS
  ): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT acquire_job_lock($1, $2, $3)`,
        [jobName, this.instanceId, lockDurationMs]
      );

      return result.rows[0]?.acquire_job_lock || false;
    } catch (error) {
      logger.error('Error acquiring lock', { jobName, error });
      return false;
    }
  }

  /**
   * Release a job lock
   */
  async releaseLock(jobName: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT release_job_lock($1, $2)`,
        [jobName, this.instanceId]
      );

      return result.rows[0]?.release_job_lock || false;
    } catch (error) {
      logger.error('Error releasing lock', { jobName, error });
      return false;
    }
  }

  /**
   * Extend a lock (heartbeat for long-running jobs)
   */
  async extendLock(
    jobName: string,
    extendMs: number = this.DEFAULT_LOCK_DURATION_MS
  ): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT extend_job_lock($1, $2, $3)`,
        [jobName, this.instanceId, extendMs]
      );

      return result.rows[0]?.extend_job_lock || false;
    } catch (error) {
      logger.error('Error extending lock', { jobName, error });
      return false;
    }
  }

  // ============================================
  // JOB EXECUTION
  // ============================================

  /**
   * Execute a job with error handling and retry logic
   */
  private async executeJob(
    job: ScheduledJob,
    triggeredBy: string = 'scheduler',
    triggeredByUser?: string,
    retryNumber: number = 0
  ): Promise<JobExecution> {
    const startedAt = new Date();
    let executionId: string;

    // Create execution record
    try {
      const execResult = await pool.query(
        `INSERT INTO job_executions (
          job_id, started_at, status, triggered_by, triggered_by_user, retry_number, host_name, process_id
        ) VALUES ($1, $2, 'running', $3, $4, $5, $6, $7)
        RETURNING id`,
        [job.id, startedAt, triggeredBy, triggeredByUser || null, retryNumber, os.hostname(), String(process.pid)]
      );
      executionId = execResult.rows[0].id;
    } catch (error) {
      logger.error('Failed to create execution record', { jobName: job.jobName, error });
      throw error;
    }

    // Acquire lock
    const lockAcquired = await this.acquireLock(job.jobName);
    if (!lockAcquired) {
      await this.updateExecution(executionId, {
        status: 'cancelled',
        errorMessage: 'Could not acquire lock - job may be running on another instance',
        completedAt: new Date(),
      });
      logger.warn('Could not acquire lock for job', { jobName: job.jobName });
      return this.getExecution(executionId);
    }

    // Create execution context
    const context: JobExecutionContext = {
      jobId: job.id,
      jobName: job.jobName,
      executionId,
      startedAt,
      config: job.config,
      extendLock: () => this.extendLock(job.jobName),
    };

    let status: 'success' | 'failed' | 'timeout' = 'success';
    let result: Record<string, any> = {};
    let errorMessage: string | undefined;
    let errorStack: string | undefined;

    try {
      // Get handler
      const handler = this.getHandler(job.handlerService, job.handlerMethod);
      if (!handler) {
        throw new Error(`Handler not found: ${job.handlerService}.${job.handlerMethod}`);
      }

      // Execute with timeout
      const timeoutMs = job.config.timeoutMs || 300000; // 5 minutes default
      result = await Promise.race([
        handler(job.config, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Job execution timeout')), timeoutMs)
        ),
      ]);

      logger.info('Job executed successfully', {
        jobName: job.jobName,
        executionId,
        durationMs: Date.now() - startedAt.getTime(),
      });
    } catch (error: any) {
      status = error.message === 'Job execution timeout' ? 'timeout' : 'failed';
      errorMessage = error.message;
      errorStack = error.stack;

      logger.error('Job execution failed', {
        jobName: job.jobName,
        executionId,
        error: errorMessage,
      });

      // Retry logic
      if (retryNumber < job.maxRetries && status === 'failed') {
        logger.info('Scheduling job retry', {
          jobName: job.jobName,
          retryNumber: retryNumber + 1,
          maxRetries: job.maxRetries,
        });

        setTimeout(
          () => this.executeJob(job, 'retry', triggeredByUser, retryNumber + 1),
          job.retryDelayMs
        );
      }
    } finally {
      // Release lock
      await this.releaseLock(job.jobName);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Update execution record
    await this.updateExecution(executionId, {
      status,
      result,
      errorMessage,
      errorStack,
      completedAt,
      durationMs,
    });

    // Update job statistics
    await this.updateJobStats(job.id, status, durationMs, errorMessage);

    return this.getExecution(executionId);
  }

  /**
   * Get a registered handler
   */
  private getHandler(serviceName: string, methodName: string): JobHandler | undefined {
    return this.handlers.get(serviceName)?.get(methodName);
  }

  /**
   * Update execution record
   */
  private async updateExecution(
    executionId: string,
    updates: Partial<{
      status: string;
      result: Record<string, any>;
      errorMessage: string;
      errorStack: string;
      completedAt: Date;
      durationMs: number;
    }>
  ): Promise<void> {
    try {
      await pool.query(
        `UPDATE job_executions SET
          status = COALESCE($1, status),
          result = COALESCE($2, result),
          error_message = $3,
          error_stack = $4,
          completed_at = $5,
          duration_ms = $6
         WHERE id = $7`,
        [
          updates.status,
          updates.result ? JSON.stringify(updates.result) : null,
          updates.errorMessage || null,
          updates.errorStack || null,
          updates.completedAt || null,
          updates.durationMs || null,
          executionId,
        ]
      );
    } catch (error) {
      logger.error('Error updating execution', { executionId, error });
    }
  }

  /**
   * Update job statistics after execution
   */
  private async updateJobStats(
    jobId: string,
    status: string,
    durationMs: number,
    errorMessage?: string
  ): Promise<void> {
    const nextRunAt = await this.calculateNextRunForJob(jobId);

    try {
      await pool.query(
        `UPDATE scheduled_jobs SET
          last_run_at = now(),
          last_run_status = $1,
          last_run_duration_ms = $2,
          last_error = $3,
          next_run_at = $4,
          total_runs = total_runs + 1,
          successful_runs = successful_runs + CASE WHEN $1 = 'success' THEN 1 ELSE 0 END,
          failed_runs = failed_runs + CASE WHEN $1 != 'success' THEN 1 ELSE 0 END,
          current_retry_count = CASE WHEN $1 = 'success' THEN 0 ELSE current_retry_count END,
          updated_at = now()
         WHERE id = $5`,
        [status, durationMs, errorMessage || null, nextRunAt, jobId]
      );
    } catch (error) {
      logger.error('Error updating job stats', { jobId, error });
    }
  }

  /**
   * Calculate next run time for a job
   */
  private async calculateNextRunForJob(jobId: string): Promise<Date> {
    const result = await pool.query(
      `SELECT cron_expression FROM scheduled_jobs WHERE id = $1`,
      [jobId]
    );

    if (!result.rowCount) {
      return new Date(Date.now() + 86400000); // Default to 24 hours
    }

    return CronParser.getNextRunTime(result.rows[0].cron_expression);
  }

  // ============================================
  // SCHEDULER RUNNER
  // ============================================

  /**
   * Start the job scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Job scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting job scheduler', { instanceId: this.instanceId });

    // Initial check
    this.checkAndRunDueJobs();

    // Set up interval
    this.checkInterval = setInterval(
      () => this.checkAndRunDueJobs(),
      this.CHECK_INTERVAL_MS
    );
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('Stopped job scheduler', { instanceId: this.instanceId });
  }

  /**
   * Check for and run due jobs
   */
  private async checkAndRunDueJobs(): Promise<void> {
    try {
      const result = await pool.query(`SELECT * FROM get_due_jobs(10)`);
      const dueJobs = result.rows;

      if (dueJobs.length > 0) {
        logger.debug('Found due jobs', { count: dueJobs.length });

        for (const jobRow of dueJobs) {
          const job = await this.getJob(jobRow.job_name);
          if (job) {
            // Execute asynchronously
            this.executeJob(job, 'scheduler').catch(error => {
              logger.error('Error executing scheduled job', {
                jobName: job.jobName,
                error: error.message,
              });
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error checking for due jobs', { error });
    }
  }

  // ============================================
  // MAINTENANCE METHODS
  // ============================================

  /**
   * Clean up old execution records
   */
  async cleanupExecutions(retentionDays: number = 30): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT cleanup_job_executions($1)`,
        [retentionDays]
      );

      const deleted = result.rows[0]?.cleanup_job_executions || 0;
      logger.info('Cleaned up job executions', { deleted, retentionDays });
      return deleted;
    } catch (error) {
      logger.error('Error cleaning up executions', { error });
      throw error;
    }
  }

  /**
   * Clean up expired locks
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const result = await pool.query(`SELECT cleanup_expired_locks()`);
      const deleted = result.rows[0]?.cleanup_expired_locks || 0;

      if (deleted > 0) {
        logger.info('Cleaned up expired locks', { deleted });
      }

      return deleted;
    } catch (error) {
      logger.error('Error cleaning up locks', { error });
      throw error;
    }
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get all jobs
   */
  async getAllJobs(options?: { activeOnly?: boolean; tag?: string }): Promise<ScheduledJob[]> {
    try {
      let query = `SELECT * FROM scheduled_jobs WHERE 1=1`;
      const params: any[] = [];

      if (options?.activeOnly) {
        query += ` AND is_active = true`;
      }

      if (options?.tag) {
        params.push(options.tag);
        query += ` AND $${params.length} = ANY(tags)`;
      }

      query += ` ORDER BY priority ASC, job_name ASC`;

      const result = await pool.query(query, params);
      return result.rows.map(this.mapJob);
    } catch (error) {
      logger.error('Error getting jobs', { error });
      throw error;
    }
  }

  /**
   * Get a specific job
   */
  async getJob(jobName: string): Promise<ScheduledJob | null> {
    try {
      const result = await pool.query(
        `SELECT * FROM scheduled_jobs WHERE job_name = $1`,
        [jobName]
      );

      if (!result.rowCount) {
        return null;
      }

      return this.mapJob(result.rows[0]);
    } catch (error) {
      logger.error('Error getting job', { jobName, error });
      throw error;
    }
  }

  /**
   * Get execution by ID
   */
  private async getExecution(executionId: string): Promise<JobExecution> {
    const result = await pool.query(
      `SELECT je.*, sj.job_name
       FROM job_executions je
       JOIN scheduled_jobs sj ON je.job_id = sj.id
       WHERE je.id = $1`,
      [executionId]
    );

    return this.mapExecution(result.rows[0]);
  }

  /**
   * Get recent executions
   */
  async getRecentExecutions(limit: number = 50): Promise<JobExecution[]> {
    try {
      const result = await pool.query(
        `SELECT je.*, sj.job_name
         FROM job_executions je
         JOIN scheduled_jobs sj ON je.job_id = sj.id
         ORDER BY je.started_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map(this.mapExecution);
    } catch (error) {
      logger.error('Error getting recent executions', { error });
      throw error;
    }
  }

  /**
   * Get job statistics
   */
  async getJobStatistics(jobId?: string, hours: number = 24): Promise<JobStatistics[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM get_job_statistics($1, $2)`,
        [jobId || null, hours]
      );

      return result.rows.map(row => ({
        jobId: row.job_id,
        jobName: row.job_name,
        totalExecutions: Number(row.total_executions),
        successfulExecutions: Number(row.successful_executions),
        failedExecutions: Number(row.failed_executions),
        avgDurationMs: Number(row.avg_duration_ms) || 0,
        minDurationMs: row.min_duration_ms || 0,
        maxDurationMs: row.max_duration_ms || 0,
        successRate: Number(row.success_rate) || 0,
      }));
    } catch (error) {
      logger.error('Error getting job statistics', { error });
      throw error;
    }
  }

  /**
   * Get dashboard data
   */
  async getDashboard(): Promise<{
    jobs: ScheduledJob[];
    recentExecutions: JobExecution[];
    statistics: JobStatistics[];
    runningJobs: number;
    failedLast24h: number;
  }> {
    const [jobs, recentExecutions, statistics, runningResult, failedResult] = await Promise.all([
      this.getAllJobs(),
      this.getRecentExecutions(20),
      this.getJobStatistics(undefined, 24),
      pool.query(`SELECT COUNT(*) FROM job_executions WHERE status = 'running'`),
      pool.query(
        `SELECT COUNT(*) FROM job_executions
         WHERE status = 'failed' AND started_at >= now() - interval '24 hours'`
      ),
    ]);

    return {
      jobs,
      recentExecutions,
      statistics,
      runningJobs: Number(runningResult.rows[0].count),
      failedLast24h: Number(failedResult.rows[0].count),
    };
  }

  // ============================================
  // MAPPING HELPERS
  // ============================================

  private mapJob(row: any): ScheduledJob {
    return {
      id: row.id,
      jobName: row.job_name,
      jobType: row.job_type,
      description: row.description,
      cronExpression: row.cron_expression,
      timezone: row.timezone,
      handlerService: row.handler_service,
      handlerMethod: row.handler_method,
      config: row.config || {},
      isActive: row.is_active,
      isSystemJob: row.is_system_job,
      lastRunAt: row.last_run_at,
      lastRunStatus: row.last_run_status,
      lastRunDurationMs: row.last_run_duration_ms,
      lastError: row.last_error,
      nextRunAt: row.next_run_at,
      maxRetries: row.max_retries,
      retryDelayMs: row.retry_delay_ms,
      currentRetryCount: row.current_retry_count,
      totalRuns: row.total_runs,
      successfulRuns: row.successful_runs,
      failedRuns: row.failed_runs,
      tags: row.tags || [],
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapExecution(row: any): JobExecution {
    return {
      id: row.id,
      jobId: row.job_id,
      jobName: row.job_name,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      status: row.status,
      result: row.result,
      errorMessage: row.error_message,
      errorStack: row.error_stack,
      triggeredBy: row.triggered_by,
      triggeredByUser: row.triggered_by_user,
      retryNumber: row.retry_number,
    };
  }
}

// Export singleton instance
export const jobSchedulerService = new JobSchedulerService();
