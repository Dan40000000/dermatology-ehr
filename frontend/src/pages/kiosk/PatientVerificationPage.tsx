import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import { getKioskHeaders } from '../../utils/kioskContext';
import '../../styles/kiosk.css';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone?: string;
  email?: string;
}

function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function normalizeDateOfBirth(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 8) {
    return null;
  }

  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }

  const candidate = new Date(year, month - 1, day);
  if (
    Number.isNaN(candidate.getTime())
    || candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

async function parseResponseJson(response: Response): Promise<any | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
      const trimmedLastName = lastName.trim();
      const body: any = { method, lastName: trimmedLastName };

      if (method === 'dob') {
        const normalizedDob = normalizeDateOfBirth(dob);
        if (!normalizedDob) {
          setError('Please enter a complete date of birth');
          setLoading(false);
          return;
        }
        body.dob = normalizedDob;
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

      const headers = await getKioskHeaders();
      const response = await fetch('/api/kiosk/verify-patient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to verify patient. Please see the front desk.');
      }

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
      <KioskLayout currentStep={0} totalSteps={7} stepName="Select Your Profile" onTimeout={handleTimeout}>
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
    <KioskLayout currentStep={0} totalSteps={7} stepName="Find Your Appointment" onTimeout={handleTimeout}>
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
              type="tel"
              value={dob}
              onChange={(e) => setDob(formatDateOfBirthInput(e.target.value))}
              className="kiosk-form-input"
              placeholder="MM/DD/YYYY"
              inputMode="numeric"
              autoComplete="bday"
              enterKeyHint="done"
              maxLength={10}
            />
          </div>
        )}

        {/* Phone Number */}
        {method === 'phone' && (
          <div className="kiosk-form-group">
            <label className="kiosk-form-label">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              className="kiosk-form-input"
              placeholder="Enter your phone number"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
            />
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
