import request from 'supertest';
import express from 'express';
import { rxHistoryRouter } from '../rxHistory';
import { pool } from '../../db/pool';
import { getRxHistory } from '../../services/surescriptsService';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-123', tenantId: 'tenant-123', role: 'provider' };
    return next();
  },
}));

jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../services/surescriptsService', () => ({
  getRxHistory: jest.fn(),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'rx-history-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;
const getRxHistoryMock = getRxHistory as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/rx-history', rxHistoryRouter);

describe('RxHistory Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/rx-history/:patientId', () => {
    it('should fetch patient medication history', async () => {
      const mockHistory = [
        {
          id: 'rx-1',
          patient_id: 'patient-123',
          medication_name: 'Tretinoin 0.05% Cream',
          generic_name: 'tretinoin',
          ndc: '12345-678-90',
          strength: '0.05%',
          dosage_form: 'cream',
          quantity: 30,
          days_supply: 30,
          sig: 'Apply nightly',
          prescriber_name: 'Dr. Smith',
          pharmacy_name_resolved: 'CVS Pharmacy',
          ncpdp_id: '1234567',
          fill_date: '2024-01-15',
          fill_number: 1,
          refills_remaining: 2,
          source: 'surescripts',
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] }) // Patient check
        .mockResolvedValueOnce({ rows: mockHistory }); // Rx history

      getRxHistoryMock.mockResolvedValueOnce({
        messageId: 'RXHIST-msg-123',
        patientId: 'patient-123',
        medications: [],
      });

      const response = await request(app).get('/api/rx-history/patient-123');

      expect(response.status).toBe(200);
      expect(response.body.rxHistory).toHaveLength(1);
      expect(response.body.rxHistory[0].medication_name).toBe('Tretinoin 0.05% Cream');
      expect(response.body.surescriptsMessageId).toBe('RXHIST-msg-123');
      expect(response.body.totalRecords).toBe(1);
    });

    it('should return 404 when patient not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // Patient check fails

      const response = await request(app).get('/api/rx-history/patient-999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Patient not found');
    });

    it('should filter by date range', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      getRxHistoryMock.mockResolvedValueOnce({
        messageId: 'RXHIST-msg-123',
        patientId: 'patient-123',
        medications: [],
      });

      const response = await request(app).get('/api/rx-history/patient-123').query({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(response.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('rh.fill_date >='),
        expect.arrayContaining(['patient-123', 'tenant-123', '2024-01-01', '2024-01-31'])
      );
    });

    it('should filter by pharmacy', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      getRxHistoryMock.mockResolvedValueOnce({
        messageId: 'RXHIST-msg-123',
        patientId: 'patient-123',
        medications: [],
      });

      const response = await request(app).get('/api/rx-history/patient-123').query({
        pharmacyId: 'pharmacy-456',
      });

      expect(response.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('rh.pharmacy_id ='),
        expect.arrayContaining(['patient-123', 'tenant-123', 'pharmacy-456'])
      );
    });

    it('should filter by source', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      getRxHistoryMock.mockResolvedValueOnce({
        messageId: 'RXHIST-msg-123',
        patientId: 'patient-123',
        medications: [],
      });

      const response = await request(app).get('/api/rx-history/patient-123').query({
        source: 'manual',
      });

      expect(response.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('rh.source ='),
        expect.arrayContaining(['patient-123', 'tenant-123', 'manual'])
      );
    });

    it('should handle Surescripts service errors gracefully', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      getRxHistoryMock.mockRejectedValueOnce(new Error('Surescripts API error'));

      const response = await request(app).get('/api/rx-history/patient-123');

      expect(response.status).toBe(200);
      expect(response.body.surescriptsMessageId).toBeUndefined();
    });
  });

  describe('GET /api/rx-history/patient/:patientId/summary', () => {
    it('should fetch medication history summary', async () => {
      const mockSummary = [
        {
          medication_name: 'Tretinoin 0.05% Cream',
          generic_name: 'tretinoin',
          fill_count: '5',
          last_fill_date: '2024-01-15',
          total_quantity_filled: '150',
          pharmacies: ['CVS Pharmacy', 'Walgreens'],
        },
        {
          medication_name: 'Doxycycline 100mg',
          generic_name: 'doxycycline',
          fill_count: '3',
          last_fill_date: '2024-01-10',
          total_quantity_filled: '90',
          pharmacies: ['CVS Pharmacy'],
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] }) // Patient check
        .mockResolvedValueOnce({ rows: mockSummary }); // Summary

      const response = await request(app).get(
        '/api/rx-history/patient/patient-123/summary'
      );

      expect(response.status).toBe(200);
      expect(response.body.summary).toHaveLength(2);
      expect(response.body.summary[0].medication_name).toBe('Tretinoin 0.05% Cream');
      expect(response.body.summary[0].fill_count).toBe('5');
    });

    it('should return 404 when patient not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get(
        '/api/rx-history/patient/patient-999/summary'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Patient not found');
    });

    it('should return empty summary when no history exists', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get(
        '/api/rx-history/patient/patient-123/summary'
      );

      expect(response.status).toBe(200);
      expect(response.body.summary).toEqual([]);
    });
  });

  describe('POST /api/rx-history', () => {
    it('should create manual rx history record', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] }) // Patient check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert

      const rxData = {
        patientId: 'patient-123',
        pharmacyId: 'pharmacy-456',
        pharmacyNcpdp: '1234567',
        pharmacyName: 'CVS Pharmacy',
        medicationName: 'Hydrocortisone 1% Cream',
        genericName: 'hydrocortisone',
        ndc: '12345-678-90',
        strength: '1%',
        dosageForm: 'cream',
        quantity: 30,
        quantityUnit: 'gram',
        daysSupply: 30,
        sig: 'Apply twice daily',
        prescriberName: 'Dr. Jones',
        prescriberNpi: '9876543210',
        fillDate: '2024-01-20',
        fillNumber: 1,
        refillsRemaining: 2,
        source: 'manual',
      };

      const response = await request(app).post('/api/rx-history').send(rxData);

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('rx-history-uuid-123');
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rx_history'),
        expect.arrayContaining([
          'rx-history-uuid-123',
          'tenant-123',
          'patient-123',
          'pharmacy-456',
          '1234567',
          'CVS Pharmacy',
          'Hydrocortisone 1% Cream',
          'hydrocortisone',
        ])
      );
    });

    it('should validate required fields', async () => {
      const response = await request(app).post('/api/rx-history').send({
        patientId: 'patient-123',
        // Missing required fields
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 when patient not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const rxData = {
        patientId: 'patient-999',
        medicationName: 'Test Med',
        quantity: 30,
        fillDate: '2024-01-20',
      };

      const response = await request(app).post('/api/rx-history').send(rxData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Patient not found');
    });

    it('should default quantity unit to "each"', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const rxData = {
        patientId: 'patient-123',
        medicationName: 'Test Med',
        quantity: 30,
        fillDate: '2024-01-20',
      };

      const response = await request(app).post('/api/rx-history').send(rxData);

      expect(response.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['each'])
      );
    });
  });

  describe('POST /api/rx-history/import-surescripts/:patientId', () => {
    it('should import rx history from Surescripts', async () => {
      const mockSurescriptsData = {
        messageId: 'RXHIST-import-123',
        patientId: 'patient-123',
        medications: [
          {
            medicationName: 'Tretinoin 0.05% Cream',
            genericName: 'tretinoin',
            ndc: '12345-678-90',
            strength: '0.05%',
            dosageForm: 'cream',
            quantity: 30,
            daysSupply: 30,
            sig: 'Apply nightly',
            prescriberName: 'Dr. Smith',
            prescriberNpi: '1234567890',
            pharmacyName: 'CVS Pharmacy',
            pharmacyNcpdp: '1234567',
            fillDate: '2024-01-15',
            fillNumber: 1,
            refillsRemaining: 2,
          },
          {
            medicationName: 'Doxycycline 100mg',
            genericName: 'doxycycline',
            ndc: '98765-432-10',
            strength: '100mg',
            dosageForm: 'capsule',
            quantity: 30,
            daysSupply: 30,
            sig: 'Take once daily',
            prescriberName: 'Dr. Jones',
            pharmacyName: 'Walgreens',
            pharmacyNcpdp: '7654321',
            fillDate: '2024-01-10',
            fillNumber: 1,
            refillsRemaining: 5,
          },
        ],
      };

      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] }) // Patient check
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check for med 1
        .mockResolvedValueOnce({ rows: [{ id: 'pharmacy-1' }] }) // Pharmacy lookup 1
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert med 1
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check for med 2
        .mockResolvedValueOnce({ rows: [{ id: 'pharmacy-2' }] }) // Pharmacy lookup 2
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert med 2

      getRxHistoryMock.mockResolvedValueOnce(mockSurescriptsData);

      const response = await request(app).post(
        '/api/rx-history/import-surescripts/patient-123'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.importedCount).toBe(2);
      expect(response.body.messageId).toBe('RXHIST-import-123');
      expect(response.body.totalAvailable).toBe(2);
      expect(getRxHistoryMock).toHaveBeenCalledWith('patient-123', 'tenant-123');
    });

    it('should skip duplicate medications', async () => {
      const mockSurescriptsData = {
        messageId: 'RXHIST-import-456',
        patientId: 'patient-123',
        medications: [
          {
            medicationName: 'Tretinoin 0.05% Cream',
            quantity: 30,
            fillDate: '2024-01-15',
            pharmacyNcpdp: '1234567',
            pharmacyName: 'CVS',
            prescriberName: 'Dr. Smith',
            fillNumber: 1,
            refillsRemaining: 2,
          },
        ],
      };

      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'rx-existing' }] }); // Duplicate found

      getRxHistoryMock.mockResolvedValueOnce(mockSurescriptsData);

      const response = await request(app).post(
        '/api/rx-history/import-surescripts/patient-123'
      );

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBe(0);
      expect(response.body.totalAvailable).toBe(1);
    });

    it('should return 404 when patient not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).post(
        '/api/rx-history/import-surescripts/patient-999'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Patient not found');
    });

    it('should handle Surescripts service errors', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] });
      getRxHistoryMock.mockRejectedValueOnce(new Error('Surescripts API error'));

      const response = await request(app).post(
        '/api/rx-history/import-surescripts/patient-123'
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to import Rx history');
    });

    it('should handle pharmacy not found in database', async () => {
      const mockSurescriptsData = {
        messageId: 'RXHIST-import-789',
        patientId: 'patient-123',
        medications: [
          {
            medicationName: 'Test Med',
            quantity: 30,
            fillDate: '2024-01-15',
            pharmacyNcpdp: '9999999',
            pharmacyName: 'Unknown Pharmacy',
            prescriberName: 'Dr. Unknown',
            fillNumber: 1,
            refillsRemaining: 0,
          },
        ],
      };

      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [] }) // Pharmacy not found
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert with null pharmacy

      getRxHistoryMock.mockResolvedValueOnce(mockSurescriptsData);

      const response = await request(app).post(
        '/api/rx-history/import-surescripts/patient-123'
      );

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBe(1);
    });
  });

  describe('DELETE /api/rx-history/:id', () => {
    it('should delete rx history record', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'rx-123' }],
        rowCount: 1,
      });

      const response = await request(app).delete('/api/rx-history/rx-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        'DELETE FROM rx_history WHERE id = $1 AND tenant_id = $2 RETURNING id',
        ['rx-123', 'tenant-123']
      );
    });

    it('should return 404 when record not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app).delete('/api/rx-history/rx-999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Rx history record not found');
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app).delete('/api/rx-history/rx-123');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to delete Rx history record');
    });
  });
});
