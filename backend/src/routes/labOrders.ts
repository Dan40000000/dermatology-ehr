/**
 * Lab Orders Routes
 * Manage laboratory orders, tracking, and submission
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
 * GET /api/lab-orders
 * Get lab orders with filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { patient_id, encounter_id, status, vendor_id, from_date, to_date } = req.query;

    let query = `
      SELECT
        lo.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        lv.name as vendor_name,
        lv.vendor_type,
        (
          SELECT json_agg(
            json_build_object(
              'id', lot.id,
              'test_code', lot.test_code,
              'test_name', lot.test_name,
              'status', lot.status,
              'has_results', lot.has_results
            )
          )
          FROM lab_order_tests lot
          WHERE lot.lab_order_id = lo.id
        ) as tests,
        (
          SELECT COUNT(*)
          FROM lab_results lr
          WHERE lr.lab_order_id = lo.id
        ) as result_count
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      JOIN lab_vendors lv ON lo.vendor_id = lv.id
      WHERE lo.tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND lo.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (encounter_id) {
      query += ` AND lo.encounter_id = $${paramIndex}`;
      params.push(encounter_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND lo.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (vendor_id) {
      query += ` AND lo.vendor_id = $${paramIndex}`;
      params.push(vendor_id);
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

    query += ` ORDER BY lo.order_date DESC LIMIT 100`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching lab orders', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab orders' });
  }
});

/**
 * GET /api/lab-orders/:id
 * Get a specific lab order with full details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const orderQuery = `
      SELECT
        lo.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.date_of_birth,
        p.gender,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        pr.npi as provider_npi,
        lv.name as vendor_name,
        lv.vendor_type,
        lv.phone as vendor_phone,
        lv.fax as vendor_fax
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      JOIN lab_vendors lv ON lo.vendor_id = lv.id
      WHERE lo.id = $1 AND lo.tenant_id = $2
    `;

    const testsQuery = `
      SELECT
        lot.*,
        ltc.category,
        ltc.specimen_type,
        ltc.turnaround_time
      FROM lab_order_tests lot
      JOIN lab_test_catalog ltc ON lot.test_id = ltc.id
      WHERE lot.lab_order_id = $1
      ORDER BY lot.created_at
    `;

    const resultsQuery = `
      SELECT *
      FROM lab_results
      WHERE lab_order_id = $1
      ORDER BY result_date DESC
    `;

    const [orderResult, testsResult, resultsResult] = await Promise.all([
      pool.query(orderQuery, [id, req.user!.tenantId]),
      pool.query(testsQuery, [id]),
      pool.query(resultsQuery, [id])
    ]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lab order not found' });
    }

    const order = {
      ...orderResult.rows[0],
      tests: testsResult.rows,
      results: resultsResult.rows
    };

    res.json(order);
  } catch (error: any) {
    logger.error('Error fetching lab order', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab order' });
  }
});

/**
 * POST /api/lab-orders
 * Create a new lab order
 */
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const {
      patient_id,
      encounter_id,
      ordering_provider_id,
      vendor_id,
      order_set_id,
      tests, // Array of test IDs
      icd10_codes,
      clinical_indication,
      clinical_notes,
      priority = 'routine',
      is_fasting = false
    } = req.body;

    await client.query('BEGIN');

    // Create the lab order
    const orderResult = await client.query(
      `INSERT INTO lab_orders (
        tenant_id, patient_id, encounter_id, ordering_provider_id,
        vendor_id, order_set_id, icd10_codes, clinical_indication,
        clinical_notes, priority, is_fasting, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        req.user!.tenantId,
        patient_id,
        encounter_id,
        ordering_provider_id,
        vendor_id,
        order_set_id,
        icd10_codes,
        clinical_indication,
        clinical_notes,
        priority,
        is_fasting,
        'pending',
        req.user!.id
      ]
    );

    const orderId = orderResult.rows[0].id;

    // Add individual tests
    if (tests && tests.length > 0) {
      for (const testId of tests) {
        // Get test details
        const testResult = await client.query(
          `SELECT test_code, test_name FROM lab_test_catalog WHERE id = $1`,
          [testId]
        );

        if (testResult.rows.length > 0) {
          await client.query(
            `INSERT INTO lab_order_tests (
              lab_order_id, test_id, test_code, test_name, status
            ) VALUES ($1, $2, $3, $4, $5)`,
            [orderId, testId, testResult.rows[0].test_code, testResult.rows[0].test_name, 'pending']
          );
        }
      }
    }

    await client.query('COMMIT');

    // Fetch the complete order
    const completeOrder = await pool.query(
      `SELECT lo.*,
        json_agg(json_build_object(
          'id', lot.id,
          'test_code', lot.test_code,
          'test_name', lot.test_name
        )) as tests
      FROM lab_orders lo
      LEFT JOIN lab_order_tests lot ON lo.id = lot.lab_order_id
      WHERE lo.id = $1
      GROUP BY lo.id`,
      [orderId]
    );

    logger.info('Lab order created', { orderId, userId: req.user!.id });

    res.status(201).json(completeOrder.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error creating lab order', { error: error.message });
    res.status(500).json({ error: 'Failed to create lab order' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/lab-orders/:id/submit
 * Submit lab order electronically (generate HL7 ORM message)
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get order details
    const orderQuery = await pool.query(
      `SELECT
        lo.*,
        p.id as patient_uuid, p.mrn, p.first_name as patient_first_name,
        p.last_name as patient_last_name, p.date_of_birth, p.gender,
        pr.id as provider_uuid, pr.npi, pr.first_name as provider_first_name,
        pr.last_name as provider_last_name,
        lv.name as vendor_name, lv.api_endpoint, lv.hl7_enabled
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN providers pr ON lo.ordering_provider_id = pr.id
      JOIN lab_vendors lv ON lo.vendor_id = lv.id
      WHERE lo.id = $1 AND lo.tenant_id = $2`,
      [id, req.user!.tenantId]
    );

    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Lab order not found' });
    }

    const order = orderQuery.rows[0];

    if (!order.hl7_enabled) {
      return res.status(400).json({ error: 'Electronic ordering not available for this lab' });
    }

    // Get tests
    const testsQuery = await pool.query(
      `SELECT test_code, test_name FROM lab_order_tests WHERE lab_order_id = $1`,
      [id]
    );

    // Generate HL7 ORM message
    const hl7Message = HL7Service.generateLabOrderMessage(
      {
        orderId: order.id,
        patientId: order.patient_uuid,
        providerId: order.provider_uuid,
        tests: testsQuery.rows,
        priority: order.priority,
        specimenType: order.specimen_type || 'Blood',
        clinicalInfo: order.clinical_indication
      },
      {
        id: order.patient_uuid,
        mrn: order.mrn,
        firstName: order.patient_first_name,
        lastName: order.patient_last_name,
        dateOfBirth: order.date_of_birth,
        gender: order.gender
      },
      {
        id: order.provider_uuid,
        npi: order.npi,
        firstName: order.provider_first_name,
        lastName: order.provider_last_name
      },
      {
        id: req.user!.tenantId,
        name: 'Dermatology Clinic'
      }
    );

    // Send HL7 message (mock)
    const sendResult = await HL7Service.sendHL7Message(
      hl7Message,
      order.api_endpoint || 'mock://lab-interface',
      order.vendor_name
    );

    // Update order status
    await pool.query(
      `UPDATE lab_orders
      SET status = $1, hl7_sent_at = NOW(), hl7_message_id = $2
      WHERE id = $3`,
      ['sent', sendResult.acknowledgment?.substring(0, 50), id]
    );

    logger.info('Lab order submitted', { orderId: id, vendor: order.vendor_name });

    res.json({
      success: true,
      message: 'Lab order submitted successfully',
      hl7_message: hl7Message,
      acknowledgment: sendResult.acknowledgment
    });
  } catch (error: any) {
    logger.error('Error submitting lab order', { error: error.message });
    res.status(500).json({ error: 'Failed to submit lab order' });
  }
});

/**
 * PATCH /api/lab-orders/:id/specimen
 * Update specimen tracking information
 */
router.patch('/:id/specimen', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      specimen_collected_at,
      specimen_collected_by,
      specimen_sent_at,
      specimen_received_at,
      specimen_id,
      specimen_type,
      specimen_source,
      specimen_quality,
      specimen_rejection_reason
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (specimen_collected_at !== undefined) {
      updates.push(`specimen_collected_at = $${paramIndex++}`);
      values.push(specimen_collected_at);
    }

    if (specimen_collected_by !== undefined) {
      updates.push(`specimen_collected_by = $${paramIndex++}`);
      values.push(specimen_collected_by);
    }

    if (specimen_sent_at !== undefined) {
      updates.push(`specimen_sent_at = $${paramIndex++}`);
      values.push(specimen_sent_at);
    }

    if (specimen_received_at !== undefined) {
      updates.push(`specimen_received_at = $${paramIndex++}`);
      values.push(specimen_received_at);
    }

    if (specimen_id !== undefined) {
      updates.push(`specimen_id = $${paramIndex++}`);
      values.push(specimen_id);
    }

    if (specimen_type !== undefined) {
      updates.push(`specimen_type = $${paramIndex++}`);
      values.push(specimen_type);
    }

    if (specimen_source !== undefined) {
      updates.push(`specimen_source = $${paramIndex++}`);
      values.push(specimen_source);
    }

    if (specimen_quality !== undefined) {
      updates.push(`specimen_quality = $${paramIndex++}`);
      values.push(specimen_quality);
    }

    if (specimen_rejection_reason !== undefined) {
      updates.push(`specimen_rejection_reason = $${paramIndex++}`);
      values.push(specimen_rejection_reason);
    }

    // Determine new status based on specimen tracking
    let newStatus = null;
    if (specimen_collected_at && !specimen_sent_at) {
      newStatus = 'collected';
    } else if (specimen_sent_at && !specimen_received_at) {
      newStatus = 'sent';
    } else if (specimen_received_at) {
      newStatus = 'received';
    }

    if (newStatus) {
      updates.push(`status = $${paramIndex++}`);
      values.push(newStatus);
    }

    updates.push(`updated_at = NOW()`);

    values.push(id, req.user!.tenantId);

    const result = await pool.query(
      `UPDATE lab_orders
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab order not found' });
    }

    logger.info('Lab order specimen updated', { orderId: id });

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error updating lab order specimen', { error: error.message });
    res.status(500).json({ error: 'Failed to update specimen tracking' });
  }
});

/**
 * PATCH /api/lab-orders/:id/status
 * Update order status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'collected', 'sent', 'received', 'processing', 'partial_results', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE lab_orders
      SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
      [status, notes, id, req.user!.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab order not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error updating lab order status', { error: error.message });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * DELETE /api/lab-orders/:id
 * Cancel a lab order
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE lab_orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
      RETURNING *`,
      [id, req.user!.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab order not found or cannot be cancelled' });
    }

    logger.info('Lab order cancelled', { orderId: id });

    res.json({ message: 'Lab order cancelled successfully' });
  } catch (error: any) {
    logger.error('Error cancelling lab order', { error: error.message });
    res.status(500).json({ error: 'Failed to cancel lab order' });
  }
});

export const labOrdersRouter = router;
