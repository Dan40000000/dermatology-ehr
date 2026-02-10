/**
 * Insurance Card OCR Service
 *
 * Handles OCR processing of insurance card images and extraction of key fields:
 * - Member ID, Group Number
 * - Payer Name, Plan Type
 * - Subscriber Information
 * - Copay amounts
 * - Phone numbers (claims, prior auth)
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// OCR Provider interface for abstraction
export interface OCRProvider {
  name: string;
  processImage(imageBuffer: Buffer): Promise<OCRResult>;
}

export interface OCRResult {
  text: string;
  confidence: number;
  blocks?: TextBlock[];
  rawResponse?: unknown;
}

export interface TextBlock {
  text: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  position?: 'top' | 'middle' | 'bottom' | 'left' | 'right';
}

export interface ExtractedInsuranceData {
  memberId?: string;
  groupNumber?: string;
  payerName?: string;
  planType?: string;
  planName?: string;
  subscriberName?: string;
  subscriberDob?: string;
  effectiveDate?: string;
  terminationDate?: string;
  copayPcp?: number;
  copaySpecialist?: number;
  copayEr?: number;
  copayUrgentCare?: number;
  claimsPhone?: string;
  priorAuthPhone?: string;
  memberServicesPhone?: string;
  rxBin?: string;
  rxPcn?: string;
  rxGroup?: string;
  confidence: number;
  extractedFields: Record<string, FieldExtraction>;
}

export interface FieldExtraction {
  value: string;
  confidence: number;
  pattern?: string;
  source?: 'front' | 'back';
}

export interface InsuranceCardScan {
  id: string;
  patientId: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  scannedAt: Date;
  ocrResult?: OCRResult;
  extractedData?: ExtractedInsuranceData;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processingError?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
}

export interface PayerMatch {
  payerId: string;
  payerName: string;
  confidence: number;
  aliases?: string[];
}

// Mock OCR Provider for testing
class MockOCRProvider implements OCRProvider {
  name = 'mock';

  async processImage(_imageBuffer: Buffer): Promise<OCRResult> {
    // Simulate OCR processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return sample OCR text for testing
    const sampleTexts = [
      `BLUE CROSS BLUE SHIELD
       Member ID: XYZ123456789
       Group: 98765
       Plan Type: PPO
       Subscriber: John Doe
       Effective: 01/01/2024

       PCP Copay: $25
       Specialist: $50
       ER: $150

       Claims: 1-800-555-0100
       Prior Auth: 1-800-555-0200
       RxBIN: 003858
       RxPCN: ADV
       RxGrp: RX1234`,

      `UnitedHealthcare
       Member ID: 987654321
       Group #: 123456
       PPO PLAN
       Member: Jane Smith
       Eff. Date: 03/15/2024

       Office Visit: $30
       Specialist Copay: $60
       Emergency Room: $200

       Billing Phone: (800) 555-1234
       Pre-Authorization: 800-555-5678`,

      `Aetna
       Member ID: W123456789
       Group Number: AETNA001
       HMO
       Name: Robert Johnson
       Coverage Effective: 06/01/2024

       PCP: $20
       Spec: $40
       ER Copay: $100
       Urgent Care: $35

       Claims #: 1.800.872.3862
       Prior Cert: 1.800.872.3862`,
    ];

    const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)]!;

    return {
      text: randomText,
      confidence: 85 + Math.random() * 10,
      blocks: this.parseTextBlocks(randomText),
    };
  }

  private parseTextBlocks(text: string): TextBlock[] {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map((line, index) => ({
      text: line.trim(),
      confidence: 80 + Math.random() * 20,
      position: index < lines.length / 3 ? 'top' : index < (2 * lines.length) / 3 ? 'middle' : 'bottom',
    }));
  }
}

// Tesseract.js Provider (client-side compatible)
class TesseractProvider implements OCRProvider {
  name = 'tesseract';

  async processImage(_imageBuffer: Buffer): Promise<OCRResult> {
    // Note: In production, this would use Tesseract.js
    // For now, delegate to mock for server-side testing
    logger.info('TesseractProvider: Using mock implementation for server-side');
    const mockProvider = new MockOCRProvider();
    return mockProvider.processImage(_imageBuffer);
  }
}

// Google Cloud Vision Provider (server-side)
class GoogleVisionProvider implements OCRProvider {
  name = 'google_vision';

  async processImage(_imageBuffer: Buffer): Promise<OCRResult> {
    // Note: In production, this would integrate with Google Cloud Vision API
    // Requires GOOGLE_APPLICATION_CREDENTIALS environment variable
    logger.info('GoogleVisionProvider: Using mock implementation');
    const mockProvider = new MockOCRProvider();
    return mockProvider.processImage(_imageBuffer);
  }
}

// AWS Textract Provider (server-side)
class AWSTextractProvider implements OCRProvider {
  name = 'aws_textract';

  async processImage(_imageBuffer: Buffer): Promise<OCRResult> {
    // Note: In production, this would integrate with AWS Textract
    // Requires AWS credentials configuration
    logger.info('AWSTextractProvider: Using mock implementation');
    const mockProvider = new MockOCRProvider();
    return mockProvider.processImage(_imageBuffer);
  }
}

// Factory function to get OCR provider
function getOCRProvider(providerName: string = 'mock'): OCRProvider {
  switch (providerName.toLowerCase()) {
    case 'tesseract':
      return new TesseractProvider();
    case 'google_vision':
      return new GoogleVisionProvider();
    case 'aws_textract':
      return new AWSTextractProvider();
    case 'mock':
    default:
      return new MockOCRProvider();
  }
}

/**
 * Process an insurance card image using OCR
 */
