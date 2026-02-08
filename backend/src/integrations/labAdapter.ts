/**
 * Lab Integration Adapter
 *
 * Handles lab order transmission and result reception.
 * Supports LabCorp, Quest Diagnostics, and other lab vendors.
 * Uses HL7 messaging for interoperability.
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

// ============================================================================
// Types
// ============================================================================

export interface LabOrder {
  id?: string;
  patientId: string;
  providerId: string;
  encounterId?: string;
  labProvider: 'labcorp' | 'quest' | 'local' | string;
  tests: Array<{
    code: string;
    name: string;
    loincCode?: string;
    instructions?: string;
    frequency?: string;
  }>;
  diagnosisCodes: string[];
  priority: 'stat' | 'urgent' | 'routine';
  fastingRequired: boolean;
  specialInstructions?: string;
  collectionDate?: string;
  abnRequired?: boolean;
}

export interface LabOrderResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  externalOrderId?: string;
  status: 'pending' | 'sent' | 'acknowledged' | 'error';
  message?: string;
  errors?: Array<{ code: string; message: string }>;
  timestamp: string;
}

export interface LabOrderStatus {
  orderId: string;
  orderNumber: string;
  status: 'pending' | 'sent' | 'acknowledged' | 'in_progress' | 'completed' | 'cancelled';
  statusDate: string;
  estimatedCompletionDate?: string;
  specimenReceivedDate?: string;
  resultsAvailable: boolean;
}

export interface LabResult {
  testCode: string;
  testName: string;
  loincCode?: string;
  resultValue: string;
  resultValueNumeric?: number;
  unit?: string;
  referenceRange?: string;
  referenceLow?: number;
  referenceHigh?: number;
  abnormalFlag?: 'H' | 'L' | 'HH' | 'LL' | 'A' | 'N' | null;
  interpretation?: string;
  status: 'preliminary' | 'final' | 'corrected' | 'cancelled';
  performedAt?: string;
  resultedAt: string;
  performingLab?: string;
  notes?: string;
  isCritical: boolean;
}

export interface LabResultsBundle {
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  collectionDate: string;
  receivedDate: string;
  reportDate: string;
  status: string;
  results: LabResult[];
  performingLab: string;
  pathologist?: string;
  comments?: string;
}

export interface PendingLabResults {
  labProvider: string;
  resultsCount: number;
  results: LabResultsBundle[];
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_TESTS = [
  { code: '80053', name: 'Comprehensive Metabolic Panel', loincCode: '24323-8' },
  { code: '85025', name: 'Complete Blood Count with Differential', loincCode: '58410-2' },
  { code: '84443', name: 'Thyroid Stimulating Hormone (TSH)', loincCode: '3016-3' },
  { code: '82306', name: 'Vitamin D, 25-Hydroxy', loincCode: '1989-3' },
  { code: '80061', name: 'Lipid Panel', loincCode: '57698-3' },
  { code: '82465', name: 'Cholesterol, Total', loincCode: '2093-3' },
  { code: '84450', name: 'AST (SGOT)', loincCode: '1920-8' },
  { code: '84460', name: 'ALT (SGPT)', loincCode: '1742-6' },
  { code: '82247', name: 'Bilirubin, Total', loincCode: '1975-2' },
  { code: '84550', name: 'Uric Acid', loincCode: '3084-1' },
];

const ABNORMAL_FLAGS = {
  H: 'High',
  L: 'Low',
  HH: 'Critical High',
  LL: 'Critical Low',
  A: 'Abnormal',
  N: 'Normal',
};

// ============================================================================
// Lab Adapter
// ============================================================================

export class LabAdapter extends BaseAdapter {
  private labProvider: string;

  constructor(options: AdapterOptions & { labProvider?: string }) {
    super(options);
    this.labProvider = options.labProvider || 'labcorp';
  }

  getIntegrationType(): string {
    return 'lab';
  }

  getProvider(): string {
    return this.labProvider;
  }

  /**
   * Test connection to lab vendor
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      await this.sleep(300);
      return {
        success: true,
        message: `Connected to ${this.labProvider} (mock mode)`,
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
        message: `Connected to ${this.labProvider}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Create and submit a lab order
   */
  async createLabOrder(order: LabOrder): Promise<LabOrderResult> {
    const startTime = Date.now();
    const orderId = order.id || crypto.randomUUID();
    const orderNumber = `LAB-${Date.now()}-${orderId.substring(0, 8)}`;

    logger.info('Creating lab order', {
      orderId,
      patientId: order.patientId,
      labProvider: order.labProvider,
      testCount: order.tests.length,
    });

    try {
      let result: LabOrderResult;

      if (this.useMock) {
        result = await this.mockCreateOrder(order, orderId, orderNumber);
      } else {
        result = await this.withRetry(() =>
          this.realCreateOrder(order, orderId, orderNumber)
        );
      }

      // Store lab order
      await this.storeLabOrder(order, result);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/api/v1/orders',
        method: 'POST',
        request: {
          orderId,
          patientId: order.patientId,
          testCount: order.tests.length,
        },
        response: {
          status: result.status,
          orderNumber: result.orderNumber,
        },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
        correlationId: orderId,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to create lab order', { orderId, error: error.message });

      return {
        success: false,
        orderId,
        orderNumber,
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get status of a lab order
   */
  async getOrderStatus(orderId: string): Promise<LabOrderStatus> {
    const startTime = Date.now();

    logger.info('Getting lab order status', { orderId });

    try {
      // Get order from database
      const orderResult = await pool.query(
        `SELECT id, order_number, status, ordered_at, collected_at, results_received_at
         FROM lab_orders
         WHERE id = $1 AND tenant_id = $2`,
        [orderId, this.tenantId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Lab order not found');
      }

      const order = orderResult.rows[0];

      let status: LabOrderStatus;

      if (this.useMock) {
        status = await this.mockGetOrderStatus(order);
      } else {
        status = await this.withRetry(() => this.realGetOrderStatus(order));
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: `/api/v1/orders/${orderId}/status`,
        method: 'GET',
        request: { orderId },
        response: { status: status.status },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return status;
    } catch (error: any) {
      logger.error('Failed to get order status', { orderId, error: error.message });
      throw error;
    }
  }

  /**
   * Poll for and receive pending results from lab vendor
   */
  async receiveResults(labProvider?: string): Promise<PendingLabResults> {
    const startTime = Date.now();
    const provider = labProvider || this.labProvider;

    logger.info('Polling for lab results', { labProvider: provider });

    try {
      let pendingResults: PendingLabResults;

      if (this.useMock) {
        pendingResults = await this.mockReceiveResults(provider);
      } else {
        pendingResults = await this.withRetry(() =>
          this.realReceiveResults(provider)
        );
      }

      // Store received results
      for (const bundle of pendingResults.results) {
        await this.storeLabResults(bundle);
      }

      await this.logIntegration({
        direction: 'inbound',
        endpoint: '/api/v1/results/poll',
        method: 'GET',
        request: { labProvider: provider },
        response: { resultsCount: pendingResults.resultsCount },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return pendingResults;
    } catch (error: any) {
      logger.error('Failed to receive lab results', { labProvider: provider, error: error.message });
      return {
        labProvider: provider,
        resultsCount: 0,
        results: [],
      };
    }
  }

  /**
   * Parse HL7 lab results message
   */
  parseLabResults(hl7Message: string): LabResultsBundle | null {
    try {
      // Basic HL7 parsing - in production use a proper HL7 parser
      const segments = hl7Message.split('\r').filter(s => s.length > 0);
      const results: LabResult[] = [];
      let patientId = '';
      let patientName = '';
      let orderId = '';
      let collectionDate = '';

      for (const segment of segments) {
        const fields = segment.split('|');
        const segmentType = fields[0];

        if (segmentType === 'PID') {
          patientId = fields[3] || '';
          patientName = fields[5]?.replace('^', ', ') || '';
        } else if (segmentType === 'OBR') {
          orderId = fields[3] || '';
          collectionDate = fields[7] || '';
        } else if (segmentType === 'OBX') {
          const result: LabResult = {
            testCode: fields[3]?.split('^')[0] || '',
            testName: fields[3]?.split('^')[1] || '',
            loincCode: fields[3]?.split('^')[3],
            resultValue: fields[5] || '',
            resultValueNumeric: parseFloat(fields[5] || '') || undefined,
            unit: fields[6],
            referenceRange: fields[7],
            abnormalFlag: fields[8] as any,
            status: fields[11] === 'F' ? 'final' : 'preliminary',
            resultedAt: fields[14] || new Date().toISOString(),
            isCritical: fields[8] === 'HH' || fields[8] === 'LL',
          };

          // Parse reference range
          if (result.referenceRange) {
            const parts = result.referenceRange.split('-').map(s => parseFloat(s.trim()));
            const low = parts[0];
            const high = parts[1];
            if (low !== undefined && !isNaN(low)) result.referenceLow = low;
            if (high !== undefined && !isNaN(high)) result.referenceHigh = high;
          }

          results.push(result);
        }
      }

      if (results.length === 0) {
        return null;
      }

      return {
        orderId,
        orderNumber: orderId,
        patientId,
        patientName,
        collectionDate,
        receivedDate: new Date().toISOString(),
        reportDate: new Date().toISOString(),
        status: 'final',
        results,
        performingLab: this.labProvider,
      };
    } catch (error) {
      logger.error('Failed to parse HL7 message', { error });
      return null;
    }
  }

  /**
   * Match results to patient and attach to order
   */
  async matchResultsToPatient(results: LabResultsBundle): Promise<{
    matched: boolean;
    orderId?: string;
    patientId?: string;
    message: string;
  }> {
    try {
      // Try to match by order number first
      let orderResult = await pool.query(
        `SELECT lo.id, lo.patient_id, p.first_name, p.last_name
         FROM lab_orders lo
         JOIN patients p ON p.id = lo.patient_id
         WHERE lo.order_number = $1 AND lo.tenant_id = $2`,
        [results.orderNumber, this.tenantId]
      );

      if (orderResult.rows.length === 0 && results.patientId) {
        // Try to match by patient ID
        orderResult = await pool.query(
          `SELECT lo.id, lo.patient_id, p.first_name, p.last_name
           FROM lab_orders lo
           JOIN patients p ON p.id = lo.patient_id
           WHERE p.mrn = $1 AND lo.tenant_id = $2
             AND lo.status IN ('sent', 'acknowledged', 'in_progress')
           ORDER BY lo.ordered_at DESC
           LIMIT 1`,
          [results.patientId, this.tenantId]
        );
      }

      if (orderResult.rows.length === 0) {
        return {
          matched: false,
          message: `No matching order found for order number: ${results.orderNumber}`,
        };
      }

      const order = orderResult.rows[0];

      // Update order with results
      await pool.query(
        `UPDATE lab_orders
         SET status = 'completed', results_received_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );

      // Store results
      await this.storeLabResults({
        ...results,
        orderId: order.id,
        patientId: order.patient_id,
      });

      return {
        matched: true,
        orderId: order.id,
        patientId: order.patient_id,
        message: `Results matched to patient: ${order.first_name} ${order.last_name}`,
      };
    } catch (error: any) {
      logger.error('Failed to match results', { error: error.message });
      return {
        matched: false,
        message: error.message,
      };
    }
  }

  // ============================================================================
  // Mock Implementations
  // ============================================================================

  private async mockCreateOrder(
    order: LabOrder,
    orderId: string,
    orderNumber: string
  ): Promise<LabOrderResult> {
    await this.sleep(500 + Math.random() * 1000);

    // 95% success rate
    const success = Math.random() < 0.95;

    return {
      success,
      orderId,
      orderNumber,
      externalOrderId: `EXT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      status: success ? 'sent' : 'error',
      message: success
        ? `Order transmitted to ${order.labProvider}`
        : 'Failed to transmit order - connection timeout',
      errors: success ? undefined : [{ code: 'LAB-001', message: 'Connection timeout' }],
      timestamp: new Date().toISOString(),
    };
  }

  private async mockGetOrderStatus(order: any): Promise<LabOrderStatus> {
    await this.sleep(300 + Math.random() * 500);

    // Simulate status progression
    const hoursSinceOrder = (Date.now() - new Date(order.ordered_at).getTime()) / (1000 * 60 * 60);
    let status: LabOrderStatus['status'];

    if (order.results_received_at) {
      status = 'completed';
    } else if (hoursSinceOrder > 48) {
      status = 'completed';
    } else if (hoursSinceOrder > 24) {
      status = 'in_progress';
    } else if (hoursSinceOrder > 4) {
      status = 'acknowledged';
    } else {
      status = 'sent';
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status,
      statusDate: new Date().toISOString(),
      estimatedCompletionDate: status === 'completed'
        ? undefined
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      specimenReceivedDate: hoursSinceOrder > 12
        ? new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
        : undefined,
      resultsAvailable: status === 'completed',
    };
  }

  private async mockReceiveResults(labProvider: string): Promise<PendingLabResults> {
    await this.sleep(1000 + Math.random() * 1500);

    // Get pending orders that should have results
    const pendingOrders = await pool.query(
      `SELECT id, order_number, patient_id, tests, ordered_at
       FROM lab_orders
       WHERE tenant_id = $1 AND lab_provider = $2
         AND status IN ('sent', 'acknowledged', 'in_progress')
         AND ordered_at < NOW() - INTERVAL '24 hours'
       LIMIT 10`,
      [this.tenantId, labProvider]
    );

    const bundles: LabResultsBundle[] = [];

    for (const order of pendingOrders.rows) {
      const tests = order.tests || [];
      const results: LabResult[] = [];

      for (const test of tests) {
        const mockTest = MOCK_TESTS.find(t => t.code === test.code) || MOCK_TESTS[0]!;
        const value = this.generateMockResultValue(mockTest.code);

        results.push({
          testCode: mockTest.code,
          testName: mockTest.name,
          loincCode: mockTest.loincCode,
          resultValue: value.value,
          resultValueNumeric: value.numeric,
          unit: value.unit,
          referenceRange: value.referenceRange,
          referenceLow: value.referenceLow,
          referenceHigh: value.referenceHigh,
          abnormalFlag: value.abnormalFlag,
          status: 'final',
          resultedAt: new Date().toISOString(),
          performingLab: labProvider,
          isCritical: value.abnormalFlag === 'HH' || value.abnormalFlag === 'LL',
        });
      }

      // Get patient info
      const patientResult = await pool.query(
        `SELECT first_name, last_name FROM patients WHERE id = $1`,
        [order.patient_id]
      );
      const patient = patientResult.rows[0];

      bundles.push({
        orderId: order.id,
        orderNumber: order.order_number,
        patientId: order.patient_id,
        patientName: patient ? `${patient.last_name}, ${patient.first_name}` : 'Unknown',
        collectionDate: new Date(order.ordered_at).toISOString(),
        receivedDate: new Date().toISOString(),
        reportDate: new Date().toISOString(),
        status: 'final',
        results,
        performingLab: labProvider,
      });
    }

    return {
      labProvider,
      resultsCount: bundles.length,
      results: bundles,
    };
  }

  private generateMockResultValue(testCode: string): {
    value: string;
    numeric?: number;
    unit?: string;
    referenceRange?: string;
    referenceLow?: number;
    referenceHigh?: number;
    abnormalFlag?: 'H' | 'L' | 'HH' | 'LL' | 'A' | 'N' | null;
  } {
    // Generate realistic mock values based on test
    const testValues: Record<string, any> = {
      '82465': { // Cholesterol
        low: 150, high: 200, min: 100, max: 350, unit: 'mg/dL',
      },
      '84443': { // TSH
        low: 0.4, high: 4.0, min: 0.1, max: 10, unit: 'mIU/L',
      },
      '82306': { // Vitamin D
        low: 30, high: 100, min: 10, max: 150, unit: 'ng/mL',
      },
      '84450': { // AST
        low: 10, high: 40, min: 5, max: 200, unit: 'U/L',
      },
      '84460': { // ALT
        low: 7, high: 56, min: 5, max: 200, unit: 'U/L',
      },
    };

    const defaultValues = { low: 0, high: 100, min: 0, max: 150, unit: 'units' };
    const config = testValues[testCode] || defaultValues;

    const value = config.min + Math.random() * (config.max - config.min);
    const roundedValue = Math.round(value * 10) / 10;

    let abnormalFlag: 'H' | 'L' | 'HH' | 'LL' | null = null;
    if (roundedValue > config.high * 2) abnormalFlag = 'HH';
    else if (roundedValue > config.high) abnormalFlag = 'H';
    else if (roundedValue < config.low * 0.5) abnormalFlag = 'LL';
    else if (roundedValue < config.low) abnormalFlag = 'L';

    return {
      value: `${roundedValue}`,
      numeric: roundedValue,
      unit: config.unit,
      referenceRange: `${config.low} - ${config.high}`,
      referenceLow: config.low,
      referenceHigh: config.high,
      abnormalFlag,
    };
  }

  // ============================================================================
  // Real API Implementations (placeholders)
  // ============================================================================

  private async realCreateOrder(
    order: LabOrder,
    orderId: string,
    orderNumber: string
  ): Promise<LabOrderResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realGetOrderStatus(order: any): Promise<LabOrderStatus> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realReceiveResults(labProvider: string): Promise<PendingLabResults> {
    throw new Error('Real API not implemented - use mock mode');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async storeLabOrder(order: LabOrder, result: LabOrderResult): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO lab_orders
         (id, tenant_id, patient_id, provider_id, encounter_id, lab_provider,
          order_number, external_order_id, tests, diagnosis_codes, priority,
          fasting_required, special_instructions, status, transmission_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           external_order_id = EXCLUDED.external_order_id,
           transmission_status = EXCLUDED.transmission_status,
           transmitted_at = NOW(),
           updated_at = NOW()`,
        [
          result.orderId,
          this.tenantId,
          order.patientId,
          order.providerId,
          order.encounterId,
          order.labProvider,
          result.orderNumber,
          result.externalOrderId,
          JSON.stringify(order.tests),
          order.diagnosisCodes,
          order.priority,
          order.fastingRequired,
          order.specialInstructions,
          result.status,
          result.success ? 'success' : 'error',
        ]
      );
    } catch (error) {
      logger.error('Failed to store lab order', { error });
    }
  }

  private async storeLabResults(bundle: LabResultsBundle): Promise<void> {
    try {
      for (const result of bundle.results) {
        await pool.query(
          `INSERT INTO lab_results
           (order_id, tenant_id, test_code, test_name, loinc_code,
            result_value, result_value_numeric, unit, reference_range,
            reference_low, reference_high, abnormal_flag, interpretation,
            status, performed_at, resulted_at, performing_lab, notes, is_critical)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            bundle.orderId,
            this.tenantId,
            result.testCode,
            result.testName,
            result.loincCode,
            result.resultValue,
            result.resultValueNumeric,
            result.unit,
            result.referenceRange,
            result.referenceLow,
            result.referenceHigh,
            result.abnormalFlag,
            result.interpretation,
            result.status,
            result.performedAt,
            result.resultedAt,
            result.performingLab || bundle.performingLab,
            result.notes,
            result.isCritical,
          ]
        );
      }

      // Update order status
      await pool.query(
        `UPDATE lab_orders
         SET status = 'completed', results_received_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [bundle.orderId]
      );
    } catch (error) {
      logger.error('Failed to store lab results', { error });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createLabAdapter(
  tenantId: string,
  labProvider: string = 'labcorp',
  useMock: boolean = true
): LabAdapter {
  return new LabAdapter({
    tenantId,
    labProvider,
    useMock,
  });
}
