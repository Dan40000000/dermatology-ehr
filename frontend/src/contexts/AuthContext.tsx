import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Session, User } from '../types';
import { login as apiLogin, fetchMe } from '../api';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tenantId: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'derm_session';

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

  // Persist session to localStorage
  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [session]);

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
