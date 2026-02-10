/**
 * Labs API Routes
 * Comprehensive lab and pathology integration endpoints
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';
import { createLabIntegrationService } from '../services/labIntegrationService';
import { parseHL7Message } from '../services/hl7Parser';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * POST /api/labs/orders
 * Create a new lab order
 */
router.post('/orders', async (req: AuthedRequest, res: Response) => {
  try {
    const {
      patientId,
      encounterId,
      orderingProviderId,
      labId,
      tests,
      priority,
      clinicalIndication,
      clinicalNotes,
      icd10Codes,
      isFasting,
      specimens
    } = req.body;

    if (!patientId || !orderingProviderId) {
      return res.status(400).json({ error: 'patientId and orderingProviderId are required' });
    }

    if (!tests || !Array.isArray(tests) || tests.length === 0) {
      return res.status(400).json({ error: 'At least one test is required' });
    }

    const labService = createLabIntegrationService(req.user!.tenantId);

    const result = await labService.createLabOrder({
      patientId,
      encounterId,
      orderingProviderId,
      labId,
      tests,
      priority,
      clinicalIndication,
      clinicalNotes,
      icd10Codes,
      isFasting,
      specimens
    });

    logger.info('Lab order created via API', { orderId: result.id, userId: req.user!.id });

    res.status(201).json(result);
  } catch (error: any) {
    logger.error('Error creating lab order', { error: error.message });
    res.status(500).json({ error: 'Failed to create lab order' });
  }
});

/**
 * GET /api/labs/orders/patient/:patientId
 * Get all lab orders for a patient
 */
router.get('/orders/patient/:patientId', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const { status, from_date, to_date, limit = 50 } = req.query;

    let query = `
      SELECT
        lo.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        li.lab_name,
        (
          SELECT COUNT(*)
          FROM lab_results_v2 lr
          WHERE lr.order_id = lo.id
        ) as result_count,
        (
          SELECT COUNT(*)
          FROM lab_results_v2 lr
          WHERE lr.order_id = lo.id
          AND lr.abnormal_flags IS NOT NULL
          AND array_length(lr.abnormal_flags, 1) > 0
        ) as abnormal_count
      FROM lab_orders_v2 lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      LEFT JOIN lab_interfaces li ON lo.lab_id = li.id
      WHERE lo.tenant_id = $1 AND lo.patient_id = $2
    `;

    const params: any[] = [req.user!.tenantId, patientId];
    let paramIndex = 3;

    if (status) {
      query += ` AND lo.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND lo.order_date >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND lo.order_date <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    query += ` ORDER BY lo.order_date DESC LIMIT $${paramIndex}`;
    params.push(Number(limit));

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching patient lab orders', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab orders' });
  }
});

/**
 * GET /api/labs/results/:orderId
 * Get lab results for an order
 */
router.get('/results/:orderId', async (req: AuthedRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    // Get order details
    const orderResult = await pool.query(
      `SELECT lo.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn, p.dob,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        li.lab_name
      FROM lab_orders_v2 lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      LEFT JOIN lab_interfaces li ON lo.lab_id = li.id
      WHERE lo.id = $1 AND lo.tenant_id = $2`,
      [orderId, req.user!.tenantId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lab order not found' });
    }

    // Get results
    const resultsResult = await pool.query(
      `SELECT *
      FROM lab_results_v2
      WHERE order_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC`,
      [orderId, req.user!.tenantId]
    );

    res.json({
      order: orderResult.rows[0],
      results: resultsResult.rows
    });
  } catch (error: any) {
    logger.error('Error fetching lab results', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab results' });
  }
});

/**
 * PUT /api/labs/results/:id/review
 * Mark a lab result as reviewed
 */
router.put('/results/:id/review', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    // Update result
    const result = await pool.query(
      `UPDATE lab_results_v2
      SET reviewed_by = $1,
          reviewed_at = NOW(),
          review_notes = $2,
          updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
      [req.user!.id, reviewNotes || null, id, req.user!.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab result not found' });
    }

    // Also update the order if all results are reviewed
    const orderId = result.rows[0]?.order_id;
    if (orderId) {
      const unreviewed = await pool.query(
        `SELECT COUNT(*) as count
        FROM lab_results_v2
        WHERE order_id = $1 AND reviewed_at IS NULL`,
        [orderId]
      );

      if (parseInt(unreviewed.rows[0]?.count || '0') === 0) {
        await pool.query(
          `UPDATE lab_orders_v2
          SET status = 'reviewed',
              results_reviewed_at = NOW(),
              results_reviewed_by = $1,
              updated_at = NOW()
          WHERE id = $2`,
          [req.user!.id, orderId]
        );
      }
    }

    logger.info('Lab result reviewed', { resultId: id, userId: req.user!.id });

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error reviewing lab result', { error: error.message });
    res.status(500).json({ error: 'Failed to review lab result' });
  }
});

