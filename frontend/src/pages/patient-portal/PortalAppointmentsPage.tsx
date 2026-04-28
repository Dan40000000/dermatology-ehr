import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { patientPortalFetch } from '../../contexts/PatientPortalAuthContext';

interface Appointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  appointmentType: string;
  reason?: string;
  providerName: string;
  providerSpecialty?: string;
  locationName?: string;
  locationAddress?: string;
}

export function PortalAppointmentsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAppointments();
  }, [tab]);

  const loadAppointments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await patientPortalFetch(`/api/patient-portal-data/appointments?status=${tab}`);
      setAppointments(data.appointments || []);
    } catch (error) {
      console.error('Failed to load appointments:', error);
      setError(error instanceof Error ? error.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    if (isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: '#10b981',
      confirmed: '#3b82f6',
      checked_in: '#f59e0b',
      cancelled: '#ef4444',
      completed: '#6b7280'
    };
    return colors[status] || '#6b7280';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: 'Scheduled',
      confirmed: 'Confirmed',
      checked_in: 'Checked In',
      cancelled: 'Cancelled',
      completed: 'Completed',
      no_show: 'No Show'
    };
    return labels[status] || status;
  };

  const startCheckIn = (appointment: Appointment) => {
    const params = new URLSearchParams({ appointmentId: appointment.id });
    if (appointment.appointmentType) {
      params.set('appointmentType', appointment.appointmentType);
    }
    navigate(`/portal/check-in?${params.toString()}`);
  };

  return (
    <PatientPortalLayout>
      <div className="portal-appointments-page">
        <header className="portal-page-header">
          <div className="header-content">
            <h1>My Appointments</h1>
            <p>View and manage your appointments</p>
          </div>
          <Link to="/portal/book-appointment" className="book-appointment-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Book Appointment</span>
          </Link>
        </header>

        {/* Tabs */}
        <div className="portal-tabs">
          <button
            className={tab === 'upcoming' ? 'portal-tab active' : 'portal-tab'}
            onClick={() => setTab('upcoming')}
          >
            Upcoming ({appointments.length})
          </button>
          <button
            className={tab === 'past' ? 'portal-tab active' : 'portal-tab'}
            onClick={() => setTab('past')}
          >
            Past History
          </button>
        </div>

        {/* Appointments List */}
        <div className="appointments-container">
          {loading ? (
            <div className="portal-loading">Loading appointments...</div>
          ) : error ? (
            <div className="portal-error-state">
              <h3>We could not load your appointments</h3>
              <p>{error}. Please try again.</p>
              <button type="button" onClick={loadAppointments}>Retry</button>
            </div>
          ) : appointments.length === 0 ? (
            <div className="portal-empty-state">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h3>No {tab} appointments</h3>
              <p>
                {tab === 'upcoming'
                  ? 'You don\'t have any upcoming appointments scheduled.'
                  : 'Your past appointments will appear here.'}
              </p>
              {tab === 'upcoming' && (
                <Link to="/portal/book-appointment" className="empty-book-btn">
                  Book an Appointment
                </Link>
              )}
            </div>
          ) : (
            <div className="appointments-list">
              {appointments.map((apt) => (
                <div key={apt.id} className="appointment-card">
                  {/* Status bar */}
                  <div className="appt-status-bar">
                    <span className="appt-status-dot" style={{ background: getStatusColor(apt.status) }} />
                    {getStatusLabel(apt.status)}
                  </div>

                  {/* Main row: date badge + info */}
                  <div className="appt-main">
                    <div className="appt-date-badge">
                      <span className="appt-date-day">{new Date(apt.appointmentDate).getDate()}</span>
                      <span className="appt-date-mon">{new Date(apt.appointmentDate).toLocaleDateString('en-US', { month: 'short' })}</span>
                    </div>
                    <div className="appt-info">
                      <h3 className="appt-provider">{apt.providerName}</h3>
                      <p className="appt-datetime">{formatDate(apt.appointmentDate)} at {formatTime(apt.appointmentTime)}</p>
                      <div className="appt-tags">
                        {apt.appointmentType && (
                          <span className="appt-tag appt-tag--type">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            {apt.appointmentType}
                          </span>
                        )}
                        {apt.locationName && (
                          <span className="appt-tag appt-tag--location">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            {apt.locationName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {tab === 'upcoming' && apt.status !== 'cancelled' && (
                    <div className="appt-actions">
                      <button className="appt-btn appt-btn--secondary">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Add to Calendar
                      </button>
                      <button className="appt-btn appt-btn--primary" onClick={() => startCheckIn(apt)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        Start Pre-Check-In
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .portal-appointments-page {
          max-width: 900px;
        }

        .portal-page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .portal-page-header h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 0.25rem 0;
        }

        .portal-page-header p {
          color: #64748b;
          margin: 0;
        }

        .book-appointment-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
        }

        .book-appointment-btn:hover {
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
          transform: translateY(-1px);
        }

        .book-appointment-btn svg {
          width: 18px;
          height: 18px;
        }

        .portal-tabs {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .portal-tab {
          padding: 1rem 1.5rem;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          color: #6b7280;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: -2px;
        }

        .portal-tab:hover {
          color: #7c3aed;
        }

        .portal-tab.active {
          color: #7c3aed;
          border-bottom-color: #7c3aed;
        }

        .appointments-container {
          margin-top: 2rem;
        }

        .portal-error-state {
          background: #fff;
          border: 1px solid #fecaca;
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
        }

        .portal-error-state h3 {
          margin: 0 0 0.5rem;
          color: #991b1b;
          font-size: 1.05rem;
        }

        .portal-error-state p {
          margin: 0 auto 1rem;
          max-width: 420px;
          color: #64748b;
          line-height: 1.5;
        }

        .portal-error-state button {
          border: none;
          border-radius: 8px;
          background: #6366f1;
          color: white;
          font-weight: 700;
          padding: 0.65rem 1rem;
          cursor: pointer;
        }

        .portal-empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: white;
          border-radius: 12px;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 1rem;
          color: #cbd5e1;
        }

        .empty-icon svg {
          width: 100%;
          height: 100%;
        }

        .portal-empty-state h3 {
          color: #1f2937;
          margin: 0 0 0.5rem 0;
        }

        .portal-empty-state p {
          color: #6b7280;
          margin: 0 0 1.5rem 0;
        }

        .empty-book-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
        }

        .empty-book-btn:hover {
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
          transform: translateY(-1px);
        }

        .appointments-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        /* Card */
        .appointment-card {
          background: white;
          border-radius: 14px;
          border: 1.5px solid #f0f0f0;
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .appointment-card:hover {
          border-color: #c4b5fd;
          box-shadow: 0 4px 20px rgba(124, 58, 237, 0.08);
        }

        /* Status bar at top */
        .appt-status-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 1.25rem;
          background: #f9fafb;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .appt-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* Main content row */
        .appt-main {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 1.25rem 1.5rem;
        }

        /* Date badge */
        .appt-date-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #7c3aed, #6b21a8);
          color: white;
          border-radius: 12px;
          flex-shrink: 0;
        }

        .appt-date-day {
          font-size: 1.5rem;
          font-weight: 700;
          line-height: 1;
        }

        .appt-date-mon {
          font-size: 0.65rem;
          text-transform: uppercase;
          opacity: 0.85;
          letter-spacing: 0.05em;
        }

        /* Info block */
        .appt-info {
          flex: 1;
          min-width: 0;
        }

        .appt-provider {
          font-size: 1.05rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.2rem;
        }

        .appt-datetime {
          font-size: 0.85rem;
          color: #6b7280;
          margin: 0 0 0.65rem;
        }

        /* Tags row */
        .appt-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        .appt-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 500;
          white-space: nowrap;
        }

        .appt-tag--type {
          background: rgba(124, 58, 237, 0.08);
          color: #6d28d9;
        }

        .appt-tag--location {
          background: rgba(16, 185, 129, 0.08);
          color: #047857;
        }

        /* Actions bar */
        .appt-actions {
          display: flex;
          gap: 0.75rem;
          padding: 0.875rem 1.5rem;
          border-top: 1px solid #f3f4f6;
          background: #fafafa;
        }

        .appt-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.55rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .appt-btn--secondary {
          flex: 1;
          background: white;
          border: 1.5px solid #e5e7eb;
          color: #374151;
        }

        .appt-btn--secondary:hover {
          border-color: #7c3aed;
          color: #7c3aed;
        }

        .appt-btn--primary {
          flex: 1;
          background: linear-gradient(135deg, #10b981, #059669);
          border: none;
          color: white;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
        }

        .appt-btn--primary:hover {
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
          transform: translateY(-1px);
        }

        @media (max-width: 768px) {
          .appointment-header {
            flex-wrap: wrap;
          }

          .appointment-actions {
            flex-direction: column;
          }

          .action-btn {
            width: 100%;
          }
        }
      `}</style>
    </PatientPortalLayout>
  );
}
