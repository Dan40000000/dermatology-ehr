/**
 * Survey Service
 * Business logic for patient surveys, NPS tracking, and review management
 * Handles post-visit feedback collection and analytics
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

interface SurveyTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  survey_type: string;
  questions: SurveyQuestion[];
  is_active: boolean;
  is_default: boolean;
  send_delay_hours: number;
  reminder_delay_hours: number;
  expiration_hours: number;
  thank_you_message: string;
  enable_review_prompt: boolean;
  review_prompt_threshold: number;
  google_review_url: string | null;
  healthgrades_url: string | null;
  yelp_url: string | null;
}

interface SurveyQuestion {
  id: string;
  type: 'nps' | 'stars' | 'rating' | 'text' | 'multiple_choice' | 'checkbox';
  text: string;
  required: boolean;
  options?: string[];
  category?: string;
  order: number;
}

interface SurveyInvitation {
  id: string;
  tenant_id: string;
  encounter_id: string | null;
  patient_id: string;
  template_id: string;
  provider_id: string | null;
  access_token: string;
  sent_at: Date | null;
  expires_at: Date;
  completed_at: Date | null;
  status: string;
}

interface SurveyResponse {
  question_responses: QuestionResponse[];
  nps_score?: number;
  wait_time_rating?: number;
  staff_friendliness_rating?: number;
  provider_communication_rating?: number;
  facility_cleanliness_rating?: number;
  overall_satisfaction_rating?: number;
  comments?: string;
  improvement_suggestions?: string;
  device_type?: string;
  browser?: string;
  response_time_seconds?: number;
}

interface QuestionResponse {
  question_id: string;
  question_text: string;
  answer: string | number | string[];
  answer_type: string;
}

interface NPSResult {
  total_responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps_score: number;
  average_score: number;
  trend?: NPSTrend[];
}

interface NPSTrend {
  date: string;
  nps_score: number;
  response_count: number;
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface FeedbackSummary {
  total_responses: number;
  average_ratings: {
    nps: number;
    wait_time: number;
    staff_friendliness: number;
    provider_communication: number;
    facility_cleanliness: number;
    overall_satisfaction: number;
  };
  recent_comments: {
    date: string;
    nps_score: number;
    comment: string;
    patient_name: string;
    provider_name: string;
  }[];
  sentiment_breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

export class SurveyService {
  /**
   * Generate a unique access token for survey links
   */
  private static generateAccessToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get the default survey template for a tenant
   */
  static async getDefaultTemplate(tenantId: string): Promise<SurveyTemplate | null> {
    const query = `
      SELECT *
      FROM survey_templates
      WHERE (tenant_id = $1 OR tenant_id = 'default')
        AND is_active = true
        AND is_default = true
        AND deleted_at IS NULL
      ORDER BY
        CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `;

    const result = await pool.query(query, [tenantId]);
    return result.rows[0] || null;
  }

  /**
   * Get a survey template by ID
   */
  static async getTemplate(templateId: string, tenantId: string): Promise<SurveyTemplate | null> {
    const query = `
      SELECT *
      FROM survey_templates
      WHERE id = $1
        AND (tenant_id = $2 OR tenant_id = 'default')
        AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [templateId, tenantId]);
    return result.rows[0] || null;
  }

  /**
   * Get all survey templates for a tenant
   */
  static async getTemplates(tenantId: string): Promise<SurveyTemplate[]> {
    const query = `
      SELECT *
      FROM survey_templates
      WHERE (tenant_id = $1 OR tenant_id = 'default')
        AND deleted_at IS NULL
      ORDER BY is_default DESC, name ASC
    `;

    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Create a new survey template
   */
  static async createTemplate(
    tenantId: string,
    userId: string,
    data: Partial<SurveyTemplate>
  ): Promise<SurveyTemplate> {
    const query = `
      INSERT INTO survey_templates (
        tenant_id,
        name,
        description,
        survey_type,
        questions,
        is_active,
        is_default,
        send_delay_hours,
        reminder_delay_hours,
        expiration_hours,
        thank_you_message,
        enable_review_prompt,
        review_prompt_threshold,
        google_review_url,
        healthgrades_url,
        yelp_url,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      data.name,
      data.description || null,
      data.survey_type || 'post_visit',
      JSON.stringify(data.questions || []),
      data.is_active !== false,
      data.is_default || false,
      data.send_delay_hours || 2,
      data.reminder_delay_hours || 48,
      data.expiration_hours || 168,
      data.thank_you_message || 'Thank you for your feedback!',
      data.enable_review_prompt !== false,
      data.review_prompt_threshold || 9,
      data.google_review_url || null,
      data.healthgrades_url || null,
      data.yelp_url || null,
      userId,
    ]);

    return result.rows[0];
  }

  /**
   * Send post-visit survey after checkout
   * Called automatically after patient checkout
   */
  static async sendPostVisitSurvey(
    encounterId: string,
    tenantId: string,
    options?: {
      templateId?: string;
      deliveryMethod?: 'email' | 'sms' | 'both';
      checkoutUserId?: string;
    }
  ): Promise<SurveyInvitation | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get encounter details
      const encounterQuery = `
        SELECT
          e.id,
          e.patient_id,
          e.provider_id,
          e.location_id,
          p.email,
          p.phone,
          p.first_name,
          p.last_name,
          pr.first_name as provider_first_name,
          pr.last_name as provider_last_name
        FROM encounters e
        JOIN patients p ON e.patient_id = p.id
        LEFT JOIN providers pr ON e.provider_id = pr.id
        WHERE e.id = $1 AND e.tenant_id = $2
      `;

      const encounterResult = await client.query(encounterQuery, [encounterId, tenantId]);

      if (encounterResult.rows.length === 0) {
        await client.query('ROLLBACK');
        logger.warn('Encounter not found for survey', { encounterId, tenantId });
        return null;
      }

      const encounter = encounterResult.rows[0];

      // Check if patient has email or phone for delivery
      if (!encounter.email && !encounter.phone) {
        await client.query('ROLLBACK');
        logger.info('Patient has no contact info for survey', {
          encounterId,
          patientId: encounter.patient_id,
        });
        return null;
      }

      // Check if survey already sent for this encounter
      const existingQuery = `
        SELECT id FROM survey_invitations
        WHERE encounter_id = $1 AND tenant_id = $2
          AND status NOT IN ('cancelled', 'expired')
      `;

      const existingResult = await client.query(existingQuery, [encounterId, tenantId]);

      if (existingResult.rows.length > 0) {
        await client.query('ROLLBACK');
        logger.info('Survey already sent for encounter', { encounterId });
        return null;
      }

      // Get template
      let template: SurveyTemplate | null = null;

      if (options?.templateId) {
        template = await this.getTemplate(options.templateId, tenantId);
      }

      if (!template) {
        template = await this.getDefaultTemplate(tenantId);
      }

      if (!template) {
        await client.query('ROLLBACK');
        logger.warn('No survey template found', { tenantId });
        return null;
      }

      // Generate access token and calculate expiration
      const accessToken = this.generateAccessToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + template.expiration_hours);

      // Calculate when to send (delay after checkout)
      const sendAt = new Date();
      sendAt.setHours(sendAt.getHours() + template.send_delay_hours);

      // Create invitation
      const insertQuery = `
        INSERT INTO survey_invitations (
          tenant_id,
          encounter_id,
          patient_id,
          template_id,
          provider_id,
          access_token,
          expires_at,
          delivery_method,
          checkout_user_id,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING *
      `;

      const invitationResult = await client.query(insertQuery, [
        tenantId,
        encounterId,
        encounter.patient_id,
        template.id,
        encounter.provider_id,
        accessToken,
        expiresAt,
        options?.deliveryMethod || 'email',
        options?.checkoutUserId || null,
      ]);

      const invitation = invitationResult.rows[0];

      // Schedule the survey send job
      const jobQuery = `
        INSERT INTO survey_jobs (
          tenant_id,
          job_type,
          invitation_id,
          encounter_id,
          patient_id,
          scheduled_for,
          metadata
        ) VALUES ($1, 'send_survey', $2, $3, $4, $5, $6)
      `;

      await client.query(jobQuery, [
        tenantId,
        invitation.id,
        encounterId,
        encounter.patient_id,
        sendAt,
        JSON.stringify({
          patient_name: `${encounter.first_name} ${encounter.last_name}`,
          patient_email: encounter.email,
          patient_phone: encounter.phone,
          provider_name: encounter.provider_first_name
            ? `${encounter.provider_first_name} ${encounter.provider_last_name}`
            : null,
        }),
      ]);

      await client.query('COMMIT');

      logger.info('Survey invitation created', {
        invitationId: invitation.id,
        encounterId,
        patientId: encounter.patient_id,
        sendAt,
      });

      return invitation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get survey by access token (public, no auth required)
   */
  static async getSurveyByToken(token: string): Promise<{
    invitation: SurveyInvitation;
    template: SurveyTemplate;
    patient: { first_name: string; last_name: string };
    provider: { first_name: string; last_name: string } | null;
  } | null> {
    const query = `
      SELECT
        si.*,
        st.id as template_id,
        st.name as template_name,
        st.description as template_description,
        st.survey_type,
        st.questions,
        st.thank_you_message,
        st.enable_review_prompt,
        st.review_prompt_threshold,
        st.google_review_url,
        st.healthgrades_url,
        st.yelp_url,
        st.primary_color,
        st.logo_url,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        pr.first_name as provider_first_name,
        pr.last_name as provider_last_name
      FROM survey_invitations si
      JOIN survey_templates st ON si.template_id = st.id
      JOIN patients p ON si.patient_id = p.id
      LEFT JOIN providers pr ON si.provider_id = pr.id
      WHERE si.access_token = $1
        AND si.status NOT IN ('cancelled')
    `;

    const result = await pool.query(query, [token]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Check if expired
    if (new Date(row.expires_at) < new Date()) {
      // Update status to expired
      await pool.query(
        `UPDATE survey_invitations SET status = 'expired' WHERE id = $1`,
        [row.id]
      );
      return null;
    }

    // Check if already completed
    if (row.status === 'completed') {
      return null;
    }

    // Mark as opened if not already
    if (!row.opened_at) {
      await pool.query(
        `UPDATE survey_invitations SET opened_at = NOW(), status = 'opened' WHERE id = $1`,
        [row.id]
      );
    }

    return {
      invitation: {
        id: row.id,
        tenant_id: row.tenant_id,
        encounter_id: row.encounter_id,
        patient_id: row.patient_id,
        template_id: row.template_id,
        provider_id: row.provider_id,
        access_token: row.access_token,
        sent_at: row.sent_at,
        expires_at: row.expires_at,
        completed_at: row.completed_at,
        status: row.status,
      },
      template: {
        id: row.template_id,
        tenant_id: row.tenant_id,
        name: row.template_name,
        description: row.template_description,
        survey_type: row.survey_type,
        questions: row.questions,
        is_active: true,
        is_default: false,
        send_delay_hours: 2,
        reminder_delay_hours: 48,
        expiration_hours: 168,
        thank_you_message: row.thank_you_message,
        enable_review_prompt: row.enable_review_prompt,
        review_prompt_threshold: row.review_prompt_threshold,
        google_review_url: row.google_review_url,
        healthgrades_url: row.healthgrades_url,
        yelp_url: row.yelp_url,
      },
      patient: {
        first_name: row.patient_first_name,
        last_name: row.patient_last_name,
      },
      provider: row.provider_first_name
        ? {
            first_name: row.provider_first_name,
            last_name: row.provider_last_name,
          }
        : null,
    };
  }

  /**
   * Submit survey response
   */
  static async submitSurvey(
    invitationId: string,
    responses: SurveyResponse,
    metadata?: {
      ip_address?: string;
      device_type?: string;
      browser?: string;
    }
  ): Promise<{ success: boolean; showReviewPrompt: boolean; reviewUrls?: Record<string, string> }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get invitation
      const invitationQuery = `
        SELECT si.*, st.enable_review_prompt, st.review_prompt_threshold,
               st.google_review_url, st.healthgrades_url, st.yelp_url
        FROM survey_invitations si
        JOIN survey_templates st ON si.template_id = st.id
        WHERE si.id = $1
          AND si.status NOT IN ('completed', 'cancelled', 'expired')
      `;

      const invitationResult = await client.query(invitationQuery, [invitationId]);

      if (invitationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Survey invitation not found or already completed');
      }

      const invitation = invitationResult.rows[0];

      // Calculate NPS category
      let npsCategory: string | null = null;
      if (responses.nps_score !== undefined) {
        if (responses.nps_score >= 9) {
          npsCategory = 'promoter';
        } else if (responses.nps_score >= 7) {
          npsCategory = 'passive';
        } else {
          npsCategory = 'detractor';
        }
      }

      // Insert response
      const responseQuery = `
        INSERT INTO survey_responses (
          tenant_id,
          invitation_id,
          question_responses,
          nps_score,
          nps_category,
          wait_time_rating,
          staff_friendliness_rating,
          provider_communication_rating,
          facility_cleanliness_rating,
          overall_satisfaction_rating,
          comments,
          improvement_suggestions,
          response_time_seconds,
          device_type,
          browser,
          ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
      `;

      await client.query(responseQuery, [
        invitation.tenant_id,
        invitationId,
        JSON.stringify(responses.question_responses),
        responses.nps_score ?? null,
        npsCategory,
        responses.wait_time_rating ?? null,
        responses.staff_friendliness_rating ?? null,
        responses.provider_communication_rating ?? null,
        responses.facility_cleanliness_rating ?? null,
        responses.overall_satisfaction_rating ?? null,
        responses.comments ?? null,
        responses.improvement_suggestions ?? null,
        responses.response_time_seconds ?? null,
        metadata?.device_type ?? null,
        metadata?.browser ?? null,
        metadata?.ip_address ?? null,
      ]);

      // Update invitation status
      await client.query(
        `UPDATE survey_invitations SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [invitationId]
      );

      await client.query('COMMIT');

      // Determine if we should show review prompt
      const showReviewPrompt =
        invitation.enable_review_prompt &&
        responses.nps_score !== undefined &&
        responses.nps_score >= invitation.review_prompt_threshold;

      const reviewUrls: Record<string, string> = {};
      if (showReviewPrompt) {
        if (invitation.google_review_url) {
          reviewUrls.google = invitation.google_review_url;
        }
        if (invitation.healthgrades_url) {
          reviewUrls.healthgrades = invitation.healthgrades_url;
        }
        if (invitation.yelp_url) {
          reviewUrls.yelp = invitation.yelp_url;
        }
      }

      logger.info('Survey response submitted', {
        invitationId,
        npsScore: responses.nps_score,
        npsCategory,
        showReviewPrompt,
      });

      return {
        success: true,
        showReviewPrompt,
        reviewUrls: Object.keys(reviewUrls).length > 0 ? reviewUrls : undefined,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate NPS score for a date range and optionally a provider
   */
  static async calculateNPS(
    tenantId: string,
    dateRange: DateRange,
    providerId?: string
  ): Promise<NPSResult> {
    const params: (string | Date)[] = [tenantId, dateRange.startDate, dateRange.endDate];
    let providerFilter = '';

    if (providerId) {
      providerFilter = 'AND provider_id = $4';
      params.push(providerId);
    }

    const query = `
      SELECT
        COUNT(*) as total_responses,
        COUNT(*) FILTER (WHERE category = 'promoter') as promoters,
        COUNT(*) FILTER (WHERE category = 'passive') as passives,
        COUNT(*) FILTER (WHERE category = 'detractor') as detractors,
        ROUND(AVG(score)::NUMERIC, 2) as average_score,
        ROUND(
          (
            (COUNT(*) FILTER (WHERE category = 'promoter')::NUMERIC / NULLIF(COUNT(*), 0) * 100) -
            (COUNT(*) FILTER (WHERE category = 'detractor')::NUMERIC / NULLIF(COUNT(*), 0) * 100)
          )::NUMERIC,
          1
        ) as nps_score
      FROM nps_scores
      WHERE tenant_id = $1
        AND response_date BETWEEN $2 AND $3
        ${providerFilter}
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0];

    // Get trend data
    const trendQuery = `
      SELECT
        response_date::TEXT as date,
        ROUND(
          (
            (COUNT(*) FILTER (WHERE category = 'promoter')::NUMERIC / NULLIF(COUNT(*), 0) * 100) -
            (COUNT(*) FILTER (WHERE category = 'detractor')::NUMERIC / NULLIF(COUNT(*), 0) * 100)
          )::NUMERIC,
          1
        ) as nps_score,
        COUNT(*) as response_count
      FROM nps_scores
      WHERE tenant_id = $1
        AND response_date BETWEEN $2 AND $3
        ${providerFilter}
      GROUP BY response_date
      ORDER BY response_date ASC
    `;

    const trendResult = await pool.query(trendQuery, params);

    return {
      total_responses: parseInt(row.total_responses) || 0,
      promoters: parseInt(row.promoters) || 0,
      passives: parseInt(row.passives) || 0,
      detractors: parseInt(row.detractors) || 0,
      nps_score: parseFloat(row.nps_score) || 0,
      average_score: parseFloat(row.average_score) || 0,
      trend: trendResult.rows.map((r) => ({
        date: r.date,
        nps_score: parseFloat(r.nps_score) || 0,
        response_count: parseInt(r.response_count) || 0,
      })),
    };
  }

  /**
   * Get detailed feedback summary
   */
  static async getDetailedFeedback(
    tenantId: string,
    dateRange: DateRange,
    options?: {
      providerId?: string;
      limit?: number;
    }
  ): Promise<FeedbackSummary> {
    const params: (string | Date | number)[] = [tenantId, dateRange.startDate, dateRange.endDate];
    let providerFilter = '';
    let providerJoinFilter = '';

    if (options?.providerId) {
      providerFilter = 'AND ns.provider_id = $4';
      providerJoinFilter = 'AND si.provider_id = $4';
      params.push(options.providerId);
    }

    // Get average ratings
    const ratingsQuery = `
      SELECT
        COUNT(*) as total_responses,
        ROUND(AVG(nps_score)::NUMERIC, 2) as avg_nps,
        ROUND(AVG(wait_time_rating)::NUMERIC, 2) as avg_wait_time,
        ROUND(AVG(staff_friendliness_rating)::NUMERIC, 2) as avg_staff_friendliness,
        ROUND(AVG(provider_communication_rating)::NUMERIC, 2) as avg_provider_communication,
        ROUND(AVG(facility_cleanliness_rating)::NUMERIC, 2) as avg_facility_cleanliness,
        ROUND(AVG(overall_satisfaction_rating)::NUMERIC, 2) as avg_overall_satisfaction,
        COUNT(*) FILTER (WHERE nps_score >= 7) as positive_count,
        COUNT(*) FILTER (WHERE nps_score >= 5 AND nps_score < 7) as neutral_count,
        COUNT(*) FILTER (WHERE nps_score < 5) as negative_count
      FROM survey_responses sr
      JOIN survey_invitations si ON sr.invitation_id = si.id
      WHERE sr.tenant_id = $1
        AND sr.submitted_at BETWEEN $2 AND $3
        ${providerJoinFilter}
    `;

    const ratingsResult = await pool.query(ratingsQuery, params);
    const ratings = ratingsResult.rows[0];

    // Get recent comments
    const commentsLimit = options?.limit || 10;
    const commentsParams = [...params, commentsLimit];

    const commentsQuery = `
      SELECT
        sr.submitted_at::DATE::TEXT as date,
        sr.nps_score,
        sr.comments as comment,
        p.first_name || ' ' || LEFT(p.last_name, 1) || '.' as patient_name,
        COALESCE(pr.first_name || ' ' || pr.last_name, 'N/A') as provider_name
      FROM survey_responses sr
      JOIN survey_invitations si ON sr.invitation_id = si.id
      JOIN patients p ON si.patient_id = p.id
      LEFT JOIN providers pr ON si.provider_id = pr.id
      WHERE sr.tenant_id = $1
        AND sr.submitted_at BETWEEN $2 AND $3
        AND sr.comments IS NOT NULL
        AND sr.comments != ''
        ${providerJoinFilter}
      ORDER BY sr.submitted_at DESC
      LIMIT $${params.length + 1}
    `;

    const commentsResult = await pool.query(commentsQuery, commentsParams);

    const totalWithSentiment =
      (parseInt(ratings.positive_count) || 0) +
      (parseInt(ratings.neutral_count) || 0) +
      (parseInt(ratings.negative_count) || 0);

    return {
      total_responses: parseInt(ratings.total_responses) || 0,
      average_ratings: {
        nps: parseFloat(ratings.avg_nps) || 0,
        wait_time: parseFloat(ratings.avg_wait_time) || 0,
        staff_friendliness: parseFloat(ratings.avg_staff_friendliness) || 0,
        provider_communication: parseFloat(ratings.avg_provider_communication) || 0,
        facility_cleanliness: parseFloat(ratings.avg_facility_cleanliness) || 0,
        overall_satisfaction: parseFloat(ratings.avg_overall_satisfaction) || 0,
      },
      recent_comments: commentsResult.rows,
      sentiment_breakdown: {
        positive: totalWithSentiment > 0
          ? Math.round((parseInt(ratings.positive_count) / totalWithSentiment) * 100)
          : 0,
        neutral: totalWithSentiment > 0
          ? Math.round((parseInt(ratings.neutral_count) / totalWithSentiment) * 100)
          : 0,
        negative: totalWithSentiment > 0
          ? Math.round((parseInt(ratings.negative_count) / totalWithSentiment) * 100)
          : 0,
      },
    };
  }

  /**
   * Send review request to a patient
   */
  static async sendReviewRequest(
    tenantId: string,
    patientId: string,
    platform: 'google' | 'healthgrades' | 'yelp' | 'facebook' | 'zocdoc',
    options?: {
      encounterId?: string;
      responseId?: string;
      npsScore?: number;
    }
  ): Promise<{ id: string; review_url: string }> {
    // Get the review URL from tenant settings or template
    const templateQuery = `
      SELECT google_review_url, healthgrades_url, yelp_url
      FROM survey_templates
      WHERE (tenant_id = $1 OR tenant_id = 'default')
        AND is_default = true
        AND deleted_at IS NULL
      ORDER BY
        CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `;

    const templateResult = await pool.query(templateQuery, [tenantId]);

    if (templateResult.rows.length === 0) {
      throw new Error('No survey template found');
    }

    const template = templateResult.rows[0];
    let reviewUrl: string | null = null;

    switch (platform) {
      case 'google':
        reviewUrl = template.google_review_url;
        break;
      case 'healthgrades':
        reviewUrl = template.healthgrades_url;
        break;
      case 'yelp':
        reviewUrl = template.yelp_url;
        break;
      default:
        throw new Error(`Unsupported review platform: ${platform}`);
    }

    if (!reviewUrl) {
      throw new Error(`No review URL configured for platform: ${platform}`);
    }

    const insertQuery = `
      INSERT INTO review_requests (
        tenant_id,
        patient_id,
        encounter_id,
        response_id,
        platform,
        review_url,
        nps_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, review_url
    `;

    const result = await pool.query(insertQuery, [
      tenantId,
      patientId,
      options?.encounterId || null,
      options?.responseId || null,
      platform,
      reviewUrl,
      options?.npsScore || null,
    ]);

    logger.info('Review request created', {
      requestId: result.rows[0].id,
      patientId,
      platform,
    });

    return result.rows[0];
  }

  /**
   * Track when a review link is clicked
   */
  static async trackReviewClick(requestId: string): Promise<void> {
    const query = `
      UPDATE review_requests
      SET
        clicked_at = COALESCE(clicked_at, NOW()),
        last_click_at = NOW(),
        click_count = click_count + 1,
        status = 'clicked'
      WHERE id = $1
    `;

    await pool.query(query, [requestId]);

    logger.info('Review click tracked', { requestId });
  }

  /**
   * Get review request statistics
   */
  static async getReviewStats(
    tenantId: string,
    dateRange: DateRange
  ): Promise<{
    total_sent: number;
    total_clicked: number;
    click_rate: number;
    by_platform: { platform: string; sent: number; clicked: number }[];
  }> {
    const query = `
      SELECT
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as total_clicked,
        ROUND(
          (COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::NUMERIC /
           NULLIF(COUNT(*), 0) * 100)::NUMERIC,
          1
        ) as click_rate
      FROM review_requests
      WHERE tenant_id = $1
        AND sent_at BETWEEN $2 AND $3
    `;

    const result = await pool.query(query, [tenantId, dateRange.startDate, dateRange.endDate]);

    const byPlatformQuery = `
      SELECT
        platform,
        COUNT(*) as sent,
        COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked
      FROM review_requests
      WHERE tenant_id = $1
        AND sent_at BETWEEN $2 AND $3
      GROUP BY platform
      ORDER BY sent DESC
    `;

    const byPlatformResult = await pool.query(byPlatformQuery, [
      tenantId,
      dateRange.startDate,
      dateRange.endDate,
    ]);

    const row = result.rows[0];

    return {
      total_sent: parseInt(row.total_sent) || 0,
      total_clicked: parseInt(row.total_clicked) || 0,
      click_rate: parseFloat(row.click_rate) || 0,
      by_platform: byPlatformResult.rows.map((r) => ({
        platform: r.platform,
        sent: parseInt(r.sent) || 0,
        clicked: parseInt(r.clicked) || 0,
      })),
    };
  }

  /**
   * Get pending feedback alerts
   */
  static async getPendingAlerts(
    tenantId: string,
    options?: {
      providerId?: string;
      status?: string;
      limit?: number;
    }
  ): Promise<{
    id: string;
    alert_type: string;
    severity: string;
    title: string;
    message: string;
    nps_score: number;
    patient_name: string;
    provider_name: string;
    created_at: string;
    status: string;
  }[]> {
    const params: (string | number)[] = [tenantId];
    let filters = '';
    let paramIndex = 2;

    if (options?.providerId) {
      filters += ` AND sfa.provider_id = $${paramIndex}`;
      params.push(options.providerId);
      paramIndex++;
    }

    if (options?.status) {
      filters += ` AND sfa.status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    } else {
      filters += ` AND sfa.status NOT IN ('resolved', 'dismissed')`;
    }

    const limit = options?.limit || 50;
    params.push(limit);

    const query = `
      SELECT
        sfa.id,
        sfa.alert_type,
        sfa.severity,
        sfa.title,
        sfa.message,
        sfa.nps_score,
        p.first_name || ' ' || p.last_name as patient_name,
        COALESCE(pr.first_name || ' ' || pr.last_name, 'N/A') as provider_name,
        sfa.created_at::TEXT,
        sfa.status
      FROM survey_feedback_alerts sfa
      JOIN patients p ON sfa.patient_id = p.id
      LEFT JOIN providers pr ON sfa.provider_id = pr.id
      WHERE sfa.tenant_id = $1
        ${filters}
      ORDER BY
        CASE sfa.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        sfa.created_at DESC
      LIMIT $${paramIndex}
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Update feedback alert status
   */
  static async updateAlertStatus(
    alertId: string,
    tenantId: string,
    userId: string,
    status: 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed',
    notes?: string
  ): Promise<void> {
    const updates: string[] = ['status = $3'];
    const params: (string | null)[] = [alertId, tenantId, status];
    let paramIndex = 4;

    if (status === 'acknowledged') {
      updates.push(`acknowledged_at = NOW()`, `acknowledged_by = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (status === 'resolved' || status === 'dismissed') {
      updates.push(`resolved_at = NOW()`, `resolved_by = $${paramIndex}`);
      params.push(userId);
      paramIndex++;

      if (notes) {
        updates.push(`resolution_notes = $${paramIndex}`);
        params.push(notes);
        paramIndex++;
      }
    }

    const query = `
      UPDATE survey_feedback_alerts
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `;

    await pool.query(query, params);

    logger.info('Feedback alert status updated', { alertId, status, userId });
  }

  /**
   * Get survey invitations for a patient
   */
  static async getPatientSurveys(
    tenantId: string,
    patientId: string,
    options?: { limit?: number }
  ): Promise<{
    id: string;
    status: string;
    sent_at: string;
    completed_at: string | null;
    nps_score: number | null;
    provider_name: string;
  }[]> {
    const limit = options?.limit || 10;

    const query = `
      SELECT
        si.id,
        si.status,
        si.sent_at::TEXT,
        si.completed_at::TEXT,
        sr.nps_score,
        COALESCE(pr.first_name || ' ' || pr.last_name, 'N/A') as provider_name
      FROM survey_invitations si
      LEFT JOIN survey_responses sr ON si.id = sr.invitation_id
      LEFT JOIN providers pr ON si.provider_id = pr.id
      WHERE si.tenant_id = $1
        AND si.patient_id = $2
      ORDER BY si.created_at DESC
      LIMIT $3
    `;

    const result = await pool.query(query, [tenantId, patientId, limit]);
    return result.rows;
  }

  /**
   * Process scheduled survey jobs (called by job runner)
   */
  static async processScheduledJobs(): Promise<number> {
    const query = `
      SELECT *
      FROM survey_jobs
      WHERE status = 'pending'
        AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 100
    `;

    const result = await pool.query(query);
    let processedCount = 0;

    for (const job of result.rows) {
      try {
        await pool.query(
          `UPDATE survey_jobs SET status = 'processing' WHERE id = $1`,
          [job.id]
        );

        switch (job.job_type) {
          case 'send_survey':
            // Mark invitation as sent
            await pool.query(
              `UPDATE survey_invitations SET status = 'sent', sent_at = NOW() WHERE id = $1`,
              [job.invitation_id]
            );
            // TODO: Actually send email/SMS via notification service
            break;

          case 'send_reminder':
            await pool.query(
              `UPDATE survey_invitations SET reminder_sent_at = NOW() WHERE id = $1`,
              [job.invitation_id]
            );
            // TODO: Send reminder notification
            break;

          case 'expire_survey':
            await pool.query(
              `UPDATE survey_invitations SET status = 'expired' WHERE id = $1 AND status NOT IN ('completed', 'cancelled')`,
              [job.invitation_id]
            );
            break;
        }

        await pool.query(
          `UPDATE survey_jobs SET status = 'completed', executed_at = NOW() WHERE id = $1`,
          [job.id]
        );

        processedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await pool.query(
          `UPDATE survey_jobs SET status = 'failed', error_message = $2, retry_count = retry_count + 1 WHERE id = $1`,
          [job.id, errorMessage]
        );

        logger.error('Survey job failed', { jobId: job.id, error: errorMessage });
      }
    }

    return processedCount;
  }
}
