-- Staff login lockout state.
-- After five failed password attempts, the account remains locked until an
-- admin resets the staff member's password.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_locked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_tenant_login_locked
  ON users(tenant_id, login_locked_at)
  WHERE login_locked_at IS NOT NULL;

