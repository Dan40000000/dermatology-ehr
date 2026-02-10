/**
 * Procedure Template Service
 * Business logic for dermatology procedure documentation
 * Supports cryotherapy, biopsies, excisions, and I&D procedures
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// ============================================
// TYPES
// ============================================

export type ProcedureType =
  | 'cryotherapy'
  | 'shave_biopsy'
  | 'punch_biopsy'
  | 'excision'
  | 'incision_drainage';

export interface ProcedureTemplate {
  id: string;
  tenant_id: string;
  name: string;
  procedure_type: ProcedureType;
  cpt_codes: string[];
  template_sections: TemplateSections;
  default_values: Record<string, unknown>;
  consent_template_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateSections {
  sections: {
    name: string;
    label: string;
    fields: string[];
  }[];
}

export interface ProcedureDocumentationInput {
  encounter_id: string;
  patient_id: string;
  template_id?: string;
  procedure_type: ProcedureType;
  procedure_name?: string;
  body_location: string;
  body_location_code?: string;
  laterality?: 'left' | 'right' | 'bilateral' | 'midline';
  lesion_description?: string;
  lesion_size_mm?: number;
  lesion_type?: string;
  size_mm?: number;
  depth?: string;
  dimensions_length_mm?: number;
  dimensions_width_mm?: number;
  dimensions_depth_mm?: number;
  anesthesia_type?: string;
  anesthesia_agent?: string;
  anesthesia_concentration?: string;
  anesthesia_with_epinephrine?: boolean;
  anesthesia_volume_ml?: number;
  documentation: Record<string, unknown>;
  hemostasis_method?: string;
  hemostasis_details?: string;
  closure_type?: string;
  suture_type?: string;
  suture_size?: string;
  suture_count?: number;
  complications?: string[];
  complication_details?: string;
  specimen_sent?: boolean;
  specimen_container?: string;
  specimen_label?: string;
  margins_taken_mm?: number;
  margins_peripheral_mm?: number;
  margins_deep_mm?: number;
  patient_instructions_given?: boolean;
  wound_care_handout_provided?: boolean;
  follow_up_instructions?: string;
  performing_provider_id: string;
  assistant_id?: string;
  cpt_code?: string;
  cpt_modifier?: string;
  units?: number;
  procedure_start_time?: Date;
  procedure_end_time?: Date;
}

export interface ProcedureDocumentation extends ProcedureDocumentationInput {
  id: string;
  tenant_id: string;
  pathology_order_id: string | null;
  procedure_note: string | null;
  note_generated_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  deleted_at: Date | null;
}

export interface ProcedureSupply {
  id: string;
  procedure_doc_id: string;
  supply_name: string;
  quantity: number;
  lot_number: string | null;
  expiration_date: Date | null;
  inventory_item_id: string | null;
  created_at: Date;
}

// ============================================
// SERVICE CLASS
// ============================================

export class ProcedureTemplateService {
  /**
   * Get template by procedure type
   */
  static async getTemplate(
    tenantId: string,
    procedureType: ProcedureType
  ): Promise<ProcedureTemplate | null> {
    const query = `
      SELECT *
      FROM procedure_templates
      WHERE tenant_id = $1
        AND procedure_type = $2
        AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1
    `;

    const result = await pool.query(query, [tenantId, procedureType]);
    return result.rows[0] || null;
  }

  /**
   * Get all templates for a tenant
   */
  static async getAllTemplates(
    tenantId: string,
    activeOnly: boolean = true
  ): Promise<ProcedureTemplate[]> {
    let query = `
      SELECT *
      FROM procedure_templates
      WHERE tenant_id = $1
    `;

    if (activeOnly) {
      query += ` AND is_active = true`;
    }

    query += ` ORDER BY procedure_type, name`;

    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(
    tenantId: string,
    templateId: string
  ): Promise<ProcedureTemplate | null> {
    const query = `
      SELECT *
      FROM procedure_templates
      WHERE tenant_id = $1
        AND id = $2
    `;

    const result = await pool.query(query, [tenantId, templateId]);
    return result.rows[0] || null;
  }

  /**
   * Document a procedure
   */
  static async documentProcedure(
    tenantId: string,
    userId: string,
    data: ProcedureDocumentationInput
  ): Promise<ProcedureDocumentation> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO procedure_documentation (
          tenant_id,
          encounter_id,
          patient_id,
          template_id,
          procedure_type,
          procedure_name,
          body_location,
          body_location_code,
          laterality,
          lesion_description,
          lesion_size_mm,
          lesion_type,
          size_mm,
          depth,
          dimensions_length_mm,
          dimensions_width_mm,
          dimensions_depth_mm,
          anesthesia_type,
          anesthesia_agent,
          anesthesia_concentration,
          anesthesia_with_epinephrine,
          anesthesia_volume_ml,
          documentation,
          hemostasis_method,
          hemostasis_details,
          closure_type,
          suture_type,
          suture_size,
          suture_count,
          complications,
          complication_details,
          specimen_sent,
          specimen_container,
          specimen_label,
          margins_taken_mm,
          margins_peripheral_mm,
          margins_deep_mm,
          patient_instructions_given,
          wound_care_handout_provided,
          follow_up_instructions,
          performing_provider_id,
          assistant_id,
          cpt_code,
          cpt_modifier,
          units,
          procedure_start_time,
          procedure_end_time,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
          $41, $42, $43, $44, $45, $46, $47, $48
        )
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        tenantId,
        data.encounter_id,
        data.patient_id,
        data.template_id || null,
        data.procedure_type,
        data.procedure_name || null,
        data.body_location,
        data.body_location_code || null,
        data.laterality || null,
        data.lesion_description || null,
        data.lesion_size_mm || null,
        data.lesion_type || null,
        data.size_mm || null,
        data.depth || null,
        data.dimensions_length_mm || null,
        data.dimensions_width_mm || null,
        data.dimensions_depth_mm || null,
        data.anesthesia_type || null,
        data.anesthesia_agent || null,
        data.anesthesia_concentration || null,
        data.anesthesia_with_epinephrine ?? null,
        data.anesthesia_volume_ml || null,
        JSON.stringify(data.documentation || {}),
        data.hemostasis_method || null,
        data.hemostasis_details || null,
        data.closure_type || null,
        data.suture_type || null,
        data.suture_size || null,
        data.suture_count || null,
        data.complications || null,
        data.complication_details || null,
        data.specimen_sent ?? false,
        data.specimen_container || null,
        data.specimen_label || null,
        data.margins_taken_mm || null,
        data.margins_peripheral_mm || null,
        data.margins_deep_mm || null,
        data.patient_instructions_given ?? true,
        data.wound_care_handout_provided ?? false,
        data.follow_up_instructions || null,
        data.performing_provider_id,
        data.assistant_id || null,
        data.cpt_code || null,
        data.cpt_modifier || null,
        data.units || 1,
        data.procedure_start_time || null,
        data.procedure_end_time || null,
        userId
      ]);

      await client.query('COMMIT');

      logger.info('Procedure documented', {
        procedureId: result.rows[0].id,
        encounterId: data.encounter_id,
        procedureType: data.procedure_type,
        userId
      });

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get procedure documentation by ID
   */
  static async getProcedureById(
    tenantId: string,
    procedureId: string
  ): Promise<ProcedureDocumentation | null> {
    const query = `
      SELECT
        pd.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as provider_name,
        pt.name as template_name
      FROM procedure_documentation pd
      JOIN patients p ON pd.patient_id = p.id
      JOIN providers pr ON pd.performing_provider_id = pr.id
      LEFT JOIN procedure_templates pt ON pd.template_id = pt.id
      WHERE pd.id = $1
        AND pd.tenant_id = $2
        AND pd.deleted_at IS NULL
    `;

    const result = await pool.query(query, [procedureId, tenantId]);
    return result.rows[0] || null;
  }

  /**
   * Get procedures for an encounter
   */
  static async getProceduresForEncounter(
    tenantId: string,
    encounterId: string
  ): Promise<ProcedureDocumentation[]> {
    const query = `
      SELECT
        pd.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as provider_name,
        pt.name as template_name,
        (
          SELECT json_agg(json_build_object(
            'id', ps.id,
            'supply_name', ps.supply_name,
            'quantity', ps.quantity,
            'lot_number', ps.lot_number
          ))
          FROM procedure_supplies ps
          WHERE ps.procedure_doc_id = pd.id
        ) as supplies
      FROM procedure_documentation pd
      JOIN patients p ON pd.patient_id = p.id
      JOIN providers pr ON pd.performing_provider_id = pr.id
      LEFT JOIN procedure_templates pt ON pd.template_id = pt.id
      WHERE pd.encounter_id = $1
        AND pd.tenant_id = $2
        AND pd.deleted_at IS NULL
      ORDER BY pd.created_at DESC
    `;

    const result = await pool.query(query, [encounterId, tenantId]);
    return result.rows;
  }

  /**
   * Generate formatted procedure note text
   */
  static async generateProcedureNote(
    tenantId: string,
    procedureDocId: string
  ): Promise<string> {
    const procedure = await this.getProcedureById(tenantId, procedureDocId);

    if (!procedure) {
      throw new Error('Procedure documentation not found');
    }

    let note = '';
    const doc = procedure.documentation as Record<string, unknown>;

    // Header
    note += `PROCEDURE NOTE\n`;
    note += `Date: ${new Date(procedure.created_at).toLocaleDateString()}\n`;
    note += `Procedure: ${this.getProcedureDisplayName(procedure.procedure_type)}\n\n`;

    // Generate note based on procedure type
    switch (procedure.procedure_type) {
      case 'cryotherapy':
        note += this.generateCryotherapyNote(procedure, doc);
        break;
      case 'shave_biopsy':
        note += this.generateShaveBiopsyNote(procedure, doc);
        break;
      case 'punch_biopsy':
        note += this.generatePunchBiopsyNote(procedure, doc);
        break;
      case 'excision':
        note += this.generateExcisionNote(procedure, doc);
        break;
      case 'incision_drainage':
        note += this.generateIDNote(procedure, doc);
        break;
    }

    // Add complications if any
    if (procedure.complications && procedure.complications.length > 0) {
      note += `\nCOMPLICATIONS:\n`;
      note += procedure.complications.join(', ');
      if (procedure.complication_details) {
        note += `\nDetails: ${procedure.complication_details}`;
      }
      note += '\n';
    } else {
      note += `\nCOMPLICATIONS: None\n`;
    }

    // Patient instructions
    if (procedure.patient_instructions_given) {
      note += `\nPATIENT INSTRUCTIONS: Provided. `;
      if (procedure.wound_care_handout_provided) {
        note += `Wound care handout given. `;
      }
      if (procedure.follow_up_instructions) {
        note += procedure.follow_up_instructions;
      }
    }

    // Update the procedure with the generated note
    await pool.query(
      `UPDATE procedure_documentation
       SET procedure_note = $1, note_generated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [note, procedureDocId, tenantId]
    );

    return note;
  }

  /**
   * Link procedure documentation to pathology order
   */
  static async linkToPathology(
    tenantId: string,
    procedureDocId: string,
    pathologyOrderId: string
  ): Promise<ProcedureDocumentation> {
    const query = `
      UPDATE procedure_documentation
      SET pathology_order_id = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [pathologyOrderId, procedureDocId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Procedure documentation not found');
    }

    logger.info('Procedure linked to pathology', {
      procedureId: procedureDocId,
      pathologyOrderId
    });

    return result.rows[0];
  }

  /**
   * Add supplies to procedure
   */
  static async addSupplies(
    procedureDocId: string,
    supplies: Array<{
      supply_name: string;
      quantity: number;
      lot_number?: string;
      expiration_date?: Date;
      inventory_item_id?: string;
    }>
  ): Promise<ProcedureSupply[]> {
    if (supplies.length === 0) return [];

    const insertQuery = `
      INSERT INTO procedure_supplies (
        procedure_doc_id,
        supply_name,
        quantity,
        lot_number,
        expiration_date,
        inventory_item_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const results: ProcedureSupply[] = [];

    for (const supply of supplies) {
      const result = await pool.query(insertQuery, [
        procedureDocId,
        supply.supply_name,
        supply.quantity,
        supply.lot_number || null,
        supply.expiration_date || null,
        supply.inventory_item_id || null
      ]);
      results.push(result.rows[0]);
    }

    return results;
  }

  /**
   * Update procedure documentation
   */
  static async updateProcedure(
    tenantId: string,
    procedureId: string,
    updates: Partial<ProcedureDocumentationInput>
  ): Promise<ProcedureDocumentation> {
    const allowedFields = [
      'procedure_name', 'body_location', 'body_location_code', 'laterality',
      'lesion_description', 'lesion_size_mm', 'lesion_type', 'size_mm', 'depth',
      'dimensions_length_mm', 'dimensions_width_mm', 'dimensions_depth_mm',
      'anesthesia_type', 'anesthesia_agent', 'anesthesia_concentration',
      'anesthesia_with_epinephrine', 'anesthesia_volume_ml', 'documentation',
      'hemostasis_method', 'hemostasis_details', 'closure_type', 'suture_type',
      'suture_size', 'suture_count', 'complications', 'complication_details',
      'specimen_sent', 'specimen_container', 'specimen_label', 'margins_taken_mm',
      'margins_peripheral_mm', 'margins_deep_mm', 'patient_instructions_given',
      'wound_care_handout_provided', 'follow_up_instructions', 'cpt_code',
      'cpt_modifier', 'units', 'procedure_start_time', 'procedure_end_time'
    ];

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(key === 'documentation' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(procedureId, tenantId);

    const query = `
      UPDATE procedure_documentation
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Procedure documentation not found');
    }

    return result.rows[0];
  }

  /**
   * Delete (soft) procedure documentation
   */
  static async deleteProcedure(
    tenantId: string,
    procedureId: string
  ): Promise<void> {
    const query = `
      UPDATE procedure_documentation
      SET deleted_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `;

    await pool.query(query, [procedureId, tenantId]);
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private static getProcedureDisplayName(type: ProcedureType): string {
    const names: Record<ProcedureType, string> = {
      cryotherapy: 'Cryotherapy',
      shave_biopsy: 'Shave Biopsy',
      punch_biopsy: 'Punch Biopsy',
      excision: 'Excision',
      incision_drainage: 'Incision and Drainage'
    };
    return names[type] || type;
  }

  private static generateCryotherapyNote(
    procedure: ProcedureDocumentation,
    doc: Record<string, unknown>
  ): string {
    let note = '';
    note += `INDICATION: ${procedure.lesion_type || 'Skin lesion'}\n`;
    note += `LOCATION: ${procedure.body_location}`;
    if (procedure.laterality) {
      note += ` (${procedure.laterality})`;
    }
    note += '\n';

    if (procedure.lesion_size_mm) {
      note += `LESION SIZE: ${procedure.lesion_size_mm} mm\n`;
    }

    note += `\nPROCEDURE:\n`;
    note += `Liquid nitrogen cryotherapy was performed to the lesion. `;

    const freezeTime = doc.freeze_time_seconds as number | undefined;
    const cycles = doc.number_of_cycles as number | undefined;
    const thawTime = doc.thaw_time_seconds as number | undefined;

    if (freezeTime) {
      note += `Freeze time: ${freezeTime} seconds. `;
    }
    if (cycles) {
      note += `Number of freeze-thaw cycles: ${cycles}. `;
    }
    if (thawTime) {
      note += `Thaw time: ${thawTime} seconds. `;
    }
    note += '\n';

    return note;
  }

  private static generateShaveBiopsyNote(
    procedure: ProcedureDocumentation,
    doc: Record<string, unknown>
  ): string {
    let note = '';
    note += `INDICATION: ${procedure.lesion_description || 'Suspicious skin lesion'}\n`;
    note += `LOCATION: ${procedure.body_location}`;
    if (procedure.laterality) {
      note += ` (${procedure.laterality})`;
    }
    note += '\n';

    if (procedure.lesion_size_mm) {
      note += `LESION SIZE: ${procedure.lesion_size_mm} mm\n`;
    }

    // ABCDE Assessment for pigmented lesions
    const abcde = doc.abcde_assessment as Record<string, unknown> | undefined;
    if (abcde) {
      note += `\nABCDE ASSESSMENT:\n`;
      if (abcde.asymmetry !== undefined) note += `  Asymmetry: ${abcde.asymmetry}\n`;
      if (abcde.border !== undefined) note += `  Border: ${abcde.border}\n`;
      if (abcde.color !== undefined) note += `  Color: ${abcde.color}\n`;
      if (abcde.diameter !== undefined) note += `  Diameter: ${abcde.diameter}\n`;
      if (abcde.evolution !== undefined) note += `  Evolution: ${abcde.evolution}\n`;
    }

    note += `\nANESTHESIA:\n`;
    if (procedure.anesthesia_type === 'local') {
      note += `Local anesthesia with ${procedure.anesthesia_agent || 'lidocaine'} ${procedure.anesthesia_concentration || '1%'}`;
      if (procedure.anesthesia_with_epinephrine) {
        note += ' with epinephrine';
      }
      if (procedure.anesthesia_volume_ml) {
        note += ` (${procedure.anesthesia_volume_ml} mL)`;
      }
      note += ' was injected.\n';
    }

    note += `\nPROCEDURE:\n`;
    note += `A shave biopsy was performed using a #15 blade. `;
    if (procedure.depth) {
      note += `Depth: ${procedure.depth}. `;
    }
    note += '\n';

    note += `\nHEMOSTASIS:\n`;
    note += `Hemostasis achieved with ${procedure.hemostasis_method || 'aluminum chloride'}. `;
    if (procedure.hemostasis_details) {
      note += procedure.hemostasis_details;
    }
    note += '\n';

    if (procedure.specimen_sent) {
      note += `\nSPECIMEN:\n`;
      note += `Specimen sent to pathology in formalin for histopathologic examination.\n`;
    }

    return note;
  }

  private static generatePunchBiopsyNote(
    procedure: ProcedureDocumentation,
    doc: Record<string, unknown>
  ): string {
    let note = '';
    note += `INDICATION: ${procedure.lesion_description || 'Skin lesion for biopsy'}\n`;
    note += `LOCATION: ${procedure.body_location}`;
    if (procedure.laterality) {
      note += ` (${procedure.laterality})`;
    }
    note += '\n';

    note += `\nANESTHESIA:\n`;
    if (procedure.anesthesia_type === 'local') {
      note += `Local anesthesia with ${procedure.anesthesia_agent || 'lidocaine'} ${procedure.anesthesia_concentration || '1%'}`;
      if (procedure.anesthesia_with_epinephrine) {
        note += ' with epinephrine';
      }
      if (procedure.anesthesia_volume_ml) {
        note += ` (${procedure.anesthesia_volume_ml} mL)`;
      }
      note += ' was injected.\n';
    }

    const punchSize = doc.punch_size_mm as number | undefined;

    note += `\nPROCEDURE:\n`;
    note += `A ${punchSize || procedure.size_mm || 4} mm punch biopsy was performed. `;
    if (procedure.depth) {
      note += `Depth: ${procedure.depth}. `;
    }
    note += '\n';

    note += `\nCLOSURE:\n`;
    if (procedure.closure_type === 'none') {
      note += `Wound left to heal by secondary intention.\n`;
    } else if (procedure.closure_type === 'steri_strips') {
      note += `Wound approximated with steri-strips.\n`;
    } else {
      note += `Wound closed with ${procedure.suture_count || 1} `;
      note += `${procedure.suture_size || '4-0'} ${procedure.suture_type || 'nylon'} suture(s). `;
      if (procedure.closure_type) {
        note += `Closure type: ${procedure.closure_type}.\n`;
      }
    }

    if (procedure.specimen_sent) {
      note += `\nSPECIMEN:\n`;
      note += `Specimen sent to pathology in formalin for histopathologic examination.\n`;
    }

    return note;
  }

  private static generateExcisionNote(
    procedure: ProcedureDocumentation,
    doc: Record<string, unknown>
  ): string {
    let note = '';

    const preopDiagnosis = doc.preop_diagnosis as string | undefined;
    note += `PREOPERATIVE DIAGNOSIS: ${preopDiagnosis || procedure.lesion_description || 'Skin lesion'}\n`;
    note += `LOCATION: ${procedure.body_location}`;
    if (procedure.laterality) {
      note += ` (${procedure.laterality})`;
    }
    note += '\n';

    if (procedure.lesion_size_mm) {
      note += `LESION SIZE: ${procedure.lesion_size_mm} mm\n`;
    }

    note += `\nANESTHESIA:\n`;
    if (procedure.anesthesia_type === 'local') {
      note += `Local anesthesia with ${procedure.anesthesia_agent || 'lidocaine'} ${procedure.anesthesia_concentration || '1%'}`;
      if (procedure.anesthesia_with_epinephrine) {
        note += ' with epinephrine';
      }
      if (procedure.anesthesia_volume_ml) {
        note += ` (${procedure.anesthesia_volume_ml} mL)`;
      }
      note += ' was injected.\n';
    }

    note += `\nPROCEDURE:\n`;
    note += `Elliptical excision was performed. `;

    if (procedure.margins_taken_mm) {
      note += `Margins: ${procedure.margins_taken_mm} mm. `;
    }

    if (procedure.dimensions_length_mm && procedure.dimensions_width_mm) {
      note += `Excision dimensions: ${procedure.dimensions_length_mm} x ${procedure.dimensions_width_mm}`;
      if (procedure.dimensions_depth_mm) {
        note += ` x ${procedure.dimensions_depth_mm}`;
      }
      note += ` mm. `;
    }
    note += '\n';

    note += `\nCLOSURE:\n`;
    note += `Wound closed with `;
    if (procedure.closure_type === 'simple') {
      note += `simple interrupted sutures. `;
    } else if (procedure.closure_type === 'intermediate') {
      note += `layered closure. `;
      const deepSutures = doc.deep_sutures as string | undefined;
      const superficialSutures = doc.superficial_sutures as string | undefined;
      if (deepSutures) {
        note += `Deep layer: ${deepSutures}. `;
      }
      if (superficialSutures) {
        note += `Superficial layer: ${superficialSutures}. `;
      }
    } else if (procedure.closure_type === 'complex') {
      note += `complex repair. `;
    }

    if (procedure.suture_type && procedure.suture_size) {
      note += `${procedure.suture_size} ${procedure.suture_type} sutures used. `;
    }
    note += '\n';

    if (procedure.specimen_sent) {
      note += `\nSPECIMEN:\n`;
      note += `Specimen sent to pathology in formalin for histopathologic examination`;
      const orientation = doc.specimen_orientation as string | undefined;
      if (orientation) {
        note += ` with ${orientation} orientation`;
      }
      note += `.\n`;
    }

    return note;
  }

  private static generateIDNote(
    procedure: ProcedureDocumentation,
    doc: Record<string, unknown>
  ): string {
    let note = '';
    note += `INDICATION: Abscess\n`;
    note += `LOCATION: ${procedure.body_location}`;
    if (procedure.laterality) {
      note += ` (${procedure.laterality})`;
    }
    note += '\n';

    if (procedure.size_mm) {
      note += `ABSCESS SIZE: ${procedure.size_mm} mm\n`;
    }

    const duration = doc.duration as string | undefined;
    const symptoms = doc.symptoms as string | undefined;
    if (duration) {
      note += `DURATION: ${duration}\n`;
    }
    if (symptoms) {
      note += `SYMPTOMS: ${symptoms}\n`;
    }

    note += `\nANESTHESIA:\n`;
    if (procedure.anesthesia_type === 'local') {
      note += `Local anesthesia with ${procedure.anesthesia_agent || 'lidocaine'} ${procedure.anesthesia_concentration || '1%'}`;
      if (procedure.anesthesia_with_epinephrine) {
        note += ' with epinephrine';
      } else {
        note += ' (without epinephrine)';
      }
      if (procedure.anesthesia_volume_ml) {
        note += ` (${procedure.anesthesia_volume_ml} mL)`;
      }
      note += ' was injected.\n';
    }

    note += `\nPROCEDURE:\n`;
    const incisionSize = doc.incision_size_mm as number | undefined;
    note += `Incision and drainage was performed. `;
    if (incisionSize) {
      note += `Incision size: ${incisionSize} mm. `;
    }
    note += '\n';

    note += `\nDRAINAGE:\n`;
    const drainageDescription = doc.drainage_description as string | undefined;
    const drainageAmount = doc.drainage_amount_ml as number | undefined;
    const cultureSent = doc.culture_sent as boolean | undefined;

    if (drainageDescription) {
      note += `${drainageDescription}. `;
    }
    if (drainageAmount) {
      note += `Approximately ${drainageAmount} mL drained. `;
    }
    if (cultureSent) {
      note += `Wound culture sent.\n`;
    }
    note += '\n';

    note += `WOUND CARE:\n`;
    const packingUsed = doc.packing_used as boolean | undefined;
    const packingType = doc.packing_type as string | undefined;
    const packingLength = doc.packing_length_cm as number | undefined;

    if (packingUsed) {
      note += `Wound packed with ${packingType || 'iodoform gauze'}`;
      if (packingLength) {
        note += ` (${packingLength} cm)`;
      }
      note += `. `;
    } else {
      note += `No packing placed. `;
    }
    note += '\n';

    return note;
  }
}
