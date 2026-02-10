/**
 * Severity Score Service
 * Business logic for dermatology severity score calculators
 * Supports IGA, PASI, BSA, and DLQI assessments
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// ============================================================================
// Type Definitions
// ============================================================================

export type AssessmentType = 'IGA' | 'PASI' | 'BSA' | 'DLQI';

export interface PASIRegionScore {
  erythema: number; // 0-4
  induration: number; // 0-4
  scaling: number; // 0-4
  area: number; // 0-6
}

export interface PASIComponents {
  head: PASIRegionScore;
  trunk: PASIRegionScore;
  upper_extremities: PASIRegionScore;
  lower_extremities: PASIRegionScore;
}

export interface BSARegion {
  region_id: string;
  affected_percent: number;
}

export interface BSAComponents {
  method: 'palm' | 'rule_of_9s';
  is_child: boolean;
  affected_areas: BSARegion[];
  palm_count?: number; // for palm method
}

export interface DLQIResponses {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  q6: number;
  q7: number;
  q8: number;
  q9: number;
  q10: number;
}

export interface IGAComponents {
  selection: number; // 0-4
  description: string;
}

export interface ScoreResult {
  score: number;
  interpretation: string;
  severity_level: string;
  component_breakdown?: Record<string, unknown>;
}

export interface SaveAssessmentParams {
  tenantId: string;
  patientId: string;
  encounterId?: string | null;
  assessmentType: AssessmentType;
  scoreValue: number;
  scoreInterpretation: string;
  severityLevel: string;
  componentScores: Record<string, unknown>;
  assessedBy: string;
  clinicalNotes?: string;
  photoIds?: string[];
  isBaseline?: boolean;
}

export interface AssessmentRecord {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  assessment_type: AssessmentType;
  score_value: number;
  score_interpretation: string;
  severity_level: string;
  component_scores: Record<string, unknown>;
  assessed_by: string;
  assessed_at: string;
  clinical_notes: string | null;
  is_baseline: boolean;
  change_from_baseline: number | null;
  percent_change: number | null;
}

export interface ScoreHistoryEntry {
  date: string;
  score: number;
  interpretation: string;
  assessment_id: string;
}

export interface AssessmentHistory {
  patient_id: string;
  assessment_type: AssessmentType;
  total_assessments: number;
  baseline_score: number | null;
  baseline_date: string | null;
  latest_score: number | null;
  latest_date: string | null;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  trend: string | null;
  scores_over_time: ScoreHistoryEntry[];
}

export interface AssessmentTemplate {
  id: string;
  type: AssessmentType;
  name: string;
  description: string;
  min_score: number;
  max_score: number;
  interpretation_ranges: InterpretationRange[];
  component_definitions: Record<string, unknown>;
}

interface InterpretationRange {
  min: number;
  max: number;
  label: string;
  severity: string;
  description?: string;
}

// ============================================================================
// PASI Calculator
// ============================================================================

/**
 * Calculate PASI (Psoriasis Area Severity Index) score
 * Formula: 0.1(Eh+Ih+Sh)Ah + 0.2(Et+It+St)At + 0.2(Eu+Iu+Su)Au + 0.4(El+Il+Sl)Al
 */
export function calculatePASI(components: PASIComponents): ScoreResult {
  const { head, trunk, upper_extremities, lower_extremities } = components;

  // Validate inputs
  const validateRegion = (region: PASIRegionScore, name: string): void => {
    if (region.erythema < 0 || region.erythema > 4) {
      throw new Error(`${name} erythema must be 0-4`);
    }
    if (region.induration < 0 || region.induration > 4) {
      throw new Error(`${name} induration must be 0-4`);
    }
    if (region.scaling < 0 || region.scaling > 4) {
      throw new Error(`${name} scaling must be 0-4`);
    }
    if (region.area < 0 || region.area > 6) {
      throw new Error(`${name} area must be 0-6`);
    }
  };

  validateRegion(head, 'Head');
  validateRegion(trunk, 'Trunk');
  validateRegion(upper_extremities, 'Upper extremities');
  validateRegion(lower_extremities, 'Lower extremities');

  // Calculate region scores
  const headScore = (head.erythema + head.induration + head.scaling) * head.area;
  const trunkScore = (trunk.erythema + trunk.induration + trunk.scaling) * trunk.area;
  const upperScore = (upper_extremities.erythema + upper_extremities.induration + upper_extremities.scaling) * upper_extremities.area;
  const lowerScore = (lower_extremities.erythema + lower_extremities.induration + lower_extremities.scaling) * lower_extremities.area;

  // Apply weights
  const score = 0.1 * headScore + 0.2 * trunkScore + 0.2 * upperScore + 0.4 * lowerScore;
  const roundedScore = Math.round(score * 10) / 10;

  // Determine interpretation
  let interpretation: string;
  let severity_level: string;

  if (roundedScore === 0) {
    interpretation = 'Clear';
    severity_level = 'none';
  } else if (roundedScore < 5) {
    interpretation = 'Mild';
    severity_level = 'mild';
  } else if (roundedScore < 10) {
    interpretation = 'Moderate';
    severity_level = 'moderate';
  } else if (roundedScore < 20) {
    interpretation = 'Severe';
    severity_level = 'severe';
  } else {
    interpretation = 'Very Severe';
    severity_level = 'very_severe';
  }

  return {
    score: roundedScore,
    interpretation,
    severity_level,
    component_breakdown: {
      head: { weight: 0.1, severity_sum: head.erythema + head.induration + head.scaling, area: head.area, subtotal: headScore },
      trunk: { weight: 0.2, severity_sum: trunk.erythema + trunk.induration + trunk.scaling, area: trunk.area, subtotal: trunkScore },
      upper_extremities: { weight: 0.2, severity_sum: upper_extremities.erythema + upper_extremities.induration + upper_extremities.scaling, area: upper_extremities.area, subtotal: upperScore },
      lower_extremities: { weight: 0.4, severity_sum: lower_extremities.erythema + lower_extremities.induration + lower_extremities.scaling, area: lower_extremities.area, subtotal: lowerScore }
    }
  };
}

