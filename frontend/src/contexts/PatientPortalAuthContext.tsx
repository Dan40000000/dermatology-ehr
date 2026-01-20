import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  practicePhone?: string;
  practiceName?: string;
}

interface PatientPortalAuthContextType {
  patient: Patient | null;
  sessionToken: string | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tenantId: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dob: string;
}

const PatientPortalAuthContext = createContext<PatientPortalAuthContextType | null>(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function PatientPortalAuthProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('patientPortalToken');
    const storedTenantId = localStorage.getItem('patientPortalTenantId');
    const storedPatient = localStorage.getItem('patientPortalPatient');

    if (storedToken && storedTenantId && storedPatient) {
      setSessionToken(storedToken);
      setTenantId(storedTenantId);
      setPatient(JSON.parse(storedPatient));
    }

    setIsLoading(false);
  }, []);

  const login = async (tenantId: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/patient-portal/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();

      // Store in state and localStorage
      setSessionToken(data.sessionToken);
      setTenantId(tenantId);
      setPatient(data.patient);

      localStorage.setItem('patientPortalToken', data.sessionToken);
      localStorage.setItem('patientPortalTenantId', tenantId);
      localStorage.setItem('patientPortalPatient', JSON.stringify(data.patient));
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (sessionToken && tenantId) {
      try {
        await fetch(`${API_URL}/api/patient-portal/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'X-Tenant-ID': tenantId,
          },
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    // Clear state and localStorage
    setSessionToken(null);
    setTenantId(null);
    setPatient(null);

    localStorage.removeItem('patientPortalToken');
    localStorage.removeItem('patientPortalTenantId');
    localStorage.removeItem('patientPortalPatient');
  };

  const register = async (data: RegisterData) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/patient-portal/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId || 'tenant-demo', // Default for registration
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }

      return await response.json();
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PatientPortalAuthContext.Provider
      value={{
        patient,
        sessionToken,
        tenantId,
        isAuthenticated: !!sessionToken && !!patient,
        isLoading,
        login,
        logout,
        register,
      }}
    >
      {children}
    </PatientPortalAuthContext.Provider>
  );
}

export function usePatientPortalAuth() {
  const context = useContext(PatientPortalAuthContext);
  if (!context) {
    throw new Error('usePatientPortalAuth must be used within PatientPortalAuthProvider');
  }
  return context;
}

// API helper for authenticated requests
export async function patientPortalFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('patientPortalToken');
  const tenantId = localStorage.getItem('patientPortalTenantId');

  if (!token || !tenantId) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    // Session expired - clear auth and redirect to login
    localStorage.removeItem('patientPortalToken');
    localStorage.removeItem('patientPortalTenantId');
    localStorage.removeItem('patientPortalPatient');
    window.location.href = '/portal/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}
