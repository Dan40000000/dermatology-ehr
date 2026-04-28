import { API_BASE_URL } from './apiBase';

const DERM_SESSION_STORAGE_KEY = 'derm_session';
const KIOSK_CODE_STORAGE_KEY = 'kioskCode';
const TENANT_ID_STORAGE_KEY = 'tenantId';
const KIOSK_PATIENT_ID_STORAGE_KEY = 'kioskPatientId';
const KIOSK_PATIENT_NAME_STORAGE_KEY = 'kioskPatientName';
const KIOSK_APPOINTMENT_ID_STORAGE_KEY = 'kioskAppointmentId';

type StoredSession = {
  tenantId?: string;
  accessToken?: string;
};

export type KioskContext = {
  kioskCode: string;
  tenantId: string;
};

type EnsureKioskContextOptions = {
  accessToken?: string;
  locationId?: string | null;
  search?: string;
  tenantId?: string;
};

let contextPromise: Promise<KioskContext | null> | null = null;

function parseStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(DERM_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function readString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function persistIfPresent(key: string, value: string | null | undefined) {
  const normalized = readString(value);
  if (!normalized || typeof window === 'undefined') return;
  localStorage.setItem(key, normalized);
}

function buildApiUrl(path: string): string {
  if (API_BASE_URL) {
    return `${API_BASE_URL}${path}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

export function syncKioskContextFromUrl(search = '') {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(search);
  persistIfPresent(TENANT_ID_STORAGE_KEY, params.get('tenantId'));
  persistIfPresent(KIOSK_CODE_STORAGE_KEY, params.get('kioskCode'));

  const patientId = readString(params.get('patientId'));
  const patientName = readString(params.get('patientName'));
  const appointmentId = readString(params.get('appointmentId'));

  if (patientId) {
    sessionStorage.setItem(KIOSK_PATIENT_ID_STORAGE_KEY, patientId);
  }
  if (patientName) {
    sessionStorage.setItem(KIOSK_PATIENT_NAME_STORAGE_KEY, patientName);
  }
  if (appointmentId) {
    sessionStorage.setItem(KIOSK_APPOINTMENT_ID_STORAGE_KEY, appointmentId);
  }
}

function getStoredKioskContext(): KioskContext | null {
  if (typeof window === 'undefined') return null;

  const kioskCode = readString(localStorage.getItem(KIOSK_CODE_STORAGE_KEY));
  const tenantId = readString(localStorage.getItem(TENANT_ID_STORAGE_KEY));
  if (!kioskCode || !tenantId) {
    return null;
  }
  return { kioskCode, tenantId };
}

export async function ensureKioskContext(
  options: EnsureKioskContextOptions = {},
): Promise<KioskContext | null> {
  if (typeof window === 'undefined') return null;

  const search = options.search ?? window.location.search;
  syncKioskContextFromUrl(search);

  const storedSession = parseStoredSession();
  const effectiveTenantId = readString(
    options.tenantId || localStorage.getItem(TENANT_ID_STORAGE_KEY) || storedSession?.tenantId,
  );
  if (effectiveTenantId) {
    localStorage.setItem(TENANT_ID_STORAGE_KEY, effectiveTenantId);
  }

  const existingContext = getStoredKioskContext();
  if (existingContext) {
    return existingContext;
  }

  const accessToken = readString(options.accessToken || storedSession?.accessToken);
  if (!effectiveTenantId || !accessToken) {
    return getStoredKioskContext();
  }

  if (!contextPromise) {
    contextPromise = (async () => {
      const params = new URLSearchParams();
      const locationId = readString(options.locationId || new URLSearchParams(search).get('locationId'));
      if (locationId) {
        params.set('locationId', locationId);
      }

      const response = await fetch(buildApiUrl(`/api/kiosk/launch-context${params.toString() ? `?${params.toString()}` : ''}`), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Tenant-Id': effectiveTenantId,
        },
      });

      if (!response.ok) {
        throw new Error('Unable to load kiosk configuration');
      }

      const payload = await response.json() as Partial<KioskContext>;
      persistIfPresent(TENANT_ID_STORAGE_KEY, payload.tenantId || effectiveTenantId);
      persistIfPresent(KIOSK_CODE_STORAGE_KEY, payload.kioskCode);
      return getStoredKioskContext();
    })()
      .catch((error) => {
        console.error('Failed to bootstrap kiosk context', error);
        return getStoredKioskContext();
      })
      .finally(() => {
        contextPromise = null;
      });
  }

  return contextPromise;
}

export async function getKioskHeaders(
  options: EnsureKioskContextOptions = {},
): Promise<Record<string, string>> {
  const context = await ensureKioskContext(options);

  return {
    'X-Kiosk-Code': readString(context?.kioskCode || localStorage.getItem(KIOSK_CODE_STORAGE_KEY)),
    'X-Tenant-Id': readString(context?.tenantId || localStorage.getItem(TENANT_ID_STORAGE_KEY)),
  };
}
