/**
 * Dermatopathology Routes
 * Specialized routes for dermatopathology reports and culture results
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { DermPathParser } from '../services/dermPathParser';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/dermpath/reports
 * Get dermatopathology reports
 */
router.get('/reports', async (req: AuthedRequest, res: Response) => {
  try {
    const { patient_id, from_date, to_date } = req.query;

    let query = `
      SELECT
        dr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        lo.ordering_provider_id,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name
      FROM dermpath_reports dr
      JOIN patients p ON dr.patient_id = p.id
      JOIN lab_orders lo ON dr.lab_order_id = lo.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      WHERE dr.tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND dr.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND dr.report_date >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND dr.report_date <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    query += ` ORDER BY dr.report_date DESC LIMIT 100`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching dermpath reports', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

/**
 * GET /api/dermpath/reports/:id
 * Get a specific dermatopathology report
 */
router.get('/reports/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        dr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob as date_of_birth,
        lo.ordering_provider_id,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        (
          SELECT json_agg(
            json_build_object(
              'id', lrd.id,
              'document_type', lrd.document_type,
              'file_name', lrd.file_name,
              'file_path', lrd.file_path,
              'is_image', lrd.is_image,
              'magnification', lrd.magnification
            )
          )
          FROM lab_result_documents lrd
          WHERE lrd.dermpath_report_id = dr.id
        ) as documents
      FROM dermpath_reports dr
      JOIN patients p ON dr.patient_id = p.id
      JOIN lab_orders lo ON dr.lab_order_id = lo.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      WHERE dr.id = $1 AND dr.tenant_id = $2`,
      [id, req.user!.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching dermpath report', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

/**
 * POST /api/dermpath/reports
 * Create a dermatopathology report
 */
router.post('/reports', async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const {
      lab_order_id,
      patient_id,
      accession_number,
      report_date,
      pathologist_name,
      pathologist_npi,
      specimen_site,
      specimen_type,
      specimen_size,
      number_of_pieces,
      clinical_history,
      clinical_diagnosis,
      gross_description,
      microscopic_description,
      diagnosis,
      special_stains,
      immunohistochemistry,
      immunofluorescence_results,
      margins_status,
      margin_measurements,
      additional_findings,
      comment,
      status = 'final'
    } = req.body;

    await client.query('BEGIN');

    // Suggest SNOMED code if not provided
    const diagnosisCode = DermPathParser.suggestSNOMEDCode(diagnosis);

    const result = await client.query(
      `INSERT INTO dermpath_reports (
        tenant_id, lab_order_id, patient_id, accession_number, report_date,
        pathologist_name, pathologist_npi, specimen_site, specimen_type,
        specimen_size, number_of_pieces, clinical_history, clinical_diagnosis,
        gross_description, microscopic_description, diagnosis, diagnosis_code,
        special_stains, immunohistochemistry, immunofluorescence_results,
        margins_status, margin_measurements, additional_findings, comment, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [
        req.user!.tenantId,
        lab_order_id,
        patient_id,
        accession_number,
        report_date,
        pathologist_name,
        pathologist_npi,
        specimen_site,
        specimen_type,
        specimen_size,
        number_of_pieces,
        clinical_history,
        clinical_diagnosis,
        gross_description,
        microscopic_description,
        diagnosis,
        diagnosisCode,
        JSON.stringify(special_stains),
        JSON.stringify(immunohistochemistry),
        JSON.stringify(immunofluorescence_results),
        margins_status,
        margin_measurements,
        additional_findings,
        comment,
        status
      ]
    );

    // Update lab order status
    await client.query(
      `UPDATE lab_orders
      SET status = 'completed', results_received_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
      [lab_order_id]
    );

    await client.query('COMMIT');

    logger.info('Dermpath report created', { reportId: result.rows[0].id });

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error creating dermpath report', { error: error.message });
    res.status(500).json({ error: 'Failed to create report' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/dermpath/parse
 * Parse a dermpath report from free text
 */
router.post('/parse', async (req: AuthedRequest, res: Response) => {
  try {
    const { report_text } = req.body;

    if (!report_text) {
      return res.status(400).json({ error: 'report_text is required' });
    }

    const parsed = DermPathParser.parseReport(report_text);
    const snomedCode = DermPathParser.suggestSNOMEDCode(parsed.diagnosis);
    const summary = DermPathParser.generateSummary(parsed);
    const keyFindings = DermPathParser.extractKeyFindings(parsed.microscopicDescription);

    res.json({
      parsed,
      snomedCode,
      summary,
      keyFindings
    });
  } catch (error: any) {
    logger.error('Error parsing dermpath report', { error: error.message });
    res.status(500).json({ error: 'Failed to parse report' });
  }
});

/**
 * GET /api/dermpath/cultures
 * Get culture results
 */
router.get('/cultures', async (req: AuthedRequest, res: Response) => {
  try {
    const { patient_id, culture_type } = req.query;

    let query = `
      SELECT
        lcr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        lo.ordering_provider_id,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name
      FROM lab_culture_results lcr
      JOIN patients p ON lcr.patient_id = p.id
      JOIN lab_orders lo ON lcr.lab_order_id = lo.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      WHERE lcr.tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND lcr.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (culture_type) {
      query += ` AND lcr.culture_type = $${paramIndex}`;
      params.push(culture_type);
      paramIndex++;
    }

    query += ` ORDER BY lcr.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching culture results', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch culture results' });
  }
});

/**
 * POST /api/dermpath/cultures
 * Create a culture result
 */
router.post('/cultures', async (req: AuthedRequest, res: Response) => {
  try {
    const {
      lab_order_id,
      patient_id,
      culture_type,
      specimen_source,
      collection_date,
      organism_identified,
      organism_count,
      is_normal_flora,
      susceptibility_results,
      preliminary_result,
      preliminary_date,
      final_result,
      final_date,
      status,
      notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO lab_culture_results (
        tenant_id, lab_order_id, patient_id, culture_type, specimen_source,
        collection_date, organism_identified, organism_count, is_normal_flora,
        susceptibility_results, preliminary_result, preliminary_date,
        final_result, final_date, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        req.user!.tenantId,
        lab_order_id,
        patient_id,
        culture_type,
        specimen_source,
        collection_date,
        organism_identified,
        organism_count,
        is_normal_flora,
        JSON.stringify(susceptibility_results),
        preliminary_result,
        preliminary_date,
        final_result,
        final_date,
        status,
        notes
      ]
    );

    logger.info('Culture result created', { cultureId: result.rows[0].id });

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error creating culture result', { error: error.message });
    res.status(500).json({ error: 'Failed to create culture result' });
  }
});

/**
 * GET /api/dermpath/patch-tests
 * Get patch test results
 */
router.get('/patch-tests', async (req: AuthedRequest, res: Response) => {
  try {
    const { patient_id } = req.query;

    let query = `
      SELECT
        ptr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        (
          SELECT json_agg(
            json_build_object(
              'id', pta.id,
              'allergen_name', pta.allergen_name,
              'position', pta.position,
              'reading_48h', pta.reading_48h,
              'reading_72h', pta.reading_72h,
              'reading_96h', pta.reading_96h,
              'is_positive', pta.is_positive,
              'relevance', pta.relevance
            )
          )
          FROM patch_test_allergens pta
          WHERE pta.patch_test_id = ptr.id
        ) as allergens
      FROM patch_test_results ptr
      JOIN patients p ON ptr.patient_id = p.id
      JOIN providers pr ON ptr.ordering_provider_id = pr.id
      WHERE ptr.tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND ptr.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    query += ` ORDER BY ptr.application_date DESC LIMIT 50`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching patch test results', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch patch test results' });
  }
});

/**
 * POST /api/dermpath/patch-tests
 * Create a patch test
 */
router.post('/patch-tests', async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const {
      patient_id,
      encounter_id,
      ordering_provider_id,
      panel_name,
      application_date,
      allergens
    } = req.body;

    await client.query('BEGIN');

    // Create patch test
    const testResult = await client.query(
      `INSERT INTO patch_test_results (
        tenant_id, patient_id, encounter_id, ordering_provider_id,
        panel_name, application_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [req.user!.tenantId, patient_id, encounter_id, ordering_provider_id, panel_name, application_date, 'applied']
    );

    const testId = testResult.rows[0].id;

    // Add allergens
    if (allergens && allergens.length > 0) {
      for (const allergen of allergens) {
        await client.query(
          `INSERT INTO patch_test_allergens (
            patch_test_id, allergen_name, position, concentration
          ) VALUES ($1, $2, $3, $4)`,
          [testId, allergen.allergen_name, allergen.position, allergen.concentration]
        );
      }
    }

    await client.query('COMMIT');

    logger.info('Patch test created', { testId });

    // Fetch complete test
    const completeTest = await pool.query(
      `SELECT ptr.*,
        json_agg(json_build_object(
          'allergen_name', pta.allergen_name,
          'position', pta.position
        )) as allergens
      FROM patch_test_results ptr
      LEFT JOIN patch_test_allergens pta ON ptr.id = pta.patch_test_id
      WHERE ptr.id = $1
      GROUP BY ptr.id`,
      [testId]
    );

    res.status(201).json(completeTest.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error creating patch test', { error: error.message });
    res.status(500).json({ error: 'Failed to create patch test' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/dermpath/patch-tests/:id/reading
 * Record a patch test reading
 */
router.patch('/patch-tests/:id/reading', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reading_type, reading_date, reading_by, allergen_readings } = req.body;

    // Update patch test
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (reading_type === '48h') {
      updates.push(`reading_48h_date = $${paramIndex++}`);
      updates.push(`reading_48h_by = $${paramIndex++}`);
      values.push(reading_date, reading_by);
    } else if (reading_type === '72h') {
      updates.push(`reading_72h_date = $${paramIndex++}`);
      updates.push(`reading_72h_by = $${paramIndex++}`);
      values.push(reading_date, reading_by);
    } else if (reading_type === '96h') {
      updates.push(`reading_96h_date = $${paramIndex++}`);
      updates.push(`reading_96h_by = $${paramIndex++}`);
      values.push(reading_date, reading_by);
    }

    values.push(id, req.user!.tenantId);

    await pool.query(
      `UPDATE patch_test_results
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      values
    );

    // Update individual allergen readings
    if (allergen_readings && allergen_readings.length > 0) {
      for (const reading of allergen_readings) {
        const allergenUpdates: string[] = [];
        const allergenValues: any[] = [];
        let allergenIndex = 1;

        if (reading_type === '48h') {
          allergenUpdates.push(`reading_48h = $${allergenIndex++}`);
          allergenValues.push(reading.value);
        } else if (reading_type === '72h') {
          allergenUpdates.push(`reading_72h = $${allergenIndex++}`);
          allergenValues.push(reading.value);
        } else if (reading_type === '96h') {
          allergenUpdates.push(`reading_96h = $${allergenIndex++}`);
          allergenValues.push(reading.value);
        }

        // Determine if positive
        const isPositive = reading.value && ['+', '++', '+++'].includes(reading.value);
        allergenUpdates.push(`is_positive = $${allergenIndex++}`);
        allergenValues.push(isPositive);

        if (reading.relevance) {
          allergenUpdates.push(`relevance = $${allergenIndex++}`);
          allergenValues.push(reading.relevance);
        }

        allergenValues.push(reading.allergen_id);

        await pool.query(
          `UPDATE patch_test_allergens
          SET ${allergenUpdates.join(', ')}
          WHERE id = $${allergenIndex}`,
          allergenValues
        );
      }
    }

    logger.info('Patch test reading recorded', { testId: id, readingType: reading_type });

    res.json({ message: 'Reading recorded successfully' });
  } catch (error: any) {
    logger.error('Error recording patch test reading', { error: error.message });
    res.status(500).json({ error: 'Failed to record reading' });
  }
});

export const dermPathRouter = router;
