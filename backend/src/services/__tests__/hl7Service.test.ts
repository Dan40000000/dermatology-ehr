import { HL7Service } from '../hl7Service';
import { logger } from '../../lib/logger';

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234-5678'),
}));

describe('HL7Service', () => {
  const mockPatient = {
    id: 'patient-123',
    mrn: 'MRN001',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1980-05-15',
    gender: 'M',
  };

  const mockProvider = {
    id: 'provider-123',
    npi: '1234567890',
    firstName: 'Jane',
    lastName: 'Smith',
  };

  const mockFacility = {
    id: 'FAC001',
    name: 'Dermatology Clinic',
  };

  describe('generateLabOrderMessage', () => {
    it('should generate valid HL7 ORM^O01 message', () => {
      const order = {
        orderId: 'ORD-123',
        patientId: 'patient-123',
        providerId: 'provider-123',
        tests: [
          { testCode: 'CBC', testName: 'Complete Blood Count' },
          { testCode: 'CMP', testName: 'Comprehensive Metabolic Panel' },
        ],
        priority: 'routine',
        specimenType: 'blood',
        clinicalInfo: 'Pre-treatment screening',
      };

      const message = HL7Service.generateLabOrderMessage(
        order,
        mockPatient,
        mockProvider,
        mockFacility
      );

      expect(message).toBeTruthy();
      expect(message).toContain('MSH|');
      expect(message).toContain('ORM^O01');
      expect(message).toContain('PID|');
      expect(message).toContain('PV1|');
      expect(message).toContain('ORC|');
      expect(message).toContain('OBR|');

      // Check message contains patient info
      expect(message).toContain('Doe^John');
      expect(message).toContain('MRN001');
      expect(message).toContain('19800515');

      // Check message contains provider info
      expect(message).toContain('1234567890^Smith^Jane');

      // Check message contains test info
      expect(message).toContain('CBC^Complete Blood Count');
      expect(message).toContain('CMP^Comprehensive Metabolic Panel');

      // Check message uses proper separators
      expect(message.includes('\r')).toBe(true);

      expect(logger.info).toHaveBeenCalledWith(
        'Generated HL7 ORM message',
        expect.objectContaining({
          messageControlId: expect.any(String),
          orderId: 'ORD-123',
        })
      );
    });

    it('should include clinical info in OBR segment when provided', () => {
      const order = {
        orderId: 'ORD-456',
        patientId: 'patient-123',
        providerId: 'provider-123',
        tests: [{ testCode: 'TSH', testName: 'Thyroid Stimulating Hormone' }],
        priority: 'stat',
        specimenType: 'blood',
        clinicalInfo: 'Rule out thyroid disorder',
      };

      const message = HL7Service.generateLabOrderMessage(
        order,
        mockPatient,
        mockProvider,
        mockFacility
      );

      expect(message).toContain('Rule out thyroid disorder');
    });

    it('should handle multiple tests with correct set IDs', () => {
      const order = {
        orderId: 'ORD-789',
        patientId: 'patient-123',
        providerId: 'provider-123',
        tests: [
          { testCode: 'TEST1', testName: 'Test One' },
          { testCode: 'TEST2', testName: 'Test Two' },
          { testCode: 'TEST3', testName: 'Test Three' },
        ],
        priority: 'routine',
        specimenType: 'serum',
      };

      const message = HL7Service.generateLabOrderMessage(
        order,
        mockPatient,
        mockProvider,
        mockFacility
      );

      const segments = message.split('\r');
      const obrSegments = segments.filter((s) => s.startsWith('OBR|'));

      expect(obrSegments.length).toBe(3);
      expect(obrSegments[0]).toContain('OBR|1|');
      expect(obrSegments[1]).toContain('OBR|2|');
      expect(obrSegments[2]).toContain('OBR|3|');
    });
  });

  describe('generateLabResultMessage', () => {
    it('should generate valid HL7 ORU^R01 message', () => {
      const result = {
        orderId: 'ORD-123',
        patientId: 'patient-123',
        testCode: 'WBC',
        testName: 'White Blood Cell Count',
        resultValue: '7.5',
        resultUnit: 'K/uL',
        referenceRange: '4.0-11.0',
        abnormalFlag: 'N',
        resultStatus: 'F',
        observationDateTime: '20240115120000',
      };

      const message = HL7Service.generateLabResultMessage(
        result,
        mockPatient,
        mockFacility
      );

      expect(message).toBeTruthy();
      expect(message).toContain('MSH|');
      expect(message).toContain('ORU^R01');
      expect(message).toContain('PID|');
      expect(message).toContain('OBR|');
      expect(message).toContain('OBX|');

      // Check result data
      expect(message).toContain('WBC^White Blood Cell Count');
      expect(message).toContain('7.5');
      expect(message).toContain('K/uL');
      expect(message).toContain('4.0-11.0');

      expect(logger.info).toHaveBeenCalledWith(
        'Generated HL7 ORU message',
        expect.objectContaining({
          messageControlId: expect.any(String),
          orderId: 'ORD-123',
        })
      );
    });

    it('should handle abnormal results with flag', () => {
      const result = {
        orderId: 'ORD-456',
        patientId: 'patient-123',
        testCode: 'GLUCOSE',
        testName: 'Glucose',
        resultValue: '180',
        resultUnit: 'mg/dL',
        referenceRange: '70-100',
        abnormalFlag: 'H',
        resultStatus: 'F',
        observationDateTime: '20240115120000',
      };

      const message = HL7Service.generateLabResultMessage(
        result,
        mockPatient,
        mockFacility
      );

      expect(message).toContain('180');
      expect(message).toContain('H');
    });
  });

  describe('parseLabResultMessage', () => {
    it('should parse HL7 ORU^R01 message correctly', () => {
      const hl7Message = [
        'MSH|^|LAB^Laboratory|FAC001^Clinic|20240115120000||ORU^R01|MSG123|P|2.5.1',
        'PID|1|MRN001|patient-123||Doe^John||19800515|M',
        'OBR|1|ORD-123||WBC^White Blood Cell Count||20240115120000|||||||||||||||||||F',
        'OBX|1|NM|WBC^White Blood Cell Count||7.5|K/uL|4.0-11.0|N|||F||20240115120000',
      ].join('\r');

      const parsed = HL7Service.parseLabResultMessage(hl7Message);

      expect(parsed.messageType).toBe('ORU^R01');
      expect(parsed.messageControlId).toBe('MSG123');
      expect(parsed.patient.patientId).toBe('patient-123');
      expect(parsed.patient.mrn).toBe('MRN001');
      expect(parsed.patient.name).toBe('Doe^John');
      expect(parsed.patient.dateOfBirth).toBe('19800515');
      expect(parsed.patient.gender).toBe('M');
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].testCode).toBe('WBC');
      expect(parsed.results[0].testName).toBe('White Blood Cell Count');
      expect(parsed.results[0].observations).toHaveLength(1);
      expect(parsed.results[0].observations[0].value).toBe('7.5');
      expect(parsed.results[0].observations[0].units).toBe('K/uL');
    });

    it('should handle multiple OBX segments under one OBR', () => {
      const hl7Message = [
        'MSH|^|LAB^Laboratory|FAC001^Clinic|20240115120000||ORU^R01|MSG456|P|2.5.1',
        'PID|1|MRN001|patient-123||Doe^John||19800515|M',
        'OBR|1|ORD-789||CBC^Complete Blood Count||20240115120000|||||||||||||||||||F',
        'OBX|1|NM|WBC^White Blood Cell Count||7.5|K/uL|4.0-11.0|N|||F||20240115120000',
        'OBX|2|NM|RBC^Red Blood Cell Count||4.8|M/uL|4.5-5.5|N|||F||20240115120000',
        'OBX|3|NM|HGB^Hemoglobin||14.5|g/dL|13.0-17.0|N|||F||20240115120000',
      ].join('\r');

      const parsed = HL7Service.parseLabResultMessage(hl7Message);

      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].observations).toHaveLength(3);
      expect(parsed.results[0].observations[0].testCode).toBe('WBC');
      expect(parsed.results[0].observations[1].testCode).toBe('RBC');
      expect(parsed.results[0].observations[2].testCode).toBe('HGB');
    });

    it('should handle messages with line breaks', () => {
      const hl7Message = [
        'MSH|^|LAB^Laboratory|FAC001^Clinic|20240115120000||ORU^R01|MSG789|P|2.5.1',
        'PID|1|MRN001|patient-123||Doe^John||19800515|M',
        'OBR|1|ORD-123||TSH^Thyroid Stimulating Hormone||20240115120000|||||||||||||||||||F',
        'OBX|1|NM|TSH^Thyroid Stimulating Hormone||2.5|mIU/L|0.4-4.0|N|||F||20240115120000',
      ].join('\n');

      const parsed = HL7Service.parseLabResultMessage(hl7Message);

      expect(parsed.messageControlId).toBe('MSG789');
      expect(parsed.results).toHaveLength(1);
    });
  });

  describe('sendHL7Message', () => {
    it('should simulate successful message transmission', async () => {
      const message = 'MSH|^|TEST||20240115||ORM^O01|MSG001|P|2.5.1\rPID|1|MRN001';

      const result = await HL7Service.sendHL7Message(
        message,
        'mllp://lab.example.com:2575',
        'Quest Diagnostics'
      );

      expect(result.success).toBe(true);
      expect(result.acknowledgment).toBeDefined();
      expect(result.acknowledgment).toContain('MSA');
      expect(result.acknowledgment).toContain('AA');
      expect(result.acknowledgment).toContain('MSG001');

      expect(logger.info).toHaveBeenCalledWith(
        'Sending HL7 message to lab',
        expect.objectContaining({
          labName: 'Quest Diagnostics',
          endpoint: 'mllp://lab.example.com:2575',
          messageLength: message.length,
        })
      );
    });

    it('should generate proper ACK message', async () => {
      const message = [
        'MSH|^|CLINIC^Clinic|LAB^Lab|20240115120000||ORM^O01|CTRL123|P|2.5.1',
        'PID|1|MRN001|patient-123',
      ].join('\r');

      const result = await HL7Service.sendHL7Message(
        message,
        'mllp://lab.example.com:2575',
        'LabCorp'
      );

      expect(result.acknowledgment).toContain('MSH');
      expect(result.acknowledgment).toContain('ACK');
      expect(result.acknowledgment).toContain('CTRL123');
      expect(result.acknowledgment).toContain('MSA|AA|CTRL123');
    });
  });

  describe('formatHL7DateTime', () => {
    it('should format date to YYYYMMDDHHmmss format', () => {
      const date = new Date('2024-01-15T14:30:45.000Z');
      const formatted = (HL7Service as any).formatHL7DateTime(date);

      expect(formatted).toMatch(/^\d{14}$/);
      expect(formatted.substring(0, 8)).toBe('20240115');
    });
  });

  describe('HL7 segment creation', () => {
    it('should create MSH segment with proper structure', () => {
      const msh = (HL7Service as any).createMSHSegment(
        'ORM',
        'O01',
        'CLINIC',
        'Clinic Name',
        'LAB',
        'Lab Name',
        '20240115120000',
        'MSG123'
      );

      expect(msh).toContain('MSH|');
      expect(msh).toContain('ORM^O01');
      expect(msh).toContain('CLINIC^Clinic Name');
      expect(msh).toContain('LAB^Lab Name');
      expect(msh).toContain('MSG123');
      expect(msh).toContain('P');
      expect(msh).toContain('2.5.1');
    });

    it('should create PID segment with patient data', () => {
      const pid = (HL7Service as any).createPIDSegment(
        'MRN123',
        'patient-456',
        'Smith',
        'Jane',
        '1990-03-20',
        'F'
      );

      expect(pid).toContain('PID|');
      expect(pid).toContain('MRN123');
      expect(pid).toContain('patient-456');
      expect(pid).toContain('Smith^Jane');
      expect(pid).toContain('19900320');
      expect(pid).toContain('F');
    });

    it('should create OBX segment with result data', () => {
      const obx = (HL7Service as any).createOBXSegment(
        1,
        'NM',
        'GLUCOSE',
        'Glucose',
        '95',
        'mg/dL',
        '70-100',
        'N',
        'F',
        '20240115120000'
      );

      expect(obx).toContain('OBX|1|NM');
      expect(obx).toContain('GLUCOSE^Glucose');
      expect(obx).toContain('95');
      expect(obx).toContain('mg/dL');
      expect(obx).toContain('70-100');
      expect(obx).toContain('N');
      expect(obx).toContain('F');
    });
  });
});
