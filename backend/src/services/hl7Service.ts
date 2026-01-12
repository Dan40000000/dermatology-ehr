/**
 * HL7 Integration Service
 * Mock HL7 v2.x message generation and parsing for lab orders and results
 */

import crypto from 'crypto';
import { logger } from '../lib/logger';

interface HL7Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
}

interface HL7Provider {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
}

interface HL7LabOrder {
  orderId: string;
  patientId: string;
  providerId: string;
  tests: Array<{
    testCode: string;
    testName: string;
  }>;
  priority: string;
  specimenType: string;
  clinicalInfo?: string;
}

interface HL7LabResult {
  orderId: string;
  patientId: string;
  testCode: string;
  testName: string;
  resultValue: string;
  resultUnit?: string;
  referenceRange?: string;
  abnormalFlag?: string;
  resultStatus: string;
  observationDateTime: string;
}

export class HL7Service {
  private static readonly MSH_SEPARATOR = '|';
  private static readonly FIELD_SEPARATOR = '|';
  private static readonly COMPONENT_SEPARATOR = '^';
  private static readonly SUBCOMPONENT_SEPARATOR = '&';
  private static readonly REPETITION_SEPARATOR = '~';
  private static readonly ESCAPE_CHARACTER = '\\';

  /**
   * Generate HL7 ORM^O01 message (Lab Order)
   */
  static generateLabOrderMessage(
    order: HL7LabOrder,
    patient: HL7Patient,
    provider: HL7Provider,
    facility: { id: string; name: string }
  ): string {
    const messageControlId = crypto.randomUUID();
    const timestamp = this.formatHL7DateTime(new Date());

    const segments: string[] = [];

    // MSH - Message Header
    segments.push(
      this.createMSHSegment(
        'ORM',
        'O01',
        facility.id,
        facility.name,
        'LAB',
        'Laboratory',
        timestamp,
        messageControlId
      )
    );

    // PID - Patient Identification
    segments.push(
      this.createPIDSegment(
        patient.mrn,
        patient.id,
        patient.lastName,
        patient.firstName,
        patient.dateOfBirth,
        patient.gender
      )
    );

    // PV1 - Patient Visit (Outpatient)
    segments.push(this.createPV1Segment('O')); // O = Outpatient

    // ORC - Common Order
    segments.push(
      this.createORCSegment(
        'NW', // New order
        order.orderId,
        order.orderId,
        provider.npi,
        provider.lastName,
        provider.firstName,
        timestamp
      )
    );

    // OBR - Observation Request (one per test or panel)
    order.tests.forEach((test, index) => {
      segments.push(
        this.createOBRSegment(
          index + 1,
          order.orderId,
          test.testCode,
          test.testName,
          timestamp,
          order.specimenType,
          provider.npi,
          provider.lastName,
          provider.firstName,
          order.clinicalInfo
        )
      );
    });

    // DG1 - Diagnosis (if provided)
    // NTE - Notes/Comments (if provided)

    const message = segments.join('\r');
    logger.info('Generated HL7 ORM message', { messageControlId, orderId: order.orderId });

    return message;
  }

  /**
   * Generate HL7 ORU^R01 message (Lab Results)
   */
  static generateLabResultMessage(
    result: HL7LabResult,
    patient: HL7Patient,
    facility: { id: string; name: string }
  ): string {
    const messageControlId = crypto.randomUUID();
    const timestamp = this.formatHL7DateTime(new Date());

    const segments: string[] = [];

    // MSH - Message Header
    segments.push(
      this.createMSHSegment(
        'ORU',
        'R01',
        'LAB',
        'Laboratory',
        facility.id,
        facility.name,
        timestamp,
        messageControlId
      )
    );

    // PID - Patient Identification
    segments.push(
      this.createPIDSegment(
        patient.mrn,
        patient.id,
        patient.lastName,
        patient.firstName,
        patient.dateOfBirth,
        patient.gender
      )
    );

    // OBR - Observation Request
    segments.push(
      this.createOBRSegmentForResult(
        1,
        result.orderId,
        result.testCode,
        result.testName,
        result.observationDateTime,
        result.resultStatus
      )
    );

    // OBX - Observation Result
    segments.push(
      this.createOBXSegment(
        1,
        'NM', // Numeric
        result.testCode,
        result.testName,
        result.resultValue,
        result.resultUnit,
        result.referenceRange,
        result.abnormalFlag,
        result.resultStatus,
        result.observationDateTime
      )
    );

    const message = segments.join('\r');
    logger.info('Generated HL7 ORU message', { messageControlId, orderId: result.orderId });

    return message;
  }

