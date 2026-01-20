import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

// Get all fee schedules
router.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT * FROM fee_schedules WHERE tenant_id = $1 ORDER BY is_default DESC, name ASC`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching fee schedules:', error);
    res.status(500).json({ error: 'Failed to fetch fee schedules' });
  }
});

// Get a single fee schedule with items
router.get('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const scheduleResult = await pool.query(
      `SELECT * FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    const itemsResult = await pool.query(
      `SELECT * FROM fee_schedule_items WHERE fee_schedule_id = $1 ORDER BY cpt_code ASC`,
      [id]
    );

    const schedule = {
      ...scheduleResult.rows[0],
      items: itemsResult.rows
    };

    res.json(schedule);
  } catch (error) {
    console.error('Error fetching fee schedule:', error);
    res.status(500).json({ error: 'Failed to fetch fee schedule' });
  }
});

// Create a new fee schedule
router.post('/', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { name, isDefault = false, description = null, cloneFromId = null } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // If setting as default, unset other defaults
    if (isDefault) {
      await client.query(
        `UPDATE fee_schedules SET is_default = false WHERE tenant_id = $1`,
        [tenantId]
      );
    }

    const id = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO fee_schedules (id, tenant_id, name, is_default, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, tenantId, name, isDefault, description]
    );

    const newSchedule = result.rows[0];

    // If cloning from another schedule, copy all items
    if (cloneFromId) {
      await client.query(
        `INSERT INTO fee_schedule_items (id, fee_schedule_id, cpt_code, cpt_description, fee_cents)
         SELECT gen_random_uuid(), $1, cpt_code, cpt_description, fee_cents
         FROM fee_schedule_items
         WHERE fee_schedule_id = $2`,
        [id, cloneFromId]
      );
    }

    await client.query('COMMIT');

    // Fetch complete schedule with items
    const itemsResult = await client.query(
      `SELECT * FROM fee_schedule_items WHERE fee_schedule_id = $1`,
      [id]
    );

    res.status(201).json({
      ...newSchedule,
      items: itemsResult.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating fee schedule:', error);
    res.status(500).json({ error: 'Failed to create fee schedule' });
  } finally {
    client.release();
  }
});

