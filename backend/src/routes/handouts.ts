import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { pool } from '../db/pool';
import { randomUUID } from 'crypto';
import { DEFAULT_HANDOUT_TEMPLATES, InstructionType } from '../data/defaultHandoutTemplates';

const router = Router();
router.use(requireAuth);

const INSTRUCTION_TYPES: InstructionType[] = [
  'general',
  'aftercare',
  'lab_results',
  'prescription_instructions',
  'rash_care',
  'cleansing',
];

const instructionTypeSchema = z.enum(INSTRUCTION_TYPES as [InstructionType, ...InstructionType[]]);

const createHandoutSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  condition: z.string().min(1),
  content: z.string().min(1),
  instructionType: instructionTypeSchema.default('general'),
  templateKey: z.string().trim().min(1).max(120).optional(),
  printDisclaimer: z.string().max(2000).optional(),
  isSystemTemplate: z.boolean().optional().default(false),
  isActive: z.boolean().default(true),
});

const updateHandoutSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  instructionType: instructionTypeSchema.optional(),
  templateKey: z.string().trim().min(1).max(120).optional(),
  printDisclaimer: z.string().max(2000).nullable().optional(),
  isSystemTemplate: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

function toTemplateKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function ensureDefaultHandoutTemplates(tenantId: string, createdBy?: string | null): Promise<void> {
  for (const template of DEFAULT_HANDOUT_TEMPLATES) {
    await pool.query(
      `INSERT INTO patient_handouts (
         id, tenant_id, title, category, condition, content, instruction_type,
         template_key, print_disclaimer, is_system_template, is_active, created_by
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, $10
       WHERE NOT EXISTS (
         SELECT 1
         FROM patient_handouts
         WHERE tenant_id = $2
           AND template_key = $8
       )`,
      [
        randomUUID(),
        tenantId,
        template.title,
        template.category,
        template.condition,
        template.content,
        template.instructionType,
        template.templateKey,
        template.printDisclaimer,
        createdBy || null,
      ],
    );
  }
}

router.get('/meta/instruction-types', (_req, res) => {
  return res.json({
    instructionTypes: INSTRUCTION_TYPES.map((value) => ({
      value,
      label:
        value === 'prescription_instructions'
          ? 'Prescription Instructions'
          : value === 'lab_results'
            ? 'Lab Results'
            : value === 'rash_care'
              ? 'Rash Care'
              : value === 'aftercare'
                ? 'Aftercare'
                : value === 'cleansing'
                  ? 'Cleansing'
                  : 'General',
    })),
  });
});

// Get all handouts
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { category, condition, search, instructionType, isActive } = req.query;

    await ensureDefaultHandoutTemplates(tenantId, req.user?.id);

    let query = 'SELECT * FROM patient_handouts WHERE tenant_id = $1';
    const values: any[] = [tenantId];
    let paramCount = 1;

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      values.push(category);
    }

    if (condition) {
      paramCount++;
      query += ` AND condition ILIKE $${paramCount}`;
      values.push(`%${condition}%`);
    }

    if (search) {
      paramCount++;
      query += ` AND (title ILIKE $${paramCount} OR content ILIKE $${paramCount})`;
      values.push(`%${search}%`);
    }

    if (instructionType && typeof instructionType === 'string') {
      paramCount++;
      query += ` AND instruction_type = $${paramCount}`;
      values.push(instructionType);
    }

    if (typeof isActive === 'string') {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      values.push(isActive === 'true');
    }

    query += ' ORDER BY instruction_type ASC, category ASC, title ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get single handout
router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM patient_handouts WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Handout not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Create handout
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const validated = createHandoutSchema.parse(req.body);

    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO patient_handouts (
        id, tenant_id, title, category, condition, content, instruction_type,
        template_key, print_disclaimer, is_system_template, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        tenantId,
        validated.title,
        validated.category,
        validated.condition,
        validated.content,
        validated.instructionType,
        validated.templateKey || `${toTemplateKey(validated.title)}-${id.slice(0, 8)}`,
        validated.printDisclaimer ||
          'For educational use only. Follow your provider instructions and call with concerns.',
        validated.isSystemTemplate ?? false,
        validated.isActive,
        userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

// Update handout
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const validated = updateHandoutSchema.parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      values.push(validated.title);
    }

    if (validated.category !== undefined) {
      paramCount++;
      updates.push(`category = $${paramCount}`);
      values.push(validated.category);
    }

    if (validated.condition !== undefined) {
      paramCount++;
      updates.push(`condition = $${paramCount}`);
      values.push(validated.condition);
    }

    if (validated.content !== undefined) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      values.push(validated.content);
    }

    if (validated.instructionType !== undefined) {
      paramCount++;
      updates.push(`instruction_type = $${paramCount}`);
      values.push(validated.instructionType);
    }

    if (validated.templateKey !== undefined) {
      paramCount++;
      updates.push(`template_key = $${paramCount}`);
      values.push(validated.templateKey);
    }

    if (validated.printDisclaimer !== undefined) {
      paramCount++;
      updates.push(`print_disclaimer = $${paramCount}`);
      values.push(validated.printDisclaimer);
    }

    if (validated.isSystemTemplate !== undefined) {
      paramCount++;
      updates.push(`is_system_template = $${paramCount}`);
      values.push(validated.isSystemTemplate);
    }

    if (validated.isActive !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(validated.isActive);
    }

    paramCount++;
    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());

    paramCount++;
    values.push(id);
    paramCount++;
    values.push(tenantId);

    const query = `
      UPDATE patient_handouts
      SET ${updates.join(', ')}
      WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Handout not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

// Delete handout
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM patient_handouts WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Handout not found' });
    }

    res.json({ message: 'Handout deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
