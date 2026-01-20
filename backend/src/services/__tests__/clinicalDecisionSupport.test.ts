import { pool } from '../../db/pool';
import { ClinicalDecisionSupportService } from '../clinicalDecisionSupport';
import crypto from 'crypto';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'alert-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;

describe('ClinicalDecisionSupportService', () => {
  let service: ClinicalDecisionSupportService;
  const tenantId = 'tenant-123';
  const patientId = 'patient-123';
  const encounterId = 'encounter-123';

  beforeEach(() => {
    service = new ClinicalDecisionSupportService();
    jest.clearAllMocks();
  });

  describe('runCDSChecks', () => {
    it('should run all CDS checks and return alerts', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1980-01-01',
        age: 44,
        medical_history: 'Hypertension',
      };

      queryMock.mockResolvedValue({ rows: [] });
      queryMock.mockResolvedValueOnce({ rows: [mockPatient] });

      const result = await service.runCDSChecks({
        patientId,
        tenantId,
        encounterId,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(queryMock).toHaveBeenCalled();
    });

    it('should throw error when patient not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.runCDSChecks({ patientId: 'nonexistent', tenantId })
      ).rejects.toThrow('Patient not found');
    });

    it('should store alerts in database', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        date_of_birth: '1980-01-01',
        age: 44,
      };

      const mockEncounter = {
        encounter_date: new Date('2024-01-01'),
        follow_up_recommended: true,
        follow_up_date: new Date('2023-12-15'),
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [mockEncounter] })
        .mockResolvedValue({ rows: [] });

      await service.runCDSChecks({ patientId, tenantId, encounterId });

      const alertInserts = queryMock.mock.calls.filter((call) =>
        call[0].includes('insert into cds_alerts')
      );
      expect(alertInserts.length).toBeGreaterThan(0);
    });
  });

  describe('checkFollowUpNeeded', () => {
    it('should alert for overdue follow-up', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 44,
      };

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const mockEncounter = {
        encounter_date: new Date('2024-01-01'),
        follow_up_recommended: true,
        follow_up_date: pastDate,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockEncounter] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const followUpAlert = alerts.find((a) => a.type === 'overdue_followup');
      expect(followUpAlert).toBeDefined();
      expect(followUpAlert?.severity).toBe('warning');
      expect(followUpAlert?.actionRequired).toBe(true);
    });

    it('should alert for upcoming follow-up within 7 days', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 44,
      };

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const mockEncounter = {
        encounter_date: new Date('2024-01-01'),
        follow_up_recommended: true,
        follow_up_date: futureDate,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] }).mockResolvedValueOnce({
        rows: [mockEncounter],
      });
      queryMock.mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const followUpAlert = alerts.find((a) => a.type === 'upcoming_followup');
      expect(followUpAlert).toBeDefined();
      expect(followUpAlert?.severity).toBe('info');
    });

    it('should not alert when no follow-up recommended', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 44,
      };

      const mockEncounter = {
        encounter_date: new Date('2024-01-01'),
        follow_up_recommended: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] }).mockResolvedValueOnce({
        rows: [mockEncounter],
      });
      queryMock.mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const followUpAlert = alerts.find((a) => a.type === 'overdue_followup');
      expect(followUpAlert).toBeUndefined();
    });
  });

  describe('checkPreventiveCare', () => {
    it('should recommend annual skin exam for patients over 40', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 45,
      };

      const oldExam = new Date();
      oldExam.setMonth(oldExam.getMonth() - 13);

      const mockSkinExam = {
        encounter_date: oldExam,
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockSkinExam] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const preventiveAlert = alerts.find((a) => a.type === 'preventive_skin_exam');
      expect(preventiveAlert).toBeDefined();
      expect(preventiveAlert?.severity).toBe('info');
    });

    it('should recommend high-risk monitoring for melanoma history', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
        medical_history: 'History of melanoma',
      };

      const oldExam = new Date();
      oldExam.setMonth(oldExam.getMonth() - 7);

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ encounter_date: oldExam }] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const highRiskAlert = alerts.find((a) => a.type === 'high_risk_monitoring');
      expect(highRiskAlert).toBeDefined();
      expect(highRiskAlert?.severity).toBe('warning');
      expect(highRiskAlert?.actionRequired).toBe(true);
    });
  });

  describe('checkHighRiskLesions', () => {
    it('should alert for high-risk lesions without biopsy', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
      };

      const mockLesions = [
        {
          id: 'lesion-1',
          lesion_code: 'L001',
          body_location: 'Left arm',
          concern_level: 'high',
          clinical_impression: 'Suspicious lesion',
        },
      ];

      const mockBiopsy = {
        biopsy_performed: false,
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockLesions })
        .mockResolvedValueOnce({ rows: [mockBiopsy] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const biopsyAlert = alerts.find((a) => a.type === 'biopsy_needed');
      expect(biopsyAlert).toBeDefined();
      expect(biopsyAlert?.severity).toBe('warning');
      expect(biopsyAlert?.actionRequired).toBe(true);
    });

    it('should alert for critical lesions without biopsy', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
      };

      const mockLesions = [
        {
          id: 'lesion-1',
          lesion_code: 'L001',
          body_location: 'Face',
          concern_level: 'critical',
        },
      ];

      const mockBiopsy = {
        biopsy_performed: false,
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockLesions })
        .mockResolvedValueOnce({ rows: [mockBiopsy] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const biopsyAlert = alerts.find((a) => a.type === 'biopsy_needed');
      expect(biopsyAlert?.severity).toBe('critical');
    });

    it('should alert for AI-flagged high-risk images', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
      };

      const mockAIRisk = [
        {
          id: 'photo-1',
          body_location: 'Back',
          primary_finding: 'Irregular lesion',
          risk_level: 'high',
        },
        {
          id: 'photo-2',
          body_location: 'Chest',
          primary_finding: 'Atypical nevus',
          risk_level: 'critical',
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockAIRisk })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const aiAlert = alerts.find((a) => a.type === 'ai_risk_flag');
      expect(aiAlert).toBeDefined();
      expect(aiAlert?.severity).toBe('warning');
      expect(aiAlert?.description).toContain('2');
    });
  });

  describe('checkMedicationInteractions', () => {
    it('should alert for photosensitizing medications', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
        current_medications: 'Doxycycline 100mg BID, Lisinopril 10mg daily',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] }).mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const photoAlert = alerts.find((a) => a.type === 'photosensitivity_risk');
      expect(photoAlert).toBeDefined();
      expect(photoAlert?.severity).toBe('info');
      expect(photoAlert?.recommendations).toContain('Counsel on sun protection measures');
    });

    it('should not alert when no photosensitizing medications', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
        current_medications: 'Lisinopril 10mg daily, Metformin 500mg BID',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] }).mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const photoAlert = alerts.find((a) => a.type === 'photosensitivity_risk');
      expect(photoAlert).toBeUndefined();
    });

    it('should handle null medications', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
        current_medications: null,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] }).mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const photoAlert = alerts.find((a) => a.type === 'photosensitivity_risk');
      expect(photoAlert).toBeUndefined();
    });
  });

  describe('checkLabResults', () => {
    it('should alert for pending labs over 14 days', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
      };

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);

      const mockPendingLabs = [
        {
          id: 'lab-1',
          order_type: 'Lab',
          status: 'pending',
          ordered_date: oldDate,
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockPendingLabs })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const labAlert = alerts.find((a) => a.type === 'pending_labs');
      expect(labAlert).toBeDefined();
      expect(labAlert?.severity).toBe('info');
      expect(labAlert?.actionRequired).toBe(true);
    });

    it('should not alert for recent pending labs', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
      };

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] }).mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const labAlert = alerts.find((a) => a.type === 'pending_labs');
      expect(labAlert).toBeUndefined();
    });
  });

  describe('checkBiopsyFollowUp', () => {
    it('should alert for pending biopsy results over 14 days', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 50,
      };

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);

      const mockPendingBiopsies = [
        {
          id: 'lesion-1',
          lesion_code: 'L001',
          body_location: 'Left arm',
          biopsy_date: oldDate,
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockPendingBiopsies })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const biopsyAlert = alerts.find((a) => a.type === 'pending_biopsy_results');
      expect(biopsyAlert).toBeDefined();
      expect(biopsyAlert?.severity).toBe('warning');
      expect(biopsyAlert?.actionRequired).toBe(true);
    });
  });

  describe('checkSunProtection', () => {
    it('should recommend sun protection counseling for high-risk patients', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 55,
        medical_history: 'Hypertension',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const sunAlert = alerts.find((a) => a.type === 'sun_protection_counseling');
      expect(sunAlert).toBeDefined();
      expect(sunAlert?.severity).toBe('info');
    });

    it('should recommend counseling for patients with skin cancer history', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 40,
        medical_history: 'History of skin cancer',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ encounter_date: new Date('2022-01-01') }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const sunAlert = alerts.find((a) => a.type === 'sun_protection_counseling');
      expect(sunAlert).toBeDefined();
    });

    it('should not alert if counseling documented recently', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 55,
      };

      const recentEncounter = {
        id: 'encounter-1',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [recentEncounter] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const sunAlert = alerts.find((a) => a.type === 'sun_protection_counseling');
      expect(sunAlert).toBeUndefined();
    });
  });

  describe('getPatientAlerts', () => {
    it('should get active alerts for a patient', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          alert_type: 'overdue_followup',
          severity: 'warning',
          title: 'Overdue Follow-up',
          description: 'Follow-up is overdue',
          action_required: true,
          dismissed: false,
          created_at: new Date(),
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockAlerts });

      const result = await service.getPatientAlerts(patientId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].alertType).toBe('overdue_followup');
    });

    it('should not return dismissed alerts', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.getPatientAlerts(patientId, tenantId);

      expect(result).toHaveLength(0);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('and dismissed = false'),
        [patientId, tenantId]
      );
    });

    it('should order by severity and created date', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.getPatientAlerts(patientId, tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('order by severity desc, created_at desc'),
        [patientId, tenantId]
      );
    });
  });

  describe('dismissAlert', () => {
    it('should dismiss an alert', async () => {
      const alertId = 'alert-123';
      const userId = 'user-123';

      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.dismissAlert(alertId, userId, tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('update cds_alerts'),
        [userId, alertId, tenantId]
      );
    });

    it('should set dismissed_by and dismissed_at', async () => {
      const alertId = 'alert-123';
      const userId = 'user-123';

      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.dismissAlert(alertId, userId, tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('dismissed = true'),
        expect.arrayContaining([userId, alertId, tenantId])
      );
    });
  });

  describe('Alert storage', () => {
    it('should store alert with correct parameters', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 44,
      };

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const mockEncounter = {
        encounter_date: new Date('2024-01-01'),
        follow_up_recommended: true,
        follow_up_date: pastDate,
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [mockEncounter] })
        .mockResolvedValue({ rows: [] });

      await service.runCDSChecks({ patientId, tenantId, encounterId });

      const insertCall = queryMock.mock.calls.find((call) =>
        call[0].includes('insert into cds_alerts')
      );

      expect(insertCall).toBeDefined();
      const [, params] = insertCall!;
      expect(params).toContain(tenantId);
      expect(params).toContain(patientId);
      expect(params).toContain(encounterId);
    });

    it('should handle on conflict do nothing', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 44,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] }).mockResolvedValue({ rows: [] });

      await service.runCDSChecks({ patientId, tenantId });

      const insertCalls = queryMock.mock.calls.filter((call) =>
        call[0].includes('insert into cds_alerts')
      );

      insertCalls.forEach((call) => {
        expect(call[0]).toContain('on conflict do nothing');
      });
    });
  });

  describe('Helper functions', () => {
    it('should calculate months between dates correctly', async () => {
      const mockPatient = {
        id: patientId,
        tenant_id: tenantId,
        age: 45,
      };

      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 13);

      const mockExam = {
        encounter_date: oldDate,
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockExam] })
        .mockResolvedValue({ rows: [] });

      const alerts = await service.runCDSChecks({ patientId, tenantId });

      const preventiveAlert = alerts.find((a) => a.type === 'preventive_skin_exam');
      expect(preventiveAlert?.description).toContain('13 months');
    });
  });
});
