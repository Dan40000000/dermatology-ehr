/**
 * Mock Surescripts Network Service
 * Simulates Surescripts/NCPDP connectivity for e-prescribing
 *
 * In production, this would integrate with actual Surescripts API
 * For demo purposes, this provides realistic mocked responses
 */

import crypto from 'crypto';
import { pool } from '../db/pool';

export interface NCPDPScriptMessage {
  messageId: string;
  relatesToMessageId?: string;
  sentTime: string;
  from: {
    ncpdpId?: string;
    npi?: string;
    name: string;
  };
  to: {
    ncpdpId: string;
    name: string;
  };
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    address?: any;
  };
  prescription: any;
}

export interface RxHistoryResponse {
  messageId: string;
  patientId: string;
  medications: Array<{
    medicationName: string;
    genericName?: string;
    ndc?: string;
    strength?: string;
    dosageForm?: string;
    quantity: number;
    daysSupply?: number;
    sig?: string;
    prescriberName: string;
    prescriberNpi?: string;
    pharmacyName: string;
    pharmacyNcpdp: string;
    fillDate: string;
    fillNumber: number;
    refillsRemaining: number;
    writtenDate?: string;
    prescribedDate?: string;
  }>;
}

export interface FormularyCheckResponse {
  messageId: string;
  medicationName: string;
  ndc?: string;
  formularyStatus: 'preferred' | 'covered' | 'not_covered' | 'prior_auth_required';
  tier: number;
  copayAmount?: number;
  requiresPriorAuth: boolean;
  requiresStepTherapy: boolean;
  quantityLimit?: number;
  alternatives: Array<{
    medicationName: string;
    tier: number;
    copayAmount?: number;
    reason: string;
  }>;
}

export interface PatientBenefitsResponse {
  messageId: string;
  patientId: string;
  coverage: {
    isActive: boolean;
    payerName: string;
    planName: string;
    memberId: string;
    groupNumber?: string;
    pharmacyNetwork: string;
    rxBin: string;
    rxPcn: string;
    rxGroup: string;
  };
  benefits: {
    tier1Copay: number;
    tier2Copay: number;
    tier3Copay: number;
    tier4Copay: number;
    tier5Copay?: number;
    deductibleAmount: number;
    deductibleMet: number;
    deductibleRemaining: number;
    outOfPocketMax: number;
    outOfPocketMet: number;
  };
}

/**
 * Mock: Send new prescription to pharmacy via NCPDP SCRIPT
 * Simulates 95% success rate
 */
export async function sendNewRx(
  prescriptionId: string,
  pharmacyNcpdp: string,
  prescriptionData: any
): Promise<{ success: boolean; messageId: string; error?: string }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

  // 95% success rate
  const isSuccess = Math.random() < 0.95;

  const messageId = `MOCK-${crypto.randomUUID()}`;

  if (!isSuccess) {
    return {
      success: false,
      messageId,
      error: 'Pharmacy system temporarily unavailable. Please retry.',
    };
  }

  // Log transaction
  try {
    await pool.query(
      `INSERT INTO surescripts_transactions (
        transaction_type, direction, message_id, to_ncpdp,
        prescription_id, message_payload, status, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        'rx_new',
        'outbound',
        messageId,
        pharmacyNcpdp,
        prescriptionId,
        JSON.stringify(prescriptionData),
        'completed',
      ]
    );

    // Create transmission record
    await pool.query(
      `INSERT INTO prescription_transmissions (
        prescription_id, pharmacy_ncpdp, transmission_id,
        status, transmission_type, sent_at, acknowledged_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [prescriptionId, pharmacyNcpdp, messageId, 'accepted', 'new_rx']
    );
  } catch (error) {
    console.error('Error logging Surescripts transaction:', error);
  }

  return {
    success: true,
    messageId,
  };
}

/**
 * Mock: Retrieve patient medication history from all pharmacies
 * Simulates Surescripts RxHistoryRequest
 */
