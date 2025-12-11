import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth, patientPortalFetch } from '../../contexts/PatientPortalAuthContext';

interface DashboardData {
  upcomingAppointments: number;
  nextAppointment: {
    appointmentDate: string;
    appointmentTime: string;
    providerName: string;
  } | null;
  newDocuments: number;
  newVisits: number;
  activePrescriptions: number;
}

export function PortalDashboardPage() {
  const { patient } = usePatientPortalAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await patientPortalFetch('/api/patient-portal-data/dashboard');
      setDashboard(data.dashboard);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
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

  return (
    <PatientPortalLayout>
      <div className="portal-dashboard">
        <header className="portal-page-header">
          <h1>Welcome back, {patient?.firstName}!</h1>
          <p>Here's what's happening with your care</p>
        </header>

        {loading ? (
          <div className="portal-loading">Loading your dashboard...</div>
        ) : (
          <>
            {/* Quick Stats */}
            <div className="portal-stats-grid">
              <Link to="/portal/appointments" className="portal-stat-card stat-appointments">
                <div className="stat-icon">📅</div>
                <div className="stat-content">
                  <p className="stat-label">Upcoming Appointments</p>
                  <h2 className="stat-value">{dashboard?.upcomingAppointments || 0}</h2>
                </div>
              </Link>

              <Link to="/portal/documents" className="portal-stat-card stat-documents">
                <div className="stat-icon">📄</div>
                <div className="stat-content">
                  <p className="stat-label">New Documents</p>
                  <h2 className="stat-value">{dashboard?.newDocuments || 0}</h2>
                </div>
              </Link>

              <Link to="/portal/visits" className="portal-stat-card stat-visits">
                <div className="stat-icon">📋</div>
                <div className="stat-content">
                  <p className="stat-label">Recent Visits</p>
                  <h2 className="stat-value">{dashboard?.newVisits || 0}</h2>
                </div>
              </Link>

              <Link to="/portal/health-record" className="portal-stat-card stat-prescriptions">
                <div className="stat-icon">💊</div>
                <div className="stat-content">
                  <p className="stat-label">Active Medications</p>
                  <h2 className="stat-value">{dashboard?.activePrescriptions || 0}</h2>
                </div>
              </Link>
            </div>

            {/* Next Appointment Widget */}
            {dashboard?.nextAppointment && (
              <div className="portal-widget next-appointment-widget">
                <h2>Your Next Appointment</h2>
                <div className="appointment-details">
                  <div className="appointment-date-time">
                    <div className="appointment-icon">🗓️</div>
                    <div>
                      <p className="appointment-date">
                        {formatDate(dashboard.nextAppointment.appointmentDate)}
                      </p>
                      <p className="appointment-time">
                        {formatTime(dashboard.nextAppointment.appointmentTime)}
                      </p>
                    </div>
                  </div>
                  <div className="appointment-provider">
                    <span className="provider-icon">👨‍⚕️</span>
                    <span>{dashboard.nextAppointment.providerName}</span>
                  </div>
                  <Link to="/portal/appointments" className="view-appointments-btn">
                    View All Appointments
                  </Link>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="portal-widget quick-actions-widget">
              <h2>Quick Actions</h2>
              <div className="quick-actions-grid">
                <Link to="/portal/visits" className="quick-action-btn">
                  <span className="action-icon">📋</span>
                  <span>View Visit Summaries</span>
                </Link>
                <Link to="/portal/documents" className="quick-action-btn">
                  <span className="action-icon">📄</span>
                  <span>View Documents</span>
                </Link>
                <Link to="/portal/health-record" className="quick-action-btn">
                  <span className="action-icon">💊</span>
                  <span>My Health Record</span>
                </Link>
                <Link to="/portal/profile" className="quick-action-btn">
                  <span className="action-icon">⚙️</span>
                  <span>Update Profile</span>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .portal-dashboard {
          max-width: 1200px;
        }

        .portal-page-header {
          margin-bottom: 2rem;
        }

        .portal-page-header h1 {
          font-size: 2rem;
          color: #1f2937;
          margin: 0 0 0.5rem 0;
          font-weight: 700;
        }

        .portal-page-header p {
          color: #6b7280;
          margin: 0;
          font-size: 1.1rem;
        }

        .portal-loading {
          text-align: center;
          padding: 4rem;
          color: #6b7280;
          font-size: 1.1rem;
        }

        .portal-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .portal-stat-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: all 0.3s;
          border: 2px solid transparent;
        }

        .portal-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }

        .stat-appointments:hover { border-color: #3b82f6; }
        .stat-documents:hover { border-color: #10b981; }
        .stat-visits:hover { border-color: #f59e0b; }
        .stat-prescriptions:hover { border-color: #8b5cf6; }

        .stat-icon {
          font-size: 2.5rem;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #f3f4f6;
        }

        .stat-appointments .stat-icon { background: #dbeafe; }
        .stat-documents .stat-icon { background: #d1fae5; }
        .stat-visits .stat-icon { background: #fed7aa; }
        .stat-prescriptions .stat-icon { background: #ede9fe; }

        .stat-content {
          flex: 1;
        }

        .stat-label {
          color: #6b7280;
          margin: 0 0 0.25rem 0;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .stat-value {
          color: #1f2937;
          margin: 0;
          font-size: 2rem;
          font-weight: 700;
        }

        .portal-widget {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .portal-widget h2 {
          font-size: 1.25rem;
          color: #1f2937;
          margin: 0 0 1.5rem 0;
          font-weight: 600;
        }

        .appointment-details {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .appointment-date-time {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.5rem;
          background: linear-gradient(135deg, #7c3aed 0%, #6B46C1 100%);
          border-radius: 12px;
          color: white;
        }

        .appointment-icon {
          font-size: 2.5rem;
        }

        .appointment-date {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .appointment-time {
          margin: 0;
          font-size: 1rem;
          opacity: 0.9;
        }

        .appointment-provider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: #f3f4f6;
          border-radius: 8px;
          font-weight: 500;
        }

        .provider-icon {
          font-size: 1.5rem;
        }

        .view-appointments-btn {
          padding: 0.75rem 1.5rem;
          background: #7c3aed;
          color: white;
          border-radius: 8px;
          text-decoration: none;
          text-align: center;
          font-weight: 600;
          transition: background 0.2s;
        }

        .view-appointments-btn:hover {
          background: #6B46C1;
        }

        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .quick-action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 1.5rem 1rem;
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          text-decoration: none;
          color: #1f2937;
          transition: all 0.2s;
          font-weight: 500;
        }

        .quick-action-btn:hover {
          background: white;
          border-color: #7c3aed;
          transform: translateY(-2px);
        }

        .action-icon {
          font-size: 2rem;
        }

        @media (max-width: 768px) {
          .portal-stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }

          .portal-stat-card {
            padding: 1rem;
          }

          .stat-icon {
            font-size: 2rem;
            width: 50px;
            height: 50px;
          }

          .stat-value {
            font-size: 1.5rem;
          }

          .quick-actions-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </PatientPortalLayout>
  );
}
