import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EnhancedApiService,
  initializeApiService,
  getApiService,
  useApiService,
} from '../api-enhanced';
import { createApiClient, buildQueryString } from '../utils/apiClient';

vi.mock('../utils/apiClient', () => ({
  createApiClient: vi.fn(),
  buildQueryString: vi.fn(),
}));

const client = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  upload: vi.fn(),
  updateConfig: vi.fn(),
};

describe('api-enhanced', () => {
  const createApiClientMock = vi.mocked(createApiClient);
  const buildQueryStringMock = vi.mocked(buildQueryString);

  beforeEach(() => {
    vi.clearAllMocks();
    createApiClientMock.mockReturnValue(client);
    buildQueryStringMock.mockReturnValue('?search=foo');
  });

  it('throws when api service is not initialized', async () => {
    vi.resetModules();
    const module = await import('../api-enhanced');

    expect(() => module.getApiService()).toThrow('API Service not initialized');
  });

  it('initializes and returns singleton service', () => {
    const service = initializeApiService({ tenantId: 'tenant-1', accessToken: 'token-1' });

    expect(getApiService()).toBe(service);
    expect(useApiService()).toBe(service);
  });

  it('updates client configuration', () => {
    const service = new EnhancedApiService({ tenantId: 'tenant-1', accessToken: 'token-1' });

    service.updateConfig({ accessToken: 'token-2' });

    expect(client.updateConfig).toHaveBeenCalledWith({ accessToken: 'token-2' });
  });

  it('fetches patients with filters', async () => {
    const service = new EnhancedApiService({ tenantId: 'tenant-1', accessToken: 'token-1' });

    await service.getPatients({ search: 'Avery' });

    expect(buildQueryStringMock).toHaveBeenCalledWith({ search: 'Avery' });
    expect(client.get).toHaveBeenCalledWith('/api/patients?search=foo', { retry: true });
  });

  it('handles patient and appointment mutations', async () => {
    const service = new EnhancedApiService({ tenantId: 'tenant-1', accessToken: 'token-1' });

    await service.getPatient('patient-1');
    await service.createPatient({ firstName: 'A', lastName: 'B' });
    await service.updatePatient('patient-1', { email: 'test@example.com' });
    await service.deletePatient('patient-1');

    await service.getAppointments({ status: 'scheduled' });
    await service.createAppointment({ id: 'appt-1', status: 'scheduled' });
    await service.updateAppointment('appt-1', { status: 'cancelled' });
    await service.cancelAppointment('appt-1', 'reason');

    expect(client.get).toHaveBeenCalledWith('/api/patients/patient-1', { retry: true });
    expect(client.post).toHaveBeenCalledWith('/api/patients', { firstName: 'A', lastName: 'B' });
    expect(client.put).toHaveBeenCalledWith('/api/patients/patient-1', { email: 'test@example.com' });
    expect(client.delete).toHaveBeenCalledWith('/api/patients/patient-1');
    expect(client.get).toHaveBeenCalledWith('/api/appointments?search=foo', { retry: true });
    expect(client.post).toHaveBeenCalledWith('/api/appointments', { id: 'appt-1', status: 'scheduled' });
    expect(client.put).toHaveBeenCalledWith('/api/appointments/appt-1', { status: 'cancelled' });
    expect(client.post).toHaveBeenCalledWith('/api/appointments/appt-1/cancel', { reason: 'reason' });
  });

  it('uploads patient photos and documents', async () => {
    const service = new EnhancedApiService({ tenantId: 'tenant-1', accessToken: 'token-1' });
    const file = new File(['data'], 'photo.png', { type: 'image/png' });

    await service.uploadPatientPhoto('patient-1', file);
    await service.uploadDocument(file, { patientId: 'patient-1', type: 'lab' });

    const [photoEndpoint, photoFormData, photoOptions] = client.upload.mock.calls[0];
    expect(photoEndpoint).toBe('/api/patients/photos');
    expect(photoFormData.get('photo')).toBe(file);
    expect(photoFormData.get('patientId')).toBe('patient-1');
    expect(photoOptions).toEqual({ timeout: 60000 });

    const [docEndpoint, docFormData, docOptions] = client.upload.mock.calls[1];
    expect(docEndpoint).toBe('/api/documents');
    expect(docFormData.get('file')).toBe(file);
    expect(docFormData.get('metadata')).toBe(JSON.stringify({ patientId: 'patient-1', type: 'lab' }));
    expect(docOptions).toEqual({ timeout: 120000 });
  });
});
