import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Link } from 'react-router-dom';

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { isAuthenticated, user, login, logout, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state;
  const from = (locationState as { from?: { pathname: string } })?.from?.pathname || '/home';
  const forceFreshLogin = new URLSearchParams(location.search).get('fresh') === '1';

  const [tenantId, setTenantId] = useState('tenant-demo');
  const [email, setEmail] = useState('admin@demo.practice');
  const [password, setPassword] = useState('Password123!');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sessionNotice] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('derm_session_timeout_reason') === 'idle_timeout'
        ? 'For security, you were signed out after 15 minutes of inactivity.'
        : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sessionNotice) return;
    try {
      sessionStorage.removeItem('derm_session_timeout_reason');
    } catch {
      // Ignore browsers that block sessionStorage.
    }
  }, [sessionNotice]);

  useEffect(() => {
    if (!forceFreshLogin) return;
    if (isAuthenticated) {
      logout();
    }
    navigate('/login', { replace: true, state: locationState });
  }, [forceFreshLogin, isAuthenticated, locationState, logout, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(tenantId, email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : t('auth:errors.invalidCredentials'));
    }
  };

  return (
    <div className={`pvp-shell ${mounted ? 'pvp-mounted' : ''}`}>
      {/* Background layers */}
      <div className="pvp-bg-mesh" />
      <div className="pvp-bg-glow pvp-bg-glow--violet" />
      <div className="pvp-bg-glow pvp-bg-glow--purple" />
      <div className="pvp-bg-glow pvp-bg-glow--indigo" />

      {/* Decorative rings */}
      <div className="pvp-ring pvp-ring-1" />
      <div className="pvp-ring pvp-ring-2" />
      <div className="pvp-ring pvp-ring-3" />

      {/* Floating orbs */}
      <div className="pvp-orb pvp-orb-a" />
      <div className="pvp-orb pvp-orb-b" />
      <div className="pvp-orb pvp-orb-c" />
      <div className="pvp-orb pvp-orb-d" />

      {/* Dot grid + grain */}
      <div className="pvp-dots" />
      <div className="pvp-grain" />

      {/* Language switcher */}
      <div style={{ position: 'fixed', top: '1.25rem', right: '1.5rem', zIndex: 10 }}>
        <LanguageSwitcher />
      </div>

      {/* Back link */}
      <Link to="/" className="pvp-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </Link>

      <main className="pvp-main">
        {/* Wordmark */}
        <div className="pvp-wordmark">
          <div className="pvp-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="2.5" y="3.5" width="19" height="17" rx="3" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M7 8.5h10M7 12h10M7 15.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="pvp-title">Provider Login</h1>
          <div className="pvp-divider">
            <span className="pvp-divider-line" />
            <span className="pvp-divider-diamond" />
            <span className="pvp-divider-line" />
          </div>
          <span className="pvp-subtitle">Dermatology&nbsp;&nbsp;Demo&nbsp;&nbsp;Office</span>
        </div>

        {/* Card */}
        <div className="pvp-card">
          <div className="pvp-card-accent" />
          <div className="pvp-card-shimmer" />

          <div className="pvp-card-inner">
            <div className="pvp-card-header">
              <div className="pvp-badge-pill">
                <span className="pvp-dot" />
                Clinical Access
              </div>
              <h2 className="pvp-card-title">Sign in to your account</h2>
              <p className="pvp-card-sub">Access your practice dashboard</p>
            </div>

            {sessionNotice && (
              <div className="pvp-notice" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{sessionNotice}</span>
              </div>
            )}

            {isAuthenticated && !forceFreshLogin && (
              <div className="pvp-session-alert" role="status" aria-live="polite">
                <p className="pvp-session-title">Active session detected</p>
                <p className="pvp-session-body">
                  {user?.fullName || user?.email || 'A staff member'} is already signed in on this browser.
                </p>
                <div className="pvp-session-actions">
                  <button
                    type="button"
                    className="pvp-session-continue"
                    onClick={() => navigate(from, { replace: true })}
                  >
                    Continue to app
                  </button>
                  <button
                    type="button"
                    className="pvp-session-signout"
                    onClick={logout}
                  >
                    Sign out first
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="pvp-error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="pvp-form">
              <div className={`pvp-field ${focusedField === 'tenantId' ? 'pvp-field--focused' : ''} ${tenantId ? 'pvp-field--filled' : ''}`}>
                <label htmlFor="pvp-tenant">{t('auth:login.practiceId')}</label>
                <div className="pvp-input-wrap">
                  <svg className="pvp-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9,22 9,12 15,12 15,22"/>
                  </svg>
                  <input
                    id="pvp-tenant"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    required
                    placeholder="tenant-demo"
                    onFocus={() => setFocusedField('tenantId')}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
              </div>

              <div className={`pvp-field ${focusedField === 'email' ? 'pvp-field--focused' : ''} ${email ? 'pvp-field--filled' : ''}`}>
                <label htmlFor="pvp-email">{t('auth:login.emailAddress')}</label>
                <div className="pvp-input-wrap">
                  <svg className="pvp-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    id="pvp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="admin@demo.practice"
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
              </div>

              <div className={`pvp-field ${focusedField === 'password' ? 'pvp-field--focused' : ''} ${password ? 'pvp-field--filled' : ''}`}>
                <label htmlFor="pvp-password">{t('auth:login.password')}</label>
                <div className="pvp-input-wrap">
                  <svg className="pvp-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    id="pvp-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <button
                    type="button"
                    className="pvp-toggle-pw"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoading} className="pvp-submit-btn">
                {isLoading ? (
                  <>
                    <span className="pvp-spinner" />
                    <span>{t('common:messages.loading')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('auth:login.signInButton')}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12,5 19,12 12,19"/>
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Beta credentials */}
            <div className="pvp-creds">
              <div className="pvp-creds-header">Beta test credentials — click to fill</div>
              {[
                { label: 'Owner / Admin',  email: 'admin@demo.practice',     password: 'Password123!' },
                { label: 'Physician',      email: 'provider@demo.practice',  password: 'Password123!' },
                { label: 'RN / Nurse',     email: 'nurse@demo.practice',     password: 'Password123!' },
                { label: 'Office Manager', email: 'manager@demo.practice',   password: 'Password123!' },
                { label: 'Front Desk',     email: 'frontdesk@demo.practice', password: 'Password123!' },
                { label: 'Med. Assistant', email: 'ma@demo.practice',        password: 'Password123!' },
                { label: 'Billing',        email: 'billing@demo.practice',   password: 'Password123!' },
              ].map((cred, i) => (
                <button
                  key={cred.email}
                  type="button"
                  className={`pvp-cred-row${i > 0 ? ' pvp-cred-row--border' : ''}`}
                  onClick={() => { setEmail(cred.email); setPassword(cred.password); }}
                >
                  <span className="pvp-cred-label">{cred.label}</span>
                  <code className="pvp-cred-email">{cred.email}</code>
                  <code className="pvp-cred-pw">Password123!</code>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="pvp-footer">© 2025 DermEHR &nbsp;·&nbsp; Version 1.0.0</p>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Shell ── */
        .pvp-shell {
          min-height: 100vh;
          background: #f3f0ff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 64px 24px 48px;
          position: relative;
          overflow: hidden;
          font-family: 'DM Sans', system-ui, sans-serif;
        }

        /* ── Background mesh ── */
        .pvp-bg-mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 120% 80% at 0% 0%,   #ede9fe 0%, transparent 55%),
            radial-gradient(ellipse 100% 70% at 100% 100%, #ddd6fe 0%, transparent 55%),
            radial-gradient(ellipse 80%  80% at 55%  45%,  #faf5ff 0%, transparent 60%),
            linear-gradient(160deg, #f0ebff 0%, #ede9fe 100%);
        }

        .pvp-bg-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(100px);
          animation: pvp-float 20s ease-in-out infinite;
        }
        .pvp-bg-glow--violet  { width: 700px; height: 700px; background: rgba(139,92,246,0.25);  top: -200px; left: -200px; }
        .pvp-bg-glow--purple  { width: 600px; height: 600px; background: rgba(168,85,247,0.20);  bottom: -180px; right: -180px; animation-direction: reverse; animation-duration: 24s; }
        .pvp-bg-glow--indigo  { width: 400px; height: 400px; background: rgba(99,102,241,0.15);  top: 50%; left: 55%; transform: translate(-50%,-50%); animation-duration: 18s; animation-delay: 4s; }

        @keyframes pvp-float {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(30px,-24px) scale(1.06); }
          66%      { transform: translate(-20px,18px) scale(0.95); }
        }

        /* ── Rings ── */
        .pvp-ring {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          animation: pvp-spin 60s linear infinite;
        }
        .pvp-ring-1 { width: 900px; height: 900px; top: 50%; left: 50%; transform: translate(-50%,-50%); border: 1px solid rgba(139,92,246,0.10); }
        .pvp-ring-2 { width: 660px; height: 660px; top: 50%; left: 50%; transform: translate(-50%,-50%); border: 1px solid rgba(168,85,247,0.08); animation-direction: reverse; animation-duration: 45s; }
        .pvp-ring-3 { width: 420px; height: 420px; top: 50%; left: 50%; transform: translate(-50%,-50%); border: 1px dashed rgba(139,92,246,0.07); animation-duration: 80s; }

        @keyframes pvp-spin {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }

        /* ── Orbs ── */
        .pvp-orb { position: absolute; border-radius: 50%; pointer-events: none; animation: pvp-bob 8s ease-in-out infinite; }
        .pvp-orb-a { width: 14px; height: 14px; background: #8b5cf6; opacity: 0.65; top: 18%; left: 12%; animation-delay: 0s; }
        .pvp-orb-b { width: 8px;  height: 8px;  background: #a78bfa; opacity: 0.55; top: 22%; right: 15%; animation-delay: 2s; }
        .pvp-orb-c { width: 18px; height: 18px; background: radial-gradient(circle,#c4b5fd,#8b5cf6); opacity: 0.45; bottom: 25%; left: 8%; animation-delay: 3.5s; }
        .pvp-orb-d { width: 10px; height: 10px; background: #7c3aed; opacity: 0.55; bottom: 18%; right: 12%; animation-delay: 1.5s; }

        @keyframes pvp-bob {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-14px); }
        }

        /* ── Dot grid ── */
        .pvp-dots {
          position: absolute; inset: 0; pointer-events: none;
          background-image: radial-gradient(circle, rgba(109,40,217,0.18) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(ellipse 75% 75% at 50% 50%, black 30%, transparent 100%);
        }

        /* ── Grain ── */
        .pvp-grain {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px;
        }

        /* ── Back link ── */
        .pvp-back {
          position: fixed;
          top: 1.25rem; left: 1.5rem;
          z-index: 10;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 16px;
          border-radius: 999px;
          background: rgba(255,255,255,0.75);
          border: 1px solid rgba(139,92,246,0.3);
          backdrop-filter: blur(12px);
          font-size: 0.8rem;
          font-weight: 600;
          color: #6b21a8;
          text-decoration: none;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(139,92,246,0.1);
        }
        .pvp-back:hover { background: rgba(255,255,255,0.9); border-color: rgba(139,92,246,0.5); transform: translateX(-2px); }

        /* ── Main ── */
        .pvp-main {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 500px;
        }

        /* ── Wordmark ── */
        .pvp-wordmark {
          text-align: center;
          margin-bottom: 36px;
          opacity: 0;
          animation: pvp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
        }

        .pvp-icon-wrap {
          width: 64px; height: 64px;
          margin: 0 auto 16px;
          background: linear-gradient(135deg, rgba(139,92,246,0.18), rgba(167,139,250,0.12));
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7c3aed;
          box-shadow: 0 4px 20px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.6);
        }

        .pvp-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(2.4rem, 8vw, 3.6rem);
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1;
          color: #3b0764;
          text-shadow: 0 2px 30px rgba(139,92,246,0.18);
        }

        .pvp-divider {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; margin: 10px 0 8px;
        }
        .pvp-divider-line { flex: 1; max-width: 70px; height: 1px; background: linear-gradient(to right, transparent, rgba(139,92,246,0.4)); }
        .pvp-divider-line:last-child { background: linear-gradient(to left, transparent, rgba(139,92,246,0.4)); }
        .pvp-divider-diamond { width: 6px; height: 6px; background: #8b5cf6; transform: rotate(45deg); flex-shrink: 0; opacity: 0.7; }

        .pvp-subtitle {
          display: block;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: clamp(0.7rem, 2.2vw, 0.9rem);
          font-weight: 400;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: #6b7280;
        }

        /* ── Card ── */
        .pvp-card {
          position: relative;
          width: 100%;
          border-radius: 24px;
          overflow: hidden;
          border: 1.5px solid rgba(255,255,255,0.85);
          backdrop-filter: blur(20px);
          box-shadow:
            0 2px 8px rgba(0,0,0,0.05),
            0 12px 40px rgba(139,92,246,0.14),
            inset 0 1px 0 rgba(255,255,255,0.9);
          opacity: 0;
          animation: pvp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 0.22s forwards;
          transition: box-shadow 0.3s ease, border-color 0.3s ease;
        }

        .pvp-card:hover {
          border-color: rgba(139,92,246,0.4);
          box-shadow:
            0 4px 12px rgba(0,0,0,0.06),
            0 20px 60px rgba(139,92,246,0.22),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        .pvp-card::before {
          content: '';
          position: absolute; inset: 0;
          background: rgba(255,255,255,0.98);
          pointer-events: none;
        }

        .pvp-card-accent {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #6b21a8, #a78bfa, #8b5cf6);
          border-radius: 24px 24px 0 0;
          z-index: 1;
        }

        .pvp-card-shimmer {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 80% 120% at 0% 50%, rgba(139,92,246,0.07), transparent);
          opacity: 0; transition: opacity 0.3s ease;
        }
        .pvp-card:hover .pvp-card-shimmer { opacity: 1; }

        .pvp-card-inner {
          position: relative;
          z-index: 1;
          padding: 2.5rem 2.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* ── Card header ── */
        .pvp-card-header { text-align: center; margin-bottom: 1.75rem; }

        .pvp-badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 16px;
          border-radius: 999px;
          background: linear-gradient(135deg, #faf5ff, #ede9fe);
          border: 1px solid rgba(139,92,246,0.3);
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #6b21a8;
          margin-bottom: 0.85rem;
        }

        .pvp-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #8b5cf6;
          flex-shrink: 0;
          animation: pvp-pulse-dot 2.4s ease-in-out infinite;
        }

        @keyframes pvp-pulse-dot {
          0%,100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.6); }
          50%      { box-shadow: 0 0 0 5px rgba(139,92,246,0); }
        }

        .pvp-card-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.65rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.35rem;
          letter-spacing: -0.02em;
        }

        .pvp-card-sub { font-size: 0.9rem; color: #6b7280; margin: 0; }

        /* ── Notices ── */
        .pvp-notice {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border: 1px solid #fde68a;
          border-radius: 12px;
          margin-bottom: 1.25rem;
        }
        .pvp-notice svg { width: 18px; height: 18px; color: #d97706; flex-shrink: 0; }
        .pvp-notice span { color: #92400e; font-size: 0.875rem; font-weight: 600; }

        .pvp-session-alert {
          padding: 1rem 1.1rem;
          background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(20,184,166,0.05));
          border: 1px solid rgba(16,185,129,0.25);
          border-radius: 14px;
          margin-bottom: 1.25rem;
        }
        .pvp-session-title { font-weight: 800; font-size: 0.88rem; color: #065f46; margin-bottom: 0.3rem; }
        .pvp-session-body  { font-size: 0.8rem; color: #047857; line-height: 1.45; margin-bottom: 0.8rem; }
        .pvp-session-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .pvp-session-continue {
          border: none; border-radius: 999px;
          background: #047857; color: #fff;
          padding: 0.45rem 0.85rem;
          font-weight: 800; font-size: 0.8rem; font-family: inherit; cursor: pointer;
        }
        .pvp-session-signout {
          border: 1px solid rgba(5,150,105,0.35); border-radius: 999px;
          background: #fff; color: #047857;
          padding: 0.45rem 0.85rem;
          font-weight: 800; font-size: 0.8rem; font-family: inherit; cursor: pointer;
        }

        .pvp-error {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          border: 1px solid #fecaca;
          border-radius: 12px;
          margin-bottom: 1.25rem;
          animation: pvp-shake 0.5s ease-in-out;
        }
        @keyframes pvp-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        .pvp-error svg { width: 18px; height: 18px; color: #dc2626; flex-shrink: 0; }
        .pvp-error span { color: #991b1b; font-size: 0.875rem; font-weight: 500; }

        /* ── Form ── */
        .pvp-form { display: flex; flex-direction: column; gap: 1.1rem; margin-bottom: 1.5rem; }

        .pvp-field { position: relative; }
        .pvp-field label { display: block; font-size: 0.82rem; font-weight: 600; color: #374151; margin-bottom: 0.45rem; }

        .pvp-input-wrap { position: relative; display: flex; align-items: center; }

        .pvp-field-icon {
          position: absolute; left: 0.9rem;
          width: 18px; height: 18px;
          color: #9ca3af;
          pointer-events: none;
          transition: color 0.2s ease;
        }
        .pvp-field--focused .pvp-field-icon,
        .pvp-field--filled  .pvp-field-icon { color: #7c3aed; }

        .pvp-field input {
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
        .pvp-field input:focus {
          outline: none;
          border-color: #8b5cf6;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(139,92,246,0.12);
        }
        .pvp-field input::placeholder { color: #9ca3af; }

        .pvp-toggle-pw {
          position: absolute; right: 0.6rem;
          background: rgba(139,92,246,0.1); border: none;
          border-radius: 999px;
          padding: 0.35rem 0.7rem;
          font-size: 0.76rem; font-weight: 700; font-family: inherit;
          cursor: pointer; color: #6b21a8;
          transition: background 0.2s ease;
        }
        .pvp-toggle-pw:hover { background: rgba(139,92,246,0.18); }

        /* ── Submit ── */
        .pvp-submit-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 0.6rem;
          padding: 0.9rem 1.5rem;
          background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 14px rgba(139,92,246,0.35);
        }
        .pvp-submit-btn::before {
          content: '';
          position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s ease;
        }
        .pvp-submit-btn:hover::before { left: 100%; }
        .pvp-submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(139,92,246,0.45); }
        .pvp-submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .pvp-submit-btn svg { width: 18px; height: 18px; transition: transform 0.3s ease; }
        .pvp-submit-btn:hover svg { transform: translateX(4px); }

        .pvp-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: pvp-spin-anim 0.8s linear infinite;
        }
        @keyframes pvp-spin-anim { to { transform: rotate(360deg); } }

        /* ── Beta creds ── */
        .pvp-creds {
          border-radius: 12px;
          border: 1px solid rgba(139,92,246,0.2);
          overflow: hidden;
        }
        .pvp-creds-header {
          padding: 0.55rem 1rem;
          background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(167,139,250,0.05));
          border-bottom: 1px solid rgba(139,92,246,0.12);
          font-size: 0.68rem;
          font-weight: 700;
          color: #6b21a8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .pvp-cred-row {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 0.55rem 1rem;
          background: transparent; border: none; cursor: pointer;
          text-align: left; transition: background 0.15s; font-family: inherit;
        }
        .pvp-cred-row--border { border-top: 1px solid rgba(139,92,246,0.08); }
        .pvp-cred-row:hover { background: rgba(139,92,246,0.05); }
        .pvp-cred-label { font-size: 0.68rem; font-weight: 700; color: #7c3aed; width: 90px; flex-shrink: 0; }
        .pvp-cred-email { font-size: 0.75rem; color: #374151; flex: 1; font-family: 'SF Mono','Fira Code',monospace; }
        .pvp-cred-pw    { font-size: 0.75rem; color: #9ca3af; font-family: 'SF Mono','Fira Code',monospace; }

        /* ── Footer ── */
        .pvp-footer {
          margin-top: 28px;
          font-size: 0.66rem;
          font-weight: 400;
          color: rgba(59,7,100,0.35);
          letter-spacing: 0.07em;
          text-align: center;
          opacity: 0;
          animation: pvp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 0.4s forwards;
        }

        /* ── Entrance ── */
        @keyframes pvp-rise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Mobile ── */
        @media (max-width: 540px) {
          .pvp-shell { padding: 56px 16px 40px; }
          .pvp-card-inner { padding: 2rem 1.5rem 1.75rem; }
          .pvp-ring { display: none; }
          .pvp-cred-email { display: none; }
        }
      `}</style>
    </div>
  );
}