/**
 * POST /api/labs/webhook/hl7
 * Receive HL7 ORU results from external labs
 */
router.post('/webhook/hl7', async (req: AuthedRequest, res: Response) => {
  try {
    const { hl7Message, labSource } = req.body;

    if (!hl7Message) {
      return res.status(400).json({ error: 'hl7Message is required' });
    }

    const labService = createLabIntegrationService(req.user!.tenantId);

    const result = await labService.receiveResults(hl7Message, labSource);

    // Generate ACK response
    try {
      const parsedMessage = parseHL7Message(hl7Message);
      const ackCode = result.success ? 'AA' : 'AE';
      const { generateACK } = await import('../services/hl7Parser');
      const ackMessage = generateACK(parsedMessage, ackCode);

      res.set('Content-Type', 'text/plain');
      res.send(ackMessage);
    } catch {
      res.json(result);
    }
  } catch (error: any) {
    logger.error('Error processing HL7 webhook', { error: error.message });
    res.status(500).json({ error: 'Failed to process HL7 message' });
  }
});

/**
 * POST /api/labs/orders/:id/send
 * Send a lab order to the external lab
 */
router.post('/orders/:id/send', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { labId } = req.body;

    if (!labId) {
      return res.status(400).json({ error: 'labId is required' });
    }

    const labService = createLabIntegrationService(req.user!.tenantId);

    const result = await labService.sendToLab(id ?? '', labId);

    logger.info('Lab order sent to external lab', { orderId: id, labId });

    res.json(result);
  } catch (error: any) {
    logger.error('Error sending lab order', { error: error.message });
    res.status(500).json({ error: 'Failed to send lab order' });
  }
});

/**
 * GET /api/labs/pending
 * Get pending lab orders awaiting results
 */
