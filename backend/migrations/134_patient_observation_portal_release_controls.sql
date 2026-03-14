-- Portal visibility controls for lab observations
-- Keeps patient-facing release decisions auditable and explicit.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS patient_observation_portal_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  observation_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  release_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (release_status IN ('pending', 'released', 'held')),
  released_at TIMESTAMPTZ,
  released_by VARCHAR(255),
  hold_reason TEXT,
  portal_visible_from TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, observation_id)
);

CREATE INDEX IF NOT EXISTS idx_observation_portal_releases_tenant
  ON patient_observation_portal_releases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_observation_portal_releases_patient
  ON patient_observation_portal_releases(patient_id);
CREATE INDEX IF NOT EXISTS idx_observation_portal_releases_status
  ON patient_observation_portal_releases(release_status);
CREATE INDEX IF NOT EXISTS idx_observation_portal_releases_visible_from
  ON patient_observation_portal_releases(portal_visible_from)
  WHERE portal_visible_from IS NOT NULL;
