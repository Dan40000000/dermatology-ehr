import { pool } from '../db/pool';
import type { PoolClient } from 'pg';

// ================================================
// TYPES
// ================================================

export interface MetricEvent {
  tenantId: string;
  userId: string;
  sessionId: string;
  eventType: 'click' | 'navigation' | 'task_start' | 'task_end' | 'page_load';
  eventTarget?: string;
  eventValue?: string;
  eventMetadata?: Record<string, unknown>;
  timestamp: Date;
  durationMs?: number;
  page?: string;
  patientId?: string;
  encounterId?: string;
  deviceType?: string;
  browser?: string;
}

export interface EncounterMetricsData {
  encounterId: string;
  tenantId: string;
  providerId: string;
  patientId: string;
  totalDurationSeconds: number;
  documentationDurationSeconds: number;
  clickCount: number;
  pageViews: number;
  navigationCount: number;
  timeInNotesSeconds: number;
  timeInOrdersSeconds: number;
  timeInPhotosSeconds: number;
  timeInPrescriptionsSeconds: number;
  timeInBillingSeconds: number;
  timeInProceduresSeconds: number;
  encounterType?: string;
  isNewPatient: boolean;
  encounterStartedAt: Date;
  encounterCompletedAt: Date;
}

// ================================================
// SERVICE CLASS
// ================================================

export class MetricsService {
  // ================================================
  // LOG METRIC EVENTS
  // ================================================

  async logEvents(events: MetricEvent[]): Promise<void> {
    if (events.length === 0) return;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const event of events) {
        await client.query(
          `INSERT INTO metric_events (
            tenant_id, user_id, session_id, event_type, event_target,
            event_value, event_metadata, timestamp, duration_ms,
            page, patient_id, encounter_id, device_type, browser
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            event.tenantId,
            event.userId,
            event.sessionId,
            event.eventType,
            event.eventTarget,
            event.eventValue,
            event.eventMetadata ? JSON.stringify(event.eventMetadata) : null,
            event.timestamp,
            event.durationMs,
            event.page,
            event.patientId,
            event.encounterId,
            event.deviceType,
            event.browser,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ================================================
  // CALCULATE ENCOUNTER METRICS
  // ================================================

  async calculateEncounterMetrics(
    encounterId: string,
    tenantId: string
  ): Promise<EncounterMetricsData | null> {
    const client = await pool.connect();

    try {
      // Get encounter details
      const encounterResult = await client.query(
        `SELECT
          e.id, e.tenant_id, e.provider_id, e.patient_id,
          e.encounter_type, e.created_at, e.updated_at,
          p.is_new_patient
        FROM encounters e
        LEFT JOIN patients p ON p.id = e.patient_id
        WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (encounterResult.rows.length === 0) {
        return null;
      }

      const encounter = encounterResult.rows[0];

      // Get all metric events for this encounter
      const eventsResult = await client.query(
        `SELECT
          event_type, event_target, event_metadata,
          timestamp, duration_ms, page
        FROM metric_events
        WHERE encounter_id = $1 AND tenant_id = $2
        ORDER BY timestamp ASC`,
        [encounterId, tenantId]
      );

      const events = eventsResult.rows;

      // Calculate metrics
      let clickCount = 0;
      let pageViews = 0;
      let navigationCount = 0;
      let encounterStartTime: Date | null = null;
      let encounterEndTime: Date | null = null;

      const sectionTimes: Record<string, number> = {
        notes: 0,
        orders: 0,
        photos: 0,
        prescriptions: 0,
        billing: 0,
        procedures: 0,
      };

      events.forEach((event: any) => {
        if (event.event_type === 'click') clickCount++;
        if (event.event_type === 'page_load') pageViews++;
        if (event.event_type === 'navigation') navigationCount++;

        if (event.event_type === 'task_start' && event.event_target === 'encounter') {
          encounterStartTime = event.timestamp;
        }

        if (event.event_type === 'task_end' && event.event_target === 'encounter') {
          encounterEndTime = event.timestamp;

          // Parse section times from metadata
          if (event.event_metadata && typeof event.event_metadata === 'object') {
            const metadata = event.event_metadata as { sectionTimes?: Record<string, number> };
            if (metadata.sectionTimes) {
              Object.entries(metadata.sectionTimes).forEach(([section, time]) => {
                if (section in sectionTimes) {
                  sectionTimes[section] = Math.floor(time / 1000); // Convert ms to seconds
                }
              });
            }
          }
        }
      });

      // Calculate total duration
      const totalDurationSeconds = encounterStartTime && encounterEndTime
        ? Math.floor((new Date(encounterEndTime).getTime() - new Date(encounterStartTime).getTime()) / 1000)
        : 0;

      // Documentation duration = sum of section times
      const documentationDurationSeconds = Object.values(sectionTimes).reduce((sum, t) => sum + t, 0);

      const metricsData: EncounterMetricsData = {
        encounterId,
        tenantId,
        providerId: encounter.provider_id,
        patientId: encounter.patient_id,
        totalDurationSeconds,
        documentationDurationSeconds,
        clickCount,
        pageViews,
        navigationCount,
        timeInNotesSeconds: sectionTimes.notes || 0,
        timeInOrdersSeconds: sectionTimes.orders || 0,
        timeInPhotosSeconds: sectionTimes.photos || 0,
        timeInPrescriptionsSeconds: sectionTimes.prescriptions || 0,
        timeInBillingSeconds: sectionTimes.billing || 0,
        timeInProceduresSeconds: sectionTimes.procedures || 0,
        encounterType: encounter.encounter_type,
        isNewPatient: encounter.is_new_patient || false,
        encounterStartedAt: encounterStartTime || encounter.created_at,
        encounterCompletedAt: encounterEndTime || encounter.updated_at,
      };

      return metricsData;
    } finally {
      client.release();
    }
  }

