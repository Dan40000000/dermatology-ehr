/**
 * Patch Test Service
 * Business logic for contact dermatitis patch testing system
 * Implements comprehensive allergen testing workflow
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// Reading scale definitions per ICDRG standards
export const READING_SCALE = {
  not_read: { code: 'NR', label: 'Not Read', description: 'Test not yet read' },
  negative: { code: '-', label: 'Negative', description: 'No reaction' },
  irritant: { code: 'IR', label: 'Irritant', description: 'Mild irritation, not allergy' },
  doubtful: { code: '?+', label: 'Doubtful', description: 'Faint erythema only' },
  weak_positive: { code: '+', label: 'Weak Positive', description: 'Erythema, infiltration, papules' },
  strong_positive: { code: '++', label: 'Strong Positive', description: 'Erythema, infiltration, papules, vesicles' },
  extreme_positive: { code: '+++', label: 'Extreme Positive', description: 'Bullous reaction' },
} as const;

export type ReadingValue = keyof typeof READING_SCALE;

export interface CreateSessionParams {
  tenantId: string;
  patientId: string;
  encounterId?: string;
  panelIds: string[];
  applicationDate: Date;
  indication?: string;
  relevantHistory?: string;
  currentMedications?: string[];
  skinConditionNotes?: string;
  applyingProviderId?: string;
  applicationNotes?: string;
  createdBy: string;
}

export interface RecordReadingParams {
  sessionId: string;
  allergenId: string;
  timepoint: '48hr' | '96hr';
  reading: ReadingValue;
  notes?: string;
  readBy: string;
  tenantId: string;
}

export interface AllergenResult {
  id: string;
  allergenId: string;
  allergenName: string;
  position: number;
  reading48hr: ReadingValue;
  reading96hr: ReadingValue;
  interpretation: string;
  crossReactors: string[];
  commonSources: string[];
  avoidanceInstructions: string;
}

export interface ReportData {
  sessionId: string;
  patientName: string;
  applicationDate: Date;
  positiveAllergens: AllergenResult[];
  negativeAllergens: AllergenResult[];
  irritantReactions: AllergenResult[];
  recommendations: string;
  avoidanceList: Array<{
    allergen: string;
    sources: string[];
    instructions: string;
  }>;
}

export class PatchTestService {
  /**
   * Create a new patch test session
   */
  static async createSession(params: CreateSessionParams): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        tenantId,
        patientId,
        encounterId,
        panelIds,
        applicationDate,
        indication,
        relevantHistory,
        currentMedications,
        skinConditionNotes,
        applyingProviderId,
        applicationNotes,
        createdBy,
      } = params;

      // Calculate expected reading dates
      const read48hrDate = new Date(applicationDate);
      read48hrDate.setHours(read48hrDate.getHours() + 48);

      const read96hrDate = new Date(applicationDate);
      read96hrDate.setHours(read96hrDate.getHours() + 96);

      // Create the session
      const sessionResult = await client.query(
        `INSERT INTO patch_test_sessions (
          tenant_id, patient_id, encounter_id, panel_ids, application_date,
          read_48hr_date, read_96hr_date, status, indication, relevant_history,
          current_medications, skin_condition_notes, applying_provider_id,
          application_notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          tenantId,
          patientId,
          encounterId || null,
          panelIds,
          applicationDate,
          read48hrDate,
          read96hrDate,
          'applied',
          indication || null,
          relevantHistory || null,
          currentMedications || null,
          skinConditionNotes || null,
          applyingProviderId || null,
          applicationNotes || null,
          createdBy,
        ]
      );

      const session = sessionResult.rows[0];

      // Get allergens from all selected panels and create result records
      const panelResult = await client.query(
        `SELECT id, name, allergens FROM patch_test_panels WHERE id = ANY($1)`,
        [panelIds]
      );

      const allergenSet = new Map<string, { position: number; name: string; allergenId: string }>();
      let positionCounter = 1;

      for (const panel of panelResult.rows) {
        const allergens = panel.allergens || [];
        for (const allergen of allergens) {
          if (!allergenSet.has(allergen.allergen_id)) {
            allergenSet.set(allergen.allergen_id, {
              position: positionCounter++,
              name: allergen.name,
              allergenId: allergen.allergen_id,
            });
          }
        }
      }

      // Create result records for each allergen
      for (const [, allergen] of allergenSet) {
        await client.query(
          `INSERT INTO patch_test_results (
            tenant_id, session_id, allergen_id, allergen_name, position_number
          ) VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, session.id, allergen.allergenId, allergen.name, allergen.position]
        );
      }

      await client.query('COMMIT');

      logger.info('Patch test session created', {
        sessionId: session.id,
        patientId,
        panelCount: panelIds.length,
        allergenCount: allergenSet.size,
      });

      return session;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record a reading for a specific allergen
   */
  static async recordReading(params: RecordReadingParams): Promise<any> {
    const { sessionId, allergenId, timepoint, reading, notes, readBy, tenantId } = params;

    const fieldPrefix = timepoint === '48hr' ? 'reading_48hr' : 'reading_96hr';

    const result = await pool.query(
      `UPDATE patch_test_results
       SET ${fieldPrefix} = $1,
           ${fieldPrefix}_notes = $2,
           ${fieldPrefix}_by = $3,
           ${fieldPrefix}_at = NOW(),
           updated_at = NOW()
       WHERE session_id = $4 AND allergen_id = $5 AND tenant_id = $6
       RETURNING *`,
      [reading, notes || null, readBy, sessionId, allergenId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Result record not found');
    }

    // Update session status if needed
    await this.updateSessionStatus(sessionId, timepoint, tenantId);

    logger.info('Patch test reading recorded', {
      sessionId,
      allergenId,
      timepoint,
      reading,
    });

    return result.rows[0];
  }

  /**
   * Record multiple readings at once
   */
  static async recordBulkReadings(
    sessionId: string,
    readings: Array<{ allergenId: string; reading: ReadingValue; notes?: string }>,
    timepoint: '48hr' | '96hr',
    readBy: string,
    tenantId: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const fieldPrefix = timepoint === '48hr' ? 'reading_48hr' : 'reading_96hr';

      for (const { allergenId, reading, notes } of readings) {
        await client.query(
          `UPDATE patch_test_results
           SET ${fieldPrefix} = $1,
               ${fieldPrefix}_notes = $2,
               ${fieldPrefix}_by = $3,
               ${fieldPrefix}_at = NOW(),
               updated_at = NOW()
           WHERE session_id = $4 AND allergen_id = $5 AND tenant_id = $6`,
          [reading, notes || null, readBy, sessionId, allergenId, tenantId]
        );
      }

      // Update session status and actual read date
      const statusField = timepoint === '48hr' ? 'read_48hr' : 'read_96hr';
      const dateField = timepoint === '48hr' ? 'actual_48hr_read_date' : 'actual_96hr_read_date';

      await client.query(
        `UPDATE patch_test_sessions
         SET status = $1, ${dateField} = NOW(), reading_provider_id = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [statusField, readBy, sessionId, tenantId]
      );

      await client.query('COMMIT');

      logger.info('Bulk patch test readings recorded', {
        sessionId,
        timepoint,
        count: readings.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update session status based on readings
   */
  private static async updateSessionStatus(
    sessionId: string,
    timepoint: '48hr' | '96hr',
    tenantId: string
  ): Promise<void> {
    // Check if all results have been read for this timepoint
    const fieldName = timepoint === '48hr' ? 'reading_48hr' : 'reading_96hr';

    const result = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN ${fieldName} != 'not_read' THEN 1 END) as read_count
       FROM patch_test_results
       WHERE session_id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );

    const { total, read_count } = result.rows[0];

    if (parseInt(total) === parseInt(read_count)) {
      const newStatus = timepoint === '48hr' ? 'read_48hr' : 'read_96hr';
      const dateField = timepoint === '48hr' ? 'actual_48hr_read_date' : 'actual_96hr_read_date';

      await pool.query(
        `UPDATE patch_test_sessions
         SET status = $1, ${dateField} = NOW(), updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [newStatus, sessionId, tenantId]
      );
    }
  }

  /**
   * Interpret results and generate clinical interpretation
   */
  static async interpretResults(sessionId: string, tenantId: string): Promise<any> {
    // Get all results with allergen details
    const results = await pool.query(
      `SELECT ptr.*, ad.cross_reactors, ad.common_sources, ad.avoidance_instructions
       FROM patch_test_results ptr
       LEFT JOIN allergen_database ad ON ptr.allergen_id = ad.id
       WHERE ptr.session_id = $1 AND ptr.tenant_id = $2
       ORDER BY ptr.position_number`,
      [sessionId, tenantId]
    );

    const positive: AllergenResult[] = [];
    const negative: AllergenResult[] = [];
    const irritant: AllergenResult[] = [];
    const doubtful: AllergenResult[] = [];

    for (const row of results.rows) {
      // Use 96hr reading if available, otherwise 48hr
      const finalReading = row.reading_96hr !== 'not_read' ? row.reading_96hr : row.reading_48hr;

      const allergenResult: AllergenResult = {
        id: row.id,
        allergenId: row.allergen_id,
        allergenName: row.allergen_name,
        position: row.position_number,
        reading48hr: row.reading_48hr,
        reading96hr: row.reading_96hr,
        interpretation: row.interpretation,
        crossReactors: row.cross_reactors || [],
        commonSources: row.common_sources || [],
        avoidanceInstructions: row.avoidance_instructions || '',
      };

      switch (finalReading) {
        case 'weak_positive':
        case 'strong_positive':
        case 'extreme_positive':
          positive.push(allergenResult);
          break;
        case 'negative':
          negative.push(allergenResult);
          break;
        case 'irritant':
          irritant.push(allergenResult);
          break;
        case 'doubtful':
          doubtful.push(allergenResult);
          break;
      }
    }

    return {
      sessionId,
      positive,
      negative,
      irritant,
      doubtful,
      summary: {
        totalTested: results.rows.length,
        positiveCount: positive.length,
        negativeCount: negative.length,
        irritantCount: irritant.length,
        doubtfulCount: doubtful.length,
      },
    };
  }

  /**
   * Generate comprehensive patient report
   */
  static async generateReport(sessionId: string, tenantId: string, generatedBy: string): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get session details with patient info
      const sessionResult = await client.query(
        `SELECT pts.*,
                p.first_name || ' ' || p.last_name as patient_name,
                p.dob as patient_dob
         FROM patch_test_sessions pts
         JOIN patients p ON pts.patient_id = p.id
         WHERE pts.id = $1 AND pts.tenant_id = $2`,
        [sessionId, tenantId]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionResult.rows[0];

      // Get interpreted results
      const interpretation = await this.interpretResults(sessionId, tenantId);

      // Build avoidance list from positive allergens
      const avoidanceList = interpretation.positive.map((allergen: AllergenResult) => ({
        allergen: allergen.allergenName,
        sources: allergen.commonSources,
        instructions: allergen.avoidanceInstructions,
        crossReactors: allergen.crossReactors,
      }));

      // Generate recommendations text
      const recommendations = this.generateRecommendationsText(interpretation.positive);

      // Create or update report
      const reportResult = await client.query(
        `INSERT INTO patch_test_reports (
          tenant_id, session_id, generated_by, positive_allergens, negative_allergens,
          irritant_reactions, recommendations, avoidance_list, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
        ON CONFLICT (session_id) DO UPDATE SET
          generated_by = EXCLUDED.generated_by,
          positive_allergens = EXCLUDED.positive_allergens,
          negative_allergens = EXCLUDED.negative_allergens,
          irritant_reactions = EXCLUDED.irritant_reactions,
          recommendations = EXCLUDED.recommendations,
          avoidance_list = EXCLUDED.avoidance_list,
          report_generated_at = NOW(),
          updated_at = NOW()
        RETURNING *`,
        [
          tenantId,
          sessionId,
          generatedBy,
          JSON.stringify(interpretation.positive),
          JSON.stringify(interpretation.negative),
          JSON.stringify(interpretation.irritant),
          recommendations,
          JSON.stringify(avoidanceList),
        ]
      );

      // Update session status to completed
      await client.query(
        `UPDATE patch_test_sessions SET status = 'completed', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [sessionId, tenantId]
      );

      await client.query('COMMIT');

      const report = reportResult.rows[0];

      logger.info('Patch test report generated', {
        sessionId,
        reportId: report.id,
        positiveCount: interpretation.positive.length,
      });

      return {
        ...report,
        patientName: session.patient_name,
        applicationDate: session.application_date,
        interpretation,
        avoidanceList,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate recommendations text from positive allergens
   */
  private static generateRecommendationsText(positiveAllergens: AllergenResult[]): string {
    if (positiveAllergens.length === 0) {
      return 'No positive reactions identified. The tested allergens are unlikely to be contributing to your contact dermatitis. Consider additional testing or investigation of other potential causes.';
    }

    let recommendations = 'PATCH TEST RESULTS AND RECOMMENDATIONS\n\n';
    recommendations += `${positiveAllergens.length} positive reaction(s) identified:\n\n`;

    for (const allergen of positiveAllergens) {
      recommendations += `${allergen.allergenName}\n`;
      recommendations += '-'.repeat(allergen.allergenName.length) + '\n';

      if (allergen.commonSources.length > 0) {
        recommendations += 'Common sources: ' + allergen.commonSources.join(', ') + '\n';
      }

      if (allergen.crossReactors.length > 0) {
        recommendations += 'May cross-react with: ' + allergen.crossReactors.join(', ') + '\n';
      }

      if (allergen.avoidanceInstructions) {
        recommendations += 'Avoidance instructions: ' + allergen.avoidanceInstructions + '\n';
      }

      recommendations += '\n';
    }

    recommendations += 'GENERAL RECOMMENDATIONS:\n';
    recommendations += '1. Read product labels carefully and avoid products containing your allergens.\n';
    recommendations += '2. Keep a list of your allergens in your wallet or phone.\n';
    recommendations += '3. Contact the manufacturer if allergen content is unclear.\n';
    recommendations += '4. Consider patch testing personal products before full use.\n';
    recommendations += '5. Follow up with your dermatologist as recommended.\n';

    return recommendations;
  }

  /**
   * Get common sources for a specific allergen
   */
  static async getCommonSources(allergenId: string, tenantId: string): Promise<any> {
    const result = await pool.query(
      `SELECT id, name, common_sources, cross_reactors, avoidance_instructions, category
       FROM allergen_database
       WHERE id = $1 AND (tenant_id = $2 OR tenant_id = 'system')`,
      [allergenId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Allergen not found');
    }

    return result.rows[0];
  }

  /**
   * Get all available panels
   */
  static async getPanels(tenantId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM patch_test_panels
       WHERE (tenant_id = $1 OR tenant_id = 'system') AND is_active = true
       ORDER BY is_standard DESC, name ASC`,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Get session with all details
   */
  static async getSession(sessionId: string, tenantId: string): Promise<any> {
    const sessionResult = await pool.query(
      `SELECT pts.*,
              p.first_name || ' ' || p.last_name as patient_name,
              p.mrn,
              p.dob as patient_dob,
              ap.first_name || ' ' || ap.last_name as applying_provider_name,
              rp.first_name || ' ' || rp.last_name as reading_provider_name
       FROM patch_test_sessions pts
       JOIN patients p ON pts.patient_id = p.id
       LEFT JOIN providers ap ON pts.applying_provider_id = ap.id
       LEFT JOIN providers rp ON pts.reading_provider_id = rp.id
       WHERE pts.id = $1 AND pts.tenant_id = $2`,
      [sessionId, tenantId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found');
    }

    const session = sessionResult.rows[0];

    // Get all results
    const resultsResult = await pool.query(
      `SELECT ptr.*, ad.category, ad.concentration, ad.vehicle,
              ad.cross_reactors, ad.common_sources, ad.avoidance_instructions
       FROM patch_test_results ptr
       LEFT JOIN allergen_database ad ON ptr.allergen_id = ad.id
       WHERE ptr.session_id = $1 AND ptr.tenant_id = $2
       ORDER BY ptr.position_number`,
      [sessionId, tenantId]
    );

    // Get report if exists
    const reportResult = await pool.query(
      `SELECT * FROM patch_test_reports WHERE session_id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );

    return {
      ...session,
      results: resultsResult.rows,
      report: reportResult.rows[0] || null,
    };
  }

  /**
   * Get all sessions for a patient
   */
  static async getPatientSessions(patientId: string, tenantId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT pts.*,
              p.first_name || ' ' || p.last_name as patient_name,
              (SELECT COUNT(*) FROM patch_test_results ptr
               WHERE ptr.session_id = pts.id
               AND (ptr.reading_48hr IN ('weak_positive', 'strong_positive', 'extreme_positive')
                    OR ptr.reading_96hr IN ('weak_positive', 'strong_positive', 'extreme_positive'))
              ) as positive_count
       FROM patch_test_sessions pts
       JOIN patients p ON pts.patient_id = p.id
       WHERE pts.patient_id = $1 AND pts.tenant_id = $2
       ORDER BY pts.application_date DESC`,
      [patientId, tenantId]
    );

    return result.rows;
  }

  /**
   * Search allergens in database
   */
  static async searchAllergens(
    query: string,
    category?: string,
    tenantId?: string
  ): Promise<any[]> {
    let sql = `SELECT * FROM allergen_database WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (query) {
      sql += ` AND (name ILIKE $${paramIndex} OR $${paramIndex + 1} = ANY(synonyms))`;
      params.push(`%${query}%`, query);
      paramIndex += 2;
    }

    if (category) {
      sql += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (tenantId) {
      sql += ` AND (tenant_id = $${paramIndex} OR tenant_id = 'system')`;
      params.push(tenantId);
    }

    sql += ` ORDER BY is_standard DESC, name ASC LIMIT 100`;

    const result = await pool.query(sql, params);
    return result.rows;
  }

  /**
   * Get sessions requiring attention (upcoming readings)
   */
  static async getSessionsRequiringAttention(tenantId: string): Promise<any[]> {
    const now = new Date();

    const result = await pool.query(
      `SELECT pts.*,
              p.first_name || ' ' || p.last_name as patient_name,
              p.phone as patient_phone,
              CASE
                WHEN pts.status = 'applied' AND pts.read_48hr_date <= $2 THEN '48hr_due'
                WHEN pts.status = 'read_48hr' AND pts.read_96hr_date <= $2 THEN '96hr_due'
                ELSE 'pending'
              END as attention_type
       FROM patch_test_sessions pts
       JOIN patients p ON pts.patient_id = p.id
       WHERE pts.tenant_id = $1
         AND pts.status IN ('applied', 'awaiting_48hr', 'read_48hr', 'awaiting_96hr')
         AND (
           (pts.status = 'applied' AND pts.read_48hr_date <= $2)
           OR (pts.status = 'read_48hr' AND pts.read_96hr_date <= $2)
         )
       ORDER BY
         CASE pts.status
           WHEN 'applied' THEN pts.read_48hr_date
           WHEN 'read_48hr' THEN pts.read_96hr_date
         END ASC`,
      [tenantId, now]
    );

    return result.rows;
  }

  /**
   * Get statistics for patch testing
   */
  static async getStatistics(tenantId: string, startDate?: Date, endDate?: Date): Promise<any> {
    const params: any[] = [tenantId];
    let dateFilter = '';
    let paramIndex = 2;

    if (startDate && endDate) {
      dateFilter = `AND pts.application_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(startDate, endDate);
    }

    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT pts.id) as total_sessions,
        COUNT(DISTINCT pts.patient_id) as unique_patients,
        COUNT(DISTINCT ptr.id) as total_allergens_tested,
        COUNT(DISTINCT CASE WHEN ptr.reading_48hr IN ('weak_positive', 'strong_positive', 'extreme_positive')
                           OR ptr.reading_96hr IN ('weak_positive', 'strong_positive', 'extreme_positive')
                      THEN ptr.id END) as positive_reactions,
        COUNT(DISTINCT CASE WHEN pts.status = 'completed' THEN pts.id END) as completed_sessions,
        (SELECT allergen_name FROM patch_test_results
         WHERE tenant_id = $1
         AND (reading_48hr IN ('weak_positive', 'strong_positive', 'extreme_positive')
              OR reading_96hr IN ('weak_positive', 'strong_positive', 'extreme_positive'))
         GROUP BY allergen_name
         ORDER BY COUNT(*) DESC
         LIMIT 1) as most_common_positive
       FROM patch_test_sessions pts
       LEFT JOIN patch_test_results ptr ON pts.id = ptr.session_id
       WHERE pts.tenant_id = $1 ${dateFilter}`,
      params
    );

    // Get top allergens
    const topAllergens = await pool.query(
      `SELECT allergen_name, COUNT(*) as positive_count
       FROM patch_test_results
       WHERE tenant_id = $1
         AND (reading_48hr IN ('weak_positive', 'strong_positive', 'extreme_positive')
              OR reading_96hr IN ('weak_positive', 'strong_positive', 'extreme_positive'))
       GROUP BY allergen_name
       ORDER BY positive_count DESC
       LIMIT 10`,
      [tenantId]
    );

    return {
      ...result.rows[0],
      topPositiveAllergens: topAllergens.rows,
    };
  }

  /**
   * Update result interpretation/relevance
   */
  static async updateResultInterpretation(
    resultId: string,
    interpretation: string,
    relevanceNotes: string,
    tenantId: string
  ): Promise<any> {
    const result = await pool.query(
      `UPDATE patch_test_results
       SET interpretation = $1, relevance_notes = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [interpretation, relevanceNotes, resultId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Result not found');
    }

    return result.rows[0];
  }

  /**
   * Cancel a session
   */
  static async cancelSession(sessionId: string, reason: string, tenantId: string): Promise<any> {
    const result = await pool.query(
      `UPDATE patch_test_sessions
       SET status = 'cancelled', general_notes = COALESCE(general_notes, '') || E'\nCancellation reason: ' || $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [reason, sessionId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Session not found');
    }

    return result.rows[0];
  }
}
