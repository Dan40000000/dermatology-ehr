/**
 * Patient Engagement API Routes
 * Handles campaigns, loyalty program, surveys, and reviews
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import { patientEngagementService } from '../services/patientEngagementService';
import { logger } from '../lib/logger';
import { userHasRole } from '../lib/roles';
import crypto from 'crypto';

const router = Router();

// ============================================================================
// CAMPAIGN ROUTES
// ============================================================================

/**
 * POST /api/engagement/campaigns
 * Create a new engagement campaign
 */
const createCampaignSchema = z.object({
  patientId: z.string().uuid(),
  campaignType: z.enum([
    'birthday',
    'anniversary',
    'seasonal',
    'adherence',
    'review_request',
    'survey',
    'educational',
    'loyalty',
    'custom',
  ]),
  campaignName: z.string().min(1).max(255),
  scheduledAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  sendImmediately: z.boolean().optional(),
});

router.post('/campaigns', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, campaignType, campaignName, scheduledAt, metadata, sendImmediately } = parsed.data;

    // Verify patient exists
    const patientResult = await pool.query(
      `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (!patientResult.rowCount) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // If send immediately and specific campaign type, use the service methods
    if (sendImmediately) {
      let result;
      switch (campaignType) {
        case 'birthday':
          result = await patientEngagementService.sendBirthdayMessage(tenantId, patientId, metadata?.offer as string | undefined);
          break;
        case 'anniversary':
          result = await patientEngagementService.sendAnniversaryMessage(
            tenantId,
            patientId,
            (metadata?.years as number) || 1,
            metadata?.offer as string | undefined
          );
          break;
        case 'seasonal':
          result = await patientEngagementService.sendSeasonalCampaign(
            tenantId,
            patientId,
            (metadata?.seasonalType as string) || 'general',
            (metadata?.message as string) || 'Check in with us for your skin health!',
            (metadata?.appointmentType as string) || 'appointment'
          );
          break;
        case 'review_request':
          const reviewResult = await patientEngagementService.requestReview(
            tenantId,
            patientId,
            (metadata?.appointmentId as string) || null,
            null,
            (metadata?.platform as string) || 'google'
          );
          return res.json({ success: true, requestId: reviewResult.requestId });
        default:
          // For other types, create a scheduled campaign
          const campaignResult = await patientEngagementService.createCampaign(
            tenantId,
            patientId,
            campaignType,
            campaignName,
            scheduledAt ? new Date(scheduledAt) : undefined,
            metadata
          );
          return res.json({ success: true, campaignId: campaignResult.campaignId });
      }

      if (result) {
        await auditLog(tenantId, userId, 'engagement_campaign_create', 'engagement_campaign', result.campaignId || 'unknown');
        return res.json({
          success: result.success,
          campaignId: result.campaignId,
          messageId: result.messageId,
          error: result.error,
        });
      }
    }

    // Create scheduled campaign
    const { campaignId } = await patientEngagementService.createCampaign(
      tenantId,
      patientId,
      campaignType,
      campaignName,
      scheduledAt ? new Date(scheduledAt) : undefined,
      metadata
    );

    await auditLog(tenantId, userId, 'engagement_campaign_create', 'engagement_campaign', campaignId);

    res.json({ success: true, campaignId });
  } catch (error: any) {
    logger.error('Error creating campaign', { error: error.message });
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/**
 * GET /api/engagement/campaigns/:patientId
 * Get campaigns for a patient
 */
router.get('/campaigns/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const campaignType = req.query.campaignType as string | undefined;
    const status = req.query.status as string | undefined;

    let query = `
      SELECT id, campaign_type as "campaignType", campaign_name as "campaignName",
             status, scheduled_at as "scheduledAt", sent_at as "sentAt",
             delivered_at as "deliveredAt", response, response_at as "responseAt",
             channel, template_used as "templateUsed", metadata, error_message as "errorMessage",
             created_at as "createdAt"
      FROM patient_engagement_campaigns
      WHERE tenant_id = $1 AND patient_id = $2
    `;

    const params: any[] = [tenantId, patientId];
    let paramIndex = 3;

    if (campaignType) {
      query += ` AND campaign_type = $${paramIndex}`;
      params.push(campaignType);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM patient_engagement_campaigns WHERE tenant_id = $1 AND patient_id = $2`;
    const countParams = [tenantId, patientId];

    if (campaignType) countQuery += ` AND campaign_type = '${campaignType}'`;
    if (status) countQuery += ` AND status = '${status}'`;

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      campaigns: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching campaigns', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// ============================================================================
// LOYALTY PROGRAM ROUTES
// ============================================================================

/**
 * GET /api/engagement/loyalty/:patientId
 * Get patient loyalty status
 */
router.get('/loyalty/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;

    const loyaltyStatus = await patientEngagementService.getLoyaltyStatus(tenantId, patientId);

    if (!loyaltyStatus) {
      return res.status(404).json({ error: 'Loyalty record not found' });
    }

    res.json(loyaltyStatus);
  } catch (error: any) {
    logger.error('Error fetching loyalty status', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch loyalty status' });
  }
});

