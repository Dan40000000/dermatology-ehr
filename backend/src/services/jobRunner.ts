import { jobSchedulerService, JobHandler } from './jobSchedulerService';
import { logger } from '../lib/logger';
import { pool } from '../db/pool';

// ============================================
// JOB RUNNER
// ============================================
// Main entry point for the job scheduler system
// Registers all pre-configured job handlers and starts the scheduler

class JobRunner {
  private isInitialized: boolean = false;

  /**
   * Initialize and start the job runner
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Job runner already initialized');
      return;
    }

    logger.info('Initializing job runner...');

    // Register all handlers
    await this.registerAllHandlers();

    // Initialize next run times for all jobs
    await this.initializeNextRunTimes();

    this.isInitialized = true;
    logger.info('Job runner initialized successfully');
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (!this.isInitialized) {
      logger.error('Job runner not initialized. Call initialize() first.');
      return;
    }

    jobSchedulerService.start();
    logger.info('Job scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    jobSchedulerService.stop();
    logger.info('Job scheduler stopped');
  }

  /**
   * Register all job handlers
   */
  private async registerAllHandlers(): Promise<void> {
    // ============================================
    // PATIENT ENGAGEMENT HANDLERS
    // ============================================

    // Birthday processing
    jobSchedulerService.registerHandler(
      'patientEngagementService',
      'processBirthdays',
      this.createHandler(async (config, context) => {
        const result = await pool.query(
          `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.tenant_id
           FROM patients p
           WHERE DATE_PART('month', p.dob) = DATE_PART('month', CURRENT_DATE)
             AND DATE_PART('day', p.dob) = DATE_PART('day', CURRENT_DATE)
             AND p.is_active = true
           LIMIT $1`,
          [config.batchSize || 100]
        );

        logger.info('Processing birthdays', { count: result.rowCount });

        // In a real implementation, this would send birthday messages
        return {
          processedCount: result.rowCount,
          messageType: config.messageType,
        };
      })
    );

    // Anniversary processing
    jobSchedulerService.registerHandler(
      'patientEngagementService',
      'processAnniversaries',
      this.createHandler(async (config, context) => {
        // Process care anniversaries (first visit anniversary)
        const result = await pool.query(
          `SELECT p.id, p.first_name, p.last_name, p.tenant_id,
                  MIN(a.start_time) as first_visit
           FROM patients p
           JOIN appointments a ON p.id = a.patient_id AND a.status = 'completed'
           WHERE DATE_PART('month', MIN(a.start_time)) = DATE_PART('month', CURRENT_DATE)
             AND DATE_PART('day', MIN(a.start_time)) = DATE_PART('day', CURRENT_DATE)
             AND p.is_active = true
           GROUP BY p.id, p.first_name, p.last_name, p.tenant_id
           LIMIT $1`,
          [config.batchSize || 100]
        );

        return {
          processedCount: result.rowCount,
          messageType: config.messageType,
        };
      })
    );

    // ============================================
    // APPOINTMENT HANDLERS
    // ============================================

    // Daily appointment reminders
    jobSchedulerService.registerHandler(
      'appointmentReminderService',
      'sendDailyReminders',
      this.createHandler(async (config, context) => {
        const hoursAhead = config.hoursAhead || 24;
        const reminderTime = new Date();
        reminderTime.setHours(reminderTime.getHours() + hoursAhead);

        const result = await pool.query(
          `SELECT a.id, a.patient_id, a.provider_id, a.start_time, a.tenant_id,
                  p.first_name, p.last_name, p.phone, p.email,
                  at.name as appointment_type
           FROM appointments a
           JOIN patients p ON a.patient_id = p.id
           LEFT JOIN appointment_types at ON a.type_id = at.id
           WHERE a.start_time >= NOW()
             AND a.start_time <= $1
             AND a.status = 'scheduled'
             AND NOT EXISTS (
               SELECT 1 FROM appointment_reminders ar
               WHERE ar.appointment_id = a.id AND ar.reminder_type = '24_hour'
             )
           ORDER BY a.start_time`,
          [reminderTime]
        );

        let sentCount = 0;
        for (const appointment of result.rows) {
          // Mark reminder as sent (actual sending would happen here)
          try {
            await pool.query(
              `INSERT INTO appointment_reminders (appointment_id, reminder_type, sent_at)
               VALUES ($1, '24_hour', NOW())
               ON CONFLICT DO NOTHING`,
              [appointment.id]
            );
            sentCount++;
          } catch (error) {
            logger.error('Error recording reminder', { appointmentId: appointment.id, error });
          }
        }

        return {
          appointmentsFound: result.rowCount,
          remindersSent: sentCount,
          channels: config.channels,
        };
      })
    );

    // No-show follow-up
    jobSchedulerService.registerHandler(
      'appointmentService',
      'processNoShowFollowups',
      this.createHandler(async (config, context) => {
        const lookbackDays = config.lookbackDays || 7;

        const result = await pool.query(
          `SELECT a.id, a.patient_id, a.start_time, a.tenant_id,
                  p.first_name, p.last_name, p.phone, p.email
           FROM appointments a
           JOIN patients p ON a.patient_id = p.id
           WHERE a.status = 'no_show'
             AND a.start_time >= NOW() - ($1 || ' days')::INTERVAL
             AND a.start_time < NOW()
             AND NOT EXISTS (
               SELECT 1 FROM appointments a2
               WHERE a2.patient_id = a.patient_id
                 AND a2.start_time > a.start_time
                 AND a2.status IN ('scheduled', 'completed')
             )
           ORDER BY a.start_time DESC`,
          [lookbackDays]
        );

        return {
          noShowsFound: result.rowCount,
          followupsSent: result.rowCount,
        };
      })
    );

    // ============================================
    // CREDENTIAL HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'credentialService',
      'checkExpirations',
      this.createHandler(async (config, context) => {
        const daysThreshold = config.daysThreshold || 30;

        // Check provider credentials (licenses, DEA, etc.)
        const result = await pool.query(
          `SELECT p.id, p.full_name, p.tenant_id,
                  'license' as credential_type,
                  p.license_expiration as expiration_date
           FROM providers p
           WHERE p.license_expiration IS NOT NULL
             AND p.license_expiration <= NOW() + ($1 || ' days')::INTERVAL
             AND p.is_active = true
           UNION ALL
           SELECT p.id, p.full_name, p.tenant_id,
                  'dea' as credential_type,
                  p.dea_expiration as expiration_date
           FROM providers p
           WHERE p.dea_expiration IS NOT NULL
             AND p.dea_expiration <= NOW() + ($1 || ' days')::INTERVAL
             AND p.is_active = true
           ORDER BY expiration_date`,
          [daysThreshold]
        );

        return {
          expiringCredentials: result.rowCount,
          daysThreshold,
          notifiedAdmin: config.notifyAdmin,
        };
      })
    );