router.get('/pending', async (req: AuthedRequest, res: Response) => {
  try {
    const { providerId, limit = 50 } = req.query;

    let query = `
      SELECT
        lo.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        li.lab_name,
        EXTRACT(DAY FROM NOW() - lo.order_date) as days_pending
      FROM lab_orders_v2 lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      LEFT JOIN lab_interfaces li ON lo.lab_id = li.id
      WHERE lo.tenant_id = $1
      AND lo.status IN ('sent', 'received', 'processing', 'partial')
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (providerId) {
      query += ` AND lo.ordering_provider_id = $${paramIndex}`;
      params.push(providerId);
      paramIndex++;
    }

    query += ` ORDER BY lo.order_date ASC LIMIT $${paramIndex}`;
    params.push(Number(limit));

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching pending labs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch pending labs' });
  }
});

/**
 * GET /api/labs/abnormal
 * Get abnormal lab results requiring attention
 */
router.get('/abnormal', async (req: AuthedRequest, res: Response) => {
  try {
    const { reviewed = 'false', limit = 50 } = req.query;

    let query = `
      SELECT
        lr.*,
        lo.order_number,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name
      FROM lab_results_v2 lr
      JOIN lab_orders_v2 lo ON lr.order_id = lo.id
      JOIN patients p ON lr.patient_id = p.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      WHERE lr.tenant_id = $1
      AND lr.abnormal_flags IS NOT NULL
      AND array_length(lr.abnormal_flags, 1) > 0
    `;

    if (reviewed === 'false') {
      query += ` AND lr.reviewed_at IS NULL`;
    }

    query += ` ORDER BY
      CASE WHEN lr.critical_flags IS NOT NULL AND array_length(lr.critical_flags, 1) > 0 THEN 0 ELSE 1 END,
      lr.created_at DESC
      LIMIT $2`;

    const result = await pool.query(query, [req.user!.tenantId, Number(limit)]);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching abnormal results', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch abnormal results' });
  }
});

/**
 * GET /api/pathology/pending
 * Get biopsies awaiting pathology results
 */
router.get('/pathology/pending', async (req: AuthedRequest, res: Response) => {
  try {
    const { providerId, limit = 50 } = req.query;

    const labService = createLabIntegrationService(req.user!.tenantId);
    const pendingBiopsies = await labService.getPendingBiopsies();

    // Filter by provider if specified
    let results = pendingBiopsies;
    if (providerId) {
      results = pendingBiopsies.filter(b => b.ordering_provider_id === providerId);
    }

    // Limit results
    results = results.slice(0, Number(limit));

    res.json(results);
  } catch (error: any) {
    logger.error('Error fetching pending biopsies', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch pending biopsies' });
  }
});

/**
 * GET /api/labs/interfaces
 * Get available lab interfaces
 */
router.get('/interfaces', async (req: AuthedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, lab_name, interface_type, is_active, supported_test_types,
        hl7_version, last_connection_at
      FROM lab_interfaces
      WHERE (tenant_id = $1 OR tenant_id = 'demo-tenant')
      AND is_active = true
      ORDER BY lab_name`,
      [req.user!.tenantId]
    );

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching lab interfaces', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab interfaces' });
  }
});

/**
 * GET /api/labs/catalog
 * Get available lab tests
 */
router.get('/catalog', async (req: AuthedRequest, res: Response) => {
  try {
    const { category, search } = req.query;

    let query = `
      SELECT *
      FROM derm_lab_catalog
      WHERE (tenant_id = $1 OR tenant_id IS NULL)
      AND is_active = true
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` AND test_category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (test_name ILIKE $${paramIndex} OR test_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY is_common DESC, test_name`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching lab catalog', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab catalog' });
  }
});

/**
 * GET /api/labs/notifications
 * Get result notifications
 */
router.get('/notifications', async (req: AuthedRequest, res: Response) => {
  try {
    const { acknowledged = 'false', limit = 50 } = req.query;

    let query = `
      SELECT rn.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn
      FROM result_notifications rn
      JOIN patients p ON rn.patient_id = p.id
      WHERE rn.tenant_id = $1
    `;

    if (acknowledged === 'false') {
      query += ` AND rn.acknowledged_at IS NULL`;
    }

    query += ` ORDER BY
      CASE rn.priority
        WHEN 'critical' THEN 0
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        ELSE 4
      END,
      rn.sent_at DESC
      LIMIT $2`;

    const result = await pool.query(query, [req.user!.tenantId, Number(limit)]);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching notifications', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * PUT /api/labs/notifications/:id/acknowledge
 * Acknowledge a result notification
 */
router.put('/notifications/:id/acknowledge', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { actionTaken } = req.body;

    const result = await pool.query(
      `UPDATE result_notifications
      SET acknowledged_at = NOW(),
          acknowledged_by = $1,
          action_taken = $2
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
      [req.user!.id, actionTaken || null, id, req.user!.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error acknowledging notification', { error: error.message });
    res.status(500).json({ error: 'Failed to acknowledge notification' });
  }
});

export const labsRouter = router;
