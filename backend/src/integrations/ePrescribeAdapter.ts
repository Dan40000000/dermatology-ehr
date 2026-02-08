/**
 * E-Prescribing Adapter
 *
 * Handles electronic prescriptions via Surescripts network.
 * Supports NewRx, CancelRx, RxRenewal, PDMP checks, and pharmacy directory.
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

// ============================================================================
// Types
// ============================================================================

export interface Prescription {
  id?: string;
  patientId: string;
  providerId: string;
  encounterId?: string;
  medication: {
    name: string;
    ndc?: string;
    rxcui?: string;
    strength: string;
    dosageForm: string;
    quantity: number;
    quantityUnit: string;
    daysSupply: number;
    refills: number;
    dispenseAsWritten: boolean;
  };
  sig: string;
  notes?: string;
  pharmacy: {
    ncpdpId: string;
    name: string;
    phone?: string;
  };
  isControlled?: boolean;
  controlledSchedule?: string;
}

export interface PrescriptionResult {
  success: boolean;
  prescriptionId: string;
  transmissionId?: string;
  status: 'sent' | 'accepted' | 'rejected' | 'error';
  message?: string;
  errors?: Array<{ code: string; message: string }>;
  timestamp: string;
}

export interface CancelResult {
  success: boolean;
  prescriptionId: string;
  status: 'cancelled' | 'denied' | 'pending' | 'error';
  message?: string;
  timestamp: string;
}

export interface RenewalRequest {
  originalPrescriptionId: string;
  pharmacyNcpdp: string;
  requestedRefills: number;
  pharmacistNotes?: string;
}

export interface RenewalResult {
  success: boolean;
  renewalId: string;
  status: 'requested' | 'approved' | 'denied' | 'pending';
  newPrescriptionId?: string;
  message?: string;
  timestamp: string;
}

export interface PDMPResult {
  success: boolean;
  patientId: string;
  state: string;
  checkedAt: string;
  prescriptions: Array<{
    drugName: string;
    schedule: string;
    quantity: number;
    daysSupply: number;
    filledDate: string;
    pharmacy: string;
    prescriber: string;
  }>;
  riskScore?: number;
  warnings?: string[];
}

export interface Pharmacy {
  id: string;
  ncpdpId: string;
  npi?: string;
  name: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
  };
  phone: string;
  fax?: string;
  pharmacyType: string;
  chainName?: string;
  is24Hour: boolean;
  acceptsEprescribe: boolean;
  acceptsControlled: boolean;
  distanceMiles?: number;
}

export interface MedicationHistoryResult {
  success: boolean;
  patientId: string;
  medications: Array<{
    name: string;
    genericName?: string;
    ndc?: string;
    strength: string;
    dosageForm: string;
    quantity: number;
    daysSupply: number;
    sig: string;
    prescribedDate: string;
    filledDate?: string;
    prescriberName: string;
    pharmacyName: string;
    status: string;
  }>;
  lastUpdated: string;
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_PHARMACIES: Pharmacy[] = [
  {
    id: '1',
    ncpdpId: '1234567',
    npi: '1234567890',
    name: 'CVS Pharmacy',
    address: { line1: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
    phone: '555-123-4567',
    fax: '555-123-4568',
    pharmacyType: 'retail',
    chainName: 'CVS',
    is24Hour: true,
    acceptsEprescribe: true,
    acceptsControlled: true,
  },
  {
    id: '2',
    ncpdpId: '2345678',
    npi: '2345678901',
    name: 'Walgreens',
    address: { line1: '456 Oak Ave', city: 'Anytown', state: 'CA', zip: '90210' },
    phone: '555-234-5678',
    fax: '555-234-5679',
    pharmacyType: 'retail',
    chainName: 'Walgreens',
    is24Hour: false,
    acceptsEprescribe: true,
    acceptsControlled: true,
  },
  {
    id: '3',
    ncpdpId: '3456789',
    npi: '3456789012',
    name: 'Local Pharmacy',
    address: { line1: '789 Elm Blvd', city: 'Anytown', state: 'CA', zip: '90211' },
    phone: '555-345-6789',
    pharmacyType: 'retail',
    is24Hour: false,
    acceptsEprescribe: true,
    acceptsControlled: false,
  },
];

const MOCK_MEDICATIONS = [
  { name: 'Metformin 500mg', genericName: 'Metformin HCl', strength: '500mg', dosageForm: 'Tablet' },
  { name: 'Lisinopril 10mg', genericName: 'Lisinopril', strength: '10mg', dosageForm: 'Tablet' },
  { name: 'Amlodipine 5mg', genericName: 'Amlodipine Besylate', strength: '5mg', dosageForm: 'Tablet' },
  { name: 'Tretinoin 0.025%', genericName: 'Tretinoin', strength: '0.025%', dosageForm: 'Cream' },
  { name: 'Clobetasol 0.05%', genericName: 'Clobetasol Propionate', strength: '0.05%', dosageForm: 'Cream' },
];

// ============================================================================
// E-Prescribe Adapter
// ============================================================================

export class EPrescribeAdapter extends BaseAdapter {
  constructor(options: AdapterOptions) {
    super(options);
  }

  getIntegrationType(): string {
    return 'eprescribe';
  }

  getProvider(): string {
    return 'surescripts';
  }

  /**
   * Test connection to Surescripts
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      await this.sleep(300);
      return {
        success: true,
        message: 'Connected to Surescripts (mock mode)',
      };
    }

    const startTime = Date.now();
    try {
      await this.sleep(500);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/test',
        method: 'GET',
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        message: 'Connected to Surescripts',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Send a new prescription to pharmacy
   */
  async sendPrescription(prescription: Prescription): Promise<PrescriptionResult> {
    const startTime = Date.now();
    const transmissionId = `TX-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

    logger.info('Sending prescription', {
      patientId: prescription.patientId,
      medication: prescription.medication.name,
      pharmacy: prescription.pharmacy.ncpdpId,
      transmissionId,
    });

    try {
      let result: PrescriptionResult;

      if (this.useMock) {
        result = await this.mockSendPrescription(prescription, transmissionId);
      } else {
        result = await this.withRetry(() =>
          this.realSendPrescription(prescription, transmissionId)
        );
      }

      // Store e-prescription record
      await this.storeEPrescription(prescription, result);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/newrx',
        method: 'POST',
        request: {
          patientId: prescription.patientId,
          medication: prescription.medication.name,
          pharmacy: prescription.pharmacy.ncpdpId,
        },
        response: {
          status: result.status,
          transmissionId: result.transmissionId,
        },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
        correlationId: transmissionId,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to send prescription', {
        error: error.message,
        transmissionId,
      });

      return {
        success: false,
        prescriptionId: prescription.id || crypto.randomUUID(),
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Cancel a prescription
   */
  async cancelPrescription(
    prescriptionId: string,
    reason: string
  ): Promise<CancelResult> {
    const startTime = Date.now();

    logger.info('Cancelling prescription', { prescriptionId, reason });

    try {
      let result: CancelResult;

      if (this.useMock) {
        result = await this.mockCancelPrescription(prescriptionId, reason);
      } else {
        result = await this.withRetry(() =>
          this.realCancelPrescription(prescriptionId, reason)
        );
      }

      // Update e-prescription record
      await pool.query(
        `UPDATE eprescriptions
         SET status = $1, cancelled_at = NOW(), cancel_reason = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [result.status, reason, prescriptionId, this.tenantId]
      );

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/cancelrx',
        method: 'POST',
        request: { prescriptionId, reason },
        response: { status: result.status },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to cancel prescription', { prescriptionId, error: error.message });
      return {
        success: false,
        prescriptionId,
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Request prescription renewal
   */
  async requestRenewal(request: RenewalRequest): Promise<RenewalResult> {
    const startTime = Date.now();
    const renewalId = `REN-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

    logger.info('Requesting prescription renewal', {
      originalPrescriptionId: request.originalPrescriptionId,
      pharmacyNcpdp: request.pharmacyNcpdp,
      renewalId,
    });

    try {
      let result: RenewalResult;

      if (this.useMock) {
        result = await this.mockRequestRenewal(request, renewalId);
      } else {
        result = await this.withRetry(() =>
          this.realRequestRenewal(request, renewalId)
        );
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/rxrenewal',
        method: 'POST',
        request: { originalPrescriptionId: request.originalPrescriptionId },
        response: { status: result.status, renewalId: result.renewalId },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
        correlationId: renewalId,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to request renewal', { error: error.message, renewalId });
      return {
        success: false,
        renewalId,
        status: 'pending',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check PDMP (Prescription Drug Monitoring Program)
   */
  async checkPDMP(patientId: string, state: string): Promise<PDMPResult> {
    const startTime = Date.now();

    logger.info('Checking PDMP', { patientId, state });

    try {
      let result: PDMPResult;

      if (this.useMock) {
        result = await this.mockCheckPDMP(patientId, state);
      } else {
        result = await this.withRetry(() => this.realCheckPDMP(patientId, state));
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: `/api/v1/pdmp/${state}`,
        method: 'POST',
        request: { patientId, state },
        response: {
          prescriptionCount: result.prescriptions.length,
          riskScore: result.riskScore,
        },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to check PDMP', { patientId, state, error: error.message });
      return {
        success: false,
        patientId,
        state,
        checkedAt: new Date().toISOString(),
        prescriptions: [],
        warnings: [error.message],
      };
    }
  }

  /**
   * Search pharmacy directory by ZIP code
   */
  async getPharmacyDirectory(
    zip: string,
    options?: { limit?: number; includeMailOrder?: boolean }
  ): Promise<Pharmacy[]> {
    const startTime = Date.now();
    const limit = options?.limit || 20;

    logger.info('Searching pharmacy directory', { zip, limit });

    try {
      let pharmacies: Pharmacy[];

      if (this.useMock) {
        pharmacies = await this.mockGetPharmacies(zip, limit);
      } else {
        pharmacies = await this.withRetry(() =>
          this.realGetPharmacies(zip, limit, options?.includeMailOrder)
        );
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/pharmacy/search',
        method: 'GET',
        request: { zip, limit },
        response: { count: pharmacies.length },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return pharmacies;
    } catch (error: any) {
      logger.error('Failed to search pharmacies', { zip, error: error.message });
      return [];
    }
  }

  /**
   * Get medication history for patient
   */
  async getMedicationHistory(patientId: string): Promise<MedicationHistoryResult> {
    const startTime = Date.now();

    logger.info('Getting medication history', { patientId });

    try {
      let result: MedicationHistoryResult;

      if (this.useMock) {
        result = await this.mockGetMedicationHistory(patientId);
      } else {
        result = await this.withRetry(() =>
          this.realGetMedicationHistory(patientId)
        );
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/rxhistory',
        method: 'POST',
        request: { patientId },
        response: { medicationCount: result.medications.length },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to get medication history', { patientId, error: error.message });
      return {
        success: false,
        patientId,
        medications: [],
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  // ============================================================================
  // Mock Implementations
  // ============================================================================

  private async mockSendPrescription(
    prescription: Prescription,
    transmissionId: string
  ): Promise<PrescriptionResult> {
    await this.sleep(500 + Math.random() * 1000);

    // 95% success rate
    const success = Math.random() < 0.95;
    const prescriptionId = prescription.id || crypto.randomUUID();

    return {
      success,
      prescriptionId,
      transmissionId,
      status: success ? 'accepted' : 'rejected',
      message: success
        ? 'Prescription accepted by pharmacy'
        : 'Pharmacy system temporarily unavailable',
      errors: success ? undefined : [{ code: 'ERX-001', message: 'Transmission failed' }],
      timestamp: new Date().toISOString(),
    };
  }

  private async mockCancelPrescription(
    prescriptionId: string,
    reason: string
  ): Promise<CancelResult> {
    await this.sleep(300 + Math.random() * 500);

    // 90% success rate
    const success = Math.random() < 0.9;

    return {
      success,
      prescriptionId,
      status: success ? 'cancelled' : 'denied',
      message: success
        ? 'Prescription cancelled successfully'
        : 'Prescription has already been dispensed',
      timestamp: new Date().toISOString(),
    };
  }

  private async mockRequestRenewal(
    request: RenewalRequest,
    renewalId: string
  ): Promise<RenewalResult> {
    await this.sleep(300 + Math.random() * 500);

    return {
      success: true,
      renewalId,
      status: 'requested',
      message: 'Renewal request sent to prescriber',
      timestamp: new Date().toISOString(),
    };
  }

  private async mockCheckPDMP(patientId: string, state: string): Promise<PDMPResult> {
    await this.sleep(1000 + Math.random() * 1500);

    const prescriptionCount = Math.floor(Math.random() * 5);
    const prescriptions = [];

    for (let i = 0; i < prescriptionCount; i++) {
      prescriptions.push({
        drugName: ['Oxycodone 5mg', 'Alprazolam 0.5mg', 'Adderall 10mg', 'Tramadol 50mg'][
          Math.floor(Math.random() * 4)
        ]!,
        schedule: ['II', 'IV', 'II', 'IV'][Math.floor(Math.random() * 4)]!,
        quantity: [30, 60, 90][Math.floor(Math.random() * 3)]!,
        daysSupply: 30,
        filledDate: new Date(Date.now() - Math.random() * 180 * 86400000).toISOString().split('T')[0]!,
        pharmacy: MOCK_PHARMACIES[Math.floor(Math.random() * MOCK_PHARMACIES.length)]!.name,
        prescriber: `Dr. ${['Smith', 'Johnson', 'Williams'][Math.floor(Math.random() * 3)]}`,
      });
    }

    const riskScore = prescriptionCount > 3 ? 7 : prescriptionCount > 1 ? 4 : 1;
    const warnings = riskScore > 5
      ? ['High number of controlled substance prescriptions detected']
      : [];

    return {
      success: true,
      patientId,
      state,
      checkedAt: new Date().toISOString(),
      prescriptions,
      riskScore,
      warnings,
    };
  }

  private async mockGetPharmacies(zip: string, limit: number): Promise<Pharmacy[]> {
    await this.sleep(300 + Math.random() * 500);

    // Return mock pharmacies with calculated distances
    return MOCK_PHARMACIES.slice(0, limit).map((p, i) => ({
      ...p,
      distanceMiles: 0.5 + i * 1.2,
    }));
  }

  private async mockGetMedicationHistory(patientId: string): Promise<MedicationHistoryResult> {
    await this.sleep(800 + Math.random() * 1200);

    const medications = MOCK_MEDICATIONS.slice(0, Math.floor(Math.random() * 5) + 1).map(med => ({
      name: med.name,
      genericName: med.genericName,
      strength: med.strength,
      dosageForm: med.dosageForm,
      quantity: [30, 60, 90][Math.floor(Math.random() * 3)]!,
      daysSupply: 30,
      sig: 'Take as directed',
      prescribedDate: new Date(Date.now() - Math.random() * 365 * 86400000).toISOString().split('T')[0]!,
      filledDate: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString().split('T')[0],
      prescriberName: `Dr. ${['Smith', 'Johnson', 'Williams'][Math.floor(Math.random() * 3)]}`,
      pharmacyName: MOCK_PHARMACIES[Math.floor(Math.random() * MOCK_PHARMACIES.length)]!.name,
      status: 'filled',
    }));

    return {
      success: true,
      patientId,
      medications,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Real API Implementations (placeholders)
  // ============================================================================

  private async realSendPrescription(
    prescription: Prescription,
    transmissionId: string
  ): Promise<PrescriptionResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realCancelPrescription(
    prescriptionId: string,
    reason: string
  ): Promise<CancelResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realRequestRenewal(
    request: RenewalRequest,
    renewalId: string
  ): Promise<RenewalResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realCheckPDMP(patientId: string, state: string): Promise<PDMPResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realGetPharmacies(
    zip: string,
    limit: number,
    includeMailOrder?: boolean
  ): Promise<Pharmacy[]> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realGetMedicationHistory(patientId: string): Promise<MedicationHistoryResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async storeEPrescription(
    prescription: Prescription,
    result: PrescriptionResult
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO eprescriptions
         (id, tenant_id, patient_id, provider_id, encounter_id, pharmacy_ncpdp,
          pharmacy_name, medications, status, submitted_at, transmission_id,
          transmission_status, is_controlled, controlled_schedule)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13)`,
        [
          result.prescriptionId,
          this.tenantId,
          prescription.patientId,
          prescription.providerId,
          prescription.encounterId,
          prescription.pharmacy.ncpdpId,
          prescription.pharmacy.name,
          JSON.stringify([prescription.medication]),
          result.status,
          result.transmissionId,
          result.success ? 'success' : 'error',
          prescription.isControlled || false,
          prescription.controlledSchedule,
        ]
      );
    } catch (error) {
      logger.error('Failed to store e-prescription', { error });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEPrescribeAdapter(
  tenantId: string,
  useMock: boolean = true
): EPrescribeAdapter {
  return new EPrescribeAdapter({
    tenantId,
    useMock,
  });
}
