import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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

    const id = uuidv4();
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
  const { feeCents, cptDescription } = req.body;

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
      `INSERT INTO fee_schedule_items (id, fee_schedule_id, cpt_code, cpt_description, fee_cents)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (fee_schedule_id, cpt_code)
       DO UPDATE SET fee_cents = $4, cpt_description = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, cptCode, cptDescription || null, feeCents]
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
          `INSERT INTO fee_schedule_items (id, fee_schedule_id, cpt_code, cpt_description, fee_cents)
           VALUES (gen_random_uuid(), $1, $2, $3, $4)
           ON CONFLICT (fee_schedule_id, cpt_code)
           DO UPDATE SET fee_cents = $4, cpt_description = $3, updated_at = CURRENT_TIMESTAMP`,
          [id, item.cptCode, item.description || null, feeCents]
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
      `SELECT cpt_code, cpt_description, fee_cents FROM fee_schedule_items
       WHERE fee_schedule_id = $1 ORDER BY cpt_code ASC`,
      [id]
    );

    // Generate CSV
    let csv = 'CPT Code,Description,Fee\n';
    for (const row of result.rows) {
      const fee = (row.fee_cents / 100).toFixed(2);
      const description = row.cpt_description ? `"${row.cpt_description.replace(/"/g, '""')}"` : '';
      csv += `${row.cpt_code},${description},${fee}\n`;
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

export default router;