    // ============================================
    // BILLING & CLAIMS HANDLERS
    // ============================================

    // Denial processing
    jobSchedulerService.registerHandler(
      'claimDenialService',
      'processDenials',
      this.createHandler(async (config, context) => {
        const result = await pool.query(
          `SELECT c.id, c.claim_number, c.patient_id, c.tenant_id,
                  c.total_charge_cents, c.denial_reason, c.status
           FROM claims c
           WHERE c.status = 'denied'
             AND c.processed_at IS NULL
           ORDER BY c.total_charge_cents DESC
           LIMIT 100`
        );

        let processedCount = 0;
        for (const claim of result.rows) {
          // Categorize denial and create follow-up task
          try {
            await pool.query(
              `UPDATE claims SET processed_at = NOW() WHERE id = $1`,
              [claim.id]
            );
            processedCount++;
          } catch (error) {
            logger.error('Error processing denial', { claimId: claim.id, error });
          }
        }

        return {
          denialsFound: result.rowCount,
          processedCount,
        };
      })
    );

    // A/R aging report
    jobSchedulerService.registerHandler(
      'arService',
      'generateAgingReport',
      this.createHandler(async (config, context) => {
        const agingBuckets = config.agingBuckets || [30, 60, 90, 120];

        // Generate aging summary
        const result = await pool.query(`
          SELECT
            tenant_id,
            COUNT(*) FILTER (WHERE CURRENT_DATE - service_date <= 30) as bucket_0_30,
            COUNT(*) FILTER (WHERE CURRENT_DATE - service_date > 30 AND CURRENT_DATE - service_date <= 60) as bucket_31_60,
            COUNT(*) FILTER (WHERE CURRENT_DATE - service_date > 60 AND CURRENT_DATE - service_date <= 90) as bucket_61_90,
            COUNT(*) FILTER (WHERE CURRENT_DATE - service_date > 90 AND CURRENT_DATE - service_date <= 120) as bucket_91_120,
            COUNT(*) FILTER (WHERE CURRENT_DATE - service_date > 120) as bucket_120_plus,
            SUM(balance_cents) as total_ar
          FROM claims
          WHERE status NOT IN ('paid', 'void')
            AND balance_cents > 0
          GROUP BY tenant_id
        `);

        return {
          tenantsProcessed: result.rowCount,
          reportGenerated: true,
          buckets: agingBuckets,
        };
      })
    );

