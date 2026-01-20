import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton } from '../components/ui';
import { fetchPatient } from '../api';
import {
  PatientAppointmentsList,
  PatientEncountersList,
  PatientInsuranceCard,
  PatientPrescriptionsList,
  PatientBalanceSummary,
  PatientPriorAuthsList,
  PatientBiopsyHistory,
  PatientPhotoGallery,
  PatientBodyMapPreview
} from '../components/patient';
import {
  User,
  Calendar,
  FileText,
  Shield,
  Pill,
  DollarSign,
  FileCheck,
  Microscope,
  Image,
  MapPin,
  Phone,
  Mail,
  MapPinIcon,
  Clock
} from 'lucide-react';

type TabId =
  | 'overview'
  | 'appointments'
  | 'encounters'
  | 'insurance'
  | 'prescriptions'
  | 'balance'
  | 'prior-auths'
  | 'biopsies'
  | 'photos'
  | 'body-map';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: <User size={18} /> },
  { id: 'appointments', label: 'Appointments', icon: <Calendar size={18} /> },
  { id: 'encounters', label: 'Encounters', icon: <FileText size={18} /> },
  { id: 'insurance', label: 'Insurance', icon: <Shield size={18} /> },
  { id: 'prescriptions', label: 'Medications', icon: <Pill size={18} /> },
  { id: 'balance', label: 'Balance', icon: <DollarSign size={18} /> },
  { id: 'prior-auths', label: 'Prior Auths', icon: <FileCheck size={18} /> },
  { id: 'biopsies', label: 'Biopsies', icon: <Microscope size={18} /> },
  { id: 'photos', label: 'Photos', icon: <Image size={18} /> },
  { id: 'body-map', label: 'Body Map', icon: <MapPin size={18} /> },
];

export function PatientDetailPageEnhanced() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showError } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(session!.tenantId, session!.accessToken, patientId!),
    enabled: !!session && !!patientId,
  });

  const patient = data?.patient;

  useEffect(() => {
    if (error) {
      showError('Failed to load patient data');
    }
  }, [error, showError]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const calculateAge = (dob: string | null) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (isLoading) {
    return (
      <div style={{ padding: '2rem' }}>
        <Skeleton variant="card" height={120} />
        <div style={{ marginTop: '1rem' }}>
          <Skeleton variant="card" height={60} />
        </div>
        <Skeleton variant="card" height={400} style={{ marginTop: '1rem' }} />
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <h2 style={{ margin: '0 0 1rem', color: '#111827' }}>Patient Not Found</h2>
          <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
            The requested patient could not be found.
          </p>
          <button
            className="ema-action-btn"
            onClick={() => navigate('/patients')}
          >
            Back to Patients
          </button>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    if (!patientId) return null;

    switch (activeTab) {
      case 'overview':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            <div>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
                Quick Stats
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <PatientInsuranceCard patientId={patientId} />
                <PatientBalanceSummary patientId={patientId} />
              </div>
            </div>
            <div>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
                Recent Activity
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Upcoming Appointments
                  </h4>
                  <PatientAppointmentsList patientId={patientId} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Recent Encounters
                  </h4>
                  <PatientEncountersList patientId={patientId} />
                </div>
              </div>
            </div>
          </div>
        );

      case 'appointments':
        return <PatientAppointmentsList patientId={patientId} />;

      case 'encounters':
        return <PatientEncountersList patientId={patientId} />;

      case 'insurance':
        return <PatientInsuranceCard patientId={patientId} />;

      case 'prescriptions':
        return <PatientPrescriptionsList patientId={patientId} />;

      case 'balance':
        return <PatientBalanceSummary patientId={patientId} />;

      case 'prior-auths':
        return <PatientPriorAuthsList patientId={patientId} />;

      case 'biopsies':
        return <PatientBiopsyHistory patientId={patientId} />;

      case 'photos':
        return <PatientPhotoGallery patientId={patientId} />;

      case 'body-map':
        return <PatientBodyMapPreview patientId={patientId} />;

      default:
        return null;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9fafb'
    }}>
      {/* Patient Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
        color: '#ffffff',
        padding: '2rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Back Button */}
          <button
            onClick={() => navigate('/patients')}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#ffffff',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            ← Back to Patients
          </button>

          {/* Patient Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{
                margin: '0 0 0.75rem',
                fontSize: '2rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <User size={32} />
                {patient.firstName} {patient.lastName}
              </h1>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, auto))',
                gap: '1.5rem',
                fontSize: '0.875rem',
                opacity: 0.95
              }}>
                {patient.dob && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={16} />
                    <div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Age / DOB</div>
                      <div style={{ fontWeight: 600 }}>
                        {calculateAge(patient.dob)} years ({formatDate(patient.dob)})
                      </div>
                    </div>
                  </div>
                )}

                {patient.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Phone size={16} />
                    <div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Phone</div>
                      <div style={{ fontWeight: 600 }}>{patient.phone}</div>
                    </div>
                  </div>
                )}

                {patient.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Mail size={16} />
                    <div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Email</div>
                      <div style={{ fontWeight: 600 }}>{patient.email}</div>
                    </div>
                  </div>
                )}

                {(patient.address || patient.city || patient.state) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapPinIcon size={16} />
                    <div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Address</div>
                      <div style={{ fontWeight: 600 }}>
                        {patient.city}{patient.state && `, ${patient.state}`} {patient.zip}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => navigate(`/patients/${patientId}/encounter/new`)}
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  color: '#1e40af',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
              >
                Start Encounter
              </button>

              <button
                onClick={() => navigate(`/schedule?patientId=${patientId}`)}
                style={{
                  background: 'transparent',
                  border: '2px solid rgba(255, 255, 255, 0.5)',
                  color: '#ffffff',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                }}
              >
                Schedule Appointment
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 2rem',
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto'
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '1rem 1.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                borderBottom: activeTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#374151';
                  e.currentTarget.style.background = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#6b7280';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '2rem'
      }}>
        {renderTabContent()}
      </div>
    </div>
  );
}
