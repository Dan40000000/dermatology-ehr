import { useState, useEffect } from 'react';
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

  return (
    <PatientPortalLayout>
      <div className="portal-appointments-page">
        <header className="portal-page-header">
          <h1>My Appointments</h1>
          <p>View and manage your appointments</p>
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
              <div className="empty-icon">📅</div>
              <h3>No {tab} appointments</h3>
              <p>
                {tab === 'upcoming'
                  ? 'You don\'t have any upcoming appointments scheduled.'
                  : 'Your past appointments will appear here.'}
              </p>
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
                        📅 Add to Calendar
                      </button>
                      <button className="action-btn cancel-apt">
                        ❌ Cancel Appointment
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
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .portal-empty-state h3 {
          color: #1f2937;
          margin: 0 0 0.5rem 0;
        }

        .portal-empty-state p {
          color: #6b7280;
          margin: 0;
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

        .action-btn.cancel-apt:hover {
          border-color: #ef4444;
          color: #ef4444;
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
