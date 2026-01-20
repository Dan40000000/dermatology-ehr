import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const vitalsRouter = Router();

/**
 * @swagger
 * /api/vitals:
 *   get:
 *     summary: List vitals
 *     description: Retrieve vital signs records, optionally filtered by patient ID (limited to 200, ordered by recorded date).
 *     tags:
 *       - Vitals
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by patient ID
 *     responses:
 *       200:
 *         description: List of vital signs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vitals:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       patientId:
 *                         type: string
 *                         format: uuid
 *                       encounterId:
 *                         type: string
 *                         format: uuid
 *                       heightCm:
 *                         type: number
 *                       weightKg:
 *                         type: number
 *                       bpSystolic:
 *                         type: integer
 *                       bpDiastolic:
 *                         type: integer
 *                       pulse:
 *                         type: integer
 *                       tempC:
 *                         type: number
 *                       respiratoryRate:
 *                         type: integer
 *                       o2Saturation:
 *                         type: integer
 *                       recordedById:
 *                         type: string
 *                         format: uuid
 *                       recordedAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
vitalsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const patientId = req.query.patientId as string | undefined;

  let query = `
    select id, patient_id as "patientId", encounter_id as "encounterId",
           height_cm as "heightCm", weight_kg as "weightKg",
           bp_systolic as "bpSystolic", bp_diastolic as "bpDiastolic",
           pulse, temp_c as "tempC", respiratory_rate as "respiratoryRate",
           o2_saturation as "o2Saturation", recorded_by_id as "recordedById",
           recorded_at as "recordedAt", created_at as "createdAt"
    from vitals
    where tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (patientId) {
    query += ` and patient_id = $2`;
    params.push(patientId);
  }

  query += ` order by recorded_at desc, created_at desc limit 200`;

  const result = await pool.query(query, params);
  res.json({ vitals: result.rows });
});
