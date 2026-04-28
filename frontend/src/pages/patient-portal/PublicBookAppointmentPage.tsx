import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
import {
  buildPortalUrl,
  DEFAULT_PATIENT_PORTAL_TENANT_ID,
} from '../../utils/patientPortalLinks';

export function PublicBookAppointmentPage() {
  const { isAuthenticated, isLoading } = usePatientPortalAuth();
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId') || DEFAULT_PATIENT_PORTAL_TENANT_ID;

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/portal/book-appointment" replace />;
  }

  return (
    <div className="public-booking-page">
      <div className="public-booking-shell">
        <div className="public-booking-card">
          <div className="public-booking-badge">Online Scheduling</div>
          <h1>Book a Dermatology Appointment Online</h1>
          <p className="public-booking-copy">
            Existing patients can sign in and schedule online. New patients can create a portal
            account first, then pick an appointment time from the website. If they would rather not
            make a portal account yet, they can continue as a guest and place a card on file for
            the cancellation policy.
          </p>

          <div className="public-booking-actions">
            <Link
              to={buildPortalUrl('/portal/login', {
                tenantId,
                redirect: '/portal/book-appointment',
              })}
              className="public-booking-primary"
            >
              Existing Patient Sign In
            </Link>
            <Link
              to={buildPortalUrl('/portal/register', {
                tenantId,
                redirect: '/portal/book-appointment',
              })}
              className="public-booking-secondary"
            >
              Create Portal Account
            </Link>
            <Link
              to={buildPortalUrl('/book-appointment/guest', {
                tenantId,
              })}
              className="public-booking-tertiary"
            >
              Continue as Guest
            </Link>
          </div>

          <div className="public-booking-notes">
            <div className="public-booking-note">
              <strong>Already signed in?</strong> You will be sent straight into scheduling.
            </div>
            <div className="public-booking-note">
              <strong>Need help?</strong> Call the office if you need a same-day visit or cannot
              verify your portal account.
            </div>
            <div className="public-booking-note">
              <strong>Guest booking policy</strong> Guests can still schedule online, but they must
              provide contact details and a card on file for late-cancellation or no-show fees.
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .public-booking-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 32%),
            radial-gradient(circle at bottom right, rgba(34, 197, 94, 0.16), transparent 34%),
            linear-gradient(135deg, #f8fbff 0%, #eef6fb 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
        }

        .public-booking-shell {
          width: 100%;
          max-width: 760px;
        }

        .public-booking-card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 28px;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
          padding: 48px;
        }

        .public-booking-badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 14px;
          border-radius: 999px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 18px;
        }

        .public-booking-card h1 {
          margin: 0 0 12px;
          font-size: clamp(2.2rem, 4vw, 3.2rem);
          line-height: 1.05;
          color: #0f172a;
        }

        .public-booking-copy {
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.7;
          color: #475569;
          max-width: 620px;
        }

        .public-booking-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-top: 28px;
        }

        .public-booking-primary,
        .public-booking-secondary,
        .public-booking-tertiary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 52px;
          padding: 0 22px;
          border-radius: 16px;
          font-weight: 700;
          text-decoration: none;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .public-booking-primary {
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          color: #fff;
          box-shadow: 0 16px 30px rgba(3, 105, 161, 0.24);
        }

        .public-booking-secondary {
          background: #fff;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }

        .public-booking-tertiary {
          background: #eff6ff;
          color: #0f172a;
          border: 1px solid #bae6fd;
        }

        .public-booking-primary:hover,
        .public-booking-secondary:hover,
        .public-booking-tertiary:hover {
          transform: translateY(-1px);
        }

        .public-booking-notes {
          margin-top: 28px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 14px;
        }

        .public-booking-note {
          border-radius: 18px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 16px 18px;
          color: #475569;
          line-height: 1.6;
        }

        .public-booking-note strong {
          color: #0f172a;
          display: block;
          margin-bottom: 4px;
        }

        @media (max-width: 640px) {
          .public-booking-card {
            padding: 32px 22px;
            border-radius: 22px;
          }

          .public-booking-actions {
            flex-direction: column;
          }

          .public-booking-primary,
          .public-booking-secondary {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
