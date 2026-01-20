/**
 * PDMP (Prescription Drug Monitoring Program) Routes
 *
 * Provides PDMP checking for controlled substances including:
 * - State PDMP database checks
 * - Patient flagging for high-risk prescribing patterns
 * - PDMP history tracking
 */

import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';

export const pdmpRouter = Router();

// Mock controlled substance schedules mapping
const CONTROLLED_SUBSTANCES: Record<string, string> = {
  'Hydrocodone': 'Schedule II',
  'Oxycodone': 'Schedule II',
  'Morphine': 'Schedule II',
  'Fentanyl': 'Schedule II',
  'Methylphenidate': 'Schedule II',
  'Amphetamine': 'Schedule II',
  'Codeine': 'Schedule III',
  'Ketamine': 'Schedule III',
  'Testosterone': 'Schedule III',
  'Alprazolam': 'Schedule IV',
  'Lorazepam': 'Schedule IV',
  'Diazepam': 'Schedule IV',
  'Clonazepam': 'Schedule IV',
  'Zolpidem': 'Schedule IV',
  'Tramadol': 'Schedule IV',
  'Carisoprodol': 'Schedule IV',
  'Phentermine': 'Schedule IV',
};

/**
 * POST /api/pdmp/check
 * Check state PDMP database for patient
 */
pdmpRouter.post('/check', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId, medication } = req.body;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required' });
    }

    // Verify patient access
    const patientCheck = await pool.query(
      'SELECT id, first_name, last_name, dob FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientCheck.rows[0];

    // Check if medication is controlled substance
    const medicationName = medication || '';
    let schedule: string | null = null;

    for (const [substance, sched] of Object.entries(CONTROLLED_SUBSTANCES)) {
      if (medicationName.toLowerCase().includes(substance.toLowerCase())) {
        schedule = sched;
        break;
      }
    }

    // Get recent controlled substance prescriptions (mock PDMP data)
    const recentRx = await pool.query(
      `SELECT
        o.id,
        o.details,
        o.created_at,
        p.full_name as provider_name
      FROM orders o
      LEFT JOIN providers p ON o.provider_id = p.id
      WHERE o.patient_id = $1
        AND o.type = 'rx'
        AND o.created_at > NOW() - INTERVAL '6 months'
      ORDER BY o.created_at DESC
      LIMIT 20`,
      [patientId]
    );

    // Generate mock PDMP response with risk analysis
    const controlledRx = recentRx.rows.filter(rx => {
      const details = rx.details || '';
      return Object.keys(CONTROLLED_SUBSTANCES).some(sub =>
        details.toLowerCase().includes(sub.toLowerCase())
      );
    });

    // Risk scoring (mock)
    const riskScore = controlledRx.length > 5 ? 'High' :
                     controlledRx.length > 2 ? 'Moderate' : 'Low';

    const flags: string[] = [];
    if (controlledRx.length > 5) {
      flags.push('Multiple controlled substance prescriptions in 6 months');
    }
    if (controlledRx.length > 3) {
      flags.push('Overlapping controlled substance prescriptions detected');
    }

    // Record PDMP check
    await pool.query(
      `INSERT INTO pdmp_checks
        (tenant_id, patient_id, checked_by_user_id, medication, schedule, risk_score, flags_found)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, patientId, userId, medication, schedule, riskScore, flags.length]
    );

    return res.json({
      checkedAt: new Date().toISOString(),
      patient: {
        id: patient.id,
        name: `${patient.first_name} ${patient.last_name}`,
        dateOfBirth: patient.dob,
      },
      medication: medicationName,
      schedule,
      isControlled: schedule !== null,
      riskScore,
      flags,
      recentControlledSubstances: controlledRx.map(rx => ({
        medication: rx.details?.split('\n')[0] || 'Unknown',
        prescriber: rx.provider_name,
        date: rx.created_at,
      })),
      totalControlledRxLast6Months: controlledRx.length,
      pdmpState: 'CA', // Mock state
    });
  } catch (error) {
    console.error('Error checking PDMP:', error);
    return res.status(500).json({ error: 'Failed to check PDMP' });
  }
});

/**
 * GET /api/pdmp/patients/:patientId/last-check
 * Get last PDMP check for patient
 */
pdmpRouter.get('/patients/:patientId/last-check', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        pc.*,
        u.full_name as checked_by_name
      FROM pdmp_checks pc
      LEFT JOIN users u ON pc.checked_by_user_id = u.id
      WHERE pc.patient_id = $1
        AND pc.tenant_id = $2
      ORDER BY pc.checked_at DESC
      LIMIT 1`,
      [patientId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.json({ lastCheck: null });
    }

    return res.json({ lastCheck: result.rows[0] });
  } catch (error) {
    console.error('Error fetching last PDMP check:', error);
    return res.status(500).json({ error: 'Failed to fetch last PDMP check' });
  }
});

/**
 * GET /api/pdmp/patients/:patientId/history
 * Get PDMP check history for patient
 */
pdmpRouter.get('/patients/:patientId/history', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        pc.*,
        u.full_name as checked_by_name
      FROM pdmp_checks pc
      LEFT JOIN users u ON pc.checked_by_user_id = u.id
      WHERE pc.patient_id = $1
        AND pc.tenant_id = $2
      ORDER BY pc.checked_at DESC
      LIMIT 50`,
      [patientId, tenantId]
    );

    return res.json({
      checks: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching PDMP history:', error);
    return res.status(500).json({ error: 'Failed to fetch PDMP history' });
  }
});