  // ================================================
  // SAVE ENCOUNTER METRICS
  // ================================================

  async saveEncounterMetrics(metrics: EncounterMetricsData): Promise<void> {
    const client = await pool.connect();

    try {
      // Get benchmark for this encounter type
      const benchmarkResult = await client.query(
        `SELECT
          target_duration_seconds, average_duration_seconds,
          target_clicks, average_clicks
        FROM efficiency_benchmarks
        WHERE (tenant_id = $1 OR tenant_id IS NULL)
          AND encounter_type = $2
          AND is_new_patient = $3
          AND is_active = TRUE
        ORDER BY tenant_id NULLS LAST
        LIMIT 1`,
        [metrics.tenantId, metrics.encounterType || 'follow-up', metrics.isNewPatient]
      );

      const benchmark = benchmarkResult.rows[0] || {
        target_duration_seconds: 180,
        average_duration_seconds: 195,
        target_clicks: 15,
        average_clicks: 18,
      };

      // Calculate efficiency score (0-100)
      const durationScore = Math.max(
        0,
        100 - ((metrics.totalDurationSeconds - benchmark.target_duration_seconds) / benchmark.target_duration_seconds) * 100
      );
      const clickScore = Math.max(
        0,
        100 - ((metrics.clickCount - benchmark.target_clicks) / benchmark.target_clicks) * 100
      );
      const efficiencyScore = Math.min(100, (durationScore + clickScore) / 2);

      // Calculate time saved vs average
      const timeSavedSeconds = benchmark.average_duration_seconds - metrics.totalDurationSeconds;
      const clicksVsAverage = benchmark.average_clicks - metrics.clickCount;
      const timeVsAverageSeconds = benchmark.average_duration_seconds - metrics.totalDurationSeconds;

      // Insert or update encounter metrics
      await client.query(
        `INSERT INTO encounter_metrics (
          encounter_id, tenant_id, provider_id, patient_id,
          total_duration_seconds, documentation_duration_seconds,
          click_count, page_views, navigation_count,
          time_in_notes_seconds, time_in_orders_seconds, time_in_photos_seconds,
          time_in_prescriptions_seconds, time_in_billing_seconds, time_in_procedures_seconds,
          encounter_type, is_new_patient,
          efficiency_score, time_saved_seconds,
          clicks_vs_average, time_vs_average_seconds,
          encounter_started_at, encounter_completed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (encounter_id) DO UPDATE SET
          total_duration_seconds = EXCLUDED.total_duration_seconds,
          documentation_duration_seconds = EXCLUDED.documentation_duration_seconds,
          click_count = EXCLUDED.click_count,
          page_views = EXCLUDED.page_views,
          navigation_count = EXCLUDED.navigation_count,
          time_in_notes_seconds = EXCLUDED.time_in_notes_seconds,
          time_in_orders_seconds = EXCLUDED.time_in_orders_seconds,
          time_in_photos_seconds = EXCLUDED.time_in_photos_seconds,
          time_in_prescriptions_seconds = EXCLUDED.time_in_prescriptions_seconds,
          time_in_billing_seconds = EXCLUDED.time_in_billing_seconds,
          time_in_procedures_seconds = EXCLUDED.time_in_procedures_seconds,
          efficiency_score = EXCLUDED.efficiency_score,
          time_saved_seconds = EXCLUDED.time_saved_seconds,
          clicks_vs_average = EXCLUDED.clicks_vs_average,
          time_vs_average_seconds = EXCLUDED.time_vs_average_seconds,
          encounter_completed_at = EXCLUDED.encounter_completed_at,
          updated_at = NOW()`,
        [
          metrics.encounterId,
          metrics.tenantId,
          metrics.providerId,
          metrics.patientId,
          metrics.totalDurationSeconds,
          metrics.documentationDurationSeconds,
          metrics.clickCount,
          metrics.pageViews,
          metrics.navigationCount,
          metrics.timeInNotesSeconds,
          metrics.timeInOrdersSeconds,
          metrics.timeInPhotosSeconds,
          metrics.timeInPrescriptionsSeconds,
          metrics.timeInBillingSeconds,
          metrics.timeInProceduresSeconds,
          metrics.encounterType,
          metrics.isNewPatient,
          efficiencyScore,
          timeSavedSeconds,
          clicksVsAverage,
          timeVsAverageSeconds,
          metrics.encounterStartedAt,
          metrics.encounterCompletedAt,
        ]
      );

      // Check for achievements
      await this.checkAchievements(metrics.providerId, metrics.tenantId, client);
    } finally {
      client.release();
    }
  }