// Update a fee schedule
router.put('/:id', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { name, isDefault, description } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify ownership
    const checkResult = await client.query(
      `SELECT * FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    // If setting as default, unset other defaults
    if (isDefault === true) {
      await client.query(
        `UPDATE fee_schedules SET is_default = false WHERE tenant_id = $1 AND id != $2`,
        [tenantId, id]
      );
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (isDefault !== undefined) {
      updates.push(`is_default = $${paramIndex++}`);
      values.push(isDefault);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, tenantId);

    const result = await client.query(
      `UPDATE fee_schedules SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
       RETURNING *`,
      values
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating fee schedule:', error);
    res.status(500).json({ error: 'Failed to update fee schedule' });
  } finally {
    client.release();
  }
});

// Delete a fee schedule
router.delete('/:id', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if it's the default schedule
    const checkResult = await client.query(
      `SELECT is_default FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    if (checkResult.rows[0].is_default) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot delete default fee schedule' });
    }

    // Delete all items first (cascade should handle this, but being explicit)
    await client.query(
      `DELETE FROM fee_schedule_items WHERE fee_schedule_id = $1`,
      [id]
    );

    // Delete the schedule
    await client.query(
      `DELETE FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    await client.query('COMMIT');
    res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting fee schedule:', error);
    res.status(500).json({ error: 'Failed to delete fee schedule' });
  } finally {
    client.release();
  }
});

// Get items for a fee schedule
router.get('/:id/items', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    // Verify ownership
    const checkResult = await pool.query(
      `SELECT * FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    const result = await pool.query(
      `SELECT * FROM fee_schedule_items WHERE fee_schedule_id = $1 ORDER BY cpt_code ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching fee schedule items:', error);
    res.status(500).json({ error: 'Failed to fetch fee schedule items' });
  }
});

// Add or update a fee schedule item
router.put('/:id/items/:cptCode', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id, cptCode } = req.params;
  const { feeCents, cptDescription, category } = req.body;

  if (feeCents === undefined || feeCents < 0) {
    return res.status(400).json({ error: 'Valid fee is required' });
  }

  try {
    // Verify ownership
    const checkResult = await pool.query(
      `SELECT * FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    // Upsert the item
    const result = await pool.query(
      `INSERT INTO fee_schedule_items (id, fee_schedule_id, cpt_code, cpt_description, category, fee_cents)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (fee_schedule_id, cpt_code)
       DO UPDATE SET fee_cents = $5, cpt_description = $3, category = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, cptCode, cptDescription || null, category || null, feeCents]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating fee schedule item:', error);
    res.status(500).json({ error: 'Failed to update fee schedule item' });
  }
});

// Delete a fee schedule item
router.delete('/:id/items/:cptCode', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id, cptCode } = req.params;

  try {
    // Verify ownership
    const checkResult = await pool.query(
      `SELECT * FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    await pool.query(
      `DELETE FROM fee_schedule_items WHERE fee_schedule_id = $1 AND cpt_code = $2`,
      [id, cptCode]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting fee schedule item:', error);
    res.status(500).json({ error: 'Failed to delete fee schedule item' });
  }
});

// Bulk import items
router.post('/:id/items/import', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { items } = req.body; // Array of { cptCode, fee, description? }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify ownership
    const checkResult = await client.query(
      `SELECT * FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    let imported = 0;
    let errors: any[] = [];

    for (const item of items) {
      try {
        const feeCents = Math.round(item.fee * 100);

        if (feeCents < 0) {
          errors.push({ cptCode: item.cptCode, error: 'Fee must be positive' });
          continue;
        }

        await client.query(
          `INSERT INTO fee_schedule_items (id, fee_schedule_id, cpt_code, cpt_description, category, fee_cents)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
           ON CONFLICT (fee_schedule_id, cpt_code)
           DO UPDATE SET fee_cents = $5, cpt_description = $3, category = $4, updated_at = CURRENT_TIMESTAMP`,
          [id, item.cptCode, item.description || null, item.category || null, feeCents]
        );

        imported++;
      } catch (err: any) {
        errors.push({ cptCode: item.cptCode, error: err.message });
      }
    }

    await client.query('COMMIT');

    res.json({
      imported,
      total: items.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error importing fee schedule items:', error);
    res.status(500).json({ error: 'Failed to import fee schedule items' });
  } finally {
    client.release();
  }
});

// Export fee schedule to CSV
router.get('/:id/export', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    // Verify ownership
    const checkResult = await pool.query(
      `SELECT name FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    const scheduleName = checkResult.rows[0].name;

    const result = await pool.query(
      `SELECT cpt_code, category, cpt_description, fee_cents FROM fee_schedule_items
       WHERE fee_schedule_id = $1 ORDER BY category ASC, cpt_code ASC`,
      [id]
    );

    // Generate CSV
    let csv = 'CPT Code,Category,Description,Fee\n';
    for (const row of result.rows) {
      const fee = (row.fee_cents / 100).toFixed(2);
      const category = row.category ? `"${row.category.replace(/"/g, '""')}"` : '';
      const description = row.cpt_description ? `"${row.cpt_description.replace(/"/g, '""')}"` : '';
      csv += `${row.cpt_code},${category},${description},${fee}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${scheduleName.replace(/[^a-zA-Z0-9]/g, '_')}_fees.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting fee schedule:', error);
    res.status(500).json({ error: 'Failed to export fee schedule' });
  }
});

// Get default fee schedule
router.get('/default/schedule', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT * FROM fee_schedules WHERE tenant_id = $1 AND is_default = true LIMIT 1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No default fee schedule found' });
    }

    const itemsResult = await pool.query(
      `SELECT * FROM fee_schedule_items WHERE fee_schedule_id = $1`,
      [result.rows[0].id]
    );

    res.json({
      ...result.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching default fee schedule:', error);
    res.status(500).json({ error: 'Failed to fetch default fee schedule' });
  }
});

// Get fee for a specific CPT code from default schedule
router.get('/default/fee/:cptCode', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { cptCode } = req.params;

  try {
    const result = await pool.query(
      `SELECT fsi.* FROM fee_schedule_items fsi
       JOIN fee_schedules fs ON fsi.fee_schedule_id = fs.id
       WHERE fs.tenant_id = $1 AND fs.is_default = true AND fsi.cpt_code = $2`,
      [tenantId, cptCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee not found for this CPT code' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching fee:', error);
    res.status(500).json({ error: 'Failed to fetch fee' });
  }
});

// ============================================
// PAYER CONTRACTS
// ============================================

// Get all payer contracts
router.get('/contracts/list', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { status } = req.query;

  try {
    let query = `
      SELECT pc.*, fs.name as fee_schedule_name
      FROM payer_contracts pc
      LEFT JOIN fee_schedules fs ON fs.id = pc.fee_schedule_id
      WHERE pc.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (status) {
      query += ` AND pc.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY pc.payer_name ASC`;

    const result = await pool.query(query, params);
    res.json({ contracts: result.rows });
  } catch (error) {
    console.error('Error fetching payer contracts:', error);
    res.status(500).json({ error: 'Failed to fetch payer contracts' });
  }
});

// Get single payer contract
router.get('/contracts/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT pc.*, fs.name as fee_schedule_name
       FROM payer_contracts pc
       LEFT JOIN fee_schedules fs ON fs.id = pc.fee_schedule_id
       WHERE pc.id = $1 AND pc.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payer contract not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching payer contract:', error);
    res.status(500).json({ error: 'Failed to fetch payer contract' });
  }
});

// Create payer contract
router.post('/contracts', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const {
    payerName,
    payerId,
    contractNumber,
    feeScheduleId,
    effectiveDate,
    terminationDate,
    reimbursementType,
    reimbursementPercentage,
    medicarePercentage,
    timelyFilingDays,
    notes,
  } = req.body;

  if (!payerName || !effectiveDate) {
    return res.status(400).json({ error: 'Payer name and effective date are required' });
  }

  try {
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO payer_contracts (
        id, tenant_id, payer_name, payer_id, contract_number,
        fee_schedule_id, effective_date, termination_date, status,
        reimbursement_type, reimbursement_percentage, medicare_percentage,
        timely_filing_days, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id, tenantId, payerName, payerId || null, contractNumber || null,
        feeScheduleId || null, effectiveDate, terminationDate || null, 'active',
        reimbursementType || null, reimbursementPercentage || null, medicarePercentage || null,
        timelyFilingDays || 90, notes || null, req.user!.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating payer contract:', error);
    res.status(500).json({ error: 'Failed to create payer contract' });
  }
});

// Update payer contract
router.put('/contracts/:id', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const {
    payerName,
    payerId,
    contractNumber,
    feeScheduleId,
    effectiveDate,
    terminationDate,
    status,
    reimbursementType,
    reimbursementPercentage,
    medicarePercentage,
    timelyFilingDays,
    notes,
  } = req.body;

  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (payerName !== undefined) {
      updates.push(`payer_name = $${paramIndex++}`);
      values.push(payerName);
    }
    if (payerId !== undefined) {
      updates.push(`payer_id = $${paramIndex++}`);
      values.push(payerId);
    }
    if (contractNumber !== undefined) {
      updates.push(`contract_number = $${paramIndex++}`);
      values.push(contractNumber);
    }
    if (feeScheduleId !== undefined) {
      updates.push(`fee_schedule_id = $${paramIndex++}`);
      values.push(feeScheduleId);
    }
    if (effectiveDate !== undefined) {
      updates.push(`effective_date = $${paramIndex++}`);
      values.push(effectiveDate);
    }
    if (terminationDate !== undefined) {
      updates.push(`termination_date = $${paramIndex++}`);
      values.push(terminationDate);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (reimbursementType !== undefined) {
      updates.push(`reimbursement_type = $${paramIndex++}`);
      values.push(reimbursementType);
    }
    if (reimbursementPercentage !== undefined) {
      updates.push(`reimbursement_percentage = $${paramIndex++}`);
      values.push(reimbursementPercentage);
    }
    if (medicarePercentage !== undefined) {
      updates.push(`medicare_percentage = $${paramIndex++}`);
      values.push(medicarePercentage);
    }
    if (timelyFilingDays !== undefined) {
      updates.push(`timely_filing_days = $${paramIndex++}`);
      values.push(timelyFilingDays);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, tenantId);

    const result = await pool.query(
      `UPDATE payer_contracts SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payer contract not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating payer contract:', error);
    res.status(500).json({ error: 'Failed to update payer contract' });
  }
});

// Delete payer contract
router.delete('/contracts/:id', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM payer_contracts WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payer contract not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting payer contract:', error);
    res.status(500).json({ error: 'Failed to delete payer contract' });
  }
});

// ============================================
// SERVICE PACKAGES
// ============================================

// Get all service packages
router.get('/packages/list', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { isActive } = req.query;

  try {
    let query = `SELECT * FROM service_packages WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (isActive !== undefined) {
      query += ` AND is_active = $2`;
      params.push(isActive === 'true');
    }

    query += ` ORDER BY name ASC`;

    const result = await pool.query(query, params);
    res.json({ packages: result.rows });
  } catch (error) {
    console.error('Error fetching service packages:', error);
    res.status(500).json({ error: 'Failed to fetch service packages' });
  }
});

// Get single service package with items
router.get('/packages/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const packageResult = await pool.query(
      `SELECT * FROM service_packages WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (packageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service package not found' });
    }

    const itemsResult = await pool.query(
      `SELECT * FROM service_package_items WHERE service_package_id = $1 ORDER BY cpt_code ASC`,
      [id]
    );

    res.json({
      ...packageResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching service package:', error);
    res.status(500).json({ error: 'Failed to fetch service package' });
  }
});

// Create service package
router.post('/packages', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const {
    name,
    description,
    packagePriceCents,
    regularPriceCents,
    validFrom,
    validUntil,
    maxUses,
    items, // Array of { cptCode, description, quantity, individualPriceCents }
  } = req.body;

  if (!name || !packagePriceCents || !regularPriceCents) {
    return res.status(400).json({ error: 'Name, package price, and regular price are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO service_packages (
        id, tenant_id, name, description, package_price_cents,
        regular_price_cents, valid_from, valid_until, max_uses, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id, tenantId, name, description || null, packagePriceCents,
        regularPriceCents, validFrom || null, validUntil || null, maxUses || null, req.user!.id,
      ]
    );

    // Add items if provided
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await client.query(
          `INSERT INTO service_package_items (
            id, service_package_id, cpt_code, description, quantity, individual_price_cents
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            id,
            item.cptCode,
            item.description || null,
            item.quantity || 1,
            item.individualPriceCents,
          ]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch complete package
    const result = await client.query(
      `SELECT * FROM service_packages WHERE id = $1`,
      [id]
    );

    const itemsResult = await client.query(
      `SELECT * FROM service_package_items WHERE service_package_id = $1`,
      [id]
    );

    res.status(201).json({
      ...result.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating service package:', error);
    res.status(500).json({ error: 'Failed to create service package' });
  } finally {
    client.release();
  }
});

// Update service package
router.put('/packages/:id', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const {
    name,
    description,
    packagePriceCents,
    regularPriceCents,
    isActive,
    validFrom,
    validUntil,
    maxUses,
  } = req.body;

  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (packagePriceCents !== undefined) {
      updates.push(`package_price_cents = $${paramIndex++}`);
      values.push(packagePriceCents);
    }
    if (regularPriceCents !== undefined) {
      updates.push(`regular_price_cents = $${paramIndex++}`);
      values.push(regularPriceCents);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }
    if (validFrom !== undefined) {
      updates.push(`valid_from = $${paramIndex++}`);
      values.push(validFrom);
    }
    if (validUntil !== undefined) {
      updates.push(`valid_until = $${paramIndex++}`);
      values.push(validUntil);
    }
    if (maxUses !== undefined) {
      updates.push(`max_uses = $${paramIndex++}`);
      values.push(maxUses);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, tenantId);

    const result = await pool.query(
      `UPDATE service_packages SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service package not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating service package:', error);
    res.status(500).json({ error: 'Failed to update service package' });
  }
});

// Add item to service package
router.post('/packages/:id/items', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { cptCode, description, quantity, individualPriceCents } = req.body;

  if (!cptCode || !individualPriceCents) {
    return res.status(400).json({ error: 'CPT code and individual price are required' });
  }

  try {
    // Verify package exists and belongs to tenant
    const checkResult = await pool.query(
      `SELECT id FROM service_packages WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service package not found' });
    }

    const itemId = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO service_package_items (
        id, service_package_id, cpt_code, description, quantity, individual_price_cents
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [itemId, id, cptCode, description || null, quantity || 1, individualPriceCents]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding package item:', error);
    res.status(500).json({ error: 'Failed to add package item' });
  }
});