// ============================================================================
// BSA Calculator
// ============================================================================

/**
 * Calculate BSA (Body Surface Area) percentage
 * Supports both palm method and Rule of 9s
 */
export function calculateBSA(components: BSAComponents): ScoreResult {
  const { method, is_child, affected_areas, palm_count } = components;

  let totalBSA = 0;

  if (method === 'palm') {
    // Palm method: each palm = 1% BSA
    if (palm_count !== undefined) {
      totalBSA = palm_count;
    } else {
      // Sum up affected areas as percentages
      for (const area of affected_areas) {
        totalBSA += area.affected_percent;
      }
    }
  } else {
    // Rule of 9s
    const regionPercentages: Record<string, { adult: number; child: number }> = {
      head_neck: { adult: 9, child: 18 },
      anterior_trunk: { adult: 18, child: 18 },
      posterior_trunk: { adult: 18, child: 18 },
      right_arm: { adult: 9, child: 9 },
      left_arm: { adult: 9, child: 9 },
      right_leg: { adult: 18, child: 14 },
      left_leg: { adult: 18, child: 14 },
      perineum: { adult: 1, child: 1 }
    };

    for (const area of affected_areas) {
      const regionData = regionPercentages[area.region_id];
      if (regionData) {
        const maxPercent = is_child ? regionData.child : regionData.adult;
        // affected_percent is 0-100 representing what portion of that region is affected
        totalBSA += (area.affected_percent / 100) * maxPercent;
      }
    }
  }

  // Clamp to 0-100
  totalBSA = Math.min(100, Math.max(0, totalBSA));
  const roundedScore = Math.round(totalBSA * 10) / 10;

  // Determine interpretation
  let interpretation: string;
  let severity_level: string;

  if (roundedScore === 0) {
    interpretation = 'Clear';
    severity_level = 'none';
  } else if (roundedScore < 3) {
    interpretation = 'Mild';
    severity_level = 'mild';
  } else if (roundedScore < 10) {
    interpretation = 'Moderate';
    severity_level = 'moderate';
  } else {
    interpretation = 'Severe';
    severity_level = 'severe';
  }

  return {
    score: roundedScore,
    interpretation,
    severity_level,
    component_breakdown: {
      method,
      is_child,
      affected_areas,
      palm_count
    }
  };
}

// ============================================================================
// DLQI Calculator
// ============================================================================

/**
 * Calculate DLQI (Dermatology Life Quality Index) score
 * 10 questions, each scored 0-3, total 0-30
 */
export function calculateDLQI(responses: DLQIResponses): ScoreResult {
  // Validate responses
  const questionKeys = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;

  for (const key of questionKeys) {
    const value = responses[key];
    if (value < 0 || value > 3) {
      throw new Error(`Question ${key} score must be 0-3`);
    }
  }

  // Calculate total
  const total = questionKeys.reduce((sum, key) => sum + responses[key], 0);

  // Calculate domain scores
  const domains = {
    symptoms_feelings: responses.q1 + responses.q2,
    daily_activities: responses.q3 + responses.q4,
    leisure: responses.q5 + responses.q6,
    work_school: responses.q7,
    personal_relationships: responses.q8 + responses.q9,
    treatment: responses.q10
  };

  // Determine interpretation
  let interpretation: string;
  let severity_level: string;

  if (total <= 1) {
    interpretation = 'No Effect';
    severity_level = 'none';
  } else if (total <= 5) {
    interpretation = 'Small Effect';
    severity_level = 'mild';
  } else if (total <= 10) {
    interpretation = 'Moderate Effect';
    severity_level = 'moderate';
  } else if (total <= 20) {
    interpretation = 'Large Effect';
    severity_level = 'severe';
  } else {
    interpretation = 'Extremely Large Effect';
    severity_level = 'very_severe';
  }

  return {
    score: total,
    interpretation,
    severity_level,
    component_breakdown: {
      responses,
      domain_scores: domains
    }
  };
}

