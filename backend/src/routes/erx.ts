/**
 * E-Prescribing (eRx) Routes
 *
 * Comprehensive e-prescribing functionality including:
 * - Drug database search with autocomplete
 * - Pharmacy lookup and search
 * - Patient medication history
 * - Drug interaction checking
 * - Formulary checking
 */

import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { getRxHistory, checkFormulary, getPatientBenefits } from '../services/surescriptsService';
import {
  checkDrugDrugInteractions,
  checkDrugAllergyInteractions,
  comprehensiveSafetyCheck,
} from '../services/drugInteractionService';

export const erxRouter = Router();

// ============================================================================
// Drug Database Search
// ============================================================================

/**
 * GET /api/erx/drugs/search - Search drug database with autocomplete
 * Query params:
 *   - q: search query (medication name)
 *   - category: filter by category (optional)
 *   - limit: max results (default 20)
 */
erxRouter.get('/drugs/search', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { q, category, limit = '20' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters',
      });
    }

    let query = `
      SELECT
        id,
        name,
        generic_name,
        brand_name,
        strength,
        dosage_form,
        route,
        category,
        is_controlled,
        dea_schedule,
        typical_sig,
        ndc,
        manufacturer
      FROM medications
      WHERE (
        name ILIKE $1
        OR generic_name ILIKE $1
        OR brand_name ILIKE $1
      )
    `;

    const params: any[] = [`%${q}%`];
    let paramIndex = 2;

    if (category && typeof category === 'string') {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    query += ` ORDER BY
      CASE
        WHEN name ILIKE $${paramIndex} THEN 1
        WHEN generic_name ILIKE $${paramIndex} THEN 2
        WHEN brand_name ILIKE $${paramIndex} THEN 3
        ELSE 4
      END,
      name
      LIMIT $${paramIndex + 1}
    `;

    const parsedLimit = parseInt(limit as string, 10);
    const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 20;
    const cappedLimit = Math.min(Math.max(safeLimit, 1), 100);
    params.push(`${q}%`, cappedLimit);

    const result = await pool.query(query, params);

    return res.json({
      drugs: result.rows,
      count: result.rows.length,
      query: q,
    });
  } catch (error) {
    console.error('Error searching drugs:', error);
    return res.status(500).json({ error: 'Failed to search drugs' });
  }
});

/**
 * GET /api/erx/drugs/:id - Get detailed drug information
 */
erxRouter.get('/drugs/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM medications WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Drug not found' });
    }

    return res.json({ drug: result.rows[0] });
  } catch (error) {
    console.error('Error fetching drug:', error);
    return res.status(500).json({ error: 'Failed to fetch drug' });
  }
});

/**
 * GET /api/erx/drugs/categories - Get all drug categories
 */
erxRouter.get('/drugs/list/categories', requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category
       FROM medications
       WHERE category IS NOT NULL
       ORDER BY category`
    );

    return res.json({
      categories: result.rows.map(r => r.category),
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// ============================================================================
// Pharmacy Search
// ============================================================================

/**
 * GET /api/erx/pharmacies/search - Search pharmacies
 * Query params:
 *   - q: search query (name, chain, ncpdp)
 *   - city, state, zip: location filters
 *   - lat, lon, radius: proximity search
 */
erxRouter.get('/pharmacies/search', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { q, city, state, zip, lat, lon, radius } = req.query;

    // Proximity search if lat/lon provided
    if (lat && lon) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lon as string);
      const radiusMiles = radius ? parseFloat(radius as string) : 10;

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
        [latitude, longitude, radiusMiles]
      );

      return res.json({
        pharmacies: result.rows,
        count: result.rows.length,
        searchType: 'proximity',
      });
    }

    // Text/location search
    let query = `
      SELECT *
      FROM pharmacies
      WHERE surescripts_enabled = true
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (q && typeof q === 'string') {
      query += ` AND (
        name ILIKE $${paramIndex}
        OR chain ILIKE $${paramIndex}
        OR ncpdp_id = $${paramIndex + 1}
      )`;
      params.push(`%${q}%`, q);
      paramIndex += 2;
    }

    if (city && typeof city === 'string') {
      query += ` AND city ILIKE $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }

    if (state && typeof state === 'string') {
      query += ` AND state = $${paramIndex}`;
      params.push(state.toUpperCase());
      paramIndex++;
    }

    if (zip && typeof zip === 'string') {
      query += ` AND zip = $${paramIndex}`;
      params.push(zip);
      paramIndex++;
    }

    query += ` ORDER BY is_preferred DESC, chain, name LIMIT 50`;

    const result = await pool.query(query, params);

    return res.json({
      pharmacies: result.rows,
      count: result.rows.length,
      searchType: 'text',
    });
  } catch (error) {
    console.error('Error searching pharmacies:', error);
    return res.status(500).json({ error: 'Failed to search pharmacies' });
  }
});

/**
 * GET /api/erx/pharmacies/preferred - Get preferred pharmacies
 */
erxRouter.get('/pharmacies/preferred', requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM pharmacies
       WHERE is_preferred = true
         AND surescripts_enabled = true
       ORDER BY chain, name
       LIMIT 20`
    );

    return res.json({
      pharmacies: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching preferred pharmacies:', error);
    return res.status(500).json({ error: 'Failed to fetch preferred pharmacies' });
  }
});

