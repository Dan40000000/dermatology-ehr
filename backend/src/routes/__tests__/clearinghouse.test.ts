import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { clearinghouseRouter } from '../clearinghouse';
import { pool } from '../../db/pool';
import { auditLog } from '../../services/audit';

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'provider' };
    return next();
  },
}));

// Mock RBAC middleware
jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock audit service
jest.mock('../../services/audit', () => ({
  auditLog: jest.fn(),
}));

// Mock pool
jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock crypto with requireActual to preserve createHash
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'mock-uuid-1234'),
}));

const app = express();
app.use(express.json());
app.use('/api/clearinghouse', clearinghouseRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Clearinghouse Routes - Claim Submission', () => {
  describe('POST /api/clearinghouse/submit-claim', () => {
    it('should reject invalid payload', async () => {
      const res = await request(app)
        .post('/api/clearinghouse/submit-claim')
        .send({ claimId: 'invalid-uuid' });
      expect(res.status).toBe(400);
    });

    it('should return 404 when claim not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app)
        .post('/api/clearinghouse/submit-claim')
        .send({ claimId: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Claim not found');
    });

    it('should return 400 when claim already submitted', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'claim-1', claim_number: 'CLM-001', status: 'submitted' }],
        rowCount: 1,
      });
      const res = await request(app)
        .post('/api/clearinghouse/submit-claim')
        .send({ claimId: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Claim already submitted');
    });

    it('should return 400 when claim already accepted', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'claim-1', claim_number: 'CLM-001', status: 'accepted' }],
        rowCount: 1,
      });
      const res = await request(app)
        .post('/api/clearinghouse/submit-claim')
        .send({ claimId: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Claim already submitted');
    });

    it('should successfully submit claim', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'claim-1', claim_number: 'CLM-001', status: 'draft' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert submission
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // update claim
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // insert history
      const res = await request(app)
        .post('/api/clearinghouse/submit-claim')
        .send({
          claimId: '11111111-1111-4111-8111-111111111111',
          batchId: 'batch-1',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('submissionId');
      expect(res.body).toHaveProperty('controlNumber');
      expect(['accepted', 'rejected', 'pending']).toContain(res.body.status);
      expect(auditMock).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .post('/api/clearinghouse/submit-claim')
        .send({ claimId: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/clearinghouse/claim-status/:claimId', () => {
    it('should return 404 when submission not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app).get('/api/clearinghouse/claim-status/claim-1');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Submission not found');
    });

    it('should return claim submission status', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{
          id: 'sub-1',
          submissionNumber: 'SUB-001',
          controlNumber: 'CTRL-001',
          status: 'accepted',
          claimNumber: 'CLM-001',
        }],
        rowCount: 1,
      });
      const res = await request(app).get('/api/clearinghouse/claim-status/claim-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('sub-1');
      expect(res.body.status).toBe('accepted');
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/clearinghouse/claim-status/claim-1');
      expect(res.status).toBe(500);
    });
  });
});

