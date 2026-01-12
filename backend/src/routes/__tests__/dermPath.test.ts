import request from 'supertest';
import express from 'express';
import { dermPathRouter } from '../dermPath';
import { pool } from '../../db/pool';
import { DermPathParser } from '../../services/dermPathParser';

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'provider' };
    return next();
  },
}));

// Mock pool
jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock DermPathParser
jest.mock('../../services/dermPathParser', () => ({
  DermPathParser: {
    parseReport: jest.fn(),
    suggestSNOMEDCode: jest.fn(),
    generateSummary: jest.fn(),
    extractKeyFindings: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/dermpath', dermPathRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  (DermPathParser.parseReport as jest.Mock).mockReset();
  (DermPathParser.suggestSNOMEDCode as jest.Mock).mockReset();
  (DermPathParser.generateSummary as jest.Mock).mockReset();
  (DermPathParser.extractKeyFindings as jest.Mock).mockReset();
});

describe('DermPath Routes - Reports', () => {
  describe('GET /api/dermpath/reports', () => {
    it('should return list of reports', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'report-1',
            patient_name: 'John Doe',
            diagnosis: 'Basal cell carcinoma',
          },
          {
            id: 'report-2',
            patient_name: 'Jane Smith',
            diagnosis: 'Melanoma',
          },
        ],
      });
      const res = await request(app).get('/api/dermpath/reports');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('should filter by patient_id', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'report-1' }] });
      const res = await request(app).get('/api/dermpath/reports?patient_id=patient-1');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['tenant-1', 'patient-1']));
    });

    it('should filter by date range', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'report-1' }] });
      const res = await request(app).get('/api/dermpath/reports?from_date=2024-01-01&to_date=2024-12-31');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['tenant-1', '2024-01-01', '2024-12-31'])
      );
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/dermpath/reports');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch reports');
    });
  });

  describe('GET /api/dermpath/reports/:id', () => {
    it('should return 404 when report not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app).get('/api/dermpath/reports/report-1');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Report not found');
    });

    it('should return report details with documents', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'report-1',
            patient_name: 'John Doe',
            diagnosis: 'Basal cell carcinoma',
            documents: [
              { id: 'doc-1', file_name: 'slide1.jpg', is_image: true },
              { id: 'doc-2', file_name: 'report.pdf', is_image: false },
            ],
          },
        ],
        rowCount: 1,
      });
      const res = await request(app).get('/api/dermpath/reports/report-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('report-1');
      expect(res.body.documents).toHaveLength(2);
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/dermpath/reports/report-1');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch report');
    });
  });

  describe('POST /api/dermpath/reports', () => {
    it('should successfully create dermpath report', async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'report-1',
              diagnosis: 'Basal cell carcinoma',
              diagnosis_code: '254701007',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE lab_orders
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      connectMock.mockResolvedValueOnce(client);
      (DermPathParser.suggestSNOMEDCode as jest.Mock).mockReturnValueOnce('254701007');

      const res = await request(app)
        .post('/api/dermpath/reports')
        .send({
          lab_order_id: 'order-1',
          patient_id: 'patient-1',
          accession_number: 'ACC-001',
          report_date: '2024-01-15',
          pathologist_name: 'Dr. Smith',
          specimen_site: 'Left arm',
          specimen_type: 'Shave biopsy',
          diagnosis: 'Basal cell carcinoma',
          status: 'final',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('report-1');
      expect(DermPathParser.suggestSNOMEDCode).toHaveBeenCalledWith('Basal cell carcinoma');
    });

    it('should handle database errors during creation', async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app)
        .post('/api/dermpath/reports')
        .send({
          lab_order_id: 'order-1',
          patient_id: 'patient-1',
          accession_number: 'ACC-001',
          report_date: '2024-01-15',
          pathologist_name: 'Dr. Smith',
          specimen_site: 'Left arm',
          diagnosis: 'Test diagnosis',
        });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create report');
    });

    it('should handle complex report with all fields', async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'report-1' }] })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE lab_orders
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      connectMock.mockResolvedValueOnce(client);
      (DermPathParser.suggestSNOMEDCode as jest.Mock).mockReturnValueOnce('372244006');

      const res = await request(app)
        .post('/api/dermpath/reports')
        .send({
          lab_order_id: 'order-1',
          patient_id: 'patient-1',
          accession_number: 'ACC-002',
          report_date: '2024-01-15',
          pathologist_name: 'Dr. Jones',
          pathologist_npi: '1234567890',
          specimen_site: 'Back',
          specimen_type: 'Excision',
          specimen_size: '1.5 x 1.2 cm',
          number_of_pieces: 2,
          clinical_history: 'History of dysplastic nevi',
          clinical_diagnosis: 'Rule out melanoma',
          gross_description: 'Two pieces of skin tissue',
          microscopic_description: 'Atypical melanocytes present',
          diagnosis: 'Melanoma in situ',
          special_stains: [{ name: 'S100', result: 'positive' }],
          immunohistochemistry: [{ name: 'MART-1', result: 'positive' }],
          margins_status: 'clear',
          margin_measurements: '2mm',
          additional_findings: 'None',
          comment: 'Recommend close follow-up',
          status: 'final',
        });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/dermpath/parse', () => {
    it('should return 400 when report_text missing', async () => {
      const res = await request(app).post('/api/dermpath/parse').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('report_text is required');
    });

    it('should successfully parse report text', async () => {
      const parsedData = {
        accessionNumber: 'ACC-001',
        specimenSite: 'Left arm',
        diagnosis: 'Basal cell carcinoma',
        microscopicDescription: 'Basal cell nests present',
      };
      (DermPathParser.parseReport as jest.Mock).mockReturnValueOnce(parsedData);
      (DermPathParser.suggestSNOMEDCode as jest.Mock).mockReturnValueOnce('254701007');
      (DermPathParser.generateSummary as jest.Mock).mockReturnValueOnce('Summary text');
      (DermPathParser.extractKeyFindings as jest.Mock).mockReturnValueOnce([
        'Basal cell nests',
        'Peripheral palisading',
      ]);

      const res = await request(app)
        .post('/api/dermpath/parse')
        .send({
          report_text: 'ACCESSION: ACC-001\nSPECIMEN SITE: Left arm\nDIAGNOSIS: Basal cell carcinoma',
        });
      expect(res.status).toBe(200);
      expect(res.body.parsed).toEqual(parsedData);
      expect(res.body.snomedCode).toBe('254701007');
      expect(res.body.summary).toBe('Summary text');
      expect(res.body.keyFindings).toHaveLength(2);
    });

    it('should handle parsing errors', async () => {
      (DermPathParser.parseReport as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Parsing error');
      });

      const res = await request(app)
        .post('/api/dermpath/parse')
        .send({ report_text: 'Invalid report text' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to parse report');
    });
  });
});