// ============================================================================
// IGA Calculator
// ============================================================================

/**
 * Calculate IGA (Investigator Global Assessment) score
 * Simple 0-4 scale selection
 */
export function calculateIGA(components: IGAComponents): ScoreResult {
  const { selection } = components;

  if (selection < 0 || selection > 4) {
    throw new Error('IGA selection must be 0-4');
  }

  const interpretations: Record<number, { label: string; severity: string; description: string }> = {
    0: { label: 'Clear', severity: 'none', description: 'No inflammatory signs of disease' },
    1: { label: 'Almost Clear', severity: 'minimal', description: 'Just perceptible erythema and just perceptible induration/papulation' },
    2: { label: 'Mild', severity: 'mild', description: 'Clearly perceptible erythema and clearly perceptible induration/papulation' },
    3: { label: 'Moderate', severity: 'moderate', description: 'Marked erythema and marked induration/papulation' },
    4: { label: 'Severe', severity: 'severe', description: 'Severe erythema and severe induration/papulation' }
  };

  const result = interpretations[selection];
  if (!result) {
    throw new Error('Invalid IGA selection');
  }

  return {
    score: selection,
    interpretation: result.label,
    severity_level: result.severity,
    component_breakdown: {
      selection,
      description: result.description
    }
  };
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Save a severity assessment to the database
 */
export async function saveAssessment(params: SaveAssessmentParams): Promise<AssessmentRecord> {
  const {
    tenantId,
    patientId,
    encounterId,
    assessmentType,
    scoreValue,
    scoreInterpretation,
    severityLevel,
    componentScores,
    assessedBy,
    clinicalNotes,
    photoIds,
    isBaseline
  } = params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get baseline for comparison if exists
    let changeFromBaseline: number | null = null;
    let percentChange: number | null = null;

    if (!isBaseline) {
      const baselineResult = await client.query(
        `SELECT score_value FROM severity_assessments
         WHERE tenant_id = $1 AND patient_id = $2 AND assessment_type = $3 AND is_baseline = true
         ORDER BY assessed_at DESC LIMIT 1`,
        [tenantId, patientId, assessmentType]
      );

      if (baselineResult.rows[0]) {
        const baselineScore = parseFloat(baselineResult.rows[0].score_value);
        changeFromBaseline = scoreValue - baselineScore;
        if (baselineScore !== 0) {
          percentChange = ((scoreValue - baselineScore) / baselineScore) * 100;
        }
      }
    }

    // Insert the assessment
    const insertResult = await client.query(
      `INSERT INTO severity_assessments (
        tenant_id, patient_id, encounter_id, assessment_type,
        score_value, score_interpretation, severity_level, component_scores,
        assessed_by, clinical_notes, photo_ids, is_baseline,
        change_from_baseline, percent_change
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        tenantId,
        patientId,
        encounterId || null,
        assessmentType,
        scoreValue,
        scoreInterpretation,
        severityLevel,
        JSON.stringify(componentScores),
        assessedBy,
        clinicalNotes || null,
        photoIds || [],
        isBaseline || false,
        changeFromBaseline,
        percentChange
      ]
    );

    await client.query('COMMIT');

    logger.info('Severity assessment saved', {
      assessmentId: insertResult.rows[0]?.id,
      patientId,
      assessmentType,
      score: scoreValue
    });

    return insertResult.rows[0] as AssessmentRecord;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error saving severity assessment', { error, params });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get score history for a patient
 */
export async function getScoreHistory(
  tenantId: string,
  patientId: string,
  assessmentType?: AssessmentType
): Promise<AssessmentHistory[]> {
  let query = `
    SELECT
      patient_id,
      assessment_type,
      total_assessments,
      baseline_score,
      baseline_date,
      latest_score,
      latest_date,
      best_score,
      worst_score,
      average_score,
      trend,
      scores_over_time
    FROM assessment_history
    WHERE tenant_id = $1 AND patient_id = $2
  `;
  const queryParams: (string | AssessmentType)[] = [tenantId, patientId];

  if (assessmentType) {
    query += ' AND assessment_type = $3';
    queryParams.push(assessmentType);
  }

  query += ' ORDER BY assessment_type';

  const result = await pool.query(query, queryParams);

  return result.rows.map(row => ({
    ...row,
    scores_over_time: (row.scores_over_time || []).map((entry: Record<string, unknown>) => ({
      date: entry.date as string,
      score: entry.score as number,
      interpretation: entry.interpretation as string,
      assessment_id: entry.assessment_id as string
    }))
  })) as AssessmentHistory[];
}

/**
 * Get assessment templates
 */
export async function getAssessmentTemplates(
  tenantId: string,
  type?: AssessmentType
): Promise<AssessmentTemplate[]> {
  let query = `
    SELECT id, type, name, description, min_score, max_score,
           interpretation_ranges, component_definitions
    FROM assessment_templates
    WHERE (tenant_id = $1 OR tenant_id = '00000000-0000-0000-0000-000000000000')
      AND is_active = true
  `;
  const queryParams: (string | AssessmentType)[] = [tenantId];

  if (type) {
    query += ' AND type = $2';
    queryParams.push(type);
  }

  query += ' ORDER BY type, version DESC';

  const result = await pool.query(query, queryParams);

  // Dedupe by type (take first/latest version)
  const templateMap = new Map<string, AssessmentTemplate>();
  for (const row of result.rows) {
    if (!templateMap.has(row.type)) {
      templateMap.set(row.type, row as AssessmentTemplate);
    }
  }

  return Array.from(templateMap.values());
}

/**
 * Get recent assessments for a patient
 */
export async function getPatientAssessments(
  tenantId: string,
  patientId: string,
  options?: {
    type?: AssessmentType;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<AssessmentRecord[]> {
  let query = `
    SELECT
      sa.*,
      p.first_name || ' ' || p.last_name as assessed_by_name
    FROM severity_assessments sa
    LEFT JOIN providers p ON sa.assessed_by = p.id
    WHERE sa.tenant_id = $1 AND sa.patient_id = $2 AND sa.deleted_at IS NULL
  `;
  const queryParams: unknown[] = [tenantId, patientId];
  let paramIndex = 3;

  if (options?.type) {
    query += ` AND sa.assessment_type = $${paramIndex}`;
    queryParams.push(options.type);
    paramIndex++;
  }

  if (options?.startDate) {
    query += ` AND sa.assessed_at >= $${paramIndex}`;
    queryParams.push(options.startDate);
    paramIndex++;
  }

  if (options?.endDate) {
    query += ` AND sa.assessed_at <= $${paramIndex}`;
    queryParams.push(options.endDate);
    paramIndex++;
  }

  query += ' ORDER BY sa.assessed_at DESC';

  if (options?.limit) {
    query += ` LIMIT $${paramIndex}`;
    queryParams.push(options.limit);
  }

  const result = await pool.query(query, queryParams);
  return result.rows as AssessmentRecord[];
}

/**
 * Get a single assessment by ID
 */
export async function getAssessmentById(
  tenantId: string,
  assessmentId: string
): Promise<AssessmentRecord | null> {
  const result = await pool.query(
    `SELECT * FROM severity_assessments
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, assessmentId]
  );
  return (result.rows[0] as AssessmentRecord) || null;
}

