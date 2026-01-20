import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { PhotoService } from '../services/photoService';

/**
 * Patient Photos API
 *
 * Endpoints for managing clinical photos, before/after comparisons,
 * and treatment progress tracking.
 */

// Body regions enum
const BODY_REGIONS = [
  'face',
  'chest',
  'back',
  'arm_left',
  'arm_right',
  'leg_left',
  'leg_right',
  'hand_left',
  'hand_right',
  'foot_left',
  'foot_right',
  'abdomen',
  'neck',
  'scalp',
  'shoulder_left',
  'shoulder_right',
  'other',
] as const;

const PHOTO_TYPES = [
  'clinical',
  'cosmetic',
  'baseline',
  'followup',
  'consent',
  'dermoscopic',
  'other',
] as const;

// Validation schemas
const uploadPhotoSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  lesionId: z.string().optional(),
  bodyRegion: z.enum(BODY_REGIONS),
  photoType: z.enum(PHOTO_TYPES).default('clinical'),
  viewAngle: z.string().optional(),
  comparisonGroup: z.string().optional(),
  isBaseline: z.boolean().default(false),
  treatmentPhase: z.string().optional(),
  notes: z.string().optional(),
  clinicalFindings: z.string().optional(),
  shareWithPatient: z.boolean().default(false),
  lightingConditions: z.enum(['good', 'poor', 'flash', 'natural']).optional(),
  bodyMapMarkerId: z.string().optional(),
  xPosition: z.number().min(0).max(100).optional(),
  yPosition: z.number().min(0).max(100).optional(),
  bodyView: z.enum(['front', 'back', 'head-front', 'head-back', 'left-side', 'right-side']).optional(),
});

const updatePhotoSchema = z.object({
  bodyRegion: z.enum(BODY_REGIONS).optional(),
  photoType: z.enum(PHOTO_TYPES).optional(),
  viewAngle: z.string().optional(),
  comparisonGroup: z.string().optional(),
  isBaseline: z.boolean().optional(),
  treatmentPhase: z.string().optional(),
  notes: z.string().optional(),
  clinicalFindings: z.string().optional(),
  shareWithPatient: z.boolean().optional(),
  annotations: z.any().optional(),
  bodyMapMarkerId: z.string().optional(),
  xPosition: z.number().min(0).max(100).optional(),
  yPosition: z.number().min(0).max(100).optional(),
  bodyView: z.enum(['front', 'back', 'head-front', 'head-back', 'left-side', 'right-side']).optional(),
});

const createComparisonSchema = z.object({
  patientId: z.string().uuid(),
  beforePhotoId: z.string().uuid(),
  afterPhotoId: z.string().uuid(),
  comparisonType: z.enum(['side_by_side', 'slider', 'overlay']).default('side_by_side'),
  comparisonCategory: z.enum(['treatment_progress', 'lesion_evolution', 'cosmetic_result', 'post_procedure', 'side_effect_monitoring']).optional(),
  bodyRegion: z.enum(BODY_REGIONS).optional(),
  treatmentDescription: z.string().optional(),
  treatmentStartDate: z.string().optional(),
  treatmentEndDate: z.string().optional(),
  improvementScore: z.number().min(0).max(10).optional(),
  improvementNotes: z.string().optional(),
  notes: z.string().optional(),
});

const linkPhotoToBodyMapSchema = z.object({
  bodyMapMarkerId: z.string().optional(),
  lesionId: z.string().optional(),
  xPosition: z.number().min(0).max(100),
  yPosition: z.number().min(0).max(100),
  bodyView: z.enum(['front', 'back', 'head-front', 'head-back', 'left-side', 'right-side']),
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and HEIC allowed.'));
    }
  },
});

export const photosRouter = Router();

/**
 * GET /api/photos
 * List all photos with optional filtering by patientId, photoType, bodyLocation
 */
photosRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, photoType, bodyLocation } = req.query;

    let query = `
      SELECT
        p.id,
        p.patient_id as "patientId",
        p.tenant_id as "tenantId",
        p.encounter_id as "encounterId",
        p.lesion_id as "lesionId",
        p.filename,
        p.mime_type as "mimeType",
        p.file_size as "fileSize",
        p.body_region as "bodyRegion",
        p.body_location as "bodyLocation",
        p.photo_type as "photoType",
        p.url,
        p.description,
        p.category,
        p.annotations,
        p.created_at as "createdAt",
        pt.first_name || ' ' || pt.last_name as "patientName"
      FROM photos p
      LEFT JOIN patients pt ON p.patient_id = pt.id
      WHERE p.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND p.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (photoType) {
      query += ` AND p.photo_type = $${paramIndex}`;
      params.push(photoType);
      paramIndex++;
    }

    if (bodyLocation) {
      query += ` AND (p.body_location = $${paramIndex} OR p.body_region = $${paramIndex})`;
      params.push(bodyLocation);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    res.json({ photos: result.rows });
  } catch (error: any) {
    console.error('Error fetching photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Helper: Log photo access for HIPAA compliance
async function logPhotoAccess(
  photoId: string,
  tenantId: string,
  userId: string,
  action: string,
  req: AuthedRequest,
): Promise<void> {
  const ipAddress = req.ip || req.socket.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  await pool.query(
    `INSERT INTO photo_access_log (id, tenant_id, photo_id, user_id, action, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [crypto.randomUUID(), tenantId, photoId, userId, action, ipAddress, userAgent],
  );
}

/**
 * POST /api/patients/:patientId/photos
 * Upload one or more photos for a patient
 */
photosRouter.post(
  '/patients/:patientId/photos',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse']),
  upload.array('photos', 10), // Max 10 photos at once
  async (req: AuthedRequest, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Parse metadata from form data
      const metadata = uploadPhotoSchema.parse({
        patientId,
        ...JSON.parse(req.body.metadata || '{}'),
      });

      // Verify patient belongs to tenant
      const patientCheck = await pool.query(
        'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
        [patientId, tenantId],
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Process each photo
      const uploadedPhotos = [];

      for (const file of files) {
        // Validate file
        const validation = PhotoService.validateImageFile(file.mimetype, file.size);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        // Process image
        const processed = await PhotoService.processPhoto(
          file.buffer,
          tenantId!,
          patientId!,
          file.originalname,
        );

        // Store in database
        const photoId = crypto.randomUUID();
        const result = await pool.query(
          `INSERT INTO patient_photos (
            id, tenant_id, patient_id, encounter_id, lesion_id,
            file_path, thumbnail_path, original_filename,
            file_size_bytes, mime_type, width, height,
            body_region, photo_type, view_angle,
            taken_by, comparison_group, is_baseline, treatment_phase,
            notes, clinical_findings, share_with_patient, lighting_conditions,
            metadata_stripped,
            body_map_marker_id, x_position, y_position, body_view
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
          ) RETURNING *`,
          [
            photoId,
            tenantId,
            patientId,
            metadata.encounterId || null,
            metadata.lesionId || null,
            processed.filePath,
            processed.thumbnailPath,
            file.originalname,
            processed.compressedSize,
            file.mimetype,
            processed.metadata.width,
            processed.metadata.height,
            metadata.bodyRegion,
            metadata.photoType,
            metadata.viewAngle || null,
            userId,
            metadata.comparisonGroup || null,
            metadata.isBaseline,
            metadata.treatmentPhase || null,
            metadata.notes || null,
            metadata.clinicalFindings || null,
            metadata.shareWithPatient,
            metadata.lightingConditions || null,
            true, // EXIF data is stripped by PhotoService
            metadata.bodyMapMarkerId || null,
            metadata.xPosition || null,
            metadata.yPosition || null,
            metadata.bodyView || null,
          ],
        );

        // Log access
        await logPhotoAccess(photoId, tenantId, userId, 'uploaded', req);

        uploadedPhotos.push(result.rows[0]);
      }

      res.json({
        success: true,
        photos: uploadedPhotos,
        count: uploadedPhotos.length,
      });
    } catch (err) {
      console.error('Error uploading photos:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid metadata', details: err.issues });
      }
      res.status(500).json({ error: 'Failed to upload photos' });
    }
  },
);

/**
 * GET /api/patients/:patientId/photos
 * List all photos for a patient with filtering
 */
