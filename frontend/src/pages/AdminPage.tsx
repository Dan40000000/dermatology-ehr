import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Navigate, Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../utils/apiBase';
import { updateAccessSettings } from '../api';
import { buildEffectiveRoles, hasRole, normalizeRoleArray } from '../utils/roles';
import { canViewProfessionalFeedback } from '../utils/feedbackAccess';
import {
  COMMAND_CENTER_LABELS,
  COMMAND_CENTER_SECTION_KEYS,
  MANAGEABLE_ACCESS_ROLES,
  MODULE_KEYS,
  MODULE_LABELS,
  ROLE_LABELS,
  resolveCommandCenterAccess,
  resolveModuleAccess,
  type AccessSettingsPayload,
  type CommandCenterSectionKey,
  type ModuleKey,
  type Role,
} from '../config/moduleAccess';
import {
  formatDowntimeDeviceShortId,
  getOrCreateDowntimeBrowserDevice,
  type DowntimeBrowserDevice,
} from '../utils/downtimeDevice';

interface Facility {
  id: string;
  name: string;
  address: string;
  phone?: string;
  isActive: boolean;
  downtimeSettings: {
    enabled: boolean;
    packetTime: string;
    deviceProfile: 'auto' | 'ipad' | 'desktop';
    includeDob: boolean;
    includePhone: boolean;
    includeInsurance: boolean;
  };
  downtimePrimaryDevice?: {
    deviceId: string;
    label?: string | null;
    registeredAt?: string | null;
    registeredBy?: string | null;
    lastSeenAt?: string | null;
    lastPacketSavedAt?: string | null;
    lastPacketDate?: string | null;
  } | null;
}

interface Room {
  id: string;
  facilityId: string;
  facilityName?: string;
  name: string;
  roomType: string;
  isActive: boolean;
}

interface Provider {
  id: string;
  fullName: string;
  specialty?: string;
  npi?: string;
  email?: string;
  isActive: boolean;
}

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  secondaryRoles?: string[];
  roles?: string[];
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
  padding: '2rem',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '1400px',
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  marginBottom: '2rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2.5rem',
  fontWeight: 800,
  color: 'white',
  marginBottom: '0.5rem',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '1.125rem',
  color: 'rgba(255, 255, 255, 0.7)',
};

const tabsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginBottom: '2rem',
  background: 'rgba(255, 255, 255, 0.1)',
  padding: '0.5rem',
  borderRadius: '1rem',
  backdropFilter: 'blur(10px)',
};

const tabStyle: React.CSSProperties = {
  padding: '0.875rem 1.5rem',
  borderRadius: '0.75rem',
  border: 'none',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'white',
  color: '#4c1d95',
};

const inactiveTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'transparent',
  color: 'white',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.95)',
  borderRadius: '1.5rem',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
  padding: '2rem',
  backdropFilter: 'blur(20px)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '1rem',
  borderBottom: '2px solid #e5e7eb',
  fontWeight: 600,
  color: '#374151',
  fontSize: '0.875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '1rem',
  borderBottom: '1px solid #f3f4f6',
  color: '#111827',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  borderRadius: '0.75rem',
  border: 'none',
  background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
  color: 'white',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: '1px solid #d1d5db',
  background: 'white',
  color: '#374151',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
};

const btnDangerStyle: React.CSSProperties = {
  ...btnSecondaryStyle,
  borderColor: '#fca5a5',
  color: '#dc2626',
};

const singularLabels: Record<string, string> = {
  facilities: 'facility',
  rooms: 'room',
  providers: 'provider',
  users: 'user',
};

const roomTypeLabels: Record<string, string> = {
  exam: 'Exam Room',
  procedure: 'Procedure Room',
  consult: 'Consultation Room',
  photo: 'Photo Room',
  lab: 'Lab Room',
};

const defaultDowntimeSettings = {
  enabled: false,
  packetTime: '12:00',
  deviceProfile: 'auto' as const,
  includeDob: true,
  includePhone: true,
  includeInsurance: true,
};

function createFacilityDraft(item?: Partial<Facility> | null): Facility {
  return {
    id: item?.id || '',
    name: item?.name || '',
    address: item?.address || '',
    phone: item?.phone || '',
    isActive: item?.isActive ?? true,
    downtimeSettings: {
      ...defaultDowntimeSettings,
      ...(item?.downtimeSettings || {}),
    },
    downtimePrimaryDevice: item?.downtimePrimaryDevice || null,
  };
}

function describeDowntimeSettings(facility: Facility): string {
  if (!facility.downtimeSettings?.enabled) {
    return 'Auto download off';
  }
  const deviceLabel =
    facility.downtimeSettings.deviceProfile === 'auto'
      ? 'Auto detect'
      : facility.downtimeSettings.deviceProfile === 'ipad'
        ? 'iPad'
        : 'Desktop';
  return `Auto download on • ${deviceLabel} • ${facility.downtimeSettings.packetTime}`;
}

function formatAdminTimestamp(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function describePrimaryStation(facility: Facility): string {
  const station = facility.downtimePrimaryDevice;
  if (!station?.deviceId) {
    return 'Primary station not assigned';
  }
  const label = station.label?.trim() || `Device ${formatDowntimeDeviceShortId(station.deviceId)}`;
  const lastSaved = station.lastPacketDate ? `Last packet ${station.lastPacketDate}` : 'No packet saved yet';
  return `${label} • ${lastSaved}`;
}

const MANAGEABLE_USER_ROLES = [
  'admin',
  'provider',
  'billing',
  'front_desk',
  'ma',
  'nurse',
  'scheduler',
  'staff',
  'hr',
  'manager',
  'compliance_officer',
] as const;

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  provider: 'Provider',
  billing: 'Billing',
  front_desk: 'Front Desk',
  ma: 'Medical Assistant',
  nurse: 'Nurse',
  scheduler: 'Scheduler',
  staff: 'Staff',
  hr: 'HR',
  manager: 'Manager',
  compliance_officer: 'Compliance Officer',
};

