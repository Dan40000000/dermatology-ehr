ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_users_tenant_phone
  ON users(tenant_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';