/**
 * GET /api/erx/pharmacies/ncpdp/:ncpdpId - Get pharmacy by NCPDP ID
 */
erxRouter.get('/pharmacies/ncpdp/:ncpdpId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { ncpdpId } = req.params;

    const result = await pool.query(
      `SELECT * FROM pharmacies WHERE ncpdp_id = $1`,
      [ncpdpId]
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

// ============================================================================
// Patient Medication History
// ============================================================================

/**
 * GET /api/erx/patients/:patientId/medication-history
 * Get comprehensive medication history from all sources
 */
erxRouter.get(
  '/patients/:patientId/medication-history',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const { source } = req.query;

      // Verify patient access
      const patientCheck = await pool.query(
        'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
        [patientId, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Get prescription history from this system
      const prescriptions = await pool.query(
        `SELECT
          p.*,
          prov.full_name as provider_name,
          pharm.name as pharmacy_name,
          pharm.ncpdp_id as pharmacy_ncpdp
        FROM prescriptions p
        LEFT JOIN providers prov ON p.provider_id = prov.id
        LEFT JOIN pharmacies pharm ON p.pharmacy_id = pharm.id
        WHERE p.patient_id = $1
          AND p.tenant_id = $2
        ORDER BY p.created_at DESC
        LIMIT 100`,
        [patientId, tenantId]
      );

      // Get Rx history from external sources (Surescripts)
      let externalHistory = { medications: [] };
      if (!source || source === 'all' || source === 'external') {
        try {
          externalHistory = await getRxHistory(patientId, tenantId);
        } catch (error) {
          console.error('Error fetching external Rx history:', error);
        }
      }

      return res.json({
        prescriptions: prescriptions.rows,
        externalHistory: externalHistory.medications,
        combinedCount: prescriptions.rows.length + externalHistory.medications.length,
      });
    } catch (error) {
      console.error('Error fetching medication history:', error);
      return res.status(500).json({ error: 'Failed to fetch medication history' });
    }
  }
);

/**
 * GET /api/erx/patients/:patientId/current-medications
 * Get current active medications only
 */
erxRouter.get(
  '/patients/:patientId/current-medications',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        `SELECT
          p.*,
          prov.full_name as provider_name,
          pharm.name as pharmacy_name
        FROM prescriptions p
        LEFT JOIN providers prov ON p.provider_id = prov.id
        LEFT JOIN pharmacies pharm ON p.pharmacy_id = pharm.id
        WHERE p.patient_id = $1
          AND p.tenant_id = $2
          AND p.status IN ('pending', 'sent', 'transmitted')
          AND (p.created_at > CURRENT_DATE - INTERVAL '6 months' OR p.refills > 0)
        ORDER BY p.created_at DESC`,
        [patientId, tenantId]
      );

      return res.json({
        medications: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching current medications:', error);
      return res.status(500).json({ error: 'Failed to fetch current medications' });
    }
  }
);

// ============================================================================
// Drug Safety Checks
// ============================================================================

/**
 * POST /api/erx/check-interactions
 * Check for drug-drug interactions
 */
erxRouter.post('/check-interactions', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { medicationName, patientId } = req.body;
    const tenantId = req.user!.tenantId;

    if (!medicationName || !patientId) {
      return res.status(400).json({
        error: 'medicationName and patientId are required',
      });
    }

    const interactions = await checkDrugDrugInteractions(
      medicationName,
      patientId,
      tenantId
    );

    return res.json({
      interactions,
      count: interactions.length,
      hasSevere: interactions.some(i => i.severity === 'severe'),
    });
  } catch (error) {
    console.error('Error checking interactions:', error);
    return res.status(500).json({ error: 'Failed to check interactions' });
  }
});

