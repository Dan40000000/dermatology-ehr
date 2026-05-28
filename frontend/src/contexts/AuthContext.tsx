import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Session, User } from '../types';
import { COOKIE_AUTH_TOKEN_PLACEHOLDER, changeStaffPassword, login as apiLogin, fetchMe } from '../api';
import { API_BASE_URL } from '../utils/apiBase';
import { buildEffectiveRoles, normalizeRoleArray } from '../utils/roles';

// ── Demo credential bypass (no backend needed) ───────────────────────────────
const DEMO_OFFICE_CREDS: Record<string, { role: string; fullName: string }> = {
  'admin@demo.practice':    { role: 'admin',             fullName: 'Dr. Rachel Kim, Owner' },
  'provider@demo.practice': { role: 'provider',          fullName: 'Dr. James Whitfield, MD' },
  'nurse@demo.practice':    { role: 'nurse',             fullName: 'Nurse Sarah Okafor, RN' },
  'manager@demo.practice':  { role: 'manager',           fullName: 'Lisa Nguyen, Office Manager' },
  'frontdesk@demo.practice':{ role: 'front_desk',        fullName: 'Tyler Brooks, Front Desk' },
  'ma@demo.practice':       { role: 'medical_assistant', fullName: 'Maria Santos, Medical Assistant' },
  'billing@demo.practice':  { role: 'billing',           fullName: 'David Chen, Billing Specialist' },
};
const DEMO_OFFLINE_PASSWORD = 'Password123!';

function isLocalDemoEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true';
}

