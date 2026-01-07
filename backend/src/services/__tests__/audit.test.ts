import { auditFaxSend, auditPatientDataAccess, createAuditLog } from '../audit';
import { pool } from '../../db/pool';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

describe('audit service', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('creates audit logs with redacted metadata and request id', async () => {
    await createAuditLog({
      tenantId: 'tenant-1',
      userId: 'system',
      action: 'test_action',
      resourceType: 'resource',
      changes: { firstName: 'John' },
      metadata: { email: 'john@example.com' },
      requestId: 'req-1',
      severity: 'info',
      status: 'success',
    });

    const values = queryMock.mock.calls[0][1];
    expect(values[0]).toEqual(expect.any(String));
    expect(values[1]).toBe('tenant-1');
    expect(values[2]).toBeNull();
    expect(values[3]).toBe('test_action');
    expect(values[4]).toBe('resource');

    const changes = JSON.parse(values[8]);
    expect(changes.firstName).toBe('[REDACTED]');

    const metadata = JSON.parse(values[9]);
    expect(metadata.email).toBe('[EMAIL-REDACTED]');
    expect(metadata.requestId).toBe('req-1');
  });

  it('logs fax sends with redacted recipient metadata', async () => {
    await auditFaxSend({
      tenantId: 'tenant-1',
      userId: 'user-1',
      faxId: 'fax-1',
      recipientNumber: '5551234567',
      patientId: 'patient-1',
      ipAddress: '1.1.1.1',
    });

    const values = queryMock.mock.calls[0][1];
    const metadata = JSON.parse(values[9]);

    expect(values[3]).toBe('fax_send');
    expect(values[4]).toBe('fax');
    expect(values[10]).toBe('warning');
    expect(metadata.recipientNumber).toBe('4567');
    expect(metadata.patientId).toBe('patient-1');
  });

  it('logs patient data access with correct severity', async () => {
    await auditPatientDataAccess({
      tenantId: 'tenant-1',
      userId: 'user-1',
      patientId: 'patient-1',
      accessType: 'delete',
      ipAddress: '1.1.1.1',
      userAgent: 'agent',
    });

    const values = queryMock.mock.calls[0][1];
    const metadata = JSON.parse(values[9]);

    expect(values[3]).toBe('patient_data_delete');
    expect(values[10]).toBe('warning');
    expect(metadata.phi_access).toBe(true);
  });
});