/**
 * POST /api/engagement/loyalty/earn
 * Earn loyalty points
 */
const earnPointsSchema = z.object({
  patientId: z.string().uuid(),
  points: z.number().int().positive(),
  transactionType: z.enum([
    'earned_visit',
    'earned_referral',
    'earned_review',
    'earned_survey',
    'bonus',
    'adjustment',
  ]),
  description: z.string().min(1).max(255),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
});

router.post('/loyalty/earn', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = earnPointsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, points, transactionType, description, referenceType, referenceId } = parsed.data;

    const result = await patientEngagementService.earnPoints(
      tenantId,
      patientId,
      points,
      transactionType,
      description,
      referenceType,
      referenceId,
      userId
    );

    await auditLog(tenantId, userId, 'loyalty_points_earn', 'loyalty_transaction', result.transactionId);

    res.json({
      success: true,
      transactionId: result.transactionId,
      newBalance: result.newBalance,
      tierChanged: result.tierChanged,
    });
  } catch (error: any) {
    logger.error('Error earning points', { error: error.message });
    res.status(500).json({ error: 'Failed to earn points' });
  }
});

/**
 * POST /api/engagement/loyalty/redeem
 * Redeem loyalty points for a reward
 */
const redeemPointsSchema = z.object({
  patientId: z.string().uuid(),
  rewardId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

router.post('/loyalty/redeem', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = redeemPointsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, rewardId, appointmentId } = parsed.data;

    const result = await patientEngagementService.redeemPoints(
      tenantId,
      patientId,
      rewardId,
      appointmentId
    );

    await auditLog(tenantId, userId, 'loyalty_points_redeem', 'loyalty_redemption', result.redemptionId);

    res.json({
      success: true,
      redemptionId: result.redemptionId,
      pointsSpent: result.pointsSpent,
      newBalance: result.newBalance,
    });
  } catch (error: any) {
    logger.error('Error redeeming points', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to redeem points' });
  }
});

/**
 * GET /api/engagement/loyalty/rewards
 * Get available loyalty rewards
 */
router.get('/loyalty/rewards', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.query.patientId as string | undefined;

    let query = `
      SELECT lr.id, lr.name, lr.description, lr.points_required as "pointsRequired",
             lr.reward_type as "rewardType", lr.reward_value as "rewardValue",
             lr.quantity_available as "quantityAvailable", lr.quantity_redeemed as "quantityRedeemed",
             lr.valid_from as "validFrom", lr.valid_until as "validUntil",
             lr.min_tier as "minTier", lr.is_active as "isActive"
      FROM loyalty_rewards lr
      WHERE lr.tenant_id = $1
        AND lr.is_active = true
        AND (lr.valid_from IS NULL OR lr.valid_from <= CURRENT_DATE)
        AND (lr.valid_until IS NULL OR lr.valid_until >= CURRENT_DATE)
        AND (lr.quantity_available IS NULL OR lr.quantity_redeemed < lr.quantity_available)
      ORDER BY lr.points_required ASC
    `;

    const result = await pool.query(query, [tenantId]);

    // If patient ID provided, check eligibility for each reward
    if (patientId) {
      const loyaltyResult = await pool.query(
        `SELECT tier, points_balance FROM patient_loyalty_points
         WHERE tenant_id = $1 AND patient_id = $2`,
        [tenantId, patientId]
      );

      const patientTier = loyaltyResult.rows[0]?.tier || 'bronze';
      const patientBalance = loyaltyResult.rows[0]?.points_balance || 0;
      const tierRanks: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };
      const patientTierRank = tierRanks[patientTier] || 0;

      const rewardsWithEligibility = result.rows.map(reward => ({
        ...reward,
        canRedeem:
          patientBalance >= reward.pointsRequired &&
          (!reward.minTier || patientTierRank >= (tierRanks[reward.minTier] || 0)),
        pointsNeeded: Math.max(0, reward.pointsRequired - patientBalance),
      }));

      return res.json({ rewards: rewardsWithEligibility });
    }

    res.json({ rewards: result.rows });
  } catch (error: any) {
    logger.error('Error fetching rewards', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch rewards' });
  }
});

