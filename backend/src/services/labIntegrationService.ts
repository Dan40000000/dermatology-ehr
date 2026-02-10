/**
 * Lab and Pathology Integration Service
 * Comprehensive service for lab order management, HL7 processing, and result handling
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { parseHL7Message, generateACK, parseHL7DateTime, type HL7Message, type OBXSegment } from './hl7Parser';
import crypto from 'crypto';

// Types
export interface LabTest {
  testCode: string;
  testName: string;
  specimenType?: string;
  priority?: string;
}

export interface CreateLabOrderParams {
  patientId: string;
  encounterId?: string;
  orderingProviderId: string;
  labId?: string;
  tests: LabTest[];
  priority?: 'routine' | 'urgent' | 'stat';
  clinicalIndication?: string;
  clinicalNotes?: string;
  icd10Codes?: string[];
  isFasting?: boolean;
  specimens?: SpecimenData[];
}

export interface SpecimenData {
  specimenId?: string;
  specimenType: string;
  specimenSite?: string;
  collectionDate?: Date;
  collectedBy?: string;
}

export interface LabOrderResult {
  id: string;
  orderNumber: string;
  status: string;
  tests: LabTest[];
}

export interface HL7ResultData {
  orderId?: string;
  patientId?: string;
  mrn?: string;
  testCode: string;
  testName: string;
  resultValue: string;
  resultValueNumeric?: number;
  units?: string;
  referenceRange?: string;
  abnormalFlags?: string[];
  resultStatus: string;
  observationDateTime?: Date;
  performingLab?: string;
}

export interface AbnormalResult {
  resultId: string;
  testName: string;
  resultValue: string;
  units?: string;
  referenceRange?: string;
  abnormalFlags: string[];
  isCritical: boolean;
  message: string;
}

export interface NotificationParams {
  orderId: string;
  orderType: 'lab' | 'pathology';
  patientId: string;
  providerId?: string;
  notificationType: 'new_result' | 'abnormal' | 'critical' | 'pathology_complete' | 'malignant' | 'requires_review' | 'amended';
  priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
  message: string;
  notificationMethod?: 'in_app' | 'email' | 'sms';
}

// LabCorp-specific message format constants
const LABCORP_SENDING_APPLICATION = 'LABCORP';
const LABCORP_SENDING_FACILITY = 'LABCORP_NATIONAL';

// Quest-specific message format constants
const QUEST_SENDING_APPLICATION = 'QUESTDIAG';
const QUEST_SENDING_FACILITY = 'QUEST_NATIONAL';

/**
 * Lab Integration Service Class
 */
