import express, { type Request, type Response } from 'express';
import { metricsService, type MetricEvent } from '../services/metricsService';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { pool } from '../db/pool';
import { userHasRole } from '../lib/roles';
import { logger } from '../lib/logger';

const router = express.Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function logMetricsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// ================================================
// MIDDLEWARE
// ================================================

// All metrics routes require authentication
router.use(requireAuth);

// ================================================
// POST /api/metrics/events
// ================================================
// Log metric events from the frontend

router.post('/events', async (req: Request, res: Response) => {
  try {
    const { sessionId, events } = req.body;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Events array is required' });
    }

    // Transform and validate events
    const metricEvents: MetricEvent[] = events.map((event: unknown) => {
      const e = event as Record<string, unknown>;

      return {
        tenantId,
        userId: e.userId as string,
        sessionId: sessionId as string,
        eventType: e.eventType as MetricEvent['eventType'],
        eventTarget: e.eventTarget as string | undefined,
        eventValue: e.eventValue as string | undefined,
        eventMetadata: e.eventMetadata as Record<string, unknown> | undefined,
        timestamp: new Date(e.timestamp as string),
        durationMs: e.durationMs as number | undefined,
        page: e.page as string | undefined,
        patientId: e.patientId as string | undefined,
        encounterId: e.encounterId as string | undefined,
        deviceType: e.deviceType as string | undefined,
        browser: e.browser as string | undefined,
      };
    });

    // Log events
    await metricsService.logEvents(metricEvents);

    // Process encounter completion events
    const encounterEndEvents = metricEvents.filter(
      (e) => e.eventType === 'task_end' && e.eventTarget === 'encounter' && e.encounterId
    );

    // Calculate and save encounter metrics for completed encounters
    for (const event of encounterEndEvents) {
      if (event.encounterId) {
        try {
          const metrics = await metricsService.calculateEncounterMetrics(
            event.encounterId,
            tenantId
          );

          if (metrics) {
            await metricsService.saveEncounterMetrics(metrics);
          }
        } catch (error) {
          logMetricsError(`Failed to process encounter ${event.encounterId}:`, error);
          // Continue processing other events
        }
      }
    }

    res.json({ success: true, eventsLogged: events.length });
  } catch (error) {
    logMetricsError('Error logging metrics:', error);
    res.status(500).json({ error: 'Failed to log metrics' });
  }
});

// ================================================
// GET /api/metrics/summary
// ================================================
// Get summary statistics for the specified period

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const period = (req.query.period as string) || '30d';

    const summary = await metricsService.getSummary(tenantId, period);

    res.json(summary);
  } catch (error) {
    logMetricsError('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ================================================
// GET /api/metrics/providers
// ================================================
// Get provider comparison metrics

router.get('/providers', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const period = (req.query.period as string) || '30d';

    const providers = await metricsService.getProviderMetrics(tenantId, period);

    res.json(providers);
  } catch (error) {
    logMetricsError('Error fetching provider metrics:', error);
    res.status(500).json({ error: 'Failed to fetch provider metrics' });
  }
});

// ================================================
// GET /api/metrics/trends
// ================================================
// Get efficiency trends over time

router.get('/trends', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const period = (req.query.period as string) || '30d';

    const trends = await metricsService.getTrends(tenantId, period);

    res.json(trends);
  } catch (error) {
    logMetricsError('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// ================================================
// GET /api/metrics/features
// ================================================
// Get feature usage statistics

router.get('/features', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const period = (req.query.period as string) || '30d';

    const features = await metricsService.getFeatureUsage(tenantId, period);

    res.json(features);
  } catch (error) {
    logMetricsError('Error fetching feature usage:', error);
    res.status(500).json({ error: 'Failed to fetch feature usage' });
  }
});

// ================================================
// GET /api/metrics/encounters/:encounterId/summary
// ================================================
// Get detailed summary for a completed encounter