  /**
   * Parse HL7 ORU^R01 message (Lab Results)
   */
  static parseLabResultMessage(message: string): any {
    const segments = message.split(/\r\n|\r|\n/);
    const result: any = {
      messageType: null,
      messageControlId: null,
      patient: {},
      results: []
    };

    let currentOBR: any = null;

    for (const segment of segments) {
      if (!segment.trim()) continue;

      const fields = segment.split(this.FIELD_SEPARATOR);
      const segmentType = fields[0];

      switch (segmentType) {
        case 'MSH':
          // MSH has special structure: MSH|^~\&|...
          // Field 1 is the separator ^, so we need to adjust indices
          result.messageType = fields[6];
          result.messageControlId = fields[7];
          break;

        case 'PID':
          result.patient = {
            patientId: fields[3],
            mrn: fields[2],
            name: fields[5],
            dateOfBirth: fields[7],
            gender: fields[8]
          };
          break;

        case 'OBR':
          currentOBR = {
            orderNumber: fields[2],
            testCode: this.parseComponent(fields[4] || '')?.[0] || '',
            testName: this.parseComponent(fields[4] || '')?.[1] || '',
            observationDateTime: fields[7],
            resultStatus: fields[25],
            observations: []
          };
          result.results.push(currentOBR);
          break;

        case 'OBX':
          if (currentOBR) {
            currentOBR.observations.push({
              valueType: fields[2],
              testCode: this.parseComponent(fields[3] || '')?.[0] || '',
              testName: this.parseComponent(fields[3] || '')?.[1] || '',
              value: fields[5],
              units: fields[6],
              referenceRange: fields[7],
              abnormalFlags: fields[8],
              resultStatus: fields[11],
              observationDateTime: fields[14]
            });
          }
          break;
      }
    }

    return result;
  }

  /**
   * Create MSH segment
   */
  private static createMSHSegment(
    messageType: string,
    triggerEvent: string,
    sendingFacility: string,
    sendingFacilityName: string,
    receivingFacility: string,
    receivingFacilityName: string,
    timestamp: string,
    messageControlId: string
  ): string {
    return [
      'MSH',
      this.COMPONENT_SEPARATOR,
      `${sendingFacility}^${sendingFacilityName}`,
      `${receivingFacility}^${receivingFacilityName}`,
      timestamp,
      '',
      `${messageType}^${triggerEvent}`,
      messageControlId,
      'P', // Processing ID: P = Production
      '2.5.1', // HL7 version
      '',
      '',
      'AL', // Accept acknowledgment type
      'NE', // Application acknowledgment type
      ''
    ].join(this.FIELD_SEPARATOR);
  }

  /**
   * Create PID segment
   */
  private static createPIDSegment(
    mrn: string,
    patientId: string,
    lastName: string,
    firstName: string,
    dateOfBirth: string,
    gender: string
  ): string {
    return [
      'PID',
      '1', // Set ID
      mrn,
      patientId,
      '',
      `${lastName}^${firstName}`,
      '',
      dateOfBirth.replace(/-/g, ''), // YYYYMMDD format
      gender.charAt(0).toUpperCase(),
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ].join(this.FIELD_SEPARATOR);
  }

  /**
   * Create PV1 segment
   */
  private static createPV1Segment(patientClass: string): string {
    return [
      'PV1',
      '1',
      patientClass,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ].join(this.FIELD_SEPARATOR);
  }

  /**
   * Create ORC segment
   */
  private static createORCSegment(
    orderControl: string,
    placerOrderNumber: string,
    fillerOrderNumber: string,
    providerNPI: string,
    providerLastName: string,
    providerFirstName: string,
    timestamp: string
  ): string {
    return [
      'ORC',
      orderControl,
      placerOrderNumber,
      fillerOrderNumber,
      '',
      '',
      '',
      '',
      '',
      timestamp,
      '',
      '',
      `${providerNPI}^${providerLastName}^${providerFirstName}`,
      '',
      '',
      ''
    ].join(this.FIELD_SEPARATOR);
  }

