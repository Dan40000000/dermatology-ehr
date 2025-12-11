import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';

export function PortalLoginPage() {
  const { isAuthenticated, login, isLoading } = usePatientPortalAuth();
  const navigate = useNavigate();

  const [tenantId, setTenantId] = useState('tenant-demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/portal/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(tenantId, email, password);
      navigate('/portal/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="portal-login-page">
      <div className="portal-login-card">
        <div className="portal-login-header">
          <div className="portal-login-icon">🏥</div>
          <h1>Patient Portal</h1>
          <p>Access your health information securely</p>
        </div>

        <form onSubmit={handleSubmit} className="portal-login-form">
          <label className="portal-form-field">
            Practice ID
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              placeholder="tenant-demo"
            />
          </label>

          <label className="portal-form-field">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="patient@example.com"
            />
          </label>

          <label className="portal-form-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••••"
            />
          </label>

          <div className="portal-login-options">
            <label className="portal-checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>
            <Link to="/portal/forgot-password" className="portal-forgot-link">
              Forgot password?
            </Link>
          </div>

          <button type="submit" disabled={isLoading} className="portal-login-btn">
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="portal-login-footer">
          <p>Don't have an account?</p>
          <Link to="/portal/register" className="portal-register-link">
            Register Now
          </Link>
        </div>

        {error && <div className="portal-login-error">{error}</div>}

        <div className="portal-security-badge">
          <span>🔒</span>
          <p>Secure connection - Your information is protected</p>
        </div>
      </div>

      <p className="portal-login-footer-text">
        © 2025 Mountain Pine Dermatology • <a href="#privacy">Privacy Policy</a> • <a href="#terms">Terms of Service</a>
      </p>

      <style>{`
        .portal-login-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #7c3aed 0%, #6B46C1 100%);
          padding: 2rem;
        }

        .portal-login-card {
          background: white;
          border-radius: 16px;
          padding: 3rem;
          width: 100%;
          max-width: 460px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }

        .portal-login-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .portal-login-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .portal-login-header h1 {
          font-size: 1.75rem;
          color: #1f2937;
          margin: 0 0 0.5rem 0;
          font-weight: 700;
        }

        .portal-login-header p {
          color: #6b7280;
          margin: 0;
          font-size: 0.95rem;
        }

        .portal-login-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .portal-form-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          color: #374151;
          font-weight: 500;
          font-size: 0.9rem;
        }

        .portal-form-field input {
          padding: 0.875rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s;
        }

        .portal-form-field input:focus {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }

        .portal-login-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: -0.5rem;
        }

        .portal-checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #4b5563;
          cursor: pointer;
        }

        .portal-forgot-link {
          font-size: 0.875rem;
          color: #7c3aed;
          text-decoration: none;
          font-weight: 500;
        }

        .portal-forgot-link:hover {
          text-decoration: underline;
        }

        .portal-login-btn {
          background: linear-gradient(135deg, #7c3aed 0%, #6B46C1 100%);
          color: white;
          padding: 1rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          margin-top: 0.5rem;
        }

        .portal-login-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(124, 58, 237, 0.3);
        }

        .portal-login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .portal-login-footer {
          text-align: center;
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #e5e7eb;
        }

        .portal-login-footer p {
          color: #6b7280;
          margin: 0 0 0.5rem 0;
          font-size: 0.9rem;
        }

        .portal-register-link {
          color: #7c3aed;
          text-decoration: none;
          font-weight: 600;
          font-size: 1rem;
        }

        .portal-register-link:hover {
          text-decoration: underline;
        }

        .portal-login-error {
          background: #fee2e2;
          color: #991b1b;
          padding: 1rem;
          border-radius: 8px;
          margin-top: 1rem;
          text-align: center;
          font-size: 0.9rem;
        }

        .portal-security-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 2rem;
          padding: 0.75rem;
          background: #f0fdf4;
          border-radius: 8px;
        }

        .portal-security-badge span {
          font-size: 1.25rem;
        }

        .portal-security-badge p {
          margin: 0;
          color: #166534;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .portal-login-footer-text {
          color: white;
          margin-top: 2rem;
          text-align: center;
          font-size: 0.875rem;
        }

        .portal-login-footer-text a {
          color: white;
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .portal-login-card {
            padding: 2rem;
          }

          .portal-login-header h1 {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
