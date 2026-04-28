import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { API_BASE_URL } from '../utils/apiBase';

// ── Local demo fallback for when the backend is unavailable ───────────────────
const DEMO_PORTAL_CREDS: Record<string, { firstName: string; lastName: string; id: string }> = {
  'patient@demo.portal': { id: 'demo-patient-1', firstName: 'Alex',   lastName: 'Johnson' },
  'jane@demo.portal':    { id: 'demo-patient-2', firstName: 'Jane',   lastName: 'Doe' },
  'marcus@demo.portal':  { id: 'demo-patient-3', firstName: 'Marcus', lastName: 'Williams' },
  'sofia@demo.portal':   { id: 'demo-patient-4', firstName: 'Sofia',  lastName: 'Chen' },
};
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PORTAL_PASSWORD = 'Portal123!';

function isLocalDemoEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true';
}

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

function getDemoPortalPatient(email: string, password: string): Patient | null {
  if (!isLocalDemoEnabled()) return null;

  const demo = DEMO_PORTAL_CREDS[email.toLowerCase()];
  if (!demo || password !== DEMO_PORTAL_PASSWORD) return null;

  return {
    id: demo.id,
    firstName: demo.firstName,
    lastName: demo.lastName,
    email,
    practiceName: 'Dermatology Demo Office',
  };
}

const PatientPortalAuthContext = createContext<PatientPortalAuthContextType | null>(null);

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
      if (storedToken === 'demo-portal-token') {
        localStorage.removeItem('patientPortalToken');
        localStorage.removeItem('patientPortalTenantId');
        localStorage.removeItem('patientPortalPatient');
        setIsLoading(false);
        return;
      }

      setSessionToken(storedToken);
      setTenantId(storedTenantId);
      setPatient(JSON.parse(storedPatient));
    }

    setIsLoading(false);
  }, []);

  const login = async (tenantId: string, email: string, password: string) => {
    setIsLoading(true);
    const demoPatient = getDemoPortalPatient(email, password);
    const startLocalDemoSession = () => {
      if (!demoPatient) return false;

      const demoToken = 'demo-portal-token';
      const demoTenant = tenantId || 'tenant-demo';
      setSessionToken(demoToken);
      setTenantId(demoTenant);
      setPatient(demoPatient);
      localStorage.setItem('patientPortalToken', demoToken);
      localStorage.setItem('patientPortalTenantId', demoTenant);
      localStorage.setItem('patientPortalPatient', JSON.stringify(demoPatient));
      return true;
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/patient-portal/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status >= 500 && startLocalDemoSession()) return;
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
      if (demoPatient && error instanceof TypeError && startLocalDemoSession()) return;
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (sessionToken && tenantId) {
      try {
        await fetch(`${API_BASE_URL}/api/patient-portal/logout`, {
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
      const response = await fetch(`${API_BASE_URL}/api/patient-portal/register`, {
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

// Demo mode — returns empty shells so portal pages render without a backend
function getDemoResponse(endpoint: string): unknown {
  if (endpoint.includes('/dashboard')) {
    return { dashboard: { upcomingAppointments: 0, nextAppointment: null, newDocuments: 0, newVisits: 0, activePrescriptions: 0 } };
  }
  if (endpoint.includes('/appointments')) return { appointments: [] };
  if (endpoint.includes('/documents')) return { documents: [] };
  if (endpoint.includes('/visits') || endpoint.includes('/visit-summaries')) return { visits: [] };
  if (endpoint.includes('/billing')) return { invoices: [], balance: 0 };
  if (endpoint.includes('/health-record')) return { healthRecord: {} };
  if (endpoint.includes('/profile')) return { profile: {} };
  if (endpoint.includes('/messages')) return { messages: [] };
  return {};
}

// API helper for authenticated requests
export async function patientPortalFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('patientPortalToken');
  const tenantId = localStorage.getItem('patientPortalTenantId');

  if (!token || !tenantId) {
    throw new Error('Not authenticated');
  }

  // Demo mode — the global fetch interceptor handles this, just let it through
  // (interceptor is installed in main.tsx and will return rich demo data)

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