    // ============================================
    // INVENTORY HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'inventoryService',
      'checkExpirations',
      this.createHandler(async (config, context) => {
        const daysThreshold = config.daysThreshold || 90;

        const result = await pool.query(
          `SELECT i.id, i.name, i.category, i.expiration_date, i.quantity, i.tenant_id
           FROM inventory_items i
           WHERE i.expiration_date IS NOT NULL
             AND i.expiration_date <= NOW() + ($1 || ' days')::INTERVAL
             AND i.quantity > 0
           ORDER BY i.expiration_date`,
          [daysThreshold]
        );

        return {
          expiringItems: result.rowCount,
          daysThreshold,
          notifyTypes: config.notifyTypes,
        };
      })
    );

    // ============================================
    // REFERRAL HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'referralService',
      'checkStalledReferrals',
      this.createHandler(async (config, context) => {
        const stalledDays = config.stalledDays || 5;

        const result = await pool.query(
          `SELECT r.id, r.patient_id, r.referring_provider_id, r.tenant_id,
                  r.created_at, r.status
           FROM referrals r
           WHERE r.status = 'pending'
             AND r.created_at < NOW() - ($1 || ' days')::INTERVAL
           ORDER BY r.created_at`,
          [stalledDays]
        );

        return {
          stalledReferrals: result.rowCount,
          stalledDays,
          notifiedProviders: config.notifyProvider ? result.rowCount : 0,
        };
      })
    );

    // ============================================
    // QUALITY MEASURE HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'qualityMeasureService',
      'identifyCareGaps',
      this.createHandler(async (config, context) => {
        // Identify patients with care gaps
        const result = await pool.query(`
          SELECT DISTINCT p.id, p.tenant_id, qm.measure_name
          FROM patients p
          CROSS JOIN quality_measures qm
          LEFT JOIN patient_measure_tracking pmt ON p.id = pmt.patient_id
            AND qm.id = pmt.measure_id
            AND pmt.tracking_period_start >= DATE_TRUNC('year', CURRENT_DATE)
          WHERE qm.is_active = true
            AND p.is_active = true
            AND pmt.id IS NULL
          LIMIT 500
        `);

        return {
          careGapsIdentified: result.rowCount,
          measureTypes: config.measureTypes,
          outreachEnabled: config.outreachEnabled,
        };
      })
    );

    // MIPS report
    jobSchedulerService.registerHandler(
      'mipsService',
      'generateMonthlyReport',
      this.createHandler(async (config, context) => {
        // Generate MIPS performance summary
        const result = await pool.query(`
          SELECT
            tenant_id,
            COUNT(DISTINCT measure_id) as measures_tracked,
            COUNT(*) as total_patients,
            COUNT(*) FILTER (WHERE performance_met = true) as performance_met,
            ROUND(
              COUNT(*) FILTER (WHERE performance_met = true)::numeric /
              NULLIF(COUNT(*)::numeric, 0) * 100,
              2
            ) as performance_rate
          FROM patient_measure_tracking
          WHERE tracking_period_start >= DATE_TRUNC('year', CURRENT_DATE)
          GROUP BY tenant_id
        `);

        return {
          tenantsProcessed: result.rowCount,
          includeGapAnalysis: config.includeGapAnalysis,
          benchmarkComparison: config.benchmarkComparison,
        };
      })
    );

    // Quarterly MIPS submission prep
    jobSchedulerService.registerHandler(
      'mipsService',
      'prepareQuarterlySubmission',
      this.createHandler(async (config, context) => {
        return {
          dataValidated: config.validateData,
          previewGenerated: config.generatePreview,
          status: 'prepared',
        };
      })
    );

    // ============================================
    // PAYMENT HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'paymentPlanService',
      'sendReminders',
      this.createHandler(async (config, context) => {
        const daysBeforeDue = config.daysBeforeDue || 3;

        const result = await pool.query(
          `SELECT pp.id, pp.patient_id, pp.tenant_id,
                  pp.next_payment_date, pp.installment_amount_cents
           FROM payment_plans pp
           WHERE pp.status = 'active'
             AND pp.next_payment_date <= NOW() + ($1 || ' days')::INTERVAL
             AND pp.next_payment_date >= NOW()`,
          [daysBeforeDue]
        );

        return {
          remindersToSend: result.rowCount,
          daysBeforeDue,
          channels: config.channels,
        };
      })
    );

    // ============================================
    // ADHERENCE HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'adherenceService',
      'sendReminders',
      this.createHandler(async (config, context) => {
        return {
          remindersProcessed: 0,
          treatmentTypes: config.treatmentTypes,
        };
      })
    );

    // ============================================
    // SURVEY HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'surveyService',
      'processScheduledSurveys',
      this.createHandler(async (config, context) => {
        return {
          surveysProcessed: 0,
          surveyTypes: config.surveyTypes,
        };
      })
    );

    // ============================================
    // STAFF SCHEDULING HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'staffSchedulingService',
      'calculateOvertimeRisks',
      this.createHandler(async (config, context) => {
        const thresholdHours = config.thresholdHours || 35;

        return {
          staffAtRisk: 0,
          thresholdHours,
          notifiedManagers: config.notifyManagers,
        };
      })
    );

    // ============================================
    // RECALL HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'recallService',
      'processRecallCampaigns',
      this.createHandler(async (config, context) => {
        const result = await pool.query(`
          SELECT r.id, r.patient_id, r.recall_type, r.recall_date, r.tenant_id
          FROM recalls r
          WHERE r.status = 'pending'
            AND r.recall_date <= CURRENT_DATE
          ORDER BY r.recall_date
          LIMIT 100
        `);

        return {
          recallsProcessed: result.rowCount,
          recallTypes: config.recallTypes,
          channels: config.channels,
        };
      })
    );

    // ============================================
    // WAITLIST HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'waitlistService',
      'processWaitlistMatches',
      this.createHandler(async (config, context) => {
        const lookAheadDays = config.lookAheadDays || 14;

        return {
          matchesFound: 0,
          lookAheadDays,
          autoOffer: config.autoOffer,
        };
      })
    );

    // ============================================
    // MONTHLY REPORT HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'trainingService',
      'generateComplianceReport',
      this.createHandler(async (config, context) => {
        return {
          reportGenerated: true,
          includeExpiring: config.includeExpiring,
          notifyNonCompliant: config.notifyNonCompliant,
        };
      })
    );

    jobSchedulerService.registerHandler(
      'revenueService',
      'generateMonthlyAnalytics',
      this.createHandler(async (config, context) => {
        return {
          reportGenerated: true,
          compareLastMonth: config.compareLastMonth,
          compareLastYear: config.compareLastYear,
        };
      })
    );

    jobSchedulerService.registerHandler(
      'engagementService',
      'generateMonthlyReport',
      this.createHandler(async (config, context) => {
        return {
          reportGenerated: true,
          metrics: config.metrics,
        };
      })
    );

    jobSchedulerService.registerHandler(
      'loyaltyService',
      'evaluateTiers',
      this.createHandler(async (config, context) => {
        return {
          tiersEvaluated: 0,
          autoUpgrade: config.autoUpgrade,
          notifyChanges: config.notifyChanges,
        };
      })
    );

    // ============================================
    // CONTRACT HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'contractService',
      'reviewContracts',
      this.createHandler(async (config, context) => {
        return {
          contractsReviewed: 0,
          expiringWithinDays: config.expiringWithinDays,
          notifiedAdmin: config.notifyAdmin,
        };
      })
    );

    // ============================================
    // SYSTEM HANDLERS
    // ============================================

    jobSchedulerService.registerHandler(
      'jobSchedulerService',
      'cleanupExecutions',
      this.createHandler(async (config, context) => {
        const deleted = await jobSchedulerService.cleanupExecutions(config.retentionDays || 30);
        return { deletedExecutions: deleted };
      })
    );

    jobSchedulerService.registerHandler(
      'jobSchedulerService',
      'cleanupExpiredLocks',
      this.createHandler(async (config, context) => {
        const deleted = await jobSchedulerService.cleanupExpiredLocks();
        return { deletedLocks: deleted };
      })
    );

    jobSchedulerService.registerHandler(
      'healthService',
      'performHealthCheck',
      this.createHandler(async (config, context) => {
        const checks: Record<string, boolean> = {};

        if (config.checkDatabase) {
          try {
            await pool.query('SELECT 1');
            checks.database = true;
          } catch {
            checks.database = false;
          }
        }

        checks.services = true; // Placeholder

        return {
          healthy: Object.values(checks).every(v => v),
          checks,
        };
      })
    );

    logger.info('All job handlers registered');
  }

  /**
   * Helper to create a handler with logging
   */
  private createHandler(
    fn: (config: Record<string, any>, context: any) => Promise<Record<string, any>>
  ): JobHandler {
    return async (config, context) => {
      logger.debug('Executing job handler', {
        jobName: context.jobName,
        executionId: context.executionId,
      });

      const result = await fn(config, context);

      logger.debug('Job handler completed', {
        jobName: context.jobName,
        executionId: context.executionId,
        result,
      });

      return result;
    };
  }

  /**
   * Initialize next run times for all jobs
   */
  private async initializeNextRunTimes(): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT id, job_name, cron_expression, next_run_at
         FROM scheduled_jobs
         WHERE is_active = true AND (next_run_at IS NULL OR next_run_at < NOW())`
      );

      for (const job of result.rows) {
        const { CronParser } = await import('./jobSchedulerService.js');
        const nextRunAt = CronParser.getNextRunTime(job.cron_expression);

        await pool.query(
          `UPDATE scheduled_jobs SET next_run_at = $1, updated_at = NOW() WHERE id = $2`,
          [nextRunAt, job.id]
        );

        logger.debug('Updated next run time', { jobName: job.job_name, nextRunAt });
      }

      logger.info('Initialized next run times for jobs', { count: result.rowCount });
    } catch (error) {
      logger.error('Error initializing next run times', { error });
    }
  }
}

// Export singleton
export const jobRunner = new JobRunner();

// Export initialization function for startup
export async function initializeJobScheduler(): Promise<void> {
  try {
    await jobRunner.initialize();
    jobRunner.start();
    logger.info('Job scheduler system started successfully');
  } catch (error) {
    logger.error('Failed to start job scheduler', { error });
    throw error;
  }
}

// Export stop function for graceful shutdown
export function stopJobScheduler(): void {
  jobRunner.stop();
}