photosRouter.get(
  '/patients/:patientId/photos',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const {
        bodyRegion,
        photoType,
        comparisonGroup,
        startDate,
        endDate,
        isBaseline,
        limit = '100',
        offset = '0',
      } = req.query;

      let query = `
        SELECT
          p.*,
          u.name as taken_by_name
        FROM patient_photos p
        LEFT JOIN users u ON p.taken_by = u.id
        WHERE p.patient_id = $1 AND p.tenant_id = $2 AND p.is_deleted = FALSE
      `;
      const params: any[] = [patientId, tenantId];
      let paramCount = 2;

      if (bodyRegion) {
        paramCount++;
        query += ` AND p.body_region = $${paramCount}`;
        params.push(bodyRegion);
      }

      if (photoType) {
        paramCount++;
        query += ` AND p.photo_type = $${paramCount}`;
        params.push(photoType);
      }

      if (comparisonGroup) {
        paramCount++;
        query += ` AND p.comparison_group = $${paramCount}`;
        params.push(comparisonGroup);
      }

      if (isBaseline === 'true') {
        query += ` AND p.is_baseline = TRUE`;
      }

      if (startDate) {
        paramCount++;
        query += ` AND p.taken_at >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        query += ` AND p.taken_at <= $${paramCount}`;
        params.push(endDate);
      }

      query += ` ORDER BY p.taken_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM patient_photos
         WHERE patient_id = $1 AND tenant_id = $2 AND is_deleted = FALSE`,
        [patientId, tenantId],
      );

      res.json({
        photos: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (err) {
      console.error('Error fetching photos:', err);
      res.status(500).json({ error: 'Failed to fetch photos' });
    }
  },
);

/**
 * GET /api/patients/:patientId/photos/:photoId
 * Get a single photo
 */
photosRouter.get(
  '/patients/:patientId/photos/:photoId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, photoId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const result = await pool.query(
        `SELECT p.*, u.name as taken_by_name
         FROM patient_photos p
         LEFT JOIN users u ON p.taken_by = u.id
         WHERE p.id = $1 AND p.patient_id = $2 AND p.tenant_id = $3 AND p.is_deleted = FALSE`,
        [photoId, patientId, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Log access
      await logPhotoAccess(photoId!, tenantId!, userId!, 'viewed', req);

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching photo:', err);
      res.status(500).json({ error: 'Failed to fetch photo' });
    }
  },
);

/**
 * PUT /api/patients/:patientId/photos/:photoId
 * Update photo metadata
 */
photosRouter.put(
  '/patients/:patientId/photos/:photoId',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, photoId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const updates = updatePhotoSchema.parse(req.body);

      // Build dynamic update query
      const updateFields = [];
      const values = [];
      let paramCount = 0;

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          paramCount++;
          // Convert camelCase to snake_case
          const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          updateFields.push(`${dbKey} = $${paramCount}`);
          values.push(value);
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      paramCount++;
      values.push(photoId);
      paramCount++;
      values.push(patientId);
      paramCount++;
      values.push(tenantId);

      const query = `
        UPDATE patient_photos
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount - 2} AND patient_id = $${paramCount - 1}
          AND tenant_id = $${paramCount} AND is_deleted = FALSE
        RETURNING *
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Log access
      await logPhotoAccess(photoId!, tenantId!, userId!, 'modified', req);

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error updating photo:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: err.issues });
      }
      res.status(500).json({ error: 'Failed to update photo' });
    }
  },
);

/**
 * DELETE /api/patients/:patientId/photos/:photoId
 * Soft delete a photo
 */
photosRouter.delete(
  '/patients/:patientId/photos/:photoId',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, photoId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const result = await pool.query(
        `UPDATE patient_photos
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1
         WHERE id = $2 AND patient_id = $3 AND tenant_id = $4
         RETURNING *`,
        [userId, photoId, patientId, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Log access
      await logPhotoAccess(photoId!, tenantId!, userId!, 'deleted', req);

      res.json({ success: true, message: 'Photo deleted' });
    } catch (err) {
      console.error('Error deleting photo:', err);
      res.status(500).json({ error: 'Failed to delete photo' });
    }
  },
);

/**
 * GET /api/patients/:patientId/photos/timeline/:bodyRegion
 * Get timeline of photos for a specific body region
 */