/**
 * Delete an assessment (soft delete)
 */
export async function deleteAssessment(
  tenantId: string,
  assessmentId: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE severity_assessments
     SET deleted_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, assessmentId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get latest scores summary for a patient
 */
export async function getLatestScoresSummary(
  tenantId: string,
  patientId: string
): Promise<Record<AssessmentType, AssessmentRecord | null>> {
  const types: AssessmentType[] = ['IGA', 'PASI', 'BSA', 'DLQI'];
  const summary: Record<AssessmentType, AssessmentRecord | null> = {
    IGA: null,
    PASI: null,
    BSA: null,
    DLQI: null
  };

  for (const type of types) {
    const result = await pool.query(
      `SELECT * FROM severity_assessments
       WHERE tenant_id = $1 AND patient_id = $2 AND assessment_type = $3 AND deleted_at IS NULL
       ORDER BY assessed_at DESC LIMIT 1`,
      [tenantId, patientId, type]
    );
    summary[type] = (result.rows[0] as AssessmentRecord) || null;
  }

  return summary;
}

export const severityScoreService = {
  calculatePASI,
  calculateBSA,
  calculateDLQI,
  calculateIGA,
  saveAssessment,
  getScoreHistory,
  getAssessmentTemplates,
  getPatientAssessments,
  getAssessmentById,
  deleteAssessment,
  getLatestScoresSummary
};