export class LabIntegrationService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Create a new lab order
   */
  async createLabOrder(params: CreateLabOrderParams): Promise<LabOrderResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const orderNumber = this.generateOrderNumber();
      const specimens = params.specimens ? JSON.stringify(params.specimens) : null;

      // Insert lab order
      const orderResult = await client.query(
        `INSERT INTO lab_orders_v2 (
          tenant_id, patient_id, encounter_id, ordering_provider_id, lab_id,
          order_number, status, priority, specimens, clinical_indication,
          clinical_notes, icd10_codes, is_fasting, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb[], $10, $11, $12, $13, $4)
        RETURNING *`,
        [
          this.tenantId,
          params.patientId,
          params.encounterId || null,
          params.orderingProviderId,
          params.labId || null,
          orderNumber,
          'pending',
          params.priority || 'routine',
          specimens ? `{${specimens}}` : null,
          params.clinicalIndication || null,
          params.clinicalNotes || null,
          params.icd10Codes || null,
          params.isFasting || false
        ]
      );

      const orderId = orderResult.rows[0]?.id;

      if (!orderId) {
        throw new Error('Failed to create lab order');
      }

      // Insert lab order tests if lab_order_tests table exists
      for (const test of params.tests) {
        try {
          await client.query(
            `INSERT INTO lab_order_tests (
              lab_order_id, test_code, test_name, status
            ) VALUES ($1, $2, $3, 'pending')`,
            [orderId, test.testCode, test.testName]
          );
        } catch {
          // Table may not exist, continue without error
          logger.debug('lab_order_tests table not found, skipping test insertion');
        }
      }

      await client.query('COMMIT');

      logger.info('Lab order created', { orderId, orderNumber, tenantId: this.tenantId });

      return {
        id: orderId,
        orderNumber,
        status: 'pending',
        tests: params.tests
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating lab order', { error: (error as Error).message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Send lab order to external lab via HL7
   */
  async sendToLab(orderId: string, labId: string): Promise<{ success: boolean; messageId: string; acknowledgment?: string }> {
    try {
      // Get order details
      const orderResult = await pool.query(
        `SELECT lo.*,
          p.id as patient_uuid, p.mrn, p.first_name as patient_first_name,
          p.last_name as patient_last_name, p.dob, p.gender,
          pr.id as provider_uuid, pr.npi, pr.first_name as provider_first_name,
          pr.last_name as provider_last_name,
          li.lab_name, li.interface_type, li.endpoint, li.hl7_version
        FROM lab_orders_v2 lo
        JOIN patients p ON lo.patient_id = p.id
        JOIN providers pr ON lo.ordering_provider_id = pr.id
        LEFT JOIN lab_interfaces li ON li.id = $2
        WHERE lo.id = $1 AND lo.tenant_id = $3`,
        [orderId, labId, this.tenantId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Lab order not found');
      }

      const order = orderResult.rows[0];

      // Get tests for this order
      let tests: LabTest[] = [];
      try {
        const testsResult = await pool.query(
          `SELECT test_code, test_name FROM lab_order_tests WHERE lab_order_id = $1`,
          [orderId]
        );
        tests = testsResult.rows.map(t => ({
          testCode: t.test_code,
          testName: t.test_name
        }));
      } catch {
        // Fall back to specimens if no tests table
        tests = [{ testCode: 'PANEL', testName: 'Lab Panel' }];
      }

      // Generate HL7 ORM^O01 message
      const hl7Message = this.generateLabOrderHL7(order, tests);
      const messageId = crypto.randomUUID().substring(0, 20);

      // Log outbound message
      await pool.query(
        `INSERT INTO lab_hl7_messages (
          tenant_id, message_type, message_direction, message_control_id,
          order_id, order_type, lab_interface_id, raw_message, status
        ) VALUES ($1, 'ORM^O01', 'outbound', $2, $3, 'lab', $4, $5, 'sent')`,
        [this.tenantId, messageId, orderId, labId, hl7Message]
      );

      // Update order status
      await pool.query(
        `UPDATE lab_orders_v2
        SET status = 'sent', lab_id = $1, hl7_message_id = $2, hl7_sent_at = NOW(), updated_at = NOW()
        WHERE id = $3`,
        [labId, messageId, orderId]
      );

      // Mock successful transmission (in production, would send via MLLP)
      const mockAck = `MSH|^~\\&|${order.lab_name || 'LAB'}|LAB|DERMEHR|CLINIC|${new Date().toISOString()}||ACK^O01|${messageId}|P|2.5.1\rMSA|AA|${messageId}`;

      logger.info('Lab order sent to lab', { orderId, labId, messageId });

      return {
        success: true,
        messageId,
        acknowledgment: mockAck
      };
    } catch (error) {
      logger.error('Error sending lab order', { error: (error as Error).message, orderId, labId });
      throw error;
    }
  }

  /**
   * Receive and process incoming HL7 ORU result message
   */
  async receiveResults(hl7Message: string, labSource?: string): Promise<{ success: boolean; resultsCount: number; orderId?: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Parse the HL7 message
      const parsedMessage = parseHL7Message(hl7Message);

      // Determine lab source from message if not provided
      const sendingApplication = parsedMessage.sendingApplication || labSource || 'UNKNOWN';
      const isLabCorp = sendingApplication.toUpperCase().includes('LABCORP');
      const isQuest = sendingApplication.toUpperCase().includes('QUEST');

      // Log inbound message
      await client.query(
        `INSERT INTO lab_hl7_messages (
          tenant_id, message_type, message_direction, message_control_id,
          raw_message, parsed_data, status
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, 'received')`,
        [
          this.tenantId,
          parsedMessage.messageType,
          parsedMessage.messageControlId,
          hl7Message,
          JSON.stringify(parsedMessage)
        ]
      );

      // Extract patient and order info
      const patientInfo = parsedMessage.segments.PID;
      const mrn = patientInfo?.internalPatientId || patientInfo?.externalPatientId;

      // Try to match to existing order
      const matchResult = await this.matchResultToOrder({
        mrn,
        messageControlId: parsedMessage.messageControlId,
        sendingFacility: parsedMessage.sendingFacility
      });

      let orderId = matchResult?.orderId;
      let patientId = matchResult?.patientId;

      // If no match found, try to find patient by MRN
      if (!patientId && mrn) {
        const patientResult = await client.query(
          `SELECT id FROM patients WHERE mrn = $1 AND tenant_id = $2 LIMIT 1`,
          [mrn, this.tenantId]
        );
        patientId = patientResult.rows[0]?.id;
      }

      if (!patientId) {
        throw new Error(`Patient not found for MRN: ${mrn}`);
      }

      // Process OBX segments (observations/results)
      const obxSegments = parsedMessage.segments.OBX || [];
      let resultsCount = 0;

      for (const obx of obxSegments) {
        const resultData = this.parseOBXSegment(obx, isLabCorp, isQuest);

        // Insert result
        await client.query(
          `INSERT INTO lab_results_v2 (
            tenant_id, order_id, patient_id, result_date, result_status,
            result_data, test_code, test_name, result_value, result_value_numeric,
            result_unit, reference_range_text, abnormal_flags, hl7_message_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id`,
          [
            this.tenantId,
            orderId || null,
            patientId,
            resultData.observationDateTime || new Date(),
            resultData.resultStatus === 'F' ? 'final' : 'preliminary',
            JSON.stringify(resultData),
            resultData.testCode,
            resultData.testName,
            resultData.resultValue,
            resultData.resultValueNumeric || null,
            resultData.units || null,
            resultData.referenceRange || null,
            resultData.abnormalFlags || null,
            parsedMessage.messageControlId
          ]
        );

        resultsCount++;

        // Flag abnormals
        if (resultData.abnormalFlags && resultData.abnormalFlags.length > 0) {
          const insertedResult = await client.query(
            `SELECT id FROM lab_results_v2
            WHERE hl7_message_id = $1 AND test_code = $2 AND tenant_id = $3
            ORDER BY created_at DESC LIMIT 1`,
            [parsedMessage.messageControlId, resultData.testCode, this.tenantId]
          );

          if (insertedResult.rows[0]?.id) {
            await this.flagAbnormals(insertedResult.rows[0].id, client);
          }
        }
      }

      // Update order status if we have an order
      if (orderId) {
        await client.query(
          `UPDATE lab_orders_v2
          SET status = 'received', results_received_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
          [orderId]
        );
      }

      // Update HL7 message status
      await client.query(
        `UPDATE lab_hl7_messages
        SET status = 'processed', order_id = $1, processed_at = NOW()
        WHERE message_control_id = $2 AND tenant_id = $3`,
        [orderId, parsedMessage.messageControlId, this.tenantId]
      );

      await client.query('COMMIT');

      logger.info('Lab results received and processed', {
        resultsCount,
        orderId,
        messageId: parsedMessage.messageControlId
      });

      return {
        success: true,
        resultsCount,
        orderId
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error receiving lab results', { error: (error as Error).message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Match incoming result to existing order
   */
  async matchResultToOrder(params: {
    mrn?: string;
    messageControlId?: string;
    sendingFacility?: string;
    externalOrderId?: string;
  }): Promise<{ orderId: string; patientId: string } | null> {
    try {
      // Try to match by external order ID first
      if (params.externalOrderId) {
        const result = await pool.query(
          `SELECT id, patient_id FROM lab_orders_v2
          WHERE external_order_id = $1 AND tenant_id = $2 LIMIT 1`,
          [params.externalOrderId, this.tenantId]
        );
        if (result.rows.length > 0) {
          return { orderId: result.rows[0].id, patientId: result.rows[0].patient_id };
        }
      }

      // Try to match by HL7 message ID
      if (params.messageControlId) {
        const result = await pool.query(
          `SELECT id, patient_id FROM lab_orders_v2
          WHERE hl7_message_id LIKE $1 AND tenant_id = $2 LIMIT 1`,
          [`%${params.messageControlId.substring(0, 10)}%`, this.tenantId]
        );
        if (result.rows.length > 0) {
          return { orderId: result.rows[0].id, patientId: result.rows[0].patient_id };
        }
      }

      // Try to match by MRN and recent order
      if (params.mrn) {
        const result = await pool.query(
          `SELECT lo.id, lo.patient_id FROM lab_orders_v2 lo
          JOIN patients p ON lo.patient_id = p.id
          WHERE p.mrn = $1 AND lo.tenant_id = $2
          AND lo.status IN ('sent', 'received', 'processing')
          ORDER BY lo.order_date DESC LIMIT 1`,
          [params.mrn, this.tenantId]
        );
        if (result.rows.length > 0) {
          return { orderId: result.rows[0].id, patientId: result.rows[0].patient_id };
        }
      }

      return null;
    } catch (error) {
      logger.error('Error matching result to order', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Flag abnormal results and create notifications
   */
  async flagAbnormals(resultId: string, existingClient?: any): Promise<AbnormalResult | null> {
    const client = existingClient || await pool.connect();
    const shouldRelease = !existingClient;

    try {
      // Get result details
      const resultQuery = await client.query(
        `SELECT lr.*, lo.ordering_provider_id, p.first_name, p.last_name
        FROM lab_results_v2 lr
        LEFT JOIN lab_orders_v2 lo ON lr.order_id = lo.id
        LEFT JOIN patients p ON lr.patient_id = p.id
        WHERE lr.id = $1 AND lr.tenant_id = $2`,
        [resultId, this.tenantId]
      );

      if (resultQuery.rows.length === 0) {
        return null;
      }

      const result = resultQuery.rows[0];
      const abnormalFlags = result.abnormal_flags || [];

      // Determine if critical
      const criticalFlags = ['HH', 'LL', 'AA', '!!', 'CRIT'];
      const isCritical = abnormalFlags.some((flag: string) =>
        criticalFlags.includes(flag.toUpperCase())
      );

      // Build abnormal result info
      const abnormalResult: AbnormalResult = {
        resultId,
        testName: result.test_name,
        resultValue: result.result_value,
        units: result.result_unit,
        referenceRange: result.reference_range_text,
        abnormalFlags,
        isCritical,
        message: this.buildAbnormalMessage(result, isCritical)
      };

      // Update result with critical flag
      if (isCritical) {
        await client.query(
          `UPDATE lab_results_v2 SET critical_flags = $1, updated_at = NOW() WHERE id = $2`,
          [abnormalFlags, resultId]
        );
      }

      // Create notification for provider
      if (result.ordering_provider_id) {
        const notificationType = isCritical ? 'critical' : 'abnormal';
        const priority = isCritical ? 'critical' : 'high';

        await this.createNotification({
          orderId: result.order_id,
          orderType: 'lab',
          patientId: result.patient_id,
          providerId: result.ordering_provider_id,
          notificationType,
          priority,
          message: abnormalResult.message,
          notificationMethod: isCritical ? 'sms' : 'in_app'
        }, client);
      }

      return abnormalResult;
    } finally {
      if (shouldRelease) {
        client.release();
      }
    }
  }

  /**
   * Notify provider of results
   */
  async notifyProvider(resultId: string): Promise<{ sent: boolean; method: string }> {
    try {
      const resultQuery = await pool.query(
        `SELECT lr.*, lo.ordering_provider_id, lo.id as order_id,
          pr.email as provider_email, pr.first_name as provider_first_name
        FROM lab_results_v2 lr
        LEFT JOIN lab_orders_v2 lo ON lr.order_id = lo.id
        LEFT JOIN providers pr ON lo.ordering_provider_id = pr.id
        WHERE lr.id = $1 AND lr.tenant_id = $2`,
        [resultId, this.tenantId]
      );

      if (resultQuery.rows.length === 0) {
        throw new Error('Result not found');
      }

      const result = resultQuery.rows[0];

      if (!result.ordering_provider_id) {
        return { sent: false, method: 'none' };
      }

      const isCritical = result.critical_flags && result.critical_flags.length > 0;
      const isAbnormal = result.abnormal_flags && result.abnormal_flags.length > 0;

      await this.createNotification({
        orderId: result.order_id,
        orderType: 'lab',
        patientId: result.patient_id,
        providerId: result.ordering_provider_id,
        notificationType: isCritical ? 'critical' : isAbnormal ? 'abnormal' : 'new_result',
        priority: isCritical ? 'critical' : isAbnormal ? 'high' : 'normal',
        message: `Lab result available: ${result.test_name} - ${result.result_value} ${result.result_unit || ''}`,
        notificationMethod: isCritical ? 'sms' : 'in_app'
      });

      logger.info('Provider notified of result', { resultId, providerId: result.ordering_provider_id });

      return { sent: true, method: isCritical ? 'sms' : 'in_app' };
    } catch (error) {
      logger.error('Error notifying provider', { error: (error as Error).message, resultId });
      throw error;
    }
  }

  /**
   * Notify patient of results (for portal notifications)
   */
  async notifyPatient(resultId: string): Promise<{ sent: boolean; method: string }> {
    try {
      const resultQuery = await pool.query(
        `SELECT lr.*, lo.id as order_id, p.email, p.phone, p.first_name,
          lr.result_status
        FROM lab_results_v2 lr
        LEFT JOIN lab_orders_v2 lo ON lr.order_id = lo.id
        LEFT JOIN patients p ON lr.patient_id = p.id
        WHERE lr.id = $1 AND lr.tenant_id = $2`,
        [resultId, this.tenantId]
      );

      if (resultQuery.rows.length === 0) {
        throw new Error('Result not found');
      }

      const result = resultQuery.rows[0];

      // Only notify for final results
      if (result.result_status !== 'final') {
        return { sent: false, method: 'none' };
      }

      // Create patient notification
      await this.createNotification({
        orderId: result.order_id,
        orderType: 'lab',
        patientId: result.patient_id,
        notificationType: 'new_result',
        priority: 'normal',
        message: `Your lab results are ready to view in the patient portal.`,
        notificationMethod: result.email ? 'email' : 'in_app'
      });

      logger.info('Patient notified of result', { resultId, patientId: result.patient_id });

      return { sent: true, method: result.email ? 'email' : 'in_app' };
    } catch (error) {
      logger.error('Error notifying patient', { error: (error as Error).message, resultId });
      throw error;
    }
  }

  /**
   * Get pending pathology/biopsies awaiting results
   */
  async getPendingBiopsies(): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT po.*,
          p.first_name || ' ' || p.last_name as patient_name,
          p.mrn,
          pr.first_name || ' ' || pr.last_name as provider_name,
          EXTRACT(DAY FROM NOW() - po.order_date) as days_pending
        FROM pathology_orders po
        JOIN patients p ON po.patient_id = p.id
        JOIN providers pr ON po.ordering_provider_id = pr.id
        WHERE po.tenant_id = $1
        AND po.status IN ('pending', 'in_transit', 'received', 'processing')
        ORDER BY po.order_date ASC`,
        [this.tenantId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error fetching pending biopsies', { error: (error as Error).message });
      throw error;
    }
  }

  // Private helper methods

  private generateOrderNumber(): string {
    const date = new Date();
    const prefix = 'LAB';
    const timestamp = date.getFullYear().toString().slice(-2) +
      (date.getMonth() + 1).toString().padStart(2, '0') +
      date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  private generateLabOrderHL7(order: any, tests: LabTest[]): string {
    const now = new Date();
    const timestamp = this.formatHL7DateTime(now);
    const messageControlId = crypto.randomUUID().substring(0, 20);

    // MSH Segment
    const msh = [
      'MSH',
      '^~\\&',
      'DERMEHR',
      'CLINIC',
      order.lab_name || 'LAB',
      order.lab_name || 'LAB',
      timestamp,
      '',
      'ORM^O01',
      messageControlId,
      'P',
      '2.5.1'
    ].join('|');

    // PID Segment
    const pid = [
      'PID',
      '1',
      '',
      order.mrn || '',
      '',
      `${order.patient_last_name}^${order.patient_first_name}`,
      '',
      order.dob ? this.formatHL7Date(new Date(order.dob)) : '',
      order.gender || 'U'
    ].join('|');

    // ORC Segment (Common Order)
    const orc = [
      'ORC',
      'NW',
      order.order_number,
      '',
      '',
      '',
      '',
      '',
      '',
      timestamp,
      '',
      `${order.provider_last_name}^${order.provider_first_name}^${order.npi || ''}`
    ].join('|');

    // OBR Segments (one per test)
    const obrSegments = tests.map((test, index) => {
      return [
        'OBR',
        (index + 1).toString(),
        order.order_number,
        '',
        `${test.testCode}^${test.testName}`,
        order.priority === 'stat' ? 'S' : order.priority === 'urgent' ? 'U' : 'R',
        timestamp,
        '',
        '',
        '',
        '',
        '',
        '',
        order.clinical_indication || ''
      ].join('|');
    });

    return [msh, pid, orc, ...obrSegments].join('\r');
  }

  private parseOBXSegment(obx: OBXSegment, isLabCorp: boolean, isQuest: boolean): HL7ResultData {
    // Handle lab-specific value parsing
    let resultValue = obx.observationValue || '';
    let resultValueNumeric: number | undefined;

    // Parse numeric value
    if (obx.valueType === 'NM' || obx.valueType === 'SN') {
      const numericMatch = resultValue.match(/[\d.]+/);
      if (numericMatch) {
        resultValueNumeric = parseFloat(numericMatch[0]);
      }
    }

    // Parse abnormal flags
    let abnormalFlags: string[] = [];
    if (obx.abnormalFlags) {
      abnormalFlags = obx.abnormalFlags.split('~').filter(f => f.trim());
    }

    // Parse observation date
    let observationDateTime: Date | undefined;
    if (obx.dateOfObservation) {
      observationDateTime = parseHL7DateTime(obx.dateOfObservation) || undefined;
    }

    return {
      testCode: obx.observationIdentifier?.code || '',
      testName: obx.observationIdentifier?.text || '',
      resultValue,
      resultValueNumeric,
      units: obx.units || undefined,
      referenceRange: obx.referenceRange || undefined,
      abnormalFlags: abnormalFlags.length > 0 ? abnormalFlags : undefined,
      resultStatus: obx.observationResultStatus || 'P',
      observationDateTime,
      performingLab: obx.producersId || undefined
    };
  }

  private buildAbnormalMessage(result: any, isCritical: boolean): string {
    const prefix = isCritical ? 'CRITICAL' : 'ABNORMAL';
    const patientName = `${result.first_name} ${result.last_name}`;
    const value = `${result.result_value} ${result.result_unit || ''}`.trim();
    const range = result.reference_range_text ? ` (Ref: ${result.reference_range_text})` : '';

    return `${prefix}: ${result.test_name} for ${patientName} = ${value}${range}`;
  }

  private async createNotification(
    params: NotificationParams,
    existingClient?: any
  ): Promise<void> {
    const client = existingClient || pool;

    await client.query(
      `INSERT INTO result_notifications (
        tenant_id, order_id, order_type, patient_id, provider_id,
        notification_type, notification_method, priority, message, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        this.tenantId,
        params.orderId,
        params.orderType,
        params.patientId,
        params.providerId || null,
        params.notificationType,
        params.notificationMethod || 'in_app',
        params.priority,
        params.message
      ]
    );
  }

  private formatHL7DateTime(date: Date): string {
    return date.getFullYear().toString() +
      (date.getMonth() + 1).toString().padStart(2, '0') +
      date.getDate().toString().padStart(2, '0') +
      date.getHours().toString().padStart(2, '0') +
      date.getMinutes().toString().padStart(2, '0') +
      date.getSeconds().toString().padStart(2, '0');
  }

  private formatHL7Date(date: Date): string {
    return date.getFullYear().toString() +
      (date.getMonth() + 1).toString().padStart(2, '0') +
      date.getDate().toString().padStart(2, '0');
  }
}

// Export singleton factory
export function createLabIntegrationService(tenantId: string): LabIntegrationService {
  return new LabIntegrationService(tenantId);
}

export default LabIntegrationService;
