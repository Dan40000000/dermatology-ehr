import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function ForcedPasswordReset() {
  const { changePassword, logout, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="auth-page" aria-label="Password reset required">
      <section className="login-card" style={{ maxWidth: 520 }}>
        <h1>Set Your Private Password</h1>
        <p className="muted">
          {user?.fullName || 'Your account'} must set a new password before the workspace opens.
        </p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="forced-current-password">Temporary password</label>
          <input
            id="forced-current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          <label htmlFor="forced-new-password">New password</label>
          <input
            id="forced-new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={12}
          />

          <label htmlFor="forced-confirm-password">Confirm new password</label>
          <input
            id="forced-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={12}
          />

          <button type="submit" disabled={saving}>
            {saving ? 'Updating...' : 'Update Password'}
          </button>
          <button type="button" className="ghost-button" onClick={logout}>
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
