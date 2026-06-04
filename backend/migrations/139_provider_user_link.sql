ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_tenant_user
  ON providers(tenant_id, user_id)
  WHERE user_id IS NOT NULL;

WITH provider_user_matches AS (
  SELECT
    p.id AS provider_id,
    u.id AS user_id,
    row_number() OVER (
      PARTITION BY u.tenant_id, u.id
      ORDER BY p.created_at ASC, p.id ASC
    ) AS match_rank
  FROM providers p
  JOIN users u
    ON p.tenant_id = u.tenant_id
   AND lower(trim(p.full_name)) = lower(trim(u.full_name))
  WHERE p.user_id IS NULL
    AND (u.role = 'provider' OR 'provider' = ANY(coalesce(u.secondary_roles, '{}'::text[])))
    AND NOT EXISTS (
      SELECT 1
      FROM providers p2
      WHERE p2.tenant_id = p.tenant_id
        AND p2.user_id = u.id
    )
)
UPDATE providers p
SET user_id = m.user_id
FROM provider_user_matches m
WHERE p.id = m.provider_id
  AND m.match_rank = 1;

INSERT INTO providers (id, tenant_id, user_id, full_name, specialty, is_active)
SELECT gen_random_uuid()::text, u.tenant_id, u.id, u.full_name, 'Dermatology', true
FROM users u
WHERE (u.role = 'provider' OR 'provider' = ANY(coalesce(u.secondary_roles, '{}'::text[])))
  AND NOT EXISTS (
    SELECT 1
    FROM providers p
    WHERE p.tenant_id = u.tenant_id
      AND (p.user_id = u.id OR lower(trim(p.full_name)) = lower(trim(u.full_name)))
  );
