import { useState, useEffect } from 'react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      setError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className={`portal-login-page ${mounted ? 'mounted' : ''}`}>
      {/* Animated Background */}
      <div className="portal-bg">
        <div className="portal-bg-gradient"></div>
        <div className="portal-bg-pattern"></div>
        <div className="portal-bg-glow glow-1"></div>
        <div className="portal-bg-glow glow-2"></div>
        <div className="portal-bg-glow glow-3"></div>
      </div>

      {/* Content */}
      <div className="portal-login-container">
        {/* Left Side - Branding */}
        <div className="portal-branding">
          <div className="branding-content">
            <div className="brand-logo">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="20" fill="white" fillOpacity="0.15"/>
                <path d="M24 8C15.164 8 8 15.164 8 24s7.164 16 16 16 16-7.164 16-16S32.836 8 24 8zm0 28c-6.627 0-12-5.373-12-12S17.373 12 24 12s12 5.373 12 12-5.373 12-12 12z" fill="white" fillOpacity="0.3"/>
                <path d="M24 14c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm0 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" fill="white"/>
                <circle cx="24" cy="24" r="3" fill="white"/>
              </svg>
            </div>
            <h1>Mountain Pine<br/>Dermatology</h1>
            <p className="brand-tagline">Your health, your way</p>

            <div className="brand-features">
              <div className="feature-item">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div>
                  <h3>Easy Scheduling</h3>
                  <p>Book and manage appointments online</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                </div>
                <div>
                  <h3>Access Records</h3>
                  <p>View visit summaries and documents</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div>
                  <h3>Secure Messaging</h3>
                  <p>Communicate with your care team</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="portal-login-card">
          <div className="login-card-inner">
            <div className="portal-login-header">
              <div className="welcome-back">
                <span className="wave-emoji">👋</span>
                <span>Welcome back</span>
              </div>
              <h2>Sign in to your account</h2>
              <p>Access your health information securely</p>
            </div>

            {error && (
              <div className="portal-login-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="portal-login-form">
              <div className={`form-field ${focusedField === 'email' ? 'focused' : ''} ${email ? 'has-value' : ''}`}>
                <label htmlFor="email">Email Address</label>
                <div className="input-wrapper">
                  <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    id="email"
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

              <div className={`form-field ${focusedField === 'password' ? 'focused' : ''} ${password ? 'has-value' : ''}`}>
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    id="password"
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
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
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

              <div className="portal-login-options">
                <label className="custom-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="checkmark"></span>
                  <span className="checkbox-label">Remember me</span>
                </label>
                <Link to="/portal/forgot-password" className="portal-forgot-link">
                  Forgot password?
                </Link>
              </div>

              <button type="submit" disabled={isLoading} className="portal-login-btn">
                {isLoading ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>Signing in...</span>
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

            <div className="portal-divider">
              <span>New to the portal?</span>
            </div>

            <Link to="/portal/register" className="portal-register-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
              <span>Create Account</span>
            </Link>

            <div className="portal-security-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9,12 11,14 15,10"/>
              </svg>
              <span>256-bit SSL encrypted connection</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="portal-login-footer">
        <p>&copy; 2026 Mountain Pine Dermatology &bull; <a href="#privacy">Privacy Policy</a> &bull; <a href="#terms">Terms of Service</a></p>
      </footer>

      <style>{`
        .portal-login-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        /* Animated Background */
        .portal-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
        }

        .portal-bg-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%);
        }

        .portal-bg-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }

        .portal-bg-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: float 20s ease-in-out infinite;
        }

        .glow-1 {
          width: 600px;
          height: 600px;
          background: rgba(99, 102, 241, 0.15);
          top: -200px;
          right: -100px;
          animation-delay: 0s;
        }

        .glow-2 {
          width: 500px;
          height: 500px;
          background: rgba(139, 92, 246, 0.12);
          bottom: -150px;
          left: -100px;
          animation-delay: -7s;
        }

        .glow-3 {
          width: 400px;
          height: 400px;
          background: rgba(59, 130, 246, 0.1);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -14s;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(20px, 30px) scale(1.02); }
        }

        /* Content Container */
        .portal-login-container {
          flex: 1;
          display: flex;
          position: relative;
          z-index: 1;
          padding: 2rem;
          gap: 4rem;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          align-items: center;
        }

        /* Branding Side */
        .portal-branding {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 2rem;
          opacity: 0;
          transform: translateX(-30px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .portal-login-page.mounted .portal-branding {
          opacity: 1;
          transform: translateX(0);
        }

        .branding-content {
          color: white;
          max-width: 500px;
        }

        .brand-logo {
          width: 80px;
          height: 80px;
          margin-bottom: 2rem;
        }

        .brand-logo svg {
          width: 100%;
          height: 100%;
        }

        .branding-content h1 {
          font-size: 3rem;
          font-weight: 700;
          line-height: 1.1;
          margin: 0 0 1rem 0;
          background: linear-gradient(135deg, #ffffff 0%, #c7d2fe 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .brand-tagline {
          font-size: 1.25rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 3rem 0;
        }

        .brand-features {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .feature-item {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .feature-item:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateX(5px);
        }

        .feature-icon {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .feature-icon svg {
          width: 22px;
          height: 22px;
          color: white;
        }

        .feature-item h3 {
          margin: 0 0 0.25rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: white;
        }

        .feature-item p {
          margin: 0;
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.6);
        }

        /* Login Card */
        .portal-login-card {
          width: 100%;
          max-width: 480px;
          flex-shrink: 0;
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: 0.2s;
        }

        .portal-login-page.mounted .portal-login-card {
          opacity: 1;
          transform: translateY(0);
        }

        .login-card-inner {
          background: white;
          border-radius: 24px;
          padding: 3rem;
          box-shadow:
            0 25px 50px -12px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        /* Login Header */
        .portal-login-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .welcome-back {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #f0fdf4, #dcfce7);
          border-radius: 100px;
          font-size: 0.875rem;
          color: #166534;
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .wave-emoji {
          font-size: 1.1rem;
          animation: wave 2s ease-in-out infinite;
        }

        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(20deg); }
          75% { transform: rotate(-10deg); }
        }

        .portal-login-header h2 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.5rem 0;
        }

        .portal-login-header p {
          font-size: 0.95rem;
          color: #6b7280;
          margin: 0;
        }

        /* Error Message */
        .portal-login-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          border: 1px solid #fecaca;
          border-radius: 12px;
          margin-bottom: 1.5rem;
          animation: shake 0.5s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .portal-login-error svg {
          width: 20px;
          height: 20px;
          color: #dc2626;
          flex-shrink: 0;
        }

        .portal-login-error span {
          color: #991b1b;
          font-size: 0.9rem;
          font-weight: 500;
        }

        /* Form */
        .portal-login-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-field {
          position: relative;
        }

        .form-field label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .field-icon {
          position: absolute;
          left: 1rem;
          width: 20px;
          height: 20px;
          color: #9ca3af;
          transition: color 0.2s ease;
          pointer-events: none;
        }

        .form-field.focused .field-icon,
        .form-field.has-value .field-icon {
          color: #6366f1;
        }

        .form-field input {
          width: 100%;
          padding: 0.875rem 1rem 0.875rem 3rem;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 1rem;
          transition: all 0.2s ease;
          background: #f9fafb;
        }

        .form-field input:focus {
          outline: none;
          border-color: #6366f1;
          background: white;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
        }

        .form-field input::placeholder {
          color: #9ca3af;
        }

        .toggle-password {
          position: absolute;
          right: 0.75rem;
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
          color: #9ca3af;
          transition: color 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toggle-password:hover {
          color: #6366f1;
        }

        .toggle-password svg {
          width: 20px;
          height: 20px;
        }

        /* Login Options */
        .portal-login-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .custom-checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          user-select: none;
        }

        .custom-checkbox input {
          display: none;
        }

        .checkmark {
          width: 20px;
          height: 20px;
          border: 2px solid #d1d5db;
          border-radius: 6px;
          transition: all 0.2s ease;
          position: relative;
        }

        .custom-checkbox input:checked + .checkmark {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-color: transparent;
        }

        .custom-checkbox input:checked + .checkmark::after {
          content: '';
          position: absolute;
          left: 6px;
          top: 2px;
          width: 5px;
          height: 10px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .checkbox-label {
          font-size: 0.875rem;
          color: #4b5563;
        }

        .portal-forgot-link {
          font-size: 0.875rem;
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s ease;
        }

        .portal-forgot-link:hover {
          color: #4f46e5;
        }

        /* Login Button */
        .portal-login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 0.5rem;
          position: relative;
          overflow: hidden;
        }

        .portal-login-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .portal-login-btn:hover::before {
          left: 100%;
        }

        .portal-login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 40px -10px rgba(99, 102, 241, 0.5);
        }

        .portal-login-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .portal-login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .portal-login-btn svg {
          width: 20px;
          height: 20px;
          transition: transform 0.3s ease;
        }

        .portal-login-btn:hover svg {
          transform: translateX(4px);
        }

        .btn-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Divider */
        .portal-divider {
          display: flex;
          align-items: center;
          margin: 1.5rem 0;
        }

        .portal-divider::before,
        .portal-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }

        .portal-divider span {
          padding: 0 1rem;
          font-size: 0.875rem;
          color: #9ca3af;
        }

        /* Register Button */
        .portal-register-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          background: white;
          color: #374151;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .portal-register-btn:hover {
          border-color: #6366f1;
          color: #6366f1;
          background: #f5f3ff;
        }

        .portal-register-btn svg {
          width: 20px;
          height: 20px;
        }

        /* Security Badge */
        .portal-security-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #f3f4f6;
        }

        .portal-security-badge svg {
          width: 18px;
          height: 18px;
          color: #10b981;
        }

        .portal-security-badge span {
          font-size: 0.8rem;
          color: #6b7280;
        }

        /* Footer */
        .portal-login-footer {
          position: relative;
          z-index: 1;
          padding: 1.5rem;
          text-align: center;
        }

        .portal-login-footer p {
          margin: 0;
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .portal-login-footer a {
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .portal-login-footer a:hover {
          color: white;
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .portal-branding {
            display: none;
          }

          .portal-login-container {
            justify-content: center;
          }
        }

        @media (max-width: 640px) {
          .portal-login-container {
            padding: 1rem;
          }

          .login-card-inner {
            padding: 2rem 1.5rem;
            border-radius: 20px;
          }

          .portal-login-header h2 {
            font-size: 1.5rem;
          }

          .portal-login-options {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .form-field input {
            padding: 0.75rem 1rem 0.75rem 2.75rem;
          }
        }
      `}</style>
    </div>
  );
}
