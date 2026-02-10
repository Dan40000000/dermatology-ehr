import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { RCMAnalyticsService } from '../services/rcmAnalytics';

export const rcmRouter = Router();

/**
 * GET /api/rcm/dashboard
 * Get full RCM dashboard data including all KPIs and metrics
 */
rcmRouter.get('/dashboard', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { period = 'mtd' } = req.query;

  try {
    const today = new Date();
    let startDate: Date;
    let endDate = today;
    let previousStartDate: Date;
    let previousEndDate: Date;

    // Calculate date ranges based on period
    if (period === 'mtd') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      previousEndDate = new Date(startDate.getTime() - 1);
      previousStartDate = new Date(previousEndDate.getFullYear(), previousEndDate.getMonth(), 1);
    } else if (period === 'qtd') {
      const quarterStart = Math.floor(today.getMonth() / 3) * 3;
      startDate = new Date(today.getFullYear(), quarterStart, 1);
      previousEndDate = new Date(startDate.getTime() - 1);
      const prevQuarterStart = Math.floor(previousEndDate.getMonth() / 3) * 3;
      previousStartDate = new Date(previousEndDate.getFullYear(), prevQuarterStart, 1);
    } else {
      // ytd
      startDate = new Date(today.getFullYear(), 0, 1);
      previousStartDate = new Date(today.getFullYear() - 1, 0, 1);
      previousEndDate = new Date(today.getFullYear() - 1, 11, 31);
    }

    // Fetch all dashboard data in parallel
    const [kpisData, arAging, denialAnalysis, benchmarks] = await Promise.all([
      RCMAnalyticsService.calculateKPIs(tenantId, startDate, endDate, previousStartDate, previousEndDate),
      RCMAnalyticsService.getARAgingData(tenantId),
      RCMAnalyticsService.getDenialAnalysis(tenantId, startDate, endDate),
      RCMAnalyticsService.getBenchmarks('Dermatology'),
    ]);

    // Generate alerts based on current KPIs vs benchmarks
    const alerts = RCMAnalyticsService.generateAlerts(kpisData.current, benchmarks);

    res.json({
      period: {
        type: period,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      kpis: kpisData.current,
      previousKpis: kpisData.previous,
      arAging,
      denialAnalysis,
      benchmarks,
      alerts,
    });
  } catch (error: any) {
    console.error('Error fetching RCM dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch RCM dashboard data' });
  }
});

/**
 * GET /api/rcm/kpis
 * Get Key Performance Indicators with comparison to previous period
 */
rcmRouter.get('/kpis', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate, compareStartDate, compareEndDate } = req.query;

  try {
    if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
      return res.status(400).json({ error: 'Date ranges required' });
    }

    const kpis = await RCMAnalyticsService.calculateKPIs(
      tenantId,
      new Date(startDate as string),
      new Date(endDate as string),
      new Date(compareStartDate as string),
      new Date(compareEndDate as string)
    );

    const benchmarks = await RCMAnalyticsService.getBenchmarks('Dermatology');

    res.json({
      current: kpis.current,
      previous: kpis.previous,
      benchmarks,
    });
  } catch (error: any) {
    console.error('Error fetching KPIs:', error);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

/**
 * GET /api/rcm/aging
 * Get A/R aging breakdown by buckets
 */
rcmRouter.get('/aging', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const arAging = await RCMAnalyticsService.getARAgingData(tenantId);

    res.json({
      aging: arAging,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching A/R aging:', error);
    res.status(500).json({ error: 'Failed to fetch A/R aging data' });
  }
});

/**
 * GET /api/rcm/collections
 * Get collections trend over time
 */
rcmRouter.get('/collections', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate, granularity = 'monthly' } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required' });
    }

    const trend = await RCMAnalyticsService.getCollectionsTrend(
      tenantId,
      new Date(startDate as string),
      new Date(endDate as string),
      granularity as 'daily' | 'weekly' | 'monthly'
    );

    res.json({
      trend,
      period: { startDate, endDate, granularity },
    });
  } catch (error: any) {
    console.error('Error fetching collections trend:', error);
    res.status(500).json({ error: 'Failed to fetch collections trend' });
  }
});

/**
 * GET /api/rcm/denials
 * Get denial analysis including top reasons and trends
 */
rcmRouter.get('/denials', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required' });
    }

    const analysis = await RCMAnalyticsService.getDenialAnalysis(
      tenantId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json(analysis);
  } catch (error: any) {
    console.error('Error fetching denial analysis:', error);
    res.status(500).json({ error: 'Failed to fetch denial analysis' });
  }
});

