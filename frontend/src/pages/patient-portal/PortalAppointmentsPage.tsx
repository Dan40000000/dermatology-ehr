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

  useEffect(() => {
    loadAppointments();
  }, [tab]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await patientPortalFetch(`/api/patient-portal-data/appointments?status=${tab}`);
      setAppointments(data.appointments);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
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

  const startCheckIn = (appointmentId: string) => {
    navigate(`/portal/check-in?appointmentId=${appointmentId}`);
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
                  <div className="appointment-header">
                    <div className="appointment-date-badge">
                      <div className="date-day">
                        {new Date(apt.appointmentDate).getDate()}
                      </div>
                      <div className="date-month">
                        {new Date(apt.appointmentDate).toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                    </div>
                    <div className="appointment-main-info">
                      <h3>{apt.providerName}</h3>
                      {apt.providerSpecialty && (
                        <p className="specialty">{apt.providerSpecialty}</p>
                      )}
                      <p className="datetime">
                        {formatDate(apt.appointmentDate)} at {formatTime(apt.appointmentTime)}
                      </p>
                    </div>
                    <div
                      className="appointment-status"
                      style={{ color: getStatusColor(apt.status) }}
                    >
                      {getStatusLabel(apt.status)}
                    </div>
                  </div>

                  <div className="appointment-details">
                    {apt.appointmentType && (
                      <div className="detail-row">
                        <span className="detail-label">Type:</span>
                        <span className="detail-value">{apt.appointmentType}</span>
                      </div>
                    )}
                    {apt.reason && (
                      <div className="detail-row">
                        <span className="detail-label">Reason:</span>
                        <span className="detail-value">{apt.reason}</span>
                      </div>
                    )}
                    {apt.locationName && (
                      <div className="detail-row">
                        <span className="detail-label">Location:</span>
                        <span className="detail-value">
                          {apt.locationName}
                          {apt.locationAddress && ` - ${apt.locationAddress}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {tab === 'upcoming' && apt.status !== 'cancelled' && (
                    <div className="appointment-actions">
                      <button className="action-btn add-calendar">
                        Add to Calendar
                      </button>
                      <button
                        className="action-btn primary"
                        onClick={() => startCheckIn(apt.id)}
                        title="Start pre-check-in before arrival"
                      >
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
          gap: 1.5rem;
        }

        .appointment-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          border: 2px solid #f3f4f6;
          transition: border-color 0.2s;
        }

        .appointment-card:hover {
          border-color: #7c3aed;
        }

        .appointment-header {
          display: flex;
          gap: 1.5rem;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .appointment-date-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 70px;
          height: 70px;
          background: linear-gradient(135deg, #7c3aed 0%, #6B46C1 100%);
          color: white;
          border-radius: 12px;
          flex-shrink: 0;
        }

        .date-day {
          font-size: 1.75rem;
          font-weight: 700;
          line-height: 1;
        }

        .date-month {
          font-size: 0.875rem;
          text-transform: uppercase;
          opacity: 0.9;
        }

        .appointment-main-info {
          flex: 1;
        }

        .appointment-main-info h3 {
          color: #1f2937;
          margin: 0 0 0.25rem 0;
          font-size: 1.25rem;
        }

        .specialty {
          color: #6b7280;
          margin: 0 0 0.5rem 0;
          font-size: 0.9rem;
        }

        .datetime {
          color: #4b5563;
          margin: 0;
          font-size: 0.9rem;
        }

        .appointment-status {
          font-weight: 600;
          font-size: 0.9rem;
          padding: 0.5rem 1rem;
          background: #f9fafb;
          border-radius: 8px;
          height: fit-content;
        }

        .appointment-details {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .detail-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .detail-row:last-child {
          margin-bottom: 0;
        }

        .detail-label {
          font-weight: 600;
          color: #6b7280;
          min-width: 80px;
        }

        .detail-value {
          color: #1f2937;
        }

        .appointment-actions {
          display: flex;
          gap: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .action-btn {
          padding: 0.75rem 1.25rem;
          border: 2px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.9rem;
        }

        .action-btn:hover {
          background: #f9fafb;
        }

        .action-btn.add-calendar:hover {
          border-color: #7c3aed;
          color: #7c3aed;
        }

        .action-btn.primary {
          background: #10b981;
          border-color: #059669;
          color: white;
        }

        .action-btn.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn.confirm {
          border-color: #2563eb;
          color: #1d4ed8;
          background: #eff6ff;
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