export async function getRxHistory(patientId: string, tenantId: string): Promise<RxHistoryResponse> {
  const messageId = `RXHIST-${crypto.randomUUID()}`;

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 1000));

  try {
    // Get from database
    const result = await pool.query(
      `SELECT
        rh.*,
        p.name as pharmacy_name
      FROM rx_history rh
      LEFT JOIN pharmacies p ON rh.pharmacy_id = p.id
      WHERE rh.patient_id = $1 AND rh.tenant_id = $2
      ORDER BY rh.fill_date DESC
      LIMIT 100`,
      [patientId, tenantId]
    );

    const medications = result.rows.map((row: any) => ({
      medicationName: row.medication_name,
      genericName: row.generic_name,
      ndc: row.ndc,
      strength: row.strength,
      dosageForm: row.dosage_form,
      quantity: parseFloat(row.quantity),
      daysSupply: row.days_supply,
      sig: row.sig,
      prescriberName: row.prescriber_name || 'Unknown Prescriber',
      prescriberNpi: row.prescriber_npi,
      pharmacyName: row.pharmacy_name || row.pharmacy_name,
      pharmacyNcpdp: row.pharmacy_ncpdp,
      fillDate: row.fill_date,
      fillNumber: row.fill_number,
      refillsRemaining: row.refills_remaining,
      writtenDate: row.written_date,
      prescribedDate: row.prescribed_date,
    }));

    // Log transaction
    await pool.query(
      `INSERT INTO surescripts_transactions (
        tenant_id, transaction_type, direction, message_id,
        patient_id, message_payload, status, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        tenantId,
        'rx_history',
        'outbound',
        messageId,
        patientId,
        JSON.stringify({ patientId }),
        'completed',
      ]
    );

    return {
      messageId,
      patientId,
      medications,
    };
  } catch (error) {
    console.error('Error fetching Rx history:', error);
    throw error;
  }
}

/**
 * Mock: Check insurance formulary for medication
 */
export async function checkFormulary(
  medicationName: string,
  payerId?: string,
  ndc?: string
): Promise<FormularyCheckResponse> {
  const messageId = `FORM-${crypto.randomUUID()}`;

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 400));

  // Mock formulary logic - simulate different tiers and coverage
  const mockFormularyData = generateMockFormulary(medicationName, ndc);

  return {
    messageId,
    medicationName,
    ndc,
    ...mockFormularyData,
  };
}

/**
 * Mock: Get patient pharmacy benefits
 */
export async function getPatientBenefits(
  patientId: string,
  tenantId: string
): Promise<PatientBenefitsResponse | null> {
  const messageId = `ELIG-${crypto.randomUUID()}`;

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1200 + 800));

  try {
    // Check if we have benefits on file
    const result = await pool.query(
      `SELECT * FROM patient_benefits
       WHERE patient_id = $1 AND tenant_id = $2 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [patientId, tenantId]
    );

    if (result.rows.length === 0) {
      // Return mock data if no benefits on file
      return generateMockBenefits(patientId);
    }

    const benefits = result.rows[0];

    return {
      messageId,
      patientId,
      coverage: {
        isActive: benefits.is_active,
        payerName: benefits.payer_name || 'Mock Insurance Co.',
        planName: benefits.plan_name || 'Standard Plan',
        memberId: benefits.member_id || 'MOCK123456',
        groupNumber: benefits.group_number,
        pharmacyNetwork: benefits.pharmacy_network || 'National Network',
        rxBin: benefits.rx_bin || '123456',
        rxPcn: benefits.rx_pcn || 'MOCK',
        rxGroup: benefits.rx_group || 'RXGROUP',
      },
      benefits: {
        tier1Copay: parseFloat(benefits.tier_1_copay) || 10,
        tier2Copay: parseFloat(benefits.tier_2_copay) || 30,
        tier3Copay: parseFloat(benefits.tier_3_copay) || 60,
        tier4Copay: parseFloat(benefits.tier_4_copay) || 100,
        tier5Copay: parseFloat(benefits.tier_5_copay) || 150,
        deductibleAmount: parseFloat(benefits.deductible_amount) || 500,
        deductibleMet: parseFloat(benefits.deductible_met) || 0,
        deductibleRemaining: parseFloat(benefits.deductible_remaining) || 500,
        outOfPocketMax: parseFloat(benefits.out_of_pocket_max) || 3000,
        outOfPocketMet: parseFloat(benefits.out_of_pocket_met) || 0,
      },
    };
  } catch (error) {
    console.error('Error fetching patient benefits:', error);
    return generateMockBenefits(patientId);
  }
}

/**
 * Helper: Generate mock formulary data
 */