/**
 * POST /api/erx/check-allergies
 * Check for drug-allergy interactions
 */
erxRouter.post('/check-allergies', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { medicationName, patientId } = req.body;
    const tenantId = req.user!.tenantId;

    if (!medicationName || !patientId) {
      return res.status(400).json({
        error: 'medicationName and patientId are required',
      });
    }

    const allergies = await checkDrugAllergyInteractions(
      medicationName,
      patientId,
      tenantId
    );

    return res.json({
      allergies,
      count: allergies.length,
      hasAllergy: allergies.length > 0,
    });
  } catch (error) {
    console.error('Error checking allergies:', error);
    return res.status(500).json({ error: 'Failed to check allergies' });
  }
});

/**
 * POST /api/erx/safety-check
 * Comprehensive safety check (interactions + allergies)
 */
erxRouter.post('/safety-check', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { medicationName, patientId } = req.body;
    const tenantId = req.user!.tenantId;

    if (!medicationName || !patientId) {
      return res.status(400).json({
        error: 'medicationName and patientId are required',
      });
    }

    const safetyCheck = await comprehensiveSafetyCheck(
      medicationName,
      patientId,
      tenantId
    );

    return res.json(safetyCheck);
  } catch (error) {
    console.error('Error performing safety check:', error);
    return res.status(500).json({ error: 'Failed to perform safety check' });
  }
});

/**
 * POST /api/erx/check-formulary
 * Check insurance formulary coverage
 */
erxRouter.post('/check-formulary', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { medicationName, ndc, payerId } = req.body;

    if (!medicationName) {
      return res.status(400).json({ error: 'medicationName is required' });
    }

    const formularyResult = await checkFormulary(medicationName, payerId, ndc);

    return res.json(formularyResult);
  } catch (error) {
    console.error('Error checking formulary:', error);
    return res.status(500).json({ error: 'Failed to check formulary' });
  }
});

/**
 * GET /api/erx/patients/:patientId/benefits
 * Get patient pharmacy benefits
 */
erxRouter.get(
  '/patients/:patientId/benefits',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      // Verify patient
      const patientCheck = await pool.query(
        'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
        [patientId, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const benefits = await getPatientBenefits(patientId, tenantId);

      if (!benefits) {
        return res.status(404).json({
          error: 'No pharmacy benefits found for patient',
        });
      }

      return res.json(benefits);
    } catch (error) {
      console.error('Error fetching patient benefits:', error);
      return res.status(500).json({ error: 'Failed to fetch patient benefits' });
    }
  }
);

// ============================================================================
// Patient Allergies Management
// ============================================================================

/**
 * GET /api/erx/patients/:patientId/allergies
 * Get patient allergies
 */
erxRouter.get(
  '/patients/:patientId/allergies',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        `SELECT * FROM patient_allergies
         WHERE patient_id = $1
           AND tenant_id = $2
           AND status = 'active'
         ORDER BY severity DESC, allergen`,
        [patientId, tenantId]
      );

      return res.json({
        allergies: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching allergies:', error);
      return res.status(500).json({ error: 'Failed to fetch allergies' });
    }
  }
);
