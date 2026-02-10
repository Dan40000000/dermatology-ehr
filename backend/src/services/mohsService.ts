/**
 * Mohs Micrographic Surgery Service
 * Business logic for complete Mohs surgery workflow
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface TumorData {
  tumor_location: string;
  tumor_location_code?: string;
  tumor_laterality?: 'left' | 'right' | 'midline' | 'bilateral';
  tumor_type: string;
  tumor_subtype?: string;
  tumor_histology?: string;
  clinical_description?: string;
  pre_op_size_mm?: number;
  pre_op_width_mm?: number;
  pre_op_length_mm?: number;
  prior_biopsy_id?: string;
  prior_pathology_diagnosis?: string;
  prior_pathology_date?: string;
}

export interface StageData {
  stage_number: number;
  excision_time?: Date;
  excision_width_mm?: number;
  excision_length_mm?: number;
  excision_depth_mm?: number;
  tissue_processor?: string;
  histology_tech?: string;
  stain_type?: string;
  notes?: string;
}

export interface MarginData {
  block_label: string;
  position?: string;
  position_degrees?: number;
  margin_status: 'positive' | 'negative' | 'close' | 'indeterminate';
  deep_margin_status?: 'positive' | 'negative' | 'close' | 'indeterminate';
  depth_mm?: number;
  tumor_type_found?: string;
  tumor_percentage?: number;
  notes?: string;
}

export interface ClosureData {
  closure_type: string;
  closure_subtype?: string;
  closure_by?: string;
  repair_length_cm?: number;
  repair_width_cm?: number;
  repair_area_sq_cm?: number;
  repair_cpt_codes?: string[];
  flap_graft_details?: Record<string, unknown>;
  suture_layers?: number;
  deep_sutures?: string;
  superficial_sutures?: string;
  suture_removal_days?: number;
  dressing_type?: string;
  pressure_dressing?: boolean;
  closure_notes?: string;
  technique_notes?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface MohsCase {
  id: string;
  tenant_id: string;
  patient_id: string;
  encounter_id?: string;
  surgeon_id: string;
  case_number: string;
  case_date: Date;
  tumor_location: string;
  tumor_type: string;
  status: string;
  total_stages: number;
  created_at: Date;
  updated_at: Date;
}

export interface MohsStage {
  id: string;
  case_id: string;
  stage_number: number;
  margin_status?: string;
  block_count: number;
  created_at: Date;
}

export interface MohsStats {
  total_cases: number;
  avg_stages_per_case: number;
  clearance_rate_first_stage: number;
  clearance_rate_overall: number;
  avg_turnaround_minutes: number;
  cases_by_tumor_type: Record<string, number>;
  cases_by_location: Record<string, number>;
  closure_type_distribution: Record<string, number>;
}

// ============================================================================
// MOHS SERVICE CLASS
// ============================================================================

export class MohsService {
  /**
   * Create a new Mohs case
   */
  static async createCase(
    tenantId: string,
    patientId: string,
    encounterId: string | null,
    surgeonId: string,
    tumorData: TumorData,
    userId: string
  ): Promise<MohsCase> {
    const query = `
      INSERT INTO mohs_cases (
        tenant_id,
        patient_id,
        encounter_id,
        surgeon_id,
        case_date,
        tumor_location,
        tumor_location_code,
        tumor_laterality,
        tumor_type,
        tumor_subtype,
        tumor_histology,
        clinical_description,
        pre_op_size_mm,
        pre_op_width_mm,
        pre_op_length_mm,
        prior_biopsy_id,
        prior_pathology_diagnosis,
        prior_pathology_date,
        status,
        created_by
      ) VALUES (
        $1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, 'scheduled', $18
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      patientId,
      encounterId,
      surgeonId,
      tumorData.tumor_location,
      tumorData.tumor_location_code || null,
      tumorData.tumor_laterality || null,
      tumorData.tumor_type,
      tumorData.tumor_subtype || null,
      tumorData.tumor_histology || null,
      tumorData.clinical_description || null,
      tumorData.pre_op_size_mm || null,
      tumorData.pre_op_width_mm || null,
      tumorData.pre_op_length_mm || null,
      tumorData.prior_biopsy_id || null,
      tumorData.prior_pathology_diagnosis || null,
      tumorData.prior_pathology_date || null,
      userId
    ]);

    logger.info('Mohs case created', {
      caseId: result.rows[0]?.id,
      patientId,
      surgeonId,
      tumorType: tumorData.tumor_type
    });

    return result.rows[0] as MohsCase;
  }

  /**
   * Get case by ID with all stages
   */
  static async getCase(caseId: string, tenantId: string): Promise<MohsCase | null> {
    const query = `
      SELECT
        mc.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob as patient_dob,
        s.first_name || ' ' || s.last_name as surgeon_name,
        a.first_name || ' ' || a.last_name as assistant_name,
        (
          SELECT json_agg(
            json_build_object(
              'id', ms.id,
              'stage_number', ms.stage_number,
              'excision_time', ms.excision_time,
              'frozen_section_time', ms.frozen_section_time,
              'reading_time', ms.reading_time,
              'margin_status', ms.margin_status,
              'margin_status_details', ms.margin_status_details,
              'block_count', ms.block_count,
              'excision_width_mm', ms.excision_width_mm,
              'excision_length_mm', ms.excision_length_mm,
              'excision_depth_mm', ms.excision_depth_mm,
              'map_image_url', ms.map_image_url,
              'notes', ms.notes,
              'blocks', (
                SELECT json_agg(
                  json_build_object(
                    'id', msb.id,
                    'block_label', msb.block_label,
                    'position', msb.position,
                    'position_degrees', msb.position_degrees,
                    'margin_status', msb.margin_status,
                    'deep_margin_status', msb.deep_margin_status,
                    'depth_mm', msb.depth_mm,
                    'tumor_type_found', msb.tumor_type_found,
                    'tumor_percentage', msb.tumor_percentage,
                    'notes', msb.notes
                  ) ORDER BY msb.block_label
                )
                FROM mohs_stage_blocks msb
                WHERE msb.stage_id = ms.id
              )
            ) ORDER BY ms.stage_number
          )
          FROM mohs_stages ms
          WHERE ms.case_id = mc.id
        ) as stages,
        (
          SELECT json_agg(
            json_build_object(
              'id', mcl.id,
              'closure_type', mcl.closure_type,
              'closure_subtype', mcl.closure_subtype,
              'closure_time', mcl.closure_time,
              'repair_length_cm', mcl.repair_length_cm,
              'repair_width_cm', mcl.repair_width_cm,
              'repair_area_sq_cm', mcl.repair_area_sq_cm,
              'repair_cpt_codes', mcl.repair_cpt_codes,
              'flap_graft_details', mcl.flap_graft_details,
              'closure_notes', mcl.closure_notes
            )
          )
          FROM mohs_closures mcl
          WHERE mcl.case_id = mc.id
        ) as closures,
        (
          SELECT json_agg(
            json_build_object(
              'id', mm.id,
              'map_type', mm.map_type,
              'stage_id', mm.stage_id,
              'map_svg', mm.map_svg,
              'annotations', mm.annotations,
              'orientation_12_oclock', mm.orientation_12_oclock,
              'version', mm.version
            ) ORDER BY mm.created_at
          )
          FROM mohs_maps mm
          WHERE mm.case_id = mc.id
        ) as maps
      FROM mohs_cases mc
      JOIN patients p ON mc.patient_id = p.id
      JOIN providers s ON mc.surgeon_id = s.id
      LEFT JOIN providers a ON mc.assistant_id = a.id
      WHERE mc.id = $1
        AND mc.tenant_id = $2
        AND mc.deleted_at IS NULL
    `;

    const result = await pool.query(query, [caseId, tenantId]);
    return result.rows[0] as MohsCase | null;
  }

  /**
   * Add a new stage to a case
   */
  static async addStage(
    caseId: string,
    tenantId: string,
    stageData: StageData
  ): Promise<MohsStage> {
    const query = `
      INSERT INTO mohs_stages (
        case_id,
        tenant_id,
        stage_number,
        excision_time,
        excision_width_mm,
        excision_length_mm,
        excision_depth_mm,
        tissue_processor,
        histology_tech,
        stain_type,
        notes,
        margin_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending'
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      caseId,
      tenantId,
      stageData.stage_number,
      stageData.excision_time || new Date(),
      stageData.excision_width_mm || null,
      stageData.excision_length_mm || null,
      stageData.excision_depth_mm || null,
      stageData.tissue_processor || null,
      stageData.histology_tech || null,
      stageData.stain_type || 'H&E',
      stageData.notes || null
    ]);

    // Update case status to in_progress if it was pre_op or scheduled
    await pool.query(
      `UPDATE mohs_cases
       SET status = CASE
         WHEN status IN ('scheduled', 'pre_op') THEN 'in_progress'
         ELSE status
       END,
       start_time = COALESCE(start_time, NOW())
       WHERE id = $1`,
      [caseId]
    );

    logger.info('Mohs stage added', {
      caseId,
      stageNumber: stageData.stage_number
    });

    return result.rows[0] as MohsStage;
  }

  /**
   * Record margin status for blocks in a stage
   */
  static async recordMargins(
    stageId: string,
    tenantId: string,
    marginData: MarginData[]
  ): Promise<{ blocks: unknown[]; stageMarginStatus: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const blocks = [];
      let hasPositive = false;
      let hasPartial = false;
      let allNegative = true;

      for (const margin of marginData) {
        const query = `
          INSERT INTO mohs_stage_blocks (
            stage_id,
            tenant_id,
            block_label,
            position,
            position_degrees,
            margin_status,
            deep_margin_status,
            depth_mm,
            tumor_type_found,
            tumor_percentage,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (stage_id, block_label)
          DO UPDATE SET
            position = EXCLUDED.position,
            position_degrees = EXCLUDED.position_degrees,
            margin_status = EXCLUDED.margin_status,
            deep_margin_status = EXCLUDED.deep_margin_status,
            depth_mm = EXCLUDED.depth_mm,
            tumor_type_found = EXCLUDED.tumor_type_found,
            tumor_percentage = EXCLUDED.tumor_percentage,
            notes = EXCLUDED.notes,
            updated_at = NOW()
          RETURNING *
        `;

        const result = await client.query(query, [
          stageId,
          tenantId,
          margin.block_label,
          margin.position || null,
          margin.position_degrees || null,
          margin.margin_status,
          margin.deep_margin_status || null,
          margin.depth_mm || null,
          margin.tumor_type_found || null,
          margin.tumor_percentage || null,
          margin.notes || null
        ]);

        blocks.push(result.rows[0]);

        // Track overall margin status
        if (margin.margin_status === 'positive' || margin.deep_margin_status === 'positive') {
          hasPositive = true;
          allNegative = false;
        } else if (margin.margin_status === 'close' || margin.deep_margin_status === 'close') {
          hasPartial = true;
          allNegative = false;
        } else if (margin.margin_status !== 'negative') {
          allNegative = false;
        }
      }

      // Determine overall stage margin status
      let stageMarginStatus: string;
      if (allNegative) {
        stageMarginStatus = 'negative';
      } else if (hasPositive) {
        stageMarginStatus = 'positive';
      } else if (hasPartial) {
        stageMarginStatus = 'partial';
      } else {
        stageMarginStatus = 'pending';
      }

      // Update stage margin status
      await client.query(
        `UPDATE mohs_stages
         SET margin_status = $1,
             frozen_section_time = COALESCE(frozen_section_time, NOW()),
             reading_time = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [stageMarginStatus, stageId]
      );

      // If all margins negative, update case status to closure
      if (stageMarginStatus === 'negative') {
        // Get case_id from stage
        const stageResult = await client.query(
          'SELECT case_id FROM mohs_stages WHERE id = $1',
          [stageId]
        );
        if (stageResult.rows[0]) {
          await client.query(
            `UPDATE mohs_cases
             SET status = 'closure'
             WHERE id = $1 AND status = 'in_progress'`,
            [stageResult.rows[0].case_id]
          );
        }
      }

      await client.query('COMMIT');

      logger.info('Margins recorded', {
        stageId,
        blockCount: blocks.length,
        overallStatus: stageMarginStatus
      });

      return { blocks, stageMarginStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close/complete a Mohs case with closure documentation
   */
  static async closeCase(
    caseId: string,
    tenantId: string,
    closureData: ClosureData,
    userId: string
  ): Promise<MohsCase> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert closure record
      await client.query(
        `INSERT INTO mohs_closures (
          case_id,
          tenant_id,
          closure_type,
          closure_subtype,
          closure_by,
          closure_time,
          repair_length_cm,
          repair_width_cm,
          repair_area_sq_cm,
          repair_cpt_codes,
          flap_graft_details,
          suture_layers,
          deep_sutures,
          superficial_sutures,
          suture_removal_days,
          dressing_type,
          pressure_dressing,
          closure_notes,
          technique_notes
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          caseId,
          tenantId,
          closureData.closure_type,
          closureData.closure_subtype || null,
          closureData.closure_by || userId,
          closureData.repair_length_cm || null,
          closureData.repair_width_cm || null,
          closureData.repair_area_sq_cm || null,
          closureData.repair_cpt_codes || [],
          JSON.stringify(closureData.flap_graft_details || {}),
          closureData.suture_layers || null,
          closureData.deep_sutures || null,
          closureData.superficial_sutures || null,
          closureData.suture_removal_days || null,
          closureData.dressing_type || null,
          closureData.pressure_dressing || false,
          closureData.closure_notes || null,
          closureData.technique_notes || null
        ]
      );

      // Update case status and closure info
      const updateResult = await client.query(
        `UPDATE mohs_cases
         SET status = 'post_op',
             closure_type = $1,
             closure_subtype = $2,
             closure_performed_by = $3,
             repair_cpt_codes = $4,
             end_time = NOW(),
             updated_by = $5,
             updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7
         RETURNING *`,
        [
          closureData.closure_type,
          closureData.closure_subtype || null,
          closureData.closure_by || userId,
          closureData.repair_cpt_codes || [],
          userId,
          caseId,
          tenantId
        ]
      );

      await client.query('COMMIT');

      logger.info('Mohs case closed', {
        caseId,
        closureType: closureData.closure_type
      });

      return updateResult.rows[0] as MohsCase;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate full operative report for a Mohs case
   */
  static async generateMohsReport(
    caseId: string,
    tenantId: string
  ): Promise<{
    report: string;
    caseData: MohsCase;
    cptCodes: string[];
  }> {
    // Get full case data
    const caseData = await this.getCase(caseId, tenantId);
    if (!caseData) {
      throw new Error('Mohs case not found');
    }

    const c = caseData as unknown as Record<string, unknown>;
    const stages = (c.stages as unknown[] || []) as Array<Record<string, unknown>>;
    const closures = (c.closures as unknown[] || []) as Array<Record<string, unknown>>;

    // Build report sections
    const reportSections: string[] = [];

    // Header
    reportSections.push('MOHS MICROGRAPHIC SURGERY OPERATIVE REPORT');
    reportSections.push('='.repeat(50));
    reportSections.push('');

    // Patient/Case Info
    reportSections.push('PATIENT INFORMATION');
    reportSections.push('-'.repeat(30));
    reportSections.push(`Patient: ${c.patient_name}`);
    reportSections.push(`MRN: ${c.mrn}`);
    reportSections.push(`DOB: ${c.patient_dob}`);
    reportSections.push(`Case Number: ${c.case_number}`);
    reportSections.push(`Date of Surgery: ${c.case_date}`);
    reportSections.push(`Surgeon: ${c.surgeon_name}`);
    if (c.assistant_name) {
      reportSections.push(`Assistant: ${c.assistant_name}`);
    }
    reportSections.push('');

    // Pre-operative Diagnosis
    reportSections.push('PREOPERATIVE DIAGNOSIS');
    reportSections.push('-'.repeat(30));
    reportSections.push(`${c.tumor_type}${c.tumor_subtype ? ` (${c.tumor_subtype})` : ''}`);
    reportSections.push(`Location: ${c.tumor_location}${c.tumor_laterality ? ` (${c.tumor_laterality})` : ''}`);
    if (c.prior_pathology_diagnosis) {
      reportSections.push(`Prior Pathology: ${c.prior_pathology_diagnosis}`);
    }
    if (c.pre_op_size_mm) {
      reportSections.push(`Pre-operative Size: ${c.pre_op_size_mm}mm`);
    }
    reportSections.push('');

    // Anesthesia
    reportSections.push('ANESTHESIA');
    reportSections.push('-'.repeat(30));
    reportSections.push(`Type: ${c.anesthesia_type || 'Local'}`);
    if (c.anesthesia_agent) {
      reportSections.push(`Agent: ${c.anesthesia_agent}${c.anesthesia_volume_ml ? ` (${c.anesthesia_volume_ml}mL)` : ''}`);
    }
    reportSections.push('');

    // Procedure Details - Stages
    reportSections.push('MOHS STAGES');
    reportSections.push('-'.repeat(30));

    for (const stage of stages) {
      const blocks = (stage.blocks as unknown[] || []) as Array<Record<string, unknown>>;
      reportSections.push(`\nStage ${stage.stage_number}:`);
      reportSections.push(`  Margin Status: ${stage.margin_status?.toString().toUpperCase()}`);
      if (stage.excision_width_mm || stage.excision_length_mm) {
        reportSections.push(`  Excision Size: ${stage.excision_width_mm || '?'}mm x ${stage.excision_length_mm || '?'}mm`);
      }
      if (blocks.length > 0) {
        reportSections.push(`  Tissue Blocks: ${blocks.length}`);
        for (const block of blocks) {
          const blockStatus = block.margin_status === 'positive' ? '+' :
                              block.margin_status === 'negative' ? '-' : '~';
          reportSections.push(`    Block ${block.block_label}: ${blockStatus} (${block.position || 'unspecified'})`);
        }
      }
      if (stage.notes) {
        reportSections.push(`  Notes: ${stage.notes}`);
      }
    }
    reportSections.push('');

    // Final Defect
    reportSections.push('FINAL DEFECT');
    reportSections.push('-'.repeat(30));
    if (c.final_defect_size_mm) {
      reportSections.push(`Size: ${c.final_defect_size_mm}mm`);
    }
    if (c.final_defect_width_mm && c.final_defect_length_mm) {
      reportSections.push(`Dimensions: ${c.final_defect_width_mm}mm x ${c.final_defect_length_mm}mm`);
    }
    reportSections.push(`Total Stages: ${c.total_stages}`);
    reportSections.push('');

    // Closure/Repair
    reportSections.push('CLOSURE/REPAIR');
    reportSections.push('-'.repeat(30));
    if (closures.length > 0) {
      const closure = closures[0];
      if (closure) {
        reportSections.push(`Type: ${closure.closure_type}${closure.closure_subtype ? ` - ${closure.closure_subtype}` : ''}`);
        if (closure.repair_length_cm) {
          reportSections.push(`Repair Size: ${closure.repair_length_cm}cm${closure.repair_width_cm ? ` x ${closure.repair_width_cm}cm` : ''}`);
        }
        if (closure.closure_notes) {
          reportSections.push(`Notes: ${closure.closure_notes}`);
        }
        if (closure.technique_notes) {
          reportSections.push(`Technique: ${closure.technique_notes}`);
        }
      }
    } else {
      reportSections.push(`Type: ${c.closure_type || 'Not yet documented'}`);
    }
    reportSections.push('');

    // CPT Codes
    reportSections.push('CPT CODES');
    reportSections.push('-'.repeat(30));
    const allCptCodes: string[] = [
      ...((c.mohs_cpt_codes as string[]) || []),
      ...((c.repair_cpt_codes as string[]) || [])
    ];

    // Calculate appropriate Mohs codes based on stages and location
    const mohsCptCodes = await this.calculateMohsCptCodes(
      c.tumor_location as string,
      stages.length,
      stages.reduce((sum, s) => sum + ((s.block_count as number) || 0), 0)
    );
    allCptCodes.push(...mohsCptCodes);

    for (const code of [...new Set(allCptCodes)]) {
      const codeInfo = await pool.query(
        'SELECT description FROM mohs_cpt_reference WHERE code = $1',
        [code]
      );
      const desc = codeInfo.rows[0]?.description || 'Unknown';
      reportSections.push(`  ${code}: ${desc}`);
    }
    reportSections.push('');

    // Post-operative instructions
    if (c.post_op_notes) {
      reportSections.push('POST-OPERATIVE NOTES');
      reportSections.push('-'.repeat(30));
      reportSections.push(c.post_op_notes as string);
      reportSections.push('');
    }

    // Complications
    if (c.complications) {
      reportSections.push('COMPLICATIONS');
      reportSections.push('-'.repeat(30));
      reportSections.push(c.complications as string);
      reportSections.push('');
    }

    // Signature line
    reportSections.push('');
    reportSections.push('_'.repeat(40));
    reportSections.push(`${c.surgeon_name}, MD`);
    reportSections.push(`Date: ${new Date().toLocaleDateString()}`);

    const report = reportSections.join('\n');

    return {
      report,
      caseData: caseData,
      cptCodes: [...new Set(allCptCodes)]
    };
  }

  /**
   * Calculate appropriate Mohs CPT codes based on case details
   */
  static async calculateMohsCptCodes(
    tumorLocation: string,
    stageCount: number,
    totalBlocks: number
  ): Promise<string[]> {
    const codes: string[] = [];
    const location = tumorLocation.toLowerCase();

    // Determine body area category
    const isHeadNeck = location.includes('head') ||
                       location.includes('face') ||
                       location.includes('neck') ||
                       location.includes('scalp') ||
                       location.includes('nose') ||
                       location.includes('ear') ||
                       location.includes('eyelid') ||
                       location.includes('lip') ||
                       location.includes('forehead') ||
                       location.includes('cheek') ||
                       location.includes('chin') ||
                       location.includes('temple') ||
                       location.includes('hand') ||
                       location.includes('foot') ||
                       location.includes('feet') ||
                       location.includes('genitalia');

    if (stageCount >= 1) {
      // First stage
      codes.push(isHeadNeck ? '17311' : '17314');

      // Additional stages
      const additionalStages = stageCount - 1;
      for (let i = 0; i < additionalStages; i++) {
        codes.push(isHeadNeck ? '17312' : '17315');
      }

      // Additional blocks beyond 5 per stage
      const blocksPerStage = 5;
      const expectedBlocks = stageCount * blocksPerStage;
      const extraBlocks = Math.max(0, totalBlocks - expectedBlocks);
      const extraBlockUnits = Math.ceil(extraBlocks / 5); // 17313 is per additional 5 blocks
      for (let i = 0; i < extraBlockUnits; i++) {
        codes.push('17313');
      }
    }

    return codes;
  }

  /**
   * Get Mohs statistics for a surgeon over a date range
   */
  static async getMohsStats(
    tenantId: string,
    surgeonId?: string,
    dateRange?: DateRange
  ): Promise<MohsStats> {
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    let surgeonFilter = '';
    if (surgeonId) {
      surgeonFilter = `AND mc.surgeon_id = $${paramIndex}`;
      params.push(surgeonId);
      paramIndex++;
    }

    let dateFilter = '';
    if (dateRange) {
      dateFilter = `AND mc.case_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateRange.startDate, dateRange.endDate);
    }

    const query = `
      WITH case_stats AS (
        SELECT
          mc.id,
          mc.tumor_type,
          mc.tumor_location,
          mc.closure_type,
          mc.total_stages,
          mc.start_time,
          mc.end_time,
          (
            SELECT margin_status
            FROM mohs_stages ms
            WHERE ms.case_id = mc.id AND ms.stage_number = 1
          ) as first_stage_margin
        FROM mohs_cases mc
        WHERE mc.tenant_id = $1
          AND mc.deleted_at IS NULL
          AND mc.status IN ('completed', 'post_op')
          ${surgeonFilter}
          ${dateFilter}
      )
      SELECT
        COUNT(*) as total_cases,
        COALESCE(AVG(total_stages), 0) as avg_stages_per_case,
        COALESCE(
          COUNT(*) FILTER (WHERE first_stage_margin = 'negative')::DECIMAL /
          NULLIF(COUNT(*), 0) * 100,
          0
        ) as clearance_rate_first_stage,
        100 as clearance_rate_overall,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
          FILTER (WHERE end_time IS NOT NULL AND start_time IS NOT NULL),
          0
        ) as avg_turnaround_minutes,
        COALESCE(
          json_object_agg(tumor_type, type_count) FILTER (WHERE tumor_type IS NOT NULL),
          '{}'::json
        ) as cases_by_tumor_type,
        COALESCE(
          json_object_agg(tumor_location, location_count) FILTER (WHERE tumor_location IS NOT NULL),
          '{}'::json
        ) as cases_by_location,
        COALESCE(
          json_object_agg(closure_type, closure_count) FILTER (WHERE closure_type IS NOT NULL),
          '{}'::json
        ) as closure_type_distribution
      FROM case_stats,
      LATERAL (
        SELECT tumor_type, COUNT(*) as type_count
        FROM case_stats
        GROUP BY tumor_type
      ) tumor_types,
      LATERAL (
        SELECT tumor_location, COUNT(*) as location_count
        FROM case_stats
        GROUP BY tumor_location
      ) locations,
      LATERAL (
        SELECT closure_type, COUNT(*) as closure_count
        FROM case_stats
        GROUP BY closure_type
      ) closures
    `;

    // Simpler query that works
    const simpleQuery = `
      SELECT
        COUNT(*)::INTEGER as total_cases,
        COALESCE(AVG(mc.total_stages), 0)::DECIMAL as avg_stages_per_case,
        COALESCE(
          (SELECT COUNT(*)::DECIMAL FROM mohs_stages ms
           JOIN mohs_cases mc2 ON ms.case_id = mc2.id
           WHERE mc2.tenant_id = $1
             AND ms.stage_number = 1
             AND ms.margin_status = 'negative'
             ${surgeonFilter.replace(/mc\./g, 'mc2.')}
             ${dateFilter.replace(/mc\./g, 'mc2.')}) /
          NULLIF(COUNT(*), 0) * 100,
          0
        )::DECIMAL as clearance_rate_first_stage,
        100::DECIMAL as clearance_rate_overall,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (mc.end_time - mc.start_time)) / 60)
          FILTER (WHERE mc.end_time IS NOT NULL AND mc.start_time IS NOT NULL),
          0
        )::DECIMAL as avg_turnaround_minutes
      FROM mohs_cases mc
      WHERE mc.tenant_id = $1
        AND mc.deleted_at IS NULL
        AND mc.status IN ('completed', 'post_op')
        ${surgeonFilter}
        ${dateFilter}
    `;

    const result = await pool.query(simpleQuery, params);
    const stats = result.rows[0] || {};

    // Get tumor type distribution
    const tumorTypeQuery = `
      SELECT tumor_type, COUNT(*)::INTEGER as count
      FROM mohs_cases mc
      WHERE mc.tenant_id = $1
        AND mc.deleted_at IS NULL
        ${surgeonFilter}
        ${dateFilter}
      GROUP BY tumor_type
    `;
    const tumorTypes = await pool.query(tumorTypeQuery, params);
    const casesByTumorType: Record<string, number> = {};
    for (const row of tumorTypes.rows) {
      if (row.tumor_type) {
        casesByTumorType[row.tumor_type] = row.count;
      }
    }

    // Get location distribution
    const locationQuery = `
      SELECT tumor_location, COUNT(*)::INTEGER as count
      FROM mohs_cases mc
      WHERE mc.tenant_id = $1
        AND mc.deleted_at IS NULL
        ${surgeonFilter}
        ${dateFilter}
      GROUP BY tumor_location
    `;
    const locations = await pool.query(locationQuery, params);
    const casesByLocation: Record<string, number> = {};
    for (const row of locations.rows) {
      if (row.tumor_location) {
        casesByLocation[row.tumor_location] = row.count;
      }
    }

    // Get closure type distribution
    const closureQuery = `
      SELECT closure_type, COUNT(*)::INTEGER as count
      FROM mohs_cases mc
      WHERE mc.tenant_id = $1
        AND mc.deleted_at IS NULL
        AND mc.closure_type IS NOT NULL
        ${surgeonFilter}
        ${dateFilter}
      GROUP BY closure_type
    `;
    const closureTypes = await pool.query(closureQuery, params);
    const closureTypeDistribution: Record<string, number> = {};
    for (const row of closureTypes.rows) {
      if (row.closure_type) {
        closureTypeDistribution[row.closure_type] = row.count;
      }
    }

    return {
      total_cases: parseInt(stats.total_cases) || 0,
      avg_stages_per_case: parseFloat(stats.avg_stages_per_case) || 0,
      clearance_rate_first_stage: parseFloat(stats.clearance_rate_first_stage) || 0,
      clearance_rate_overall: 100,
      avg_turnaround_minutes: parseFloat(stats.avg_turnaround_minutes) || 0,
      cases_by_tumor_type: casesByTumorType,
      cases_by_location: casesByLocation,
      closure_type_distribution: closureTypeDistribution
    };
  }

  /**
   * Update case status
   */
  static async updateCaseStatus(
    caseId: string,
    tenantId: string,
    status: string,
    userId: string
  ): Promise<MohsCase> {
    const validStatuses = [
      'scheduled', 'pre_op', 'in_progress', 'reading',
      'closure', 'post_op', 'completed', 'cancelled'
    ];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const query = `
      UPDATE mohs_cases
      SET status = $1,
          updated_by = $2,
          updated_at = NOW(),
          start_time = CASE
            WHEN $1 = 'in_progress' AND start_time IS NULL THEN NOW()
            ELSE start_time
          END,
          end_time = CASE
            WHEN $1 = 'completed' THEN NOW()
            ELSE end_time
          END
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;

    const result = await pool.query(query, [status, userId, caseId, tenantId]);
    if (result.rows.length === 0) {
      throw new Error('Mohs case not found');
    }

    return result.rows[0] as MohsCase;
  }

  /**
   * Save a Mohs map
   */
  static async saveMap(
    caseId: string,
    stageId: string | null,
    tenantId: string,
    mapType: string,
    mapSvg: string,
    annotations: unknown[],
    orientation12Oclock: string | null,
    userId: string
  ): Promise<unknown> {
    const query = `
      INSERT INTO mohs_maps (
        case_id,
        stage_id,
        tenant_id,
        map_type,
        map_svg,
        annotations,
        orientation_12_oclock,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await pool.query(query, [
      caseId,
      stageId,
      tenantId,
      mapType,
      mapSvg,
      JSON.stringify(annotations),
      orientation12Oclock,
      userId
    ]);

    return result.rows[0];
  }

  /**
   * List cases for a tenant with optional filters
   */
  static async listCases(
    tenantId: string,
    filters?: {
      surgeonId?: string;
      patientId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      tumorType?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ cases: MohsCase[]; total: number }> {
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    let whereClause = 'WHERE mc.tenant_id = $1 AND mc.deleted_at IS NULL';

    if (filters?.surgeonId) {
      whereClause += ` AND mc.surgeon_id = $${paramIndex}`;
      params.push(filters.surgeonId);
      paramIndex++;
    }

    if (filters?.patientId) {
      whereClause += ` AND mc.patient_id = $${paramIndex}`;
      params.push(filters.patientId);
      paramIndex++;
    }

    if (filters?.status) {
      whereClause += ` AND mc.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.startDate) {
      whereClause += ` AND mc.case_date >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      whereClause += ` AND mc.case_date <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.tumorType) {
      whereClause += ` AND mc.tumor_type = $${paramIndex}`;
      params.push(filters.tumorType);
      paramIndex++;
    }

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM mohs_cases mc
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total) || 0;

    // Main query with pagination
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT
        mc.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        s.first_name || ' ' || s.last_name as surgeon_name
      FROM mohs_cases mc
      JOIN patients p ON mc.patient_id = p.id
      JOIN providers s ON mc.surgeon_id = s.id
      ${whereClause}
      ORDER BY mc.case_date DESC, mc.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(query, params);

    return {
      cases: result.rows as MohsCase[],
      total
    };
  }
}
