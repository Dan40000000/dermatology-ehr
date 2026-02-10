/**
 * Insurance Card OCR API Routes
 *
 * Endpoints:
 * POST /api/insurance-ocr/scan - Upload and process insurance card image
 * POST /api/insurance-ocr/confirm - Confirm extracted data and populate insurance
 * GET /api/insurance-ocr/history/:patientId - Get scan history for a patient
 * GET /api/insurance-ocr/scan/:scanId - Get a specific scan
 * POST /api/insurance-ocr/verify/:scanId - Mark scan as verified
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { createAuditLog } from '../services/audit';
import { logger } from '../lib/logger';
import {
  processCardImage,
  extractInsuranceFields,
  matchToPayer,
  populatePatientInsurance,
  createScanRecord,
  updateScanWithOCRResults,
  verifyScan,
  getScanHistory,
  getScanById,
  type ExtractedInsuranceData,
} from '../services/insuranceOCRService';

// Validation schemas
const scanRequestSchema = z.object({
  patientId: z.string().uuid(),
  imageData: z.string(), // Base64 encoded image
  side: z.enum(['front', 'back']),
  ocrProvider: z.enum(['mock', 'tesseract', 'google_vision', 'aws_textract']).optional(),
});

const confirmRequestSchema = z.object({
  scanId: z.string().uuid(),
  patientId: z.string().uuid(),
  extractedData: z.object({
    memberId: z.string().optional(),
    groupNumber: z.string().optional(),
    payerName: z.string().optional(),
    planType: z.string().optional(),
    planName: z.string().optional(),
    subscriberName: z.string().optional(),
    subscriberDob: z.string().optional(),
    effectiveDate: z.string().optional(),
    terminationDate: z.string().optional(),
    copayPcp: z.number().optional(),
    copaySpecialist: z.number().optional(),
    copayEr: z.number().optional(),
    copayUrgentCare: z.number().optional(),
    claimsPhone: z.string().optional(),
    priorAuthPhone: z.string().optional(),
    memberServicesPhone: z.string().optional(),
    rxBin: z.string().optional(),
    rxPcn: z.string().optional(),
    rxGroup: z.string().optional(),
  }),
});

const verifyRequestSchema = z.object({
  notes: z.string().optional(),
});

export const insuranceOCRRouter = Router();

/**
 * @swagger
 * /api/insurance-ocr/scan:
 *   post:
 *     summary: Upload and process insurance card image with OCR
 *     description: Uploads an insurance card image, processes it with OCR, and extracts key fields
 *     tags:
 *       - Insurance OCR
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - imageData
 *               - side
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               imageData:
 *                 type: string
 *                 description: Base64 encoded image data
 *               side:
 *                 type: string
 *                 enum: [front, back]
 *               ocrProvider:
 *                 type: string
 *                 enum: [mock, tesseract, google_vision, aws_textract]
 *     responses:
 *       200:
 *         description: OCR scan completed successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
insuranceOCRRouter.post(
  '/scan',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing', 'medical_assistant']),
  async (req: AuthedRequest, res) => {
    try {
      const validatedData = scanRequestSchema.parse(req.body);
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      logger.info('Processing insurance card scan', {
        patientId: validatedData.patientId,
        side: validatedData.side,
        provider: validatedData.ocrProvider || 'mock',
      });

      // Decode base64 image
      const imageBuffer = Buffer.from(validatedData.imageData, 'base64');

      // Create scan record
      const scan = await createScanRecord(
        validatedData.patientId,
        tenantId,
        validatedData.side === 'front' ? `data:image/jpeg;base64,${validatedData.imageData}` : undefined,
        validatedData.side === 'back' ? `data:image/jpeg;base64,${validatedData.imageData}` : undefined
      );

      // Process image with OCR
      const ocrResult = await processCardImage(
        imageBuffer,
        validatedData.side,
        validatedData.ocrProvider || 'mock'
      );

      // Try to match payer first for better field extraction
      const payerMatch = await matchToPayer(ocrResult.text);

      // Extract insurance fields
      const extractedData = await extractInsuranceFields(
        ocrResult.text,
        tenantId,
        payerMatch?.payerName
      );

      if (payerMatch) {
        extractedData.payerName = payerMatch.payerName;
      }

      // Update scan record with results
      const updatedScan = await updateScanWithOCRResults(
        scan.id,
        ocrResult,
        extractedData,
        'completed'
      );

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.ocr.scan',
        resourceType: 'insurance_card_scan',
        resourceId: scan.id,
        metadata: {
          patientId: validatedData.patientId,
          side: validatedData.side,
          payerName: extractedData.payerName,
          confidence: extractedData.confidence,
          fieldsExtracted: Object.keys(extractedData.extractedFields || {}).length,
        },
      });

      res.json({
        success: true,
        scan: {
          id: updatedScan.id,
          patientId: updatedScan.patientId,
          scannedAt: updatedScan.scannedAt,
          processingStatus: updatedScan.processingStatus,
          ocrConfidence: ocrResult.confidence,
        },
        extractedData,
        rawText: ocrResult.text,
        payerMatch,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        });
      }

      logger.error('Error processing insurance card scan', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process insurance card',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/insurance-ocr/confirm:
 *   post:
 *     summary: Confirm extracted data and populate patient insurance
 *     description: Confirms OCR-extracted data and updates patient insurance record
 *     tags:
 *       - Insurance OCR
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scanId
 *               - patientId
 *               - extractedData
 *             properties:
 *               scanId:
 *                 type: string
 *                 format: uuid
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               extractedData:
 *                 type: object
 *                 properties:
 *                   memberId:
 *                     type: string
 *                   groupNumber:
 *                     type: string
 *                   payerName:
 *                     type: string
 *                   planType:
 *                     type: string
 *     responses:
 *       200:
 *         description: Insurance data confirmed and saved
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
insuranceOCRRouter.post(
  '/confirm',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing', 'medical_assistant']),
  async (req: AuthedRequest, res) => {
    try {
      const validatedData = confirmRequestSchema.parse(req.body);
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      logger.info('Confirming insurance OCR data', {
        scanId: validatedData.scanId,
        patientId: validatedData.patientId,
      });

      // Populate patient insurance with extracted data
      const extractedDataWithConfidence: ExtractedInsuranceData = {
        ...validatedData.extractedData,
        confidence: 100, // User-confirmed data
        extractedFields: {},
      };

      const result = await populatePatientInsurance(
        validatedData.patientId,
        tenantId,
        extractedDataWithConfidence,
        validatedData.scanId,
        userId
      );

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save insurance data',
          message: result.error,
        });
      }

      // Mark scan as verified
      await verifyScan(validatedData.scanId, userId || 'system', 'Data confirmed by user');

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.ocr.confirm',
        resourceType: 'patient_insurance',
        resourceId: result.insuranceId,
        metadata: {
          scanId: validatedData.scanId,
          patientId: validatedData.patientId,
          confirmedFields: Object.keys(validatedData.extractedData),
        },
      });

      res.json({
        success: true,
        insuranceId: result.insuranceId,
        message: 'Insurance data confirmed and saved',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        });
      }

      logger.error('Error confirming insurance OCR data', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to confirm insurance data',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/insurance-ocr/history/{patientId}:
 *   get:
 *     summary: Get scan history for a patient
 *     description: Returns all insurance card scans for a patient
 *     tags:
 *       - Insurance OCR
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Scan history retrieved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
insuranceOCRRouter.get(
  '/history/:patientId',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing', 'medical_assistant']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const limit = parseInt(req.query.limit as string) || 10;

      const history = await getScanHistory(patientId!, tenantId, limit);

      res.json({
        success: true,
        scans: history,
        count: history.length,
      });
    } catch (error) {
      logger.error('Error fetching scan history', {
        error: (error as Error).message,
        patientId: req.params.patientId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch scan history',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/insurance-ocr/scan/{scanId}:
 *   get:
 *     summary: Get a specific scan by ID
 *     description: Returns details of a specific insurance card scan
 *     tags:
 *       - Insurance OCR
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: scanId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Scan details retrieved
 *       404:
 *         description: Scan not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
insuranceOCRRouter.get(
  '/scan/:scanId',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing', 'medical_assistant']),
  async (req: AuthedRequest, res) => {
    try {
      const { scanId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;

      const scan = await getScanById(scanId!, tenantId);

      if (!scan) {
        return res.status(404).json({
          success: false,
          error: 'Scan not found',
        });
      }

      res.json({
        success: true,
        scan,
      });
    } catch (error) {
      logger.error('Error fetching scan', {
        error: (error as Error).message,
        scanId: req.params.scanId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch scan',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/insurance-ocr/verify/{scanId}:
 *   post:
 *     summary: Mark a scan as verified
 *     description: Marks an insurance card scan as manually verified
 *     tags:
 *       - Insurance OCR
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: scanId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Scan verified
 *       404:
 *         description: Scan not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
insuranceOCRRouter.post(
  '/verify/:scanId',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const { scanId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      const validatedData = verifyRequestSchema.parse(req.body);

      // Check if scan exists
      const existingScan = await getScanById(scanId!, tenantId);
      if (!existingScan) {
        return res.status(404).json({
          success: false,
          error: 'Scan not found',
        });
      }

      // Verify the scan
      const verifiedScan = await verifyScan(
        scanId!,
        userId || 'system',
        validatedData.notes
      );

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.ocr.verify',
        resourceType: 'insurance_card_scan',
        resourceId: scanId,
        metadata: {
          patientId: existingScan.patientId,
          notes: validatedData.notes,
        },
      });

      res.json({
        success: true,
        scan: verifiedScan,
        message: 'Scan verified successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        });
      }

      logger.error('Error verifying scan', {
        error: (error as Error).message,
        scanId: req.params.scanId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to verify scan',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/insurance-ocr/payers:
 *   get:
 *     summary: Get list of known payers
 *     description: Returns list of known insurance payers for matching
 *     tags:
 *       - Insurance OCR
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Payer list retrieved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
insuranceOCRRouter.get(
  '/payers',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing', 'medical_assistant']),
  async (req: AuthedRequest, res) => {
    try {
      const { pool } = await import('../db/pool');

      const result = await pool.query(
        `SELECT payer_id, payer_name, payer_aliases, card_layout_type
         FROM known_payers
         WHERE is_active = true
         ORDER BY payer_name`
      );

      res.json({
        success: true,
        payers: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      logger.error('Error fetching payers', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch payers',
        message: (error as Error).message,
      });
    }
  }
);
