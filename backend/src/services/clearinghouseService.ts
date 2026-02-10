/**
 * Clearinghouse Service
 *
 * Handles claim submission to clearinghouses, X12 837P generation,
 * status polling, and ERA/EOB processing.
 */

import crypto from "crypto";
import { pool } from "../db/pool";
import { auditLog } from "./audit";

// ============================================================================
// TYPES
// ============================================================================

export interface ClearinghouseConfig {
  id: string;
  tenantId: string;
  name: string;
  type: "change_healthcare" | "availity" | "trizetto" | "waystar" | "custom";
  isActive: boolean;
  isDefault: boolean;
  apiEndpoint?: string;
  apiVersion?: string;
  sftpHost?: string;
  sftpPort?: number;
  senderId?: string;
  senderQualifier?: string;
  receiverId?: string;
  receiverQualifier?: string;
  submitterId?: string;
  tradingPartnerId?: string;
  submissionFormat: string;
  submissionMethod: string;
  batchEnabled: boolean;
  maxBatchSize: number;
}

export interface ClaimSubmission {
  id: string;
  tenantId: string;
  claimId: string;
  superbillId?: string;
  clearinghouseId?: string;
  submissionDate: Date;
  submissionBatchId?: string;
  x12ClaimId?: string;
  isaControlNumber?: string;
  gsControlNumber?: string;
  stControlNumber?: string;
  status: string;
  statusCode?: string;
  statusMessage?: string;
  responseData?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
}

export interface X12Segment {
  id: string;
  elements: string[];
}

export interface X12Envelope {
  isa: X12Segment;
  gs: X12Segment;
  st: X12Segment;
  segments: X12Segment[];
  se: X12Segment;
  ge: X12Segment;
  iea: X12Segment;
}