/**
 * GET /api/rcm/payer-mix
 * Get revenue breakdown by insurance payer
 */
rcmRouter.get('/payer-mix', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required' });
    }

    const payerPerformance = await RCMAnalyticsService.getPayerPerformance(
      tenantId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({
      payers: payerPerformance,
      period: { startDate, endDate },
    });
  } catch (error: any) {
    console.error('Error fetching payer mix:', error);
    res.status(500).json({ error: 'Failed to fetch payer mix data' });
  }
});

/**
 * GET /api/rcm/provider-stats
 * Get provider productivity and revenue metrics
 */
rcmRouter.get('/provider-stats', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required' });
    }

    const productivity = await RCMAnalyticsService.getProviderProductivity(
      tenantId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({
      providers: productivity,
      period: { startDate, endDate },
    });
  } catch (error: any) {
    console.error('Error fetching provider stats:', error);
    res.status(500).json({ error: 'Failed to fetch provider statistics' });
  }
});

/**
 * GET /api/rcm/trends
 * Get historical trends for dashboard charts
 */
rcmRouter.get('/trends', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { months = 6 } = req.query;

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months as string));

    const collectionsTrend = await RCMAnalyticsService.getCollectionsTrend(
      tenantId,
      startDate,
      endDate,
      'monthly'
    );

    res.json({
      collections: collectionsTrend,
      period: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
    });
  } catch (error: any) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

/**
 * GET /api/rcm/action-items
 * Get items requiring attention (denials to appeal, high balances, etc.)
 */
rcmRouter.get('/action-items', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { limit = 20 } = req.query;

  try {
    const actionItems = await RCMAnalyticsService.getActionItems(tenantId, parseInt(limit as string));

    res.json({
      items: actionItems,
      count: actionItems.length,
    });
  } catch (error: any) {
    console.error('Error fetching action items:', error);
    res.status(500).json({ error: 'Failed to fetch action items' });
  }
});

/**
 * GET /api/rcm/calendar
 * Get upcoming financial events for calendar view
 */
rcmRouter.get('/calendar', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required' });
    }

    const events = await RCMAnalyticsService.getFinancialEvents(
      tenantId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({
      events,
      period: { startDate, endDate },
    });
  } catch (error: any) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

/**
 * POST /api/rcm/action-items/:id/resolve
 * Mark an action item as resolved
 */
rcmRouter.post('/action-items/:id/resolve', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const { pool } = await import('../db/pool');

    await pool.query(
      `update rcm_action_items
       set status = 'resolved',
           resolved_at = now(),
           resolved_by = $1,
           description = coalesce(description, '') || '\n\nResolution: ' || $2,
           updated_at = now()
       where id = $3 and tenant_id = $4`,
      [userId, notes || 'Resolved', id, tenantId]
    );

    res.json({ success: true, message: 'Action item resolved' });
  } catch (error: any) {
    console.error('Error resolving action item:', error);
    res.status(500).json({ error: 'Failed to resolve action item' });
  }
});

/**
 * POST /api/rcm/metrics/calculate
 * Manually trigger calculation of RCM metrics for a specific date
 */
rcmRouter.post('/metrics/calculate', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { date } = req.body;

  try {
    const { pool } = await import('../db/pool');
    const metricDate = date ? new Date(date) : new Date();

    await pool.query('select calculate_rcm_daily_metrics($1, $2)', [
      tenantId,
      metricDate.toISOString().split('T')[0],
    ]);

    res.json({
      success: true,
      message: 'RCM metrics calculated successfully',
      date: metricDate.toISOString().split('T')[0],
    });
  } catch (error: any) {
    console.error('Error calculating RCM metrics:', error);
    res.status(500).json({ error: 'Failed to calculate RCM metrics' });
  }
});

/**
 * GET /api/rcm/benchmarks
 * Get industry benchmarks for comparison
 */
rcmRouter.get('/benchmarks', requireAuth, async (req: AuthedRequest, res) => {
  const { specialty = 'Dermatology' } = req.query;

  try {
    const benchmarks = await RCMAnalyticsService.getBenchmarks(specialty as string);

    res.json({
      specialty,
      benchmarks,
    });
  } catch (error: any) {
    console.error('Error fetching benchmarks:', error);
    res.status(500).json({ error: 'Failed to fetch benchmarks' });
  }
});
