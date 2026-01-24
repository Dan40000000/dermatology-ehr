import request from 'supertest';
import express from 'express';
import { fhirRouter } from '../fhir';
import { pool } from '../../db/pool';
import {
  fetchDiagnosisWithContext,
  fetchChargeWithContext,
  fetchVitalWithContext,
  fetchAllergyWithContext,
} from '../../services/fhirMapper';
import { logFHIRAccess } from '../../middleware/fhirAuth';

jest.mock('../../middleware/fhirAuth', () => ({
  requireFHIRAuth: (req: any, _res: any, next: any) => {
    req.fhirAuth = { tenantId: 'tenant-1', clientId: 'client-1', scope: ['system/*.*'], tokenId: 'token-1' };
    return next();
  },
  requireFHIRScope: () => (_req: any, _res: any, next: any) => next(),
  logFHIRAccess: jest.fn(),
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../services/fhirMapper', () => ({
  mapPatientToFHIR: jest.fn((row: any) => ({ resourceType: 'Patient', id: row.id })),
  mapPractitionerToFHIR: jest.fn((row: any) => ({ resourceType: 'Practitioner', id: row.id })),
  mapEncounterToFHIR: jest.fn((row: any) => ({ resourceType: 'Encounter', id: row.id })),
  mapVitalsToFHIRObservations: jest.fn((row: any) => ([{ resourceType: 'Observation', id: `${row.id}-bp` }])),
  mapDiagnosisToFHIRCondition: jest.fn((row: any) => ({ resourceType: 'Condition', id: row.id })),
  mapChargeToProcedure: jest.fn((row: any) => ({ resourceType: 'Procedure', id: row.id })),
  mapAppointmentToFHIR: jest.fn((row: any) => ({ resourceType: 'Appointment', id: row.id })),
  mapOrganizationToFHIR: jest.fn((row: any) => ({ resourceType: 'Organization', id: row.id })),
  mapAllergyToFHIR: jest.fn((row: any) => ({ resourceType: 'AllergyIntolerance', id: row.id })),
  createFHIRBundle: jest.fn((resources: any[], type: string, total?: number) => ({
    resourceType: 'Bundle',
    type,
    total,
    entry: resources.map((resource) => ({ resource })),
  })),
  createOperationOutcome: jest.fn((_severity: string, _code: string, message: string) => ({
    resourceType: 'OperationOutcome',
    message,
  })),
  fetchDiagnosisWithContext: jest.fn(),
  fetchChargeWithContext: jest.fn(),
  fetchVitalWithContext: jest.fn(),
  fetchAllergyWithContext: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/fhir', fhirRouter);

const queryMock = pool.query as jest.Mock;
const logAccessMock = logFHIRAccess as jest.Mock;
const fetchDiagnosisMock = fetchDiagnosisWithContext as jest.Mock;
const fetchChargeMock = fetchChargeWithContext as jest.Mock;
const fetchVitalMock = fetchVitalWithContext as jest.Mock;
const fetchAllergyMock = fetchAllergyWithContext as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  logAccessMock.mockReset();
  fetchDiagnosisMock.mockReset();
  fetchChargeMock.mockReset();
  fetchVitalMock.mockReset();
  fetchAllergyMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe('FHIR routes', () => {
  it('GET /fhir/Patient/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/fhir/Patient/p1');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Patient/:id returns patient', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'p1' }] });

    const res = await request(app).get('/fhir/Patient/p1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Patient');
  });

  it('GET /fhir/Patient returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] });

    const res = await request(app).get('/fhir/Patient?name=pat');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Practitioner/:id returns practitioner', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'pr1' }] });

    const res = await request(app).get('/fhir/Practitioner/pr1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Practitioner');
  });

  it('GET /fhir/Practitioner returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pr1' }] });

    const res = await request(app).get('/fhir/Practitioner');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Encounter/:id returns encounter', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'e1' }] });

    const res = await request(app).get('/fhir/Encounter/e1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Encounter');
  });

  it('GET /fhir/Encounter returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'e1' }] });

    const res = await request(app).get('/fhir/Encounter');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Observation/:id returns 404 when vital missing', async () => {
    fetchVitalMock.mockResolvedValueOnce(null);

    const res = await request(app).get('/fhir/Observation/v1-bp');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Observation/:id returns observation', async () => {
    fetchVitalMock.mockResolvedValueOnce({ id: 'v1' });

    const res = await request(app).get('/fhir/Observation/v1-bp');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Observation');
  });

  it('GET /fhir/Observation returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'v1' }] });

    const res = await request(app).get('/fhir/Observation');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Condition/:id returns condition', async () => {
    fetchDiagnosisMock.mockResolvedValueOnce({ id: 'c1' });

    const res = await request(app).get('/fhir/Condition/c1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Condition');
  });

  it('GET /fhir/Condition returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] });

    const res = await request(app).get('/fhir/Condition');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/AllergyIntolerance/:id returns allergy', async () => {
    fetchAllergyMock.mockResolvedValueOnce({ id: 'a1' });

    const res = await request(app).get('/fhir/AllergyIntolerance/a1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('AllergyIntolerance');
  });

  it('GET /fhir/AllergyIntolerance returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }] });

    const res = await request(app).get('/fhir/AllergyIntolerance');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('POST /fhir/AllergyIntolerance rejects invalid payload', async () => {
    const res = await request(app).post('/fhir/AllergyIntolerance').send({ resourceType: 'Patient' });

    expect(res.status).toBe(400);
  });

  it('POST /fhir/AllergyIntolerance creates allergy', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    fetchAllergyMock.mockResolvedValueOnce({ id: 'a1' });

    const res = await request(app).post('/fhir/AllergyIntolerance').send({
      resourceType: 'AllergyIntolerance',
      patient: { reference: 'Patient/p1' },
      code: { text: 'Peanuts' },
      clinicalStatus: { coding: [{ code: 'active' }] },
    });

    expect(res.status).toBe(201);
    expect(res.body.resourceType).toBe('AllergyIntolerance');
  });

  it('PUT /fhir/AllergyIntolerance/:id rejects missing updates', async () => {
    const res = await request(app).put('/fhir/AllergyIntolerance/a1').send({
      resourceType: 'AllergyIntolerance',
    });

    expect(res.status).toBe(400);
  });

  it('PUT /fhir/AllergyIntolerance/:id updates allergy', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1' }] });

    const res = await request(app).put('/fhir/AllergyIntolerance/a1').send({
      resourceType: 'AllergyIntolerance',
      code: { text: 'Peanuts' },
    });

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('AllergyIntolerance');
  });

  it('DELETE /fhir/AllergyIntolerance/:id returns 204', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1' }] });

    const res = await request(app).delete('/fhir/AllergyIntolerance/a1');

    expect(res.status).toBe(204);
  });

  it('GET /fhir/Procedure/:id returns procedure', async () => {
    fetchChargeMock.mockResolvedValueOnce({ id: 'proc1' });

    const res = await request(app).get('/fhir/Procedure/proc1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Procedure');
  });

  it('GET /fhir/Procedure returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'proc1' }] });

    const res = await request(app).get('/fhir/Procedure');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Appointment/:id returns appointment', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'appt1' }] });

    const res = await request(app).get('/fhir/Appointment/appt1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Appointment');
  });

  it('GET /fhir/Appointment returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'appt1' }] });

    const res = await request(app).get('/fhir/Appointment');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Organization/:id returns organization', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'org1' }] });

    const res = await request(app).get('/fhir/Organization/org1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Organization');
  });

  it('GET /fhir/Organization returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'org1' }] });

    const res = await request(app).get('/fhir/Organization');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/metadata returns capability statement', async () => {
    const res = await request(app).get('/fhir/metadata');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('CapabilityStatement');
  });

  it('GET /fhir/Bundle/summary returns bundle', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pr1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'e1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'v1' }] });

    const res = await request(app).get('/fhir/Bundle/summary');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Patient supports identifier/birthdate/gender filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] });

    const res = await request(app).get(
      '/fhir/Patient?name=pat&identifier=p1&birthdate=1990-01-01&gender=male&_count=10&_offset=5'
    );

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Practitioner supports filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pr1' }] });

    const res = await request(app).get('/fhir/Practitioner?name=doc&identifier=pr1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Encounter supports patient/date/status filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'e1' }] });

    const res = await request(app).get('/fhir/Encounter?patient=p1&date=2024-01-01&status=finished');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Observation supports patient/date/encounter filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'v1' }] });

    const res = await request(app).get('/fhir/Observation?patient=p1&date=2024-01-01&encounter=e1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Observation/:id returns 404 when no observation match', async () => {
    fetchVitalMock.mockResolvedValueOnce({ id: 'v1' });

    const res = await request(app).get('/fhir/Observation/v1-temp');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Condition/:id returns 404 when missing', async () => {
    fetchDiagnosisMock.mockResolvedValueOnce(null);

    const res = await request(app).get('/fhir/Condition/c1');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Condition supports patient/code/encounter filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] });

    const res = await request(app).get('/fhir/Condition?patient=p1&code=L30.9&encounter=e1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Practitioner/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/fhir/Practitioner/pr-missing');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/AllergyIntolerance/:id returns 404 when missing', async () => {
    fetchAllergyMock.mockResolvedValueOnce(null);

    const res = await request(app).get('/fhir/AllergyIntolerance/a-missing');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/AllergyIntolerance supports filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }] });

    const res = await request(app).get(
      '/fhir/AllergyIntolerance?patient=Patient/p1&_id=a1,a2&clinical-status=active&verification-status=confirmed&category=food&code=pea&_count=10&_offset=5'
    );

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/AllergyIntolerance supports unconfirmed filter', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/fhir/AllergyIntolerance?verification-status=unconfirmed');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('POST /fhir/AllergyIntolerance rejects missing patient reference', async () => {
    const res = await request(app).post('/fhir/AllergyIntolerance').send({
      resourceType: 'AllergyIntolerance',
      code: { text: 'Peanuts' },
    });

    expect(res.status).toBe(400);
  });

  it('POST /fhir/AllergyIntolerance rejects missing allergen', async () => {
    const res = await request(app).post('/fhir/AllergyIntolerance').send({
      resourceType: 'AllergyIntolerance',
      patient: { reference: 'Patient/p1' },
    });

    expect(res.status).toBe(400);
  });

  it('PUT /fhir/AllergyIntolerance updates verification status', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1' }] });

    const res = await request(app).put('/fhir/AllergyIntolerance/a1').send({
      resourceType: 'AllergyIntolerance',
      verificationStatus: { coding: [{ code: 'unconfirmed' }] },
    });

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('AllergyIntolerance');
  });

  it('GET /fhir/Patient/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Patient/p1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Patient returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Patient');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Practitioner/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Practitioner/pr1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Practitioner returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Practitioner');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Encounter/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/fhir/Encounter/e-missing');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Encounter/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Encounter/e1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Encounter returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Encounter');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Observation/:id returns 500 on error', async () => {
    fetchVitalMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Observation/v1-bp');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Observation returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Observation');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Condition/:id returns 500 on error', async () => {
    fetchDiagnosisMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Condition/c1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Condition returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Condition');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/AllergyIntolerance/:id returns 500 on error', async () => {
    fetchAllergyMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/AllergyIntolerance/a1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/AllergyIntolerance supports single _id filter', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }] });

    const res = await request(app).get('/fhir/AllergyIntolerance?_id=a1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/AllergyIntolerance returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/AllergyIntolerance');

    expect(res.status).toBe(500);
  });

  it('POST /fhir/AllergyIntolerance returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).post('/fhir/AllergyIntolerance').send({
      resourceType: 'AllergyIntolerance',
      patient: { reference: 'Patient/p1' },
      code: { text: 'Peanuts' },
    });

    expect(res.status).toBe(500);
  });

  it('PUT /fhir/AllergyIntolerance rejects invalid payload', async () => {
    const res = await request(app).put('/fhir/AllergyIntolerance/a1').send({
      resourceType: 'Patient',
    });

    expect(res.status).toBe(400);
  });

  it('PUT /fhir/AllergyIntolerance updates verified severity', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1' }] });

    const res = await request(app).put('/fhir/AllergyIntolerance/a1').send({
      resourceType: 'AllergyIntolerance',
      code: { text: 'Peanuts' },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      criticality: 'high',
    });

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('AllergyIntolerance');
  });

  it('PUT /fhir/AllergyIntolerance returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).put('/fhir/AllergyIntolerance/a-missing').send({
      resourceType: 'AllergyIntolerance',
      code: { text: 'Peanuts' },
    });

    expect(res.status).toBe(404);
  });

  it('PUT /fhir/AllergyIntolerance returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).put('/fhir/AllergyIntolerance/a1').send({
      resourceType: 'AllergyIntolerance',
      code: { text: 'Peanuts' },
    });

    expect(res.status).toBe(500);
  });

  it('DELETE /fhir/AllergyIntolerance/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).delete('/fhir/AllergyIntolerance/a-missing');

    expect(res.status).toBe(404);
  });

  it('DELETE /fhir/AllergyIntolerance/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).delete('/fhir/AllergyIntolerance/a1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Procedure/:id returns 404 when missing', async () => {
    fetchChargeMock.mockResolvedValueOnce(null);

    const res = await request(app).get('/fhir/Procedure/proc-missing');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Procedure/:id returns 500 on error', async () => {
    fetchChargeMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Procedure/proc1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Procedure supports filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'proc1' }] });

    const res = await request(app).get('/fhir/Procedure?patient=p1&date=2024-01-01&code=11100&encounter=e1');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Procedure returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Procedure');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Appointment/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/fhir/Appointment/appt-missing');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Appointment/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Appointment/appt1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Appointment supports filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'appt1' }] });

    const res = await request(app).get(
      '/fhir/Appointment?patient=p1&date=2024-01-01&status=booked&practitioner=pr1'
    );

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Appointment returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Appointment');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Organization/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/fhir/Organization/org-missing');

    expect(res.status).toBe(404);
  });

  it('GET /fhir/Organization/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Organization/org1');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Organization supports name filter', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'org1' }] });

    const res = await request(app).get('/fhir/Organization?name=Main');

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('GET /fhir/Organization returns 500 on search error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Organization');

    expect(res.status).toBe(500);
  });

  it('GET /fhir/Bundle/summary returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/fhir/Bundle/summary');

    expect(res.status).toBe(500);
  });
});
