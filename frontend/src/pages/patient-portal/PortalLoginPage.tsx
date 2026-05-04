import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
import {
  buildPortalUrl,
  DEFAULT_PATIENT_PORTAL_TENANT_ID,
  sanitizePortalRedirect,
} from '../../utils/patientPortalLinks';

export function PortalLoginPage() {
  const { isAuthenticated, login, isLoading } = usePatientPortalAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedTenantId = searchParams.get('tenantId') || DEFAULT_PATIENT_PORTAL_TENANT_ID;
  const redirectPath = sanitizePortalRedirect(searchParams.get('redirect'), '/portal/dashboard');

  const [tenantId, setTenantId] = useState(requestedTenantId);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTenantId(requestedTenantId);
  }, [requestedTenantId]);

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(tenantId, email, password);
      navigate(redirectPath);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className={`plp-shell ${mounted ? 'plp-mounted' : ''}`}>
      {/* Background layers */}
      <div className="plp-bg-mesh" />
      <div className="plp-bg-glow plp-bg-glow--green" />
      <div className="plp-bg-glow plp-bg-glow--teal" />
      <div className="plp-bg-glow plp-bg-glow--emerald" />

      {/* Decorative rings */}
      <div className="plp-ring plp-ring-1" />
      <div className="plp-ring plp-ring-2" />
      <div className="plp-ring plp-ring-3" />

      {/* Floating orbs */}
      <div className="plp-orb plp-orb-a" />
      <div className="plp-orb plp-orb-b" />
      <div className="plp-orb plp-orb-c" />
      <div className="plp-orb plp-orb-d" />

      {/* Dot grid + grain */}
      <div className="plp-dots" />
      <div className="plp-grain" />

      {/* Back link */}
      <Link to="/" className="plp-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </Link>

      <main className="plp-main">
        {/* Wordmark */}
        <div className="plp-wordmark">
          <div className="plp-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="plp-title">Patient Portal</h1>
          <div className="plp-divider">
            <span className="plp-divider-line" />
            <span className="plp-divider-diamond" />
            <span className="plp-divider-line" />
          </div>
          <span className="plp-subtitle">Dermatology&nbsp;&nbsp;Demo&nbsp;&nbsp;Office</span>
        </div>

        {/* Card */}
        <div className="plp-card">
          <div className="plp-card-accent" />
          <div className="plp-card-shimmer" />

          <div className="plp-card-inner">
            <div className="plp-card-header">
              <div className="plp-welcome-pill">
                <span className="plp-dot" />
                Welcome back
              </div>
              <h2 className="plp-card-title">Sign in to your account</h2>
              <p className="plp-card-sub">Access your health information securely</p>
            </div>

            {error && (
              <div className="plp-error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="plp-form">
              <div className={`plp-field ${focusedField === 'email' ? 'plp-field--focused' : ''} ${email ? 'plp-field--filled' : ''}`}>
                <label htmlFor="plp-email">Email Address</label>
                <div className="plp-input-wrap">
                  <svg className="plp-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    id="plp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    required
                    autoComplete="username"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className={`plp-field ${focusedField === 'password' ? 'plp-field--focused' : ''} ${password ? 'plp-field--filled' : ''}`}>
                <label htmlFor="plp-password">Password</label>
                <div className="plp-input-wrap">
                  <svg className="plp-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    id="plp-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="plp-toggle-pw"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide entered characters' : 'Show entered characters'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="plp-options">
                <label className="plp-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="plp-checkmark" />
                  <span>Remember me</span>
                </label>
                <Link to="/portal/forgot-password" className="plp-forgot">Forgot password?</Link>
              </div>

              <button type="submit" disabled={isLoading} className="plp-submit-btn">
                {isLoading ? (
                  <>
                    <span className="plp-spinner" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12,5 19,12 12,19"/>
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="plp-divider-row"><span>New to the portal?</span></div>

            <Link
              to={buildPortalUrl('/portal/register', { tenantId, redirect: redirectPath })}
              className="plp-secondary-btn"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
              <span>Create Account</span>
            </Link>

            <Link
              to={buildPortalUrl('/book-appointment/guest', { tenantId })}
              className="plp-ghost-btn"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>Schedule as guest</span>
            </Link>

            <div className="plp-security">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9,12 11,14 15,10"/>
              </svg>
              <span>256-bit SSL encrypted connection</span>
            </div>

            {/* Beta credentials */}
            <div className="plp-creds">
              <div className="plp-creds-header">Beta test credentials — click to fill</div>
              {[
                { label: 'Alex Johnson',    email: 'patient@demo.portal', password: 'Portal123!' },
                { label: 'Jane Doe',        email: 'jane@demo.portal',    password: 'Portal123!' },
                { label: 'Marcus Williams', email: 'marcus@demo.portal',  password: 'Portal123!' },
                { label: 'Sofia Chen',      email: 'sofia@demo.portal',   password: 'Portal123!' },
              ].map((cred, i) => (
                <button
                  key={cred.email}
                  type="button"
                  className={`plp-cred-row${i > 0 ? ' plp-cred-row--border' : ''}`}
                  onClick={() => { setEmail(cred.email); setPassword(cred.password); }}
                >
                  <span className="plp-cred-label">{cred.label}</span>
                  <code className="plp-cred-email">{cred.email}</code>
                  <code className="plp-cred-pw">Portal123!</code>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="plp-footer">Beta v0.1 &nbsp;·&nbsp; Authorized testers only &nbsp;·&nbsp; Not for clinical use</p>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Shell ── */
        .plp-shell {
          min-height: 100vh;
          background: #e8f5ee;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 64px 24px 48px;
          position: relative;
          overflow: hidden;
          font-family: 'DM Sans', system-ui, sans-serif;
        }

        /* ── Background mesh ── */
        .plp-bg-mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 120% 80% at 0% 0%,   #c8f5e0 0%, transparent 55%),
            radial-gradient(ellipse 100% 70% at 100% 100%, #bbf7d0 0%, transparent 55%),
            radial-gradient(ellipse 80%  80% at 55%  45%,  #f0fdf9 0%, transparent 60%),
            linear-gradient(160deg, #e6f7ef 0%, #dcfce7 100%);
        }

        .plp-bg-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(100px);
          animation: plp-float 20s ease-in-out infinite;
        }
        .plp-bg-glow--green   { width: 700px; height: 700px; background: rgba(16,185,129,0.28); top: -200px; left: -200px; }
        .plp-bg-glow--teal    { width: 600px; height: 600px; background: rgba(20,184,166,0.20); bottom: -180px; right: -180px; animation-direction: reverse; animation-duration: 24s; }
        .plp-bg-glow--emerald { width: 400px; height: 400px; background: rgba(52,211,153,0.15); top: 50%; left: 55%; transform: translate(-50%,-50%); animation-duration: 18s; animation-delay: 4s; }

        @keyframes plp-float {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(30px,-24px) scale(1.06); }
          66%      { transform: translate(-20px,18px) scale(0.95); }
        }

        /* ── Rings ── */
        .plp-ring {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          animation: plp-spin 60s linear infinite;
        }
        .plp-ring-1 { width: 900px; height: 900px; top: 50%; left: 50%; transform: translate(-50%,-50%); border: 1px solid rgba(16,185,129,0.10); }
        .plp-ring-2 { width: 660px; height: 660px; top: 50%; left: 50%; transform: translate(-50%,-50%); border: 1px solid rgba(5,150,105,0.08); animation-direction: reverse; animation-duration: 45s; }
        .plp-ring-3 { width: 420px; height: 420px; top: 50%; left: 50%; transform: translate(-50%,-50%); border: 1px dashed rgba(16,185,129,0.07); animation-duration: 80s; }

        @keyframes plp-spin {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }

        /* ── Orbs ── */
        .plp-orb { position: absolute; border-radius: 50%; pointer-events: none; animation: plp-bob 8s ease-in-out infinite; }
        .plp-orb-a { width: 14px; height: 14px; background: #10b981; opacity: 0.7; top: 18%; left: 12%; animation-delay: 0s; }
        .plp-orb-b { width: 8px;  height: 8px;  background: #059669; opacity: 0.55; top: 22%; right: 15%; animation-delay: 2s; }
        .plp-orb-c { width: 18px; height: 18px; background: radial-gradient(circle,#34d399,#10b981); opacity: 0.5; bottom: 25%; left: 8%; animation-delay: 3.5s; }
        .plp-orb-d { width: 10px; height: 10px; background: #6ee7b7; opacity: 0.6; bottom: 18%; right: 12%; animation-delay: 1.5s; }

        @keyframes plp-bob {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-14px); }
        }

        /* ── Dot grid ── */
        .plp-dots {
          position: absolute; inset: 0; pointer-events: none;
          background-image: radial-gradient(circle, rgba(5,150,105,0.2) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(ellipse 75% 75% at 50% 50%, black 30%, transparent 100%);
        }

        /* ── Grain ── */
        .plp-grain {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px;
        }

        /* ── Back link ── */
        .plp-back {
          position: fixed;
          top: 1.25rem; left: 1.5rem;
          z-index: 10;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 16px;
          border-radius: 999px;
          background: rgba(255,255,255,0.75);
          border: 1px solid rgba(16,185,129,0.3);
          backdrop-filter: blur(12px);
          font-size: 0.8rem;
          font-weight: 600;
          color: #065f46;
          text-decoration: none;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(16,185,129,0.1);
        }
        .plp-back:hover { background: rgba(255,255,255,0.9); border-color: rgba(16,185,129,0.5); transform: translateX(-2px); }

        /* ── Main ── */
        .plp-main {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 500px;
        }

        /* ── Wordmark ── */
        .plp-wordmark {
          text-align: center;
          margin-bottom: 36px;
          opacity: 0;
          animation: plp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
        }

        .plp-icon-wrap {
          width: 64px; height: 64px;
          margin: 0 auto 16px;
          background: linear-gradient(135deg, rgba(16,185,129,0.18), rgba(52,211,153,0.12));
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #059669;
          box-shadow: 0 4px 20px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.6);
        }

        .plp-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(2.4rem, 8vw, 3.6rem);
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1;
          color: #064e3b;
          text-shadow: 0 2px 30px rgba(16,185,129,0.18);
        }

        .plp-divider {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; margin: 10px 0 8px;
        }
        .plp-divider-line { flex: 1; max-width: 70px; height: 1px; background: linear-gradient(to right, transparent, rgba(5,150,105,0.4)); }
        .plp-divider-line:last-child { background: linear-gradient(to left, transparent, rgba(5,150,105,0.4)); }
        .plp-divider-diamond { width: 6px; height: 6px; background: #10b981; transform: rotate(45deg); flex-shrink: 0; opacity: 0.7; }

        .plp-subtitle {
          display: block;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: clamp(0.7rem, 2.2vw, 0.9rem);
          font-weight: 400;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: #6b7280;
        }

        /* ── Card ── */
        .plp-card {
          position: relative;
          width: 100%;
          border-radius: 24px;
          overflow: hidden;
          border: 1.5px solid rgba(255,255,255,0.85);
          backdrop-filter: blur(20px);
          box-shadow:
            0 2px 8px rgba(0,0,0,0.05),
            0 12px 40px rgba(16,185,129,0.14),
            inset 0 1px 0 rgba(255,255,255,0.9);
          opacity: 0;
          animation: plp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 0.22s forwards;
          transition: box-shadow 0.3s ease, border-color 0.3s ease;
        }

        .plp-card:hover {
          border-color: rgba(16,185,129,0.4);
          box-shadow:
            0 4px 12px rgba(0,0,0,0.06),
            0 20px 60px rgba(16,185,129,0.22),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        /* Background fill */
        .plp-card::before {
          content: '';
          position: absolute; inset: 0;
          background: rgba(255,255,255,0.98);
          pointer-events: none;
        }

        /* Top accent bar */
        .plp-card-accent {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #059669, #34d399, #10b981);
          border-radius: 24px 24px 0 0;
          z-index: 1;
        }

        /* Shimmer */
        .plp-card-shimmer {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 80% 120% at 0% 50%, rgba(16,185,129,0.07), transparent);
          opacity: 0; transition: opacity 0.3s ease;
        }
        .plp-card:hover .plp-card-shimmer { opacity: 1; }

        .plp-card-inner {
          position: relative;
          z-index: 1;
          padding: 2.5rem 2.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* ── Card header ── */
        .plp-card-header { text-align: center; margin-bottom: 1.75rem; }

        .plp-welcome-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 16px;
          border-radius: 999px;
          background: linear-gradient(135deg, #f0fdf4, #dcfce7);
          border: 1px solid rgba(16,185,129,0.3);
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #065f46;
          margin-bottom: 0.85rem;
        }

        .plp-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #10b981;
          flex-shrink: 0;
          animation: plp-pulse-dot 2.4s ease-in-out infinite;
        }

        @keyframes plp-pulse-dot {
          0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
          50%      { box-shadow: 0 0 0 5px rgba(16,185,129,0); }
        }

        .plp-card-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.65rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.35rem;
          letter-spacing: -0.02em;
        }

        .plp-card-sub { font-size: 0.9rem; color: #6b7280; margin: 0; }

        /* ── Error ── */
        .plp-error {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          border: 1px solid #fecaca;
          border-radius: 12px;
          margin-bottom: 1.25rem;
          animation: plp-shake 0.5s ease-in-out;
        }
        @keyframes plp-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        .plp-error svg { width: 18px; height: 18px; color: #dc2626; flex-shrink: 0; }
        .plp-error span { color: #991b1b; font-size: 0.875rem; font-weight: 500; }

        /* ── Form ── */
        .plp-form { display: flex; flex-direction: column; gap: 1.1rem; margin-bottom: 0; }

        .plp-field { position: relative; }
        .plp-field label { display: block; font-size: 0.82rem; font-weight: 600; color: #374151; margin-bottom: 0.45rem; }

        .plp-input-wrap { position: relative; display: flex; align-items: center; }

        .plp-field-icon {
          position: absolute; left: 0.9rem;
          width: 18px; height: 18px;
          color: #9ca3af;
          pointer-events: none;
          transition: color 0.2s ease;
        }
        .plp-field--focused .plp-field-icon,
        .plp-field--filled  .plp-field-icon { color: #059669; }

        .plp-field input {
          width: 100%;
          padding: 0.8rem 1rem 0.8rem 2.75rem;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          font-size: 0.95rem;
          font-family: inherit;
          background: #fff;
          transition: all 0.2s ease;
          color: #111827;
        }
        .plp-field input:focus {
          outline: none;
          border-color: #10b981;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(16,185,129,0.12);
        }
        .plp-field input::placeholder { color: #9ca3af; }

        .plp-toggle-pw {
          position: absolute; right: 0.6rem;
          background: none; border: none;
          padding: 0.4rem; cursor: pointer;
          color: #9ca3af; transition: color 0.2s ease;
          display: flex; align-items: center;
        }
        .plp-toggle-pw:hover { color: #059669; }
        .plp-toggle-pw svg { width: 18px; height: 18px; }

        /* ── Options ── */
        .plp-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.25rem;
        }

        .plp-checkbox { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; user-select: none; }
        .plp-checkbox input { display: none; }
        .plp-checkmark {
          width: 18px; height: 18px;
          border: 2px solid #d1d5db;
          border-radius: 5px;
          position: relative;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .plp-checkbox input:checked + .plp-checkmark {
          background: linear-gradient(135deg, #059669, #10b981);
          border-color: transparent;
        }
        .plp-checkbox input:checked + .plp-checkmark::after {
          content: '';
          position: absolute;
          left: 4px; top: 1px;
          width: 5px; height: 9px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .plp-checkbox span:last-child { font-size: 0.82rem; color: #4b5563; }

        .plp-forgot { font-size: 0.82rem; color: #059669; text-decoration: none; font-weight: 600; transition: color 0.2s ease; }
        .plp-forgot:hover { color: #047857; }

        /* ── Submit ── */
        .plp-submit-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 0.6rem;
          padding: 0.9rem 1.5rem;
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 0.5rem;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 14px rgba(16,185,129,0.35);
        }
        .plp-submit-btn::before {
          content: '';
          position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s ease;
        }
        .plp-submit-btn:hover::before { left: 100%; }
        .plp-submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(16,185,129,0.45); }
        .plp-submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .plp-submit-btn svg { width: 18px; height: 18px; transition: transform 0.3s ease; }
        .plp-submit-btn:hover svg { transform: translateX(4px); }

        .plp-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: plp-spin-anim 0.8s linear infinite;
        }
        @keyframes plp-spin-anim { to { transform: rotate(360deg); } }

        /* ── Divider row ── */
        .plp-divider-row {
          display: flex; align-items: center;
          margin: 1.25rem 0 1rem;
        }
        .plp-divider-row::before, .plp-divider-row::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
        .plp-divider-row span { padding: 0 0.9rem; font-size: 0.82rem; color: #9ca3af; white-space: nowrap; }

        /* ── Secondary btn ── */
        .plp-secondary-btn {
          display: flex; align-items: center; justify-content: center; gap: 0.6rem;
          padding: 0.8rem 1.5rem;
          background: white;
          color: #374151;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: inherit;
          text-decoration: none;
          transition: all 0.25s ease;
          margin-bottom: 0.6rem;
        }
        .plp-secondary-btn svg { width: 18px; height: 18px; }
        .plp-secondary-btn:hover { border-color: #10b981; color: #059669; background: #f9fafb; }

        /* ── Ghost btn ── */
        .plp-ghost-btn {
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          padding: 0.7rem 1.5rem;
          background: transparent;
          color: #6b7280;
          border: 1.5px dashed #d1d5db;
          border-radius: 12px;
          font-size: 0.83rem;
          font-weight: 500;
          font-family: inherit;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .plp-ghost-btn svg { width: 15px; height: 15px; flex-shrink: 0; }
        .plp-ghost-btn:hover { border-color: #10b981; color: #059669; background: rgba(16,185,129,0.04); }

        /* ── Security ── */
        .plp-security {
          display: flex; align-items: center; justify-content: center; gap: 0.4rem;
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid #f3f4f6;
        }
        .plp-security svg { width: 16px; height: 16px; color: #10b981; }
        .plp-security span { font-size: 0.75rem; color: #9ca3af; }

        /* ── Beta creds ── */
        .plp-creds {
          margin-top: 1.25rem;
          border-radius: 12px;
          border: 1px solid rgba(16,185,129,0.2);
          overflow: hidden;
        }
        .plp-creds-header {
          padding: 0.55rem 1rem;
          background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(52,211,153,0.05));
          border-bottom: 1px solid rgba(16,185,129,0.12);
          font-size: 0.68rem;
          font-weight: 700;
          color: #065f46;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .plp-cred-row {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 0.55rem 1rem;
          background: transparent; border: none; cursor: pointer;
          text-align: left; transition: background 0.15s; font-family: inherit;
        }
        .plp-cred-row--border { border-top: 1px solid rgba(16,185,129,0.08); }
        .plp-cred-row:hover { background: rgba(16,185,129,0.05); }
        .plp-cred-label { font-size: 0.7rem; font-weight: 700; color: #059669; width: 110px; flex-shrink: 0; }
        .plp-cred-email { font-size: 0.75rem; color: #374151; flex: 1; font-family: 'SF Mono','Fira Code',monospace; }
        .plp-cred-pw    { font-size: 0.75rem; color: #9ca3af; font-family: 'SF Mono','Fira Code',monospace; }

        /* ── Footer ── */
        .plp-footer {
          margin-top: 28px;
          font-size: 0.66rem;
          font-weight: 400;
          color: rgba(6,78,59,0.35);
          letter-spacing: 0.07em;
          text-align: center;
          opacity: 0;
          animation: plp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 0.4s forwards;
        }

        /* ── Entrance ── */
        @keyframes plp-rise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Mobile ── */
        @media (max-width: 540px) {
          .plp-shell { padding: 56px 16px 40px; }
          .plp-card-inner { padding: 2rem 1.5rem 1.75rem; }
          .plp-ring { display: none; }
          .plp-cred-email { display: none; }
        }
      `}</style>
    </div>
  );
}