photosRouter.get(
  '/patients/:patientId/photos/timeline/:bodyRegion',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, bodyRegion } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        `SELECT
          p.*,
          u.name as taken_by_name,
          e.appointment_date as encounter_date
         FROM patient_photos p
         LEFT JOIN users u ON p.taken_by = u.id
         LEFT JOIN encounters e ON p.encounter_id = e.id
         WHERE p.patient_id = $1 AND p.tenant_id = $2
           AND p.body_region = $3 AND p.is_deleted = FALSE
         ORDER BY p.taken_at ASC`,
        [patientId, tenantId, bodyRegion],
      );

      res.json({
        bodyRegion,
        timeline: result.rows,
        count: result.rows.length,
      });
    } catch (err) {
      console.error('Error fetching timeline:', err);
      res.status(500).json({ error: 'Failed to fetch timeline' });
    }
  },
);

/**
 * POST /api/patients/:patientId/photos/compare
 * Create a before/after comparison (legacy endpoint, forwards to /comparisons/create)
 * @deprecated Use /api/patients/:patientId/photos/comparisons/create instead
 */
photosRouter.post(
  '/patients/:patientId/photos/compare',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const data = createComparisonSchema.parse(req.body);

      // Verify both photos exist and belong to patient
      const photosCheck = await pool.query(
        `SELECT id, file_path, body_region FROM patient_photos
         WHERE id = ANY($1) AND patient_id = $2 AND tenant_id = $3 AND is_deleted = FALSE`,
        [[data.beforePhotoId, data.afterPhotoId], patientId, tenantId],
      );

      if (photosCheck.rows.length !== 2) {
        return res.status(404).json({ error: 'One or both photos not found' });
      }

      const beforePhoto = photosCheck.rows.find((p) => p.id === data.beforePhotoId);
      const afterPhoto = photosCheck.rows.find((p) => p.id === data.afterPhotoId);

      // Generate comparison image
      const comparisonImagePath = await PhotoService.generateComparison(
        beforePhoto!.file_path,
        afterPhoto!.file_path,
        tenantId!,
        patientId!,
        { type: data.comparisonType },
      );

      // Create comparison record with body region
      const comparisonId = crypto.randomUUID();
      const result = await pool.query(
        `INSERT INTO photo_comparisons (
          id, tenant_id, patient_id,
          before_photo_id, after_photo_id,
          comparison_image_path, comparison_type, comparison_category,
          body_region,
          treatment_description, treatment_start_date, treatment_end_date,
          improvement_score, improvement_notes, notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          comparisonId,
          tenantId,
          patientId,
          data.beforePhotoId,
          data.afterPhotoId,
          comparisonImagePath,
          data.comparisonType,
          data.comparisonCategory || null,
          data.bodyRegion || beforePhoto!.body_region,
          data.treatmentDescription || null,
          data.treatmentStartDate || null,
          data.treatmentEndDate || null,
          data.improvementScore || null,
          data.improvementNotes || null,
          data.notes || null,
          userId,
        ],
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error creating comparison:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: err.issues });
      }
      res.status(500).json({ error: 'Failed to create comparison' });
    }
  },
);

/**
 * GET /api/patients/:patientId/photos/comparisons
 * List all comparisons for a patient
 */
photosRouter.get(
  '/patients/:patientId/photos/comparisons',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        `SELECT
          c.*,
          pb.body_region as before_body_region,
          pb.taken_at as before_taken_at,
          pb.thumbnail_path as before_thumbnail,
          pa.body_region as after_body_region,
          pa.taken_at as after_taken_at,
          pa.thumbnail_path as after_thumbnail,
          u.name as created_by_name
         FROM photo_comparisons c
         JOIN patient_photos pb ON c.before_photo_id = pb.id
         JOIN patient_photos pa ON c.after_photo_id = pa.id
         LEFT JOIN users u ON c.created_by = u.id
         WHERE c.patient_id = $1 AND c.tenant_id = $2
         ORDER BY c.created_at DESC`,
        [patientId, tenantId],
      );

      res.json({ comparisons: result.rows, count: result.rows.length });
    } catch (err) {
      console.error('Error fetching comparisons:', err);
      res.status(500).json({ error: 'Failed to fetch comparisons' });
    }
  },
);

/**
 * GET /api/patients/:patientId/photos/stats
 * Get photo statistics for a patient
 */
photosRouter.get(
  '/patients/:patientId/photos/stats',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        `SELECT file_size_bytes, body_region FROM patient_photos
         WHERE patient_id = $1 AND tenant_id = $2 AND is_deleted = FALSE`,
        [patientId, tenantId],
      );

      const stats = await PhotoService.getPhotoStats(result.rows);

      res.json(stats);
    } catch (err) {
      console.error('Error fetching stats:', err);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  },
);

/**
 * POST /api/patients/:patientId/photos/:photoId/link-to-body-map
 * Link a photo to a specific body map marker/lesion
 */
photosRouter.post(
  '/patients/:patientId/photos/:photoId/link-to-body-map',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, photoId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const linkData = linkPhotoToBodyMapSchema.parse(req.body);

      // Verify photo exists and belongs to patient
      const photoCheck = await pool.query(
        `SELECT id FROM patient_photos
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 AND is_deleted = FALSE`,
        [photoId, patientId, tenantId],
      );

      if (photoCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // If lesionId is provided, verify it exists
      if (linkData.lesionId) {
        const lesionCheck = await pool.query(
          `SELECT id FROM patient_lesions WHERE id = $1 AND patient_id = $2 AND tenant_id = $3`,
          [linkData.lesionId, patientId, tenantId],
        );

        if (lesionCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Lesion not found' });
        }
      }

      // Update photo with body map linking
      const result = await pool.query(
        `UPDATE patient_photos
         SET
           body_map_marker_id = $1,
           lesion_id = $2,
           x_position = $3,
           y_position = $4,
           body_view = $5,
           updated_at = NOW()
         WHERE id = $6 AND patient_id = $7 AND tenant_id = $8
         RETURNING *`,
        [
          linkData.bodyMapMarkerId || null,
          linkData.lesionId || null,
          linkData.xPosition,
          linkData.yPosition,
          linkData.bodyView,
          photoId,
          patientId,
          tenantId,
        ],
      );

      // Log access
      await logPhotoAccess(photoId!, tenantId!, userId!, 'linked_to_body_map', req);

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error linking photo to body map:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: err.issues });
      }
      res.status(500).json({ error: 'Failed to link photo to body map' });
    }
  },
);

/**
 * GET /api/patients/:patientId/photos/by-body-region/:bodyRegion
 * Get all photos for a specific body region with optional filtering by marker/lesion
 */
photosRouter.get(
  '/patients/:patientId/photos/by-body-region/:bodyRegion',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, bodyRegion } = req.params;
      const tenantId = req.user!.tenantId;
      const { bodyMapMarkerId, lesionId, bodyView, limit = '50', offset = '0' } = req.query;

      let query = `
        SELECT
          p.*,
          u.name as taken_by_name,
          l.anatomical_location as lesion_location,
          l.lesion_type,
          l.status as lesion_status
        FROM patient_photos p
        LEFT JOIN users u ON p.taken_by = u.id
        LEFT JOIN patient_lesions l ON p.lesion_id = l.id
        WHERE p.patient_id = $1 AND p.tenant_id = $2
          AND p.body_region = $3 AND p.is_deleted = FALSE
      `;
      const params: any[] = [patientId, tenantId, bodyRegion];
      let paramCount = 3;

      if (bodyMapMarkerId) {
        paramCount++;
        query += ` AND p.body_map_marker_id = $${paramCount}`;
        params.push(bodyMapMarkerId);
      }

      if (lesionId) {
        paramCount++;
        query += ` AND p.lesion_id = $${paramCount}`;
        params.push(lesionId);
      }

      if (bodyView) {
        paramCount++;
        query += ` AND p.body_view = $${paramCount}`;
        params.push(bodyView);
      }

      query += ` ORDER BY p.taken_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) FROM patient_photos
        WHERE patient_id = $1 AND tenant_id = $2 AND body_region = $3 AND is_deleted = FALSE
      `;
      const countParams: any[] = [patientId, tenantId, bodyRegion];
      let countParamIdx = 3;

      if (bodyMapMarkerId) {
        countParamIdx++;
        countQuery += ` AND body_map_marker_id = $${countParamIdx}`;
        countParams.push(bodyMapMarkerId);
      }

      if (lesionId) {
        countParamIdx++;
        countQuery += ` AND lesion_id = $${countParamIdx}`;
        countParams.push(lesionId);
      }

      if (bodyView) {
        countParamIdx++;
        countQuery += ` AND body_view = $${countParamIdx}`;
        countParams.push(bodyView);
      }

      const countResult = await pool.query(countQuery, countParams);

      res.json({
        bodyRegion,
        photos: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (err) {
      console.error('Error fetching photos by body region:', err);
      res.status(500).json({ error: 'Failed to fetch photos' });
    }
  },
);

/**
 * GET /api/patients/:patientId/photos/by-marker/:markerId/timeline
 * Get photo timeline for a specific body map marker or lesion
 */
photosRouter.get(
  '/patients/:patientId/photos/by-marker/:markerId/timeline',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, markerId } = req.params;
      const tenantId = req.user!.tenantId;

      // Check if markerId is a lesion or body map marker
      const result = await pool.query(
        `SELECT
          p.*,
          u.name as taken_by_name,
          l.anatomical_location,
          l.lesion_type,
          l.status as lesion_status,
          l.size_mm as current_lesion_size
         FROM patient_photos p
         LEFT JOIN users u ON p.taken_by = u.id
         LEFT JOIN patient_lesions l ON p.lesion_id = l.id
         WHERE p.patient_id = $1 AND p.tenant_id = $2
           AND (p.body_map_marker_id = $3 OR p.lesion_id = $3)
           AND p.is_deleted = FALSE
         ORDER BY p.taken_at ASC`,
        [patientId, tenantId, markerId],
      );

      // Calculate progression metrics if multiple photos exist
      const timeline = result.rows.map((photo, index) => {
        const metrics: any = {
          sequence_number: index + 1,
          days_since_baseline: 0,
        };

        if (index > 0 && result.rows[0].taken_at) {
          const baselineDate = new Date(result.rows[0].taken_at);
          const currentDate = new Date(photo.taken_at);
          metrics.days_since_baseline = Math.floor(
            (currentDate.getTime() - baselineDate.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        return {
          ...photo,
          progression_metrics: metrics,
        };
      });

      res.json({
        markerId,
        patientId,
        timeline,
        count: timeline.length,
        baseline_photo: timeline.length > 0 ? timeline[0] : null,
        latest_photo: timeline.length > 0 ? timeline[timeline.length - 1] : null,
      });
    } catch (err) {
      console.error('Error fetching marker timeline:', err);
      res.status(500).json({ error: 'Failed to fetch timeline' });
    }
  },
);

/**
 * POST /api/patients/:patientId/photos/comparisons/create
 * Create a before/after comparison with body map context
 */
photosRouter.post(
  '/patients/:patientId/photos/comparisons/create',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const data = createComparisonSchema.parse(req.body);

      // Verify both photos exist and belong to patient
      const photosCheck = await pool.query(
        `SELECT id, file_path, body_region, body_view, lesion_id FROM patient_photos
         WHERE id = ANY($1) AND patient_id = $2 AND tenant_id = $3 AND is_deleted = FALSE`,
        [[data.beforePhotoId, data.afterPhotoId], patientId, tenantId],
      );

      if (photosCheck.rows.length !== 2) {
        return res.status(404).json({ error: 'One or both photos not found' });
      }

      const beforePhoto = photosCheck.rows.find((p) => p.id === data.beforePhotoId);
      const afterPhoto = photosCheck.rows.find((p) => p.id === data.afterPhotoId);

      // Generate comparison image
      const comparisonImagePath = await PhotoService.generateComparison(
        beforePhoto!.file_path,
        afterPhoto!.file_path,
        tenantId!,
        patientId!,
        { type: data.comparisonType },
      );

      // Create comparison record with body map context
      const comparisonId = crypto.randomUUID();
      const result = await pool.query(
        `INSERT INTO photo_comparisons (
          id, tenant_id, patient_id,
          before_photo_id, after_photo_id,
          comparison_image_path, comparison_type, comparison_category,
          body_region,
          treatment_description, treatment_start_date, treatment_end_date,
          improvement_score, improvement_notes, notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          comparisonId,
          tenantId,
          patientId,
          data.beforePhotoId,
          data.afterPhotoId,
          comparisonImagePath,
          data.comparisonType,
          data.comparisonCategory || null,
          data.bodyRegion || beforePhoto!.body_region,
          data.treatmentDescription || null,
          data.treatmentStartDate || null,
          data.treatmentEndDate || null,
          data.improvementScore || null,
          data.improvementNotes || null,
          data.notes || null,
          userId,
        ],
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error creating comparison:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: err.issues });
      }
      res.status(500).json({ error: 'Failed to create comparison' });
    }
  },
);
