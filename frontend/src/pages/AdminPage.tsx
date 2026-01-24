import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';

interface Facility {
  id: string;
  name: string;
  address: string;
  phone?: string;
  isActive: boolean;
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
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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
  maxWidth: '500px',
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

export function AdminPage() {
  const { session, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'facilities' | 'rooms' | 'providers' | 'users'>('facilities');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Redirect non-admin users
  if (user?.role !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    if (!session) return;
    setLoading(true);

    try {
      const headers = {
        Authorization: `Bearer ${session.accessToken}`,
        'X-Tenant-ID': session.tenantId,
      };

      switch (activeTab) {
        case 'facilities':
          const facRes = await fetch(`${API_BASE}/api/admin/facilities`, { headers });
          const facData = await facRes.json();
          setFacilities(facData.facilities || []);
          break;

        case 'rooms':
          const roomRes = await fetch(`${API_BASE}/api/admin/rooms`, { headers });
          const roomData = await roomRes.json();
          setRooms(roomData.rooms || []);
          break;

        case 'providers':
          const provRes = await fetch(`${API_BASE}/api/admin/providers`, { headers });
          const provData = await provRes.json();
          setProviders(provData.providers || []);
          break;

        case 'users':
          const userRes = await fetch(`${API_BASE}/api/admin/users`, { headers });
          const userData = await userRes.json();
          setUsers(userData.users || []);
          break;
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: any) => {
    if (!session) return;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-Tenant-ID': session.tenantId,
    };

    try {
      const endpoint = `${API_BASE}/api/admin/${activeTab}`;
      const method = editingItem?.id ? 'PUT' : 'POST';
      const url = editingItem?.id ? `${endpoint}/${editingItem.id}` : endpoint;

      await fetch(url, {
        method,
        headers,
        body: JSON.stringify(data),
      });

      setShowModal(false);
      setEditingItem(null);
      loadData();
    } catch (err) {
      console.error('Error saving:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session || !confirm('Are you sure you want to delete this item?')) return;

    try {
      await fetch(`${API_BASE}/api/admin/${activeTab}/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      });
      loadData();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const tabs = [
    { key: 'facilities', label: 'Facilities' },
    { key: 'rooms', label: 'Rooms' },
    { key: 'providers', label: 'Providers' },
    { key: 'users', label: 'Users' },
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
        </div>

        <div style={tabsContainerStyle}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={activeTab === tab.key ? activeTabStyle : inactiveTabStyle}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h2>
            <button onClick={openAddModal} style={btnPrimaryStyle}>
              + Add {activeTab === 'facilities' ? 'Facility' : activeTab.slice(0, -1)}
            </button>
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
            </>
          )}
        </div>

        {showModal && (
          <Modal
            type={activeTab}
            item={editingItem}
            facilities={facilities}
            onClose={() => { setShowModal(false); setEditingItem(null); }}
            onSave={handleSave}
          />
        )}
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

  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    provider: 'Provider',
    ma: 'Medical Assistant',
    front_desk: 'Front Desk',
  };

  const roleBadgeStyle = (role: string): React.CSSProperties => {
    const colors: Record<string, { bg: string; text: string }> = {
      admin: { bg: '#fae8ff', text: '#86198f' },
      provider: { bg: '#dbeafe', text: '#1e40af' },
      ma: { bg: '#dcfce7', text: '#166534' },
      front_desk: { bg: '#fef3c7', text: '#92400e' },
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
        {users.map((u) => (
          <tr key={u.id}>
            <td style={tdStyle}><strong>{u.fullName}</strong></td>
            <td style={tdStyle}>{u.email}</td>
            <td style={tdStyle}>
              <span style={roleBadgeStyle(u.role)}>
                {roleLabels[u.role] || u.role}
              </span>
            </td>
            <td style={tdStyle}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => onEdit(u)} style={btnSecondaryStyle}>Edit</button>
                <button onClick={() => onDelete(u.id)} style={btnDangerStyle}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Modal({
  type,
  item,
  facilities,
  onClose,
  onSave,
}: {
  type: string;
  item: any;
  facilities: Facility[];
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>(item || {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const typeLabel = singularLabels[type] || type.slice(0, -1);
  const titleLabel = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  const title = item?.id ? `Edit ${titleLabel}` : `Add New ${titleLabel}`;

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
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
                  onChange={(e) => handleChange('role', e.target.value)}
                  required
                  style={selectStyle}
                >
                  <option value="admin">Administrator</option>
                  <option value="provider">Provider</option>
                  <option value="ma">Medical Assistant</option>
                  <option value="front_desk">Front Desk</option>
                </select>
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
