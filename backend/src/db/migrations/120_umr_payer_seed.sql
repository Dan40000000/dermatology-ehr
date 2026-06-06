-- Add UMR payer aliases so legacy insurance labels and new patient intake can resolve
-- a payer ID before live eligibility checks are attempted.

INSERT INTO known_payers (
  payer_id,
  payer_name,
  payer_aliases,
  card_layout_type,
  front_fields,
  back_fields
)
VALUES (
  'UMR',
  'UMR',
  ARRAY['UMR', 'United Medical Resources', 'UnitedHealthcare UMR', 'United Healthcare UMR'],
  'standard',
  ARRAY['member_id', 'group_number', 'plan_type', 'subscriber_name'],
  ARRAY['claims_phone', 'prior_auth_phone', 'rx_bin', 'rx_pcn', 'rx_group']
)
ON CONFLICT (payer_id) DO UPDATE
SET payer_name = EXCLUDED.payer_name,
    payer_aliases = EXCLUDED.payer_aliases,
    front_fields = EXCLUDED.front_fields,
    back_fields = EXCLUDED.back_fields;

INSERT INTO payer_configurations (
  id,
  tenant_id,
  payer_id,
  payer_name,
  payer_type,
  eligibility_endpoint,
  eligibility_format,
  timeout_ms,
  max_retries,
  cache_duration_hours,
  supports_real_time,
  supports_270_271,
  support_phone
)
VALUES (
  gen_random_uuid()::text,
  'default',
  'UMR',
  'UMR',
  'commercial',
  'https://api.availity.com/eligibility/v1/coverage',
  'X12_270',
  30000,
  3,
  24,
  true,
  true,
  '1-800-826-9781'
)
ON CONFLICT (tenant_id, payer_id) DO UPDATE
SET payer_name = EXCLUDED.payer_name,
    payer_type = EXCLUDED.payer_type,
    eligibility_endpoint = EXCLUDED.eligibility_endpoint,
    eligibility_format = EXCLUDED.eligibility_format,
    supports_real_time = EXCLUDED.supports_real_time,
    supports_270_271 = EXCLUDED.supports_270_271,
    support_phone = EXCLUDED.support_phone,
    updated_at = NOW();
