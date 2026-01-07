/**
 * Lab Results Routes
 * Manage laboratory results, trends, and critical value notifications
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';
import { HL7Service } from '../services/hl7Service';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/lab-results
 * Get lab results with filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { patient_id, lab_order_id, from_date, to_date, abnormal_only, critical_only } = req.query;

    let query = `
      SELECT
        lr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        lo.order_date,
        lo.ordering_provider_id,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name
      FROM lab_results lr
      JOIN patients p ON lr.patient_id = p.id
      JOIN lab_orders lo ON lr.lab_order_id = lo.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      WHERE lr.tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND lr.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (lab_order_id) {
      query += ` AND lr.lab_order_id = $${paramIndex}`;
      params.push(lab_order_id);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND lr.result_date >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND lr.result_date <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    if (abnormal_only === 'true') {
      query += ` AND lr.is_abnormal = true`;
    }

    if (critical_only === 'true') {
      query += ` AND lr.is_critical = true`;
    }

    query += ` ORDER BY lr.result_date DESC LIMIT 200`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching lab results', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab results' });
  }
});

/**
 * GET /api/lab-results/trends/:patient_id/:test_code
 * Get trend data for a specific test over time
 */
router.get('/trends/:patient_id/:test_code', async (req: Request, res: Response) => {
  try {
    const { patient_id, test_code } = req.params;
    const { months = 12 } = req.query;

    const result = await pool.query(
      `SELECT
        lr.id,
        lr.test_code,
        lr.test_name,
        lr.result_value,
        lr.result_value_numeric,
        lr.result_unit,
        lr.reference_range_low,
        lr.reference_range_high,
        lr.reference_range_text,
        lr.is_abnormal,
        lr.abnormal_flag,
        lr.result_date,
        lo.order_date
      FROM lab_results lr
      JOIN lab_orders lo ON lr.lab_order_id = lo.id
      WHERE lr.patient_id = $1
        AND lr.test_code = $2
        AND lr.tenant_id = $3
        AND lr.result_date >= NOW() - INTERVAL '${parseInt(months as string)} months'
        AND lr.result_status = 'final'
      ORDER BY lr.result_date ASC`,
      [patient_id, test_code, req.user!.tenantId]
    );

    // Calculate statistics
    const numericResults = result.rows
      .filter(r => r.result_value_numeric !== null)
      .map(r => parseFloat(r.result_value_numeric));

    let stats = null;
    if (numericResults.length > 0) {
      const sum = numericResults.reduce((a, b) => a + b, 0);
      const mean = sum / numericResults.length;
      const sortedValues = [...numericResults].sort((a, b) => a - b);
      const min = sortedValues[0];
      const max = sortedValues[sortedValues.length - 1];

      stats = {
        count: numericResults.length,
        mean: mean.toFixed(2),
        min,
        max,
        latest: numericResults[numericResults.length - 1]
      };
    }

    res.json({
      test_code,
      test_name: result.rows[0]?.test_name,
      unit: result.rows[0]?.result_unit,
      reference_range: {
        low: result.rows[0]?.reference_range_low,
        high: result.rows[0]?.reference_range_high,
        text: result.rows[0]?.reference_range_text
      },
      results: result.rows,
      statistics: stats
    });
  } catch (error: any) {
    logger.error('Error fetching lab result trends', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

/**
 * POST /api/lab-results/ingest
 * Ingest lab results from HL7 ORU message or manual entry
 */
router.post('/ingest', async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { hl7_message, manual_results } = req.body;

    await client.query('BEGIN');

    let parsedResults: any;

    if (hl7_message) {
      // Parse HL7 message
      parsedResults = HL7Service.parseLabResultMessage(hl7_message);
    } else if (manual_results) {
      // Manual entry
      parsedResults = manual_results;
    } else {
      return res.status(400).json({ error: 'Either hl7_message or manual_results required' });
    }

    // Process results
    const insertedResults: any[] = [];

    for (const testResult of parsedResults.results || []) {
      // Find the lab order
      const orderQuery = await client.query(
        `SELECT id, patient_id FROM lab_orders WHERE id = $1 AND tenant_id = $2`,
        [testResult.orderId || manual_results.lab_order_id, req.user!.tenantId]
      );

      if (orderQuery.rows.length === 0) {
        logger.warn('Lab order not found for result', { orderId: testResult.orderId });
        continue;
      }

      const order = orderQuery.rows[0];

      for (const observation of testResult.observations || [testResult]) {
        // Determine if result is abnormal
        const resultValueNumeric = parseFloat(observation.value);
        let isAbnormal = false;
        let abnormalFlag = null;

        if (!isNaN(resultValueNumeric)) {
          // Parse reference range if available
          const rangeMatch = observation.referenceRange?.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
          if (rangeMatch) {
            const low = parseFloat(rangeMatch[1]);
            const high = parseFloat(rangeMatch[2]);

            if (resultValueNumeric < low) {
              isAbnormal = true;
              abnormalFlag = 'L';
            } else if (resultValueNumeric > high) {
              isAbnormal = true;
              abnormalFlag = 'H';
            }
          }
        }

        // Check for critical values (this would be customized per test)
        const isCritical = observation.abnormalFlags?.includes('HH') || observation.abnormalFlags?.includes('LL');

        // Insert result
        const resultInsert = await client.query(
          `INSERT INTO lab_results (
            tenant_id, lab_order_id, patient_id, test_code, test_name,
            result_value, result_value_numeric, result_unit,
            reference_range_text, is_abnormal, abnormal_flag, is_critical,
            result_status, result_date, result_notes, hl7_message_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *`,
          [
            req.user!.tenantId,
            order.id,
            order.patient_id,
            observation.testCode,
            observation.testName,
            observation.value,
            isNaN(resultValueNumeric) ? null : resultValueNumeric,
            observation.units,
            observation.referenceRange,
            isAbnormal,
            abnormalFlag,
            isCritical,
            observation.resultStatus || 'final',
            observation.observationDateTime || new Date(),
            observation.notes,
            parsedResults.messageControlId
          ]
        );

        insertedResults.push(resultInsert.rows[0]);

        // Update lab order test status
        await client.query(
          `UPDATE lab_order_tests
          SET has_results = true, status = 'completed'
          WHERE lab_order_id = $1 AND test_code = $2`,
          [order.id, observation.testCode]
        );

        // Create critical value notification if needed
        if (isCritical) {
          await client.query(
            `INSERT INTO lab_critical_notifications (
              tenant_id, lab_result_id, lab_order_id, patient_id,
              test_name, result_value, critical_reason, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              req.user!.tenantId,
              resultInsert.rows[0].id,
              order.id,
              order.patient_id,
              observation.testName,
              observation.value,
              `Critical ${abnormalFlag === 'HH' ? 'high' : 'low'} value`,
              'pending'
            ]
          );
        }
      }
    }

    // Update lab order status
    if (manual_results?.lab_order_id) {
      await client.query(
        `UPDATE lab_orders
        SET status = 'completed', results_received_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
        [manual_results.lab_order_id]
      );
    }

    await client.query('COMMIT');

    logger.info('Lab results ingested', { count: insertedResults.length });

    res.status(201).json({
      message: 'Results ingested successfully',
      count: insertedResults.length,
      results: insertedResults
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error ingesting lab results', { error: error.message });
    res.status(500).json({ error: 'Failed to ingest lab results' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/lab-results/:id/acknowledge
 * Acknowledge review of lab result
 */
router.post('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    // Update lab order
    const result = await pool.query(
      `UPDATE lab_orders
      SET results_reviewed_at = NOW(),
          results_reviewed_by = $1,
          notes = COALESCE(notes || E'\n\n', '') || $2
      WHERE id = (SELECT lab_order_id FROM lab_results WHERE id = $3)
        AND tenant_id = $4
      RETURNING *`,
      [req.user!.id, comments || 'Results reviewed', id, req.user!.tenantId]
    );

    logger.info('Lab results acknowledged', { resultId: id, userId: req.user!.id });

    res.json({ message: 'Results acknowledged successfully' });
  } catch (error: any) {
    logger.error('Error acknowledging lab results', { error: error.message });
    res.status(500).json({ error: 'Failed to acknowledge results' });
  }
});

/**
 * GET /api/lab-results/critical
 * Get pending critical value notifications
 */
router.get('/critical', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
        lcn.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        lo.order_date,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name
      FROM lab_critical_notifications lcn
      JOIN patients p ON lcn.patient_id = p.id
      JOIN lab_orders lo ON lcn.lab_order_id = lo.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      WHERE lcn.tenant_id = $1
        AND lcn.status IN ('pending', 'notified')
      ORDER BY lcn.created_at DESC`,
      [req.user!.tenantId]
    );

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching critical notifications', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch critical notifications' });
  }
});

/**
 * POST /api/lab-results/critical/:id/acknowledge
 * Acknowledge a critical value notification
 */
router.post('/critical/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notification_method, read_back_value, action_taken } = req.body;

    const result = await pool.query(
      `UPDATE lab_critical_notifications
      SET status = 'acknowledged',
          acknowledged_at = NOW(),
          acknowledged_by = $1,
          notification_method = $2,
          read_back_value = $3,
          action_taken = $4
      WHERE id = $5 AND tenant_id = $6
      RETURNING *`,
      [req.user!.id, notification_method, read_back_value, action_taken, id, req.user!.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Critical notification not found' });
    }

    logger.info('Critical value acknowledged', { notificationId: id, userId: req.user!.id });

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error acknowledging critical value', { error: error.message });
    res.status(500).json({ error: 'Failed to acknowledge critical value' });
  }
});

export const labResultsRouter = router;
