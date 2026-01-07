import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import '../../styles/kiosk.css';

interface PatientData {
  firstName: string;
  lastName: string;
  dob: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '1rem',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  padding: '2rem',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '1.5rem',
};

const sectionStyle: React.CSSProperties = {
  paddingTop: '1rem',
  borderTop: '1px solid #e5e7eb',
  marginTop: '1rem',
};

export function KioskDemographicsReviewPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [editedData, setEditedData] = useState<Partial<PatientData>>({});

  const sessionId = sessionStorage.getItem('kioskSessionId');

  useEffect(() => {
    if (!sessionId) {
      navigate('/kiosk');
      return;
    }

    fetchSessionData();
  }, [sessionId]);

  const fetchSessionData = async () => {
    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}`, {
        headers: {
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session data');
      }

      const data = await response.json();
      setPatientData({
        firstName: data.session.patientFirstName,
        lastName: data.session.patientLastName,
        dob: data.session.dob,
        phone: data.session.phone,
        email: data.session.email,
        address: data.session.address,
        city: data.session.city,
        state: data.session.state,
        zip: data.session.zip,
        emergencyContactName: data.session.emergencyContactName,
        emergencyContactPhone: data.session.emergencyContactPhone,
      });
    } catch (err) {
      setError('Unable to load your information. Please see the front desk.');
      console.error('Error fetching session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeout = () => {
    sessionStorage.clear();
    navigate('/kiosk');
  };

  const handleBack = () => {
    navigate('/kiosk/appointment');
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedData({ ...patientData });
  };

  const handleChange = (field: keyof PatientData, value: string) => {
    setEditedData({ ...editedData, [field]: value });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}/demographics`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify(editedData),
      });

      if (!response.ok) {
        throw new Error('Failed to update demographics');
      }

      navigate('/kiosk/insurance');
    } catch (err) {
      setError('Unable to save changes. Please try again.');
      console.error('Error saving demographics:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    try {
      await fetch(`/api/kiosk/checkin/${sessionId}/demographics`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify({}),
      });
    } catch (err) {
      console.error('Error marking demographics as reviewed:', err);
    }

    navigate('/kiosk/insurance');
  };

  if (loading) {
    return (
      <KioskLayout currentStep={2} totalSteps={6} stepName="Loading..." onTimeout={handleTimeout}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
          <div className="kiosk-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '1.5rem', color: '#4b5563' }}>Loading your information...</p>
        </div>
      </KioskLayout>
    );
  }

  if (!patientData) {
    return null;
  }

  return (
    <KioskLayout currentStep={2} totalSteps={6} stepName="Review Information" onTimeout={handleTimeout}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
          Review Your Information
        </h2>
        <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '2rem' }}>
          Please verify that your contact information is correct.
        </p>

        {!isEditing ? (
          <div style={{ marginBottom: '2rem' }}>
            <div style={gridStyle}>
              <InfoField label="First Name" value={patientData.firstName} />
              <InfoField label="Last Name" value={patientData.lastName} />
              <InfoField label="Date of Birth" value={new Date(patientData.dob).toLocaleDateString()} />
              <InfoField label="Phone" value={patientData.phone || 'Not provided'} />
              <InfoField label="Email" value={patientData.email || 'Not provided'} />
            </div>

            <div style={sectionStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>Address</h3>
              <div style={gridStyle}>
                <InfoField label="Street Address" value={patientData.address || 'Not provided'} />
                <InfoField label="City" value={patientData.city || 'Not provided'} />
                <InfoField label="State" value={patientData.state || 'Not provided'} />
                <InfoField label="ZIP Code" value={patientData.zip || 'Not provided'} />
              </div>
            </div>

            <div style={sectionStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>Emergency Contact</h3>
              <div style={gridStyle}>
                <InfoField label="Name" value={patientData.emergencyContactName || 'Not provided'} />
                <InfoField label="Phone" value={patientData.emergencyContactPhone || 'Not provided'} />
              </div>
            </div>

            <div style={{
              background: '#f3e8ff',
              border: '2px solid #c4b5fd',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              marginTop: '2rem',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '1.25rem', fontWeight: 500, color: '#6b21a8' }}>
                Is this information correct?
              </p>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '2rem' }}>
            <div style={gridStyle}>
              <EditField
                label="Phone"
                value={editedData.phone || ''}
                onChange={(v) => handleChange('phone', v)}
                placeholder="(555) 123-4567"
              />
              <EditField
                label="Email"
                value={editedData.email || ''}
                onChange={(v) => handleChange('email', v)}
                placeholder="your.email@example.com"
              />
            </div>

            <div style={sectionStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>Address</h3>
              <div style={gridStyle}>
                <EditField
                  label="Street Address"
                  value={editedData.address || ''}
                  onChange={(v) => handleChange('address', v)}
                />
                <EditField label="City" value={editedData.city || ''} onChange={(v) => handleChange('city', v)} />
                <EditField label="State" value={editedData.state || ''} onChange={(v) => handleChange('state', v)} />
                <EditField label="ZIP Code" value={editedData.zip || ''} onChange={(v) => handleChange('zip', v)} />
              </div>
            </div>

            <div style={sectionStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>Emergency Contact</h3>
              <div style={gridStyle}>
                <EditField
                  label="Name"
                  value={editedData.emergencyContactName || ''}
                  onChange={(v) => handleChange('emergencyContactName', v)}
                />
                <EditField
                  label="Phone"
                  value={editedData.emergencyContactPhone || ''}
                  onChange={(v) => handleChange('emergencyContactPhone', v)}
                />
              </div>
            </div>
          </div>
        )}

        {error && <div className="kiosk-error">{error}</div>}

        <div className="kiosk-nav-buttons">
          <button onClick={handleBack} className="kiosk-btn-secondary">
            Back
          </button>
          {!isEditing ? (
            <>
              <button
                onClick={handleEdit}
                style={{
                  flex: 1,
                  padding: '1.25rem',
                  fontSize: '1.25rem',
                  fontWeight: 500,
                  color: '#7c3aed',
                  background: '#f3e8ff',
                  border: '2px solid #c4b5fd',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Update Information
              </button>
              <button onClick={handleContinue} className="kiosk-btn-primary" style={{ flex: 1 }}>
                Looks Good
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(false)} className="kiosk-btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="kiosk-btn-primary"
                style={{ flex: 1 }}
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </button>
            </>
          )}
        </div>
      </div>
    </KioskLayout>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', color: '#111827' }}>{value}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="kiosk-form-group">
      <label className="kiosk-form-label">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="kiosk-form-input"
      />
    </div>
  );
}
