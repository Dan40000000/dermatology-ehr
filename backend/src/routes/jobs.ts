import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { jobSchedulerService, CronParser } from '../services/jobSchedulerService';
import { logger } from '../lib/logger';

const router = Router();

// All job routes require authentication
router.use(requireAuth);

// ============================================
// JOB LISTING & DETAILS
// ============================================

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List all scheduled jobs
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *         description: Filter to only active jobs
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter by tag
 *     responses:
 *       200:
 *         description: List of scheduled jobs
 */
router.get('/', async (req: AuthedRequest, res) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const tag = req.query.tag as string | undefined;

    const jobs = await jobSchedulerService.getAllJobs({ activeOnly, tag });

    // Add cron description to each job
    const jobsWithDescription = jobs.map(job => ({
      ...job,
      cronDescription: CronParser.describe(job.cronExpression),
      successRate: job.totalRuns > 0
        ? Math.round((job.successfulRuns / job.totalRuns) * 100)
        : null,
    }));

    res.json({
      jobs: jobsWithDescription,
      total: jobsWithDescription.length,
    });
  } catch (error: any) {
    logger.error('Error listing jobs', { error: error.message });
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/**
 * @swagger
 * /api/jobs/dashboard:
 *   get:
 *     summary: Get job scheduler dashboard data
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data including jobs, executions, and statistics
 */
router.get('/dashboard', requireRoles(['admin', 'manager']), async (req: AuthedRequest, res) => {
  try {
    const dashboard = await jobSchedulerService.getDashboard();

    // Add additional computed fields
    const enhancedJobs = dashboard.jobs.map(job => ({
      ...job,
      cronDescription: CronParser.describe(job.cronExpression),
      isOverdue: job.nextRunAt && new Date(job.nextRunAt) < new Date(),
    }));

    res.json({
      ...dashboard,
      jobs: enhancedJobs,
      summary: {
        totalJobs: dashboard.jobs.length,
        activeJobs: dashboard.jobs.filter(j => j.isActive).length,
        runningJobs: dashboard.runningJobs,
        failedLast24h: dashboard.failedLast24h,
      },
    });
  } catch (error: any) {
    logger.error('Error getting job dashboard', { error: error.message });
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

/**
 * @swagger
 * /api/jobs/executions:
 *   get:
 *     summary: Get recent job executions
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of executions to return
 *     responses:
 *       200:
 *         description: List of recent job executions
 */
router.get('/executions', async (req: AuthedRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const executions = await jobSchedulerService.getRecentExecutions(limit);

    res.json({
      executions,
      total: executions.length,
    });
  } catch (error: any) {
    logger.error('Error getting executions', { error: error.message });
    res.status(500).json({ error: 'Failed to get executions' });
  }
});

/**
 * @swagger
 * /api/jobs/statistics:
 *   get:
 *     summary: Get job execution statistics
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *         description: Time window in hours
 *     responses:
 *       200:
 *         description: Job statistics
 */
router.get('/statistics', async (req: AuthedRequest, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const statistics = await jobSchedulerService.getJobStatistics(undefined, hours);

    res.json({
      statistics,
      timeWindowHours: hours,
    });
  } catch (error: any) {
    logger.error('Error getting statistics', { error: error.message });
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * @swagger
 * /api/jobs/{name}:
 *   get:
 *     summary: Get job details and history
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Job name
 *       - in: query
 *         name: historyLimit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of history entries
 *     responses:
 *       200:
 *         description: Job details with execution history
 *       404:
 *         description: Job not found
 */
router.get('/:name', async (req: AuthedRequest, res) => {
  try {
    const name = req.params.name as string;
    const historyLimit = Math.min(parseInt(req.query.historyLimit as string) || 20, 100);

    const job = await jobSchedulerService.getJobStatus(name);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const history = await jobSchedulerService.getJobHistory(name, historyLimit);
    const statistics = await jobSchedulerService.getJobStatistics(job.id, 168); // 7 days

    res.json({
      job: {
        ...job,
        cronDescription: CronParser.describe(job.cronExpression),
        successRate: job.totalRuns > 0
          ? Math.round((job.successfulRuns / job.totalRuns) * 100)
          : null,
      },
      history,
      statistics: statistics[0] || null,
    });
  } catch (error: any) {
    logger.error('Error getting job details', { jobName: req.params.name, error: error.message });
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

// ============================================
// JOB CONTROL
// ============================================

/**
 * @swagger
 * /api/jobs/{name}/run:
 *   post:
 *     summary: Manually trigger a job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Job name
 *     responses:
 *       200:
 *         description: Job execution started
 *       404:
 *         description: Job not found
 */
router.post('/:name/run', requireRoles(['admin', 'manager']), async (req: AuthedRequest, res) => {
  try {
    const name = req.params.name as string;
    const userId = req.user?.id || 'system';

    logger.info('Manual job trigger requested', { jobName: name, userId });

    const execution = await jobSchedulerService.runJob(name, userId);

    res.json({
      message: 'Job execution started',
      execution,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error triggering job', { jobName: req.params.name, error: error.message });
    res.status(500).json({ error: 'Failed to trigger job' });
  }
});

/**
 * @swagger
 * /api/jobs/{name}/pause:
 *   post:
 *     summary: Pause a scheduled job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Job name
 *     responses:
 *       200:
 *         description: Job paused successfully
 *       404:
 *         description: Job not found
 */
router.post('/:name/pause', requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const name = req.params.name as string;

    logger.info('Job pause requested', { jobName: name, userId: req.user?.id });

    await jobSchedulerService.pauseJob(name);

    res.json({
      message: 'Job paused successfully',
      jobName: name,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error pausing job', { jobName: req.params.name, error: error.message });
    res.status(500).json({ error: 'Failed to pause job' });
  }
});

/**
 * @swagger
 * /api/jobs/{name}/resume:
 *   post:
 *     summary: Resume a paused job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Job name
 *     responses:
 *       200:
 *         description: Job resumed successfully
 *       404:
 *         description: Job not found
 */
router.post('/:name/resume', requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const name = req.params.name as string;

    logger.info('Job resume requested', { jobName: name, userId: req.user?.id });

    await jobSchedulerService.resumeJob(name);

    res.json({
      message: 'Job resumed successfully',
      jobName: name,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error resuming job', { jobName: req.params.name, error: error.message });
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

// ============================================
// JOB REGISTRATION (Admin only)
// ============================================

/**
 * @swagger
 * /api/jobs:
 *   post:
 *     summary: Register a new scheduled job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jobName
 *               - cronExpression
 *               - handlerService
 *               - handlerMethod
 *             properties:
 *               jobName:
 *                 type: string
 *               cronExpression:
 *                 type: string
 *               handlerService:
 *                 type: string
 *               handlerMethod:
 *                 type: string
 *               description:
 *                 type: string
 *               jobType:
 *                 type: string
 *               config:
 *                 type: object
 *               maxRetries:
 *                 type: integer
 *               priority:
 *                 type: integer
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Job registered successfully
 *       400:
 *         description: Invalid job configuration
 */
router.post('/', requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const {
      jobName,
      cronExpression,
      handlerService,
      handlerMethod,
      description,
      jobType,
      config,
      maxRetries,
      priority,
      tags,
      timezone,
    } = req.body;

    // Validate required fields
    if (!jobName || !cronExpression || !handlerService || !handlerMethod) {
      return res.status(400).json({
        error: 'Missing required fields: jobName, cronExpression, handlerService, handlerMethod',
      });
    }

    // Validate cron expression
    if (!CronParser.isValid(cronExpression)) {
      return res.status(400).json({
        error: 'Invalid cron expression',
        cronExpression,
      });
    }

    logger.info('Job registration requested', { jobName, userId: req.user?.id });

    const job = await jobSchedulerService.registerJob(
      jobName,
      cronExpression,
      handlerService,
      handlerMethod,
      { description, jobType, config, maxRetries, priority, tags, timezone }
    );

    res.status(201).json({
      message: 'Job registered successfully',
      job: {
        ...job,
        cronDescription: CronParser.describe(job.cronExpression),
      },
    });
  } catch (error: any) {
    logger.error('Error registering job', { error: error.message });
    res.status(500).json({ error: 'Failed to register job' });
  }
});

// ============================================
// CRON UTILITIES
// ============================================

/**
 * @swagger
 * /api/jobs/cron/validate:
 *   post:
 *     summary: Validate a cron expression
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expression
 *             properties:
 *               expression:
 *                 type: string
 *     responses:
 *       200:
 *         description: Validation result with description and next run times
 */
router.post('/cron/validate', async (req: AuthedRequest, res) => {
  try {
    const { expression } = req.body;

    if (!expression) {
      return res.status(400).json({ error: 'Expression is required' });
    }

    const isValid = CronParser.isValid(expression);

    if (!isValid) {
      return res.json({
        valid: false,
        error: 'Invalid cron expression format. Expected: minute hour dayOfMonth month dayOfWeek',
      });
    }

    // Calculate next few run times
    const nextRuns: Date[] = [];
    let fromDate = new Date();
    for (let i = 0; i < 5; i++) {
      const nextRun = CronParser.getNextRunTime(expression, fromDate);
      nextRuns.push(nextRun);
      fromDate = nextRun;
    }

    res.json({
      valid: true,
      description: CronParser.describe(expression),
      nextRuns,
    });
  } catch (error: any) {
    res.json({
      valid: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/jobs/cron/examples:
 *   get:
 *     summary: Get common cron expression examples
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of cron expression examples
 */
router.get('/cron/examples', async (_req: AuthedRequest, res) => {
  const examples = [
    { expression: '0 6 * * *', description: 'Every day at 6:00 AM' },
    { expression: '0 7 * * 1-5', description: 'Weekdays at 7:00 AM' },
    { expression: '0 8 * * 1', description: 'Every Monday at 8:00 AM' },
    { expression: '0 9 1 * *', description: '1st of every month at 9:00 AM' },
    { expression: '0 8 1 1,4,7,10 *', description: 'First day of each quarter at 8:00 AM' },
    { expression: '*/15 * * * *', description: 'Every 15 minutes' },
    { expression: '0 */2 * * *', description: 'Every 2 hours' },
    { expression: '0 18 * * *', description: 'Every day at 6:00 PM' },
    { expression: '30 5 * * *', description: 'Every day at 5:30 AM' },
    { expression: '0 0 * * 0', description: 'Every Sunday at midnight' },
  ];

  res.json({ examples });
});

export const jobsRouter = router;
