import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
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
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🏥</div>
          <h1>Mountain Pine Dermatology</h1>
          <p>Sign in to access your practice dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="form-field">
            Practice ID
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              placeholder="tenant-demo"
            />
          </label>

          <label className="form-field">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="admin@demo.practice"
            />
          </label>

          <label className="form-field">
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

          <button type="submit" disabled={isLoading} className="login-btn">
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-demo">
          <p className="demo-label">Demo Credentials</p>
          <p className="demo-creds">
            <strong>admin@demo.practice</strong> / <strong>Password123!</strong>
          </p>
        </div>

        {error && <div className="login-error">{error}</div>}
      </div>

      <p className="login-footer">© 2025 DermEHR • Version 1.0.0</p>
    </div>
  );
}