type AdminTab = 'facilities' | 'rooms' | 'providers' | 'users' | 'permissions' | 'settings';

const DEFAULT_ADMIN_TAB: AdminTab = 'facilities';

function resolveAdminTab(rawValue: string | null): AdminTab {
  switch (rawValue) {
    case 'facilities':
    case 'rooms':
    case 'providers':
    case 'users':
    case 'permissions':
    case 'settings':
      return rawValue;
    default:
      return DEFAULT_ADMIN_TAB;
  }
}

const adminTabLabels: Record<AdminTab, string> = {
  facilities: 'Facilities',
  rooms: 'Rooms',
  providers: 'Providers',
  users: 'Users',
  permissions: 'Access Control',
  settings: 'Settings',
};

const formatRoomType = (roomType?: string) => {
  if (!roomType) return 'Exam Room';
  return roomTypeLabels[roomType] || roomType;
};

const formGroupStyle: React.CSSProperties = {
  marginBottom: '1.5rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  fontWeight: 600,
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: '0.5rem',
  border: '2px solid #e5e7eb',
  fontSize: '1rem',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '1.5rem',
  padding: '2rem',
  width: '100%',
  maxWidth: '640px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#111827',
  marginBottom: '1.5rem',
};

const badgeActiveStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.25rem 0.75rem',
  borderRadius: '9999px',
  fontSize: '0.75rem',
  fontWeight: 600,
  background: '#dcfce7',
  color: '#166534',
};

const badgeInactiveStyle: React.CSSProperties = {
  ...badgeActiveStyle,
  background: '#fee2e2',
  color: '#991b1b',
};

const segmentedGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

function segmentedButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.625rem 0.95rem',
    borderRadius: '9999px',
    border: active ? '1px solid #0891b2' : '1px solid #d1d5db',
    background: active ? '#ecfeff' : '#ffffff',
    color: active ? '#0f766e' : '#374151',
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: active ? '0 0 0 2px rgba(6, 182, 212, 0.12)' : 'none',
  };
}

