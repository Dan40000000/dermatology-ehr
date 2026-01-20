import { pool } from '../../db/pool';
import * as reportService from '../reportService';
import * as audit from '../audit';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../audit', () => ({
  auditLog: jest.fn(),
}));

describe('ReportService', () => {
  const tenantId = 'tenant-123';
  const userId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAppointmentReport', () => {
    it('should generate appointment report with basic filters', async () => {
      const mockRows = [
        {
          date: '2024-01-15',
          time: '09:00',
          patientName: 'John Doe',
          providerName: 'Dr. Smith',
          locationName: 'Main Clinic',
          appointmentType: 'Consultation',
          status: 'completed',
          duration: 30,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await reportService.generateAppointmentReport(tenantId, filters, userId);

      expect(result).toEqual(mockRows);
      expect(pool.query).toHaveBeenCalled();
      expect(audit.auditLog).toHaveBeenCalledWith(
        tenantId,
        userId,
        'report_generate_appointments',
        'report',
        'appointments'
      );
    });

    it('should filter by provider', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        providerId: 'provider-123',
      };

      await reportService.generateAppointmentReport(tenantId, filters, userId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and a.provider_id ='),
        expect.arrayContaining([tenantId, 'provider-123'])
      );
    });

    it('should filter by location', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        locationId: 'location-123',
      };

      await reportService.generateAppointmentReport(tenantId, filters, userId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and a.location_id ='),
        expect.arrayContaining([tenantId, 'location-123'])
      );
    });

    it('should filter by status', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        status: 'completed',
      };

      await reportService.generateAppointmentReport(tenantId, filters, userId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and a.status ='),
        expect.arrayContaining([tenantId, 'completed'])
      );
    });

    it('should not audit if userId is not provided', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await reportService.generateAppointmentReport(tenantId, {});

      expect(audit.auditLog).not.toHaveBeenCalled();
    });
  });

  describe('generateFinancialReport', () => {
    it('should generate financial report', async () => {
      const mockRows = [
        {
          date: '2024-01-15',
          patientName: 'John Doe',
          services: '99213, 99214',
          chargesCents: 15000,
          paymentsCents: 10000,
          balanceCents: 5000,
          claimNumber: 'CLM-12345',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await reportService.generateFinancialReport(tenantId, filters, userId);

      expect(result).toEqual(mockRows);
      expect(audit.auditLog).toHaveBeenCalledWith(
        tenantId,
        userId,
        'report_generate_financial',
        'report',
        'financial'
      );
    });

    it('should filter by payment status', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        paymentStatus: 'paid',
      };

      await reportService.generateFinancialReport(tenantId, filters, userId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and cl.status ='),
        expect.arrayContaining([tenantId, 'paid'])
      );
    });

    it('should include date range filters', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await reportService.generateFinancialReport(tenantId, filters);

      const call = (pool.query as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('and cl.created_at >=');
      expect(call[0]).toContain('and cl.created_at <');
    });
  });

  describe('generateClinicalReport', () => {
    it('should generate clinical report', async () => {
      const mockRows = [
        {
          date: '2024-01-15',
          patientName: 'John Doe',
          diagnosisCode: 'L30.9',
          diagnosisDescription: 'Dermatitis, unspecified',
          procedureCode: '99213',
          procedureDescription: 'Office visit, established',
          providerName: 'Dr. Smith',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await reportService.generateClinicalReport(tenantId, filters, userId);

      expect(result).toEqual(mockRows);
      expect(audit.auditLog).toHaveBeenCalledWith(
        tenantId,
        userId,
        'report_generate_clinical',
        'report',
        'clinical'
      );
    });

    it('should filter by diagnosis code', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        diagnosisCode: 'L30',
      };

      await reportService.generateClinicalReport(tenantId, filters);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and ed.icd10_code ilike'),
        expect.arrayContaining([tenantId, '%L30%'])
      );
    });

    it('should filter by procedure code', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        procedureCode: '99213',
      };

      await reportService.generateClinicalReport(tenantId, filters);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and ch.cpt_code ilike'),
        expect.arrayContaining([tenantId, '%99213%'])
      );
    });
  });

  describe('generatePatientListReport', () => {
    it('should generate patient list report', async () => {
      const mockRows = [
        {
          name: 'John Doe',
          dob: '1990-01-15',
          age: '34',
          gender: 'M',
          phone: '555-1234',
          email: 'john@example.com',
          lastVisit: '2024-01-15',
          status: 'Active',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

      const filters = {};

      const result = await reportService.generatePatientListReport(tenantId, filters, userId);

      expect(result).toHaveLength(1);
      expect(result[0].age).toBe(34); // Should be parsed to number
      expect(audit.auditLog).toHaveBeenCalledWith(
        tenantId,
        userId,
        'report_generate_patient_list',
        'report',
        'patient_list'
      );
    });

    it('should filter by age range', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        ageMin: 18,
        ageMax: 65,
      };

      await reportService.generatePatientListReport(tenantId, filters);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and extract(year from age(p.dob)) >='),
        expect.arrayContaining([tenantId, 18, 65])
      );
    });

    it('should filter by gender', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        gender: 'F',
      };

      await reportService.generatePatientListReport(tenantId, filters);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and p.sex ='),
        expect.arrayContaining([tenantId, 'F'])
      );
    });

    it('should filter by active status', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        active: true,
      };

      await reportService.generatePatientListReport(tenantId, filters);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('having case when'),
        expect.arrayContaining([tenantId, true])
      );
    });
  });

  describe('generateProviderProductivityReport', () => {
    it('should generate provider productivity report', async () => {
      const mockRows = [
        {
          providerName: 'Dr. Smith',
          patientsSeen: '50',
          appointments: '75',
          revenueCents: 50000,
          avgPerPatientCents: 1000,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await reportService.generateProviderProductivityReport(
        tenantId,
        filters,
        userId
      );

      expect(result).toHaveLength(1);
      expect(result[0].patientsSeen).toBe(50); // Should be parsed to number
      expect(result[0].appointments).toBe(75); // Should be parsed to number
      expect(audit.auditLog).toHaveBeenCalledWith(
        tenantId,
        userId,
        'report_generate_productivity',
        'report',
        'productivity'
      );
    });

    it('should include date filters', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await reportService.generateProviderProductivityReport(tenantId, filters);

      const call = (pool.query as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('and e.created_at >=');
      expect(call[0]).toContain('and e.created_at <');
    });
  });

  describe('generateNoShowReport', () => {
    it('should generate no-show report', async () => {
      const mockAppointmentRows = [
        {
          date: '2024-01-15',
          patientName: 'John Doe',
          providerName: 'Dr. Smith',
          appointmentType: 'Consultation',
          reason: 'Patient called to cancel',
          status: 'cancelled',
        },
      ];

      const mockTotalRow = { total: '100' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockAppointmentRows })
        .mockResolvedValueOnce({ rows: [mockTotalRow] });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await reportService.generateNoShowReport(tenantId, filters, userId);

      expect(result).toEqual(mockAppointmentRows);
      expect(audit.auditLog).toHaveBeenCalledWith(
        tenantId,
        userId,
        'report_generate_no_show',
        'report',
        expect.stringContaining('no_show_rate_')
      );
    });

    it('should filter by provider', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const filters = {
        providerId: 'provider-123',
      };

      await reportService.generateNoShowReport(tenantId, filters);

      const call = (pool.query as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('and a.provider_id =');
      expect(call[1]).toContain('provider-123');
    });

    it('should handle zero total appointments', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const filters = {};

      const result = await reportService.generateNoShowReport(tenantId, filters);

      expect(result).toEqual([]);
      // Should not throw division by zero error
    });
  });

  describe('getFinancialSummary', () => {
    it('should get financial summary', async () => {
      const mockRow = {
        totalCharges: '100000',
        totalPayments: '75000',
      };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockRow] });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await reportService.getFinancialSummary(tenantId, filters);

      expect(result).toEqual({
        totalCharges: 100000,
        totalPayments: 75000,
        totalOutstanding: 25000,
      });
    });

    it('should handle null values', async () => {
      const mockRow = {
        totalCharges: null,
        totalPayments: null,
      };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockRow] });

      const result = await reportService.getFinancialSummary(tenantId, {});

      expect(result).toEqual({
        totalCharges: 0,
        totalPayments: 0,
        totalOutstanding: 0,
      });
    });

    it('should apply date filters', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await reportService.getFinancialSummary(tenantId, filters);

      const call = (pool.query as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('and cl.created_at >=');
      expect(call[0]).toContain('and cl.created_at <');
      expect(call[1]).toEqual([tenantId, '2024-01-01', '2024-01-31']);
    });
  });

  describe('Error handling', () => {
    it('should propagate database errors', async () => {
      const error = new Error('Database connection failed');
      (pool.query as jest.Mock).mockRejectedValue(error);

      await expect(
        reportService.generateAppointmentReport(tenantId, {})
      ).rejects.toThrow('Database connection failed');
    });
  });
});
