import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Session, User } from '../types';
import { login as apiLogin, fetchMe } from '../api';
import { API_BASE_URL } from '../utils/apiBase';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    // Try to restore session from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
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
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      setSession(detail);
      setUser(detail.user || null);
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
      const newSession: Session = {
        tenantId: resp.tenantId,
        accessToken: resp.tokens.accessToken,
        refreshToken: resp.tokens.refreshToken,
        user: {
          id: resp.user.id || '',
          email: resp.user.email,
          fullName: resp.user.fullName,
          role: resp.user.role as User['role'],
        },
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
      const data = await res.json();
      const updated: Session = {
        tenantId: data.user?.tenantId || session.tenantId,
        accessToken: data.tokens.accessToken,
        refreshToken: data.tokens.refreshToken,
        user: {
          id: data.user?.id || session.user?.id || '',
          email: data.user?.email || session.user?.email || '',
          fullName: data.user?.fullName || session.user?.fullName || '',
          role: (data.user?.role || session.user?.role || 'user') as User['role'],
        },
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
      if (data.user) {
        setUser({
          id: data.user.id || '',
          email: data.user.email,
          fullName: data.user.fullName,
          role: data.user.role as User['role'],
        });
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