function generateMockFormulary(medicationName: string, ndc?: string): Omit<FormularyCheckResponse, 'messageId' | 'medicationName' | 'ndc'> {
  // Common dermatology medications and their typical formulary status
  const dermFormularyRules: { [key: string]: any } = {
    tretinoin: { tier: 2, status: 'covered', copay: 30 },
    hydrocortisone: { tier: 1, status: 'preferred', copay: 10 },
    triamcinolone: { tier: 1, status: 'preferred', copay: 10 },
    clobetasol: { tier: 2, status: 'covered', copay: 30 },
    mupirocin: { tier: 2, status: 'covered', copay: 30 },
    clindamycin: { tier: 1, status: 'preferred', copay: 10 },
    doxycycline: { tier: 1, status: 'preferred', copay: 10 },
    ketoconazole: { tier: 2, status: 'covered', copay: 30 },
    terbinafine: { tier: 2, status: 'covered', copay: 30 },
    fluorouracil: { tier: 3, status: 'covered', copay: 60 },
    imiquimod: { tier: 3, status: 'prior_auth_required', copay: 60, priorAuth: true },
    tacrolimus: { tier: 3, status: 'prior_auth_required', copay: 60, priorAuth: true },
    methotrexate: { tier: 2, status: 'covered', copay: 30 },
    isotretinoin: { tier: 4, status: 'prior_auth_required', copay: 100, priorAuth: true },
  };

  // Find matching rule
  const medLower = medicationName.toLowerCase();
  let matchedRule = null;

  for (const [key, value] of Object.entries(dermFormularyRules)) {
    if (medLower.includes(key)) {
      matchedRule = value;
      break;
    }
  }

  // Default to tier 2 if no match
  if (!matchedRule) {
    matchedRule = { tier: 2, status: 'covered', copay: 30 };
  }

  const alternatives = [];

  // Generate alternatives for higher tiers
  if (matchedRule.tier >= 3) {
    alternatives.push({
      medicationName: `Generic alternative to ${medicationName.split(' ')[0]}`,
      tier: 1,
      copayAmount: 10,
      reason: 'Lower cost generic available',
    });
  }

  return {
    formularyStatus: matchedRule.status,
    tier: matchedRule.tier,
    copayAmount: matchedRule.copay,
    requiresPriorAuth: matchedRule.priorAuth || false,
    requiresStepTherapy: matchedRule.tier >= 4,
    quantityLimit: matchedRule.tier >= 3 ? 30 : undefined,
    alternatives,
  };
}

/**
 * Helper: Generate mock patient benefits
 */
function generateMockBenefits(patientId: string): PatientBenefitsResponse {
  return {
    messageId: `MOCK-${crypto.randomUUID()}`,
    patientId,
    coverage: {
      isActive: true,
      payerName: 'Mock Health Insurance',
      planName: 'PPO Standard',
      memberId: `MEM${Math.floor(Math.random() * 1000000)}`,
      groupNumber: `GRP${Math.floor(Math.random() * 10000)}`,
      pharmacyNetwork: 'National Preferred Network',
      rxBin: '610020',
      rxPcn: 'PRIME',
      rxGroup: 'STDGRP',
    },
    benefits: {
      tier1Copay: 10,
      tier2Copay: 30,
      tier3Copay: 60,
      tier4Copay: 100,
      tier5Copay: 150,
      deductibleAmount: 500,
      deductibleMet: Math.floor(Math.random() * 300),
      deductibleRemaining: 500 - Math.floor(Math.random() * 300),
      outOfPocketMax: 3000,
      outOfPocketMet: Math.floor(Math.random() * 1000),
    },
  };
}

/**
 * Mock: Cancel prescription transmission
 */
export async function cancelRx(
  prescriptionId: string,
  transmissionId: string,
  reason: string
): Promise<{ success: boolean; messageId: string }> {
  const messageId = `CANCEL-${crypto.randomUUID()}`;

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 600 + 300));

  try {
    await pool.query(
      `UPDATE prescription_transmissions
       SET status = 'cancelled', error_message = $1, updated_at = CURRENT_TIMESTAMP
       WHERE transmission_id = $2`,
      [reason, transmissionId]
    );

    await pool.query(
      `INSERT INTO surescripts_transactions (
        transaction_type, direction, message_id, relate_to_message_id,
        prescription_id, message_payload, status, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        'rx_cancel',
        'outbound',
        messageId,
        transmissionId,
        prescriptionId,
        JSON.stringify({ reason }),
        'completed',
      ]
    );

    return {
      success: true,
      messageId,
    };
  } catch (error) {
    console.error('Error canceling Rx:', error);
    throw error;
  }
}

/**
 * Mock: Check for drug interactions
 */
export async function checkDrugInteractions(
  medicationName: string,
  patientCurrentMeds: string[]
): Promise<Array<{ severity: string; description: string; medication: string }>> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 400 + 200));

  const interactions = [];

  // Mock interaction rules
  const interactionRules: { [key: string]: { [key: string]: any } } = {
    isotretinoin: {
      doxycycline: {
        severity: 'severe',
        description: 'Increased risk of pseudotumor cerebri (intracranial hypertension)',
      },
      methotrexate: {
        severity: 'moderate',
        description: 'May increase risk of hepatotoxicity',
      },
    },
    methotrexate: {
      isotretinoin: {
        severity: 'moderate',
        description: 'May increase risk of hepatotoxicity',
      },
    },
  };

  const medLower = medicationName.toLowerCase();

  for (const currentMed of patientCurrentMeds) {
    const currentLower = currentMed.toLowerCase();

    // Check for known interactions
    for (const [drug1, interactions] of Object.entries(interactionRules)) {
      if (medLower.includes(drug1)) {
        for (const [drug2, interaction] of Object.entries(interactions)) {
          if (currentLower.includes(drug2)) {
            interactions.push({
              severity: interaction.severity,
              description: interaction.description,
              medication: currentMed,
            });
          }
        }
      }
    }
  }

  return interactions;
}
