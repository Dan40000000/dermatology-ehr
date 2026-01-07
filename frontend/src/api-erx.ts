/**
 * E-Prescribing API Functions
 * Comprehensive eRx functionality for drug search, pharmacy lookup,
 * medication history, and clinical decision support
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const TENANT_HEADER = 'X-Tenant-ID';

// ===============================================
// Drug Database Search
// ===============================================

export interface Drug {
  id: string;
  name: string;
  generic_name?: string;
  brand_name?: string;
  strength?: string;
  dosage_form?: string;
  route?: string;
  category?: string;
  is_controlled: boolean;
  dea_schedule?: string;
  typical_sig?: string;
  ndc?: string;
  manufacturer?: string;
}

export async function searchDrugs(
  tenantId: string,
  accessToken: string,
  query: string,
  category?: string,
  limit?: number
): Promise<{ drugs: Drug[]; count: number; query: string }> {
  const queryParams = new URLSearchParams({ q: query });
  if (category) queryParams.append('category', category);
  if (limit) queryParams.append('limit', limit.toString());

  const res = await fetch(`${API_BASE}/api/erx/drugs/search?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search drugs');
  }
  return res.json();
}

export async function getDrugDetails(
  tenantId: string,
  accessToken: string,
  drugId: string
): Promise<{ drug: Drug }> {
  const res = await fetch(`${API_BASE}/api/erx/drugs/${drugId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch drug details');
  }
  return res.json();
}

export async function getDrugCategories(
  tenantId: string,
  accessToken: string
): Promise<{ categories: string[] }> {
  const res = await fetch(`${API_BASE}/api/erx/drugs/list/categories`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch drug categories');
  }
  return res.json();
}

// ===============================================
// E-Prescribing / Pharmacy Network
// ===============================================

export async function searchPharmacies(
  tenantId: string,
  accessToken: string,
  params: {
    query?: string;
    city?: string;
    state?: string;
    zip?: string;
    chain?: string;
    ncpdpId?: string;
    preferred?: boolean;
  }
): Promise<{ pharmacies: any[]; total: number }> {
  const queryParams = new URLSearchParams();
  if (params.query) queryParams.append('query', params.query);
  if (params.city) queryParams.append('city', params.city);
  if (params.state) queryParams.append('state', params.state);
  if (params.zip) queryParams.append('zip', params.zip);
  if (params.chain) queryParams.append('chain', params.chain);
  if (params.ncpdpId) queryParams.append('ncpdpId', params.ncpdpId);
  if (params.preferred) queryParams.append('preferred', 'true');

  const res = await fetch(`${API_BASE}/api/pharmacies/search?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search pharmacies');
  }
  return res.json();
}

export async function getNearbyPharmacies(
  tenantId: string,
  accessToken: string,
  location: {
    latitude?: number;
    longitude?: number;
    radius?: number;
    city?: string;
    state?: string;
    zip?: string;
  }
): Promise<{ pharmacies: any[]; total: number }> {
  const queryParams = new URLSearchParams();
  if (location.latitude) queryParams.append('latitude', location.latitude.toString());
  if (location.longitude) queryParams.append('longitude', location.longitude.toString());
  if (location.radius) queryParams.append('radius', location.radius.toString());
  if (location.city) queryParams.append('city', location.city);
  if (location.state) queryParams.append('state', location.state);
  if (location.zip) queryParams.append('zip', location.zip);

  const res = await fetch(`${API_BASE}/api/pharmacies/nearby?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to find nearby pharmacies');
  }
  return res.json();
}

export async function getPharmacyByNcpdp(
  tenantId: string,
  accessToken: string,
  ncpdpId: string
): Promise<{ pharmacy: any }> {
  const res = await fetch(`${API_BASE}/api/pharmacies/ncpdp/${ncpdpId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch pharmacy');
  }
  return res.json();
}

export async function getPatientRxHistory(
  tenantId: string,
  accessToken: string,
  patientId: string,
  params?: {
    startDate?: string;
    endDate?: string;
    pharmacyId?: string;
    source?: string;
  }
): Promise<{ rxHistory: any[]; totalRecords: number; surescriptsMessageId?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);
  if (params?.pharmacyId) queryParams.append('pharmacyId', params.pharmacyId);
  if (params?.source) queryParams.append('source', params.source);

  const res = await fetch(`${API_BASE}/api/rx-history/${patientId}?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch Rx history');
  }
  return res.json();
}

export async function importSurescriptsRxHistory(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<{ success: boolean; importedCount: number; messageId: string }> {
  const res = await fetch(`${API_BASE}/api/rx-history/import-surescripts/${patientId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import Rx history');
  }
  return res.json();
}

export async function sendElectronicRx(
  tenantId: string,
  accessToken: string,
  data: {
    prescriptionId: string;
    pharmacyNcpdp: string;
  }
): Promise<{ success: boolean; messageId: string; pharmacyName: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/prescriptions/send-erx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send electronic prescription');
  }
  return res.json();
}

export async function checkFormulary(
  tenantId: string,
  accessToken: string,
  data: {
    medicationName: string;
    ndc?: string;
    payerId?: string;
  }
): Promise<{
  messageId: string;
  medicationName: string;
  formularyStatus: string;
  tier: number;
  copayAmount?: number;
  requiresPriorAuth: boolean;
  requiresStepTherapy: boolean;
  quantityLimit?: number;
  alternatives: any[];
}> {
  const res = await fetch(`${API_BASE}/api/prescriptions/check-formulary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to check formulary');
  }
  return res.json();
}

export async function getPatientBenefits(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<{
  messageId: string;
  patientId: string;
  coverage: any;
  benefits: any;
} | null> {
  const res = await fetch(`${API_BASE}/api/prescriptions/patient-benefits/${patientId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch patient benefits');
  }
  return res.json();
}

// ===============================================
// Drug Safety Checks
// ===============================================

export interface DrugInteraction {
  severity: 'severe' | 'moderate' | 'mild';
  description: string;
  medication1: string;
  medication2: string;
  clinicalEffects?: string;
  management?: string;
}

export interface AllergyWarning {
  allergen: string;
  severity: string;
  reaction: string;
}

export async function checkDrugInteractions(
  tenantId: string,
  accessToken: string,
  medicationName: string,
  patientId: string
): Promise<{
  interactions: DrugInteraction[];
  count: number;
  hasSevere: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/erx/check-interactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ medicationName, patientId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to check interactions');
  }
  return res.json();
}

export async function checkDrugAllergies(
  tenantId: string,
  accessToken: string,
  medicationName: string,
  patientId: string
): Promise<{
  allergies: AllergyWarning[];
  count: number;
  hasAllergy: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/erx/check-allergies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ medicationName, patientId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to check allergies');
  }
  return res.json();
}

export async function performSafetyCheck(
  tenantId: string,
  accessToken: string,
  medicationName: string,
  patientId: string
): Promise<{
  drugInteractions: DrugInteraction[];
  allergyWarnings: AllergyWarning[];
  warnings: string[];
}> {
  const res = await fetch(`${API_BASE}/api/erx/safety-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ medicationName, patientId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to perform safety check');
  }
  return res.json();
}

// ===============================================
// Patient Medication History
// ===============================================

export async function getPatientMedicationHistory(
  tenantId: string,
  accessToken: string,
  patientId: string,
  source?: 'all' | 'internal' | 'external'
): Promise<{
  prescriptions: any[];
  externalHistory: any[];
  combinedCount: number;
}> {
  const queryParams = new URLSearchParams();
  if (source) queryParams.append('source', source);

  const res = await fetch(
    `${API_BASE}/api/erx/patients/${patientId}/medication-history?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        [TENANT_HEADER]: tenantId,
      },
      credentials: 'include',
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch medication history');
  }
  return res.json();
}

export async function getCurrentMedications(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<{ medications: any[]; count: number }> {
  const res = await fetch(`${API_BASE}/api/erx/patients/${patientId}/current-medications`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch current medications');
  }
  return res.json();
}

export async function getPatientAllergies(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<{ allergies: any[]; count: number }> {
  const res = await fetch(`${API_BASE}/api/erx/patients/${patientId}/allergies`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch patient allergies');
  }
  return res.json();
}
