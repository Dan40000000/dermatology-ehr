import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth, patientPortalFetch } from '../../contexts/PatientPortalAuthContext';
import ECheckInPage from '../Portal/ECheckInPage';

interface UpcomingAppointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  providerName: string;
  appointmentType?: string;
  status: string;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'Date TBD';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(dateStr: string | undefined | null): { month: string; day: string; year: string } {
  if (!dateStr) return { month: '---', day: '--', year: '----' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { month: '---', day: '--', year: '----' };
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    year: String(d.getFullYear()),
  };
}

function formatTime(timeStr: string | undefined | null): string {
  if (!timeStr) return '';
  const [rawHour, minutes = '00'] = timeStr.split(':');
  const hour = Number(rawHour);
  if (Number.isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function getStatusColor(status: string) {
  const s = status?.toLowerCase();
  if (s === 'scheduled') return { bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' };
  if (s === 'confirmed') return { bg: '#dcfce7', color: '#15803d', dot: '#22c55e' };
  if (s === 'pending') return { bg: '#fef9c3', color: '#a16207', dot: '#eab308' };
  return { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
}

export function PortalCheckInPage() {
  const { isAuthenticated, isLoading, sessionToken, tenantId } = usePatientPortalAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<UpcomingAppointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const appointmentId = searchParams.get('appointmentId');
  const appointmentType = searchParams.get('appointmentType') ?? undefined;

  useEffect(() => {
    if (!isAuthenticated || !sessionToken || !tenantId) return;
    if (appointmentId) return;

    const loadUpcomingAppointments = async () => {
      try {
        setLoadingAppointments(true);
        setError(null);
        const data = await patientPortalFetch('/api/patient-portal-data/appointments?status=upcoming');
        setAppointments(data.appointments || []);
      } catch (err: any) {
        setError(err?.message || 'Failed to load upcoming appointments');
      } finally {
        setLoadingAppointments(false);
      }
    };

    loadUpcomingAppointments();
  }, [isAuthenticated, sessionToken, tenantId, appointmentId]);

  if (isLoading) {
    return (
      <PatientPortalLayout>
        <div style={{ padding: '2rem', color: '#64748b' }}>Loading check-in…</div>
      </PatientPortalLayout>
    );
  }

  if (!isAuthenticated || !sessionToken || !tenantId) {
    return <Navigate to="/portal/login" replace />;
  }

  if (appointmentId) {
    return (
      <PatientPortalLayout>
        <ECheckInPage
          key={appointmentId}
          tenantId={tenantId}
          portalToken={sessionToken}
          appointmentId={appointmentId}
          appointmentType={appointmentType}
        />
      </PatientPortalLayout>
    );
  }

  return (
    <PatientPortalLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .checkin-page {
          max-width: 760px;
          margin: 0 auto;
          font-family: 'Inter', sans-serif;
          animation: fadeInUp 0.4s ease both;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .checkin-hero {
          background: linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 2rem 2rem 1.75rem;
          margin-bottom: 1.75rem;
          display: flex;
          align-items: flex-start;
          gap: 1.25rem;
        }

        .checkin-hero-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #16a34a, #4f46e5);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .checkin-hero-text h1 {
          margin: 0 0 0.35rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.02em;
        }

        .checkin-hero-text p {
          margin: 0;
          color: #475569;
          font-size: 0.9rem;
          line-height: 1.6;
        }

        .checkin-steps {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.25rem;
          flex-wrap: wrap;
        }

        .checkin-step {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 0.3rem 0.75rem 0.3rem 0.35rem;
          font-size: 0.78rem;
          color: #374151;
          font-weight: 500;
        }

        .checkin-step-num {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #16a34a, #4f46e5);
          color: white;
          font-size: 0.7rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .checkin-section-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #94a3b8;
          margin-bottom: 0.875rem;
        }

        .appt-list {
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
        }

        .appt-card {
          background: white;
          border: 1.5px solid #e2e8f0;
          border-radius: 14px;
          overflow: hidden;
          cursor: pointer;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
          text-align: left;
          width: 100%;
          padding: 0;
          appearance: none;
          display: block;
        }

        .appt-card:hover {
          border-color: #6366f1;
          box-shadow: 0 4px 20px rgba(99,102,241,0.12);
          transform: translateY(-1px);
        }

        .appt-card-inner {
          display: flex;
          align-items: stretch;
          gap: 0;
        }

        .appt-date-col {
          width: 80px;
          flex-shrink: 0;
          background: linear-gradient(160deg, #16a34a 0%, #4f46e5 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.25rem 0.5rem;
          gap: 0.15rem;
        }

        .appt-date-month {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: rgba(255,255,255,0.8);
        }

        .appt-date-day {
          font-size: 2rem;
          font-weight: 800;
          line-height: 1;
          color: white;
          letter-spacing: -0.03em;
        }

        .appt-date-year {
          font-size: 0.65rem;
          font-weight: 500;
          color: rgba(255,255,255,0.65);
        }

        .appt-body {
          flex: 1;
          padding: 1.1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .appt-body-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .appt-time-provider {
          font-size: 0.95rem;
          font-weight: 600;
          color: #0f172a;
          line-height: 1.3;
        }

        .appt-time-provider span {
          font-weight: 400;
          color: #475569;
        }

        .appt-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          font-size: 0.73rem;
          font-weight: 600;
          flex-shrink: 0;
          text-transform: capitalize;
        }

        .appt-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .appt-type-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: #f1f5f9;
          color: #475569;
          font-size: 0.78rem;
          font-weight: 500;
          padding: 0.2rem 0.6rem;
          border-radius: 6px;
          width: fit-content;
        }

        .appt-cta-row {
          border-top: 1px solid #f1f5f9;
          padding: 0.75rem 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fafafa;
        }

        .appt-cta-hint {
          font-size: 0.78rem;
          color: #94a3b8;
        }

        .appt-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: linear-gradient(135deg, #16a34a, #4f46e5);
          color: white;
          font-size: 0.82rem;
          font-weight: 600;
          padding: 0.45rem 1rem;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          letter-spacing: 0.01em;
          pointer-events: none;
        }

        .empty-state {
          background: white;
          border: 1.5px dashed #e2e8f0;
          border-radius: 14px;
          padding: 3rem 2rem;
          text-align: center;
        }

        .empty-state-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }

        .empty-state h3 {
          margin: 0 0 0.4rem;
          font-size: 1rem;
          font-weight: 600;
          color: #0f172a;
        }

        .empty-state p {
          margin: 0;
          font-size: 0.875rem;
          color: #64748b;
        }
      `}</style>

      <div className="checkin-page">
        {/* Hero Header */}
        <div className="checkin-hero">
          <div className="checkin-hero-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
          </div>
          <div className="checkin-hero-text">
            <h1>Pre-Check-In</h1>
            <p>Save time at your visit by completing your paperwork online. Select an upcoming appointment below to get started.</p>
            <div className="checkin-steps">
              {['Demographics', 'Insurance', 'Intake Forms', 'Consents'].map((step, i) => (
                <div className="checkin-step" key={step}>
                  <div className="checkin-step-num">{i + 1}</div>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Appointment List */}
        <div className="checkin-section-label">Select an appointment</div>

        {loadingAppointments ? (
          <div style={{ padding: '1rem 0', color: '#64748b', fontSize: '0.9rem' }}>
            Loading upcoming appointments…
          </div>
        ) : error ? (
          <div style={{ color: '#b91c1c', background: '#fee2e2', padding: '0.875rem 1rem', borderRadius: 10, fontSize: '0.9rem' }}>
            {error}
          </div>
        ) : appointments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h3>No upcoming appointments</h3>
            <p>You don't have any appointments available for pre-check-in right now.</p>
          </div>
        ) : (
          <div className="appt-list">
            {appointments.map((appt) => {
              const { month, day, year } = formatDateShort(appt.appointmentDate);
              const statusColors = getStatusColor(appt.status);
              const isHovered = hoveredId === appt.id;
              return (
                <button
                  key={appt.id}
                  className="appt-card"
                  onMouseEnter={() => setHoveredId(appt.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('appointmentId', appt.id);
                    if (appt.appointmentType) next.set('appointmentType', appt.appointmentType);
                    setSearchParams(next);
                  }}
                  style={isHovered ? { borderColor: '#6366f1', boxShadow: '0 4px 20px rgba(99,102,241,0.12)', transform: 'translateY(-1px)' } : {}}
                >
                  <div className="appt-card-inner">
                    {/* Date Column */}
                    <div className="appt-date-col">
                      <div className="appt-date-month">{month}</div>
                      <div className="appt-date-day">{day}</div>
                      <div className="appt-date-year">{year}</div>
                    </div>

                    {/* Body */}
                    <div className="appt-body">
                      <div className="appt-body-top">
                        <div className="appt-time-provider">
                          {formatTime(appt.appointmentTime)}{' '}
                          <span>with {appt.providerName || 'Your Provider'}</span>
                        </div>
                        <div
                          className="appt-status-badge"
                          style={{ background: statusColors.bg, color: statusColors.color }}
                        >
                          <div className="appt-status-dot" style={{ background: statusColors.dot }} />
                          {appt.status}
                        </div>
                      </div>

                      {appt.appointmentType && (
                        <div className="appt-type-tag">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                          </svg>
                          {appt.appointmentType}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CTA Footer */}
                  <div className="appt-cta-row">
                    <span className="appt-cta-hint">Takes about 5–10 minutes</span>
                    <div className="appt-cta-btn">
                      Start Check-In
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PatientPortalLayout>
  );
}
