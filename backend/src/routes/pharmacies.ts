import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

export const pharmaciesRouter = Router();

// Validation schemas
const createPharmacySchema = z.object({
  ncpdpId: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  fax: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  isPreferred: z.boolean().optional().default(false),
  is24Hour: z.boolean().optional().default(false),
  acceptsErx: z.boolean().optional().default(true),
});

const updatePharmacySchema = createPharmacySchema.partial();

// GET /api/pharmacies/search - Enhanced search pharmacies
pharmaciesRouter.get('/search', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { query: searchQuery, city, state, zip, chain, preferred, ncpdpId } = req.query;

    let query = 'select * from pharmacies where 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (searchQuery && typeof searchQuery === 'string') {
      query += ` and (name ilike $${paramIndex} or ncpdp_id = $${paramIndex} or chain ilike $${paramIndex})`;
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    if (ncpdpId && typeof ncpdpId === 'string') {
      query += ` and ncpdp_id = $${paramIndex}`;
      params.push(ncpdpId);
      paramIndex++;
    }

    if (city && typeof city === 'string') {
      query += ` and city ilike $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }

    if (state && typeof state === 'string') {
      query += ` and state = $${paramIndex}`;
      params.push(state.toUpperCase());
      paramIndex++;
    }

    if (zip && typeof zip === 'string') {
      query += ` and zip = $${paramIndex}`;
      params.push(zip);
      paramIndex++;
    }

    if (chain && typeof chain === 'string') {
      query += ` and chain ilike $${paramIndex}`;
      params.push(`%${chain}%`);
      paramIndex++;
    }

    if (preferred === 'true') {
      query += ` and is_preferred = true`;
    }

    query += ' and surescripts_enabled = true';
    query += ' order by is_preferred desc, chain, name limit 100';

    const result = await pool.query(query, params);

    return res.json({ pharmacies: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Error searching pharmacies:', error);
    return res.status(500).json({ error: 'Failed to search pharmacies' });
  }
});

// GET /api/pharmacies/nearby - Find pharmacies near a location
pharmaciesRouter.get('/nearby', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { latitude, longitude, radius, city, state, zip } = req.query;

    let pharmacies: any[] = [];

    if (latitude && longitude) {
      // Use lat/long for distance calculation
      const lat = parseFloat(latitude as string);
      const lon = parseFloat(longitude as string);
      const radiusMiles = radius ? parseFloat(radius as string) : 10;

      // Haversine formula for distance calculation
      const result = await pool.query(
        `SELECT *,
          (3959 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )) AS distance
        FROM pharmacies
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND surescripts_enabled = true
        HAVING distance < $3
        ORDER BY distance, is_preferred DESC
        LIMIT 50`,
        [lat, lon, radiusMiles]
      );

      pharmacies = result.rows;
    } else if (city && state) {
      // Search by city/state
      const result = await pool.query(
        `SELECT * FROM pharmacies
         WHERE city ILIKE $1
           AND state = $2
           AND surescripts_enabled = true
         ORDER BY is_preferred DESC, name
         LIMIT 50`,
        [`%${city}%`, state]
      );

      pharmacies = result.rows;
    } else if (zip) {
      // Search by ZIP code
      const result = await pool.query(
        `SELECT * FROM pharmacies
         WHERE zip = $1
           AND surescripts_enabled = true
         ORDER BY is_preferred DESC, name
         LIMIT 50`,
        [zip]
      );

      pharmacies = result.rows;
    } else {
      return res.status(400).json({
        error: 'Must provide either latitude/longitude, city/state, or zip code',
      });
    }

    return res.json({
      pharmacies,
      total: pharmacies.length,
      searchCriteria: { latitude, longitude, radius, city, state, zip },
    });
  } catch (error) {
    console.error('Error finding nearby pharmacies:', error);
    return res.status(500).json({ error: 'Failed to find nearby pharmacies' });
  }
});

// GET /api/pharmacies - List/search pharmacies (legacy endpoint)
pharmaciesRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { search, city, state, zip, preferred } = req.query;

    let query = 'select * from pharmacies where 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search && typeof search === 'string') {
      query += ` and (name ilike $${paramIndex} or ncpdp_id = $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (city && typeof city === 'string') {
      query += ` and city ilike $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }

    if (state && typeof state === 'string') {
      query += ` and state = $${paramIndex}`;
      params.push(state);
      paramIndex++;
    }

    if (zip && typeof zip === 'string') {
      query += ` and zip = $${paramIndex}`;
      params.push(zip);
      paramIndex++;
    }

    if (preferred === 'true') {
      query += ` and is_preferred = true`;
    }

    query += ' order by is_preferred desc, name limit 50';

    const result = await pool.query(query, params);

    return res.json({ pharmacies: result.rows });
  } catch (error) {
    console.error('Error fetching pharmacies:', error);
    return res.status(500).json({ error: 'Failed to fetch pharmacies' });
  }
});

// GET /api/pharmacies/preferred - Get preferred pharmacies
pharmaciesRouter.get('/list/preferred', requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      'select * from pharmacies where is_preferred = true order by name'
    );

    return res.json({ pharmacies: result.rows });
  } catch (error) {
    console.error('Error fetching preferred pharmacies:', error);
    return res.status(500).json({ error: 'Failed to fetch preferred pharmacies' });
  }
});

// GET /api/pharmacies/ncpdp/:ncpdpId - Get pharmacy by NCPDP ID
pharmaciesRouter.get('/ncpdp/:ncpdpId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { ncpdpId } = req.params;

    const result = await pool.query(
      'select * from pharmacies where ncpdp_id = $1',
      [ncpdpId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    return res.json({ pharmacy: result.rows[0] });
  } catch (error) {
    console.error('Error fetching pharmacy by NCPDP:', error);
    return res.status(500).json({ error: 'Failed to fetch pharmacy' });
  }
});

// GET /api/pharmacies/:id - Get single pharmacy
pharmaciesRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'select * from pharmacies where id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    return res.json({ pharmacy: result.rows[0] });
  } catch (error) {
    console.error('Error fetching pharmacy:', error);
    return res.status(500).json({ error: 'Failed to fetch pharmacy' });
  }
});

// POST /api/pharmacies - Add new pharmacy
pharmaciesRouter.post(
  '/',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createPharmacySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const data = parsed.data;
      const id = crypto.randomUUID();

      await pool.query(
        `insert into pharmacies(
          id, ncpdp_id, name, phone, fax, street, city, state, zip,
          is_preferred, is_24_hour, accepts_erx
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          data.ncpdpId || null,
          data.name,
          data.phone || null,
          data.fax || null,
          data.street || null,
          data.city || null,
          data.state || null,
          data.zip || null,
          data.isPreferred,
          data.is24Hour,
          data.acceptsErx,
        ]
      );

      return res.status(201).json({ id });
    } catch (error) {
      console.error('Error creating pharmacy:', error);
      return res.status(500).json({ error: 'Failed to create pharmacy' });
    }
  }
);

// PUT /api/pharmacies/:id - Update pharmacy
pharmaciesRouter.put(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = updatePharmacySchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const data = parsed.data;

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          updates.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const query = `
        UPDATE pharmacies
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pharmacy not found' });
      }

      return res.json({ success: true, id });
    } catch (error) {
      console.error('Error updating pharmacy:', error);
      return res.status(500).json({ error: 'Failed to update pharmacy' });
    }
  }
);

// DELETE /api/pharmacies/:id - Delete pharmacy
pharmaciesRouter.delete(
  '/:id',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;

      // Check if pharmacy is used in any prescriptions
      const usageCheck = await pool.query(
        'select count(*) as count from prescriptions where pharmacy_id = $1',
        [id]
      );

      if (parseInt(usageCheck.rows[0].count) > 0) {
        return res.status(400).json({
          error: 'Cannot delete pharmacy that is referenced in prescriptions',
        });
      }

      const result = await pool.query(
        'delete from pharmacies where id = $1 returning id',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pharmacy not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting pharmacy:', error);
      return res.status(500).json({ error: 'Failed to delete pharmacy' });
    }
  }
);
