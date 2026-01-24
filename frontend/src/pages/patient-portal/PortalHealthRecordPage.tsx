import { useState, useEffect } from 'react';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth, patientPortalFetch } from '../../contexts/PatientPortalAuthContext';

interface Allergy {
  allergen: string;
  reaction: string;
  severity: string;
}

interface Medication {
  medicationName: string;
  sig: string;
  quantity: string;
  refills: number;
  prescribedDate: string;
  providerName: string;
}

interface VitalRecord {
  date: string;
  provider: string;
  bloodPressure?: string;
  heartRate?: number;
  temperature?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  oxygenSaturation?: number;
}

interface LabResult {
  id: string;
  observationDate: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  abnormalFlag: string;
  status: string;
}

export function PortalHealthRecordPage() {
  const { sessionToken, tenantId } = usePatientPortalAuth();
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [vitals, setVitals] = useState<VitalRecord[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'allergies' | 'medications' | 'vitals' | 'labs'>('overview');

  useEffect(() => {
    fetchHealthData();
  }, [sessionToken, tenantId]);

  const fetchHealthData = async () => {
    if (!sessionToken || !tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [allergiesData, medicationsData, vitalsData, labsData] = await Promise.all([
        patientPortalFetch('/api/patient-portal-data/allergies'),
        patientPortalFetch('/api/patient-portal-data/medications'),
        patientPortalFetch('/api/patient-portal-data/vitals'),
        patientPortalFetch('/api/patient-portal-data/lab-results'),
      ]);

      setAllergies(allergiesData.allergies || []);
      setMedications(medicationsData.medications || []);
      setVitals(vitalsData.vitals || []);
      setLabResults(labsData.labResults || []);
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getSeverityColor = (severity: string) => {
    const s = severity?.toLowerCase() || '';
    if (s.includes('severe') || s.includes('high')) return '#dc2626';
    if (s.includes('moderate') || s.includes('medium')) return '#f59e0b';
    return '#6b7280';
  };

  const getAbnormalColor = (flag: string) => {
    const f = flag?.toLowerCase() || '';
    if (f === 'h' || f === 'high' || f === 'hh') return '#dc2626';
    if (f === 'l' || f === 'low' || f === 'll') return '#2563eb';
    return '#10b981';
  };

  return (
    <PatientPortalLayout>
      <style>{`
        .health-record-page {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 2rem;
        }

        .page-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.5rem 0;
        }

        .page-subtitle {
          color: #6b7280;
          margin: 0;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .summary-card {
          background: white;
          border-radius: 16px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
          cursor: pointer;
          transition: all 0.2s;
        }

        .summary-card:hover {
          border-color: #6366f1;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
        }

        .summary-card.active {
          border-color: #6366f1;
          background: #eef2ff;
        }

        .summary-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.75rem;
        }

        .summary-icon svg {
          width: 20px;
          height: 20px;
        }

        .summary-icon.allergies {
          background: #fee2e2;
          color: #dc2626;
        }

        .summary-icon.medications {
          background: #dbeafe;
          color: #2563eb;
        }

        .summary-icon.vitals {
          background: #d1fae5;
          color: #059669;
        }

        .summary-icon.labs {
          background: #fef3c7;
          color: #d97706;
        }

        .summary-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .summary-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
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
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .allergy-item {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .allergy-item:last-child {
          border-bottom: none;
        }

        .allergy-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .allergy-icon {
          width: 40px;
          height: 40px;
          background: #fee2e2;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .allergy-icon svg {
          width: 20px;
          height: 20px;
          color: #dc2626;
        }

        .allergy-details h4 {
          margin: 0;
          font-weight: 600;
          color: #111827;
        }

        .allergy-details p {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .severity-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
          color: white;
        }

        .medication-item {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .medication-item:last-child {
          border-bottom: none;
        }

        .medication-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }

        .medication-name {
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .medication-date {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .medication-sig {
          color: #374151;
          margin: 0 0 0.5rem;
          font-size: 0.9375rem;
        }

        .medication-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .vitals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          padding: 1.5rem;
        }

        .vital-card {
          background: #f9fafb;
          border-radius: 12px;
          padding: 1rem;
          text-align: center;
        }

        .vital-icon {
          width: 36px;
          height: 36px;
          margin: 0 auto 0.5rem;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .vital-icon svg {
          width: 18px;
          height: 18px;
          color: #6366f1;
        }

        .vital-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
        }

        .vital-label {
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 0.25rem;
        }

        .vitals-date {
          padding: 1rem 1.5rem;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .lab-item {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #f3f4f6;
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 1rem;
          align-items: center;
        }

        .lab-item:last-child {
          border-bottom: none;
        }

        .lab-info h4 {
          margin: 0;
          font-weight: 500;
          color: #111827;
        }

        .lab-info p {
          margin: 0.25rem 0 0;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .lab-value {
          text-align: right;
        }

        .lab-value .value {
          font-weight: 600;
          font-size: 1rem;
        }

        .lab-value .unit {
          font-size: 0.75rem;
          color: #6b7280;
          margin-left: 0.25rem;
        }

        .lab-value .range {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 0.125rem;
        }

        .lab-status {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #6b7280;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          background: #f3f4f6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }

        .empty-icon svg {
          width: 32px;
          height: 32px;
          color: #9ca3af;
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

        /* Overview Tab Styles */
        .overview-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
          padding: 1.5rem;
        }

        .overview-section {
          background: #f9fafb;
          border-radius: 12px;
          padding: 1.25rem;
        }

        .overview-section-title {
          font-weight: 600;
          color: #111827;
          margin: 0 0 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .overview-section-title svg {
          width: 18px;
          height: 18px;
        }

        .overview-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .overview-list li {
          padding: 0.5rem 0;
          border-bottom: 1px solid #e5e7eb;
          font-size: 0.9375rem;
          color: #374151;
        }

        .overview-list li:last-child {
          border-bottom: none;
        }

        @media (max-width: 768px) {
          .health-record-page {
            padding: 1rem;
          }

          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
          }

          .overview-grid {
            grid-template-columns: 1fr;
          }

          .lab-item {
            grid-template-columns: 1fr;
            gap: 0.5rem;
          }

          .lab-value {
            text-align: left;
          }
        }
      `}</style>

      <div className="health-record-page">
        <div className="page-header">
          <h1 className="page-title">Health Record</h1>
          <p className="page-subtitle">View your medical history and health information</p>
        </div>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div
            className={`summary-card ${activeTab === 'allergies' ? 'active' : ''}`}
            onClick={() => setActiveTab('allergies')}
          >
            <div className="summary-icon allergies">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="summary-label">Allergies</div>
            <div className="summary-value">{loading ? '-' : allergies.length}</div>
          </div>

          <div
            className={`summary-card ${activeTab === 'medications' ? 'active' : ''}`}
            onClick={() => setActiveTab('medications')}
          >
            <div className="summary-icon medications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </div>
            <div className="summary-label">Medications</div>
            <div className="summary-value">{loading ? '-' : medications.length}</div>
          </div>

          <div
            className={`summary-card ${activeTab === 'vitals' ? 'active' : ''}`}
            onClick={() => setActiveTab('vitals')}
          >
            <div className="summary-icon vitals">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div className="summary-label">Vitals Records</div>
            <div className="summary-value">{loading ? '-' : vitals.length}</div>
          </div>

          <div
            className={`summary-card ${activeTab === 'labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('labs')}
          >
            <div className="summary-icon labs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 3h6v2H9V3zM10 5v6l-4 8h12l-4-8V5" />
              </svg>
            </div>
            <div className="summary-label">Lab Results</div>
            <div className="summary-value">{loading ? '-' : labResults.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab ${activeTab === 'allergies' ? 'active' : ''}`}
            onClick={() => setActiveTab('allergies')}
          >
            Allergies
          </button>
          <button
            className={`tab ${activeTab === 'medications' ? 'active' : ''}`}
            onClick={() => setActiveTab('medications')}
          >
            Medications
          </button>
          <button
            className={`tab ${activeTab === 'vitals' ? 'active' : ''}`}
            onClick={() => setActiveTab('vitals')}
          >
            Vitals
          </button>
          <button
            className={`tab ${activeTab === 'labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('labs')}
          >
            Lab Results
          </button>
        </div>

        {/* Content */}
        <div className="content-section">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="overview-grid">
              <div className="overview-section">
                <h4 className="overview-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Allergies
                </h4>
                {loading ? (
                  <div className="loading-skeleton" style={{ height: '4rem' }} />
                ) : allergies.length === 0 ? (
                  <p style={{ color: '#10b981', margin: 0 }}>No known allergies</p>
                ) : (
                  <ul className="overview-list">
                    {allergies.slice(0, 5).map((allergy, idx) => (
                      <li key={idx}>{allergy.allergen}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="overview-section">
                <h4 className="overview-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                    <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                  Current Medications
                </h4>
                {loading ? (
                  <div className="loading-skeleton" style={{ height: '4rem' }} />
                ) : medications.length === 0 ? (
                  <p style={{ color: '#6b7280', margin: 0 }}>No active medications</p>
                ) : (
                  <ul className="overview-list">
                    {medications.slice(0, 5).map((med, idx) => (
                      <li key={idx}>{med.medicationName}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="overview-section">
                <h4 className="overview-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  Latest Vitals
                </h4>
                {loading ? (
                  <div className="loading-skeleton" style={{ height: '4rem' }} />
                ) : vitals.length === 0 ? (
                  <p style={{ color: '#6b7280', margin: 0 }}>No vitals recorded</p>
                ) : (
                  <ul className="overview-list">
                    {vitals[0]?.bloodPressure && <li>Blood Pressure: {vitals[0].bloodPressure}</li>}
                    {vitals[0]?.heartRate && <li>Heart Rate: {vitals[0].heartRate} bpm</li>}
                    {vitals[0]?.weight && <li>Weight: {vitals[0].weight} lbs</li>}
                    {vitals[0]?.temperature && <li>Temp: {vitals[0].temperature}°F</li>}
                  </ul>
                )}
              </div>

              <div className="overview-section">
                <h4 className="overview-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
                    <path d="M9 3h6v2H9V3zM10 5v6l-4 8h12l-4-8V5" />
                  </svg>
                  Recent Labs
                </h4>
                {loading ? (
                  <div className="loading-skeleton" style={{ height: '4rem' }} />
                ) : labResults.length === 0 ? (
                  <p style={{ color: '#6b7280', margin: 0 }}>No lab results</p>
                ) : (
                  <ul className="overview-list">
                    {labResults.slice(0, 3).map((lab, idx) => (
                      <li key={idx}>{lab.testName}: {lab.value} {lab.unit}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Allergies Tab */}
          {activeTab === 'allergies' && (
            <>
              <div className="section-header">
                <h3 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Known Allergies
                </h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="loading-skeleton" style={{ height: '4rem', marginBottom: '1rem' }} />
                  ))}
                </div>
              ) : allergies.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p style={{ color: '#10b981', fontWeight: 500 }}>No Known Allergies</p>
                  <p style={{ fontSize: '0.875rem' }}>Your medical record shows no documented allergies</p>
                </div>
              ) : (
                allergies.map((allergy, idx) => (
                  <div key={idx} className="allergy-item">
                    <div className="allergy-info">
                      <div className="allergy-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="allergy-details">
                        <h4>{allergy.allergen}</h4>
                        <p>Reaction: {allergy.reaction || 'Not specified'}</p>
                      </div>
                    </div>
                    <span
                      className="severity-badge"
                      style={{ backgroundColor: getSeverityColor(allergy.severity) }}
                    >
                      {allergy.severity || 'Unknown'}
                    </span>
                  </div>
                ))
              )}
            </>
          )}

          {/* Medications Tab */}
          {activeTab === 'medications' && (
            <>
              <div className="section-header">
                <h3 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                    <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                  Current Medications
                </h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="loading-skeleton" style={{ height: '5rem', marginBottom: '1rem' }} />
                  ))}
                </div>
              ) : medications.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
                      <path d="M12 8v8M8 12h8" />
                    </svg>
                  </div>
                  <p>No Active Medications</p>
                </div>
              ) : (
                medications.map((med, idx) => (
                  <div key={idx} className="medication-item">
                    <div className="medication-header">
                      <h4 className="medication-name">{med.medicationName}</h4>
                      <span className="medication-date">
                        Prescribed: {formatDate(med.prescribedDate)}
                      </span>
                    </div>
                    <p className="medication-sig">{med.sig}</p>
                    <div className="medication-meta">
                      {med.quantity && <span>Qty: {med.quantity}</span>}
                      {med.refills !== undefined && <span>Refills: {med.refills}</span>}
                      {med.providerName && <span>By: {med.providerName}</span>}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* Vitals Tab */}
          {activeTab === 'vitals' && (
            <>
              <div className="section-header">
                <h3 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  Vital Signs History
                </h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  <div className="loading-skeleton" style={{ height: '10rem' }} />
                </div>
              ) : vitals.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                  </div>
                  <p>No Vitals Recorded</p>
                </div>
              ) : (
                vitals.slice(0, 5).map((vital, idx) => (
                  <div key={idx}>
                    <div className="vitals-date">
                      {formatDate(vital.date)} {vital.provider && `- ${vital.provider}`}
                    </div>
                    <div className="vitals-grid">
                      {vital.bloodPressure && (
                        <div className="vital-card">
                          <div className="vital-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                          </div>
                          <div className="vital-value">{vital.bloodPressure}</div>
                          <div className="vital-label">Blood Pressure</div>
                        </div>
                      )}
                      {vital.heartRate && (
                        <div className="vital-card">
                          <div className="vital-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                            </svg>
                          </div>
                          <div className="vital-value">{vital.heartRate}</div>
                          <div className="vital-label">Heart Rate (bpm)</div>
                        </div>
                      )}
                      {vital.temperature && (
                        <div className="vital-card">
                          <div className="vital-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z" />
                            </svg>
                          </div>
                          <div className="vital-value">{vital.temperature}°F</div>
                          <div className="vital-label">Temperature</div>
                        </div>
                      )}
                      {vital.weight && (
                        <div className="vital-card">
                          <div className="vital-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                          </div>
                          <div className="vital-value">{vital.weight}</div>
                          <div className="vital-label">Weight (lbs)</div>
                        </div>
                      )}
                      {vital.oxygenSaturation && (
                        <div className="vital-card">
                          <div className="vital-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                          </div>
                          <div className="vital-value">{vital.oxygenSaturation}%</div>
                          <div className="vital-label">O2 Saturation</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* Labs Tab */}
          {activeTab === 'labs' && (
            <>
              <div className="section-header">
                <h3 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
                    <path d="M9 3h6v2H9V3zM10 5v6l-4 8h12l-4-8V5" />
                  </svg>
                  Lab Results
                </h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="loading-skeleton" style={{ height: '3rem', marginBottom: '1rem' }} />
                  ))}
                </div>
              ) : labResults.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 3h6v2H9V3zM10 5v6l-4 8h12l-4-8V5" />
                    </svg>
                  </div>
                  <p>No Lab Results</p>
                  <p style={{ fontSize: '0.875rem' }}>Lab results will appear here once available</p>
                </div>
              ) : (
                labResults.map(lab => (
                  <div key={lab.id} className="lab-item">
                    <div className="lab-info">
                      <h4>{lab.testName}</h4>
                      <p>{formatDate(lab.observationDate)}</p>
                    </div>
                    <div className="lab-value">
                      <span className="value" style={{ color: getAbnormalColor(lab.abnormalFlag) }}>
                        {lab.value}
                      </span>
                      <span className="unit">{lab.unit}</span>
                      {lab.referenceRange && (
                        <div className="range">Range: {lab.referenceRange}</div>
                      )}
                    </div>
                    <div
                      className="lab-status"
                      style={{ backgroundColor: getAbnormalColor(lab.abnormalFlag) }}
                      title={lab.abnormalFlag || 'Normal'}
                    />
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </PatientPortalLayout>
  );
}