function makeDemoToken(payload: object): string {
  const b64u = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${b64u({ alg: 'none' })}.${b64u({ ...payload, exp: 9_999_999_999, iat: Math.floor(Date.now() / 1000) })}.demo`;
}

function shouldUseLocalDemoFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('login failed')
  );
}

function buildLocalDemoSession(tenantId: string, email: string, demo: { role: string; fullName: string }): Session {
  const token = makeDemoToken({ sub: email, role: demo.role });
  const roles = buildEffectiveRoles(demo.role as User['role'], [demo.role]);
  return {
    tenantId: tenantId || 'tenant-demo',
    accessToken: token,
    refreshToken: 'demo-refresh',
    user: {
      id: `demo-${email}`,
      email,
      fullName: demo.fullName,
      role: demo.role as User['role'],
      secondaryRoles: [],
      roles,
    },
  };
}

function isLocalDemoTokenShape(token: string | undefined | null): boolean {
  return typeof token === 'string' && token.endsWith('.demo');
}

function isLocalDemoAccessToken(token: string | undefined | null): boolean {
  return isLocalDemoEnabled() && isLocalDemoTokenShape(token);
}
// ─────────────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  headers: Record<string, string>;
  isAuthenticated: boolean;
  isLoading: boolean;
  passwordResetRequired: boolean;
  login: (tenantId: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

// This context intentionally lives with the provider so tests can mount it directly.
// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'derm_session';
const TENANT_HEADER = 'x-tenant-id';
const API_BASE = API_BASE_URL || '';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 5;
const idleTimeoutMinutes = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MINUTES);
const SESSION_IDLE_TIMEOUT_MS =
  (Number.isFinite(idleTimeoutMinutes) && idleTimeoutMinutes > 0
    ? idleTimeoutMinutes
    : DEFAULT_IDLE_TIMEOUT_MINUTES) * 60 * 1000;
const SESSION_IDLE_CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_WRITE_THROTTLE_MS = 30_000;
const SESSION_TIMEOUT_REASON_KEY = 'derm_session_timeout_reason';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

function isCookieAuthPlaceholder(value: unknown): boolean {
  return value === COOKIE_AUTH_TOKEN_PLACEHOLDER || value === '__cookie__' || value === 'cookie';
}

type SessionUserLike = Partial<User> & {
  secondaryRoles?: unknown;
  roles?: unknown;
};

type RefreshPayload = {
  user?: SessionUserLike & { tenantId?: string };
  tokens: { accessToken: string; refreshToken: string };
};

type PersistedSession = Session & {
  lastActivityAt?: number;
  sessionStartedAt?: number;
};

type RestoredSession = {
  session: Session;
  lastActivityAt: number;
  sessionStartedAt: number;
};

function normalizeUser(userData: SessionUserLike | null | undefined, fallback?: User | null): User | null {
  if (!userData && !fallback) return null;
  const role = (userData?.role || fallback?.role || 'user') as User['role'];
  const secondaryRoles = normalizeRoleArray(userData?.secondaryRoles ?? fallback?.secondaryRoles);
  const roles = buildEffectiveRoles(role, userData?.roles || secondaryRoles);

  return {
    id: userData?.id || fallback?.id || '',
    email: userData?.email || fallback?.email || '',
    fullName: userData?.fullName || fallback?.fullName || '',
    role,
    secondaryRoles,
    roles,
    passwordResetRequired: Boolean(userData?.passwordResetRequired ?? fallback?.passwordResetRequired),
  };
}

function readPersistedSession(): RestoredSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as PersistedSession;
    if (isLocalDemoTokenShape(parsed.accessToken) && !isLocalDemoEnabled()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (!isCookieAuthPlaceholder(parsed.accessToken) && !isLocalDemoAccessToken(parsed.accessToken)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const user = normalizeUser(parsed.user);
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const now = Date.now();
    const lastActivityAt = typeof parsed.lastActivityAt === 'number' ? parsed.lastActivityAt : now;
    if (now - lastActivityAt >= SESSION_IDLE_TIMEOUT_MS) {
      localStorage.removeItem(STORAGE_KEY);
      try {
        sessionStorage.setItem(SESSION_TIMEOUT_REASON_KEY, 'idle_timeout');
      } catch {
        // Ignore browsers that block sessionStorage.
      }
      return null;
    }

    const sessionStartedAt = typeof parsed.sessionStartedAt === 'number' ? parsed.sessionStartedAt : now;
    const session: Session = {
      tenantId: parsed.tenantId,
      accessToken: isLocalDemoAccessToken(parsed.accessToken) ? parsed.accessToken : COOKIE_AUTH_TOKEN_PLACEHOLDER,
      refreshToken: parsed.refreshToken === 'demo-refresh' ? parsed.refreshToken : COOKIE_AUTH_TOKEN_PLACEHOLDER,
      user,
    };

    return {
      session,
      lastActivityAt,
      sessionStartedAt,
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function readPersistedLastActivityAt(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PersistedSession;
    return typeof parsed.lastActivityAt === 'number' ? parsed.lastActivityAt : null;
  } catch {
    return null;
  }
}

function persistSession(session: Session, lastActivityAt: number, sessionStartedAt: number) {
  const persistedSession: PersistedSession = {
    ...session,
    lastActivityAt,
    sessionStartedAt,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedSession));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const restoredSessionRef = useRef<RestoredSession | null | undefined>(undefined);
  if (restoredSessionRef.current === undefined) {
    restoredSessionRef.current = readPersistedSession();
  }

  const [session, setSession] = useState<Session | null>(() => restoredSessionRef.current?.session || null);
  const [user, setUser] = useState<User | null>(() => restoredSessionRef.current?.session.user || null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastActivityAtRef = useRef(restoredSessionRef.current?.lastActivityAt || Date.now());
  const sessionStartedAtRef = useRef(restoredSessionRef.current?.sessionStartedAt || Date.now());
  const lastActivityWriteAtRef = useRef(lastActivityAtRef.current);

  const clearSession = useCallback((reason?: 'idle_timeout') => {
    setSession(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    if (reason === 'idle_timeout') {
      try {
        sessionStorage.setItem(SESSION_TIMEOUT_REASON_KEY, 'idle_timeout');
      } catch {
        // Ignore browsers that block sessionStorage.
      }
    }
  }, []);

  const startSession = useCallback((nextSession: Session) => {
    const now = Date.now();
    lastActivityAtRef.current = now;
    sessionStartedAtRef.current = now;
    lastActivityWriteAtRef.current = 0;
    setSession(nextSession);
    setUser(nextSession.user);
    try {
      sessionStorage.removeItem(SESSION_TIMEOUT_REASON_KEY);
    } catch {
      // Ignore browsers that block sessionStorage.
    }
  }, []);

  // Persist session to localStorage
  useEffect(() => {
    if (session) {
      persistSession(session, lastActivityAtRef.current, sessionStartedAtRef.current);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [session]);

  useEffect(() => {
    const handleSessionUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Session>).detail;
      if (!detail) return;
      const normalizedUser = normalizeUser(detail.user);
      if (!normalizedUser) return;
      const normalizedSession: Session = { ...detail, user: normalizedUser };
      setSession(normalizedSession);
      setUser(normalizedSession.user);
    };

    const handleSessionCleared = () => {
      clearSession();
    };

    window.addEventListener('derm_session_updated', handleSessionUpdated as EventListener);
    window.addEventListener('derm_session_cleared', handleSessionCleared);

    return () => {
      window.removeEventListener('derm_session_updated', handleSessionUpdated as EventListener);
      window.removeEventListener('derm_session_cleared', handleSessionCleared);
    };
  }, [clearSession]);

  useEffect(() => {
    if (!session) return;

    const markActivity = (forceWrite = false) => {
      const now = Date.now();
      lastActivityAtRef.current = now;

      if (forceWrite || now - lastActivityWriteAtRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
        persistSession(session, now, sessionStartedAtRef.current);
        lastActivityWriteAtRef.current = now;
      }
    };

    const handleActivity = () => markActivity(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markActivity(false);
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener('focus', handleActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const idleCheck = window.setInterval(() => {
      const persistedLastActivityAt = readPersistedLastActivityAt();
      if (persistedLastActivityAt && persistedLastActivityAt > lastActivityAtRef.current) {
        lastActivityAtRef.current = persistedLastActivityAt;
      }

      if (Date.now() - lastActivityAtRef.current >= SESSION_IDLE_TIMEOUT_MS) {
        clearSession('idle_timeout');
      }
    }, SESSION_IDLE_CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener('focus', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(idleCheck);
    };
  }, [clearSession, session]);

  useEffect(() => {
    if (!session || !isLocalDemoAccessToken(session.accessToken)) return;

    const normalizedEmail = session.user.email.trim().toLowerCase();
    if (!DEMO_OFFICE_CREDS[normalizedEmail]) return;

    let cancelled = false;

    (async () => {
      try {
        const resp = await apiLogin(session.tenantId, normalizedEmail, DEMO_OFFLINE_PASSWORD);
        const normalizedUser = normalizeUser(resp.user);
        if (!normalizedUser || cancelled) return;

        const upgradedSession: Session = {
          tenantId: resp.tenantId,
          accessToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
          refreshToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
          user: normalizedUser,
        };

        setSession(upgradedSession);
        setUser(upgradedSession.user);
      } catch {
        // Keep the offline demo session when the API is still unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const login = useCallback(async (tenantId: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      let resp: Awaited<ReturnType<typeof apiLogin>>;
      try {
        resp = await apiLogin(tenantId, normalizedEmail, password);
      } catch (error) {
        // Demo users should use real backend tokens when available. The local token
        // is only for static/offline demos where no API can issue a valid JWT.
        const demo = DEMO_OFFICE_CREDS[normalizedEmail];
        if (!isLocalDemoEnabled() || !demo || password !== DEMO_OFFLINE_PASSWORD || !shouldUseLocalDemoFallback(error)) {
          throw error;
        }

        const demoSession = buildLocalDemoSession(tenantId, normalizedEmail, demo);
        startSession(demoSession);
        return;
      }

      const normalizedUser = normalizeUser(resp.user);
      if (!normalizedUser) {
        throw new Error('Invalid user payload');
      }
      const newSession: Session = {
        tenantId: resp.tenantId,
        accessToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
        refreshToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
        user: normalizedUser,
      };
      startSession(newSession);
    } finally {
      setIsLoading(false);
    }
  }, [startSession]);

  const refreshSession = useCallback(async () => {
    if (!session?.refreshToken || !session?.tenantId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [TENANT_HEADER]: session.tenantId,
        },
        credentials: 'include',
        body: JSON.stringify({
          refreshToken: isCookieAuthPlaceholder(session.refreshToken) ? COOKIE_AUTH_TOKEN_PLACEHOLDER : session.refreshToken,
        }),
      });
      if (!res.ok) {
        throw new Error('Refresh failed');
      }
      const data = await res.json() as RefreshPayload;
      const normalizedUser = normalizeUser(data.user, session.user);
      if (!normalizedUser) {
        throw new Error('Invalid refresh payload');
      }
      const updated: Session = {
        tenantId: data.user?.tenantId || session.tenantId,
        accessToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
        refreshToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
        user: normalizedUser,
      };
      setSession(updated);
      setUser(updated.user);
    } catch {
      clearSession();
    } finally {
      setRefreshing(false);
    }
  }, [clearSession, session]);

  useEffect(() => {
    if (!session?.accessToken || isCookieAuthPlaceholder(session.accessToken) || refreshing) return;
    const parts = session.accessToken.split('.');
    if (parts.length !== 3) return;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload?.exp) return;
      const expiresAt = payload.exp * 1000;
      if (Date.now() > expiresAt - 60_000) {
        refreshSession();
      }
    } catch {
      // ignore token decode issues
    }
  }, [session?.accessToken, refreshSession, refreshing]);

  const logout = useCallback(() => {
    if (session?.tenantId) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: {
          [TENANT_HEADER]: session.tenantId,
        },
        credentials: 'include',
      }).catch(() => {
        // Local session cleanup should not depend on the network.
      });
    }
    clearSession();
  }, [clearSession, session]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!session) return;
    const resp = await changeStaffPassword(session.tenantId, session.accessToken, {
      currentPassword,
      newPassword,
    });
    const normalizedUser = normalizeUser(resp.user, session.user);
    if (!normalizedUser) {
      throw new Error('Invalid user payload');
    }
    const updated: Session = {
      tenantId: resp.tenantId,
      accessToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
      refreshToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
      user: normalizedUser,
    };
    setSession(updated);
    setUser(updated.user);
  }, [session]);

  const refreshUser = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const data = await fetchMe(session.tenantId, session.accessToken);
      const refreshedUser = normalizeUser(data.user, session.user);
      if (refreshedUser) {
        setUser(refreshedUser);
        setSession((prev) => (prev ? { ...prev, user: refreshedUser } : prev));
      }
    } catch (error) {
      console.error('Failed to refresh user', error);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const headers = session
    ? {
        [TENANT_HEADER]: session.tenantId,
        ...(isCookieAuthPlaceholder(session.accessToken) ? {} : { Authorization: `Bearer ${session.accessToken}` }),
      }
    : {};

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        headers,
        isAuthenticated: !!session,
        isLoading,
        passwordResetRequired: Boolean(user?.passwordResetRequired || session?.user.passwordResetRequired),
        login,
        logout,
        changePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