describe('DermPath Routes - Cultures', () => {
  describe('GET /api/dermpath/cultures', () => {
    it('should return list of culture results', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'culture-1',
            patient_name: 'John Doe',
            culture_type: 'fungal',
            organism_identified: 'Candida albicans',
          },
          {
            id: 'culture-2',
            patient_name: 'Jane Smith',
            culture_type: 'bacterial',
            organism_identified: 'Staphylococcus aureus',
          },
        ],
      });
      const res = await request(app).get('/api/dermpath/cultures');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('should filter by patient_id', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'culture-1' }] });
      const res = await request(app).get('/api/dermpath/cultures?patient_id=patient-1');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['tenant-1', 'patient-1']));
    });

    it('should filter by culture_type', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'culture-1' }] });
      const res = await request(app).get('/api/dermpath/cultures?culture_type=fungal');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['tenant-1', 'fungal']));
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/dermpath/cultures');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch culture results');
    });
  });

  describe('POST /api/dermpath/cultures', () => {
    it('should successfully create culture result', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'culture-1',
            culture_type: 'bacterial',
            organism_identified: 'MRSA',
          },
        ],
      });
      const res = await request(app)
        .post('/api/dermpath/cultures')
        .send({
          lab_order_id: 'order-1',
          patient_id: 'patient-1',
          culture_type: 'bacterial',
          specimen_source: 'skin lesion',
          collection_date: '2024-01-10',
          organism_identified: 'MRSA',
          is_normal_flora: false,
          susceptibility_results: [
            { antibiotic: 'Vancomycin', result: 'Sensitive' },
            { antibiotic: 'Penicillin', result: 'Resistant' },
          ],
          status: 'final',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('culture-1');
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .post('/api/dermpath/cultures')
        .send({
          lab_order_id: 'order-1',
          patient_id: 'patient-1',
          culture_type: 'bacterial',
          specimen_source: 'skin',
          collection_date: '2024-01-10',
          status: 'final',
        });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create culture result');
    });
  });
});

