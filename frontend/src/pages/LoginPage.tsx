import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { isAuthenticated, login, isLoading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/home';

  const [tenantId, setTenantId] = useState('tenant-demo');
  const [email, setEmail] = useState('admin@demo.practice');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(tenantId, email, password);
    } catch (err: any) {
      setError(err.message || t('auth:errors.invalidCredentials'));
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••••"
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

        <div className="login-demo" style={{
          marginTop: '2rem',
          padding: '1rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(167, 139, 250, 0.1))',
          borderRadius: '12px',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          textAlign: 'center'
        }}>
          <p className="demo-label" style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: '#6b21a8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.5rem'
          }}>{t('auth:login.demoCredentials')}</p>
          <p className="demo-creds" style={{ color: '#374151', fontSize: '0.875rem' }}>
            <strong style={{ color: '#6b21a8' }}>admin@demo.practice</strong> / <strong style={{ color: '#6b21a8' }}>Password123!</strong>
          </p>
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
