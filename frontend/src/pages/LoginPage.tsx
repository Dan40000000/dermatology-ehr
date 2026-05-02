import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

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
    <div className="login-page" style={{
      background: 'linear-gradient(135deg, #1e1147 0%, #4c1d95 50%, #6b21a8 100%)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Language Switcher */}
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 10 }}>
        <LanguageSwitcher />
      </div>
      {/* Animated background elements */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)',
        borderRadius: '50%',
        top: '-250px',
        right: '-250px',
        animation: 'pulse 4s ease-in-out infinite'
      }}></div>
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(192, 132, 252, 0.2) 0%, transparent 70%)',
        borderRadius: '50%',
        bottom: '-200px',
        left: '-200px',
        animation: 'pulse 5s ease-in-out infinite'
      }}></div>

      <div className="login-card" style={{
        background: 'linear-gradient(to bottom right, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9))',
        padding: '3rem',
        borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2)',
        width: '100%',
        maxWidth: '480px',
        backdropFilter: 'blur(20px)',
        zIndex: 1,
        animation: 'slideInUp 0.6s ease-out'
      }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="login-icon" style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
            borderRadius: '20px',
            margin: '0 auto 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)',
            fontSize: '2.5rem',
            color: 'white'
          }}>🏥</div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #6b21a8, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{t('common:appName')}</h1>
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>{t('auth:login.subtitle')}</p>
        </div>

        {sessionNotice && (
          <div
            role="alert"
            style={{
              marginBottom: '1.5rem',
              padding: '0.9rem 1rem',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(251, 191, 36, 0.08))',
              border: '1px solid rgba(217, 119, 6, 0.28)',
              borderRadius: '14px',
              color: '#92400e',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {sessionNotice}
          </div>
        )}

        {isAuthenticated && !forceFreshLogin && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(20, 184, 166, 0.08))',
              border: '1px solid rgba(16, 185, 129, 0.28)',
              borderRadius: '14px',
              color: '#065f46',
            }}
          >
            <p style={{ margin: '0 0 0.35rem', fontWeight: 800, fontSize: '0.9rem' }}>
              Active session detected
            </p>
            <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', lineHeight: 1.45 }}>
              {user?.fullName || user?.email || 'A staff member'} is already signed in on this browser.
              Continue only if this is your workstation session, or sign out before switching users.
            </p>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate(from, { replace: true })}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  background: '#047857',
                  color: '#ffffff',
                  padding: '0.5rem 0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Continue to app
              </button>
              <button
                type="button"
                onClick={logout}
                style={{
                  border: '1px solid rgba(5, 150, 105, 0.35)',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#047857',
                  padding: '0.5rem 0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Sign out first
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <label className="form-field" style={{ display: 'block', marginBottom: '1.5rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
              {t('auth:login.practiceId')}
            </span>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              placeholder="tenant-demo"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                fontSize: '1rem',
                transition: 'all 0.3s ease',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </label>

          <label className="form-field" style={{ display: 'block', marginBottom: '1.5rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
              {t('auth:login.emailAddress')}
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="admin@demo.practice"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                fontSize: '1rem',
                transition: 'all 0.3s ease',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </label>

          <label className="form-field" style={{ display: 'block', marginBottom: '2rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
              {t('auth:login.password')}
            </span>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••••"
                style={{
                  width: '100%',
                  padding: '0.875rem 4.75rem 0.875rem 1rem',
                  borderRadius: '12px',
                  border: '2px solid #e5e7eb',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#8b5cf6';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((current) => !current)}
                style={{
                  position: 'absolute',
                  right: '0.55rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'rgba(139, 92, 246, 0.1)',
                  color: '#6b21a8',
                  borderRadius: '999px',
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button type="submit" disabled={isLoading} className="login-btn" style={{
            width: '100%',
            padding: '1rem',
            borderRadius: '12px',
            border: 'none',
            background: isLoading
              ? 'linear-gradient(135deg, #9ca3af, #6b7280)'
              : 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
            color: 'white',
            fontSize: '1.125rem',
            fontWeight: '700',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
            opacity: isLoading ? 0.7 : 1
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(139, 92, 246, 0.6)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
            }
          }}>
            {isLoading ? t('common:messages.loading') : t('auth:login.signInButton')}
          </button>
        </form>

        <div style={{
          marginTop: '2rem',
          borderRadius: '12px',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '0.6rem 1rem',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(167, 139, 250, 0.1))',
            borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
          }}>
            <p style={{ fontSize: '0.7rem', fontWeight: '700', color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Beta test credentials — click to fill
            </p>
          </div>
          {[
            { label: 'Owner / Admin',   email: 'admin@demo.practice',     password: 'Password123!' },
            { label: 'Physician',       email: 'provider@demo.practice',  password: 'Password123!' },
            { label: 'RN / Nurse',      email: 'nurse@demo.practice',     password: 'Password123!' },
            { label: 'Office Manager',  email: 'manager@demo.practice',   password: 'Password123!' },
            { label: 'Front Desk',      email: 'frontdesk@demo.practice', password: 'Password123!' },
            { label: 'Med. Assistant',  email: 'ma@demo.practice',        password: 'Password123!' },
            { label: 'Billing',         email: 'billing@demo.practice',   password: 'Password123!' },
          ].map((cred, i) => (
            <button
              key={cred.email}
              type="button"
              onClick={() => { setEmail(cred.email); setPassword(cred.password); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '0.55rem 1rem',
                background: 'transparent',
                border: 'none',
                borderTop: i > 0 ? '1px solid rgba(139, 92, 246, 0.08)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139, 92, 246, 0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#7c3aed', width: '88px', flexShrink: 0 }}>{cred.label}</span>
              <code style={{ fontSize: '0.75rem', color: '#374151', flex: 1, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{cred.email}</code>
              <code style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: "'SF Mono', 'Fira Code', monospace" }}>Password123!</code>
            </button>
          ))}
        </div>

        {error && <div className="login-error" style={{
          marginTop: '1rem',
          padding: '1rem',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(248, 113, 113, 0.1))',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#dc2626',
          fontSize: '0.875rem',
          fontWeight: '600',
          textAlign: 'center'
        }}>{error}</div>}
      </div>

      <p className="login-footer" style={{
        marginTop: '2rem',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '0.875rem',
        zIndex: 1
      }}>© 2025 DermEHR • Version 1.0.0</p>
    </div>
  );
}
