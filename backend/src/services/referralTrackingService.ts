import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// =====================================================
// Types
// =====================================================

export type SourceType = 'physician' | 'patient' | 'marketing' | 'web' | 'insurance' | 'other';
export type CampaignType = 'print' | 'digital' | 'social' | 'email' | 'tv' | 'radio' | 'referral_program' | 'event' | 'other';
export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface ReferralSource {
  id: string;
  tenantId: string;
  sourceType: SourceType;
  sourceName: string;
  sourceDetails: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingCampaign {
  id: string;
  tenantId: string;
  campaignName: string;
  campaignType: CampaignType;
  startDate: string;
  endDate?: string;
  budgetCents: number;
  spentCents: number;
  trackingCode?: string;
  landingPageUrl?: string;
  description?: string;
  targetAudience?: string;
  channels: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientReferral {
  id: string;
  tenantId: string;
  patientId: string;
  referralSourceId?: string;
  referringProviderId?: string;
  referringProviderName?: string;
  referringProviderNpi?: string;
  referringPracticeName?: string;
  referralDate: string;
  referralReason?: string;
  campaignCode?: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  firstAppointmentId?: string;
  firstAppointmentDate?: string;
  converted: boolean;
  conversionDate?: string;
  howHeard?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralAnalytics {
  id: string;
  tenantId: string;
  sourceId?: string;
  campaignId?: string;
  periodStart: string;
  periodEnd: string;
  periodType: PeriodType;
  newPatients: number;
  totalAppointments: number;
  revenueAttributedCents: number;
  conversionRate: number;
  avgPatientValueCents: number;
  costPerAcquisitionCents: number;
  returnOnInvestment: number;
  patientsRetained: number;
  retentionRate: number;
}

export interface ReferringPhysician {
  id: string;
  tenantId: string;
  npi?: string;
  firstName: string;
  lastName: string;
  credentials?: string;
  specialty?: string;
  practiceName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  fax?: string;
  email?: string;
  isActive: boolean;
  totalReferrals: number;
  lastReferralDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralSourceOption {
  id: string;
  tenantId: string;
  optionText: string;
  optionCategory: SourceType;
  autoLinkSourceId?: string;
  displayOrder: number;
  isActive: boolean;
  requiresDetails: boolean;
}

export interface SourceData {
  sourceType: SourceType;
  sourceName?: string;
  howHeard?: string;
  referringProviderName?: string;
  referringProviderNpi?: string;
  referringPracticeName?: string;
  campaignCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  notes?: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface SourcePerformance {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  totalReferrals: number;
  convertedReferrals: number;
  conversionRate: number;
  revenueAttributed: number;
  avgPatientValue: number;
  firstReferral?: string;
  lastReferral?: string;
}

export interface CampaignROI {
  campaignId: string;
  campaignName: string;
  campaignType: CampaignType;
  budgetCents: number;
  spentCents: number;
  totalReferrals: number;
  conversions: number;
  revenueGenerated: number;
  costPerLead: number;
  costPerAcquisition: number;
  roi: number;
}

export interface PhysicianReferralStats {
  physicianId: string;
  physicianName: string;
  specialty?: string;
  practiceName?: string;
  totalReferrals: number;
  convertedPatients: number;
  referralsLast30Days: number;
  referralsLast90Days: number;
  lastReferralDate?: string;
}

// =====================================================
// Service Class
// =====================================================

export class ReferralTrackingService {
  // =====================================================
  // Record Referral Source
  // =====================================================
  async recordReferralSource(
    tenantId: string,
    patientId: string,
    sourceData: SourceData,
    userId: string
  ): Promise<PatientReferral> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find or create the referral source
      let referralSourceId: string | null = null;
      if (sourceData.sourceType && sourceData.sourceName) {
        const sourceResult = await client.query(
          `INSERT INTO referral_sources (id, tenant_id, source_type, source_name, created_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, source_type, source_name)
           DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [crypto.randomUUID(), tenantId, sourceData.sourceType, sourceData.sourceName, userId]
        );
        referralSourceId = sourceResult.rows[0].id;
      }

      // Find campaign by tracking code if provided
      let campaignId: string | null = null;
      if (sourceData.campaignCode) {
        const campaignResult = await client.query(
          `SELECT id FROM marketing_campaigns
           WHERE tracking_code = $1 AND tenant_id = $2 AND is_active = true`,
          [sourceData.campaignCode, tenantId]
        );
        if (campaignResult.rowCount && campaignResult.rowCount > 0) {
          campaignId = campaignResult.rows[0].id;
        }
      }

      // Create patient referral record
      const referralId = crypto.randomUUID();
      const result = await client.query(
        `INSERT INTO patient_referrals (
          id, tenant_id, patient_id, referral_source_id,
          referring_provider_name, referring_provider_npi, referring_practice_name,
          campaign_code, campaign_id, utm_source, utm_medium, utm_campaign,
          utm_content, utm_term, how_heard, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          referralId,
          tenantId,
          patientId,
          referralSourceId,
          sourceData.referringProviderName || null,
          sourceData.referringProviderNpi || null,
          sourceData.referringPracticeName || null,
          sourceData.campaignCode || null,
          campaignId,
          sourceData.utmSource || null,
          sourceData.utmMedium || null,
          sourceData.utmCampaign || null,
          sourceData.utmContent || null,
          sourceData.utmTerm || null,
          sourceData.howHeard || null,
          sourceData.notes || null,
          userId,
        ]
      );

      await client.query('COMMIT');
      logger.info(`Recorded referral source for patient ${patientId}`, { referralId, sourceType: sourceData.sourceType });

      return this.mapPatientReferral(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error recording referral source:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // Attribute Revenue
  // =====================================================
  async attributeRevenue(
    tenantId: string,
    patientId: string,
    amountCents: number
  ): Promise<void> {
    try {
      // Get the patient's referral source
      const referralResult = await pool.query(
        `SELECT referral_source_id, campaign_id FROM patient_referrals
         WHERE patient_id = $1 AND tenant_id = $2
         ORDER BY referral_date DESC LIMIT 1`,
        [patientId, tenantId]
      );

      if (!referralResult.rowCount || referralResult.rowCount === 0) {
        logger.debug(`No referral found for patient ${patientId}`);
        return;
      }

      const { referral_source_id, campaign_id } = referralResult.rows[0];

      // Get current month period
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      // Update or insert analytics for source
      if (referral_source_id) {
        await pool.query(
          `INSERT INTO referral_analytics (
            id, tenant_id, source_id, period_start, period_end, period_type, revenue_attributed_cents
          ) VALUES ($1, $2, $3, $4, $5, 'monthly', $6)
          ON CONFLICT (tenant_id, source_id, period_start, period_end)
          DO UPDATE SET
            revenue_attributed_cents = referral_analytics.revenue_attributed_cents + $6,
            updated_at = NOW()`,
          [crypto.randomUUID(), tenantId, referral_source_id, periodStart, periodEnd, amountCents]
        );
      }

      // Update or insert analytics for campaign
      if (campaign_id) {
        await pool.query(
          `INSERT INTO referral_analytics (
            id, tenant_id, campaign_id, period_start, period_end, period_type, revenue_attributed_cents
          ) VALUES ($1, $2, $3, $4, $5, 'monthly', $6)
          ON CONFLICT (tenant_id, campaign_id, period_start, period_end)
          DO UPDATE SET
            revenue_attributed_cents = referral_analytics.revenue_attributed_cents + $6,
            updated_at = NOW()`,
          [crypto.randomUUID(), tenantId, campaign_id, periodStart, periodEnd, amountCents]
        );
      }

      logger.info(`Attributed revenue of ${amountCents} cents to patient ${patientId}`);
    } catch (error) {
      logger.error('Error attributing revenue:', error);
      throw error;
    }
  }

  // =====================================================
  // Get Referral Analytics
  // =====================================================
  async getReferralAnalytics(
    tenantId: string,
    dateRange: DateRange
  ): Promise<SourcePerformance[]> {
    try {
      const result = await pool.query(
        `SELECT
          rs.id AS source_id,
          rs.source_name,
          rs.source_type,
          COUNT(pr.id) AS total_referrals,
          COUNT(pr.id) FILTER (WHERE pr.converted = true) AS converted_referrals,
          COALESCE(SUM(ra.revenue_attributed_cents), 0) AS revenue_attributed,
          MIN(pr.referral_date) AS first_referral,
          MAX(pr.referral_date) AS last_referral
        FROM referral_sources rs
        LEFT JOIN patient_referrals pr ON rs.id = pr.referral_source_id
          AND pr.referral_date >= $2 AND pr.referral_date <= $3
        LEFT JOIN referral_analytics ra ON rs.id = ra.source_id
          AND ra.period_start >= $2 AND ra.period_end <= $3
        WHERE rs.tenant_id = $1 AND rs.is_active = true
        GROUP BY rs.id, rs.source_name, rs.source_type
        ORDER BY total_referrals DESC`,
        [tenantId, dateRange.startDate, dateRange.endDate]
      );

      return result.rows.map((row) => ({
        sourceId: row.source_id,
        sourceName: row.source_name,
        sourceType: row.source_type as SourceType,
        totalReferrals: parseInt(row.total_referrals) || 0,
        convertedReferrals: parseInt(row.converted_referrals) || 0,
        conversionRate: row.total_referrals > 0
          ? (parseInt(row.converted_referrals) / parseInt(row.total_referrals))
          : 0,
        revenueAttributed: parseInt(row.revenue_attributed) || 0,
        avgPatientValue: row.converted_referrals > 0
          ? Math.round(parseInt(row.revenue_attributed) / parseInt(row.converted_referrals))
          : 0,
        firstReferral: row.first_referral,
        lastReferral: row.last_referral,
      }));
    } catch (error) {
      logger.error('Error getting referral analytics:', error);
      throw error;
    }
  }

  // =====================================================
  // Get Physician Referrals
  // =====================================================
  async getPhysicianReferrals(
    tenantId: string,
    providerId?: string
  ): Promise<PhysicianReferralStats[]> {
    try {
      let query = `
        SELECT
          rp.id AS physician_id,
          rp.first_name || ' ' || rp.last_name AS physician_name,
          rp.specialty,
          rp.practice_name,
          rp.total_referrals,
          rp.last_referral_date,
          COUNT(pr.id) FILTER (WHERE pr.converted = true) AS converted_patients,
          COUNT(pr.id) FILTER (WHERE pr.referral_date >= CURRENT_DATE - INTERVAL '30 days') AS referrals_last_30_days,
          COUNT(pr.id) FILTER (WHERE pr.referral_date >= CURRENT_DATE - INTERVAL '90 days') AS referrals_last_90_days
        FROM referring_physicians rp
        LEFT JOIN patient_referrals pr ON pr.referring_provider_npi = rp.npi AND pr.tenant_id = rp.tenant_id
        WHERE rp.tenant_id = $1 AND rp.is_active = true
      `;

      const params: (string | undefined)[] = [tenantId];

      if (providerId) {
        query += ` AND rp.id = $2`;
        params.push(providerId);
      }

      query += `
        GROUP BY rp.id, rp.first_name, rp.last_name, rp.specialty,
                 rp.practice_name, rp.total_referrals, rp.last_referral_date
        ORDER BY rp.total_referrals DESC
      `;

      const result = await pool.query(query, params);

      return result.rows.map((row) => ({
        physicianId: row.physician_id,
        physicianName: row.physician_name,
        specialty: row.specialty,
        practiceName: row.practice_name,
        totalReferrals: parseInt(row.total_referrals) || 0,
        convertedPatients: parseInt(row.converted_patients) || 0,
        referralsLast30Days: parseInt(row.referrals_last_30_days) || 0,
        referralsLast90Days: parseInt(row.referrals_last_90_days) || 0,
        lastReferralDate: row.last_referral_date,
      }));
    } catch (error) {
      logger.error('Error getting physician referrals:', error);
      throw error;
    }
  }

  // =====================================================
  // Get Campaign ROI
  // =====================================================
  async getCampaignROI(
    tenantId: string,
    campaignId: string
  ): Promise<CampaignROI | null> {
    try {
      const result = await pool.query(
        `SELECT
          mc.id AS campaign_id,
          mc.campaign_name,
          mc.campaign_type,
          mc.budget_cents,
          mc.spent_cents,
          COUNT(pr.id) AS total_referrals,
          COUNT(pr.id) FILTER (WHERE pr.converted = true) AS conversions,
          COALESCE(SUM(ra.revenue_attributed_cents), 0) AS revenue_generated
        FROM marketing_campaigns mc
        LEFT JOIN patient_referrals pr ON mc.id = pr.campaign_id
        LEFT JOIN referral_analytics ra ON mc.id = ra.campaign_id
        WHERE mc.id = $1 AND mc.tenant_id = $2
        GROUP BY mc.id, mc.campaign_name, mc.campaign_type, mc.budget_cents, mc.spent_cents`,
        [campaignId, tenantId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        return null;
      }

      const row = result.rows[0];
      const totalReferrals = parseInt(row.total_referrals) || 0;
      const conversions = parseInt(row.conversions) || 0;
      const spentCents = parseInt(row.spent_cents) || 0;
      const revenueGenerated = parseInt(row.revenue_generated) || 0;

      return {
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        campaignType: row.campaign_type as CampaignType,
        budgetCents: parseInt(row.budget_cents) || 0,
        spentCents,
        totalReferrals,
        conversions,
        revenueGenerated,
        costPerLead: totalReferrals > 0 ? Math.round(spentCents / totalReferrals) : 0,
        costPerAcquisition: conversions > 0 ? Math.round(spentCents / conversions) : 0,
        roi: spentCents > 0 ? ((revenueGenerated - spentCents) / spentCents) * 100 : 0,
      };
    } catch (error) {
      logger.error('Error getting campaign ROI:', error);
      throw error;
    }
  }

  // =====================================================
  // Get Top Referral Sources
  // =====================================================
  async getTopReferralSources(
    tenantId: string,
    limit: number = 10
  ): Promise<SourcePerformance[]> {
    try {
      const result = await pool.query(
        `SELECT
          rs.id AS source_id,
          rs.source_name,
          rs.source_type,
          COUNT(pr.id) AS total_referrals,
          COUNT(pr.id) FILTER (WHERE pr.converted = true) AS converted_referrals,
          COALESCE(SUM(ra.revenue_attributed_cents), 0) AS revenue_attributed,
          MIN(pr.referral_date) AS first_referral,
          MAX(pr.referral_date) AS last_referral
        FROM referral_sources rs
        LEFT JOIN patient_referrals pr ON rs.id = pr.referral_source_id
        LEFT JOIN referral_analytics ra ON rs.id = ra.source_id
        WHERE rs.tenant_id = $1 AND rs.is_active = true
        GROUP BY rs.id, rs.source_name, rs.source_type
        ORDER BY total_referrals DESC
        LIMIT $2`,
        [tenantId, limit]
      );

      return result.rows.map((row) => ({
        sourceId: row.source_id,
        sourceName: row.source_name,
        sourceType: row.source_type as SourceType,
        totalReferrals: parseInt(row.total_referrals) || 0,
        convertedReferrals: parseInt(row.converted_referrals) || 0,
        conversionRate: row.total_referrals > 0
          ? (parseInt(row.converted_referrals) / parseInt(row.total_referrals))
          : 0,
        revenueAttributed: parseInt(row.revenue_attributed) || 0,
        avgPatientValue: row.converted_referrals > 0
          ? Math.round(parseInt(row.revenue_attributed) / parseInt(row.converted_referrals))
          : 0,
        firstReferral: row.first_referral,
        lastReferral: row.last_referral,
      }));
    } catch (error) {
      logger.error('Error getting top referral sources:', error);
      throw error;
    }
  }

  // =====================================================
  // CRUD Operations for Referral Sources
  // =====================================================
  async getReferralSources(tenantId: string): Promise<ReferralSource[]> {
    const result = await pool.query(
      `SELECT * FROM referral_sources WHERE tenant_id = $1 AND is_active = true ORDER BY source_type, source_name`,
      [tenantId]
    );
    return result.rows.map((row) => this.mapReferralSource(row));
  }

  async createReferralSource(
    tenantId: string,
    data: Partial<ReferralSource>,
    userId: string
  ): Promise<ReferralSource> {
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO referral_sources (id, tenant_id, source_type, source_name, source_details, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, tenantId, data.sourceType, data.sourceName, data.sourceDetails || {}, userId]
    );
    return this.mapReferralSource(result.rows[0]);
  }

  // =====================================================
  // CRUD Operations for Marketing Campaigns
  // =====================================================
  async getCampaigns(tenantId: string): Promise<MarketingCampaign[]> {
    const result = await pool.query(
      `SELECT * FROM marketing_campaigns WHERE tenant_id = $1 ORDER BY start_date DESC`,
      [tenantId]
    );
    return result.rows.map((row) => this.mapMarketingCampaign(row));
  }

  async createCampaign(
    tenantId: string,
    data: Partial<MarketingCampaign>,
    userId: string
  ): Promise<MarketingCampaign> {
    const id = crypto.randomUUID();
    const trackingCode = data.trackingCode || this.generateTrackingCode();
    const result = await pool.query(
      `INSERT INTO marketing_campaigns (
        id, tenant_id, campaign_name, campaign_type, start_date, end_date,
        budget_cents, tracking_code, landing_page_url, description, target_audience,
        channels, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        id,
        tenantId,
        data.campaignName,
        data.campaignType,
        data.startDate,
        data.endDate || null,
        data.budgetCents || 0,
        trackingCode,
        data.landingPageUrl || null,
        data.description || null,
        data.targetAudience || null,
        JSON.stringify(data.channels || []),
        userId,
      ]
    );
    return this.mapMarketingCampaign(result.rows[0]);
  }

  async updateCampaign(
    tenantId: string,
    campaignId: string,
    data: Partial<MarketingCampaign>
  ): Promise<MarketingCampaign | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.campaignName !== undefined) {
      updates.push(`campaign_name = $${paramCount++}`);
      values.push(data.campaignName);
    }
    if (data.campaignType !== undefined) {
      updates.push(`campaign_type = $${paramCount++}`);
      values.push(data.campaignType);
    }
    if (data.startDate !== undefined) {
      updates.push(`start_date = $${paramCount++}`);
      values.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      updates.push(`end_date = $${paramCount++}`);
      values.push(data.endDate);
    }
    if (data.budgetCents !== undefined) {
      updates.push(`budget_cents = $${paramCount++}`);
      values.push(data.budgetCents);
    }
    if (data.spentCents !== undefined) {
      updates.push(`spent_cents = $${paramCount++}`);
      values.push(data.spentCents);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) {
      return null;
    }

    values.push(campaignId, tenantId);
    const result = await pool.query(
      `UPDATE marketing_campaigns SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (!result.rowCount || result.rowCount === 0) {
      return null;
    }

    return this.mapMarketingCampaign(result.rows[0]);
  }

  // =====================================================
  // CRUD Operations for Referring Physicians
  // =====================================================
  async getReferringPhysicians(tenantId: string): Promise<ReferringPhysician[]> {
    const result = await pool.query(
      `SELECT * FROM referring_physicians WHERE tenant_id = $1 AND is_active = true ORDER BY last_name, first_name`,
      [tenantId]
    );
    return result.rows.map((row) => this.mapReferringPhysician(row));
  }

  async searchReferringPhysicians(
    tenantId: string,
    query: string
  ): Promise<ReferringPhysician[]> {
    const searchTerm = `%${query}%`;
    const result = await pool.query(
      `SELECT * FROM referring_physicians
       WHERE tenant_id = $1 AND is_active = true
       AND (
         first_name ILIKE $2 OR last_name ILIKE $2 OR
         practice_name ILIKE $2 OR npi ILIKE $2
       )
       ORDER BY total_referrals DESC, last_name, first_name
       LIMIT 20`,
      [tenantId, searchTerm]
    );
    return result.rows.map((row) => this.mapReferringPhysician(row));
  }

  async createReferringPhysician(
    tenantId: string,
    data: Partial<ReferringPhysician>,
    userId: string
  ): Promise<ReferringPhysician> {
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO referring_physicians (
        id, tenant_id, npi, first_name, last_name, credentials, specialty,
        practice_name, address_line1, address_line2, city, state, zip,
        phone, fax, email, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        id,
        tenantId,
        data.npi || null,
        data.firstName,
        data.lastName,
        data.credentials || null,
        data.specialty || null,
        data.practiceName || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.state || null,
        data.zip || null,
        data.phone || null,
        data.fax || null,
        data.email || null,
        userId,
      ]
    );
    return this.mapReferringPhysician(result.rows[0]);
  }

  // =====================================================
  // Get Referral Source Options (for intake dropdown)
  // =====================================================
  async getReferralSourceOptions(tenantId: string): Promise<ReferralSourceOption[]> {
    const result = await pool.query(
      `SELECT * FROM referral_source_options
       WHERE (tenant_id = $1 OR tenant_id = 'default') AND is_active = true
       ORDER BY display_order`,
      [tenantId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      optionText: row.option_text,
      optionCategory: row.option_category as SourceType,
      autoLinkSourceId: row.auto_link_source_id,
      displayOrder: row.display_order,
      isActive: row.is_active,
      requiresDetails: row.requires_details,
    }));
  }

  // =====================================================
  // Mark Patient as Converted
  // =====================================================
  async markPatientConverted(
    tenantId: string,
    patientId: string,
    appointmentId: string
  ): Promise<void> {
    const appointmentResult = await pool.query(
      `SELECT scheduled_start FROM appointments WHERE id = $1 AND tenant_id = $2`,
      [appointmentId, tenantId]
    );

    const appointmentDate = appointmentResult.rows[0]?.scheduled_start || new Date();

    await pool.query(
      `UPDATE patient_referrals
       SET converted = true,
           conversion_date = $3,
           first_appointment_id = $4,
           first_appointment_date = $3,
           updated_at = NOW()
       WHERE patient_id = $1 AND tenant_id = $2 AND converted = false`,
      [patientId, tenantId, appointmentDate, appointmentId]
    );

    logger.info(`Marked patient ${patientId} as converted`);
  }

  // =====================================================
  // Get Referral Trends
  // =====================================================
  async getReferralTrends(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; count: number; converted: number }>> {
    const result = await pool.query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', referral_date), 'YYYY-MM') AS month,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE converted = true) AS converted
       FROM patient_referrals
       WHERE tenant_id = $1
         AND referral_date >= CURRENT_DATE - INTERVAL '1 month' * $2
       GROUP BY DATE_TRUNC('month', referral_date)
       ORDER BY month`,
      [tenantId, months]
    );

    return result.rows.map((row) => ({
      month: row.month,
      count: parseInt(row.count) || 0,
      converted: parseInt(row.converted) || 0,
    }));
  }

  // =====================================================
  // Get Patient Referral Info
  // =====================================================
  async getPatientReferral(
    tenantId: string,
    patientId: string
  ): Promise<PatientReferral | null> {
    const result = await pool.query(
      `SELECT * FROM patient_referrals WHERE patient_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [patientId, tenantId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      return null;
    }

    return this.mapPatientReferral(result.rows[0]);
  }

  // =====================================================
  // Helper Methods
  // =====================================================
  private generateTrackingCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private mapReferralSource(row: Record<string, unknown>): ReferralSource {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      sourceType: row.source_type as SourceType,
      sourceName: row.source_name as string,
      sourceDetails: (row.source_details || {}) as Record<string, unknown>,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapMarketingCampaign(row: Record<string, unknown>): MarketingCampaign {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      campaignName: row.campaign_name as string,
      campaignType: row.campaign_type as CampaignType,
      startDate: row.start_date as string,
      endDate: row.end_date as string | undefined,
      budgetCents: row.budget_cents as number,
      spentCents: row.spent_cents as number,
      trackingCode: row.tracking_code as string | undefined,
      landingPageUrl: row.landing_page_url as string | undefined,
      description: row.description as string | undefined,
      targetAudience: row.target_audience as string | undefined,
      channels: (row.channels || []) as string[],
      isActive: row.is_active as boolean,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapPatientReferral(row: Record<string, unknown>): PatientReferral {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      patientId: row.patient_id as string,
      referralSourceId: row.referral_source_id as string | undefined,
      referringProviderId: row.referring_provider_id as string | undefined,
      referringProviderName: row.referring_provider_name as string | undefined,
      referringProviderNpi: row.referring_provider_npi as string | undefined,
      referringPracticeName: row.referring_practice_name as string | undefined,
      referralDate: row.referral_date as string,
      referralReason: row.referral_reason as string | undefined,
      campaignCode: row.campaign_code as string | undefined,
      campaignId: row.campaign_id as string | undefined,
      utmSource: row.utm_source as string | undefined,
      utmMedium: row.utm_medium as string | undefined,
      utmCampaign: row.utm_campaign as string | undefined,
      utmContent: row.utm_content as string | undefined,
      utmTerm: row.utm_term as string | undefined,
      firstAppointmentId: row.first_appointment_id as string | undefined,
      firstAppointmentDate: row.first_appointment_date as string | undefined,
      converted: row.converted as boolean,
      conversionDate: row.conversion_date as string | undefined,
      howHeard: row.how_heard as string | undefined,
      notes: row.notes as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapReferringPhysician(row: Record<string, unknown>): ReferringPhysician {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      npi: row.npi as string | undefined,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      credentials: row.credentials as string | undefined,
      specialty: row.specialty as string | undefined,
      practiceName: row.practice_name as string | undefined,
      addressLine1: row.address_line1 as string | undefined,
      addressLine2: row.address_line2 as string | undefined,
      city: row.city as string | undefined,
      state: row.state as string | undefined,
      zip: row.zip as string | undefined,
      phone: row.phone as string | undefined,
      fax: row.fax as string | undefined,
      email: row.email as string | undefined,
      isActive: row.is_active as boolean,
      totalReferrals: row.total_referrals as number,
      lastReferralDate: row.last_referral_date as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export const referralTrackingService = new ReferralTrackingService();
