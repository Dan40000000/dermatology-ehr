import request from 'supertest';
import express from 'express';
import { bodyDiagramRouter } from '../bodyDiagram';
import { pool } from '../../db/pool';
import { auditLog } from '../../services/audit';

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

jest.mock('../../services/audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'marking-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/body-diagram', bodyDiagramRouter);

describe('Body Diagram Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/body-diagram/locations', () => {
    it('should fetch all body locations', async () => {
      const mockLocations = [
        {
          id: 'loc-1',
          code: 'HEAD_FRONT',
          name: 'Head (Front)',
          category: 'head',
          svgCoordinates: { x: 50, y: 10 },
        },
        {
          id: 'loc-2',
          code: 'CHEST',
          name: 'Chest',
          category: 'torso',
          svgCoordinates: { x: 50, y: 40 },
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockLocations });

      const response = await request(app).get('/api/body-diagram/locations');

      expect(response.status).toBe(200);
      expect(response.body.locations).toHaveLength(2);
      expect(response.body.locations[0].code).toBe('HEAD_FRONT');
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app).get('/api/body-diagram/locations');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch body locations');
    });
  });

  describe('GET /api/body-diagram/patient/:patientId/markings', () => {
    it('should fetch patient markings', async () => {
      const mockMarkings = [
        {
          id: 'marking-1',
          patientId: 'patient-123',
          encounterId: 'encounter-456',
          locationCode: 'FOREARM_LEFT',
          locationX: 30,
          locationY: 50,
          viewType: 'front',
          markingType: 'lesion',
          diagnosisCode: 'L82.1',
          diagnosisDescription: 'Seborrheic keratosis',
          lesionType: 'benign',
          lesionSizeMm: 5,
          lesionColor: 'brown',
          status: 'active',
          createdAt: '2024-01-15T10:00:00Z',
          locationName: 'Left Forearm',
          createdByName: 'Dr. Smith',
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockMarkings });

      const response = await request(app).get(
        '/api/body-diagram/patient/patient-123/markings'
      );

      expect(response.status).toBe(200);
      expect(response.body.markings).toHaveLength(1);
      expect(response.body.markings[0].locationCode).toBe('FOREARM_LEFT');
      expect(auditLogMock).toHaveBeenCalledWith(
        'tenant-123',
        'user-123',
        'body_diagram_view',
        'patient',
        'patient-123'
      );
    });

    it('should handle empty results', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get(
        '/api/body-diagram/patient/patient-999/markings'
      );

      expect(response.status).toBe(200);
      expect(response.body.markings).toEqual([]);
    });
  });

  describe('GET /api/body-diagram/encounter/:encounterId/markings', () => {
    it('should fetch encounter markings', async () => {
      const mockMarkings = [
        {
          id: 'marking-2',
          encounterId: 'encounter-789',
          locationCode: 'BACK_UPPER',
          viewType: 'back',
          markingType: 'examined',
          status: 'active',
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockMarkings });

      const response = await request(app).get(
        '/api/body-diagram/encounter/encounter-789/markings'
      );

      expect(response.status).toBe(200);
      expect(response.body.markings).toHaveLength(1);
    });
  });

  describe('GET /api/body-diagram/markings/:id', () => {
    it('should fetch single marking with details', async () => {
      const mockMarking = {
        id: 'marking-456',
        patientId: 'patient-123',
        locationCode: 'SCALP',
        locationX: 50,
        locationY: 15,
        viewType: 'front',
        markingType: 'biopsy',
        diagnosisCode: 'C44.4',
        diagnosisDescription: 'Basal cell carcinoma',
        status: 'biopsied',
        description: 'Suspicious lesion',
        locationName: 'Scalp',
        patientFirstName: 'John',
        patientLastName: 'Doe',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockMarking] });

      const response = await request(app).get('/api/body-diagram/markings/marking-456');

      expect(response.status).toBe(200);
      expect(response.body.marking.id).toBe('marking-456');
      expect(response.body.marking.markingType).toBe('biopsy');
    });

    it('should return 404 when marking not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/body-diagram/markings/marking-999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Marking not found');
    });
  });

  describe('POST /api/body-diagram/markings', () => {
    it('should create new marking', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] }) // Patient check
        .mockResolvedValueOnce({ rows: [{ code: 'FOREARM_LEFT' }] }) // Location check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert

      const markingData = {
        patientId: 'patient-123',
        locationCode: 'FOREARM_LEFT',
        locationX: 30,
        locationY: 50,
        viewType: 'front',
        markingType: 'lesion',
        diagnosisCode: 'L82.1',
        diagnosisDescription: 'Seborrheic keratosis',
        lesionType: 'benign',
        lesionSizeMm: 5,
        lesionColor: 'brown',
        status: 'active',
        description: 'Pigmented lesion on forearm',
      };

      const response = await request(app)
        .post('/api/body-diagram/markings')
        .send(markingData);

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('marking-uuid-123');
      expect(auditLogMock).toHaveBeenCalledWith(
        'tenant-123',
        'user-123',
        'body_marking_create',
        'body_marking',
        'marking-uuid-123',
        expect.objectContaining({
          patientId: 'patient-123',
          markingType: 'lesion',
        })
      );
    });

    it('should validate required fields', async () => {
      const response = await request(app).post('/api/body-diagram/markings').send({
        patientId: 'patient-123',
        // Missing required fields
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 when patient not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // Patient check fails

      const markingData = {
        patientId: 'patient-999',
        locationCode: 'FOREARM_LEFT',
        locationX: 30,
        locationY: 50,
        viewType: 'front',
        markingType: 'lesion',
      };

      const response = await request(app)
        .post('/api/body-diagram/markings')
        .send(markingData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Patient not found');
    });

    it('should validate location code exists', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] }) // Patient check
        .mockResolvedValueOnce({ rows: [] }); // Location check fails

      const markingData = {
        patientId: 'patient-123',
        locationCode: 'INVALID_CODE',
        locationX: 30,
        locationY: 50,
        viewType: 'front',
        markingType: 'lesion',
      };

      const response = await request(app)
        .post('/api/body-diagram/markings')
        .send(markingData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid location code');
    });

    it('should verify encounter exists when provided', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] }) // Patient check
        .mockResolvedValueOnce({ rows: [{ code: 'FOREARM_LEFT' }] }) // Location check
        .mockResolvedValueOnce({ rows: [] }); // Encounter check fails

      const markingData = {
        patientId: 'patient-123',
        encounterId: 'encounter-999',
        locationCode: 'FOREARM_LEFT',
        locationX: 30,
        locationY: 50,
        viewType: 'front',
        markingType: 'lesion',
      };

      const response = await request(app)
        .post('/api/body-diagram/markings')
        .send(markingData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Encounter not found');
    });
  });

  describe('PUT /api/body-diagram/markings/:id', () => {
    it('should update marking', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'marking-123' }] }) // Marking check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Update

      const updateData = {
        status: 'resolved',
        resolvedDate: '2024-01-20',
        treatmentNotes: 'Lesion removed successfully',
      };

      const response = await request(app)
        .put('/api/body-diagram/markings/marking-123')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(auditLogMock).toHaveBeenCalledWith(
        'tenant-123',
        'user-123',
        'body_marking_update',
        'body_marking',
        'marking-123'
      );
    });

    it('should return 404 when marking not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/api/body-diagram/markings/marking-999')
        .send({ status: 'resolved' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Marking not found');
    });

    it('should validate location code when updating', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'marking-123' }] }) // Marking check
        .mockResolvedValueOnce({ rows: [] }); // Location check fails

      const response = await request(app)
        .put('/api/body-diagram/markings/marking-123')
        .send({ locationCode: 'INVALID_CODE' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid location code');
    });

    it('should handle empty update data', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'marking-123' }] });

      const response = await request(app)
        .put('/api/body-diagram/markings/marking-123')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No fields to update');
    });
  });

  describe('DELETE /api/body-diagram/markings/:id', () => {
    it('should delete marking', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ patientId: 'patient-123' }],
        rowCount: 1,
      });

      const response = await request(app).delete(
        '/api/body-diagram/markings/marking-123'
      );

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(auditLogMock).toHaveBeenCalledWith(
        'tenant-123',
        'user-123',
        'body_marking_delete',
        'body_marking',
        'marking-123',
        expect.objectContaining({ patientId: 'patient-123' })
      );
    });

    it('should return 404 when marking not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app).delete(
        '/api/body-diagram/markings/marking-999'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Marking not found');
    });
  });
});