/**
 * GET /api/engagement/loyalty/transactions/:patientId
 * Get loyalty point transactions for a patient
 */
router.get('/loyalty/transactions/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await pool.query(
      `SELECT id, points, balance_after as "balanceAfter", transaction_type as "transactionType",
              description, reference_type as "referenceType", reference_id as "referenceId",
              created_at as "createdAt"
       FROM patient_loyalty_transactions
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, patientId, limit, offset]
    );

    res.json({ transactions: result.rows });
  } catch (error: any) {
    logger.error('Error fetching transactions', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ============================================================================
// SURVEY ROUTES
// ============================================================================

/**
 * POST /api/engagement/surveys
 * Submit a survey response
 */
const submitSurveySchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  surveyType: z.enum(['post_visit', 'nps', 'treatment_satisfaction', 'product_feedback', 'general']),
  responses: z.record(z.string(), z.any()),
  overallScore: z.number().int().min(1).max(10),
  npsScore: z.number().int().min(0).max(10).optional(),
  feedback: z.string().max(2000).optional(),
});

router.post('/surveys', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = submitSurveySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, appointmentId, surveyType, responses, overallScore, npsScore, feedback } = parsed.data;

    const result = await patientEngagementService.submitSurvey(
      tenantId,
      patientId,
      appointmentId || null,
      surveyType,
      responses,
      overallScore,
      npsScore,
      feedback
    );

    await auditLog(tenantId, userId, 'survey_submit', 'patient_survey', result.surveyId);

    res.json({
      success: true,
      surveyId: result.surveyId,
      sentiment: result.sentiment,
      followUpRequired: result.followUpRequired,
    });
  } catch (error: any) {
    logger.error('Error submitting survey', { error: error.message });
    res.status(500).json({ error: 'Failed to submit survey' });
  }
});

/**
 * GET /api/engagement/surveys/:patientId
 * Get surveys for a patient
 */
router.get('/surveys/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await pool.query(
      `SELECT ps.id, ps.appointment_id as "appointmentId", ps.survey_type as "surveyType",
              ps.overall_score as "overallScore", ps.nps_score as "npsScore",
              ps.feedback, ps.responses, ps.sentiment, ps.follow_up_required as "followUpRequired",
              ps.follow_up_completed as "followUpCompleted", ps.submitted_at as "submittedAt",
              pr.full_name as "providerName"
       FROM patient_surveys ps
       LEFT JOIN providers pr ON pr.id = ps.provider_id
       WHERE ps.tenant_id = $1 AND ps.patient_id = $2
       ORDER BY ps.submitted_at DESC
       LIMIT $3`,
      [tenantId, patientId, limit]
    );

    res.json({ surveys: result.rows });
  } catch (error: any) {
    logger.error('Error fetching surveys', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

/**
 * GET /api/engagement/surveys/analytics
 * Get survey analytics for the practice
 */
router.get('/surveys/analytics', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const days = parseInt(req.query.days as string) || 30;
    const providerId = req.query.providerId as string | undefined;

    let baseFilter = `tenant_id = $1 AND submitted_at >= NOW() - INTERVAL '${days} days'`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (providerId) {
      baseFilter += ` AND provider_id = $${paramIndex}`;
      params.push(providerId);
      paramIndex++;
    }

    const analyticsResult = await pool.query(
      `SELECT
         COUNT(*) as total_surveys,
         ROUND(AVG(overall_score), 2) as avg_overall_score,
         ROUND(AVG(nps_score), 2) as avg_nps_score,
         COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_count,
         COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_count,
         COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_count,
         COUNT(*) FILTER (WHERE follow_up_required = true) as follow_up_required,
         COUNT(*) FILTER (WHERE follow_up_required = true AND follow_up_completed = true) as follow_up_completed
       FROM patient_surveys
       WHERE ${baseFilter}`,
      params
    );

    // Calculate NPS
    const npsResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE nps_score >= 9) as promoters,
         COUNT(*) FILTER (WHERE nps_score >= 7 AND nps_score <= 8) as passives,
         COUNT(*) FILTER (WHERE nps_score <= 6) as detractors,
         COUNT(*) as total
       FROM patient_surveys
       WHERE ${baseFilter} AND nps_score IS NOT NULL`,
      params
    );

    const npsData = npsResult.rows[0];
    const npsScore = npsData.total > 0
      ? Math.round(((npsData.promoters - npsData.detractors) / npsData.total) * 100)
      : null;

    res.json({
      analytics: analyticsResult.rows[0],
      nps: {
        score: npsScore,
        promoters: parseInt(npsData.promoters),
        passives: parseInt(npsData.passives),
        detractors: parseInt(npsData.detractors),
      },
      period: `${days} days`,
    });
  } catch (error: any) {
    logger.error('Error fetching survey analytics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ============================================================================
// REVIEW ROUTES
// ============================================================================

/**
 * POST /api/engagement/reviews
 * Submit a review request or record a review
 */
const submitReviewSchema = z.object({
  patientId: z.string().uuid(),
  platform: z.enum(['google', 'yelp', 'healthgrades', 'facebook', 'internal']),
  rating: z.number().int().min(1).max(5).optional(),
  reviewText: z.string().max(2000).optional(),
  appointmentId: z.string().uuid().optional(),
  reviewUrl: z.string().url().optional(),
  requestOnly: z.boolean().optional(), // If true, just send review request
});

router.post('/reviews', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = submitReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, platform, rating, reviewText, appointmentId, reviewUrl, requestOnly } = parsed.data;

    if (requestOnly) {
      // Just send a review request
      const result = await patientEngagementService.requestReview(
        tenantId,
        patientId,
        appointmentId || null,
        null,
        platform
      );

      await auditLog(tenantId, userId, 'review_request', 'review_request', result.requestId);

      return res.json({ success: true, requestId: result.requestId });
    }

    // Record an actual review
    if (!rating) {
      return res.status(400).json({ error: 'Rating is required when submitting a review' });
    }

    const result = await patientEngagementService.submitReview(
      tenantId,
      patientId,
      platform,
      rating,
      reviewText,
      appointmentId,
      reviewUrl
    );

    await auditLog(tenantId, userId, 'review_submit', 'patient_review', result.reviewId);

    res.json({ success: true, reviewId: result.reviewId });
  } catch (error: any) {
    logger.error('Error handling review', { error: error.message });
    res.status(500).json({ error: 'Failed to process review' });
  }
});

