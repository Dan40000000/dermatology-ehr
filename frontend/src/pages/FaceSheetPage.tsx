import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  insurance: string;
  allergies: string | null;
  medications: string | null;
  medicalHistory: string | null;
}

interface Appointment {
  id: string;
  scheduledStart: string;
  appointmentType: string;
  provider: string;
  status: string;
}

interface Encounter {
  id: string;
  date: string;
  chiefComplaint: string;
  assessment: string;
  provider: string;
}

export function FaceSheetPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [recentEncounters, setRecentEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFaceSheetData();
  }, [patientId]);

  const loadFaceSheetData = async () => {
    if (!session || !patientId) return;

    try {
      setLoading(true);

      // Load patient data
      const patientRes = await api.get(`/api/patients/${patientId}`, {
        headers: { 'X-Tenant-ID': session.tenantId, Authorization: `Bearer ${session.accessToken}` },
      });
      setPatient(patientRes.data);

      // Load today's appointment if exists
      try {
        const appointmentsRes = await api.get(`/api/appointments`, {
          headers: { 'X-Tenant-ID': session.tenantId, Authorization: `Bearer ${session.accessToken}` },
          params: { patientId, status: 'scheduled,checked_in,in_room,with_provider' },
        });
        if (appointmentsRes.data.length > 0) {
          setAppointment(appointmentsRes.data[0]);
        }
      } catch (err) {
        // No appointment found, that's okay
      }

      // Load recent encounters
      try {
        const encountersRes = await api.get(`/api/encounters`, {
          headers: { 'X-Tenant-ID': session.tenantId, Authorization: `Bearer ${session.accessToken}` },
          params: { patientId, limit: 5 },
        });
        setRecentEncounters(encountersRes.data || []);
      } catch (err) {
        // No encounters found
      }
    } catch (error) {
      console.error('Failed to load face sheet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ animation: 'spin 1s linear infinite', borderRadius: '9999px', height: '3rem', width: '3rem', borderBottom: '2px solid #2563eb', margin: '0 auto 1rem' }}></div>
          <p style={{ color: '#4b5563' }}>Loading face sheet...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#dc2626', fontSize: '1.125rem' }}>Patient not found</p>
          <button
            onClick={() => navigate('/patients')}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#2563eb', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
          >
            Back to Patients
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print Button - Hidden when printing */}
      <div className="no-print" style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50, display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => navigate(`/patients/${patientId}`)}
          style={{ padding: '0.5rem 1rem', background: '#4b5563', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#374151'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#4b5563'}
        >
          Back to Chart
        </button>
        <button
          onClick={handlePrint}
          style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
        >
          <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Face Sheet
        </button>
      </div>

      {/* Face Sheet Content */}
      <div className="face-sheet-container" style={{ maxWidth: '56rem', margin: '0 auto', padding: '2rem', background: 'white' }}>
        {/* Header */}
        <div style={{ borderBottom: '4px solid #2563eb', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827' }}>PATIENT FACE SHEET</h1>
          <p style={{ color: '#4b5563', marginTop: '0.25rem' }}>Dermatology EHR System</p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Printed: {new Date().toLocaleString()}</p>
        </div>

        {/* Patient Demographics */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.75rem', borderBottom: '2px solid #d1d5db', paddingBottom: '0.5rem' }}>
            PATIENT DEMOGRAPHICS
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Name:</p>
              <p style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>{patient.firstName} {patient.lastName}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Date of Birth:</p>
              <p style={{ fontSize: '1.125rem' }}>{new Date(patient.dateOfBirth).toLocaleDateString()} (Age: {calculateAge(patient.dateOfBirth)})</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Phone:</p>
              <p style={{ fontSize: '1.125rem' }}>{patient.phone}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Email:</p>
              <p style={{ fontSize: '1.125rem' }}>{patient.email}</p>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Address:</p>
              <p style={{ fontSize: '1.125rem' }}>{patient.address}</p>
              <p style={{ fontSize: '1.125rem' }}>{patient.city}, {patient.state} {patient.zip}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Insurance:</p>
              <p style={{ fontSize: '1.125rem' }}>{patient.insurance || 'Self-pay'}</p>
            </div>
          </div>
        </div>

        {/* Appointment Info */}
        {appointment && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.75rem', borderBottom: '2px solid #d1d5db', paddingBottom: '0.5rem' }}>
              TODAY'S APPOINTMENT
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Time:</p>
                <p style={{ fontSize: '1.125rem' }}>{new Date(appointment.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Type:</p>
                <p style={{ fontSize: '1.125rem' }}>{appointment.appointmentType}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Provider:</p>
                <p style={{ fontSize: '1.125rem' }}>{appointment.provider}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '600' }}>Status:</p>
                <p style={{ fontSize: '1.125rem', textTransform: 'capitalize' }}>{appointment.status.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Allergies */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626', marginBottom: '0.75rem', borderBottom: '2px solid #fca5a5', paddingBottom: '0.5rem' }}>
            ALLERGIES
          </h2>
          <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '0.25rem', border: '2px solid #fecaca' }}>
            {patient.allergies ? (
              <p style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#7f1d1d' }}>{patient.allergies}</p>
            ) : (
              <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>No known allergies</p>
            )}
          </div>
        </div>

        {/* Current Medications */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.75rem', borderBottom: '2px solid #d1d5db', paddingBottom: '0.5rem' }}>
            CURRENT MEDICATIONS
          </h2>
          <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '0.25rem', border: '1px solid #bfdbfe' }}>
            {patient.medications ? (
              <p style={{ fontSize: '1.125rem' }}>{patient.medications}</p>
            ) : (
              <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>No current medications</p>
            )}
          </div>
        </div>

        {/* Medical History */}
        {patient.medicalHistory && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.75rem', borderBottom: '2px solid #d1d5db', paddingBottom: '0.5rem' }}>
              MEDICAL HISTORY
            </h2>
            <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '0.25rem', border: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: '1.125rem', whiteSpace: 'pre-wrap' }}>{patient.medicalHistory}</p>
            </div>
          </div>
        )}

        {/* Recent Encounters */}
        {recentEncounters.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.75rem', borderBottom: '2px solid #d1d5db', paddingBottom: '0.5rem' }}>
              RECENT VISITS (Last 5)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recentEncounters.map((encounter) => (
                <div key={encounter.id} style={{ border: '1px solid #e5e7eb', padding: '0.75rem', borderRadius: '0.25rem', background: '#f9fafb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <p style={{ fontWeight: '600', color: '#111827' }}>
                      {new Date(encounter.date).toLocaleDateString()}
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>{encounter.provider}</p>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: '600' }}>Chief Complaint:</span> {encounter.chiefComplaint}
                  </p>
                  {encounter.assessment && (
                    <p style={{ fontSize: '0.875rem', color: '#374151' }}>
                      <span style={{ fontWeight: '600' }}>Assessment:</span> {encounter.assessment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clinical Notes Section (Blank for provider to write) */}
        <div style={{ marginBottom: '1.5rem' }} className="page-break-before">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.75rem', borderBottom: '2px solid #d1d5db', paddingBottom: '0.5rem' }}>
            CLINICAL NOTES
          </h2>
          <div style={{ border: '1px solid #d1d5db', borderRadius: '0.25rem', padding: '1rem', minHeight: '16rem', background: 'white' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div>
                <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Chief Complaint:</p>
                <div style={{ borderBottom: '1px solid #d1d5db', paddingBottom: '0.5rem', minHeight: '3rem' }}></div>
              </div>
              <div>
                <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Assessment:</p>
                <div style={{ borderBottom: '1px solid #d1d5db', paddingBottom: '0.5rem', minHeight: '4rem' }}></div>
              </div>
              <div>
                <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Plan:</p>
                <div style={{ borderBottom: '1px solid #d1d5db', paddingBottom: '0.5rem', minHeight: '4rem' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '2px solid #d1d5db', paddingTop: '1rem', marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: '#4b5563' }}>
          <p>This face sheet is for clinical use only and contains confidential patient information.</p>
          <p style={{ marginTop: '0.25rem' }}>HIPAA Protected Health Information - Handle Appropriately</p>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }

          .face-sheet-container {
            max-width: 100% !important;
            padding: 0.5in !important;
            margin: 0 !important;
          }

          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .page-break-before {
            page-break-before: always;
          }

          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </>
  );
}

export default FaceSheetPage;