describe('Clearinghouse Routes - ERA Endpoints', () => {
  describe('GET /api/clearinghouse/era', () => {
    it('should return list of ERAs', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          { id: 'era-1', eraNumber: 'ERA-001', payer: 'BCBS' },
          { id: 'era-2', eraNumber: 'ERA-002', payer: 'Aetna' },
        ],
      });
      const res = await request(app).get('/api/clearinghouse/era');
      expect(res.status).toBe(200);
      expect(res.body.eras).toHaveLength(2);
    });

    it('should filter by status', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'era-1' }] });
      const res = await request(app).get('/api/clearinghouse/era?status=posted');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['tenant-1', 'posted']));
    });

    it('should filter by payer', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'era-1' }] });
      const res = await request(app).get('/api/clearinghouse/era?payer=BCBS');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['tenant-1', '%BCBS%']));
    });

    it('should filter by date range', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'era-1' }] });
      const res = await request(app).get('/api/clearinghouse/era?startDate=2024-01-01&endDate=2024-12-31');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['tenant-1', '2024-01-01', '2024-12-31'])
      );
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/clearinghouse/era');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/clearinghouse/era', () => {
    it('should reject invalid payload', async () => {
      const res = await request(app)
        .post('/api/clearinghouse/era')
        .send({ eraNumber: 'ERA-001' });
      expect(res.status).toBe(400);
    });

    it('should successfully create ERA', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert ERA
        .mockResolvedValueOnce({ rows: [{ id: 'claim-1' }] }) // find claim
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // insert claim detail
      const res = await request(app)
        .post('/api/clearinghouse/era')
        .send({
          eraNumber: 'ERA-001',
          payer: 'BCBS',
          paymentAmountCents: 50000,
          claims: [
            {
              claimNumber: 'CLM-001',
              chargeAmountCents: 60000,
              paidAmountCents: 50000,
              adjustmentAmountCents: 10000,
              patientResponsibilityCents: 0,
            },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('mock-uuid-1234');
      expect(auditMock).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .post('/api/clearinghouse/era')
        .send({
          eraNumber: 'ERA-001',
          payer: 'BCBS',
          paymentAmountCents: 50000,
          claims: [],
        });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/clearinghouse/era/:id', () => {
    it('should return 404 when ERA not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app).get('/api/clearinghouse/era/era-1');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('ERA not found');
    });

    it('should return ERA details with claims', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'era-1', eraNumber: 'ERA-001', payer: 'BCBS' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'claim-1', claimNumber: 'CLM-001' },
            { id: 'claim-2', claimNumber: 'CLM-002' },
          ],
        });
      const res = await request(app).get('/api/clearinghouse/era/era-1');
      expect(res.status).toBe(200);
      expect(res.body.era.id).toBe('era-1');
      expect(res.body.claims).toHaveLength(2);
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/clearinghouse/era/era-1');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/clearinghouse/era/:id/post', () => {
    it('should return 404 when ERA not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app).post('/api/clearinghouse/era/era-1/post');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('ERA not found');
    });

    it('should return 400 when ERA already posted', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'era-1', status: 'posted', paymentAmountCents: 50000 }],
        rowCount: 1,
      });
      const res = await request(app).post('/api/clearinghouse/era/era-1/post');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ERA already posted');
    });

    it('should successfully post ERA payments', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'era-1', status: 'received', paymentAmountCents: 50000 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            { claimId: 'claim-1', paidAmountCents: 25000 },
            { claimId: 'claim-2', paidAmountCents: 25000 },
          ],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert payment 1
        .mockResolvedValueOnce({ rows: [{ totalPaid: 25000 }] }) // sum payments 1
        .mockResolvedValueOnce({ rows: [{ totalCents: 30000, status: 'submitted' }] }) // get claim 1
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert payment 2
        .mockResolvedValueOnce({ rows: [{ totalPaid: 25000 }] }) // sum payments 2
        .mockResolvedValueOnce({ rows: [{ totalCents: 30000, status: 'submitted' }] }) // get claim 2
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // update ERA status
      const res = await request(app).post('/api/clearinghouse/era/era-1/post');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.claimsPosted).toBe(2);
      expect(auditMock).toHaveBeenCalled();
    });

    it('should mark claim as paid when fully paid', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'era-1', status: 'received', paymentAmountCents: 30000 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ claimId: 'claim-1', paidAmountCents: 30000 }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert payment
        .mockResolvedValueOnce({ rows: [{ totalPaid: 30000 }] }) // sum payments
        .mockResolvedValueOnce({ rows: [{ totalCents: 30000, status: 'submitted' }] }) // get claim
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // update claim status
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert status history
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // update ERA status
      const res = await request(app).post('/api/clearinghouse/era/era-1/post');
      expect(res.status).toBe(200);
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).post('/api/clearinghouse/era/era-1/post');
      expect(res.status).toBe(500);
    });
  });
});

describe('Clearinghouse Routes - EFT Endpoints', () => {
  describe('GET /api/clearinghouse/eft', () => {
    it('should return list of EFTs', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          { id: 'eft-1', eftTraceNumber: 'EFT-001' },
          { id: 'eft-2', eftTraceNumber: 'EFT-002' },
        ],
      });
      const res = await request(app).get('/api/clearinghouse/eft');
      expect(res.status).toBe(200);
      expect(res.body.efts).toHaveLength(2);
    });

    it('should filter by reconciled status', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'eft-1' }] });
      const res = await request(app).get('/api/clearinghouse/eft?reconciled=true');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['tenant-1', true]));
    });

    it('should filter by payer and date range', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'eft-1' }] });
      const res = await request(app).get(
        '/api/clearinghouse/eft?payer=BCBS&startDate=2024-01-01&endDate=2024-12-31'
      );
      expect(res.status).toBe(200);
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/clearinghouse/eft');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/clearinghouse/eft', () => {
    it('should reject invalid payload', async () => {
      const res = await request(app)
        .post('/api/clearinghouse/eft')
        .send({ eftTraceNumber: 'EFT-001' });
      expect(res.status).toBe(400);
    });

    it('should successfully create EFT', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app)
        .post('/api/clearinghouse/eft')
        .send({
          eftTraceNumber: 'EFT-001',
          payer: 'BCBS',
          paymentAmountCents: 50000,
          depositDate: '2024-01-15',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('mock-uuid-1234');
      expect(auditMock).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .post('/api/clearinghouse/eft')
        .send({
          eftTraceNumber: 'EFT-001',
          payer: 'BCBS',
          paymentAmountCents: 50000,
          depositDate: '2024-01-15',
        });
      expect(res.status).toBe(500);
    });
  });
});

