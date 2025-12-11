-- FHIR OAuth Token Storage
-- Stores OAuth 2.0 tokens for FHIR API access
-- Supports SMART on FHIR authentication flows

create table if not exists fhir_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  client_id varchar(255) not null,
  client_secret varchar(255) not null,
  access_token varchar(500) not null unique,
  refresh_token varchar(500),
  scope text,
  expires_at timestamp,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,

  -- Store client metadata
  client_name varchar(255),
  redirect_uris text, -- JSON array

  -- Track token usage
  last_used_at timestamp,

  constraint fk_fhir_tokens_tenant
    foreign key (tenant_id)
    references tenants(id)
    on delete cascade
);

-- Indexes for performance
create index if not exists idx_fhir_tokens_tenant on fhir_oauth_tokens(tenant_id);
create index if not exists idx_fhir_tokens_access on fhir_oauth_tokens(access_token);
create index if not exists idx_fhir_tokens_client on fhir_oauth_tokens(client_id);
create index if not exists idx_fhir_tokens_expires on fhir_oauth_tokens(expires_at);

-- Update timestamp trigger
create or replace function update_fhir_oauth_tokens_updated_at()
returns trigger as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_fhir_oauth_tokens_updated_at
  before update on fhir_oauth_tokens
  for each row
  execute function update_fhir_oauth_tokens_updated_at();

-- Insert demo FHIR client for testing
insert into fhir_oauth_tokens(
  id,
  tenant_id,
  client_id,
  client_secret,
  access_token,
  refresh_token,
  scope,
  expires_at,
  client_name
) values (
  'fhir-token-demo',
  'tenant-demo',
  'demo-fhir-client',
  'demo-secret-12345',
  'demo-fhir-access-token-abcdef123456',
  'demo-fhir-refresh-token-xyz789',
  'patient/*.read user/*.read',
  current_timestamp + interval '1 year',
  'Demo FHIR Client'
) on conflict (id) do nothing;