export async function processCardImage(
  imageBuffer: Buffer,
  side: 'front' | 'back',
  providerName: string = 'mock'
): Promise<OCRResult> {
  logger.info('Processing insurance card image', { side, provider: providerName });

  const provider = getOCRProvider(providerName);

  try {
    const result = await provider.processImage(imageBuffer);

    logger.info('OCR processing completed', {
      side,
      provider: provider.name,
      confidence: result.confidence,
      textLength: result.text.length,
    });

    return result;
  } catch (error) {
    logger.error('OCR processing failed', {
      side,
      provider: provider.name,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Extract insurance fields from OCR text
 */
export async function extractInsuranceFields(
  ocrText: string,
  tenantId?: string,
  detectedPayer?: string
): Promise<ExtractedInsuranceData> {
  logger.info('Extracting insurance fields from OCR text');

  const extractedFields: Record<string, FieldExtraction> = {};
  let overallConfidence = 0;
  let fieldsExtracted = 0;

  // Get field mappings from database
  const mappings = await getFieldMappings(tenantId, detectedPayer);

  // Apply each mapping pattern
  for (const mapping of mappings) {
    try {
      const regex = new RegExp(mapping.regex_pattern, 'i');
      const match = ocrText.match(regex);

      if (match && match[1]) {
        const value = match[1].trim();
        const fieldName = mapping.field_name;

        // Only update if we don't have this field or new one has higher priority
        if (!extractedFields[fieldName] || mapping.priority > (extractedFields[fieldName]?.confidence || 0)) {
          extractedFields[fieldName] = {
            value,
            confidence: mapping.priority + 50, // Base confidence + priority
            pattern: mapping.regex_pattern,
            source: mapping.position_hint as 'front' | 'back' | undefined,
          };
          fieldsExtracted++;
        }
      }
    } catch (error) {
      logger.warn('Failed to apply regex pattern', {
        fieldName: mapping.field_name,
        pattern: mapping.regex_pattern,
        error: (error as Error).message,
      });
    }
  }

  // Calculate overall confidence
  if (fieldsExtracted > 0) {
    const totalConfidence = Object.values(extractedFields).reduce(
      (sum, field) => sum + field.confidence,
      0
    );
    overallConfidence = totalConfidence / fieldsExtracted;
  }

  // Build the extracted data object
  const extractedData: ExtractedInsuranceData = {
    confidence: overallConfidence,
    extractedFields,
  };

  // Map extracted fields to structured data
  if (extractedFields['member_id']) {
    extractedData.memberId = extractedFields['member_id'].value;
  }
  if (extractedFields['group_number']) {
    extractedData.groupNumber = extractedFields['group_number'].value;
  }
  if (extractedFields['plan_type']) {
    extractedData.planType = extractedFields['plan_type'].value;
  }
  if (extractedFields['subscriber_name']) {
    extractedData.subscriberName = extractedFields['subscriber_name'].value;
  }
  if (extractedFields['effective_date']) {
    extractedData.effectiveDate = normalizeDate(extractedFields['effective_date'].value);
  }
  if (extractedFields['copay_pcp']) {
    extractedData.copayPcp = parseInt(extractedFields['copay_pcp'].value, 10);
  }
  if (extractedFields['copay_specialist']) {
    extractedData.copaySpecialist = parseInt(extractedFields['copay_specialist'].value, 10);
  }
  if (extractedFields['copay_er']) {
    extractedData.copayEr = parseInt(extractedFields['copay_er'].value, 10);
  }
  if (extractedFields['copay_urgent_care']) {
    extractedData.copayUrgentCare = parseInt(extractedFields['copay_urgent_care'].value, 10);
  }
  if (extractedFields['claims_phone']) {
    extractedData.claimsPhone = normalizePhone(extractedFields['claims_phone'].value);
  }
  if (extractedFields['prior_auth_phone']) {
    extractedData.priorAuthPhone = normalizePhone(extractedFields['prior_auth_phone'].value);
  }
  if (extractedFields['member_services_phone']) {
    extractedData.memberServicesPhone = normalizePhone(extractedFields['member_services_phone'].value);
  }
  if (extractedFields['rx_bin']) {
    extractedData.rxBin = extractedFields['rx_bin'].value;
  }
  if (extractedFields['rx_pcn']) {
    extractedData.rxPcn = extractedFields['rx_pcn'].value;
  }
  if (extractedFields['rx_group']) {
    extractedData.rxGroup = extractedFields['rx_group'].value;
  }

  // Try to detect payer from text if not provided
  if (!extractedData.payerName) {
    const payerMatch = await matchToPayer(ocrText);
    if (payerMatch) {
      extractedData.payerName = payerMatch.payerName;
    }
  }

  logger.info('Insurance fields extracted', {
    fieldsExtracted,
    overallConfidence,
    payerName: extractedData.payerName,
  });

  return extractedData;
}

/**
 * Match OCR text to a known payer
 */
export async function matchToPayer(ocrText: string): Promise<PayerMatch | null> {
  logger.info('Matching OCR text to known payer');

  try {
    // Get known payers from database
    const result = await pool.query(
      `SELECT payer_id, payer_name, payer_aliases
       FROM known_payers
       WHERE is_active = true`
    );

    const normalizedText = ocrText.toLowerCase();

    for (const payer of result.rows) {
      // Check payer name
      if (normalizedText.includes(payer.payer_name.toLowerCase())) {
        return {
          payerId: payer.payer_id,
          payerName: payer.payer_name,
          confidence: 95,
          aliases: payer.payer_aliases,
        };
      }

      // Check aliases
      if (payer.payer_aliases) {
        for (const alias of payer.payer_aliases) {
          if (normalizedText.includes(alias.toLowerCase())) {
            return {
              payerId: payer.payer_id,
              payerName: payer.payer_name,
              confidence: 85,
              aliases: payer.payer_aliases,
            };
          }
        }
      }
    }

    logger.info('No payer match found in OCR text');
    return null;
  } catch (error) {
    logger.error('Error matching payer', { error: (error as Error).message });
    return null;
  }
}

/**
 * Populate patient insurance record with extracted OCR data
 */
export async function populatePatientInsurance(
  patientId: string,
  tenantId: string,
  extractedData: ExtractedInsuranceData,
  scanId: string,
  userId?: string
): Promise<{ success: boolean; insuranceId?: string; error?: string }> {
  logger.info('Populating patient insurance from OCR data', { patientId, scanId });

  try {
    // Check if patient has existing primary insurance
    const existingResult = await pool.query(
      `SELECT id FROM patient_insurance
       WHERE patient_id = $1 AND tenant_id = $2 AND is_primary = true
       LIMIT 1`,
      [patientId, tenantId]
    );

    let insuranceId: string;

    if (existingResult.rows.length > 0) {
      // Update existing insurance
      insuranceId = existingResult.rows[0].id;
      await pool.query(
        `UPDATE patient_insurance SET
          payer_name = COALESCE($1, payer_name),
          member_id = COALESCE($2, member_id),
          group_number = COALESCE($3, group_number),
          plan_type = COALESCE($4, plan_type),
          subscriber_name = COALESCE($5, subscriber_name),
          effective_date = COALESCE($6::date, effective_date),
          copay_pcp_cents = COALESCE($7, copay_pcp_cents),
          copay_specialist_cents = COALESCE($8, copay_specialist_cents),
          copay_er_cents = COALESCE($9, copay_er_cents),
          copay_urgent_care_cents = COALESCE($10, copay_urgent_care_cents),
          claims_phone = COALESCE($11, claims_phone),
          prior_auth_phone = COALESCE($12, prior_auth_phone),
          member_services_phone = COALESCE($13, member_services_phone),
          rx_bin = COALESCE($14, rx_bin),
          rx_pcn = COALESCE($15, rx_pcn),
          rx_group = COALESCE($16, rx_group),
          last_ocr_scan_id = $17,
          updated_at = NOW(),
          updated_by = $18
        WHERE id = $19`,
        [
          extractedData.payerName,
          extractedData.memberId,
          extractedData.groupNumber,
          extractedData.planType,
          extractedData.subscriberName,
          extractedData.effectiveDate,
          extractedData.copayPcp ? extractedData.copayPcp * 100 : null,
          extractedData.copaySpecialist ? extractedData.copaySpecialist * 100 : null,
          extractedData.copayEr ? extractedData.copayEr * 100 : null,
          extractedData.copayUrgentCare ? extractedData.copayUrgentCare * 100 : null,
          extractedData.claimsPhone,
          extractedData.priorAuthPhone,
          extractedData.memberServicesPhone,
          extractedData.rxBin,
          extractedData.rxPcn,
          extractedData.rxGroup,
          scanId,
          userId,
          insuranceId,
        ]
      );

      logger.info('Updated existing patient insurance', { insuranceId, patientId });
    } else {
      // Create new insurance record
      const insertResult = await pool.query(
        `INSERT INTO patient_insurance (
          tenant_id, patient_id, payer_name, member_id, group_number,
          plan_type, subscriber_name, effective_date,
          copay_pcp_cents, copay_specialist_cents, copay_er_cents, copay_urgent_care_cents,
          claims_phone, prior_auth_phone, member_services_phone,
          rx_bin, rx_pcn, rx_group,
          last_ocr_scan_id, is_primary, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::date,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, true, $20
        ) RETURNING id`,
        [
          tenantId,
          patientId,
          extractedData.payerName || 'Unknown',
          extractedData.memberId,
          extractedData.groupNumber,
          extractedData.planType,
          extractedData.subscriberName,
          extractedData.effectiveDate,
          extractedData.copayPcp ? extractedData.copayPcp * 100 : null,
          extractedData.copaySpecialist ? extractedData.copaySpecialist * 100 : null,
          extractedData.copayEr ? extractedData.copayEr * 100 : null,
          extractedData.copayUrgentCare ? extractedData.copayUrgentCare * 100 : null,
          extractedData.claimsPhone,
          extractedData.priorAuthPhone,
          extractedData.memberServicesPhone,
          extractedData.rxBin,
          extractedData.rxPcn,
          extractedData.rxGroup,
          scanId,
          userId,
        ]
      );

      insuranceId = insertResult.rows[0].id;
      logger.info('Created new patient insurance', { insuranceId, patientId });
    }

    return { success: true, insuranceId };
  } catch (error) {
    logger.error('Error populating patient insurance', {
      patientId,
      error: (error as Error).message,
    });
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Create a new insurance card scan record
 */
export async function createScanRecord(
  patientId: string,
  tenantId: string,
  frontImageUrl?: string,
  backImageUrl?: string
): Promise<InsuranceCardScan> {
  const result = await pool.query(
    `INSERT INTO insurance_card_scans (
      tenant_id, patient_id, front_image_url, back_image_url,
      processing_status, scanned_at
    ) VALUES ($1, $2, $3, $4, 'pending', NOW())
    RETURNING *`,
    [tenantId, patientId, frontImageUrl, backImageUrl]
  );

  return mapScanRow(result.rows[0]);
}

/**
 * Update scan record with OCR results
 */
export async function updateScanWithOCRResults(
  scanId: string,
  ocrResult: OCRResult,
  extractedData: ExtractedInsuranceData,
  status: 'completed' | 'failed' = 'completed',
  error?: string
): Promise<InsuranceCardScan> {
  const result = await pool.query(
    `UPDATE insurance_card_scans SET
      ocr_result = $1,
      extracted_data = $2,
      ocr_confidence = $3,
      processing_status = $4,
      processing_error = $5,
      updated_at = NOW()
    WHERE id = $6
    RETURNING *`,
    [
      JSON.stringify(ocrResult),
      JSON.stringify(extractedData),
      extractedData.confidence,
      status,
      error,
      scanId,
    ]
  );

  return mapScanRow(result.rows[0]);
}

/**
 * Verify scan results
 */
export async function verifyScan(
  scanId: string,
  userId: string,
  notes?: string
): Promise<InsuranceCardScan> {
  const result = await pool.query(
    `UPDATE insurance_card_scans SET
      verified_by = $1,
      verified_at = NOW(),
      verification_notes = $2,
      updated_at = NOW()
    WHERE id = $3
    RETURNING *`,
    [userId, notes, scanId]
  );

  return mapScanRow(result.rows[0]);
}

/**
 * Get scan history for a patient
 */
export async function getScanHistory(
  patientId: string,
  tenantId: string,
  limit: number = 10
): Promise<InsuranceCardScan[]> {
  const result = await pool.query(
    `SELECT * FROM insurance_card_scans
     WHERE patient_id = $1 AND tenant_id = $2
     ORDER BY scanned_at DESC
     LIMIT $3`,
    [patientId, tenantId, limit]
  );

  return result.rows.map(mapScanRow);
}

/**
 * Get a specific scan by ID
 */
export async function getScanById(
  scanId: string,
  tenantId: string
): Promise<InsuranceCardScan | null> {
  const result = await pool.query(
    `SELECT * FROM insurance_card_scans
     WHERE id = $1 AND tenant_id = $2`,
    [scanId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapScanRow(result.rows[0]);
}

// Helper functions

async function getFieldMappings(
  tenantId?: string,
  payerPattern?: string
): Promise<Array<{
  field_name: string;
  regex_pattern: string;
  position_hint: string;
  priority: number;
}>> {
  let query = `
    SELECT field_name, regex_pattern, position_hint, priority
    FROM ocr_field_mappings
    WHERE is_active = true
    AND (tenant_id IS NULL OR tenant_id = $1)
  `;
  const params: (string | undefined)[] = [tenantId];

  if (payerPattern) {
    query += ` AND $2 ~* payer_pattern`;
    params.push(payerPattern);
  }

  query += ` ORDER BY priority DESC, field_name`;

  const result = await pool.query(query, params);
  return result.rows;
}

function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Format as (XXX) XXX-XXXX
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone; // Return original if can't normalize
}

function normalizeDate(dateStr: string): string {
  // Try to parse various date formats and normalize to YYYY-MM-DD
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // MM/DD/YYYY or MM-DD-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/, // MM/DD/YY or MM-DD-YY
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year: string, month: string, day: string;

      if (format === formats[0]) {
        month = match[1]!.padStart(2, '0');
        day = match[2]!.padStart(2, '0');
        year = match[3]!;
      } else if (format === formats[1]) {
        month = match[1]!.padStart(2, '0');
        day = match[2]!.padStart(2, '0');
        year = parseInt(match[3]!, 10) > 50 ? `19${match[3]}` : `20${match[3]}`;
      } else {
        year = match[1]!;
        month = match[2]!.padStart(2, '0');
        day = match[3]!.padStart(2, '0');
      }

      return `${year}-${month}-${day}`;
    }
  }

  return dateStr; // Return original if can't parse
}

function mapScanRow(row: Record<string, unknown>): InsuranceCardScan {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    frontImageUrl: row.front_image_url as string | undefined,
    backImageUrl: row.back_image_url as string | undefined,
    scannedAt: row.scanned_at as Date,
    ocrResult: row.ocr_result ? (typeof row.ocr_result === 'string' ? JSON.parse(row.ocr_result) : row.ocr_result) : undefined,
    extractedData: row.extracted_data ? (typeof row.extracted_data === 'string' ? JSON.parse(row.extracted_data) : row.extracted_data) : undefined,
    processingStatus: row.processing_status as 'pending' | 'processing' | 'completed' | 'failed',
    processingError: row.processing_error as string | undefined,
    verifiedBy: row.verified_by as string | undefined,
    verifiedAt: row.verified_at as Date | undefined,
  };
}
