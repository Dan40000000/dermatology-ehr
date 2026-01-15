import request from 'supertest';
import express from 'express';
import { payerPaymentsRouter } from '../payerPayments';
import { pool } from '../../db/pool';

jest.mock('../../db/pool');
jest.mock('../../services/audit');

const app = express();
app.use(express.json());
app.use('/api/payer-payments', payerPaymentsRouter);

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = {
      id: 'user-123',
      tenantId: 'tenant-123',
      role: 'admin',
    };
    next();
  },
  AuthedRequest: {},
}));

jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (req: any, res: any, next: any) => next(),
}));

describe('Payer Payments API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/payer-payments', () => {
    it('should fetch all payer payments', async () => {
      const mockPayments = [
        {
          id: 'pp-1',
          paymentDate: '2026-01-15',
          payerName: 'Blue Cross',
          checkEftNumber: 'CHK-12345',
          totalAmountCents: 50000,
          appliedAmountCents: 50000,
          unappliedAmountCents: 0,
          status: 'fully_applied',
          createdByName: 'Admin User',
          lineItemCount: 3,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({
        rows: mockPayments,
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/payer-payments')
        .expect(200);

      expect(response.body).toEqual({ payerPayments: mockPayments });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('select'),
        expect.arrayContaining(['tenant-123'])
      );
    });

    it('should filter payer payments by status', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await request(app)
        .get('/api/payer-payments?status=pending')
        .expect(200);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('and pp.status = $2'),
        expect.arrayContaining(['tenant-123', 'pending'])
      );
    });
  });

  describe('GET /api/payer-payments/:id', () => {
    it('should fetch a single payer payment with line items', async () => {
      const mockPayment = {
        id: 'pp-1',
        paymentDate: '2026-01-15',
        payerName: 'Blue Cross',
        totalAmountCents: 50000,
      };

      const mockLineItems = [
        {
          id: 'li-1',
          claimId: 'claim-1',
          patientId: 'patient-1',
          amountCents: 50000,
          patientFirstName: 'John',
          patientLastName: 'Doe',
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockPayment], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockLineItems, rowCount: 1 });

      const response = await request(app)
        .get('/api/payer-payments/pp-1')
        .expect(200);

      expect(response.body).toEqual({
        payment: mockPayment,
        lineItems: mockLineItems,
      });
    });

    it('should return 404 for non-existent payment', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await request(app)
        .get('/api/payer-payments/nonexistent')
        .expect(404);
    });
  });

  describe('POST /api/payer-payments', () => {
    it('should create a new payer payment', async () => {
      const newPayment = {
        paymentDate: '2026-01-15',
        payerName: 'Aetna',
        checkEftNumber: 'EFT-67890',
        totalAmountCents: 75000,
        lineItems: [
          {
            patientId: 'patient-1',
            claimId: 'claim-1',
            serviceDate: '2026-01-10',
            amountCents: 75000,
          },
        ],
      };

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/payer-payments')
        .send(newPayment)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const invalidPayment = {
        paymentDate: '2026-01-15',
        // missing payerName
        totalAmountCents: 75000,
      };

      await request(app)
        .post('/api/payer-payments')
        .send(invalidPayment)
        .expect(400);
    });
  });

  describe('PUT /api/payer-payments/:id', () => {
    it('should update a payer payment', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'pp-1' }], rowCount: 1 }) // check exists
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update

      await request(app)
        .put('/api/payer-payments/pp-1')
        .send({ status: 'reconciled' })
        .expect(200);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('update payer_payments'),
        expect.any(Array)
      );
    });

    it('should return 404 for non-existent payment', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await request(app)
        .put('/api/payer-payments/nonexistent')
        .send({ status: 'reconciled' })
        .expect(404);
    });
  });

  describe('DELETE /api/payer-payments/:id', () => {
    it('should delete a payer payment', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ batch_id: null }], rowCount: 1 }) // get payment info
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // delete
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      await request(app)
        .delete('/api/payer-payments/pp-1')
        .expect(200);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });
});
