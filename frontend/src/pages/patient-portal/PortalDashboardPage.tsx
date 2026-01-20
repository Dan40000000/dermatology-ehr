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
    appointmentType?: string;
  } | null;
  newDocuments: number;
  newVisits: number;
  activePrescriptions: number;
}

export function PortalDashboardPage() {
  const { patient } = usePatientPortalAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      day: date.getDate(),
      month: date.toLocaleDateString('en-US', { month: 'short' })
    };
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const [hours, minutes] = parts;
    const hour = parseInt(hours, 10);
    if (isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getIcon = (iconName: string) => {
    const icons: Record<string, JSX.Element> = {
      calendar: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      document: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      ),
      clipboard: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          <path d="M9 14l2 2 4-4"/>
        </svg>
      ),
      pill: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.5 20.5L3.5 13.5c-1.9-1.9-1.9-5.1 0-7s5.1-1.9 7 0l7 7c1.9 1.9 1.9 5.1 0 7s-5.1 1.9-7 0z"/>
          <line x1="7.5" y1="10.5" x2="13.5" y2="16.5"/>
        </svg>
      ),
      clock: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
      ),
      user: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      ),
      heart: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      ),
      arrowRight: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12,5 19,12 12,19"/>
        </svg>
      ),
      phone: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      ),
      message: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      shield: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      ),
    };
    return icons[iconName] || null;
  };

  return (
    <PatientPortalLayout>
      <div className={`portal-dashboard ${mounted ? 'mounted' : ''}`}>
        {/* Welcome Header */}
        <header className="dashboard-header">
          <div className="header-content">
            <div className="header-greeting">
              <span className="greeting-wave">👋</span>
              <div>
                <h1>{getGreeting()}, {patient?.firstName}!</h1>
                <p>Here's an overview of your health journey</p>
              </div>
            </div>
            <div className="header-date">
              <span className="date-icon">{getIcon('calendar')}</span>
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="dashboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading your dashboard...</p>
          </div>
        ) : (
          <div className="dashboard-content">
            {/* Stats Grid */}
            <div className="stats-grid">
              <Link to="/portal/appointments" className="stat-card appointments">
                <div className="stat-icon-wrapper">
                  {getIcon('calendar')}
                </div>
                <div className="stat-info">
                  <span className="stat-value">{dashboard?.upcomingAppointments || 0}</span>
                  <span className="stat-label">Upcoming Appointments</span>
                </div>
                <span className="stat-arrow">{getIcon('arrowRight')}</span>
              </Link>

              <Link to="/portal/documents" className="stat-card documents">
                <div className="stat-icon-wrapper">
                  {getIcon('document')}
                </div>
                <div className="stat-info">
                  <span className="stat-value">{dashboard?.newDocuments || 0}</span>
                  <span className="stat-label">New Documents</span>
                </div>
                <span className="stat-arrow">{getIcon('arrowRight')}</span>
              </Link>

              <Link to="/portal/visits" className="stat-card visits">
                <div className="stat-icon-wrapper">
                  {getIcon('clipboard')}
                </div>
                <div className="stat-info">
                  <span className="stat-value">{dashboard?.newVisits || 0}</span>
                  <span className="stat-label">Recent Visits</span>
                </div>
                <span className="stat-arrow">{getIcon('arrowRight')}</span>
              </Link>

              <Link to="/portal/health-record" className="stat-card medications">
                <div className="stat-icon-wrapper">
                  {getIcon('pill')}
                </div>
                <div className="stat-info">
                  <span className="stat-value">{dashboard?.activePrescriptions || 0}</span>
                  <span className="stat-label">Active Medications</span>
                </div>
                <span className="stat-arrow">{getIcon('arrowRight')}</span>
              </Link>
            </div>

            {/* Main Content Grid */}
            <div className="content-grid">
              {/* Next Appointment Card */}
              <div className="widget-card appointment-card">
                <div className="widget-header">
                  <h2>Next Appointment</h2>
                  <Link to="/portal/appointments" className="widget-link">View All</Link>
                </div>

                {dashboard?.nextAppointment ? (
                  <div className="appointment-content">
                    <div className="appointment-date-badge">
                      <span className="date-day">{formatShortDate(dashboard.nextAppointment.appointmentDate).day}</span>
                      <span className="date-month">{formatShortDate(dashboard.nextAppointment.appointmentDate).month}</span>
                      <span className="date-weekday">{formatShortDate(dashboard.nextAppointment.appointmentDate).weekday}</span>
                    </div>
                    <div className="appointment-details">
                      <div className="appointment-time">
                        <span className="time-icon">{getIcon('clock')}</span>
                        <span>{formatTime(dashboard.nextAppointment.appointmentTime)}</span>
                      </div>
                      <div className="appointment-provider">
                        <span className="provider-icon">{getIcon('user')}</span>
                        <span>{dashboard.nextAppointment.providerName}</span>
                      </div>
                      {dashboard.nextAppointment.appointmentType && (
                        <span className="appointment-type">{dashboard.nextAppointment.appointmentType}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="no-appointment">
                    <div className="no-appointment-icon">{getIcon('calendar')}</div>
                    <p>No upcoming appointments</p>
                    <Link to="/portal/appointments" className="schedule-btn">Schedule Now</Link>
                  </div>
                )}
              </div>

              {/* Quick Actions Card */}
              <div className="widget-card actions-card">
                <div className="widget-header">
                  <h2>Quick Actions</h2>
                </div>
                <div className="actions-grid">
                  <Link to="/portal/visits" className="action-item">
                    <div className="action-icon visits-icon">{getIcon('clipboard')}</div>
                    <span>Visit Summaries</span>
                  </Link>
                  <Link to="/portal/documents" className="action-item">
                    <div className="action-icon docs-icon">{getIcon('document')}</div>
                    <span>Documents</span>
                  </Link>
                  <Link to="/portal/health-record" className="action-item">
                    <div className="action-icon health-icon">{getIcon('heart')}</div>
                    <span>Health Record</span>
                  </Link>
                  <Link to="/portal/profile" className="action-item">
                    <div className="action-icon profile-icon">{getIcon('user')}</div>
                    <span>My Profile</span>
                  </Link>
                </div>
              </div>

              {/* Contact Card */}
              <div className="widget-card contact-card">
                <div className="contact-icon">{getIcon('phone')}</div>
                <h3>Need to reach us?</h3>
                <p>Our care team is here to help</p>
                <div className="contact-actions">
                  <a href="tel:1-800-555-0100" className="contact-btn primary">
                    {getIcon('phone')}
                    <span>Call Now</span>
                  </a>
                  <Link to="/portal/messages" className="contact-btn secondary">
                    {getIcon('message')}
                    <span>Send Message</span>
                  </Link>
                </div>
              </div>

              {/* Health Tip Card */}
              <div className="widget-card tip-card">
                <div className="tip-badge">
                  <span className="tip-icon">{getIcon('shield')}</span>
                  <span>Health Tip</span>
                </div>
                <p className="tip-text">
                  Remember to stay hydrated and protect your skin from the sun, especially during outdoor activities.
                  Drink at least 8 glasses of water daily and apply SPF 30+ sunscreen.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .portal-dashboard {
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.4s ease-out;
        }

        .portal-dashboard.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        /* Header */
        .dashboard-header {
          margin-bottom: 2rem;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .header-greeting {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .greeting-wave {
          font-size: 2.5rem;
          animation: wave 2s ease-in-out infinite;
        }

        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(20deg); }
          75% { transform: rotate(-15deg); }
        }

        .header-greeting h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 0.25rem 0;
        }

        .header-greeting p {
          color: #64748b;
          margin: 0;
          font-size: 0.95rem;
        }

        .header-date {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: #f8fafc;
          border-radius: 8px;
          color: #64748b;
          font-size: 0.875rem;
        }

        .date-icon {
          width: 16px;
          height: 16px;
        }

        .date-icon svg {
          width: 100%;
          height: 100%;
        }

        /* Loading */
        .dashboard-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem;
          gap: 1rem;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e2e8f0;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .dashboard-loading p {
          color: #64748b;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem;
          background: white;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
        }

        .stat-icon-wrapper {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-icon-wrapper svg {
          width: 24px;
          height: 24px;
        }

        .stat-card.appointments .stat-icon-wrapper {
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
          color: #2563eb;
        }

        .stat-card.documents .stat-icon-wrapper {
          background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
          color: #059669;
        }

        .stat-card.visits .stat-icon-wrapper {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          color: #d97706;
        }

        .stat-card.medications .stat-icon-wrapper {
          background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
          color: #7c3aed;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
          line-height: 1.2;
        }

        .stat-label {
          font-size: 0.8rem;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .stat-arrow {
          width: 20px;
          height: 20px;
          color: #cbd5e1;
          flex-shrink: 0;
          transition: transform 0.2s;
        }

        .stat-arrow svg {
          width: 100%;
          height: 100%;
        }

        .stat-card:hover .stat-arrow {
          transform: translateX(4px);
          color: #6366f1;
        }

        /* Content Grid */
        .content-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto;
          gap: 1.5rem;
        }

        /* Widget Cards */
        .widget-card {
          background: white;
          border-radius: 20px;
          padding: 1.5rem;
          border: 1px solid #e2e8f0;
        }

        .widget-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
        }

        .widget-header h2 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
        }

        .widget-link {
          font-size: 0.85rem;
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .widget-link:hover {
          text-decoration: underline;
        }

        /* Appointment Card */
        .appointment-card {
          grid-row: span 1;
        }

        .appointment-content {
          display: flex;
          gap: 1.25rem;
          align-items: flex-start;
        }

        .appointment-date-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 16px;
          color: white;
          min-width: 80px;
        }

        .date-day {
          font-size: 2rem;
          font-weight: 700;
          line-height: 1;
        }

        .date-month {
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .date-weekday {
          font-size: 0.75rem;
          opacity: 0.8;
          margin-top: 0.25rem;
        }

        .appointment-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .appointment-time,
        .appointment-provider {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #475569;
          font-size: 0.9rem;
        }

        .appointment-time svg,
        .appointment-provider svg {
          width: 18px;
          height: 18px;
          color: #94a3b8;
        }

        .appointment-type {
          display: inline-block;
          padding: 0.375rem 0.75rem;
          background: #f1f5f9;
          border-radius: 20px;
          font-size: 0.8rem;
          color: #475569;
          width: fit-content;
        }

        .no-appointment {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2rem;
          text-align: center;
        }

        .no-appointment-icon {
          width: 48px;
          height: 48px;
          color: #cbd5e1;
          margin-bottom: 1rem;
        }

        .no-appointment-icon svg {
          width: 100%;
          height: 100%;
        }

        .no-appointment p {
          color: #64748b;
          margin: 0 0 1rem 0;
        }

        .schedule-btn {
          padding: 0.625rem 1.25rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .schedule-btn:hover {
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
          transform: translateY(-1px);
        }

        /* Actions Card */
        .actions-card {
          grid-row: span 1;
        }

        .actions-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .action-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.625rem;
          padding: 1.25rem 1rem;
          background: #f8fafc;
          border-radius: 12px;
          text-decoration: none;
          color: #475569;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .action-item:hover {
          background: #f1f5f9;
          transform: translateY(-2px);
        }

        .action-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-icon svg {
          width: 20px;
          height: 20px;
        }

        .action-icon.visits-icon {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          color: #d97706;
        }

        .action-icon.docs-icon {
          background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
          color: #059669;
        }

        .action-icon.health-icon {
          background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%);
          color: #db2777;
        }

        .action-icon.profile-icon {
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
          color: #2563eb;
        }

        /* Contact Card */
        .contact-card {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          text-align: center;
        }

        .contact-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 1rem;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .contact-icon svg {
          width: 24px;
          height: 24px;
        }

        .contact-card h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0 0 0.25rem 0;
        }

        .contact-card p {
          font-size: 0.875rem;
          opacity: 0.85;
          margin: 0 0 1.25rem 0;
        }

        .contact-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
        }

        .contact-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .contact-btn svg {
          width: 16px;
          height: 16px;
        }

        .contact-btn.primary {
          background: white;
          color: #6366f1;
        }

        .contact-btn.primary:hover {
          background: rgba(255, 255, 255, 0.9);
        }

        .contact-btn.secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .contact-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        /* Tip Card */
        .tip-card {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        }

        .tip-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          background: white;
          border-radius: 20px;
          margin-bottom: 0.75rem;
        }

        .tip-icon {
          width: 16px;
          height: 16px;
          color: #d97706;
        }

        .tip-icon svg {
          width: 100%;
          height: 100%;
        }

        .tip-badge span:last-child {
          font-size: 0.75rem;
          font-weight: 600;
          color: #92400e;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .tip-text {
          color: #78350f;
          font-size: 0.9rem;
          line-height: 1.6;
          margin: 0;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .content-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .header-content {
            flex-direction: column;
          }

          .header-date {
            align-self: flex-start;
          }

          .stats-grid {
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
          }

          .stat-card {
            padding: 1rem;
            flex-direction: column;
            text-align: center;
          }

          .stat-arrow {
            display: none;
          }

          .stat-info {
            align-items: center;
          }

          .appointment-content {
            flex-direction: column;
          }

          .appointment-date-badge {
            width: 100%;
            flex-direction: row;
            justify-content: center;
            gap: 0.75rem;
          }

          .date-weekday {
            margin-top: 0;
          }

          .actions-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .contact-actions {
            flex-direction: column;
          }

          .contact-btn {
            justify-content: center;
          }
        }
      `}</style>
    </PatientPortalLayout>
  );
}
