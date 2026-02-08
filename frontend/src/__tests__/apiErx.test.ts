import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchDrugs,
  getDrugDetails,
  getDrugCategories,
  searchPharmacies,
  getNearbyPharmacies,
  getPharmacyByNcpdp,
  getPatientRxHistory,
  importSurescriptsRxHistory,
  sendElectronicRx,
  checkFormulary,
  getPatientBenefits,
  checkDrugInteractions,
  checkDrugAllergies,
  performSafetyCheck,
  getPatientMedicationHistory,
  getCurrentMedications,
  getPatientAllergies,
} from '../api-erx';
import { API_BASE_URL } from '../utils/apiBase';

const tenantId = 'tenant-1';
const token = 'token-1';

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

const okResponse = (data: unknown = {}) =>
  ({ ok: true, json: vi.fn().mockResolvedValue(data) }) as Response;

describe('api-erx', () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    {
      name: 'searchDrugs',
      call: () => searchDrugs(tenantId, token, 'cream', 'topical', 5),
      url: `${API_BASE_URL}/api/erx/drugs/search?q=cream&category=topical&limit=5`,
    },
    {
      name: 'getDrugDetails',
      call: () => getDrugDetails(tenantId, token, 'drug-1'),
      url: `${API_BASE_URL}/api/erx/drugs/drug-1`,
    },
    {
      name: 'getDrugCategories',
      call: () => getDrugCategories(tenantId, token),
      url: `${API_BASE_URL}/api/erx/drugs/list/categories`,
    },
    {
      name: 'searchPharmacies',
      call: () =>
        searchPharmacies(tenantId, token, {
          query: 'Main',
          city: 'City',
          state: 'CA',
          preferred: true,
        }),
      url: `${API_BASE_URL}/api/pharmacies/search?query=Main&city=City&state=CA&preferred=true`,
    },
    {
      name: 'getNearbyPharmacies',
      call: () =>
        getNearbyPharmacies(tenantId, token, {
          latitude: 1,
          longitude: 2,
          radius: 3,
        }),
      url: `${API_BASE_URL}/api/pharmacies/nearby?latitude=1&longitude=2&radius=3`,
    },
    {
      name: 'getPharmacyByNcpdp',
      call: () => getPharmacyByNcpdp(tenantId, token, 'ncpdp-1'),
      url: `${API_BASE_URL}/api/pharmacies/ncpdp/ncpdp-1`,
    },
    {
      name: 'getPatientRxHistory',
      call: () =>
        getPatientRxHistory(tenantId, token, 'patient-1', {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        }),
      url: `${API_BASE_URL}/api/rx-history/patient-1?startDate=2024-01-01&endDate=2024-01-31`,
    },
    {
      name: 'importSurescriptsRxHistory',
      call: () => importSurescriptsRxHistory(tenantId, token, 'patient-1'),
      url: `${API_BASE_URL}/api/rx-history/import-surescripts/patient-1`,
      method: 'POST',
    },
    {
      name: 'sendElectronicRx',
      call: () =>
        sendElectronicRx(tenantId, token, {
          prescriptionId: 'rx-1',
          pharmacyNcpdp: 'ncpdp-1',
        }),
      url: `${API_BASE_URL}/api/prescriptions/send-erx`,
      method: 'POST',
      body: JSON.stringify({ prescriptionId: 'rx-1', pharmacyNcpdp: 'ncpdp-1' }),
      contentType: true,
    },
    {
      name: 'checkFormulary',
      call: () =>
        checkFormulary(tenantId, token, {
          medicationName: 'med',
        }),
      url: `${API_BASE_URL}/api/prescriptions/check-formulary`,
      method: 'POST',
      body: JSON.stringify({ medicationName: 'med' }),
      contentType: true,
    },
    {
      name: 'getPatientBenefits',
      call: () => getPatientBenefits(tenantId, token, 'patient-1'),
      url: `${API_BASE_URL}/api/prescriptions/patient-benefits/patient-1`,
    },
    {
      name: 'checkDrugInteractions',
      call: () => checkDrugInteractions(tenantId, token, 'med', 'patient-1'),
      url: `${API_BASE_URL}/api/erx/check-interactions`,
      method: 'POST',
      body: JSON.stringify({ medicationName: 'med', patientId: 'patient-1' }),
      contentType: true,
    },
    {
      name: 'checkDrugAllergies',
      call: () => checkDrugAllergies(tenantId, token, 'med', 'patient-1'),
      url: `${API_BASE_URL}/api/erx/check-allergies`,
      method: 'POST',
      body: JSON.stringify({ medicationName: 'med', patientId: 'patient-1' }),
      contentType: true,
    },
    {
      name: 'performSafetyCheck',
      call: () => performSafetyCheck(tenantId, token, 'med', 'patient-1'),
      url: `${API_BASE_URL}/api/erx/safety-check`,
      method: 'POST',
      body: JSON.stringify({ medicationName: 'med', patientId: 'patient-1' }),
      contentType: true,
    },
    {
      name: 'getPatientMedicationHistory',
      call: () => getPatientMedicationHistory(tenantId, token, 'patient-1', 'external'),
      url: `${API_BASE_URL}/api/erx/patients/patient-1/medication-history?source=external`,
    },
    {
      name: 'getCurrentMedications',
      call: () => getCurrentMedications(tenantId, token, 'patient-1'),
      url: `${API_BASE_URL}/api/erx/patients/patient-1/current-medications`,
    },
    {
      name: 'getPatientAllergies',
      call: () => getPatientAllergies(tenantId, token, 'patient-1'),
      url: `${API_BASE_URL}/api/erx/patients/patient-1/allergies`,
    },
  ])('calls $name with expected request details', async ({ call, url, method, body, contentType }) => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(options?.credentials).toBe('include');

    if (method) {
      expect(options?.method).toBe(method);
    } else {
      expect(options?.method).toBeUndefined();
    }

    if (body) {
      expect(options?.body).toBe(body);
    }

    const headers = options?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(headers['X-Tenant-ID']).toBe(tenantId);
    if (contentType) {
      expect(headers['Content-Type']).toBe('application/json');
    }
  });

  it('surfaces errors from drug search', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'bad' }),
    } as Response);

    await expect(searchDrugs(tenantId, token, 'cream')).rejects.toThrow('bad');
  });
});
