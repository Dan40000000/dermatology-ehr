/**
 * Patient Engagement Service
 * Manages patient engagement through loyalty programs, campaigns, surveys, reviews,
 * educational content delivery, and treatment adherence reminders.
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import { smsWorkflowService, SMS_TEMPLATES } from './smsWorkflowService';

// ============================================
// ENGAGEMENT SMS TEMPLATES
// ============================================

export const ENGAGEMENT_SMS_TEMPLATES = {
  // Birthday/Anniversary Messages
  BIRTHDAY_MESSAGE:
    `Happy Birthday, {patientName}! The team at {clinicName} wishes you a wonderful day! As our gift, enjoy {offer} on your next visit. Call {clinicPhone} to schedule. Reply STOP to opt out.`,

  ANNIVERSARY_MESSAGE:
    `Happy {years} year anniversary with {clinicName}, {patientName}! Thank you for trusting us with your skin health. Enjoy {offer} as our thank you gift!`,

  // Survey/Review Requests
  SURVEY_REQUEST:
    `Hi {patientName}! We hope your recent visit to {clinicName} went well. We'd love your feedback! Please take a quick survey: {surveyLink}. Your opinion helps us improve!`,

  REVIEW_REQUEST:
    `{patientName}, thank you for choosing {clinicName}! If you had a great experience, we'd appreciate a review on Google: {reviewLink}. It helps others find quality care!`,

  // Adherence Reminders
  ADHERENCE_REMINDER:
    `Hi {patientName}! This is a friendly reminder from {clinicName} to {reminderAction}. Consistency is key to great results! Questions? Call {clinicPhone}.`,

  PRODUCT_REORDER:
    `{patientName}, it's time to reorder your {productName} from {clinicName}! Running low on skincare essentials? Call {clinicPhone} or visit our online store.`,

  // Loyalty Program
  LOYALTY_MILESTONE:
    `Congratulations, {patientName}! You've reached {tierName} status in the {clinicName} Loyalty Program! Enjoy {benefits}. Thank you for your loyalty!`,

  LOYALTY_POINTS_EARNED:
    `{patientName}, you earned {points} loyalty points at {clinicName}! Current balance: {balance} pts. {tierMessage}`,

  // Seasonal Alerts
  SEASONAL_ALERT:
    `{patientName}, {seasonalMessage} Schedule your {appointmentType} at {clinicName}: {clinicPhone}. Your skin health matters!`,

  // Educational Content
  EDUCATIONAL_CONTENT:
    `{patientName}, we have helpful information about {topic} from {clinicName}. Learn more: {contentLink}. Questions? Call {clinicPhone}.`,
};

// ============================================
// INTERFACES
// ============================================

export interface LoyaltyTier {
  name: string;
  minPoints: number;
  maxPoints: number | null;
  benefits: Record<string, any>;
  color: string;
  badgeText: string;
}

export interface LoyaltyStatus {
  patientId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: string;
  tierConfig: LoyaltyTier | null;
  pointsToNextTier: number | null;
  recentTransactions: any[];
}

export interface CampaignResult {
  success: boolean;
  campaignId?: string;
  messageId?: string;
  error?: string;
}

export interface SurveyResult {
  surveyId: string;
  scores: {
    overall: number;
    nps: number;
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  followUpRequired: boolean;
}

// ============================================
// PATIENT ENGAGEMENT SERVICE CLASS
// ============================================

export class PatientEngagementService {

  // ============================================
  // BIRTHDAY & ANNIVERSARY CAMPAIGNS
  // ============================================

  /**
   * Send birthday message to patient
   */
  async sendBirthdayMessage(
    tenantId: string,
    patientId: string,
    offer?: string
  ): Promise<CampaignResult> {
    try {
      // Get patient info
      const patientResult = await pool.query(
        `SELECT p.*, ps.opted_in, ps.marketing
         FROM patients p
         LEFT JOIN patient_sms_preferences ps ON ps.patient_id = p.id AND ps.tenant_id = p.tenant_id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [patientId, tenantId]
      );

      if (!patientResult.rowCount) {
        return { success: false, error: 'Patient not found' };
      }

      const patient = patientResult.rows[0];

      // Check opt-in for marketing messages
      if (patient.opted_in === false || patient.marketing === false) {
        return { success: false, error: 'Patient opted out of marketing' };
      }

      // Create campaign record
      const campaignId = crypto.randomUUID();
      const defaultOffer = '10% off any service';

      await pool.query(
        `INSERT INTO patient_engagement_campaigns
         (id, tenant_id, patient_id, campaign_type, campaign_name, status, template_used, metadata)
         VALUES ($1, $2, $3, 'birthday', 'Birthday Message', 'pending', 'BIRTHDAY_MESSAGE', $4)`,
        [campaignId, tenantId, patientId, JSON.stringify({ offer: offer || defaultOffer })]
      );

      // Send SMS
      const smsResult = await smsWorkflowService.sendWorkflowSMS({
        tenantId,
        patientId,
        template: ENGAGEMENT_SMS_TEMPLATES.BIRTHDAY_MESSAGE,
        variables: {
          offer: offer || defaultOffer,
        },
        messageType: 'birthday_message',
      });

      // Update campaign status
      await pool.query(
        `UPDATE patient_engagement_campaigns
         SET status = $1, sent_at = $2, message_id = $3, error_message = $4
         WHERE id = $5`,
        [
          smsResult.success ? 'sent' : 'failed',
          smsResult.success ? new Date() : null,
          smsResult.messageId || null,
          smsResult.error || null,
          campaignId,
        ]
      );

      // Award loyalty points for birthday
      if (smsResult.success) {
        await this.earnPoints(tenantId, patientId, 50, 'bonus', 'Birthday bonus points!');
      }

      logger.info('Birthday message campaign', { campaignId, success: smsResult.success });

      return {
        success: smsResult.success,
        campaignId,
        messageId: smsResult.messageId,
        error: smsResult.error,
      };
    } catch (error: any) {
      logger.error('Error sending birthday message', { error: error.message, patientId });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send anniversary message to patient
   */
  async sendAnniversaryMessage(
    tenantId: string,
    patientId: string,
    years: number,
    offer?: string
  ): Promise<CampaignResult> {
    try {
      const patientResult = await pool.query(
        `SELECT * FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (!patientResult.rowCount) {
        return { success: false, error: 'Patient not found' };
      }

      const campaignId = crypto.randomUUID();
      const defaultOffer = `${years * 5}% off your next treatment`;

      await pool.query(
        `INSERT INTO patient_engagement_campaigns
         (id, tenant_id, patient_id, campaign_type, campaign_name, status, template_used, metadata)
         VALUES ($1, $2, $3, 'anniversary', $4, 'pending', 'ANNIVERSARY_MESSAGE', $5)`,
        [
          campaignId,
          tenantId,
          patientId,
          `${years} Year Anniversary`,
          JSON.stringify({ years, offer: offer || defaultOffer }),
        ]
      );

      const smsResult = await smsWorkflowService.sendWorkflowSMS({
        tenantId,
        patientId,
        template: ENGAGEMENT_SMS_TEMPLATES.ANNIVERSARY_MESSAGE,
        variables: {
          years: years.toString(),
          offer: offer || defaultOffer,
        },
        messageType: 'anniversary_message',
      });

      await pool.query(
        `UPDATE patient_engagement_campaigns
         SET status = $1, sent_at = $2, message_id = $3, error_message = $4
         WHERE id = $5`,
        [
          smsResult.success ? 'sent' : 'failed',
          smsResult.success ? new Date() : null,
          smsResult.messageId || null,
          smsResult.error || null,
          campaignId,
        ]
      );

      // Award anniversary bonus points
      if (smsResult.success) {
        await this.earnPoints(tenantId, patientId, years * 25, 'bonus', `${years} year anniversary bonus!`);
      }

      return {
        success: smsResult.success,
        campaignId,
        messageId: smsResult.messageId,
        error: smsResult.error,
      };
    } catch (error: any) {
      logger.error('Error sending anniversary message', { error: error.message, patientId });
      return { success: false, error: error.message };
    }
  }

  /**
   * Process daily birthday and anniversary campaigns
   */
  async processDailyBirthdayAndAnniversaryCampaigns(tenantId: string): Promise<{
    birthdaysSent: number;
    anniversariesSent: number;
  }> {
    let birthdaysSent = 0;
    let anniversariesSent = 0;

    try {
      // Find patients with birthdays today
      const birthdaysResult = await pool.query(
        `SELECT p.id, p.first_name, p.last_name
         FROM patients p
         LEFT JOIN patient_sms_preferences ps ON ps.patient_id = p.id AND ps.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1
           AND EXTRACT(MONTH FROM p.date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(DAY FROM p.date_of_birth) = EXTRACT(DAY FROM CURRENT_DATE)
           AND (ps.opted_in IS NULL OR ps.opted_in = true)
           AND (ps.marketing IS NULL OR ps.marketing = true)
           AND NOT EXISTS (
             SELECT 1 FROM patient_engagement_campaigns ec
             WHERE ec.patient_id = p.id
               AND ec.campaign_type = 'birthday'
               AND ec.created_at::DATE = CURRENT_DATE
           )`,
        [tenantId]
      );

      for (const patient of birthdaysResult.rows) {
        const result = await this.sendBirthdayMessage(tenantId, patient.id);
        if (result.success) birthdaysSent++;
      }

      // Find patients with anniversaries (first visit anniversary)
      const anniversariesResult = await pool.query(
        `SELECT p.id, p.first_name,
                EXTRACT(YEAR FROM age(CURRENT_DATE, MIN(a.start_time)::DATE))::INT as years
         FROM patients p
         JOIN appointments a ON a.patient_id = p.id AND a.status = 'completed'
         LEFT JOIN patient_sms_preferences ps ON ps.patient_id = p.id AND ps.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1
           AND (ps.opted_in IS NULL OR ps.opted_in = true)
           AND (ps.marketing IS NULL OR ps.marketing = true)
         GROUP BY p.id, p.first_name
         HAVING
           EXTRACT(MONTH FROM MIN(a.start_time)) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(DAY FROM MIN(a.start_time)) = EXTRACT(DAY FROM CURRENT_DATE)
           AND EXTRACT(YEAR FROM age(CURRENT_DATE, MIN(a.start_time)::DATE)) >= 1
           AND NOT EXISTS (
             SELECT 1 FROM patient_engagement_campaigns ec
             WHERE ec.patient_id = p.id
               AND ec.campaign_type = 'anniversary'
               AND ec.created_at::DATE = CURRENT_DATE
           )`,
        [tenantId]
      );

      for (const patient of anniversariesResult.rows) {
        const result = await this.sendAnniversaryMessage(tenantId, patient.id, patient.years);
        if (result.success) anniversariesSent++;
      }

      logger.info('Processed birthday/anniversary campaigns', {
        tenantId,
        birthdaysSent,
        anniversariesSent,
      });

      return { birthdaysSent, anniversariesSent };
    } catch (error: any) {
      logger.error('Error processing birthday/anniversary campaigns', { error: error.message });
      throw error;
    }
  }

  // ============================================
  // POST-APPOINTMENT SURVEY TRIGGERS
  // ============================================

  /**
   * Schedule post-appointment survey (triggered 2-4 hours after visit)
   */
  async schedulePostAppointmentSurvey(
    tenantId: string,
    appointmentId: string,
    delayHours: number = 3
  ): Promise<{ surveyQueueId: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get appointment details
      const apptResult = await client.query(
        `SELECT a.*, p.first_name, p.last_name, pr.full_name as provider_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN providers pr ON pr.id = a.provider_id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, tenantId]
      );

      if (!apptResult.rowCount) {
        throw new Error('Appointment not found');
      }

      const appt = apptResult.rows[0];
      const sendTime = new Date();
      sendTime.setHours(sendTime.getHours() + delayHours);

      // Get default survey template
      const templateResult = await client.query(
        `SELECT id FROM survey_templates
         WHERE tenant_id = $1 AND survey_type = 'post_visit' AND is_default = true AND is_active = true
         LIMIT 1`,
        [tenantId]
      );

      const surveyQueueId = crypto.randomUUID();

      await client.query(
        `INSERT INTO survey_queue
         (id, tenant_id, appointment_id, patient_id, survey_type, scheduled_time, status)
         VALUES ($1, $2, $3, $4, 'satisfaction', $5, 'scheduled')`,
        [surveyQueueId, tenantId, appointmentId, appt.patient_id, sendTime]
      );

      await client.query('COMMIT');

      logger.info('Survey scheduled', { surveyQueueId, appointmentId, sendTime });

      return { surveyQueueId };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error scheduling survey', { error: error.message, appointmentId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process scheduled surveys and send requests
   */
  async processScheduledSurveys(tenantId: string): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    try {
      const surveysResult = await pool.query(
        `SELECT sq.*, a.patient_id, p.first_name
         FROM survey_queue sq
         JOIN appointments a ON a.id = sq.appointment_id
         JOIN patients p ON p.id = a.patient_id
         WHERE sq.tenant_id = $1
           AND sq.status = 'scheduled'
           AND sq.scheduled_time <= NOW()
         LIMIT 50`,
        [tenantId]
      );

      for (const survey of surveysResult.rows) {
        try {
          // Generate survey link (would be actual portal link in production)
          const surveyLink = `https://portal.clinic.com/survey/${survey.id}`;

          const smsResult = await smsWorkflowService.sendWorkflowSMS({
            tenantId,
            patientId: survey.patient_id,
            template: ENGAGEMENT_SMS_TEMPLATES.SURVEY_REQUEST,
            variables: { surveyLink },
            messageType: 'survey_request',
          });

          await pool.query(
            `UPDATE survey_queue
             SET status = $1, sent_at = NOW()
             WHERE id = $2`,
            [smsResult.success ? 'sent' : 'failed', survey.id]
          );

          if (smsResult.success) sent++;
          else failed++;
        } catch (error: any) {
          logger.error('Error sending survey', { surveyId: survey.id, error: error.message });
          failed++;
        }
      }

      return { sent, failed };
    } catch (error: any) {
      logger.error('Error processing scheduled surveys', { error: error.message });
      throw error;
    }
  }

  /**
   * Submit survey response
   */
  async submitSurvey(
    tenantId: string,
    patientId: string,
    appointmentId: string | null,
    surveyType: string,
    responses: Record<string, any>,
    overallScore: number,
    npsScore?: number,
    feedback?: string
  ): Promise<SurveyResult> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Analyze sentiment
      const sentiment = this.analyzeSentiment(overallScore, npsScore, feedback);
      const followUpRequired = sentiment === 'negative' || (npsScore !== undefined && npsScore < 7);

      const surveyId = crypto.randomUUID();

      // Get provider from appointment if provided
      let providerId = null;
      if (appointmentId) {
        const apptResult = await client.query(
          `SELECT provider_id FROM appointments WHERE id = $1`,
          [appointmentId]
        );
        if (apptResult.rowCount) {
          providerId = apptResult.rows[0].provider_id;
        }
      }

      await client.query(
        `INSERT INTO patient_surveys
         (id, tenant_id, patient_id, appointment_id, provider_id, survey_type,
          overall_score, nps_score, feedback, responses, sentiment, follow_up_required)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          surveyId,
          tenantId,
          patientId,
          appointmentId,
          providerId,
          surveyType,
          overallScore,
          npsScore,
          feedback,
          JSON.stringify(responses),
          sentiment,
          followUpRequired,
        ]
      );

      // Update survey queue if this was a scheduled survey
      if (appointmentId) {
        await client.query(
          `UPDATE survey_queue
           SET status = 'completed', response = $1
           WHERE appointment_id = $2 AND tenant_id = $3 AND status = 'sent'`,
          [JSON.stringify({ surveyId, responses }), appointmentId, tenantId]
        );
      }

      // Award loyalty points for completing survey
      await this.earnPoints(tenantId, patientId, 25, 'earned_survey', 'Survey completion bonus', 'survey', surveyId);

      // If positive sentiment, request review
      if (sentiment === 'positive' && npsScore && npsScore >= 9) {
        await this.requestReview(tenantId, patientId, appointmentId, surveyId, 'google');
      }

      await client.query('COMMIT');

      return {
        surveyId,
        scores: { overall: overallScore, nps: npsScore || 0 },
        sentiment,
        followUpRequired,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error submitting survey', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  private analyzeSentiment(overallScore: number, npsScore?: number, feedback?: string): 'positive' | 'neutral' | 'negative' {
    // Simple sentiment analysis based on scores
    if (overallScore >= 4 || (npsScore && npsScore >= 8)) {
      return 'positive';
    } else if (overallScore <= 2 || (npsScore && npsScore <= 5)) {
      return 'negative';
    }
    return 'neutral';
  }

  // ============================================
  // TREATMENT ADHERENCE REMINDERS
  // ============================================

  /**
   * Schedule treatment adherence reminders for a treatment plan
   */
  async scheduleAdherenceReminders(
    tenantId: string,
    patientId: string,
    reminderType: string,
    frequency: string,
    scheduledTime: string, // HH:MM format
    endDate?: Date,
    treatmentPlanId?: string,
    prescriptionId?: string
  ): Promise<{ reminderId: string }> {
    try {
      const reminderId = crypto.randomUUID();

      // Calculate next reminder time
      const timeParts = scheduledTime.split(':').map(Number);
      const hours = timeParts[0] ?? 9;
      const minutes = timeParts[1] ?? 0;
      const nextReminder = new Date();
      nextReminder.setHours(hours, minutes, 0, 0);
      if (nextReminder < new Date()) {
        nextReminder.setDate(nextReminder.getDate() + 1);
      }

      await pool.query(
        `INSERT INTO treatment_adherence_reminders
         (id, tenant_id, patient_id, treatment_plan_id, prescription_id,
          reminder_type, frequency, scheduled_time, next_reminder_at, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          reminderId,
          tenantId,
          patientId,
          treatmentPlanId,
          prescriptionId,
          reminderType,
          frequency,
          scheduledTime,
          nextReminder,
          endDate,
        ]
      );

      logger.info('Adherence reminder scheduled', { reminderId, patientId, reminderType });

      return { reminderId };
    } catch (error: any) {
      logger.error('Error scheduling adherence reminder', { error: error.message });
      throw error;
    }
  }

  /**
   * Process due adherence reminders
   */
  async processAdherenceReminders(tenantId: string): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    try {
      const remindersResult = await pool.query(
        `SELECT tar.*, p.first_name
         FROM treatment_adherence_reminders tar
         JOIN patients p ON p.id = tar.patient_id
         WHERE tar.tenant_id = $1
           AND tar.is_active = true
           AND tar.next_reminder_at <= NOW()
           AND (tar.end_date IS NULL OR tar.end_date >= CURRENT_DATE)
         LIMIT 100`,
        [tenantId]
      );

      for (const reminder of remindersResult.rows) {
        try {
          const reminderActions: Record<string, string> = {
            medication: 'take your prescribed medication',
            skincare_routine: 'follow your skincare routine',
            follow_up_appointment: 'schedule your follow-up appointment',
            reorder: 'reorder your skincare products',
          };

          const smsResult = await smsWorkflowService.sendWorkflowSMS({
            tenantId,
            patientId: reminder.patient_id,
            template: ENGAGEMENT_SMS_TEMPLATES.ADHERENCE_REMINDER,
            variables: {
              reminderAction: reminderActions[reminder.reminder_type] || 'follow your treatment plan',
            },
            messageType: 'adherence_reminder',
          });

          // Calculate next reminder time based on frequency
          const nextReminder = this.calculateNextReminderTime(
            reminder.frequency,
            reminder.scheduled_time
          );

          await pool.query(
            `UPDATE treatment_adherence_reminders
             SET last_reminder_at = NOW(), next_reminder_at = $1
             WHERE id = $2`,
            [nextReminder, reminder.id]
          );

          if (smsResult.success) sent++;
          else failed++;
        } catch (error: any) {
          logger.error('Error sending adherence reminder', {
            reminderId: reminder.id,
            error: error.message,
          });
          failed++;
        }
      }

      return { sent, failed };
    } catch (error: any) {
      logger.error('Error processing adherence reminders', { error: error.message });
      throw error;
    }
  }

  private calculateNextReminderTime(frequency: string, scheduledTime: string): Date {
    const timeParts = scheduledTime.split(':').map(Number);
    const hours = timeParts[0] ?? 9;
    const minutes = timeParts[1] ?? 0;
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);

    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        next.setDate(next.getDate() + 1);
    }

    return next;
  }

  // ============================================
  // SKINCARE PRODUCT RECOMMENDATIONS
  // ============================================

  /**
   * Generate skincare product recommendations based on diagnosis
   */
  async generateProductRecommendations(
    tenantId: string,
    patientId: string,
    diagnosisCode: string,
    encounterId?: string
  ): Promise<{ recommendationIds: string[] }> {
    try {
      // Product recommendations by diagnosis category
      const recommendationsByDiagnosis: Record<string, Array<{ name: string; category: string; reason: string }>> = {
        // Actinic keratosis / Sun damage
        'L57.0': [
          { name: 'Broad Spectrum SPF 50+ Sunscreen', category: 'sunscreen', reason: 'Sun protection to prevent further UV damage' },
          { name: 'Vitamin C Serum', category: 'treatment', reason: 'Antioxidant protection and skin brightening' },
        ],
        // Acne
        'L70.0': [
          { name: 'Gentle Foaming Cleanser', category: 'cleanser', reason: 'Non-irritating daily cleansing' },
          { name: 'Benzoyl Peroxide 2.5% Treatment', category: 'treatment', reason: 'Acne-fighting ingredient' },
          { name: 'Oil-Free Moisturizer', category: 'moisturizer', reason: 'Hydration without clogging pores' },
        ],
        // Eczema / Atopic dermatitis
        'L20.9': [
          { name: 'Fragrance-Free Gentle Cleanser', category: 'cleanser', reason: 'Sensitive skin cleansing' },
          { name: 'Ceramide-Rich Moisturizer', category: 'moisturizer', reason: 'Barrier repair and deep hydration' },
          { name: 'Colloidal Oatmeal Cream', category: 'treatment', reason: 'Soothing irritated skin' },
        ],
        // Psoriasis
        'L40.0': [
          { name: 'Coal Tar Shampoo', category: 'treatment', reason: 'Scalp psoriasis relief' },
          { name: 'Thick Emollient Cream', category: 'moisturizer', reason: 'Scale softening and hydration' },
          { name: 'Salicylic Acid Treatment', category: 'treatment', reason: 'Scale removal' },
        ],
        // Rosacea
        'L71.9': [
          { name: 'Gentle Micellar Water', category: 'cleanser', reason: 'No-rinse gentle cleansing' },
          { name: 'Niacinamide Serum', category: 'treatment', reason: 'Redness reduction' },
          { name: 'Mineral SPF 30+ Sunscreen', category: 'sunscreen', reason: 'Physical sun protection for sensitive skin' },
        ],
      };

      const recommendations = recommendationsByDiagnosis[diagnosisCode] || [
        { name: 'Gentle Daily Cleanser', category: 'cleanser', reason: 'Daily skin cleansing' },
        { name: 'Broad Spectrum SPF 30+ Sunscreen', category: 'sunscreen', reason: 'Daily sun protection' },
      ];

      const recommendationIds: string[] = [];

      for (const rec of recommendations) {
        const recId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO product_recommendations
           (id, tenant_id, patient_id, product_name, product_category,
            recommendation_reason, source_diagnosis, source_encounter_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            recId,
            tenantId,
            patientId,
            rec.name,
            rec.category,
            rec.reason,
            diagnosisCode,
            encounterId,
          ]
        );
        recommendationIds.push(recId);
      }

      logger.info('Product recommendations generated', {
        patientId,
        diagnosisCode,
        count: recommendationIds.length,
      });

      return { recommendationIds };
    } catch (error: any) {
      logger.error('Error generating product recommendations', { error: error.message });
      throw error;
    }
  }

  /**
   * Send product reorder reminder
   */
  async sendProductReorderReminder(
    tenantId: string,
    patientId: string,
    productName: string
  ): Promise<CampaignResult> {
    try {
      const campaignId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO patient_engagement_campaigns
         (id, tenant_id, patient_id, campaign_type, campaign_name, status, template_used, metadata)
         VALUES ($1, $2, $3, 'product_reorder', $4, 'pending', 'PRODUCT_REORDER', $5)`,
        [campaignId, tenantId, patientId, `Reorder: ${productName}`, JSON.stringify({ productName })]
      );

      const smsResult = await smsWorkflowService.sendWorkflowSMS({
        tenantId,
        patientId,
        template: ENGAGEMENT_SMS_TEMPLATES.PRODUCT_REORDER,
        variables: { productName },
        messageType: 'product_reorder',
      });

      await pool.query(
        `UPDATE patient_engagement_campaigns
         SET status = $1, sent_at = $2, message_id = $3
         WHERE id = $4`,
        [smsResult.success ? 'sent' : 'failed', smsResult.success ? new Date() : null, smsResult.messageId, campaignId]
      );

      return { success: smsResult.success, campaignId, messageId: smsResult.messageId, error: smsResult.error };
    } catch (error: any) {
      logger.error('Error sending product reorder reminder', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // SEASONAL CAMPAIGNS
  // ============================================

  /**
   * Send seasonal campaign message
   */
  async sendSeasonalCampaign(
    tenantId: string,
    patientId: string,
    campaignType: string,
    seasonalMessage: string,
    appointmentType: string
  ): Promise<CampaignResult> {
    try {
      const campaignId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO patient_engagement_campaigns
         (id, tenant_id, patient_id, campaign_type, campaign_name, status, template_used, metadata)
         VALUES ($1, $2, $3, $4, $5, 'pending', 'SEASONAL_ALERT', $6)`,
        [
          campaignId,
          tenantId,
          patientId,
          'seasonal',
          campaignType,
          JSON.stringify({ campaignType, seasonalMessage, appointmentType }),
        ]
      );

      const smsResult = await smsWorkflowService.sendWorkflowSMS({
        tenantId,
        patientId,
        template: ENGAGEMENT_SMS_TEMPLATES.SEASONAL_ALERT,
        variables: { seasonalMessage, appointmentType },
        messageType: 'seasonal_campaign',
      });

      await pool.query(
        `UPDATE patient_engagement_campaigns
         SET status = $1, sent_at = $2, message_id = $3
         WHERE id = $4`,
        [smsResult.success ? 'sent' : 'failed', smsResult.success ? new Date() : null, smsResult.messageId, campaignId]
      );

      return { success: smsResult.success, campaignId, messageId: smsResult.messageId, error: smsResult.error };
    } catch (error: any) {
      logger.error('Error sending seasonal campaign', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Process active seasonal campaigns
   */
  async processSeasonalCampaigns(tenantId: string): Promise<{ campaignsSent: number }> {
    let campaignsSent = 0;

    try {
      const campaignsResult = await pool.query(
        `SELECT * FROM seasonal_campaigns
         WHERE tenant_id = $1
           AND is_active = true
           AND auto_enroll = true
           AND start_date <= CURRENT_DATE
           AND end_date >= CURRENT_DATE`,
        [tenantId]
      );

      for (const campaign of campaignsResult.rows) {
        // Find eligible patients who haven't received this campaign
        const eligiblePatients = await pool.query(
          `SELECT p.id
           FROM patients p
           LEFT JOIN patient_sms_preferences ps ON ps.patient_id = p.id
           WHERE p.tenant_id = $1
             AND (ps.opted_in IS NULL OR ps.opted_in = true)
             AND NOT EXISTS (
               SELECT 1 FROM patient_engagement_campaigns ec
               WHERE ec.patient_id = p.id
                 AND ec.campaign_type = 'seasonal'
                 AND ec.metadata->>'campaignType' = $2
                 AND ec.created_at > $3
             )
           LIMIT 100`,
          [tenantId, campaign.campaign_type, campaign.start_date]
        );

        const seasonalMessages: Record<string, { message: string; appointmentType: string }> = {
          sun_protection: {
            message: "Summer is here! Protect your skin from UV damage.",
            appointmentType: 'skin check',
          },
          skin_check: {
            message: "It's Skin Cancer Awareness Month! Early detection saves lives.",
            appointmentType: 'annual skin exam',
          },
          winter_care: {
            message: "Cold weather can be tough on your skin. Combat winter dryness!",
            appointmentType: 'consultation',
          },
        };

        const campaignConfig = seasonalMessages[campaign.campaign_type] || {
          message: campaign.message_template,
          appointmentType: 'appointment',
        };

        for (const patient of eligiblePatients.rows) {
          const result = await this.sendSeasonalCampaign(
            tenantId,
            patient.id,
            campaign.campaign_type,
            campaignConfig.message,
            campaignConfig.appointmentType
          );
          if (result.success) campaignsSent++;
        }
      }

      return { campaignsSent };
    } catch (error: any) {
      logger.error('Error processing seasonal campaigns', { error: error.message });
      throw error;
    }
  }

  // ============================================
  // LOYALTY PROGRAM
  // ============================================

  /**
   * Get patient loyalty status
   */
  async getLoyaltyStatus(tenantId: string, patientId: string): Promise<LoyaltyStatus | null> {
    try {
      // Get or create loyalty record
      await pool.query(
        `INSERT INTO patient_loyalty_points (tenant_id, patient_id, points_balance, lifetime_points, tier)
         VALUES ($1, $2, 0, 0, 'bronze')
         ON CONFLICT (tenant_id, patient_id) DO NOTHING`,
        [tenantId, patientId]
      );

      const loyaltyResult = await pool.query(
        `SELECT plp.*, ltc.min_points, ltc.max_points, ltc.benefits, ltc.color, ltc.badge_text
         FROM patient_loyalty_points plp
         LEFT JOIN loyalty_tier_config ltc ON ltc.tenant_id = plp.tenant_id AND ltc.tier_name = plp.tier
         WHERE plp.tenant_id = $1 AND plp.patient_id = $2`,
        [tenantId, patientId]
      );

      if (!loyaltyResult.rowCount) {
        return null;
      }

      const loyalty = loyaltyResult.rows[0];

      // Get next tier info
      const nextTierResult = await pool.query(
        `SELECT tier_name, min_points FROM loyalty_tier_config
         WHERE tenant_id = $1 AND min_points > $2 AND is_active = true
         ORDER BY min_points ASC LIMIT 1`,
        [tenantId, loyalty.lifetime_points]
      );

      const pointsToNextTier = nextTierResult.rowCount
        ? nextTierResult.rows[0].min_points - loyalty.lifetime_points
        : null;

      // Get recent transactions
      const transactionsResult = await pool.query(
        `SELECT id, points, transaction_type, description, created_at
         FROM patient_loyalty_transactions
         WHERE tenant_id = $1 AND patient_id = $2
         ORDER BY created_at DESC LIMIT 10`,
        [tenantId, patientId]
      );

      return {
        patientId,
        pointsBalance: loyalty.points_balance,
        lifetimePoints: loyalty.lifetime_points,
        tier: loyalty.tier,
        tierConfig: loyalty.min_points !== undefined ? {
          name: loyalty.tier,
          minPoints: loyalty.min_points,
          maxPoints: loyalty.max_points,
          benefits: loyalty.benefits || {},
          color: loyalty.color,
          badgeText: loyalty.badge_text,
        } : null,
        pointsToNextTier,
        recentTransactions: transactionsResult.rows,
      };
    } catch (error: any) {
      logger.error('Error getting loyalty status', { error: error.message, patientId });
      throw error;
    }
  }

  /**
   * Earn loyalty points
   */
  async earnPoints(
    tenantId: string,
    patientId: string,
    points: number,
    transactionType: string,
    description: string,
    referenceType?: string,
    referenceId?: string,
    createdBy?: string
  ): Promise<{ transactionId: string; newBalance: number; tierChanged: boolean }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure loyalty record exists
      await client.query(
        `INSERT INTO patient_loyalty_points (tenant_id, patient_id, points_balance, lifetime_points, tier)
         VALUES ($1, $2, 0, 0, 'bronze')
         ON CONFLICT (tenant_id, patient_id) DO NOTHING`,
        [tenantId, patientId]
      );

      // Get current tier
      const beforeResult = await client.query(
        `SELECT tier FROM patient_loyalty_points WHERE tenant_id = $1 AND patient_id = $2`,
        [tenantId, patientId]
      );
      const oldTier = beforeResult.rows[0]?.tier;

      // Update points
      const updateResult = await client.query(
        `UPDATE patient_loyalty_points
         SET points_balance = points_balance + $1,
             lifetime_points = CASE WHEN $1 > 0 THEN lifetime_points + $1 ELSE lifetime_points END,
             updated_at = NOW()
         WHERE tenant_id = $2 AND patient_id = $3
         RETURNING points_balance, tier`,
        [points, tenantId, patientId]
      );

      const newBalance = updateResult.rows[0].points_balance;
      const newTier = updateResult.rows[0].tier;
      const tierChanged = oldTier !== newTier;

      // Create transaction record
      const transactionId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_loyalty_transactions
         (id, tenant_id, patient_id, points, balance_after, transaction_type,
          description, reference_type, reference_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          transactionId,
          tenantId,
          patientId,
          points,
          newBalance,
          transactionType,
          description,
          referenceType,
          referenceId,
          createdBy,
        ]
      );

      await client.query('COMMIT');

      // Send milestone notification if tier changed
      if (tierChanged && points > 0) {
        await this.sendTierMilestoneNotification(tenantId, patientId, newTier);
      }

      logger.info('Points earned', { patientId, points, newBalance, tierChanged });

      return { transactionId, newBalance, tierChanged };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error earning points', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Redeem loyalty points for a reward
   */
  async redeemPoints(
    tenantId: string,
    patientId: string,
    rewardId: string,
    appointmentId?: string
  ): Promise<{ redemptionId: string; pointsSpent: number; newBalance: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get reward details
      const rewardResult = await client.query(
        `SELECT * FROM loyalty_rewards
         WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [rewardId, tenantId]
      );

      if (!rewardResult.rowCount) {
        throw new Error('Reward not found or inactive');
      }

      const reward = rewardResult.rows[0];

      // Check if reward is available
      if (reward.quantity_available !== null && reward.quantity_redeemed >= reward.quantity_available) {
        throw new Error('Reward no longer available');
      }

      // Check patient tier eligibility
      if (reward.min_tier) {
        const loyaltyResult = await client.query(
          `SELECT tier FROM patient_loyalty_points WHERE tenant_id = $1 AND patient_id = $2`,
          [tenantId, patientId]
        );
        const patientTier = loyaltyResult.rows[0]?.tier || 'bronze';
        const tierRanks = { bronze: 0, silver: 1, gold: 2, platinum: 3 };
        if ((tierRanks[patientTier as keyof typeof tierRanks] || 0) < (tierRanks[reward.min_tier as keyof typeof tierRanks] || 0)) {
          throw new Error(`Requires ${reward.min_tier} tier or higher`);
        }
      }

      // Check points balance
      const balanceResult = await client.query(
        `SELECT points_balance FROM patient_loyalty_points
         WHERE tenant_id = $1 AND patient_id = $2`,
        [tenantId, patientId]
      );

      const currentBalance = balanceResult.rows[0]?.points_balance || 0;
      if (currentBalance < reward.points_required) {
        throw new Error('Insufficient points');
      }

      // Deduct points
      const updateResult = await client.query(
        `UPDATE patient_loyalty_points
         SET points_balance = points_balance - $1, updated_at = NOW()
         WHERE tenant_id = $2 AND patient_id = $3
         RETURNING points_balance`,
        [reward.points_required, tenantId, patientId]
      );

      const newBalance = updateResult.rows[0].points_balance;

      // Create redemption record
      const redemptionId = crypto.randomUUID();
      await client.query(
        `INSERT INTO loyalty_redemptions
         (id, tenant_id, patient_id, reward_id, points_spent, status, used_on_appointment_id)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [redemptionId, tenantId, patientId, rewardId, reward.points_required, appointmentId]
      );

      // Create transaction record
      await client.query(
        `INSERT INTO patient_loyalty_transactions
         (id, tenant_id, patient_id, points, balance_after, transaction_type,
          description, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, 'redeemed', $6, 'reward', $7)`,
        [
          crypto.randomUUID(),
          tenantId,
          patientId,
          -reward.points_required,
          newBalance,
          `Redeemed: ${reward.name}`,
          rewardId,
        ]
      );

      // Update reward redemption count
      await client.query(
        `UPDATE loyalty_rewards SET quantity_redeemed = quantity_redeemed + 1 WHERE id = $1`,
        [rewardId]
      );

      await client.query('COMMIT');

      logger.info('Points redeemed', { patientId, rewardId, pointsSpent: reward.points_required, newBalance });

      return { redemptionId, pointsSpent: reward.points_required, newBalance };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error redeeming points', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Award points for appointment completion
   */
  async awardAppointmentPoints(
    tenantId: string,
    patientId: string,
    appointmentId: string
  ): Promise<{ pointsAwarded: number }> {
    try {
      // Base points for visit
      const basePoints = 100;

      await this.earnPoints(
        tenantId,
        patientId,
        basePoints,
        'earned_visit',
        'Points for completed visit',
        'appointment',
        appointmentId
      );

      return { pointsAwarded: basePoints };
    } catch (error: any) {
      logger.error('Error awarding appointment points', { error: error.message });
      throw error;
    }
  }

  private async sendTierMilestoneNotification(
    tenantId: string,
    patientId: string,
    newTier: string
  ): Promise<void> {
    try {
      const tierBenefits: Record<string, string> = {
        silver: '10% off services and priority scheduling',
        gold: '15% off services, priority scheduling, and a free consultation',
        platinum: '20% off, VIP access, priority scheduling, and exclusive perks',
      };

      const benefits = tierBenefits[newTier] || 'exclusive member benefits';

      await smsWorkflowService.sendWorkflowSMS({
        tenantId,
        patientId,
        template: ENGAGEMENT_SMS_TEMPLATES.LOYALTY_MILESTONE,
        variables: {
          tierName: newTier.charAt(0).toUpperCase() + newTier.slice(1),
          benefits,
        },
        messageType: 'loyalty_milestone',
      });
    } catch (error: any) {
      logger.error('Error sending tier milestone notification', { error: error.message });
    }
  }

  // ============================================
  // REVIEW REQUEST WORKFLOW
  // ============================================

  /**
   * Request review from patient (with sentiment routing)
   */
  async requestReview(
    tenantId: string,
    patientId: string,
    appointmentId: string | null,
    surveyId: string | null,
    platform: string = 'google'
  ): Promise<{ requestId: string }> {
    try {
      const requestId = crypto.randomUUID();

      // Generate review link (would be actual Google/Yelp link in production)
      const reviewLinks: Record<string, string> = {
        google: 'https://g.page/review/clinic',
        yelp: 'https://yelp.com/biz/clinic/review',
        healthgrades: 'https://healthgrades.com/review',
        facebook: 'https://facebook.com/clinic/review',
      };

      const reviewLink = reviewLinks[platform] ?? reviewLinks.google ?? 'https://g.page/review/clinic';

      await pool.query(
        `INSERT INTO review_requests
         (id, tenant_id, patient_id, appointment_id, survey_id, platform, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [requestId, tenantId, patientId, appointmentId, surveyId, platform]
      );

      // Send review request SMS
      const smsResult = await smsWorkflowService.sendWorkflowSMS({
        tenantId,
        patientId,
        template: ENGAGEMENT_SMS_TEMPLATES.REVIEW_REQUEST,
        variables: { reviewLink },
        messageType: 'review_request',
      });

      if (smsResult.success) {
        await pool.query(
          `UPDATE review_requests SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [requestId]
        );

        // Award points for review request sent
        await this.earnPoints(tenantId, patientId, 10, 'bonus', 'Review request bonus', 'review_request', requestId);
      }

      logger.info('Review request sent', { requestId, patientId, platform });

      return { requestId };
    } catch (error: any) {
      logger.error('Error requesting review', { error: error.message });
      throw error;
    }
  }

  /**
   * Submit patient review
   */
  async submitReview(
    tenantId: string,
    patientId: string,
    platform: string,
    rating: number,
    reviewText?: string,
    appointmentId?: string,
    reviewUrl?: string
  ): Promise<{ reviewId: string }> {
    try {
      const reviewId = crypto.randomUUID();
      const sentiment = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';

      // Get provider from appointment if provided
      let providerId = null;
      if (appointmentId) {
        const apptResult = await pool.query(
          `SELECT provider_id FROM appointments WHERE id = $1`,
          [appointmentId]
        );
        if (apptResult.rowCount) {
          providerId = apptResult.rows[0].provider_id;
        }
      }

      await pool.query(
        `INSERT INTO patient_reviews
         (id, tenant_id, patient_id, appointment_id, provider_id, platform,
          rating, review_text, review_url, sentiment, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
        [
          reviewId,
          tenantId,
          patientId,
          appointmentId,
          providerId,
          platform,
          rating,
          reviewText,
          reviewUrl,
          sentiment,
        ]
      );

      // Update review request if exists
      if (appointmentId) {
        await pool.query(
          `UPDATE review_requests
           SET status = 'completed', completed_at = NOW(), review_id = $1
           WHERE patient_id = $2 AND appointment_id = $3 AND platform = $4`,
          [reviewId, patientId, appointmentId, platform]
        );
      }

      // Award points for review
      const pointsForReview = rating >= 4 ? 100 : 50;
      await this.earnPoints(
        tenantId,
        patientId,
        pointsForReview,
        'earned_review',
        `Thank you for your ${platform} review!`,
        'review',
        reviewId
      );

      logger.info('Review submitted', { reviewId, patientId, platform, rating });

      return { reviewId };
    } catch (error: any) {
      logger.error('Error submitting review', { error: error.message });
      throw error;
    }
  }

  // ============================================
  // EDUCATIONAL CONTENT DELIVERY
  // ============================================

  /**
   * Send educational content based on diagnosis
   */
  async sendEducationalContent(
    tenantId: string,
    patientId: string,
    diagnosisCode: string,
    encounterId?: string
  ): Promise<{ contentSent: number }> {
    try {
      // Find relevant educational content
      const contentResult = await pool.query(
        `SELECT * FROM educational_content
         WHERE tenant_id = $1
           AND is_published = true
           AND ($2 = ANY(related_diagnoses) OR category IN (
             SELECT CASE
               WHEN $2 LIKE 'L57%' THEN 'sun_protection'
               WHEN $2 LIKE 'L70%' THEN 'acne'
               WHEN $2 LIKE 'L20%' THEN 'eczema'
               WHEN $2 LIKE 'L40%' THEN 'psoriasis'
               WHEN $2 LIKE 'C43%' OR $2 LIKE 'C44%' THEN 'skin_cancer'
               ELSE 'general'
             END
           ))
         LIMIT 3`,
        [tenantId, diagnosisCode]
      );

      let contentSent = 0;

      for (const content of contentResult.rows) {
        // Check if already sent
        const existsResult = await pool.query(
          `SELECT 1 FROM patient_educational_content
           WHERE patient_id = $1 AND content_id = $2`,
          [patientId, content.id]
        );

        if (!existsResult.rowCount) {
          // Record content delivery
          await pool.query(
            `INSERT INTO patient_educational_content
             (id, tenant_id, patient_id, content_id, encounter_id, diagnosis_code, channel)
             VALUES ($1, $2, $3, $4, $5, $6, 'portal')`,
            [crypto.randomUUID(), tenantId, patientId, content.id, encounterId, diagnosisCode]
          );

          // Update view count
          await pool.query(
            `UPDATE educational_content SET view_count = view_count + 1 WHERE id = $1`,
            [content.id]
          );

          contentSent++;
        }
      }

      // Send SMS notification about new content
      if (contentSent > 0) {
        const contentTopic = contentResult.rows[0]?.category || 'your condition';
        await smsWorkflowService.sendWorkflowSMS({
          tenantId,
          patientId,
          template: ENGAGEMENT_SMS_TEMPLATES.EDUCATIONAL_CONTENT,
          variables: {
            topic: contentTopic,
            contentLink: 'https://portal.clinic.com/education',
          },
          messageType: 'educational_content',
        });
      }

      logger.info('Educational content sent', { patientId, diagnosisCode, contentSent });

      return { contentSent };
    } catch (error: any) {
      logger.error('Error sending educational content', { error: error.message });
      throw error;
    }
  }

  // ============================================
  // CAMPAIGN MANAGEMENT
  // ============================================

  /**
   * Get patient campaigns
   */
  async getPatientCampaigns(
    tenantId: string,
    patientId: string,
    limit: number = 20
  ): Promise<any[]> {
    const result = await pool.query(
      `SELECT id, campaign_type, campaign_name, status, scheduled_at, sent_at,
              response, channel, created_at
       FROM patient_engagement_campaigns
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, patientId, limit]
    );
    return result.rows;
  }

  /**
   * Create manual campaign
   */
  async createCampaign(
    tenantId: string,
    patientId: string,
    campaignType: string,
    campaignName: string,
    scheduledAt?: Date,
    metadata?: Record<string, any>
  ): Promise<{ campaignId: string }> {
    const campaignId = crypto.randomUUID();
    const status = scheduledAt && scheduledAt > new Date() ? 'scheduled' : 'pending';

    await pool.query(
      `INSERT INTO patient_engagement_campaigns
       (id, tenant_id, patient_id, campaign_type, campaign_name, status, scheduled_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [campaignId, tenantId, patientId, campaignType, campaignName, status, scheduledAt, JSON.stringify(metadata || {})]
    );

    return { campaignId };
  }

  // =====================================================
  // EVENT ORCHESTRATION HELPER METHODS
  // =====================================================

  /**
   * Award points (alias for earnPoints for event handlers)
   */
  async awardPoints(
    tenantId: string,
    patientId: string,
    points: number,
    source: string,
    description?: string,
    expiresAt?: Date
  ): Promise<{ newBalance: number; tierChanged: boolean; newTier?: string }> {
    return this.earnPoints(tenantId, patientId, points, source, description ?? '');
  }

  /**
   * Enroll a patient in the loyalty program
   */
  async enrollInLoyaltyProgram(
    tenantId: string,
    patientId: string,
    startingPoints: number = 0
  ): Promise<{ enrolled: boolean; loyaltyId: string }> {
    try {
      const loyaltyId = crypto.randomUUID();

      // Create loyalty record if not exists
      const result = await pool.query(
        `INSERT INTO patient_loyalty_points (id, tenant_id, patient_id, points_balance, lifetime_points, tier, enrolled_at)
         VALUES ($1, $2, $3, $4, $4, 'bronze', NOW())
         ON CONFLICT (tenant_id, patient_id) DO UPDATE SET enrolled_at = COALESCE(patient_loyalty_points.enrolled_at, NOW())
         RETURNING id`,
        [loyaltyId, tenantId, patientId, startingPoints]
      );

      // Log enrollment
      if (startingPoints > 0) {
        await pool.query(
          `INSERT INTO patient_loyalty_transactions
           (id, tenant_id, patient_id, transaction_type, points, source, description, created_at)
           VALUES ($1, $2, $3, 'earn', $4, 'welcome_bonus', 'Welcome bonus points', NOW())`,
          [crypto.randomUUID(), tenantId, patientId, startingPoints]
        );
      }

      logger.info('Patient enrolled in loyalty program', { tenantId, patientId, startingPoints });
      return { enrolled: true, loyaltyId: result.rows[0].id };
    } catch (error: any) {
      logger.error('Error enrolling in loyalty program', { error: error.message, patientId });
      throw error;
    }
  }

  /**
   * Send welcome message to new patient
   */
  async sendWelcomeMessage(
    tenantId: string,
    patientId: string,
    customMessage?: string
  ): Promise<{ success: boolean; campaignId: string }> {
    try {
      // Get patient info and clinic name
      const patientResult = await pool.query(
        `SELECT p.first_name, p.last_name, p.phone, t.name as clinic_name
         FROM patients p
         JOIN tenants t ON t.id = p.tenant_id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [patientId, tenantId]
      );

      if (!patientResult.rowCount) {
        throw new Error('Patient not found');
      }

      const patient = patientResult.rows[0];
      const clinicName = patient.clinic_name || 'our clinic';

      // Create campaign
      const campaignId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO patient_engagement_campaigns
         (id, tenant_id, patient_id, campaign_type, campaign_name, status, metadata, scheduled_at)
         VALUES ($1, $2, $3, 'welcome', 'Welcome Message', 'pending', $4, NOW())`,
        [
          campaignId,
          tenantId,
          patientId,
          JSON.stringify({
            message: customMessage || `Welcome to ${clinicName}! We're excited to have you as a patient. Reply HELP for assistance or STOP to opt out.`,
            firstName: patient.first_name,
          }),
        ]
      );

      // Queue SMS if patient has phone
      if (patient.phone) {
        await pool.query(
          `INSERT INTO sms_queue (id, tenant_id, patient_id, message_type, message, scheduled_at, status)
           VALUES ($1, $2, $3, 'welcome', $4, NOW(), 'pending')`,
          [
            crypto.randomUUID(),
            tenantId,
            patientId,
            customMessage || `Welcome to ${clinicName}, ${patient.first_name}! We're excited to have you as a patient.`,
          ]
        );
      }

      // Update campaign status
      await pool.query(
        `UPDATE patient_engagement_campaigns SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [campaignId]
      );

      logger.info('Welcome message sent', { tenantId, patientId, campaignId });
      return { success: true, campaignId };
    } catch (error: any) {
      logger.error('Error sending welcome message', { error: error.message, patientId });
      return { success: false, campaignId: '' };
    }
  }

  /**
   * Award birthday bonus points
   */
  async awardBirthdayPoints(
    tenantId: string,
    patientId: string,
    points: number = 50
  ): Promise<{ success: boolean; pointsAwarded: number }> {
    try {
      await this.earnPoints(tenantId, patientId, points, 'birthday', 'Birthday bonus points');
      return { success: true, pointsAwarded: points };
    } catch (error: any) {
      logger.error('Error awarding birthday points', { error: error.message, patientId });
      return { success: false, pointsAwarded: 0 };
    }
  }

  /**
   * Log a no-show event
   */
  async logNoShow(
    tenantId: string,
    patientId: string,
    appointmentId: string
  ): Promise<{ logged: boolean }> {
    try {
      await pool.query(
        `INSERT INTO patient_no_show_log (id, tenant_id, patient_id, appointment_id, recorded_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), tenantId, patientId, appointmentId]
      );
      return { logged: true };
    } catch (error: any) {
      logger.error('Error logging no-show', { error: error.message, patientId, appointmentId });
      return { logged: false };
    }
  }

  /**
   * Update patient engagement score
   */
  async updateEngagementScore(
    tenantId: string,
    patientId: string,
    adjustment: number
  ): Promise<{ newScore: number }> {
    try {
      const result = await pool.query(
        `INSERT INTO patient_engagement_scores (id, tenant_id, patient_id, score, last_calculated_at)
         VALUES ($1, $2, $3, GREATEST(0, $4), NOW())
         ON CONFLICT (tenant_id, patient_id)
         DO UPDATE SET score = GREATEST(0, patient_engagement_scores.score + $4), last_calculated_at = NOW()
         RETURNING score`,
        [crypto.randomUUID(), tenantId, patientId, adjustment]
      );
      return { newScore: result.rows[0]?.score || 0 };
    } catch (error: any) {
      logger.error('Error updating engagement score', { error: error.message, patientId });
      return { newScore: 0 };
    }
  }
}

// Export singleton instance
export const patientEngagementService = new PatientEngagementService();
