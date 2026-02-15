-- Support dual-role users (primary role + secondary roles) for least-privilege access.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS secondary_roles TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Ensure primary role is not duplicated in secondary_roles.
UPDATE users
SET secondary_roles = COALESCE(
  (
    SELECT ARRAY_AGG(DISTINCT sr)
    FROM UNNEST(COALESCE(secondary_roles, '{}'::text[])) AS sr
    WHERE sr IS NOT NULL
      AND BTRIM(sr) <> ''
      AND sr <> role
  ),
  '{}'::text[]
);