router.get('/encounters/:encounterId/summary', async (req: AuthedRequest, res: Response) => {
  try {
    const { encounterId } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get encounter metrics
    const { rows } = await pool.query(
      `SELECT
        em.*,
        (SELECT AVG(total_duration_seconds)::integer
         FROM encounter_metrics
         WHERE provider_id = em.provider_id
           AND tenant_id = em.tenant_id
           AND created_at > NOW() - INTERVAL '30 days') as user_avg_duration,
        (SELECT AVG(click_count)::integer
         FROM encounter_metrics
         WHERE provider_id = em.provider_id
           AND tenant_id = em.tenant_id
           AND created_at > NOW() - INTERVAL '30 days') as user_avg_clicks,
        (SELECT COUNT(*)
         FROM encounter_metrics
         WHERE provider_id = em.provider_id
           AND tenant_id = em.tenant_id
           AND DATE(created_at) = CURRENT_DATE) as encounters_today,
        (SELECT SUM(time_saved_seconds)::integer
         FROM encounter_metrics
         WHERE provider_id = em.provider_id
           AND tenant_id = em.tenant_id
           AND DATE(created_at) = CURRENT_DATE) as time_saved_today
      FROM encounter_metrics em
      WHERE em.encounter_id = $1 AND em.tenant_id = $2`,
      [encounterId, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Encounter metrics not found' });
    }

    const metrics = rows[0];

    // Get benchmark data
    const benchmarkResult = await pool.query(
      `SELECT
        target_duration_seconds, average_duration_seconds,
        industry_average_duration_seconds
      FROM efficiency_benchmarks
      WHERE (tenant_id = $1 OR tenant_id IS NULL)
        AND encounter_type = $2
        AND is_new_patient = $3
        AND is_active = TRUE
      ORDER BY tenant_id NULLS LAST
      LIMIT 1`,
      [tenantId, metrics.encounter_type || 'follow-up', metrics.is_new_patient]
    );

    const benchmark = benchmarkResult.rows[0] || {
      target_duration_seconds: 180,
      average_duration_seconds: 195,
      industry_average_duration_seconds: 270,
    };

    // Get any achievements earned
    const achievementsResult = await pool.query(
      `SELECT
        achievement_type as type,
        achievement_name as name,
        achievement_description as description,
        achievement_icon as icon,
        achievement_tier as tier
      FROM efficiency_achievements
      WHERE user_id = $1
        AND tenant_id = $2
        AND DATE(earned_at) = CURRENT_DATE
      ORDER BY earned_at DESC
      LIMIT 3`,
      [metrics.provider_id, tenantId]
    );

    // Build response
    const summary = {
      encounterId: metrics.encounter_id,
      totalDuration: metrics.total_duration_seconds,
      clickCount: metrics.click_count,
      navigationCount: metrics.navigation_count,
      pageViews: metrics.page_views,

      // Averages
      userAverageDuration: metrics.user_avg_duration || 195,
      userAverageClicks: metrics.user_avg_clicks || 18,

      // Benchmarks
      industryAverageDuration: benchmark.industry_average_duration_seconds,
      targetDuration: benchmark.target_duration_seconds,

      // Savings
      timeSavedVsAverage: (metrics.user_avg_duration || 195) - metrics.total_duration_seconds,
      timeSavedVsIndustry: benchmark.industry_average_duration_seconds - metrics.total_duration_seconds,

      // Today's stats
      encountersToday: metrics.encounters_today || 0,
      totalTimeSavedToday: metrics.time_saved_today || 0,

      // Performance
      efficiencyScore: Math.round(metrics.efficiency_score || 0),
      efficiencyRank: metrics.efficiency_rank || 0,

      // Achievements
      achievementsEarned: achievementsResult.rows,
    };

    res.json(summary);
  } catch (error) {
    logMetricsError('Error fetching encounter summary:', error);
    res.status(500).json({ error: 'Failed to fetch encounter summary' });
  }
});

// ================================================
// GET /api/metrics/user/:userId
// ================================================
// Get metrics for a specific user

router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string;
    const period = (req.query.period as string) || '30d';

    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };
    const days = daysMap[period] || 30;

    const { rows } = await pool.query(
      `SELECT
        COUNT(*) as encounters_completed,
        AVG(total_duration_seconds)::integer as avg_duration,
        AVG(click_count)::numeric(5,1) as avg_clicks,
        AVG(efficiency_score)::numeric(5,2) as avg_efficiency_score,
        SUM(time_saved_seconds)::integer as total_time_saved,
        MIN(total_duration_seconds)::integer as fastest_encounter
      FROM encounter_metrics
      WHERE provider_id = $1
        AND tenant_id = $2
        AND created_at > NOW() - INTERVAL '${days} days'
        AND encounter_completed_at IS NOT NULL`,
      [userId, tenantId]
    );

    res.json(rows[0] || {});
  } catch (error) {
    logMetricsError('Error fetching user metrics:', error);
    res.status(500).json({ error: 'Failed to fetch user metrics' });
  }
});

// ================================================
// GET /api/metrics/achievements/:userId
// ================================================
// Get achievements for a user

router.get('/achievements/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string;

    const { rows } = await pool.query(
      `SELECT
        achievement_type as type,
        achievement_name as name,
        achievement_description as description,
        achievement_icon as icon,
        achievement_tier as tier,
        achievement_value as value,
        earned_at as "earnedAt"
      FROM efficiency_achievements
      WHERE user_id = $1
        AND tenant_id = $2
        AND is_displayed = TRUE
      ORDER BY earned_at DESC
      LIMIT 20`,
      [userId, tenantId]
    );

    res.json(rows);
  } catch (error) {
    logMetricsError('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// ================================================
// POST /api/metrics/benchmarks
// ================================================
// Update custom benchmarks for a tenant

router.post('/benchmarks', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { encounterType, isNewPatient, targetDuration, targetClicks } = req.body;

    // Verify admin role
    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await pool.query(
      `INSERT INTO efficiency_benchmarks (
        tenant_id, encounter_type, is_new_patient,
        target_duration_seconds, excellent_duration_seconds, average_duration_seconds,
        target_clicks, excellent_clicks, average_clicks,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
      ON CONFLICT (tenant_id, encounter_type, is_new_patient) DO UPDATE SET
        target_duration_seconds = EXCLUDED.target_duration_seconds,
        excellent_duration_seconds = EXCLUDED.excellent_duration_seconds,
        target_clicks = EXCLUDED.target_clicks,
        excellent_clicks = EXCLUDED.excellent_clicks,
        updated_at = NOW()`,
      [
        tenantId,
        encounterType,
        isNewPatient,
        targetDuration,
        Math.floor(targetDuration * 0.75), // Excellent = 75% of target
        Math.floor(targetDuration * 1.1), // Average = 110% of target
        targetClicks,
        Math.floor(targetClicks * 0.75),
        Math.floor(targetClicks * 1.1),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    logMetricsError('Error updating benchmark:', error);
    res.status(500).json({ error: 'Failed to update benchmark' });
  }
});

// ================================================
// EXPORT
// ================================================

export default router;