// Remove item from service package
router.delete('/packages/:packageId/items/:itemId', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { packageId, itemId } = req.params;

  try {
    // Verify package exists and belongs to tenant
    const checkResult = await pool.query(
      `SELECT id FROM service_packages WHERE id = $1 AND tenant_id = $2`,
      [packageId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service package not found' });
    }

    await pool.query(
      `DELETE FROM service_package_items WHERE id = $1 AND service_package_id = $2`,
      [itemId, packageId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error removing package item:', error);
    res.status(500).json({ error: 'Failed to remove package item' });
  }
});

// Delete service package
router.delete('/packages/:id', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete items first
    await client.query(
      `DELETE FROM service_package_items WHERE service_package_id = $1`,
      [id]
    );

    // Delete package
    const result = await client.query(
      `DELETE FROM service_packages WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Service package not found' });
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting service package:', error);
    res.status(500).json({ error: 'Failed to delete service package' });
  } finally {
    client.release();
  }
});

// ============================================
// COSMETIC FEE SCHEDULES
// ============================================

// Get all cosmetic procedures with pricing
router.get('/cosmetic/procedures', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { category, feeScheduleId } = req.query;

  try {
    const result = await pool.query(
      `SELECT * FROM get_cosmetic_fees_by_category($1, $2, $3)`,
      [tenantId, category || null, feeScheduleId || null]
    );

    res.json({ procedures: result.rows });
  } catch (error) {
    console.error('Error fetching cosmetic procedures:', error);
    res.status(500).json({ error: 'Failed to fetch cosmetic procedures' });
  }
});

// Get cosmetic procedure categories
router.get('/cosmetic/categories', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM cosmetic_procedure_categories WHERE is_active = true ORDER BY sort_order ASC`
    );

    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Error fetching cosmetic categories:', error);
    res.status(500).json({ error: 'Failed to fetch cosmetic categories' });
  }
});