  // ================================================
  // GET SUMMARY STATISTICS
  // ================================================

  async getSummary(tenantId: string, period: string = '30d'): Promise<Record<string, unknown>> {
    const client = await pool.connect();

    try {
      const daysMap: Record<string, number> = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
      };
      const days = daysMap[period] || 30;

      const result = await client.query(
        `SELECT
          COUNT(*) as total_encounters,
          COUNT(DISTINCT provider_id) as total_providers,
          AVG(total_duration_seconds)::integer as average_encounter_duration,
          AVG(click_count)::integer as average_clicks,
          SUM(time_saved_seconds)::integer as total_time_saved,
          (
            SELECT json_build_object(
              'providerId', provider_id,
              'providerName', (SELECT full_name FROM providers WHERE id = em.provider_id LIMIT 1),
              'efficiencyScore', AVG(efficiency_score)::numeric(5,2)
            )
            FROM encounter_metrics em2
            WHERE em2.tenant_id = $1
              AND em2.created_at > NOW() - INTERVAL '${days} days'
            GROUP BY em2.provider_id
            ORDER BY AVG(em2.efficiency_score) DESC
            LIMIT 1
          ) as top_performer
        FROM encounter_metrics em
        WHERE em.tenant_id = $1
          AND em.created_at > NOW() - INTERVAL '${days} days'
          AND em.encounter_completed_at IS NOT NULL`,
        [tenantId]
      );

      return result.rows[0] || {};
    } finally {
      client.release();
    }
  }

  // ================================================
  // GET PROVIDER COMPARISON
  // ================================================

  async getProviderMetrics(tenantId: string, period: string = '30d'): Promise<unknown[]> {
    const client = await pool.connect();

    try {
      const daysMap: Record<string, number> = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
      };
      const days = daysMap[period] || 30;

      const result = await client.query(
        `SELECT
          em.provider_id as "providerId",
          p.full_name as "providerName",
          COUNT(*) as "encountersCompleted",
          AVG(em.total_duration_seconds)::integer as "avgDuration",
          AVG(em.click_count)::numeric(5,1) as "avgClicks",
          AVG(em.efficiency_score)::numeric(5,2) as "efficiencyScore",
          SUM(em.time_saved_seconds)::integer as "timeSaved",
          RANK() OVER (ORDER BY AVG(em.efficiency_score) DESC) as rank
        FROM encounter_metrics em
        JOIN providers p ON p.id = em.provider_id
        WHERE em.tenant_id = $1
          AND em.created_at > NOW() - INTERVAL '${days} days'
          AND em.encounter_completed_at IS NOT NULL
        GROUP BY em.provider_id, p.full_name
        ORDER BY "efficiencyScore" DESC`,
        [tenantId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  // ================================================
  // GET TRENDS
  // ================================================

  async getTrends(tenantId: string, period: string = '30d'): Promise<unknown[]> {
    const client = await pool.connect();

    try {
      const daysMap: Record<string, number> = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
      };
      const days = daysMap[period] || 30;

      const result = await client.query(
        `SELECT
          DATE(created_at) as date,
          AVG(total_duration_seconds)::integer as "avgDuration",
          AVG(click_count)::integer as "avgClicks",
          COUNT(*) as "encounterCount",
          SUM(time_saved_seconds)::integer as "timeSaved"
        FROM encounter_metrics
        WHERE tenant_id = $1
          AND created_at > NOW() - INTERVAL '${days} days'
          AND encounter_completed_at IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY date DESC`,
        [tenantId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  // ================================================
  // GET FEATURE USAGE
  // ================================================

  async getFeatureUsage(tenantId: string, period: string = '30d'): Promise<unknown[]> {
    const client = await pool.connect();

    try {
      const daysMap: Record<string, number> = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
      };
      const days = daysMap[period] || 30;

      const result = await client.query(
        `SELECT
          feature_name as "featureName",
          feature_category as category,
          SUM(usage_count)::integer as "usageCount",
          AVG(unique_users)::integer as "uniqueUsers",
          AVG(avg_time_saved_seconds)::integer as "avgTimeSaved"
        FROM feature_usage_stats
        WHERE tenant_id = $1
          AND date > CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY feature_name, feature_category
        ORDER BY SUM(usage_count) DESC
        LIMIT 20`,
        [tenantId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  // ================================================
  // CHECK AND AWARD ACHIEVEMENTS
  // ================================================

  private async checkAchievements(
    userId: string,
    tenantId: string,
    client: PoolClient
  ): Promise<void> {
    // Check for Speed Demon (10 encounters under 2 minutes)
    const speedDemonResult = await client.query(
      `SELECT COUNT(*) as count
      FROM encounter_metrics
      WHERE provider_id = $1
        AND tenant_id = $2
        AND total_duration_seconds <= 120
        AND created_at > NOW() - INTERVAL '30 days'`,
      [userId, tenantId]
    );

    if (speedDemonResult.rows[0]?.count >= 10) {
      await this.awardAchievement(userId, tenantId, 'speed_demon', 10, client);
    }

    // Check for Click Minimalist (5 encounters under 10 clicks)
    const clickMinimalistResult = await client.query(
      `SELECT COUNT(*) as count
      FROM encounter_metrics
      WHERE provider_id = $1
        AND tenant_id = $2
        AND click_count <= 10
        AND created_at > NOW() - INTERVAL '30 days'`,
      [userId, tenantId]
    );

    if (clickMinimalistResult.rows[0]?.count >= 5) {
      await this.awardAchievement(userId, tenantId, 'click_minimalist', 5, client);
    }

    // Check for Efficiency Expert (avg efficiency score > 90)
    const efficiencyExpertResult = await client.query(
      `SELECT AVG(efficiency_score) as avg_score
      FROM encounter_metrics
      WHERE provider_id = $1
        AND tenant_id = $2
        AND created_at > NOW() - INTERVAL '30 days'`,
      [userId, tenantId]
    );

    if (efficiencyExpertResult.rows[0]?.avg_score >= 90) {
      await this.awardAchievement(userId, tenantId, 'efficiency_expert', 90, client);
    }
  }

  private async awardAchievement(
    userId: string,
    tenantId: string,
    achievementType: string,
    value: number,
    client: PoolClient
  ): Promise<void> {
    const achievementInfo: Record<string, { name: string; description: string; icon: string; tier: string }> = {
      speed_demon: {
        name: 'Speed Demon',
        description: '10 encounters completed in under 2 minutes',
        icon: '🚀',
        tier: 'gold',
      },
      click_minimalist: {
        name: 'Click Minimalist',
        description: '5 encounters completed with under 10 clicks',
        icon: '🖱️',
        tier: 'silver',
      },
      efficiency_expert: {
        name: 'Efficiency Expert',
        description: 'Average efficiency score above 90%',
        icon: '⭐',
        tier: 'platinum',
      },
    };

    const info = achievementInfo[achievementType];
    if (!info) return;

    await client.query(
      `INSERT INTO efficiency_achievements (
        tenant_id, user_id, achievement_type, achievement_name,
        achievement_description, achievement_icon, achievement_tier,
        achievement_value
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, achievement_type, (earned_at::date)) DO NOTHING`,
      [
        tenantId,
        userId,
        achievementType,
        info.name,
        info.description,
        info.icon,
        info.tier,
        value,
      ]
    );
  }
}

// ================================================
// EXPORT SINGLETON
// ================================================

export const metricsService = new MetricsService();
