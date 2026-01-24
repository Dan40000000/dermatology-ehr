import { useState, useEffect } from 'react';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
import { fetchPortalProfile, updatePortalProfile } from '../../portalApi';

interface PatientProfile {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  preferredLanguage: string;
  preferredPharmacy: string;
}

export function PortalProfilePage() {
  const { patient, sessionToken, tenantId } = usePatientPortalAuth();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PatientProfile>>({});
  const [activeTab, setActiveTab] = useState<'info' | 'contact' | 'preferences' | 'security'>('info');

  useEffect(() => {
    fetchProfile();
  }, [sessionToken, tenantId]);

  const fetchProfile = async () => {
    if (!sessionToken || !tenantId) {
      setLoading(false);
      return;
    }

    try {
      const data = await fetchPortalProfile(tenantId, sessionToken);
      const portalPatient = data.patient;
      const fullName = [portalPatient.firstName, portalPatient.lastName].filter(Boolean).join(' ') || patient?.fullName || '';
      setProfile({
        id: portalPatient.id,
        fullName,
        firstName: portalPatient.firstName || '',
        lastName: portalPatient.lastName || '',
        dateOfBirth: (portalPatient as any).dob || '',
        gender: '',
        email: portalPatient.email || '',
        phone: portalPatient.phone || '',
        address: portalPatient.address || '',
        city: portalPatient.city || '',
        state: portalPatient.state || '',
        zip: portalPatient.zip || '',
        emergencyContactName: portalPatient.emergencyContactName || '',
        emergencyContactRelationship: portalPatient.emergencyContactRelationship || '',
        emergencyContactPhone: portalPatient.emergencyContactPhone || '',
        preferredLanguage: 'English',
        preferredPharmacy: '',
      });
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setEditForm(profile || {});
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditForm({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (sessionToken && tenantId) {
        const updates: Record<string, any> = {};
        const allowedFields = [
          'phone',
          'email',
          'address',
          'city',
          'state',
          'zip',
          'emergencyContactName',
          'emergencyContactRelationship',
          'emergencyContactPhone',
        ] as const;

        allowedFields.forEach((field) => {
          if (editForm[field] !== undefined) {
            updates[field] = editForm[field];
          }
        });

        if (Object.keys(updates).length > 0) {
          await updatePortalProfile(tenantId, sessionToken, updates);
        }
      }

      setProfile(prev => prev ? { ...prev, ...editForm } : null);
      setEditing(false);
      setEditForm({});
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <PatientPortalLayout>
      <style>{`
        .profile-page {
          padding: 1.5rem;
          max-width: 1000px;
          margin: 0 auto;
        }

        .profile-header {
          display: flex;
          gap: 1.5rem;
          align-items: flex-start;
          margin-bottom: 2rem;
        }

        .avatar-section {
          position: relative;
        }

        .avatar {
          width: 100px;
          height: 100px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 2rem;
          font-weight: 700;
        }

        .avatar-badge {
          position: absolute;
          bottom: -4px;
          right: -4px;
          width: 28px;
          height: 28px;
          background: #10b981;
          border-radius: 50%;
          border: 3px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-badge svg {
          width: 14px;
          height: 14px;
          color: white;
        }

        .profile-info {
          flex: 1;
        }

        .profile-name {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.25rem;
        }

        .profile-email {
          color: #6b7280;
          margin: 0 0 0.75rem;
        }

        .profile-meta {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .meta-item svg {
          width: 16px;
          height: 16px;
        }

        .edit-btn {
          padding: 0.625rem 1.25rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .edit-btn:hover {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .edit-btn svg {
          width: 16px;
          height: 16px;
        }

        .tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.5rem;
          overflow-x: auto;
        }

        .tab {
          padding: 0.75rem 1.25rem;
          border: none;
          background: none;
          color: #6b7280;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px 8px 0 0;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .tab:hover {
          color: #374151;
          background: #f3f4f6;
        }

        .tab.active {
          color: #6366f1;
          background: #eef2ff;
          border-bottom: 2px solid #6366f1;
          margin-bottom: -0.5rem;
          padding-bottom: calc(0.75rem + 0.5rem);
        }

        .content-section {
          background: white;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .section-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .section-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .section-content {
          padding: 1.5rem;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .info-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .info-value {
          font-size: 1rem;
          color: #111827;
          font-weight: 500;
        }

        .info-value.empty {
          color: #9ca3af;
          font-style: italic;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group.full-width {
          grid-column: span 2;
        }

        .form-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .form-input {
          padding: 0.75rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s;
        }

        .form-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #e5e7eb;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary {
          background: white;
          border: 1px solid #e5e7eb;
          color: #374151;
        }

        .btn-secondary:hover {
          background: #f3f4f6;
        }

        .btn-primary {
          background: #6366f1;
          border: none;
          color: white;
        }

        .btn-primary:hover {
          background: #4f46e5;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Security Tab */
        .security-item {
          padding: 1.25rem 0;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .security-item:first-child {
          padding-top: 0;
        }

        .security-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .security-info h4 {
          margin: 0 0 0.25rem;
          font-weight: 600;
          color: #111827;
        }

        .security-info p {
          margin: 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .security-action {
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .security-action:hover {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        /* Preferences Tab */
        .preference-item {
          padding: 1rem 0;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .preference-item:first-child {
          padding-top: 0;
        }

        .preference-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .preference-info h4 {
          margin: 0 0 0.25rem;
          font-weight: 500;
          color: #111827;
        }

        .preference-info p {
          margin: 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .toggle {
          width: 48px;
          height: 26px;
          background: #d1d5db;
          border-radius: 13px;
          position: relative;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle.active {
          background: #6366f1;
        }

        .toggle::after {
          content: '';
          position: absolute;
          width: 22px;
          height: 22px;
          background: white;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: all 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }

        .toggle.active::after {
          left: 24px;
        }

        .loading-skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 8px;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 640px) {
          .profile-page {
            padding: 1rem;
          }

          .profile-header {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .profile-meta {
            justify-content: center;
          }

          .info-grid,
          .form-grid {
            grid-template-columns: 1fr;
          }

          .form-group.full-width {
            grid-column: span 1;
          }
        }
      `}</style>

      <div className="profile-page">
        {/* Profile Header */}
        <div className="profile-header">
          <div className="avatar-section">
            <div className="avatar">
              {profile ? getInitials(profile.fullName) : 'U'}
            </div>
            <div className="avatar-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </div>
          </div>

          <div className="profile-info">
            <h1 className="profile-name">{loading ? 'Loading...' : profile?.fullName || 'Unknown'}</h1>
            <p className="profile-email">{profile?.email}</p>
            <div className="profile-meta">
              <span className="meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Patient
              </span>
              <span className="meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verified
              </span>
            </div>
          </div>

          {!editing && (
            <button className="edit-btn" onClick={handleEdit}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit Profile
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            Personal Info
          </button>
          <button
            className={`tab ${activeTab === 'contact' ? 'active' : ''}`}
            onClick={() => setActiveTab('contact')}
          >
            Contact
          </button>
          <button
            className={`tab ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            Preferences
          </button>
          <button
            className={`tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            Security
          </button>
        </div>

        {/* Content */}
        <div className="content-section">
          {/* Personal Info Tab */}
          {activeTab === 'info' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Personal Information</h3>
              </div>
              <div className="section-content">
                {loading ? (
                  <div className="info-grid">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="loading-skeleton" style={{ height: '4rem' }} />
                    ))}
                  </div>
                ) : editing ? (
                  <>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">First Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editForm.firstName || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Last Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editForm.lastName || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, lastName: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date of Birth</label>
                        <input
                          type="date"
                          className="form-input"
                          value={editForm.dateOfBirth || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Gender</label>
                        <select
                          className="form-input"
                          value={editForm.gender || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
                        >
                          <option value="">Select...</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                          <option value="prefer_not_to_say">Prefer not to say</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">First Name</span>
                      <span className="info-value">{profile?.firstName || 'Not set'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Last Name</span>
                      <span className="info-value">{profile?.lastName || 'Not set'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Date of Birth</span>
                      <span className={`info-value ${!profile?.dateOfBirth ? 'empty' : ''}`}>
                        {formatDate(profile?.dateOfBirth || '')}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Gender</span>
                      <span className={`info-value ${!profile?.gender ? 'empty' : ''}`}>
                        {profile?.gender || 'Not set'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Contact Tab */}
          {activeTab === 'contact' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Contact Information</h3>
              </div>
              <div className="section-content">
                {loading ? (
                  <div className="info-grid">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="loading-skeleton" style={{ height: '4rem' }} />
                    ))}
                  </div>
                ) : editing ? (
                  <>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                          type="email"
                          className="form-input"
                          value={editForm.email || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input
                          type="tel"
                          className="form-input"
                          value={editForm.phone || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="(555) 555-5555"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label className="form-label">Address</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editForm.address || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editForm.city || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">State</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editForm.state || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, state: e.target.value }))}
                          maxLength={2}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">ZIP Code</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editForm.zip || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, zip: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '2rem' }}>
                      <h4 style={{ margin: '0 0 1rem', fontWeight: 600 }}>Emergency Contact</h4>
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="form-label">Name</label>
                          <input
                            type="text"
                            className="form-input"
                            value={editForm.emergencyContactName || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, emergencyContactName: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Relationship</label>
                          <input
                            type="text"
                            className="form-input"
                            value={editForm.emergencyContactRelationship || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, emergencyContactRelationship: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Phone</label>
                          <input
                            type="tel"
                            className="form-input"
                            value={editForm.emergencyContactPhone || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, emergencyContactPhone: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="info-grid">
                      <div className="info-item">
                        <span className="info-label">Email</span>
                        <span className="info-value">{profile?.email || 'Not set'}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Phone</span>
                        <span className={`info-value ${!profile?.phone ? 'empty' : ''}`}>
                          {profile?.phone || 'Not set'}
                        </span>
                      </div>
                      <div className="info-item" style={{ gridColumn: 'span 2' }}>
                        <span className="info-label">Address</span>
                        <span className={`info-value ${!profile?.address ? 'empty' : ''}`}>
                          {profile?.address
                            ? `${profile.address}${profile.city ? `, ${profile.city}` : ''}${profile.state ? `, ${profile.state}` : ''} ${profile.zip || ''}`
                            : 'Not set'}
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                      <h4 style={{ margin: '0 0 1rem', fontWeight: 600, fontSize: '0.875rem', color: '#6b7280', textTransform: 'uppercase' }}>Emergency Contact</h4>
                      <div className="info-grid">
                        <div className="info-item">
                          <span className="info-label">Name</span>
                          <span className={`info-value ${!profile?.emergencyContactName ? 'empty' : ''}`}>
                            {profile?.emergencyContactName || 'Not set'}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Relationship</span>
                          <span className={`info-value ${!profile?.emergencyContactRelationship ? 'empty' : ''}`}>
                            {profile?.emergencyContactRelationship || 'Not set'}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Phone</span>
                          <span className={`info-value ${!profile?.emergencyContactPhone ? 'empty' : ''}`}>
                            {profile?.emergencyContactPhone || 'Not set'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Communication Preferences</h3>
              </div>
              <div className="section-content">
                <div className="preference-item">
                  <div className="preference-info">
                    <h4>Appointment Reminders</h4>
                    <p>Receive email and SMS reminders before appointments</p>
                  </div>
                  <div className="toggle active" />
                </div>
                <div className="preference-item">
                  <div className="preference-info">
                    <h4>Lab Results Notifications</h4>
                    <p>Get notified when new lab results are available</p>
                  </div>
                  <div className="toggle active" />
                </div>
                <div className="preference-item">
                  <div className="preference-info">
                    <h4>Billing Alerts</h4>
                    <p>Receive notifications about new statements and payments</p>
                  </div>
                  <div className="toggle active" />
                </div>
                <div className="preference-item">
                  <div className="preference-info">
                    <h4>Health Tips & Newsletter</h4>
                    <p>Receive skin care tips and practice updates</p>
                  </div>
                  <div className="toggle" />
                </div>
              </div>
            </>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Security Settings</h3>
              </div>
              <div className="section-content">
                <div className="security-item">
                  <div className="security-info">
                    <h4>Password</h4>
                    <p>Last changed: Never</p>
                  </div>
                  <button className="security-action">Change Password</button>
                </div>
                <div className="security-item">
                  <div className="security-info">
                    <h4>Two-Factor Authentication</h4>
                    <p>Add an extra layer of security to your account</p>
                  </div>
                  <button className="security-action">Enable</button>
                </div>
                <div className="security-item">
                  <div className="security-info">
                    <h4>Login History</h4>
                    <p>View your recent login activity</p>
                  </div>
                  <button className="security-action">View History</button>
                </div>
                <div className="security-item">
                  <div className="security-info">
                    <h4>Connected Devices</h4>
                    <p>Manage devices logged into your account</p>
                  </div>
                  <button className="security-action">Manage</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PatientPortalLayout>
  );
}