describe('Clearinghouse Routes - Reconciliation', () => {
  describe('POST /api/clearinghouse/reconcile', () => {
    it('should reject invalid payload', async () => {
      const res = await request(app)
        .post('/api/clearinghouse/reconcile')
        .send({ eraId: 'invalid-uuid' });
      expect(res.status).toBe(400);
    });

    it('should return 404 when ERA not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app)
        .post('/api/clearinghouse/reconcile')
        .send({ eraId: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('ERA not found');
    });

    it('should return 404 when EFT not found', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ paymentAmountCents: 50000, payer: 'BCBS' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // EFT check
      const res = await request(app)
        .post('/api/clearinghouse/reconcile')
        .send({
          eraId: '11111111-1111-4111-8111-111111111111',
          eftId: '22222222-2222-4222-8222-222222222222',
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('EFT not found');
    });

    it('should successfully reconcile ERA without EFT', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ paymentAmountCents: 50000, payer: 'BCBS' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert reconciliation
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // update ERA
      const res = await request(app)
        .post('/api/clearinghouse/reconcile')
        .send({
          eraId: '11111111-1111-4111-8111-111111111111',
        });
      expect(res.status).toBe(200);
      expect(res.body.varianceCents).toBe(0);
      expect(res.body.status).toBe('balanced');
      expect(auditMock).toHaveBeenCalled();
    });

    it('should successfully reconcile ERA with matching EFT', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ paymentAmountCents: 50000, payer: 'BCBS' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ paymentAmountCents: 50000 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // update EFT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert reconciliation
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // update ERA
      const res = await request(app)
        .post('/api/clearinghouse/reconcile')
        .send({
          eraId: '11111111-1111-4111-8111-111111111111',
          eftId: '22222222-2222-4222-8222-222222222222',
        });
      expect(res.status).toBe(200);
      expect(res.body.varianceCents).toBe(0);
      expect(res.body.status).toBe('balanced');
    });

    it('should detect variance when EFT amount differs', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ paymentAmountCents: 50000, payer: 'BCBS' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ paymentAmountCents: 49500 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // update EFT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert reconciliation
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // update ERA
      const res = await request(app)
        .post('/api/clearinghouse/reconcile')
        .send({
          eraId: '11111111-1111-4111-8111-111111111111',
          eftId: '22222222-2222-4222-8222-222222222222',
          varianceReason: 'Bank fee',
        });
      expect(res.status).toBe(200);
      expect(res.body.varianceCents).toBe(-500);
      expect(res.body.status).toBe('variance');
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .post('/api/clearinghouse/reconcile')
        .send({ eraId: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(500);
    });
  });
});

describe('Clearinghouse Routes - Reports', () => {
  describe('GET /api/clearinghouse/reports/closing', () => {
    it('should return closing report', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ total: 100000 }] }) // charges
        .mockResolvedValueOnce({ rows: [{ total: 80000 }] }) // payments
        .mockResolvedValueOnce({ rows: [{ total: 10000 }] }) // adjustments
        .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // claims submitted
        .mockResolvedValueOnce({ rows: [{ count: 8 }] }) // claims paid
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }) // claims denied
        .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // ERAs received
        .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // EFTs received
        .mockResolvedValueOnce({ rows: [{ total: 500 }] }) // variance
        .mockResolvedValueOnce({ rows: [{ outstanding: 10000 }] }); // outstanding
      const res = await request(app).get(
        '/api/clearinghouse/reports/closing?startDate=2024-01-01&endDate=2024-01-31&reportType=daily'
      );
      expect(res.status).toBe(200);
      expect(res.body.reportType).toBe('daily');
      expect(res.body.totalChargesCents).toBe(100000);
      expect(res.body.totalPaymentsCents).toBe(80000);
      expect(res.body.claimsSubmitted).toBe(10);
      expect(res.body.claimsPaid).toBe(8);
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get(
        '/api/clearinghouse/reports/closing?startDate=2024-01-01&endDate=2024-01-31'
      );
      expect(res.status).toBe(500);
    });
  });
});
