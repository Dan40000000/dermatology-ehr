import { API_BASE_URL } from './apiBase';
import { buildEffectiveRoles, normalizeRoleArray } from './roles';

type StoredSession = {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    secondaryRoles?: string[];
    roles?: string[];
  };
};

type RefreshResponse = {
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  user?: {
    id?: string;
    email?: string;
    fullName?: string;
    role?: string;
    secondaryRoles?: string[];
    roles?: string[];
    tenantId?: string;
  };
};

const STORAGE_KEY = 'derm_session';
const TENANT_HEADER = 'x-tenant-id';
const API_BASE = API_BASE_URL || '';
let originalFetchRef: typeof window.fetch | null = null;

let refreshPromise: Promise<StoredSession | null> | null = null;

function isApiRequest(url: string) {
  if (API_BASE && url.startsWith(API_BASE)) return true;
  return url.includes('/api/');
}

function isAuthEndpoint(url: string) {
  return url.includes('/api/auth/login') || url.includes('/api/auth/refresh');
}

function readSession(): StoredSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('derm_session_updated', { detail: session }));
  } else {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('derm_session_cleared'));
  }
}

async function refreshSession(originalFetch: typeof window.fetch): Promise<StoredSession | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const current = readSession();
    if (!current?.refreshToken || !current?.tenantId) return null;

    const refreshUrl = `${API_BASE}/api/auth/refresh`;
    const res = await originalFetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [TENANT_HEADER]: current.tenantId,
      },
      credentials: 'include',
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });

    if (!res.ok) {
      writeSession(null);
      return null;
    }

    const data = (await res.json()) as RefreshResponse;
    const role = data.user?.role || current.user?.role || 'user';
    const secondaryRoles = normalizeRoleArray(data.user?.secondaryRoles ?? current.user?.secondaryRoles);
    const roles = buildEffectiveRoles(role, data.user?.roles || secondaryRoles);

    const nextSession: StoredSession = {
      tenantId: data.user?.tenantId || current.tenantId,
      accessToken: data.tokens.accessToken,
      refreshToken: data.tokens.refreshToken,
      user: {
        id: data.user?.id || current.user?.id || '',
        email: data.user?.email || current.user?.email || '',
        fullName: data.user?.fullName || current.user?.fullName || '',
        role,
        secondaryRoles,
        roles,
      },
    };

    writeSession(nextSession);
    return nextSession;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function refreshSessionNow() {
  const baseFetch = originalFetchRef || window.fetch.bind(window);
  return refreshSession(baseFetch);
}

export function installAuthFetch() {
  if (typeof window === 'undefined') return;
  if ((window as any).__authFetchInstalled) return;
  (window as any).__authFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);
  originalFetchRef = originalFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let request = new Request(input, init);
    let retryRequest: Request | null = null;

    if (isApiRequest(request.url) && !isAuthEndpoint(request.url)) {
      try {
        retryRequest = request.clone();
      } catch {
        retryRequest = null;
      }
    }

    const response = await originalFetch(request);
    if (!isApiRequest(request.url) || isAuthEndpoint(request.url)) {
      return response;
    }

    if (response.status !== 401) {
      return response;
    }

    const refreshed = await refreshSession(originalFetch);
    if (!refreshed || !retryRequest) {
      return response;
    }

    const headers = new Headers(retryRequest.headers);
    headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
    headers.set(TENANT_HEADER, refreshed.tenantId);

    const finalRequest = new Request(retryRequest, { headers });
    return originalFetch(finalRequest);
  };
}

installAuthFetch();