export function AdminPage() {
  const { session, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => resolveAdminTab(searchParams.get('tab')));
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const isMountedRef = useRef(true);
  const [downtimeDevice] = useState<DowntimeBrowserDevice>(() => getOrCreateDowntimeBrowserDevice());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const tabFromUrl = resolveAdminTab(searchParams.get('tab'));
    setActiveTab((prev) => (prev === tabFromUrl ? prev : tabFromUrl));
  }, [searchParams]);

  // Redirect non-admin users
  if (!hasRole(user, 'admin')) {
    return <Navigate to="/home" replace />;
  }

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!session) return;
    if (isMountedRef.current) {
      setLoading(true);
    }

    try {
      const headers = {
        Authorization: `Bearer ${session.accessToken}`,
        'X-Tenant-ID': session.tenantId,
      };

      switch (activeTab) {
        case 'facilities':
          const facRes = await fetch(`${API_BASE_URL}/api/admin/facilities`, { headers, signal });
          const facData = await facRes.json();
          if (signal?.aborted || !isMountedRef.current) return;
          setFacilities(facData.facilities || []);
          break;

        case 'rooms':
          const roomRes = await fetch(`${API_BASE_URL}/api/admin/rooms`, { headers, signal });
          const roomData = await roomRes.json();
          if (signal?.aborted || !isMountedRef.current) return;
          setRooms(roomData.rooms || []);
          break;

        case 'providers':
          const provRes = await fetch(`${API_BASE_URL}/api/admin/providers`, { headers, signal });
          const provData = await provRes.json();
          if (signal?.aborted || !isMountedRef.current) return;
          setProviders(provData.providers || []);
          break;

        case 'users':
          const userRes = await fetch(`${API_BASE_URL}/api/admin/users`, { headers, signal });
          const userData = await userRes.json();
          if (signal?.aborted || !isMountedRef.current) return;
          setUsers(userData.users || []);
          break;
        case 'permissions':
        case 'settings':
          break;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Error loading data:', err);
    } finally {
      if (!signal?.aborted && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [activeTab, session]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadData]);

  const handleSave = async (data: any) => {
    if (!session) return;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-Tenant-ID': session.tenantId,
    };

    try {
      const endpoint = `${API_BASE_URL}/api/admin/${activeTab}`;
      const method = editingItem?.id ? 'PUT' : 'POST';
      const url = editingItem?.id ? `${endpoint}/${editingItem.id}` : endpoint;

      await fetch(url, {
        method,
        headers,
        body: JSON.stringify(data),
      });

      setShowModal(false);
      setEditingItem(null);
      void loadData();
    } catch (err) {
      console.error('Error saving:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session || !confirm('Are you sure you want to delete this item?')) return;

    try {
      await fetch(`${API_BASE_URL}/api/admin/${activeTab}/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      });
      void loadData();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const replaceFacility = useCallback((updatedFacility: Facility) => {
    setFacilities((prev) => {
      const next = prev.some((facility) => facility.id === updatedFacility.id)
        ? prev.map((facility) => (facility.id === updatedFacility.id ? updatedFacility : facility))
        : [...prev, updatedFacility];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setEditingItem((prev: Facility | null) => (prev?.id === updatedFacility.id ? updatedFacility : prev));
  }, []);

  const registerFacilityDowntimePrimaryDevice = useCallback(async (facilityId: string) => {
    if (!session) {
      throw new Error('You must be signed in to register a downtime station.');
    }

    const res = await fetch(`${API_BASE_URL}/api/admin/facilities/${facilityId}/downtime-primary-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        'X-Tenant-ID': session.tenantId,
      },
      body: JSON.stringify({
        deviceId: downtimeDevice.deviceId,
        deviceLabel: downtimeDevice.label,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to register downtime station');
    }
    const facility = payload.facility as Facility;
    replaceFacility(facility);
    return facility;
  }, [downtimeDevice.deviceId, downtimeDevice.label, replaceFacility, session]);

  const clearFacilityDowntimePrimaryDevice = useCallback(async (facilityId: string) => {
    if (!session) {
      throw new Error('You must be signed in to clear a downtime station.');
    }

    const res = await fetch(`${API_BASE_URL}/api/admin/facilities/${facilityId}/downtime-primary-device`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'X-Tenant-ID': session.tenantId,
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to clear downtime station');
    }
    const facility = payload.facility as Facility;
    replaceFacility(facility);
    return facility;
  }, [replaceFacility, session]);

  const openAddModal = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const setActiveTabWithUrl = useCallback((nextTab: AdminTab) => {
    setActiveTab(nextTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextTab === DEFAULT_ADMIN_TAB) {
        next.delete('tab');
      } else {
        next.set('tab', nextTab);
      }
      return next;
    });
  }, [setSearchParams]);

  const tabs = [
    { key: 'facilities', label: 'Facilities' },
    { key: 'rooms', label: 'Rooms' },
    { key: 'providers', label: 'Providers' },
    { key: 'users', label: 'Users' },
    { key: 'permissions', label: 'Access Control' },
    { key: 'settings', label: 'Settings' },
  ] as const;

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Admin Settings</h1>
          <p style={subtitleStyle}>Manage facilities, rooms, providers, and user accounts</p>
        </div>

        {/* Quick Links */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <Link to="/admin/analytics" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              padding: '1.5rem',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 6px rgba(139, 92, 246, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(139, 92, 246, 0.3)';
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Analytics Dashboard</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>
                View comprehensive practice metrics
              </div>
            </div>
          </Link>
          <Link to="/admin/audit-log" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
              padding: '1.5rem',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 6px rgba(6, 182, 212, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(6, 182, 212, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(6, 182, 212, 0.3)';
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Audit Log</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>
                Review system activity
              </div>
            </div>
          </Link>
          <Link to="/admin/fee-schedules" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              padding: '1.5rem',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 6px rgba(16, 185, 129, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)';
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💰</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Fee Schedules</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>
                Manage pricing
              </div>
            </div>
          </Link>
          <Link to="/admin/ai-agents" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              padding: '1.5rem',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 6px rgba(245, 158, 11, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(245, 158, 11, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(245, 158, 11, 0.3)';
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🤖</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>AI Agents</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>
                Configure AI assistants
              </div>
            </div>
          </Link>
          <Link to="/admin?tab=permissions" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'linear-gradient(135deg, #0f766e 0%, #0e7490 100%)',
              padding: '1.5rem',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 6px rgba(15, 118, 110, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(15, 118, 110, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(15, 118, 110, 0.3)';
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Access</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Access Control</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>
                Control pages and Command Center visibility
              </div>
            </div>
          </Link>
        </div>

        <div style={tabsContainerStyle}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTabWithUrl(tab.key)}
              style={activeTab === tab.key ? activeTabStyle : inactiveTabStyle}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
              {adminTabLabels[activeTab]}
            </h2>
            {activeTab !== 'settings' && activeTab !== 'permissions' ? (
              <button onClick={openAddModal} style={btnPrimaryStyle}>
                + Add {activeTab === 'facilities' ? 'Facility' : activeTab.slice(0, -1)}
              </button>
            ) : null}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              Loading...
            </div>
          ) : (
            <>
              {activeTab === 'facilities' && <FacilitiesTable facilities={facilities} onEdit={openEditModal} onDelete={handleDelete} />}
              {activeTab === 'rooms' && <RoomsTable rooms={rooms} onEdit={openEditModal} onDelete={handleDelete} />}
              {activeTab === 'providers' && <ProvidersTable providers={providers} onEdit={openEditModal} onDelete={handleDelete} />}
              {activeTab === 'users' && <UsersTable users={users} onEdit={openEditModal} onDelete={handleDelete} />}
              {activeTab === 'permissions' && <AccessControlPanel />}
              {activeTab === 'settings' && <AdminSettingsPanel />}
            </>
          )}
        </div>

        {showModal && activeTab !== 'settings' && activeTab !== 'permissions' && (
          <Modal
            type={activeTab}
            item={editingItem}
            facilities={facilities}
            currentDowntimeDevice={downtimeDevice}
            onRegisterDowntimePrimaryDevice={registerFacilityDowntimePrimaryDevice}
            onClearDowntimePrimaryDevice={clearFacilityDowntimePrimaryDevice}
            onClose={() => { setShowModal(false); setEditingItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

function AccessControlPanel() {
  const { session } = useAuth();
  const accessControl = useAccessControl();
  const [selectedRole, setSelectedRole] = useState<Role>('front_desk');
  const [moduleAccess, setModuleAccess] = useState(() => resolveModuleAccess(accessControl.settings.moduleAccess));
  const [commandCenterAccess, setCommandCenterAccess] = useState(() =>
    resolveCommandCenterAccess(accessControl.settings.commandCenterAccess)
  );
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setModuleAccess(resolveModuleAccess(accessControl.settings.moduleAccess));
    setCommandCenterAccess(resolveCommandCenterAccess(accessControl.settings.commandCenterAccess));
  }, [accessControl.settings.commandCenterAccess, accessControl.settings.moduleAccess]);

  const toggleRoleInModule = (moduleKey: ModuleKey) => {
    if (selectedRole === 'admin') return;
    if (moduleKey === 'home') return;

    setModuleAccess((current) => {
      const currentRoles = current[moduleKey] || [];
      const hasRole = currentRoles.includes(selectedRole);
      return {
        ...current,
        [moduleKey]: hasRole
          ? currentRoles.filter((role) => role !== selectedRole)
          : [...currentRoles, selectedRole],
      };
    });
  };

  const toggleRoleInCommandSection = (sectionKey: CommandCenterSectionKey) => {
    if (selectedRole === 'admin') return;

    setCommandCenterAccess((current) => {
      const currentRoles = current[sectionKey] || [];
      const hasRole = currentRoles.includes(selectedRole);
      return {
        ...current,
        [sectionKey]: hasRole
          ? currentRoles.filter((role) => role !== selectedRole)
          : [...currentRoles, selectedRole],
      };
    });
  };

  const saveAccessControl = async () => {
    if (!session) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const payload: Pick<AccessSettingsPayload, 'moduleAccess' | 'commandCenterAccess'> = {
        moduleAccess,
        commandCenterAccess,
      };
      await updateAccessSettings(session.tenantId, session.accessToken, payload);
      await accessControl.reload();
      setSaveStatus('Access control settings saved.');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Failed to save access control settings.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setModuleAccess(resolveModuleAccess());
    setCommandCenterAccess(resolveCommandCenterAccess());
    setSaveStatus('Defaults staged. Save to apply them.');
  };

  const selectedRoleLabel = ROLE_LABELS[selectedRole] || selectedRole;
  const pageCount = MODULE_KEYS.filter((moduleKey) => moduleAccess[moduleKey]?.includes(selectedRole)).length;
  const commandCount = COMMAND_CENTER_SECTION_KEYS.filter((sectionKey) =>
    commandCenterAccess[sectionKey]?.includes(selectedRole)
  ).length;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: '#111827', fontSize: '1.1rem' }}>Role permissions</h3>
          <p style={{ margin: '0.35rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            Pick a role, then choose which pages and Command Center sections that role can use.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={btnSecondaryStyle} onClick={resetToDefaults}>
            Reset defaults
          </button>
          <button type="button" style={btnPrimaryStyle} onClick={saveAccessControl} disabled={saving}>
            {saving ? 'Saving...' : 'Save Access Control'}
          </button>
        </div>
      </div>

      {accessControl.error && (
        <div style={{ border: '1px solid #fecaca', borderRadius: '10px', padding: '0.8rem 1rem', background: '#fef2f2', color: '#991b1b' }}>
          {accessControl.error}. Showing default permissions until the server responds.
        </div>
      )}
      {saveStatus && (
        <div style={{ border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.8rem 1rem', background: '#eff6ff', color: '#1e3a8a' }}>
          {saveStatus}
        </div>
      )}

      <div style={{ ...segmentedGroupStyle, gap: '0.45rem' }}>
        {MANAGEABLE_ACCESS_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            style={segmentedButtonStyle(selectedRole === role)}
            onClick={() => setSelectedRole(role)}
          >
            {ROLE_LABELS[role] || role}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#ffffff' }}>
          <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, color: '#111827', fontSize: '1rem' }}>Pages for {selectedRoleLabel}</h3>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>{pageCount} pages enabled. Command Center stays available to staff roles.</p>
          </div>
          <div style={{ display: 'grid', gap: '0.15rem', padding: '0.75rem' }}>
            {MODULE_KEYS.map((moduleKey) => {
              const checked = Boolean(moduleAccess[moduleKey]?.includes(selectedRole));
              const locked = selectedRole === 'admin' || moduleKey === 'home';
              return (
                <label
                  key={moduleKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.65rem 0.7rem',
                    borderRadius: '8px',
                    background: checked ? '#f0fdf4' : '#ffffff',
                    border: checked ? '1px solid #bbf7d0' : '1px solid transparent',
                    color: '#334155',
                    fontSize: '0.9rem',
                  }}
                >
                  <span>
                    <strong>{MODULE_LABELS[moduleKey]}</strong>
                    {moduleKey === 'home' && <small style={{ display: 'block', color: '#64748b' }}>Use Command Center settings below to hide Home content.</small>}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggleRoleInModule(moduleKey)}
                    aria-label={`${MODULE_LABELS[moduleKey]} access for ${selectedRoleLabel}`}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#ffffff' }}>
          <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, color: '#111827', fontSize: '1rem' }}>Command Center for {selectedRoleLabel}</h3>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              {commandCount} Home sections enabled. Financial cards are separate from front desk operations.
            </p>
          </div>
          <div style={{ display: 'grid', gap: '0.15rem', padding: '0.75rem' }}>
            {COMMAND_CENTER_SECTION_KEYS.map((sectionKey) => {
              const checked = Boolean(commandCenterAccess[sectionKey]?.includes(selectedRole));
              const locked = selectedRole === 'admin';
              const isFinancial =
                sectionKey.includes('revenue') ||
                sectionKey.includes('billing') ||
                sectionKey.includes('collections') ||
                sectionKey === 'priority_claims';
              return (
                <label
                  key={sectionKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.65rem 0.7rem',
                    borderRadius: '8px',
                    background: checked ? (isFinancial ? '#fff7ed' : '#eff6ff') : '#ffffff',
                    border: checked ? (isFinancial ? '1px solid #fed7aa' : '1px solid #bfdbfe') : '1px solid transparent',
                    color: '#334155',
                    fontSize: '0.9rem',
                  }}
                >
                  <span>
                    <strong>{COMMAND_CENTER_LABELS[sectionKey]}</strong>
                    {isFinancial && <small style={{ display: 'block', color: '#9a3412' }}>Financial / revenue visibility</small>}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggleRoleInCommandSection(sectionKey)}
                    aria-label={`${COMMAND_CENTER_LABELS[sectionKey]} visibility for ${selectedRoleLabel}`}
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminSettingsPanel() {
  const [workspaceSettings, setWorkspaceSettings] = useState(() => {
    const fallback = {
      requireCheckInCopayPrompt: true,
      showNoShowConfirmations: true,
      enableCompactScheduleActions: true,
      defaultAdminLanding: '/admin?tab=users',
    };

    try {
      const raw = localStorage.getItem('admin:workspaceSettings');
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
      };
    } catch {
      return fallback;
    }
  });

  const handleToggle = (key: 'requireCheckInCopayPrompt' | 'showNoShowConfirmations' | 'enableCompactScheduleActions') => {
    setWorkspaceSettings((prev: any) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveSettings = () => {
    localStorage.setItem('admin:workspaceSettings', JSON.stringify(workspaceSettings));
    window.alert('Admin settings saved.');
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1rem',
          background: '#f9fafb',
        }}
      >
        <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.05rem', color: '#111827' }}>
          Administrative Workflow
        </h3>
        <p style={{ margin: 0, marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Configure front desk and scheduling behavior used across admin tools.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#374151', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={workspaceSettings.requireCheckInCopayPrompt}
              onChange={() => handleToggle('requireCheckInCopayPrompt')}
            />
            Require copay prompt at check-in when balance exists
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#374151', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={workspaceSettings.showNoShowConfirmations}
              onChange={() => handleToggle('showNoShowConfirmations')}
            />
            Require no-show confirmation before fee posting
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#374151', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={workspaceSettings.enableCompactScheduleActions}
              onChange={() => handleToggle('enableCompactScheduleActions')}
            />
            Use compact inline schedule action menu
          </label>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1rem',
          background: '#ffffff',
        }}
      >
        <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.05rem', color: '#111827' }}>
          Admin Quick Links
        </h3>
        <p style={{ margin: 0, marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Jump to commonly used administrative modules.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <Link to="/admin/integrations" style={{ textDecoration: 'none', color: '#1d4ed8', border: '1px solid #dbeafe', borderRadius: '8px', padding: '0.75rem' }}>
            Integrations
          </Link>
          <Link to="/admin/fee-schedules" style={{ textDecoration: 'none', color: '#1d4ed8', border: '1px solid #dbeafe', borderRadius: '8px', padding: '0.75rem' }}>
            Fee Schedules
          </Link>
          <Link to="/admin/audit-log" style={{ textDecoration: 'none', color: '#1d4ed8', border: '1px solid #dbeafe', borderRadius: '8px', padding: '0.75rem' }}>
            Audit Log
          </Link>
          <Link to="/admin/ai-agents" style={{ textDecoration: 'none', color: '#1d4ed8', border: '1px solid #dbeafe', borderRadius: '8px', padding: '0.75rem' }}>
            AI Agents
          </Link>
          {canViewProfessionalFeedback(user) && (
            <Link to="/admin/feedback" style={{ textDecoration: 'none', color: '#1d4ed8', border: '1px solid #dbeafe', borderRadius: '8px', padding: '0.75rem' }}>
              Feedback Inbox
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" style={btnPrimaryStyle} onClick={handleSaveSettings}>
          Save Admin Settings
        </button>
      </div>
    </div>
  );
}

function FacilitiesTable({ facilities, onEdit, onDelete }: { facilities: Facility[]; onEdit: (f: Facility) => void; onDelete: (id: string) => void }) {
  if (facilities.length === 0) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>No facilities found. Add your first facility.</div>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Address</th>
          <th style={thStyle}>Phone</th>
          <th style={thStyle}>Downtime Packet</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {facilities.map((f) => (
          <tr key={f.id}>
            <td style={tdStyle}><strong>{f.name}</strong></td>
            <td style={tdStyle}>{f.address || '—'}</td>
            <td style={tdStyle}>{f.phone || '—'}</td>
            <td style={tdStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '9999px',
                    width: 'fit-content',
                    background: f.downtimeSettings?.enabled ? '#ecfeff' : '#f3f4f6',
                    color: f.downtimeSettings?.enabled ? '#0f766e' : '#4b5563',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {f.downtimeSettings?.enabled ? 'Auto Download On' : 'Auto Download Off'}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{describeDowntimeSettings(f)}</span>
                <span style={{ fontSize: '0.8rem', color: f.downtimePrimaryDevice?.deviceId ? '#0f172a' : '#9ca3af' }}>
                  {describePrimaryStation(f)}
                </span>
              </div>
            </td>
            <td style={tdStyle}>
              <span style={f.isActive !== false ? badgeActiveStyle : badgeInactiveStyle}>
                {f.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td style={tdStyle}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => onEdit(f)} style={btnSecondaryStyle}>Edit</button>
                <button onClick={() => onDelete(f.id)} style={btnDangerStyle}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RoomsTable({ rooms, onEdit, onDelete }: { rooms: Room[]; onEdit: (r: Room) => void; onDelete: (id: string) => void }) {
  if (rooms.length === 0) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>No rooms found. Add your first room.</div>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Facility</th>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rooms.map((r) => (
          <tr key={r.id}>
            <td style={tdStyle}><strong>{r.name}</strong></td>
            <td style={tdStyle}>{r.facilityName || '—'}</td>
            <td style={tdStyle}>{formatRoomType(r.roomType)}</td>
            <td style={tdStyle}>
              <span style={r.isActive !== false ? badgeActiveStyle : badgeInactiveStyle}>
                {r.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td style={tdStyle}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => onEdit(r)} style={btnSecondaryStyle}>Edit</button>
                <button onClick={() => onDelete(r.id)} style={btnDangerStyle}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProvidersTable({ providers, onEdit, onDelete }: { providers: Provider[]; onEdit: (p: Provider) => void; onDelete: (id: string) => void }) {
  if (providers.length === 0) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>No providers found. Add your first provider.</div>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Specialty</th>
          <th style={thStyle}>NPI</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.id}>
            <td style={tdStyle}><strong>{p.fullName}</strong></td>
            <td style={tdStyle}>{p.specialty || 'Dermatology'}</td>
            <td style={tdStyle}>{p.npi || '—'}</td>
            <td style={tdStyle}>
              <span style={p.isActive !== false ? badgeActiveStyle : badgeInactiveStyle}>
                {p.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td style={tdStyle}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => onEdit(p)} style={btnSecondaryStyle}>Edit</button>
                <button onClick={() => onDelete(p.id)} style={btnDangerStyle}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UsersTable({ users, onEdit, onDelete }: { users: User[]; onEdit: (u: User) => void; onDelete: (id: string) => void }) {
  if (users.length === 0) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>No users found.</div>;
  }

  const roleBadgeStyle = (role: string): React.CSSProperties => {
    const colors: Record<string, { bg: string; text: string }> = {
      admin: { bg: '#fae8ff', text: '#86198f' },
      provider: { bg: '#dbeafe', text: '#1e40af' },
      billing: { bg: '#fef3c7', text: '#92400e' },
      ma: { bg: '#dcfce7', text: '#166534' },
      front_desk: { bg: '#fef3c7', text: '#92400e' },
      nurse: { bg: '#e0e7ff', text: '#3730a3' },
      scheduler: { bg: '#ecfeff', text: '#155e75' },
      staff: { bg: '#f1f5f9', text: '#1e293b' },
      hr: { bg: '#ffedd5', text: '#9a3412' },
      manager: { bg: '#ffe4e6', text: '#be123c' },
      compliance_officer: { bg: '#f3e8ff', text: '#6b21a8' },
    };
    const c = colors[role] || colors.admin;
    return {
      display: 'inline-block',
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      background: c.bg,
      color: c.text,
    };
  };

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Email</th>
          <th style={thStyle}>Role</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const effectiveRoles = buildEffectiveRoles(u.role, u.roles || u.secondaryRoles);
          return (
          <tr key={u.id}>
            <td style={tdStyle}><strong>{u.fullName}</strong></td>
            <td style={tdStyle}>{u.email}</td>
            <td style={tdStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {effectiveRoles.map((role) => (
                  <span key={`${u.id}-${role}`} style={roleBadgeStyle(role)}>
                    {roleLabels[role] || role}
                  </span>
                ))}
              </div>
            </td>
            <td style={tdStyle}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => onEdit(u)} style={btnSecondaryStyle}>Edit</button>
                <button onClick={() => onDelete(u.id)} style={btnDangerStyle}>Delete</button>
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Modal({
  type,
  item,
  facilities,
  currentDowntimeDevice,
  onRegisterDowntimePrimaryDevice,
  onClearDowntimePrimaryDevice,
  onClose,
  onSave,
}: {
  type: string;
  item: any;
  facilities: Facility[];
  currentDowntimeDevice: DowntimeBrowserDevice;
  onRegisterDowntimePrimaryDevice: (facilityId: string) => Promise<Facility>;
  onClearDowntimePrimaryDevice: (facilityId: string) => Promise<Facility>;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>(type === 'facilities' ? createFacilityDraft(item) : item || {});
  const [deviceActionError, setDeviceActionError] = useState<string | null>(null);
  const [deviceActionMessage, setDeviceActionMessage] = useState<string | null>(null);
  const [deviceActionRunning, setDeviceActionRunning] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'users') {
      const primaryRole = typeof formData.role === 'string' ? formData.role : 'front_desk';
      const secondaryRoles = normalizeRoleArray(formData.secondaryRoles).filter((candidate) => candidate !== primaryRole);
      onSave({ ...formData, role: primaryRole, secondaryRoles });
      return;
    }
    onSave(formData);
  };

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleRegisterThisBrowser = async () => {
    if (!formData.id) return;
    setDeviceActionError(null);
    setDeviceActionMessage(null);
    setDeviceActionRunning(true);
    try {
      const facility = await onRegisterDowntimePrimaryDevice(formData.id);
      setFormData(createFacilityDraft(facility));
      setDeviceActionMessage(`Registered ${currentDowntimeDevice.label} as the primary downtime station.`);
    } catch (err: any) {
      setDeviceActionError(err?.message || 'Failed to register the current browser as the downtime station.');
    } finally {
      setDeviceActionRunning(false);
    }
  };

  const handleClearPrimaryStation = async () => {
    if (!formData.id) return;
    setDeviceActionError(null);
    setDeviceActionMessage(null);
    setDeviceActionRunning(true);
    try {
      const facility = await onClearDowntimePrimaryDevice(formData.id);
      setFormData(createFacilityDraft(facility));
      setDeviceActionMessage('Cleared the primary downtime station assignment.');
    } catch (err: any) {
      setDeviceActionError(err?.message || 'Failed to clear the downtime station assignment.');
    } finally {
      setDeviceActionRunning(false);
    }
  };

  const toggleSecondaryRole = (role: string) => {
    const primaryRole = typeof formData.role === 'string' ? formData.role : 'front_desk';
    const current = new Set(
      normalizeRoleArray(formData.secondaryRoles).filter((candidate) => candidate !== primaryRole),
    );
    if (current.has(role)) {
      current.delete(role);
    } else {
      current.add(role);
    }
    handleChange('secondaryRoles', Array.from(current));
  };

  const typeLabel = singularLabels[type] || type.slice(0, -1);
  const titleLabel = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  const title = item?.id ? `Edit ${titleLabel}` : `Add New ${titleLabel}`;

  return (
    <div style={modalOverlayStyle}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalTitleStyle}>{title}</h2>

        <form onSubmit={handleSubmit}>
          {type === 'facilities' && (
            <>
              <div style={formGroupStyle}>
                <label htmlFor="facility-name" style={labelStyle}>Facility Name *</label>
                <input
                  type="text"
                  id="facility-name"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Main Clinic"
                />
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="facility-address" style={labelStyle}>Address</label>
                <input
                  type="text"
                  id="facility-address"
                  value={formData.address || ''}
                  onChange={(e) => handleChange('address', e.target.value)}
                  style={inputStyle}
                  placeholder="123 Medical Center Dr"
                />
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="facility-phone" style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  id="facility-phone"
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  style={inputStyle}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div style={{ ...formGroupStyle, padding: '1rem', borderRadius: '0.75rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
                  Downtime Packet
                </div>
                <div style={{ marginBottom: '0.5rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
                  Auto Download
                </div>
                <div style={{ ...segmentedGroupStyle, marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    style={segmentedButtonStyle(!formData.downtimeSettings?.enabled)}
                    onClick={() =>
                      handleChange('downtimeSettings', {
                        ...defaultDowntimeSettings,
                        ...(formData.downtimeSettings || {}),
                        enabled: false,
                      })
                    }
                  >
                    Manual Only
                  </button>
                  <button
                    type="button"
                    style={segmentedButtonStyle(Boolean(formData.downtimeSettings?.enabled))}
                    onClick={() =>
                      handleChange('downtimeSettings', {
                        ...defaultDowntimeSettings,
                        ...(formData.downtimeSettings || {}),
                        enabled: true,
                      })
                    }
                  >
                    Auto Download On
                  </button>
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  The next business day packet becomes eligible at this time. Friday afternoon prepares Monday, active devices download it automatically once the cutoff is reached, and staff can still download it manually from the Schedule page at any time.
                </div>

                <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '0.75rem', background: '#ffffff', border: '1px solid #dbe4ee' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', marginBottom: '0.35rem' }}>
                    Primary Downtime Station
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '0.65rem' }}>
                    Open Admin on the actual workstation you want to rely on during downtime, then register that browser here.
                  </div>
                  <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.82rem', color: '#475569' }}>
                    <div><strong>This browser:</strong> {currentDowntimeDevice.label} • ID {formatDowntimeDeviceShortId(currentDowntimeDevice.deviceId)}</div>
                    <div>
                      <strong>Assigned station:</strong>{' '}
                      {formData.downtimePrimaryDevice?.deviceId
                        ? formData.downtimePrimaryDevice.label || `Device ${formatDowntimeDeviceShortId(formData.downtimePrimaryDevice.deviceId)}`
                        : 'None'}
                    </div>
                    {formData.downtimePrimaryDevice?.deviceId ? (
                      <>
                        <div><strong>Registered:</strong> {formatAdminTimestamp(formData.downtimePrimaryDevice.registeredAt)}</div>
                        <div><strong>Registered by:</strong> {formData.downtimePrimaryDevice.registeredBy || '—'}</div>
                        <div><strong>Last seen:</strong> {formatAdminTimestamp(formData.downtimePrimaryDevice.lastSeenAt)}</div>
                        <div><strong>Last packet saved:</strong> {formatAdminTimestamp(formData.downtimePrimaryDevice.lastPacketSavedAt)}</div>
                        <div><strong>Last packet date:</strong> {formData.downtimePrimaryDevice.lastPacketDate || '—'}</div>
                      </>
                    ) : null}
                  </div>
                  {formData.id ? (
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                      <button
                        type="button"
                        onClick={handleRegisterThisBrowser}
                        disabled={deviceActionRunning}
                        style={{
                          ...btnSecondaryStyle,
                          borderColor: '#0891b2',
                          color: '#0f766e',
                          opacity: deviceActionRunning ? 0.6 : 1,
                          cursor: deviceActionRunning ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Register This Browser
                      </button>
                      {formData.downtimePrimaryDevice?.deviceId ? (
                        <button
                          type="button"
                          onClick={handleClearPrimaryStation}
                          disabled={deviceActionRunning}
                          style={{
                            ...btnSecondaryStyle,
                            borderColor: '#cbd5e1',
                            color: '#475569',
                            opacity: deviceActionRunning ? 0.6 : 1,
                            cursor: deviceActionRunning ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Clear Assigned Station
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ marginTop: '0.85rem', fontSize: '0.82rem', color: '#6b7280' }}>
                      Save this facility first, then register the primary downtime station.
                    </div>
                  )}
                  {deviceActionMessage ? (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#166534' }}>{deviceActionMessage}</div>
                  ) : null}
                  {deviceActionError ? (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#b91c1c' }}>{deviceActionError}</div>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                  <div style={formGroupStyle}>
                    <label htmlFor="facility-downtime-time" style={labelStyle}>Packet Time</label>
                    <input
                      type="time"
                      id="facility-downtime-time"
                      value={formData.downtimeSettings?.packetTime || defaultDowntimeSettings.packetTime}
                      onChange={(e) =>
                        handleChange('downtimeSettings', {
                          ...defaultDowntimeSettings,
                          ...(formData.downtimeSettings || {}),
                          packetTime: e.target.value || defaultDowntimeSettings.packetTime,
                        })
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={formGroupStyle}>
                    <label htmlFor="facility-downtime-device" style={labelStyle}>Device Type</label>
                    <div id="facility-downtime-device" style={segmentedGroupStyle}>
                      <button
                        type="button"
                        style={segmentedButtonStyle((formData.downtimeSettings?.deviceProfile || defaultDowntimeSettings.deviceProfile) === 'auto')}
                        onClick={() =>
                          handleChange('downtimeSettings', {
                            ...defaultDowntimeSettings,
                            ...(formData.downtimeSettings || {}),
                            deviceProfile: 'auto',
                          })
                        }
                      >
                        Auto Detect
                      </button>
                      <button
                        type="button"
                        style={segmentedButtonStyle((formData.downtimeSettings?.deviceProfile || defaultDowntimeSettings.deviceProfile) === 'desktop')}
                        onClick={() =>
                          handleChange('downtimeSettings', {
                            ...defaultDowntimeSettings,
                            ...(formData.downtimeSettings || {}),
                            deviceProfile: 'desktop',
                          })
                        }
                      >
                        Mac / Dell Desktop
                      </button>
                      <button
                        type="button"
                        style={segmentedButtonStyle((formData.downtimeSettings?.deviceProfile || defaultDowntimeSettings.deviceProfile) === 'ipad')}
                        onClick={() =>
                          handleChange('downtimeSettings', {
                            ...defaultDowntimeSettings,
                            ...(formData.downtimeSettings || {}),
                            deviceProfile: 'ipad',
                          })
                        }
                      >
                        iPad / Tablet
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#374151', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formData.downtimeSettings?.includeDob)}
                      onChange={(e) =>
                        handleChange('downtimeSettings', {
                          ...defaultDowntimeSettings,
                          ...(formData.downtimeSettings || {}),
                          includeDob: e.target.checked,
                        })
                      }
                    />
                    Include DOB
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#374151', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formData.downtimeSettings?.includePhone)}
                      onChange={(e) =>
                        handleChange('downtimeSettings', {
                          ...defaultDowntimeSettings,
                          ...(formData.downtimeSettings || {}),
                          includePhone: e.target.checked,
                        })
                      }
                    />
                    Include phone
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#374151', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formData.downtimeSettings?.includeInsurance)}
                      onChange={(e) =>
                        handleChange('downtimeSettings', {
                          ...defaultDowntimeSettings,
                          ...(formData.downtimeSettings || {}),
                          includeInsurance: e.target.checked,
                        })
                      }
                    />
                    Include insurance
                  </label>
                </div>
              </div>
            </>
          )}

          {type === 'rooms' && (
            <>
              <div style={formGroupStyle}>
                <label htmlFor="room-name" style={labelStyle}>Room Name *</label>
                <input
                  type="text"
                  id="room-name"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Exam Room 1"
                />
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="room-facility" style={labelStyle}>Facility *</label>
                <select
                  id="room-facility"
                  value={formData.facilityId || ''}
                  onChange={(e) => handleChange('facilityId', e.target.value)}
                  required
                  style={selectStyle}
                >
                  <option value="">Select a facility</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="room-type" style={labelStyle}>Room Type</label>
                <select
                  id="room-type"
                  value={formData.roomType || 'exam'}
                  onChange={(e) => handleChange('roomType', e.target.value)}
                  style={selectStyle}
                >
                  <option value="exam">Exam Room</option>
                  <option value="procedure">Procedure Room</option>
                  <option value="consult">Consultation Room</option>
                  <option value="photo">Photo Room</option>
                  <option value="lab">Lab Room</option>
                </select>
              </div>
            </>
          )}

          {type === 'providers' && (
            <>
              <div style={formGroupStyle}>
                <label htmlFor="provider-full-name" style={labelStyle}>Full Name *</label>
                <input
                  type="text"
                  id="provider-full-name"
                  value={formData.fullName || ''}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Dr. Jane Smith"
                />
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="provider-specialty" style={labelStyle}>Specialty</label>
                <input
                  type="text"
                  id="provider-specialty"
                  value={formData.specialty || ''}
                  onChange={(e) => handleChange('specialty', e.target.value)}
                  style={inputStyle}
                  placeholder="Dermatology"
                />
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="provider-npi" style={labelStyle}>NPI</label>
                <input
                  type="text"
                  id="provider-npi"
                  value={formData.npi || ''}
                  onChange={(e) => handleChange('npi', e.target.value)}
                  style={inputStyle}
                  placeholder="1234567890"
                />
              </div>
            </>
          )}

          {type === 'users' && (
            <>
              <div style={formGroupStyle}>
                <label htmlFor="user-full-name" style={labelStyle}>Full Name *</label>
                <input
                  type="text"
                  id="user-full-name"
                  value={formData.fullName || ''}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="John Doe"
                />
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="user-email" style={labelStyle}>Email *</label>
                <input
                  type="email"
                  id="user-email"
                  value={formData.email || ''}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="user@practice.com"
                />
              </div>
              <div style={formGroupStyle}>
                <label htmlFor="user-role" style={labelStyle}>Role *</label>
                <select
                  id="user-role"
                  value={formData.role || 'front_desk'}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    const nextSecondary = normalizeRoleArray(formData.secondaryRoles).filter((role) => role !== nextRole);
                    setFormData({ ...formData, role: nextRole, secondaryRoles: nextSecondary });
                  }}
                  required
                  style={selectStyle}
                >
                  {MANAGEABLE_USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Additional Roles</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {MANAGEABLE_USER_ROLES.filter((candidate) => candidate !== (formData.role || 'front_desk')).map((candidate) => {
                    const checked = normalizeRoleArray(formData.secondaryRoles).includes(candidate);
                    return (
                      <label
                        key={candidate}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: '#374151' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSecondaryRole(candidate)}
                        />
                        {roleLabels[candidate]}
                      </label>
                    );
                  })}
                </div>
              </div>
              {!item?.id && (
                <div style={formGroupStyle}>
                  <label htmlFor="user-password" style={labelStyle}>Password *</label>
                  <input
                    type="password"
                    id="user-password"
                    value={formData.password || ''}
                    onChange={(e) => handleChange('password', e.target.value)}
                    required
                    style={inputStyle}
                    placeholder="Password123!"
                  />
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" onClick={onClose} style={{ ...btnSecondaryStyle, flex: 1 }}>
              Cancel
            </button>
            <button type="submit" style={{ ...btnPrimaryStyle, flex: 1 }}>
              {item?.id ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
