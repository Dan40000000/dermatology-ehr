import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import '../../styles/kiosk.css';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone?: string;
  email?: string;
}

const numberPadStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '0.75rem',
  marginTop: '1.5rem',
};

const numberBtnStyle: React.CSSProperties = {
  padding: '1.5rem',
  fontSize: '1.5rem',
  fontWeight: 600,
  borderRadius: '0.5rem',
  border: 'none',
  cursor: 'pointer',
  background: '#f3f4f6',
  color: '#111827',
  transition: 'background 0.2s',
};

const clearBtnStyle: React.CSSProperties = {
  ...numberBtnStyle,
  background: '#fee2e2',
  color: '#b91c1c',
};

export function KioskPatientVerificationPage() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<'dob' | 'phone' | 'mrn'>('dob');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [mrn, setMrn] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showPatientList, setShowPatientList] = useState(false);

  const handleTimeout = () => {
    navigate('/kiosk');
  };

  const handleBack = () => {
    navigate('/kiosk');
  };

  const verifyPatient = async () => {
    setError('');
    setLoading(true);

    try {
      const body: any = { method, lastName };

      if (method === 'dob') {
        if (!dob) {
          setError('Please enter your date of birth');
          setLoading(false);
          return;
        }
        body.dob = dob;
      } else if (method === 'phone') {
        if (!phone) {
          setError('Please enter your phone number');
          setLoading(false);
          return;
        }
        body.phone = phone;
      } else if (method === 'mrn') {
        if (!mrn) {
          setError('Please enter your medical record number');
          setLoading(false);
          return;
        }
        body.mrn = mrn;
      }

      const response = await fetch('/api/kiosk/verify-patient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Patient not found');
      }

      const data = await response.json();

      if (data.patients && data.patients.length > 0) {
        setPatients(data.patients);
        if (data.patients.length === 1) {
          selectPatient(data.patients[0]);
        } else {
          setShowPatientList(true);
        }
      } else {
        setError('No patient found with the provided information. Please try again or see the front desk.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectPatient = (patient: Patient) => {
    sessionStorage.setItem('kioskPatientId', patient.id);
    sessionStorage.setItem('kioskPatientName', `${patient.firstName} ${patient.lastName}`);
    navigate('/kiosk/appointment');
  };

  const NumberPad = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Delete'];

    const handleClick = (btn: string) => {
      if (btn === 'Clear') {
        onChange('');
      } else if (btn === 'Delete') {
        onChange(value.slice(0, -1));
      } else {
        onChange(value + btn);
      }
    };

    return (
      <div style={numberPadStyle}>
        {buttons.map((btn) => (
          <button
            key={btn}
            onClick={() => handleClick(btn)}
            style={btn === 'Clear' || btn === 'Delete' ? clearBtnStyle : numberBtnStyle}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = '0.8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            {btn}
          </button>
        ))}
      </div>
    );
  };

  const cardStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: '1rem',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    padding: '2rem',
  };

  const methodBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '1rem',
    fontSize: '1.125rem',
    fontWeight: 500,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    background: active ? '#7c3aed' : '#f3f4f6',
    color: active ? 'white' : '#374151',
    transition: 'all 0.2s',
  });

  if (showPatientList) {
    return (
      <KioskLayout currentStep={0} totalSteps={6} stepName="Select Your Profile" onTimeout={handleTimeout}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>
            Select Your Profile
          </h2>
          <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '2rem' }}>
            We found multiple patients with that information. Please select your profile:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => selectPatient(patient)}
                style={{
                  width: '100%',
                  padding: '1.5rem',
                  background: '#f9fafb',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#f5f3ff';
                  e.currentTarget.style.borderColor = '#a78bfa';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111827' }}>
                  {patient.firstName} {patient.lastName}
                </div>
                <div style={{ fontSize: '1.125rem', color: '#4b5563', marginTop: '0.5rem' }}>
                  DOB: {new Date(patient.dob).toLocaleDateString()}
                </div>
                {patient.phone && (
                  <div style={{ fontSize: '1.125rem', color: '#4b5563' }}>Phone: {patient.phone}</div>
                )}
              </button>
            ))}
          </div>

          <button onClick={() => setShowPatientList(false)} className="kiosk-btn-secondary" style={{ width: '100%', marginTop: '2rem' }}>
            Go Back
          </button>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={0} totalSteps={6} stepName="Find Your Appointment" onTimeout={handleTimeout}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>
          Find Your Appointment
        </h2>
        <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '2rem' }}>
          Please provide your information to check in for your appointment.
        </p>

        {/* Method selection */}
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '1.125rem', fontWeight: 500, color: '#374151', marginBottom: '1rem' }}>
            How would you like to verify?
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <button onClick={() => setMethod('dob')} style={methodBtnStyle(method === 'dob')}>
              Date of Birth
            </button>
            <button onClick={() => setMethod('phone')} style={methodBtnStyle(method === 'phone')}>
              Phone Number
            </button>
            <button onClick={() => setMethod('mrn')} style={methodBtnStyle(method === 'mrn')}>
              MRN
            </button>
          </div>
        </div>

        {/* Last Name */}
        {(method === 'dob' || method === 'phone') && (
          <div className="kiosk-form-group">
            <label className="kiosk-form-label">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="kiosk-form-input"
              placeholder="Enter your last name"
            />
          </div>
        )}

        {/* Date of Birth */}
        {method === 'dob' && (
          <div className="kiosk-form-group">
            <label className="kiosk-form-label">Date of Birth (MM/DD/YYYY)</label>
            <input
              type="text"
              value={dob}
              readOnly
              className="kiosk-form-input"
              placeholder="MM/DD/YYYY"
              style={{ background: '#f9fafb' }}
            />
            <NumberPad value={dob} onChange={setDob} />
          </div>
        )}

        {/* Phone Number */}
        {method === 'phone' && (
          <div className="kiosk-form-group">
            <label className="kiosk-form-label">Phone Number</label>
            <input
              type="text"
              value={phone}
              readOnly
              className="kiosk-form-input"
              placeholder="Enter your phone number"
              style={{ background: '#f9fafb' }}
            />
            <NumberPad value={phone} onChange={setPhone} />
          </div>
        )}

        {/* MRN */}
        {method === 'mrn' && (
          <div className="kiosk-form-group">
            <label className="kiosk-form-label">Medical Record Number</label>
            <input
              type="text"
              value={mrn}
              onChange={(e) => setMrn(e.target.value)}
              className="kiosk-form-input"
              placeholder="Enter your MRN"
            />
          </div>
        )}

        {/* Error message */}
        {error && <div className="kiosk-error">{error}</div>}

        {/* Action buttons */}
        <div className="kiosk-nav-buttons">
          <button onClick={handleBack} className="kiosk-btn-secondary">
            Back
          </button>
          <button
            onClick={verifyPatient}
            disabled={loading || (!lastName && method !== 'mrn')}
            className="kiosk-btn-primary"
            style={{ flex: 1 }}
          >
            {loading ? 'Searching...' : 'Continue'}
          </button>
        </div>
      </div>
    </KioskLayout>
  );
}
