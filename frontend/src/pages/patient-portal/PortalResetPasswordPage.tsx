import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPortalPassword } from '../../portalApi';
import { DEFAULT_PATIENT_PORTAL_TENANT_ID } from '../../utils/patientPortalLinks';

export function PortalResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId') || DEFAULT_PATIENT_PORTAL_TENANT_ID;
  const tokenFromUrl = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const response = await resetPortalPassword(tenantId, {
        token: token.trim(),
        password,
      });
      setStatus(response.message || 'Password reset successfully');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="portal-auth-container">
      <section className="portal-auth-card" aria-label="Set new password">
        <div className="portal-auth-logo">
          <div className="portal-auth-logo-icon">P</div>
          <h1 className="portal-auth-title">Set New Password</h1>
          <p className="portal-auth-subtitle">Enter your email token or text message code.</p>
        </div>

        {error && <div className="portal-auth-error" role="alert">{error}</div>}
        {status && <div className="portal-auth-success" role="status">{status}</div>}

        <form className="portal-auth-form" onSubmit={handleSubmit}>
          <label className="portal-auth-field">
            Reset token or code
            <input
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              autoComplete="one-time-code"
            />
          </label>

          <label className="portal-auth-field">
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          <label className="portal-auth-field">
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          <button className="portal-auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <p className="portal-auth-link">
          <Link to={`/portal/forgot-password?tenantId=${encodeURIComponent(tenantId)}`}>Request another reset</Link>
          {' | '}
          <Link to={`/portal/login?tenantId=${encodeURIComponent(tenantId)}`}>Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
