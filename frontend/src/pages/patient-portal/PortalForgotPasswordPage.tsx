import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requestPortalPasswordReset } from '../../portalApi';
import { DEFAULT_PATIENT_PORTAL_TENANT_ID } from '../../utils/patientPortalLinks';

type DeliveryMethod = 'email' | 'sms';

export function PortalForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const [tenantId] = useState(searchParams.get('tenantId') || DEFAULT_PATIENT_PORTAL_TENANT_ID);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setDevResetToken(null);
    setSubmitting(true);

    try {
      const response = await requestPortalPasswordReset(
        tenantId,
        deliveryMethod === 'email'
          ? { deliveryMethod, email: email.trim() }
          : { deliveryMethod, phone: phone.trim() }
      );
      setStatus(response.message);
      setDevResetToken(response.resetToken || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset request failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="portal-auth-container">
      <section className="portal-auth-card" aria-label="Forgot password">
        <div className="portal-auth-logo">
          <div className="portal-auth-logo-icon">P</div>
          <h1 className="portal-auth-title">Reset Portal Password</h1>
          <p className="portal-auth-subtitle">Choose where to receive your reset instructions.</p>
        </div>

        {error && <div className="portal-auth-error" role="alert">{error}</div>}
        {status && <div className="portal-auth-success" role="status">{status}</div>}

        <form className="portal-auth-form" onSubmit={handleSubmit}>
          <div className="portal-auth-toggle" role="group" aria-label="Delivery method">
            <button
              type="button"
              className={deliveryMethod === 'email' ? 'active' : ''}
              onClick={() => setDeliveryMethod('email')}
            >
              Email
            </button>
            <button
              type="button"
              className={deliveryMethod === 'sms' ? 'active' : ''}
              onClick={() => setDeliveryMethod('sms')}
            >
              Text
            </button>
          </div>

          {deliveryMethod === 'email' ? (
            <label className="portal-auth-field">
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
          ) : (
            <label className="portal-auth-field">
              Phone number
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                autoComplete="tel"
              />
            </label>
          )}

          <button className="portal-auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Reset'}
          </button>
        </form>

        {devResetToken && (
          <div className="portal-auth-dev-token">
            Development reset token: <code>{devResetToken}</code>
          </div>
        )}

        <p className="portal-auth-link">
          <Link to={`/portal/reset-password?tenantId=${encodeURIComponent(tenantId)}`}>I have a code</Link>
          {' | '}
          <Link to={`/portal/login?tenantId=${encodeURIComponent(tenantId)}`}>Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
