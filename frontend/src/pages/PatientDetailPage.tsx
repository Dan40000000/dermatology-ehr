import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { PatientBanner, BodyMap } from '../components/clinical';
import { ClinicalTrendsTab } from '../components/clinical/ClinicalTrendsTab';
import type { Lesion } from '../components/clinical';
import { TasksTab } from '../components/patient';
import { RxHistoryTab } from '../components/RxHistoryTab';
import {
  fetchPatient,
  fetchEncounters,
  fetchAppointments,
  fetchDocuments,
  fetchPhotos,
  fetchPrescriptionsEnhanced,
  fetchTasks,
  API_BASE_URL,
  TENANT_HEADER_NAME,
} from '../api';
import type { Patient, Encounter, Appointment, Document, Photo, Prescription, Task } from '../types';

type TabId = 'overview' | 'demographics' | 'insurance' | 'medical-history' | 'clinical-trends' | 'encounters' | 'appointments' | 'documents' | 'photos' | 'timeline' | 'rx-history' | 'tasks';

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [bodyMapView, setBodyMapView] = useState<'anterior' | 'posterior'>('anterior');
  const [showFaceSheet, setShowFaceSheet] = useState(false);

  // Modal states
  const [editDemographicsOpen, setEditDemographicsOpen] = useState(false);
  const [editInsuranceOpen, setEditInsuranceOpen] = useState(false);
  const [editAllergyOpen, setEditAllergyOpen] = useState(false);
  const [editMedicationOpen, setEditMedicationOpen] = useState(false);
  const [editProblemOpen, setEditProblemOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Mock lesions for demo
  const [lesions] = useState<Lesion[]>([
    {
      id: '1',
      regionId: 'face',
      x: 220,
      y: 120,
      type: 'primary',
      description: 'Actinic keratosis',
      dateAdded: new Date().toISOString(),
    },
    {
      id: '2',
      regionId: 'upper-arm-left',
      x: 305,
      y: 270,
      type: 'secondary',
      description: 'Seborrheic keratosis',
      dateAdded: new Date().toISOString(),
    },
  ]);

  const loadPatientData = useCallback(async () => {
    if (!session || !patientId) return;

    setLoading(true);
    try {
      // Core data fetches - these must succeed
      const [patientRes, encountersRes, appointmentsRes, documentsRes, photosRes, tasksRes] = await Promise.all([
        fetchPatient(session.tenantId, session.accessToken, patientId),
        fetchEncounters(session.tenantId, session.accessToken),
        fetchAppointments(session.tenantId, session.accessToken, patientId),
        fetchDocuments(session.tenantId, session.accessToken),
        fetchPhotos(session.tenantId, session.accessToken),
        fetchTasks(session.tenantId, session.accessToken),
      ]);

      if (patientRes.patient) {
        setPatient(patientRes.patient);
      } else {
        showError('Patient not found');
        navigate('/patients');
        return;
      }

      setEncounters(
        (encountersRes.encounters || []).filter((e: Encounter) => e.patientId === patientId)
      );
      // Appointments are already filtered by patientId at the API level
      setAppointments(appointmentsRes.appointments || []);
      setDocuments(
        (documentsRes.documents || []).filter((d: Document) => d.patientId === patientId)
      );
      setPhotos(
        (photosRes.photos || []).filter((p: Photo) => p.patientId === patientId)
      );
      setTasks(
        (tasksRes.tasks || []).filter((t: Task) => t.patientId === patientId)
      );

      // Optional prescriptions fetch - don't fail the page load if this fails
      try {
        const prescriptionsRes = await fetchPrescriptionsEnhanced(session.tenantId, session.accessToken, { patientId });
        setPrescriptions(prescriptionsRes.prescriptions || []);
      } catch (rxErr) {
        console.warn('Failed to load prescriptions:', rxErr);
        setPrescriptions([]);
      }
    } catch (err: any) {
      if (err.message === 'Patient not found') {
        showError('Patient not found');
        navigate('/patients');
        return;
      }
      showError(err.message || 'Failed to load patient data');
    } finally {
      setLoading(false);
    }
  }, [session, patientId, showError, navigate]);

  const nextAppointment = appointments
    .filter((a) => a.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())[0];

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  const handleStartEncounter = () => {
    navigate(`/patients/${patientId}/encounter/new`);
  };

  const handleViewEncounter = (encounterId: string) => {
    navigate(`/patients/${patientId}/encounter/${encounterId}`);
  };

  if (loading) {
    return (
      <div className="patient-detail-page">
        <Skeleton variant="card" height={140} />
        <div style={{ marginTop: '1rem' }}>
          <Skeleton variant="card" height={40} />
        </div>
        <Skeleton variant="card" height={300} />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="patient-detail-page">
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#374151', marginBottom: '0.5rem' }}>Patient Not Found</h3>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>The requested patient could not be found.</p>
          <button
            type="button"
            className="ema-action-btn"
            onClick={() => navigate('/patients')}
          >
            Back to Patients
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: string; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: '' },
    { id: 'demographics', label: 'Demographics', icon: '' },
    { id: 'insurance', label: 'Insurance', icon: '' },
    { id: 'medical-history', label: 'Medical History', icon: '' },
    { id: 'clinical-trends', label: 'Clinical Trends', icon: '📊' },
    { id: 'encounters', label: 'Encounters', icon: '', count: encounters.length },
    { id: 'appointments', label: 'Appointments', icon: '', count: appointments.length },
    { id: 'rx-history', label: 'Rx History', icon: '', count: prescriptions.length },
    { id: 'documents', label: 'Documents', icon: '', count: documents.length },
    { id: 'photos', label: 'Photos', icon: '', count: photos.length },
    { id: 'tasks', label: 'Tasks', icon: '✓', count: tasks.filter(t => t.status !== 'completed').length },
    { id: 'timeline', label: 'Timeline', icon: '', count: encounters.length + appointments.length + documents.length + photos.length },
  ];

  return (
    <div className="patient-detail-page">
      {/* Patient Banner */}
      <PatientBanner
        patient={patient}
        onStartEncounter={handleStartEncounter}
      />

      {/* Action Bar */}
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => navigate('/patients')}>
          <span className="icon">←</span>
          Back to Patients
        </button>
        <button type="button" className="ema-action-btn" onClick={handleStartEncounter}>
          <span className="icon">+</span>
          New Encounter
        </button>
        <button type="button" className="ema-action-btn" onClick={() => navigate('/schedule')}>
          <span className="icon"></span>
          Schedule Appt
        </button>
        <button type="button" className="ema-action-btn" onClick={() => setShowFaceSheet(true)}>
          <span className="icon"></span>
          Face Sheet
        </button>
        <button type="button" className="ema-action-btn">
          <span className="icon"></span>
          Prescriptions
        </button>
        <button type="button" className="ema-action-btn" onClick={loadPatientData}>
          <span className="icon"></span>
          Refresh
        </button>
      </div>

      {/* Section Header */}
      <div className="ema-section-header">
        Patient Chart - {patient.lastName}, {patient.firstName}
      </div>

      {/* Tabs - EMA Style */}
      <div style={{
        display: 'flex',
        background: '#f3f4f6',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.75rem 1.5rem',
              background: activeTab === tab.id ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #0369a1' : '3px solid transparent',
              color: activeTab === tab.id ? '#0369a1' : '#6b7280',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? '#0369a1' : '#9ca3af',
                color: '#ffffff',
                padding: '0.125rem 0.5rem',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ background: '#ffffff', padding: '1.5rem' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Body Map Section */}
            <div>
              <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                Body Map - Lesion Locations
              </div>
              <div style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setBodyMapView('anterior')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: bodyMapView === 'anterior' ? '#0369a1' : '#f3f4f6',
                      color: bodyMapView === 'anterior' ? '#ffffff' : '#374151',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyMapView('posterior')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: bodyMapView === 'posterior' ? '#0369a1' : '#f3f4f6',
                      color: bodyMapView === 'posterior' ? '#ffffff' : '#374151',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Posterior
                  </button>
                </div>
                <BodyMap
                  view={bodyMapView}
                  lesions={lesions}
                  onLesionClick={(lesion) => {
                  }}
                />
              </div>

              {/* Lesion Legend */}
              <div style={{
                display: 'flex',
                gap: '1.5rem',
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#f9fafb',
                borderRadius: '8px',
                fontSize: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#dc2626' }} />
                  <span>Primary (Active)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
                  <span>Secondary</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                  <span>Healed</span>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Vitals Summary */}
              <div>
                <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                  Latest Vitals
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.75rem'
                }}>
                  {[
                    { label: 'BP', value: '120/80', unit: 'mmHg' },
                    { label: 'Pulse', value: '72', unit: 'bpm' },
                    { label: 'Temp', value: '98.6', unit: '°F' },
                    { label: 'Weight', value: '165', unit: 'lbs' },
                  ].map((vital) => (
                    <div
                      key={vital.label}
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #10b981',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 500 }}>
                        {vital.label}
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#047857' }}>
                        {vital.value}
                      </div>
                      <div style={{ fontSize: '0.625rem', color: '#6b7280' }}>
                        {vital.unit}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Last recorded: {new Date().toLocaleDateString()}
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                  Recent Activity
                </div>
                {encounters.length === 0 && appointments.length === 0 ? (
                  <div style={{
                    background: '#f9fafb',
                    border: '1px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#6b7280'
                  }}>
                    No recent activity
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {encounters.slice(0, 3).map((enc) => (
                      <div
                        key={enc.id}
                        onClick={() => handleViewEncounter(enc.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '1.25rem' }}></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                            Encounter - {enc.status}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {new Date(enc.createdAt).toLocaleDateString()}
                          </div>
                          {enc.chiefComplaint && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              CC: {enc.chiefComplaint}
                            </div>
                          )}
                        </div>
                        <span style={{ color: '#9ca3af' }}>→</span>
                      </div>
                    ))}
                    {appointments.slice(0, 3).map((appt) => (
                      <div
                        key={appt.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}
                      >
                        <span style={{ fontSize: '1.25rem' }}></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                            {appt.appointmentTypeName || 'Appointment'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {new Date(appt.scheduledStart).toLocaleString()}
                          </div>
                        </div>
                        <span className={`ema-status ${appt.status === 'completed' ? 'established' : 'pending'}`}>
                          {appt.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div>
                <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                  Quick Actions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { label: 'New Encounter', icon: '', onClick: handleStartEncounter },
                    { label: 'Schedule', icon: '', onClick: () => navigate('/schedule') },
                    { label: 'Message', icon: '', onClick: () => navigate('/mail') },
                    { label: 'Documents', icon: '', onClick: () => setActiveTab('documents') },
                    { label: 'Photos', icon: '', onClick: () => setActiveTab('photos') },
                    { label: 'Insurance', icon: '', onClick: () => setActiveTab('insurance') },
                  ].map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      style={{
                        padding: '0.75rem',
                        background: '#f3f4f6',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <span style={{ fontSize: '1.25rem' }}>{action.icon}</span>
                      <span style={{ fontSize: '0.75rem', color: '#374151' }}>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'encounters' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="ema-section-header">Encounters</div>
              <button type="button" className="ema-action-btn" onClick={handleStartEncounter}>
                <span className="icon">+</span>
                New Encounter
              </button>
            </div>

            {encounters.length === 0 ? (
              <div style={{
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
                <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No encounters yet</h3>
                <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Start the first encounter for this patient</p>
                <button type="button" className="ema-action-btn" onClick={handleStartEncounter}>
                  Start Encounter
                </button>
              </div>
            ) : (
              <table className="ema-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Chief Complaint</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Assessment/Plan</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {encounters.map((enc) => (
                    <tr key={enc.id} onClick={() => handleViewEncounter(enc.id)} style={{ cursor: 'pointer' }}>
                      <td>{new Date(enc.createdAt).toLocaleDateString()}</td>
                      <td>{enc.chiefComplaint || '—'}</td>
                      <td>{(enc as any).providerName || 'Unknown'}</td>
                      <td>
                        <span className={`ema-status ${enc.status === 'signed' ? 'established' : enc.status === 'draft' ? 'pending' : 'inactive'}`}>
                          {enc.status}
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {enc.assessmentPlan || '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewEncounter(enc.id);
                          }}
                          style={{
                            padding: '0.25rem 0.75rem',
                            background: '#0369a1',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'appointments' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="ema-section-header">Appointments</div>
              <button type="button" className="ema-action-btn" onClick={() => navigate('/schedule')}>
                <span className="icon">+</span>
                Schedule
              </button>
            </div>

            {appointments.length === 0 ? (
              <div style={{
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
                <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No appointments</h3>
                <p style={{ color: '#6b7280', margin: 0 }}>Schedule an appointment for this patient</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1rem',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{
                      background: '#0369a1',
                      color: '#ffffff',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                      minWidth: '60px'
                    }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                        {new Date(appt.scheduledStart).getDate()}
                      </div>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        {new Date(appt.scheduledStart).toLocaleDateString(undefined, { month: 'short' })}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{appt.appointmentTypeName}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {new Date(appt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {appt.providerName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{appt.locationName}</div>
                    </div>
                    <span className={`ema-status ${appt.status === 'completed' ? 'established' : appt.status === 'scheduled' ? 'pending' : 'inactive'}`}>
                      {appt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'demographics' && (
          <DemographicsTab patient={patient} onEdit={() => setEditDemographicsOpen(true)} />
        )}

        {activeTab === 'insurance' && (
          <InsuranceTab patient={patient} onEdit={() => setEditInsuranceOpen(true)} />
        )}

        {activeTab === 'medical-history' && (
          <MedicalHistoryTab
            patient={patient}
            onEditAllergy={() => setEditAllergyOpen(true)}
            onEditMedication={() => setEditMedicationOpen(true)}
            onEditProblem={() => setEditProblemOpen(true)}
          />
        )}

        {activeTab === 'clinical-trends' && (
          <ClinicalTrendsTab patientId={patientId!} />
        )}

        {activeTab === 'documents' && (
          <DocumentsTab
            documents={documents}
            onUpload={() => alert('Document upload feature coming soon')}
          />
        )}

        {activeTab === 'photos' && (
          <PhotosTab
            photos={photos}
            onUpload={() => alert('Photo upload feature coming soon')}
            onView={(photo) => setSelectedPhoto(photo)}
          />
        )}

        {activeTab === 'rx-history' && (
          <RxHistoryTab
            prescriptions={prescriptions}
            onRefresh={loadPatientData}
          />
        )}

        {activeTab === 'tasks' && patientId && (
          <TasksTab patientId={patientId} />
        )}

        {activeTab === 'timeline' && (
          <TimelineTab
            patient={patient}
            encounters={encounters}
            appointments={appointments}
            documents={documents}
            photos={photos}
          />
        )}
      </div>

      <Modal
        isOpen={showFaceSheet}
        onClose={() => setShowFaceSheet(false)}
        title="Face Sheet"
        size="lg"
      >
        {patient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>{patient.lastName}, {patient.firstName}</h3>
                <p style={{ margin: '0.25rem 0', color: '#4b5563' }}>{patient.dob ? new Date(patient.dob).toLocaleDateString() : 'DOB: N/A'} • {patient.sex || 'Sex: N/A'}</p>
                <p style={{ margin: '0.25rem 0', color: '#6b7280' }}>{patient.phone || 'No phone'} • {patient.email || 'No email'}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn secondary" onClick={() => setShowFaceSheet(false)}>Close</button>
                <button type="button" className="btn primary" onClick={() => window.print()}>Print</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Address</h4>
                <p style={{ margin: 0 }}>{patient.address || 'N/A'}</p>
                <p style={{ margin: 0 }}>{[patient.city, patient.state, patient.zip].filter(Boolean).join(', ')}</p>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Insurance</h4>
                {patient.insurance ? (
                  typeof patient.insurance === 'object' && patient.insurance.planName ? (
                    <>
                      <p style={{ margin: 0 }}>{patient.insurance.planName}</p>
                      <p style={{ margin: 0 }}>Member: {patient.insurance.memberId}</p>
                      {patient.insurance.groupNumber && <p style={{ margin: 0 }}>Group: {patient.insurance.groupNumber}</p>}
                    </>
                  ) : (
                    <p style={{ margin: 0 }}>{typeof patient.insurance === 'string' ? patient.insurance : 'On file'}</p>
                  )
                ) : (
                  <p style={{ margin: 0 }}>No insurance on file</p>
                )}
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Allergies</h4>
                <p style={{ margin: 0 }}>
                  {Array.isArray(patient.allergies) && patient.allergies.length > 0
                    ? patient.allergies.join(', ')
                    : typeof patient.allergies === 'string' && patient.allergies.trim() !== ''
                      ? patient.allergies
                      : 'None reported'}
                </p>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Medications</h4>
                <p style={{ margin: 0 }}>{patient.medications || 'None on file'}</p>
              </div>
            </div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Next Appointment</h4>
              {nextAppointment ? (
                <p style={{ margin: 0 }}>
                  {new Date(nextAppointment.scheduledStart).toLocaleString()} with {nextAppointment.providerName || 'Provider'}
                  {nextAppointment.locationName ? ` @ ${nextAppointment.locationName}` : ''}
                </p>
              ) : (
                <p style={{ margin: 0 }}>No upcoming appointment.</p>
              )}
            </div>
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </Modal>

      {/* Edit Modals */}
      <EditDemographicsModal
        isOpen={editDemographicsOpen}
        onClose={() => setEditDemographicsOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditInsuranceModal
        isOpen={editInsuranceOpen}
        onClose={() => setEditInsuranceOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditAllergyModal
        isOpen={editAllergyOpen}
        onClose={() => setEditAllergyOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditMedicationModal
        isOpen={editMedicationOpen}
        onClose={() => setEditMedicationOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditProblemModal
        isOpen={editProblemOpen}
        onClose={() => setEditProblemOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      {selectedPhoto && (
        <Modal isOpen={true} onClose={() => setSelectedPhoto(null)} size="lg" title="Photo Viewer">
          <div style={{ textAlign: 'center' }}>
            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.description || 'Patient photo'}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
            {selectedPhoto.description && (
              <p style={{ marginTop: '1rem', color: '#6b7280' }}>{selectedPhoto.description}</p>
            )}
            {selectedPhoto.bodyLocation && (
              <p style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                Location: {selectedPhoto.bodyLocation}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Demographics Tab Component
function DemographicsTab({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  const calculateAge = (dob?: string) => {
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

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Patient Demographics</div>
        <button type="button" className="ema-action-btn" onClick={onEdit}>
          <span className="icon"></span>
          Edit Demographics
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Personal Information */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Personal Information
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Full Name" value={`${patient.firstName} ${patient.lastName}`} />
            <InfoRow label="Date of Birth" value={patient.dob ? new Date(patient.dob).toLocaleDateString() : 'Not provided'} />
            <InfoRow label="Age" value={calculateAge(patient.dob)} />
            <InfoRow label="Sex" value={(patient as any).sex || 'Not specified'} />
            <InfoRow label="MRN" value={patient.mrn || 'Not assigned'} />
            <InfoRow label="SSN" value={(patient as any).ssn || 'Not provided'} />
          </div>
        </div>

        {/* Contact Information */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Contact Information
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Phone" value={patient.phone || 'Not provided'} />
            <InfoRow label="Email" value={patient.email || 'Not provided'} />
            <InfoRow
              label="Address"
              value={patient.address ? `${patient.address}${patient.city ? `, ${patient.city}` : ''}${patient.state ? `, ${patient.state}` : ''}${patient.zip ? ` ${patient.zip}` : ''}` : 'Not provided'}
            />
          </div>
        </div>

        {/* Emergency Contact */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Emergency Contact
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Name" value={(patient as any).emergencyContactName || 'Not provided'} />
            <InfoRow label="Relationship" value={(patient as any).emergencyContactRelationship || 'Not provided'} />
            <InfoRow label="Phone" value={(patient as any).emergencyContactPhone || 'Not provided'} />
          </div>
        </div>

        {/* Preferred Pharmacy */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Preferred Pharmacy
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Pharmacy Name" value={(patient as any).pharmacyName || 'Not specified'} />
            <InfoRow label="Phone" value={(patient as any).pharmacyPhone || 'Not provided'} />
            <InfoRow label="Address" value={(patient as any).pharmacyAddress || 'Not provided'} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Insurance Tab Component
function InsuranceTab({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  // Use patient's direct insurance fields, falling back to insuranceDetails for legacy data
  const insuranceDetails = (patient as any).insuranceDetails || {};
  const insuranceData = {
    primaryCarrier: (patient as any).insurance || insuranceDetails.primaryCarrier,
    primaryPolicyNumber: (patient as any).insuranceId || insuranceDetails.primaryPolicyNumber,
    primaryGroupNumber: (patient as any).insuranceGroupNumber || insuranceDetails.primaryGroupNumber,
    primarySubscriberName: insuranceDetails.primarySubscriberName,
    primaryRelationship: insuranceDetails.primaryRelationship,
    primaryEffectiveDate: insuranceDetails.primaryEffectiveDate,
    secondaryCarrier: insuranceDetails.secondaryCarrier,
    secondaryPolicyNumber: insuranceDetails.secondaryPolicyNumber,
    secondaryGroupNumber: insuranceDetails.secondaryGroupNumber,
    secondarySubscriberName: insuranceDetails.secondarySubscriberName,
    secondaryRelationship: insuranceDetails.secondaryRelationship,
    secondaryEffectiveDate: insuranceDetails.secondaryEffectiveDate,
    cardFrontUrl: insuranceDetails.cardFrontUrl,
    cardBackUrl: insuranceDetails.cardBackUrl,
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Insurance Information</div>
        <button type="button" className="ema-action-btn" onClick={onEdit}>
          <span className="icon"></span>
          Edit Insurance
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Primary Insurance */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#0369a1', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>PRIMARY</span>
            Primary Insurance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <InfoRow label="Insurance Carrier" value={insuranceData.primaryCarrier || 'Not provided'} />
            <InfoRow label="Policy Number" value={insuranceData.primaryPolicyNumber || 'Not provided'} />
            <InfoRow label="Group Number" value={insuranceData.primaryGroupNumber || 'Not provided'} />
            <InfoRow label="Subscriber Name" value={insuranceData.primarySubscriberName || patient.firstName + ' ' + patient.lastName} />
            <InfoRow label="Relationship" value={insuranceData.primaryRelationship || 'Self'} />
            <InfoRow label="Effective Date" value={insuranceData.primaryEffectiveDate ? new Date(insuranceData.primaryEffectiveDate).toLocaleDateString() : 'Not provided'} />
          </div>
        </div>

        {/* Secondary Insurance */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#6b7280', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>SECONDARY</span>
            Secondary Insurance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <InfoRow label="Insurance Carrier" value={insuranceData.secondaryCarrier || 'Not provided'} />
            <InfoRow label="Policy Number" value={insuranceData.secondaryPolicyNumber || 'Not provided'} />
            <InfoRow label="Group Number" value={insuranceData.secondaryGroupNumber || 'Not provided'} />
            <InfoRow label="Subscriber Name" value={insuranceData.secondarySubscriberName || 'Not provided'} />
            <InfoRow label="Relationship" value={insuranceData.secondaryRelationship || 'Not provided'} />
            <InfoRow label="Effective Date" value={insuranceData.secondaryEffectiveDate ? new Date(insuranceData.secondaryEffectiveDate).toLocaleDateString() : 'Not provided'} />
          </div>
        </div>

        {/* Insurance Card Images */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Insurance Card Images
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Front</p>
              {insuranceData.cardFrontUrl ? (
                <img src={insuranceData.cardFrontUrl} alt="Insurance card front" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
              ) : (
                <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                  No image uploaded
                </div>
              )}
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Back</p>
              {insuranceData.cardBackUrl ? (
                <img src={insuranceData.cardBackUrl} alt="Insurance card back" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
              ) : (
                <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                  No image uploaded
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Eligibility Check */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="ema-action-btn" onClick={() => alert('Eligibility check feature coming soon')}>
            <span className="icon"></span>
            Check Eligibility
          </button>
          <button type="button" className="ema-action-btn" onClick={() => alert('Benefits verification feature coming soon')}>
            <span className="icon"></span>
            Verify Benefits
          </button>
        </div>
      </div>
    </div>
  );
}

// Medical History Tab Component
function MedicalHistoryTab({
  patient,
  onEditAllergy,
  onEditMedication,
  onEditProblem
}: {
  patient: Patient;
  onEditAllergy: () => void;
  onEditMedication: () => void;
  onEditProblem: () => void;
}) {
  // Use actual patient data - no mock fallbacks for new patients
  const allergies = (patient as any).allergiesList || [];

  const medications = (patient as any).medicationsList || [];

  const problems = (patient as any).problemsList || [];

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div className="ema-section-header" style={{ marginBottom: '1.5rem' }}>Medical History</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Allergies */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Allergies
            </h3>
            <button type="button" className="ema-action-btn" onClick={onEditAllergy}>
              <span className="icon">+</span>
              Add Allergy
            </button>
          </div>
          {allergies.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No known allergies</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allergies.map((allergy: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: allergy.severity === 'severe' ? '#fef2f2' : allergy.severity === 'moderate' ? '#fef3c7' : '#f0fdf4',
                    color: allergy.severity === 'severe' ? '#dc2626' : allergy.severity === 'moderate' ? '#f59e0b' : '#10b981',
                    textTransform: 'uppercase'
                  }}>
                    {allergy.severity}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{allergy.name}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Reaction: {allergy.reaction}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Medications */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Current Medications
            </h3>
            <button type="button" className="ema-action-btn" onClick={onEditMedication}>
              <span className="icon">+</span>
              Add Medication
            </button>
          </div>
          {medications.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No current medications</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {medications.map((med: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                  <span style={{ fontSize: '1.25rem' }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{med.name}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {med.dosage} • Prescribed: {new Date(med.prescribedDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Problem List */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Problem List
            </h3>
            <button type="button" className="ema-action-btn" onClick={onEditProblem}>
              <span className="icon">+</span>
              Add Problem
            </button>
          </div>
          {problems.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No problems recorded</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {problems.map((problem: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 500 }}>{problem.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>({problem.icdCode})</span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Onset: {new Date(problem.onsetDate).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: problem.status === 'Active' ? '#dbeafe' : '#f3f4f6',
                    color: problem.status === 'Active' ? '#0369a1' : '#6b7280'
                  }}>
                    {problem.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Past Medical History */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Past Medical History
          </h3>
          <p style={{ color: '#6b7280', margin: 0 }}>{(patient as any).pastMedicalHistory || 'No significant past medical history recorded'}</p>
        </div>

        {/* Family History */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Family History
          </h3>
          <p style={{ color: '#6b7280', margin: 0 }}>{(patient as any).familyHistory || 'No family history recorded'}</p>
        </div>

        {/* Social History */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Social History
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <InfoRow label="Smoking Status" value={(patient as any).smokingStatus || 'Not assessed'} />
            <InfoRow label="Alcohol Use" value={(patient as any).alcoholUse || 'Not assessed'} />
            <InfoRow label="Exercise" value={(patient as any).exerciseFrequency || 'Not assessed'} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({
  documents,
  onUpload
}: {
  documents: Document[];
  onUpload: () => void;
}) {
  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Documents</div>
        <button type="button" className="ema-action-btn" onClick={onUpload}>
          <span className="icon"></span>
          Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No documents</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Upload documents for this patient</p>
          <button type="button" className="ema-action-btn" onClick={onUpload}>
            Upload Document
          </button>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Date Uploaded</th>
              <th>Uploaded By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span></span>
                    <span>{doc.title}</span>
                  </div>
                </td>
                <td>{doc.category || 'General'}</td>
                <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
                <td>{(doc as any).uploadedBy || 'System'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => window.open(doc.url, '_blank')}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: '#0369a1',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = doc.url;
                        link.download = doc.filename || 'document';
                        link.click();
                      }}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: '#6b7280',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Download
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Photos Tab Component
function PhotosTab({
  photos,
  onUpload,
  onView
}: {
  photos: Photo[];
  onUpload: () => void;
  onView: (photo: Photo) => void;
}) {
  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Clinical Photos</div>
        <button type="button" className="ema-action-btn" onClick={onUpload}>
          <span className="icon"></span>
          Upload Photo
        </button>
      </div>

      {photos.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No photos</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Upload clinical photos for this patient</p>
          <button type="button" className="ema-action-btn" onClick={onUpload}>
            Upload Photo
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {photos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => onView(photo)}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#f3f4f6' }}>
                <img
                  src={photo.url}
                  alt={photo.description || 'Patient photo'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  {photo.bodyLocation || 'Unknown location'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {new Date(photo.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper component for displaying info rows
function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>{value}</div>
    </div>
  );
}

// Edit Demographics Modal
function EditDemographicsModal({
  isOpen,
  onClose,
  patient,
  onSave,
  session
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onSave: () => void;
  session: any;
}) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    sex: '',
    ssn: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: '',
    pharmacyName: '',
    pharmacyPhone: '',
    pharmacyAddress: '',
  });

  useEffect(() => {
    if (patient && isOpen) {
      setFormData({
        firstName: patient.firstName || '',
        lastName: patient.lastName || '',
        dob: patient.dob || '',
        sex: (patient as any).sex || '',
        ssn: (patient as any).ssn || '',
        phone: patient.phone || '',
        email: patient.email || '',
        address: patient.address || '',
        city: patient.city || '',
        state: patient.state || '',
        zip: patient.zip || '',
        emergencyContactName: (patient as any).emergencyContactName || '',
        emergencyContactRelationship: (patient as any).emergencyContactRelationship || '',
        emergencyContactPhone: (patient as any).emergencyContactPhone || '',
        pharmacyName: (patient as any).pharmacyName || '',
        pharmacyPhone: (patient as any).pharmacyPhone || '',
        pharmacyAddress: (patient as any).pharmacyAddress || '',
      });
    }
  }, [patient, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !patient) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/patients/${patient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to update patient');

      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating patient:', error);
      alert('Failed to update patient demographics');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Demographics" size="lg">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              First Name
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Last Name
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Date of Birth
            </label>
            <input
              type="date"
              value={formData.dob}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Sex
            </label>
            <select
              value={formData.sex}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            >
              <option value="">Select...</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Address</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Street Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  State
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  maxLength={2}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  ZIP
                </label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              background: '#0369a1',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Edit Insurance Modal (Stub)
function EditInsuranceModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Insurance" size="lg">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Insurance editing form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Edit Allergy Modal (Stub)
function EditAllergyModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Allergy" size="md">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Allergy form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Edit Medication Modal (Stub)
function EditMedicationModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Medication" size="md">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Medication form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Edit Problem Modal (Stub)
function EditProblemModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Problem" size="md">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Problem form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Timeline Tab Component
interface TimelineEvent {
  id: string;
  type: 'encounter' | 'appointment' | 'document' | 'photo';
  date: string;
  title: string;
  description: string;
  status?: string;
  icon: string;
  iconColor: string;
  data: Encounter | Appointment | Document | Photo;
}

function TimelineTab({
  patient,
  encounters,
  appointments,
  documents,
  photos,
}: {
  patient: Patient;
  encounters: Encounter[];
  appointments: Appointment[];
  documents: Document[];
  photos: Photo[];
}) {
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(
    new Set(['encounter', 'appointment', 'document', 'photo'])
  );

  // Build timeline events from all data sources
  const allEvents: TimelineEvent[] = [
    ...encounters.map((enc): TimelineEvent => ({
      id: `enc-${enc.id}`,
      type: 'encounter',
      date: enc.createdAt,
      title: 'Encounter',
      description: enc.chiefComplaint || 'No chief complaint recorded',
      status: enc.status,
      icon: '🏥',
      iconColor: '#0369a1',
      data: enc,
    })),
    ...appointments.map((appt): TimelineEvent => ({
      id: `appt-${appt.id}`,
      type: 'appointment',
      date: appt.scheduledStart,
      title: appt.appointmentTypeName || 'Appointment',
      description: `${appt.providerName || 'Provider'}${appt.locationName ? ` at ${appt.locationName}` : ''}`,
      status: appt.status,
      icon: '📅',
      iconColor: '#059669',
      data: appt,
    })),
    ...documents.map((doc): TimelineEvent => ({
      id: `doc-${doc.id}`,
      type: 'document',
      date: doc.createdAt,
      title: 'Document Uploaded',
      description: doc.title,
      status: doc.category || 'General',
      icon: '📄',
      iconColor: '#7c3aed',
      data: doc,
    })),
    ...photos.map((photo): TimelineEvent => ({
      id: `photo-${photo.id}`,
      type: 'photo',
      date: photo.createdAt,
      title: 'Photo Uploaded',
      description: photo.description || photo.bodyLocation || 'Clinical photo',
      icon: '📷',
      iconColor: '#dc2626',
      data: photo,
    })),
  ];

  // Sort by date (newest first)
  const sortedEvents = allEvents
    .filter((event) => selectedFilters.has(event.type))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const toggleFilter = (filterType: string) => {
    const newFilters = new Set(selectedFilters);
    if (newFilters.has(filterType)) {
      newFilters.delete(filterType);
    } else {
      newFilters.add(filterType);
    }
    setSelectedFilters(newFilters);
  };

  const getStatusBadgeStyle = (status?: string) => {
    if (!status) return { background: '#f3f4f6', color: '#6b7280' };

    const statusLower = status.toLowerCase();
    if (statusLower === 'signed' || statusLower === 'completed') {
      return { background: '#d1fae5', color: '#065f46' };
    }
    if (statusLower === 'draft' || statusLower === 'scheduled' || statusLower === 'pending') {
      return { background: '#dbeafe', color: '#1e40af' };
    }
    if (statusLower === 'cancelled' || statusLower === 'inactive') {
      return { background: '#fee2e2', color: '#991b1b' };
    }
    return { background: '#f3f4f6', color: '#6b7280' };
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const filterButtons = [
    { type: 'encounter', label: 'Encounters', icon: '🏥', color: '#0369a1', count: encounters.length },
    { type: 'appointment', label: 'Appointments', icon: '📅', color: '#059669', count: appointments.length },
    { type: 'document', label: 'Documents', icon: '📄', color: '#7c3aed', count: documents.length },
    { type: 'photo', label: 'Photos', icon: '📷', color: '#dc2626', count: photos.length },
  ];

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div className="ema-section-header" style={{ marginBottom: '1.5rem' }}>
        Patient Timeline
      </div>

      {/* Filter Controls */}
      <div style={{
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
          Filter by Type
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {filterButtons.map((filter) => (
            <button
              key={filter.type}
              type="button"
              onClick={() => toggleFilter(filter.type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: selectedFilters.has(filter.type) ? filter.color : '#ffffff',
                color: selectedFilters.has(filter.type) ? '#ffffff' : '#374151',
                border: `2px solid ${filter.color}`,
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <span>{filter.icon}</span>
              <span>{filter.label}</span>
              <span style={{
                background: selectedFilters.has(filter.type) ? 'rgba(255, 255, 255, 0.3)' : '#f3f4f6',
                color: selectedFilters.has(filter.type) ? '#ffffff' : '#6b7280',
                padding: '0.125rem 0.5rem',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Events */}
      {sortedEvents.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No activity found</h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {selectedFilters.size === 0
              ? 'Select at least one filter to view timeline events'
              : 'No events match the selected filters'}
          </p>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Vertical timeline line */}
          <div style={{
            position: 'absolute',
            left: '24px',
            top: '0',
            bottom: '0',
            width: '2px',
            background: '#e5e7eb'
          }} />

          {/* Timeline events */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sortedEvents.map((event, index) => (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  position: 'relative'
                }}
              >
                {/* Icon with colored circle */}
                <div style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'flex-start',
                  paddingTop: '0.25rem'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: event.iconColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    border: '4px solid #ffffff',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}>
                    {event.icon}
                  </div>
                </div>

                {/* Event content card */}
                <div style={{
                  flex: 1,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  transition: 'box-shadow 0.2s',
                  cursor: event.type === 'encounter' ? 'pointer' : 'default'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                          {event.title}
                        </h3>
                        {event.status && (
                          <span style={{
                            ...getStatusBadgeStyle(event.status),
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'capitalize'
                          }}>
                            {event.status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {formatDate(event.date)}
                      </div>
                    </div>

                    {/* Type badge */}
                    <div style={{
                      padding: '0.25rem 0.5rem',
                      background: event.iconColor,
                      color: '#ffffff',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}>
                      {event.type}
                    </div>
                  </div>

                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                    {event.description}
                  </p>

                  {/* Event-specific details */}
                  {event.type === 'encounter' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Provider: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {(event.data as any).providerName || 'Unknown'}
                          </span>
                        </div>
                        {(event.data as Encounter).assessmentPlan && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <span style={{ color: '#9ca3af' }}>A&P: </span>
                            <span style={{ color: '#374151' }}>
                              {(event.data as Encounter).assessmentPlan}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {event.type === 'appointment' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Time: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {new Date((event.data as Appointment).scheduledStart).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Duration: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {(event.data as Appointment).durationMinutes || 30} min
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {event.type === 'document' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => window.open((event.data as Document).url, '_blank')}
                          style={{
                            padding: '0.375rem 0.75rem',
                            background: '#0369a1',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 500
                          }}
                        >
                          View Document
                        </button>
                      </div>
                    </div>
                  )}

                  {event.type === 'photo' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <img
                          src={(event.data as Photo).url}
                          alt={event.description}
                          style={{
                            width: '80px',
                            height: '80px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb'
                          }}
                        />
                        <div style={{ flex: 1, fontSize: '0.75rem' }}>
                          {(event.data as Photo).bodyLocation && (
                            <div style={{ marginBottom: '0.25rem' }}>
                              <span style={{ color: '#9ca3af' }}>Location: </span>
                              <span style={{ color: '#374151', fontWeight: 500 }}>
                                {(event.data as Photo).bodyLocation}
                              </span>
                            </div>
                          )}
                          <div>
                            <span style={{ color: '#9ca3af' }}>Uploaded by: </span>
                            <span style={{ color: '#374151', fontWeight: 500 }}>
                              {(event.data as any).uploadedBy || 'System'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px'
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
          Activity Summary
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {filterButtons.map((filter) => (
            <div key={filter.type} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{filter.icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: filter.color }}>
                {filter.count}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>
                {filter.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