// Get cosmetic pricing view
router.get('/cosmetic/pricing', requireAuth, async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { category, search } = req.query;

  try {
    let query = `
      SELECT * FROM v_cosmetic_pricing
      WHERE schedule_name IN (
        SELECT name FROM fee_schedules WHERE tenant_id = $1
      )
    `;
    const params: any[] = [tenantId];

    if (category && typeof category === 'string') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (search && typeof search === 'string') {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (LOWER(cpt_description) LIKE $${params.length} OR LOWER(cpt_code) LIKE $${params.length})`;
    }

    query += ` ORDER BY category, subcategory, cpt_description`;

    const result = await pool.query(query, params);

    res.json({ procedures: result.rows });
  } catch (error) {
    console.error('Error fetching cosmetic pricing:', error);
    res.status(500).json({ error: 'Failed to fetch cosmetic pricing' });
  }
});

// Update cosmetic procedure pricing
router.put('/cosmetic/procedures/:cptCode', requireAuth, requireRoles(['admin', 'billing']), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { cptCode } = req.params;
  const {
    feeScheduleId,
    feeCents,
    minPriceCents,
    maxPriceCents,
    cptDescription,
    category,
    subcategory,
    units,
    typicalUnits,
    packageSessions,
    notes
  } = req.body;

  if (!feeScheduleId) {
    return res.status(400).json({ error: 'Fee schedule ID is required' });
  }

  try {
    // Verify ownership
    const checkResult = await pool.query(
      `SELECT * FROM fee_schedules WHERE id = $1 AND tenant_id = $2`,
      [feeScheduleId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fee schedule not found' });
    }

    // Upsert the cosmetic procedure
    const result = await pool.query(
      `INSERT INTO fee_schedule_items (
        id, fee_schedule_id, cpt_code, cpt_description, fee_cents,
        category, subcategory, units, min_price_cents, max_price_cents,
        typical_units, is_cosmetic, package_sessions, notes
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12)
      ON CONFLICT (fee_schedule_id, cpt_code)
      DO UPDATE SET
        cpt_description = $3,
        fee_cents = $4,
        category = $5,
        subcategory = $6,
        units = $7,
        min_price_cents = $8,
        max_price_cents = $9,
        typical_units = $10,
        package_sessions = $11,
        notes = $12,
        is_cosmetic = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        feeScheduleId,
        cptCode,
        cptDescription || null,
        feeCents || 0,
        category || null,
        subcategory || null,
        units || null,
        minPriceCents || null,
        maxPriceCents || null,
        typicalUnits || null,
        packageSessions || null,
        notes || null
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating cosmetic procedure:', error);
    res.status(500).json({ error: 'Failed to update cosmetic procedure' });
  }
});

export default router;