  /**
   * Create OBR segment for order
   */
  private static createOBRSegment(
    setId: number,
    placerOrderNumber: string,
    testCode: string,
    testName: string,
    observationDateTime: string,
    specimenType: string,
    providerNPI: string,
    providerLastName: string,
    providerFirstName: string,
    clinicalInfo?: string
  ): string {
    return [
      'OBR',
      setId.toString(),
      placerOrderNumber,
      '',
      `${testCode}^${testName}`,
      '',
      '',
      observationDateTime,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `${specimenType}`,
      `${providerNPI}^${providerLastName}^${providerFirstName}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      clinicalInfo || ''
    ].join(this.FIELD_SEPARATOR);
  }

  /**
   * Create OBR segment for result
   */
  private static createOBRSegmentForResult(
    setId: number,
    placerOrderNumber: string,
    testCode: string,
    testName: string,
    observationDateTime: string,
    resultStatus: string
  ): string {
    return [
      'OBR',
      setId.toString(),
      placerOrderNumber,
      '',
      `${testCode}^${testName}`,
      '',
      '',
      observationDateTime,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      resultStatus,
      ''
    ].join(this.FIELD_SEPARATOR);
  }

  /**
   * Create OBX segment
   */
  private static createOBXSegment(
    setId: number,
    valueType: string,
    testCode: string,
    testName: string,
    value: string,
    units?: string,
    referenceRange?: string,
    abnormalFlag?: string,
    resultStatus?: string,
    observationDateTime?: string
  ): string {
    return [
      'OBX',
      setId.toString(),
      valueType,
      `${testCode}^${testName}`,
      '',
      value,
      units || '',
      referenceRange || '',
      abnormalFlag || '',
      '',
      '',
      resultStatus || 'F',
      '',
      '',
      observationDateTime || '',
      ''
    ].join(this.FIELD_SEPARATOR);
  }

  /**
   * Format date/time for HL7 (YYYYMMDDHHmmss)
   */
  private static formatHL7DateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Parse HL7 component (field with ^ separator)
   */
  private static parseComponent(field: string): string[] | null {
    if (!field) return null;
    return field.split(this.COMPONENT_SEPARATOR);
  }

  /**
   * Simulate sending HL7 message to external lab
   */
  static async sendHL7Message(
    message: string,
    endpoint: string,
    labName: string
  ): Promise<{ success: boolean; acknowledgment?: string; error?: string }> {
    // In a real implementation, this would:
    // 1. Establish MLLP connection to lab interface
    // 2. Send the HL7 message
    // 3. Receive ACK/NAK response
    // 4. Handle errors and retries

    logger.info('Sending HL7 message to lab', { labName, endpoint, messageLength: message.length });

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock success response with ACK
    const ack = this.generateACK(message, 'AA'); // AA = Application Accept

    return {
      success: true,
      acknowledgment: ack
    };
  }

  /**
   * Generate HL7 ACK message
   */
  private static generateACK(originalMessage: string, acknowledgmentCode: string): string {
    const segments = originalMessage.split('\r');
    const mshSegment = segments[0];
    if (!mshSegment) {
      throw new Error('Invalid HL7 message: no MSH segment found');
    }
    const mshFields = mshSegment.split(this.FIELD_SEPARATOR);

    // Extract message control ID from field 7 (0-indexed)
    const messageControlId = mshFields[7];
    const timestamp = this.formatHL7DateTime(new Date());

    // Swap sender and receiver for ACK response
    const sendingApp = mshFields[3] || '';
    const receivingApp = mshFields[2] || '';

    const mshSegmentParts = [
      'MSH',
      this.COMPONENT_SEPARATOR,
      sendingApp,
      receivingApp,
      timestamp,
      '',
      'ACK',
      messageControlId,
      'P',
      '2.5.1'
    ];

    return [
      mshSegmentParts.join(this.FIELD_SEPARATOR),
      `MSA${this.FIELD_SEPARATOR}${acknowledgmentCode}${this.FIELD_SEPARATOR}${messageControlId}`
    ].join('\r');
  }
}