/**
 * GET /api/engagement/reviews
 * Get reviews for the practice
 */
router.get('/reviews', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platform = req.query.platform as string | undefined;
    const status = req.query.status as string | undefined;
    const sentiment = req.query.sentiment as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT pr.id, pr.patient_id as "patientId", pr.platform, pr.rating,
             pr.review_text as "reviewText", pr.review_url as "reviewUrl",
             pr.status, pr.sentiment, pr.response_text as "responseText",
             pr.responded_at as "respondedAt", pr.published_at as "publishedAt",
             pr.created_at as "createdAt",
             p.first_name || ' ' || p.last_name as "patientName",
             prov.full_name as "providerName"
      FROM patient_reviews pr
      JOIN patients p ON p.id = pr.patient_id
      LEFT JOIN providers prov ON prov.id = pr.provider_id
      WHERE pr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (platform) {
      query += ` AND pr.platform = $${paramIndex}`;
      params.push(platform);
      paramIndex++;
    }

    if (status) {
      query += ` AND pr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (sentiment) {
      query += ` AND pr.sentiment = $${paramIndex}`;
      params.push(sentiment);
      paramIndex++;
    }

    query += ` ORDER BY pr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get summary stats
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) as total,
         ROUND(AVG(rating), 2) as avg_rating,
         COUNT(*) FILTER (WHERE rating >= 4) as positive,
         COUNT(*) FILTER (WHERE rating <= 2) as negative,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_response
       FROM patient_reviews
       WHERE tenant_id = $1`,
      [tenantId]
    );

    res.json({
      reviews: result.rows,
      stats: statsResult.rows[0],
      pagination: { limit, offset },
    });
  } catch (error: any) {
    logger.error('Error fetching reviews', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

/**
 * PUT /api/engagement/reviews/:reviewId/respond
 * Respond to a review
 */
const respondToReviewSchema = z.object({
  responseText: z.string().min(1).max(2000),
});

router.put('/reviews/:reviewId/respond', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const reviewId = req.params.reviewId as string;

    const parsed = respondToReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { responseText } = parsed.data;

    const result = await pool.query(
      `UPDATE patient_reviews
       SET response_text = $1, responded_at = NOW(), responded_by = $2, status = 'responded'
       WHERE id = $3 AND tenant_id = $4
       RETURNING id`,
      [responseText, userId, reviewId, tenantId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Review not found' });
    }

    await auditLog(tenantId, userId, 'review_respond', 'patient_review', reviewId);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error responding to review', { error: error.message });
    res.status(500).json({ error: 'Failed to respond to review' });
  }
});

// ============================================================================
// EDUCATIONAL CONTENT ROUTES
// ============================================================================

/**
 * GET /api/engagement/education/:patientId
 * Get educational content sent to a patient
 */
router.get('/education/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;

    const result = await pool.query(
      `SELECT pec.id, pec.sent_at as "sentAt", pec.viewed_at as "viewedAt",
              pec.diagnosis_code as "diagnosisCode", pec.channel,
              ec.title, ec.content_type as "contentType", ec.category,
              ec.body, ec.media_url as "mediaUrl", ec.reading_time_minutes as "readingTime"
       FROM patient_educational_content pec
       JOIN educational_content ec ON ec.id = pec.content_id
       WHERE pec.tenant_id = $1 AND pec.patient_id = $2
       ORDER BY pec.sent_at DESC
       LIMIT 50`,
      [tenantId, patientId]
    );

    res.json({ content: result.rows });
  } catch (error: any) {
    logger.error('Error fetching educational content', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

/**
 * POST /api/engagement/education/send
 * Send educational content to a patient
 */
const sendEducationSchema = z.object({
  patientId: z.string().uuid(),
  diagnosisCode: z.string().min(1).max(20),
  encounterId: z.string().uuid().optional(),
});

router.post('/education/send', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = sendEducationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, diagnosisCode, encounterId } = parsed.data;

    const result = await patientEngagementService.sendEducationalContent(
      tenantId,
      patientId,
      diagnosisCode,
      encounterId
    );

    await auditLog(tenantId, userId, 'education_content_send', 'patient', patientId);

    res.json({ success: true, contentSent: result.contentSent });
  } catch (error: any) {
    logger.error('Error sending educational content', { error: error.message });
    res.status(500).json({ error: 'Failed to send content' });
  }
});

// ============================================================================
// ADHERENCE REMINDER ROUTES
// ============================================================================

/**
 * POST /api/engagement/adherence/schedule
 * Schedule adherence reminders for a patient
 */
const scheduleAdherenceSchema = z.object({
  patientId: z.string().uuid(),
  reminderType: z.enum(['medication', 'skincare_routine', 'follow_up_appointment', 'reorder']),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/), // HH:MM format
  endDate: z.string().optional(),
  treatmentPlanId: z.string().uuid().optional(),
  prescriptionId: z.string().uuid().optional(),
});

router.post('/adherence/schedule', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = scheduleAdherenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, reminderType, frequency, scheduledTime, endDate, treatmentPlanId, prescriptionId } = parsed.data;

    const result = await patientEngagementService.scheduleAdherenceReminders(
      tenantId,
      patientId,
      reminderType,
      frequency,
      scheduledTime,
      endDate ? new Date(endDate) : undefined,
      treatmentPlanId,
      prescriptionId
    );

    await auditLog(tenantId, userId, 'adherence_reminder_schedule', 'adherence_reminder', result.reminderId);

    res.json({ success: true, reminderId: result.reminderId });
  } catch (error: any) {
    logger.error('Error scheduling adherence reminder', { error: error.message });
    res.status(500).json({ error: 'Failed to schedule reminder' });
  }
});

/**
 * GET /api/engagement/adherence/:patientId
 * Get adherence reminders for a patient
 */
router.get('/adherence/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;

    const result = await pool.query(
      `SELECT id, reminder_type as "reminderType", frequency, scheduled_time as "scheduledTime",
              next_reminder_at as "nextReminderAt", last_reminder_at as "lastReminderAt",
              acknowledgment_count as "acknowledgmentCount", skip_count as "skipCount",
              is_active as "isActive", end_date as "endDate", created_at as "createdAt"
       FROM treatment_adherence_reminders
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY created_at DESC`,
      [tenantId, patientId]
    );

    res.json({ reminders: result.rows });
  } catch (error: any) {
    logger.error('Error fetching adherence reminders', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

/**
 * DELETE /api/engagement/adherence/:reminderId
 * Deactivate an adherence reminder
 */
router.delete('/adherence/:reminderId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const reminderId = req.params.reminderId as string;

    const result = await pool.query(
      `UPDATE treatment_adherence_reminders
       SET is_active = false
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [reminderId, tenantId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    await auditLog(tenantId, userId, 'adherence_reminder_deactivate', 'adherence_reminder', reminderId);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deactivating reminder', { error: error.message });
    res.status(500).json({ error: 'Failed to deactivate reminder' });
  }
});