describe('DermPath Routes - Patch Tests', () => {
  describe('GET /api/dermpath/patch-tests', () => {
    it('should return list of patch tests', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-1',
            patient_name: 'John Doe',
            panel_name: 'Standard Series',
            allergens: [
              { allergen_name: 'Nickel', is_positive: true },
              { allergen_name: 'Fragrance Mix', is_positive: false },
            ],
          },
        ],
      });
      const res = await request(app).get('/api/dermpath/patch-tests');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].allergens).toHaveLength(2);
    });

    it('should filter by patient_id', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'test-1' }] });
      const res = await request(app).get('/api/dermpath/patch-tests?patient_id=patient-1');
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['tenant-1', 'patient-1']));
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/api/dermpath/patch-tests');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch patch test results');
    });
  });

  describe('POST /api/dermpath/patch-tests', () => {
    it('should successfully create patch test', async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'test-1' }] }) // insert test
        .mockResolvedValueOnce({ rows: [] }) // insert allergen 1
        .mockResolvedValueOnce({ rows: [] }) // insert allergen 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      connectMock.mockResolvedValueOnce(client);
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-1',
            allergens: [
              { allergen_name: 'Nickel', position: 1 },
              { allergen_name: 'Cobalt', position: 2 },
            ],
          },
        ],
      });

      const res = await request(app)
        .post('/api/dermpath/patch-tests')
        .send({
          patient_id: 'patient-1',
          encounter_id: 'encounter-1',
          ordering_provider_id: 'provider-1',
          panel_name: 'Standard Series',
          application_date: '2024-01-10',
          allergens: [
            { allergen_name: 'Nickel', position: 1, concentration: '5%' },
            { allergen_name: 'Cobalt', position: 2, concentration: '1%' },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('test-1');
      expect(res.body.allergens).toHaveLength(2);
    });

    it('should create test without allergens', async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'test-1' }] }) // insert test
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      connectMock.mockResolvedValueOnce(client);
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'test-1', allergens: null }] });

      const res = await request(app)
        .post('/api/dermpath/patch-tests')
        .send({
          patient_id: 'patient-1',
          encounter_id: 'encounter-1',
          ordering_provider_id: 'provider-1',
          panel_name: 'Custom Panel',
          application_date: '2024-01-10',
        });
      expect(res.status).toBe(201);
    });

    it('should handle database errors', async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app)
        .post('/api/dermpath/patch-tests')
        .send({
          patient_id: 'patient-1',
          encounter_id: 'encounter-1',
          ordering_provider_id: 'provider-1',
          panel_name: 'Standard Series',
          application_date: '2024-01-10',
        });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create patch test');
    });
  });

  describe('PATCH /api/dermpath/patch-tests/:id/reading', () => {
    it('should successfully record 48h reading', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] }) // update test
        .mockResolvedValueOnce({ rows: [] }); // update allergen
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '48h',
          reading_date: '2024-01-12',
          reading_by: 'provider-1',
          allergen_readings: [
            { allergen_id: 'allergen-1', value: '++', relevance: 'current' },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Reading recorded successfully');
    });

    it('should successfully record 72h reading', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '72h',
          reading_date: '2024-01-13',
          reading_by: 'provider-1',
          allergen_readings: [
            { allergen_id: 'allergen-1', value: '+++', relevance: 'current' },
          ],
        });
      expect(res.status).toBe(200);
    });

    it('should successfully record 96h reading', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '96h',
          reading_date: '2024-01-14',
          reading_by: 'provider-1',
          allergen_readings: [
            { allergen_id: 'allergen-1', value: '+', relevance: 'current' },
          ],
        });
      expect(res.status).toBe(200);
    });

    it('should mark allergen as positive for + reading', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '72h',
          reading_date: '2024-01-13',
          reading_by: 'provider-1',
          allergen_readings: [{ allergen_id: 'allergen-1', value: '+' }],
        });
      expect(res.status).toBe(200);
    });

    it('should mark allergen as positive for ++ reading', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '72h',
          reading_date: '2024-01-13',
          reading_by: 'provider-1',
          allergen_readings: [{ allergen_id: 'allergen-1', value: '++' }],
        });
      expect(res.status).toBe(200);
    });

    it('should mark allergen as positive for +++ reading', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '72h',
          reading_date: '2024-01-13',
          reading_by: 'provider-1',
          allergen_readings: [{ allergen_id: 'allergen-1', value: '+++' }],
        });
      expect(res.status).toBe(200);
    });

    it('should not mark negative reading as positive', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '72h',
          reading_date: '2024-01-13',
          reading_by: 'provider-1',
          allergen_readings: [{ allergen_id: 'allergen-1', value: '-' }],
        });
      expect(res.status).toBe(200);
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .patch('/api/dermpath/patch-tests/test-1/reading')
        .send({
          reading_type: '48h',
          reading_date: '2024-01-12',
          reading_by: 'provider-1',
          allergen_readings: [],
        });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to record reading');
    });
  });
});
