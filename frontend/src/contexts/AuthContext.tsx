import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Session, User } from '../types';
import { login as apiLogin, fetchMe } from '../api';
import { API_BASE_URL } from '../utils/apiBase';
import { buildEffectiveRoles, normalizeRoleArray } from '../utils/roles';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tenantId: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'derm_session';
const TENANT_HEADER = 'x-tenant-id';
const API_BASE = API_BASE_URL || '';

type SessionUserLike = Partial<User> & {
  secondaryRoles?: unknown;
  roles?: unknown;
};

type RefreshPayload = {
  user?: SessionUserLike & { tenantId?: string };
  tokens: { accessToken: string; refreshToken: string };
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
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    // Try to restore session from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Session;
        const user = normalizeUser(parsed.user);
        if (!user) return null;
        return { ...parsed, user };
      }
    } catch {
      // Invalid stored session
    }
    return null;
  });
  const [user, setUser] = useState<User | null>(session?.user || null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Persist session to localStorage
  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
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
      setSession(null);
      setUser(null);
    };

    window.addEventListener('derm_session_updated', handleSessionUpdated as EventListener);
    window.addEventListener('derm_session_cleared', handleSessionCleared);

    return () => {
      window.removeEventListener('derm_session_updated', handleSessionUpdated as EventListener);
      window.removeEventListener('derm_session_cleared', handleSessionCleared);
    };
  }, []);

  const login = useCallback(async (tenantId: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const resp = await apiLogin(tenantId, email, password);
      const normalizedUser = normalizeUser(resp.user);
      if (!normalizedUser) {
        throw new Error('Invalid user payload');
      }
      const newSession: Session = {
        tenantId: resp.tenantId,
        accessToken: resp.tokens.accessToken,
        refreshToken: resp.tokens.refreshToken,
        user: normalizedUser,
      };
      setSession(newSession);
      setUser(newSession.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        body: JSON.stringify({ refreshToken: session.refreshToken }),
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
        accessToken: data.tokens.accessToken,
        refreshToken: data.tokens.refreshToken,
        user: normalizedUser,
      };
      setSession(updated);
      setUser(updated.user);
    } catch {
      setSession(null);
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session?.accessToken || refreshing) return;
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
    setSession(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

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

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isAuthenticated: !!session,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