// ============================================================================
// PRODUCT RECOMMENDATIONS ROUTES
// ============================================================================

/**
 * GET /api/engagement/products/:patientId
 * Get product recommendations for a patient
 */
router.get('/products/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId as string;
    const status = req.query.status as string | undefined;

    let query = `
      SELECT id, product_name as "productName", product_category as "productCategory",
             product_sku as "productSku", recommendation_reason as "recommendationReason",
             source_diagnosis as "sourceDiagnosis", status, viewed_at as "viewedAt",
             purchased_at as "purchasedAt", reorder_due_date as "reorderDueDate",
             created_at as "createdAt"
      FROM product_recommendations
      WHERE tenant_id = $1 AND patient_id = $2
    `;

    const params: any[] = [tenantId, patientId];

    if (status) {
      query += ` AND status = $3`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    res.json({ recommendations: result.rows });
  } catch (error: any) {
    logger.error('Error fetching product recommendations', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

/**
 * POST /api/engagement/products/generate
 * Generate product recommendations based on diagnosis
 */
const generateRecommendationsSchema = z.object({
  patientId: z.string().uuid(),
  diagnosisCode: z.string().min(1).max(20),
  encounterId: z.string().uuid().optional(),
});

router.post('/products/generate', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = generateRecommendationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, diagnosisCode, encounterId } = parsed.data;

    const result = await patientEngagementService.generateProductRecommendations(
      tenantId,
      patientId,
      diagnosisCode,
      encounterId
    );

    await auditLog(tenantId, userId, 'product_recommendations_generate', 'patient', patientId);

    res.json({ success: true, recommendationIds: result.recommendationIds });
  } catch (error: any) {
    logger.error('Error generating product recommendations', { error: error.message });
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// ============================================================================
// ADMIN / BATCH PROCESSING ROUTES
// ============================================================================

/**
 * POST /api/engagement/process/birthdays
 * Process daily birthday and anniversary campaigns (admin only)
 */
router.post('/process/birthdays', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Check admin role
    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await patientEngagementService.processDailyBirthdayAndAnniversaryCampaigns(tenantId);

    await auditLog(tenantId, userId, 'engagement_process_birthdays', 'system', tenantId);

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error processing birthday campaigns', { error: error.message });
    res.status(500).json({ error: 'Failed to process campaigns' });
  }
});

/**
 * POST /api/engagement/process/surveys
 * Process scheduled surveys (admin only)
 */
router.post('/process/surveys', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await patientEngagementService.processScheduledSurveys(tenantId);

    await auditLog(tenantId, userId, 'engagement_process_surveys', 'system', tenantId);

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error processing surveys', { error: error.message });
    res.status(500).json({ error: 'Failed to process surveys' });
  }
});

/**
 * POST /api/engagement/process/adherence
 * Process adherence reminders (admin only)
 */
router.post('/process/adherence', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await patientEngagementService.processAdherenceReminders(tenantId);

    await auditLog(tenantId, userId, 'engagement_process_adherence', 'system', tenantId);

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error processing adherence reminders', { error: error.message });
    res.status(500).json({ error: 'Failed to process reminders' });
  }
});

/**
 * POST /api/engagement/process/seasonal
 * Process seasonal campaigns (admin only)
 */
router.post('/process/seasonal', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await patientEngagementService.processSeasonalCampaigns(tenantId);

    await auditLog(tenantId, userId, 'engagement_process_seasonal', 'system', tenantId);

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error processing seasonal campaigns', { error: error.message });
    res.status(500).json({ error: 'Failed to process campaigns' });
  }
});

export const patientEngagementRouter = router;