export interface SuperbillData {
  id: string;
  encounterId: string;
  patientId: string;
  providerId: string;
  serviceDate: string;
  totalCharges: number;
  diagnoses: Array<{
    code: string;
    description: string;
    isPrimary: boolean;
  }>;
  lineItems: Array<{
    cptCode: string;
    modifiers?: string[];
    units: number;
    charge: number;
    diagnosisPointers: number[];
  }>;
  patient: {
    firstName: string;
    lastName: string;
    dob: string;
    sex: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    memberId?: string;
    groupNumber?: string;
    payerName?: string;
    payerId?: string;
  };
  provider: {
    npi: string;
    taxId: string;
    firstName?: string;
    lastName?: string;
    organizationName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    taxonomy?: string;
  };
  facility?: {
    npi?: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  payer: {
    payerId: string;
    payerName: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export interface RemittanceAdvice {
  claimId: string;
  eraNumber: string;
  paymentAmount: number;
  adjustmentCodes: Array<{
    code: string;
    group: string;
    reason: string;
    amount: number;
  }>;
  patientResponsibility: number;
  serviceLines: Array<{
    lineNumber: number;
    cptCode: string;
    chargeAmount: number;
    paidAmount: number;
    adjustments: Array<{
      code: string;
      reason: string;
      amount: number;
    }>;
    remarkCodes?: string[];
  }>;
}

// ============================================================================
// X12 837P GENERATION
// ============================================================================

/**
 * Generate X12 837P professional claim
 */
export async function generateX12Claim(
  tenantId: string,
  superbillId: string
): Promise<{ x12Content: string; controlNumbers: { isa: string; gs: string; st: string } }> {
  // Fetch superbill/claim data
  const superbillData = await fetchSuperbillData(tenantId, superbillId);
  if (!superbillData) {
    throw new Error(`Superbill ${superbillId} not found`);
  }

  // Get or create control numbers
  const controlNumbers = await getNextControlNumbers(tenantId);

  // Generate 837P segments
  const segments: string[] = [];

  // ISA - Interchange Control Header
  segments.push(formatISA(controlNumbers.isa, superbillData));

  // GS - Functional Group Header
  segments.push(formatGS(controlNumbers.gs, superbillData));

  // ST - Transaction Set Header
  segments.push(`ST*837*${controlNumbers.st.padStart(4, "0")}*005010X222A1~`);

  // BHT - Beginning of Hierarchical Transaction
  const bhtRef = crypto.randomBytes(4).toString("hex").toUpperCase();
  segments.push(`BHT*0019*00*${bhtRef}*${formatDate(new Date())}*${formatTime(new Date())}*CH~`);

  // Loop 1000A - Submitter Name
  segments.push(...formatLoop1000A(superbillData));

  // Loop 1000B - Receiver Name
  segments.push(...formatLoop1000B(superbillData));

  // Loop 2000A - Billing Provider Hierarchical Level
  segments.push(...formatLoop2000A(superbillData));

  // Loop 2000B - Subscriber Hierarchical Level
  segments.push(...formatLoop2000B(superbillData));

  // Loop 2300 - Claim Information
  segments.push(...formatLoop2300(superbillData));

  // Loop 2400 - Service Line Information
  let lineNumber = 1;
  for (const lineItem of superbillData.lineItems) {
    segments.push(...formatLoop2400(lineItem, lineNumber, superbillData));
    lineNumber++;
  }

  // SE - Transaction Set Trailer
  const segmentCount = segments.length + 1; // +1 for SE itself
  segments.push(`SE*${segmentCount}*${controlNumbers.st.padStart(4, "0")}~`);

  // GE - Functional Group Trailer
  segments.push(`GE*1*${controlNumbers.gs}~`);

  // IEA - Interchange Control Trailer
  segments.push(`IEA*1*${controlNumbers.isa.padStart(9, "0")}~`);

  return {
    x12Content: segments.join("\n"),
    controlNumbers: {
      isa: controlNumbers.isa,
      gs: controlNumbers.gs,
      st: controlNumbers.st,
    },
  };
}

function formatISA(controlNumber: string, data: SuperbillData): string {
  const isa = [
    "ISA",
    "00", // Authorization Info Qualifier
    " ".repeat(10), // Authorization Information
    "00", // Security Info Qualifier
    " ".repeat(10), // Security Information
    "ZZ", // Interchange ID Qualifier (Sender)
    (data.provider.npi || "").padEnd(15), // Interchange Sender ID
    "ZZ", // Interchange ID Qualifier (Receiver)
    (data.payer.payerId || "").padEnd(15), // Interchange Receiver ID
    formatDate(new Date()).substring(2), // Interchange Date (YYMMDD)
    formatTime(new Date()).substring(0, 4), // Interchange Time (HHMM)
    "^", // Repetition Separator
    "00501", // Interchange Control Version
    controlNumber.padStart(9, "0"), // Interchange Control Number
    "0", // Acknowledgment Requested
    "P", // Usage Indicator (P=Production, T=Test)
    ":", // Component Element Separator
  ];
  return isa.join("*") + "~";
}

function formatGS(controlNumber: string, data: SuperbillData): string {
  const gs = [
    "GS",
    "HC", // Functional Identifier Code (Health Care Claim)
    data.provider.npi || "", // Application Sender's Code
    data.payer.payerId || "", // Application Receiver's Code
    formatDate(new Date()), // Date
    formatTime(new Date()), // Time
    controlNumber, // Group Control Number
    "X", // Responsible Agency Code
    "005010X222A1", // Version/Release/Industry Identifier
  ];
  return gs.join("*") + "~";
}

function formatLoop1000A(data: SuperbillData): string[] {
  const segments: string[] = [];

  // NM1 - Submitter Name
  const submitterName = data.provider.organizationName ||
    `${data.provider.lastName} ${data.provider.firstName}`;
  segments.push(`NM1*41*2*${submitterName}*****46*${data.provider.npi}~`);

  // PER - Submitter Contact Information
  if (data.provider.phone) {
    const phone = data.provider.phone.replace(/\D/g, "");
    segments.push(`PER*IC*BILLING DEPT*TE*${phone}~`);
  }

  return segments;
}

function formatLoop1000B(data: SuperbillData): string[] {
  const segments: string[] = [];

  // NM1 - Receiver Name
  segments.push(`NM1*40*2*${data.payer.payerName}*****46*${data.payer.payerId}~`);

  return segments;
}

function formatLoop2000A(data: SuperbillData): string[] {
  const segments: string[] = [];

  // HL - Billing Provider Hierarchical Level
  segments.push(`HL*1**20*1~`);

  // PRV - Billing Provider Specialty Information
  if (data.provider.taxonomy) {
    segments.push(`PRV*BI*PXC*${data.provider.taxonomy}~`);
  }

  // NM1 - Billing Provider Name
  if (data.provider.organizationName) {
    segments.push(
      `NM1*85*2*${data.provider.organizationName}*****XX*${data.provider.npi}~`
    );
  } else {
    segments.push(
      `NM1*85*1*${data.provider.lastName}*${data.provider.firstName}****XX*${data.provider.npi}~`
    );
  }

  // N3 - Billing Provider Address
  if (data.provider.address) {
    segments.push(`N3*${data.provider.address}~`);
  }

  // N4 - Billing Provider City/State/Zip
  if (data.provider.city && data.provider.state && data.provider.zip) {
    segments.push(`N4*${data.provider.city}*${data.provider.state}*${data.provider.zip}~`);
  }

  // REF - Billing Provider Tax ID
  if (data.provider.taxId) {
    segments.push(`REF*EI*${data.provider.taxId}~`);
  }

  return segments;
}

function formatLoop2000B(data: SuperbillData): string[] {
  const segments: string[] = [];

  // HL - Subscriber Hierarchical Level
  segments.push(`HL*2*1*22*0~`);

  // SBR - Subscriber Information
  segments.push(`SBR*P*18*${data.patient.groupNumber || ""}******CI~`);

  // NM1 - Subscriber Name
  segments.push(
    `NM1*IL*1*${data.patient.lastName}*${data.patient.firstName}****MI*${data.patient.memberId}~`
  );

  // N3 - Subscriber Address
  if (data.patient.address) {
    segments.push(`N3*${data.patient.address}~`);
  }

  // N4 - Subscriber City/State/Zip
  if (data.patient.city && data.patient.state && data.patient.zip) {
    segments.push(`N4*${data.patient.city}*${data.patient.state}*${data.patient.zip}~`);
  }

  // DMG - Subscriber Demographic Information
  const genderCode = data.patient.sex === "M" ? "M" : data.patient.sex === "F" ? "F" : "U";
  segments.push(`DMG*D8*${formatDate(new Date(data.patient.dob))}*${genderCode}~`);

  // Loop 2010BB - Payer Name
  segments.push(`NM1*PR*2*${data.payer.payerName}*****PI*${data.payer.payerId}~`);

  if (data.payer.address) {
    segments.push(`N3*${data.payer.address}~`);
  }

  if (data.payer.city && data.payer.state && data.payer.zip) {
    segments.push(`N4*${data.payer.city}*${data.payer.state}*${data.payer.zip}~`);
  }

  return segments;
}

function formatLoop2300(data: SuperbillData): string[] {
  const segments: string[] = [];

  // CLM - Claim Information
  const claimId = crypto.randomBytes(8).toString("hex").toUpperCase();
  const totalCharge = data.totalCharges.toFixed(2);
  // Format: CLM*claim_id*charge_amount***place_of_service:B:1*Y*A*Y*Y~
  segments.push(`CLM*${claimId}*${totalCharge}***11:B:1*Y*A*Y*Y~`);

  // DTP - Date of Service
  segments.push(`DTP*431*D8*${formatDate(new Date(data.serviceDate))}~`);

  // HI - Health Care Diagnosis Codes
  const diagnosisCodes = data.diagnoses
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
    .map((dx, idx) => {
      const qualifier = idx === 0 ? "ABK" : "ABF";
      return `${qualifier}:${dx.code.replace(".", "")}`;
    });
  if (diagnosisCodes.length > 0) {
    segments.push(`HI*${diagnosisCodes.join("*")}~`);
  }

  return segments;
}

function formatLoop2400(
  lineItem: SuperbillData["lineItems"][0],
  lineNumber: number,
  data: SuperbillData
): string[] {
  const segments: string[] = [];

  // LX - Service Line Number
  segments.push(`LX*${lineNumber}~`);

  // SV1 - Professional Service
  const modifiers = lineItem.modifiers?.join(":") || "";
  const modifierPart = modifiers ? `:${modifiers}` : "";
  const diagnosisPointers = lineItem.diagnosisPointers.map((p) => p.toString()).join(":");
  const charge = lineItem.charge.toFixed(2);

  segments.push(
    `SV1*HC:${lineItem.cptCode}${modifierPart}*${charge}*UN*${lineItem.units}***${diagnosisPointers}~`
  );

  // DTP - Date of Service
  segments.push(`DTP*472*D8*${formatDate(new Date(data.serviceDate))}~`);

  return segments;
}

// ============================================================================
// CLAIM SUBMISSION
// ============================================================================

/**
 * Submit claim to clearinghouse
 */
export async function submitClaim(
  tenantId: string,
  claimId: string,
  clearinghouseId: string,
  userId: string
): Promise<ClaimSubmission> {
  // Get clearinghouse config
  const configResult = await pool.query(
    `SELECT id, name, type, api_endpoint, submission_method, sender_id, receiver_id
     FROM clearinghouse_configs
     WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [clearinghouseId, tenantId]
  );

  if (!configResult.rowCount) {
    throw new Error("Clearinghouse configuration not found or inactive");
  }

  const config = configResult.rows[0];

  // Check if claim exists and is ready for submission
  const claimResult = await pool.query(
    `SELECT c.id, c.claim_number, c.status, c.patient_id, c.total_charges,
            c.encounter_id, p.first_name, p.last_name
     FROM claims c
     JOIN patients p ON p.id = c.patient_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    throw new Error("Claim not found");
  }

  const claim = claimResult.rows[0];

  if (claim.status === "submitted" || claim.status === "accepted" || claim.status === "paid") {
    throw new Error(`Claim already ${claim.status}`);
  }

  // Generate X12 claim using encounter_id as superbill reference
  let x12Content: string | undefined;
  let controlNumbers: { isa: string; gs: string; st: string } | undefined;

  if (claim.encounter_id) {
    try {
      const x12Result = await generateX12Claim(tenantId, claim.encounter_id);
      x12Content = x12Result.x12Content;
      controlNumbers = x12Result.controlNumbers;
    } catch (err) {
      // Log but continue - claim can still be submitted without X12
      console.error("Failed to generate X12:", err);
    }
  }

  // Create submission record
  const submissionId = crypto.randomUUID();
  const submissionNumber = `SUB-${Date.now()}-${submissionId.substring(0, 8)}`;
  const x12ClaimId = `ICN-${Date.now()}`;

  // Mock submission based on clearinghouse type
  const mockResponse = await mockClearinghouseSubmission(config.type, claim);

  await pool.query(
    `INSERT INTO claim_submissions (
      id, tenant_id, claim_id, clearinghouse_id, submission_date,
      submission_number, x12_claim_id, isa_control_number, gs_control_number, st_control_number,
      x12_transaction_set, status, status_message, response_data, created_by
    ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      submissionId,
      tenantId,
      claimId,
      clearinghouseId,
      submissionNumber,
      x12ClaimId,
      controlNumbers?.isa,
      controlNumbers?.gs,
      controlNumbers?.st,
      x12Content,
      mockResponse.status,
      mockResponse.message,
      JSON.stringify(mockResponse),
      userId,
    ]
  );

  // Update claim status
  await pool.query(
    `UPDATE claims SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [claimId, tenantId]
  );

  // Add to claim status history
  await pool.query(
    `INSERT INTO claim_status_history (id, tenant_id, claim_id, status, notes, source, changed_by, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      crypto.randomUUID(),
      tenantId,
      claimId,
      "submitted",
      `Submitted to ${config.name} via ${config.type}. Control: ${x12ClaimId}`,
      "clearinghouse",
      userId,
    ]
  );

  await auditLog(tenantId, userId, "claim_submitted", "claim", claimId);

  return {
    id: submissionId,
    tenantId,
    claimId,
    clearinghouseId,
    submissionDate: new Date(),
    x12ClaimId,
    isaControlNumber: controlNumbers?.isa,
    gsControlNumber: controlNumbers?.gs,
    stControlNumber: controlNumbers?.st,
    status: mockResponse.status,
    statusMessage: mockResponse.message,
    responseData: mockResponse,
    retryCount: 0,
  };
}

/**
 * Check claim status with clearinghouse
 */
export async function checkClaimStatus(
  tenantId: string,
  claimId: string,
  userId?: string
): Promise<{
  status: string;
  statusCode?: string;
  statusMessage?: string;
  lastUpdated: Date;
  history: Array<{ status: string; date: Date; notes?: string }>;
}> {
  // Get latest submission
  const submissionResult = await pool.query(
    `SELECT cs.*, cc.name as clearinghouse_name, cc.type as clearinghouse_type
     FROM claim_submissions cs
     LEFT JOIN clearinghouse_configs cc ON cc.id = cs.clearinghouse_id
     WHERE cs.claim_id = $1 AND cs.tenant_id = $2
     ORDER BY cs.submission_date DESC
     LIMIT 1`,
    [claimId, tenantId]
  );

  if (!submissionResult.rowCount) {
    throw new Error("No submission found for this claim");
  }

  const submission = submissionResult.rows[0];

  // Mock status check (in production, this would call the clearinghouse API)
  const mockStatus = await mockClearinghouseStatusCheck(
    submission.clearinghouse_type,
    submission.x12_claim_id,
    submission.status
  );

  // Update submission if status changed
  if (mockStatus.status !== submission.status) {
    await pool.query(
      `UPDATE claim_submissions
       SET status = $1, status_code = $2, status_message = $3, updated_at = NOW(),
           response_data = response_data || $4::jsonb
       WHERE id = $5`,
      [
        mockStatus.status,
        mockStatus.statusCode,
        mockStatus.message,
        JSON.stringify({ statusUpdates: [{ date: new Date(), ...mockStatus }] }),
        submission.id,
      ]
    );

    // Update claim status if needed
    const claimStatus = mapClearinghouseStatusToClaimStatus(mockStatus.status);
    await pool.query(
      `UPDATE claims SET status = $1, updated_at = NOW() WHERE id = $2`,
      [claimStatus, claimId]
    );

    // Add to status history
    await pool.query(
      `INSERT INTO claim_status_history (id, tenant_id, claim_id, status, status_code, notes, source, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        crypto.randomUUID(),
        tenantId,
        claimId,
        claimStatus,
        mockStatus.statusCode,
        mockStatus.message,
        "clearinghouse",
        userId || "system",
      ]
    );
  }

  // Get status history
  const historyResult = await pool.query(
    `SELECT status, changed_at as date, notes, status_code as "statusCode"
     FROM claim_status_history
     WHERE claim_id = $1 AND tenant_id = $2
     ORDER BY changed_at DESC`,
    [claimId, tenantId]
  );

  return {
    status: mockStatus.status,
    statusCode: mockStatus.statusCode,
    statusMessage: mockStatus.message,
    lastUpdated: new Date(),
    history: historyResult.rows.map((h) => ({
      status: h.status,
      date: h.date,
      notes: h.notes,
    })),
  };
}

/**
 * Process ERA/835 remittance advice
 */
export async function processRemittance(
  tenantId: string,
  era835Data: string | RemittanceAdvice,
  userId: string
): Promise<{ id: string; claimId?: string; paymentAmount: number; status: string }> {
  let remittance: RemittanceAdvice;

  // Parse ERA if string (X12 835 format)
  if (typeof era835Data === "string") {
    remittance = parseERA835(era835Data);
  } else {
    remittance = era835Data;
  }

  const remittanceId = crypto.randomUUID();

  // Calculate totals
  const totalAdjustments = remittance.adjustmentCodes.reduce((sum, adj) => sum + adj.amount, 0);

  // Store remittance advice
  await pool.query(
    `INSERT INTO remittance_advices (
      id, tenant_id, claim_id, era_number, era_date, payment_amount, payment_amount_cents,
      adjustment_codes, total_adjustments_cents, patient_responsibility,
      patient_responsibility_cents, service_lines, status
    ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      remittanceId,
      tenantId,
      remittance.claimId || null,
      remittance.eraNumber,
      remittance.paymentAmount,
      Math.round(remittance.paymentAmount * 100),
      JSON.stringify(remittance.adjustmentCodes),
      Math.round(totalAdjustments * 100),
      remittance.patientResponsibility,
      Math.round(remittance.patientResponsibility * 100),
      JSON.stringify(remittance.serviceLines),
      "received",
    ]
  );

  // If claim ID is provided, update claim status
  if (remittance.claimId) {
    const claimStatus = remittance.paymentAmount > 0 ? "paid" : "denied";

    await pool.query(
      `UPDATE claims SET status = $1, paid_amount = $2, patient_responsibility = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [
        claimStatus,
        remittance.paymentAmount,
        remittance.patientResponsibility,
        remittance.claimId,
        tenantId,
      ]
    );

    // Add payment record
    if (remittance.paymentAmount > 0) {
      await pool.query(
        `INSERT INTO claim_payments (id, tenant_id, claim_id, amount_cents, payment_date, payment_method, payer, created_by)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, 'ERA', 'Insurance', $5)`,
        [
          crypto.randomUUID(),
          tenantId,
          remittance.claimId,
          Math.round(remittance.paymentAmount * 100),
          userId,
        ]
      );
    }

    // Add to status history
    await pool.query(
      `INSERT INTO claim_status_history (id, tenant_id, claim_id, status, notes, source, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        crypto.randomUUID(),
        tenantId,
        remittance.claimId,
        claimStatus,
        `ERA ${remittance.eraNumber}: Payment $${remittance.paymentAmount.toFixed(2)}`,
        "835",
        userId,
      ]
    );
  }

  await auditLog(tenantId, userId, "era_processed", "remittance_advice", remittanceId);

  return {
    id: remittanceId,
    claimId: remittance.claimId,
    paymentAmount: remittance.paymentAmount,
    status: "received",
  };
}

// ============================================================================
// BATCH SUBMISSION
// ============================================================================

/**
 * Submit multiple claims in a batch
 */
export async function submitBatch(
  tenantId: string,
  claimIds: string[],
  clearinghouseId: string,
  userId: string
): Promise<{
  batchId: string;
  totalClaims: number;
  submitted: number;
  failed: number;
  errors: Array<{ claimId: string; error: string }>;
}> {
  // Get clearinghouse config
  const configResult = await pool.query(
    `SELECT * FROM clearinghouse_configs WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [clearinghouseId, tenantId]
  );

  if (!configResult.rowCount) {
    throw new Error("Clearinghouse configuration not found");
  }

  const config = configResult.rows[0];

  // Create batch record
  const batchId = crypto.randomUUID();
  const batchNumber = `BATCH-${Date.now()}`;
  const controlNumbers = await getNextControlNumbers(tenantId);

  await pool.query(
    `INSERT INTO claim_submission_batches (
      id, tenant_id, clearinghouse_id, batch_number, total_claims, status,
      isa_control_number, gs_control_number, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      batchId,
      tenantId,
      clearinghouseId,
      batchNumber,
      claimIds.length,
      "submitted",
      controlNumbers.isa,
      controlNumbers.gs,
      userId,
    ]
  );

  const errors: Array<{ claimId: string; error: string }> = [];
  let submitted = 0;

  for (const claimId of claimIds) {
    try {
      await submitClaim(tenantId, claimId, clearinghouseId, userId);
      submitted++;

      // Link to batch
      await pool.query(
        `UPDATE claim_submissions SET submission_batch_id = $1 WHERE claim_id = $2 AND tenant_id = $3`,
        [batchId, claimId, tenantId]
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      errors.push({ claimId, error: errorMessage });
    }
  }

  // Update batch statistics
  await pool.query(
    `UPDATE claim_submission_batches
     SET submitted_count = $1, status = $2, submitted_at = NOW()
     WHERE id = $3`,
    [submitted, submitted === claimIds.length ? "submitted" : "partial", batchId]
  );

  await auditLog(tenantId, userId, "batch_submitted", "claim_submission_batch", batchId);

  return {
    batchId,
    totalClaims: claimIds.length,
    submitted,
    failed: errors.length,
    errors,
  };
}

/**
 * Get pending claims awaiting clearinghouse response
 */
export async function getPendingClaims(
  tenantId: string,
  options?: { clearinghouseId?: string; limit?: number }
): Promise<
  Array<{
    claimId: string;
    claimNumber: string;
    patientName: string;
    submittedAt: Date;
    status: string;
    daysPending: number;
  }>
> {
  let query = `
    SELECT
      cs.claim_id as "claimId",
      c.claim_number as "claimNumber",
      CONCAT(p.first_name, ' ', p.last_name) as "patientName",
      cs.submission_date as "submittedAt",
      cs.status,
      EXTRACT(DAY FROM NOW() - cs.submission_date)::INTEGER as "daysPending"
    FROM claim_submissions cs
    JOIN claims c ON c.id = cs.claim_id
    JOIN patients p ON p.id = c.patient_id
    WHERE cs.tenant_id = $1
      AND cs.status IN ('submitted', 'pending', 'pended', 'additional_info_requested')
  `;

  const params: (string | number)[] = [tenantId];
  let paramIndex = 2;

  if (options?.clearinghouseId) {
    query += ` AND cs.clearinghouse_id = $${paramIndex}`;
    params.push(options.clearinghouseId);
    paramIndex++;
  }

  query += ` ORDER BY cs.submission_date ASC`;

  if (options?.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(options.limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

// ============================================================================
// CLEARINGHOUSE MOCKS (For testing - replace with actual API calls)
// ============================================================================

async function mockClearinghouseSubmission(
  clearinghouseType: string,
  claim: Record<string, unknown>
): Promise<{ status: string; message: string; transactionId: string; acknowledgmentCode?: string }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Randomly simulate different responses
  const random = Math.random();

  if (random < 0.7) {
    // 70% accepted
    return {
      status: "accepted",
      message: `Claim accepted by ${clearinghouseType}`,
      transactionId: crypto.randomUUID(),
      acknowledgmentCode: "A",
    };
  } else if (random < 0.9) {
    // 20% pending
    return {
      status: "pending",
      message: "Claim received, pending payer review",
      transactionId: crypto.randomUUID(),
    };
  } else {
    // 10% rejected
    return {
      status: "rejected",
      message: "Claim rejected: Missing required information",
      transactionId: crypto.randomUUID(),
      acknowledgmentCode: "R",
    };
  }
}

async function mockClearinghouseStatusCheck(
  clearinghouseType: string,
  x12ClaimId: string,
  currentStatus: string
): Promise<{ status: string; statusCode: string; message: string }> {
  // Simulate status progression
  const statusProgression: Record<string, string[]> = {
    submitted: ["pending", "accepted"],
    pending: ["accepted", "pended"],
    accepted: ["paid", "denied"],
    pended: ["accepted", "denied"],
  };

  const possibleNext = statusProgression[currentStatus] || [currentStatus];
  const nextStatus = possibleNext[Math.floor(Math.random() * possibleNext.length)];

  const statusMessages: Record<string, { code: string; message: string }> = {
    pending: { code: "P1", message: "Claim pending payer review" },
    accepted: { code: "A1", message: "Claim accepted by payer" },
    pended: { code: "P2", message: "Claim pended - additional information requested" },
    paid: { code: "F1", message: "Claim finalized - payment processed" },
    denied: { code: "D1", message: "Claim denied - see denial reason codes" },
  };

  const statusInfo = nextStatus ? statusMessages[nextStatus] : undefined;

  return {
    status: nextStatus || currentStatus,
    statusCode: statusInfo?.code || "U1",
    message: statusInfo?.message || "Status unknown",
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchSuperbillData(
  tenantId: string,
  superbillId: string
): Promise<SuperbillData | null> {
  // Try to fetch from encounters first
  const encounterResult = await pool.query(
    `SELECT e.*, p.first_name, p.last_name, p.dob, p.sex, p.address, p.city, p.state, p.zip,
            pr.npi, pr.tax_id, pr.full_name as provider_name
     FROM encounters e
     JOIN patients p ON p.id = e.patient_id
     LEFT JOIN providers pr ON pr.id = e.provider_id
     WHERE e.id = $1 AND e.tenant_id = $2`,
    [superbillId, tenantId]
  );

  if (!encounterResult.rowCount) {
    return null;
  }

  const encounter = encounterResult.rows[0];

  // Get diagnoses
  const diagnosesResult = await pool.query(
    `SELECT icd10_code as code, description, is_primary as "isPrimary"
     FROM encounter_diagnoses
     WHERE encounter_id = $1 AND tenant_id = $2
     ORDER BY is_primary DESC`,
    [superbillId, tenantId]
  );

  // Get charges
  const chargesResult = await pool.query(
    `SELECT cpt_code as "cptCode", description, quantity, fee_cents / 100.0 as charge,
            linked_diagnosis_ids as "linkedDiagnosisIds"
     FROM charges
     WHERE encounter_id = $1 AND tenant_id = $2`,
    [superbillId, tenantId]
  );

  // Get patient insurance
  const insuranceResult = await pool.query(
    `SELECT insurance_details as details FROM patients WHERE id = $1 AND tenant_id = $2`,
    [encounter.patient_id, tenantId]
  );

  const insurance = insuranceResult.rows[0]?.details?.primary || {};

  return {
    id: superbillId,
    encounterId: superbillId,
    patientId: encounter.patient_id,
    providerId: encounter.provider_id,
    serviceDate: encounter.created_at,
    totalCharges: chargesResult.rows.reduce(
      (sum: number, c: { charge: number; quantity: number }) => sum + (c.charge * (c.quantity || 1)),
      0
    ),
    diagnoses: diagnosesResult.rows,
    lineItems: chargesResult.rows.map((c: Record<string, unknown>, idx: number) => ({
      cptCode: c.cptCode as string,
      modifiers: [],
      units: (c.quantity as number) || 1,
      charge: c.charge as number,
      diagnosisPointers: [idx + 1],
    })),
    patient: {
      firstName: encounter.first_name,
      lastName: encounter.last_name,
      dob: encounter.dob,
      sex: encounter.sex,
      address: encounter.address,
      city: encounter.city,
      state: encounter.state,
      zip: encounter.zip,
      memberId: insurance.policyNumber,
      groupNumber: insurance.groupNumber,
      payerName: insurance.planName,
      payerId: insurance.payer,
    },
    provider: {
      npi: encounter.npi || "1234567890",
      taxId: encounter.tax_id || "123456789",
      lastName: encounter.provider_name?.split(" ").pop(),
      firstName: encounter.provider_name?.split(" ")[0],
      taxonomy: "207ND0101X", // Dermatology
    },
    payer: {
      payerId: insurance.payer || "UNKNOWN",
      payerName: insurance.planName || "Unknown Payer",
    },
  };
}

async function getNextControlNumbers(
  tenantId: string,
  clearinghouseId?: string
): Promise<{ isa: string; gs: string; st: string }> {
  const result = await pool.query(
    `INSERT INTO x12_control_numbers (id, tenant_id, clearinghouse_id, isa_sequence, gs_sequence, st_sequence)
     VALUES ($1, $2, $3, 1, 1, 1)
     ON CONFLICT (tenant_id, clearinghouse_id) DO UPDATE
     SET isa_sequence = x12_control_numbers.isa_sequence + 1,
         gs_sequence = x12_control_numbers.gs_sequence + 1,
         st_sequence = x12_control_numbers.st_sequence + 1,
         updated_at = NOW()
     RETURNING isa_sequence, gs_sequence, st_sequence`,
    [crypto.randomUUID(), tenantId, clearinghouseId || null]
  );

  return {
    isa: result.rows[0].isa_sequence.toString(),
    gs: result.rows[0].gs_sequence.toString(),
    st: result.rows[0].st_sequence.toString(),
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 19).replace(/:/g, "");
}

function mapClearinghouseStatusToClaimStatus(clearinghouseStatus: string): string {
  const mapping: Record<string, string> = {
    accepted: "accepted",
    rejected: "rejected",
    pending: "submitted",
    pended: "submitted",
    paid: "paid",
    denied: "rejected",
    additional_info_requested: "submitted",
  };
  return mapping[clearinghouseStatus] || "submitted";
}

function parseERA835(era835Content: string): RemittanceAdvice {
  // Basic ERA 835 parser - in production, use a proper X12 parser library
  const segments = era835Content.split("~");

  let claimId = "";
  let eraNumber = "";
  let paymentAmount = 0;
  const adjustmentCodes: RemittanceAdvice["adjustmentCodes"] = [];
  let patientResponsibility = 0;
  const serviceLines: RemittanceAdvice["serviceLines"] = [];

  for (const segment of segments) {
    const elements = segment.split("*");
    const segmentId = elements[0];

    switch (segmentId) {
      case "TRN":
        eraNumber = elements[2] || "";
        break;
      case "CLP":
        claimId = elements[1] || "";
        paymentAmount = parseFloat(elements[4] || "0");
        patientResponsibility = parseFloat(elements[5] || "0");
        break;
      case "CAS":
        if (elements[1] && elements[2] && elements[3]) {
          adjustmentCodes.push({
            group: elements[1],
            code: elements[2],
            reason: elements[2],
            amount: parseFloat(elements[3]),
          });
        }
        break;
      case "SVC":
        serviceLines.push({
          lineNumber: serviceLines.length + 1,
          cptCode: elements[1]?.split(":")[1] || "",
          chargeAmount: parseFloat(elements[2] || "0"),
          paidAmount: parseFloat(elements[3] || "0"),
          adjustments: [],
        });
        break;
    }
  }

  return {
    claimId,
    eraNumber,
    paymentAmount,
    adjustmentCodes,
    patientResponsibility,
    serviceLines,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const clearinghouseService = {
  generateX12Claim,
  submitClaim,
  checkClaimStatus,
  processRemittance,
  submitBatch,
  getPendingClaims,
};

export default clearinghouseService;
