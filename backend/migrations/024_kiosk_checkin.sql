-- Kiosk Check-In System Tables
-- Enables patient self-check-in via tablet kiosks in waiting room

-- Kiosk devices registration
create table if not exists kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  location_id uuid references locations(id),
  device_name varchar(255) not null,
  device_code varchar(50) not null unique, -- e.g., "KIOSK-001" for authentication
  ip_address varchar(50),
  last_heartbeat timestamp,
  is_active boolean default true,
  settings jsonb default '{}', -- timeout, language preferences, features enabled
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create index idx_kiosk_devices_tenant on kiosk_devices(tenant_id);
create index idx_kiosk_devices_code on kiosk_devices(device_code);
create index idx_kiosk_devices_location on kiosk_devices(location_id);

-- Check-in sessions (tracks each patient check-in)
create table if not exists checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  kiosk_device_id uuid references kiosk_devices(id),
  patient_id uuid references patients(id),
  appointment_id uuid references appointments(id),

  -- Session flow status
  status varchar(50) default 'started', -- started, demographics, insurance, consent, completed, cancelled
  started_at timestamp default current_timestamp,
  completed_at timestamp,

  -- Patient verification
  verification_method varchar(50), -- dob, phone, mrn
  verification_value varchar(255),
  verified_at timestamp,

  -- Updates made during check-in
  demographics_updated boolean default false,
  insurance_updated boolean default false,
  consent_signed boolean default false,

  -- Insurance card photos
  insurance_front_photo_url text,
  insurance_back_photo_url text,

  -- Consent signature
  consent_signature_url text,
  consent_form_id uuid,

  -- Metadata
  ip_address varchar(50),
  user_agent text,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create index idx_checkin_sessions_patient on checkin_sessions(patient_id);
create index idx_checkin_sessions_appointment on checkin_sessions(appointment_id);
create index idx_checkin_sessions_kiosk on checkin_sessions(kiosk_device_id);
create index idx_checkin_sessions_tenant on checkin_sessions(tenant_id);
create index idx_checkin_sessions_status on checkin_sessions(status);
create index idx_checkin_sessions_started on checkin_sessions(started_at);

-- Consent forms library
create table if not exists consent_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  form_name varchar(255) not null,
  form_type varchar(100), -- general-consent, hipaa, treatment-consent, telehealth-consent, etc.
  form_content text not null, -- HTML content of the form
  is_active boolean default true,
  requires_signature boolean default true,
  version varchar(50),
  effective_date date,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create index idx_consent_forms_tenant on consent_forms(tenant_id);
create index idx_consent_forms_active on consent_forms(is_active);
create index idx_consent_forms_type on consent_forms(form_type);

-- Patient consent signatures (tracks all signed consents)
create table if not exists patient_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  patient_id uuid not null references patients(id),
  consent_form_id uuid not null references consent_forms(id),
  checkin_session_id uuid references checkin_sessions(id),

  -- Signature data
  signature_url text not null, -- URL to signature image
  signed_at timestamp default current_timestamp,
  ip_address varchar(50),
  device_info text,

  -- Form snapshot (preserve what was signed)
  form_version varchar(50),
  form_content text, -- snapshot of form content at time of signing

  created_at timestamp default current_timestamp
);

create index idx_patient_consents_patient on patient_consents(patient_id);
create index idx_patient_consents_form on patient_consents(consent_form_id);
create index idx_patient_consents_tenant on patient_consents(tenant_id);
create index idx_patient_consents_session on patient_consents(checkin_session_id);

-- Insert default consent forms for each tenant
-- (Note: In production, these would be customized per clinic)
insert into consent_forms (tenant_id, form_name, form_type, form_content, is_active, requires_signature, version, effective_date)
select
  'modmed-demo',
  'General Consent for Treatment',
  'general-consent',
  '<div style="font-family: Arial, sans-serif; line-height: 1.6;">
    <h2>Consent for Treatment</h2>
    <p>I hereby consent to medical treatment by the healthcare providers at this facility. I understand that:</p>
    <ul>
      <li>I have the right to be informed about my diagnosis, treatment plan, and prognosis.</li>
      <li>I have the right to refuse treatment or withdraw consent at any time.</li>
      <li>The practice of medicine is not an exact science and no guarantees have been made to me.</li>
      <li>I am responsible for all charges incurred for services provided to me.</li>
    </ul>
    <p>I certify that I have read and understand this consent form.</p>
  </div>',
  true,
  true,
  '1.0',
  current_date
where not exists (
  select 1 from consent_forms where tenant_id = 'modmed-demo' and form_type = 'general-consent'
);

insert into consent_forms (tenant_id, form_name, form_type, form_content, is_active, requires_signature, version, effective_date)
select
  'modmed-demo',
  'HIPAA Privacy Notice Acknowledgment',
  'hipaa',
  '<div style="font-family: Arial, sans-serif; line-height: 1.6;">
    <h2>HIPAA Privacy Notice Acknowledgment</h2>
    <p>I acknowledge that I have received and reviewed this practice''s Notice of Privacy Practices, which explains how my health information may be used and disclosed.</p>
    <p>I understand that:</p>
    <ul>
      <li>This practice has the right to change the Notice of Privacy Practices.</li>
      <li>I may request a copy of the current notice at any time.</li>
      <li>I have the right to restrict certain uses and disclosures of my health information.</li>
      <li>I have the right to receive confidential communications of my health information.</li>
    </ul>
  </div>',
  true,
  true,
  '1.0',
  current_date
where not exists (
  select 1 from consent_forms where tenant_id = 'modmed-demo' and form_type = 'hipaa'
);

-- Create a sample kiosk device for demo
insert into kiosk_devices (tenant_id, location_id, device_name, device_code, is_active, settings)
select
  'modmed-demo',
  (select id from locations where tenant_id = 'modmed-demo' limit 1),
  'Front Desk Kiosk',
  'KIOSK-001',
  true,
  '{"timeout_seconds": 180, "language": "en", "features": {"insurance_photo": true, "signature_pad": true}}'::jsonb
where not exists (
  select 1 from kiosk_devices where device_code = 'KIOSK-001'
);

comment on table kiosk_devices is 'Registered kiosk devices for patient check-in';
comment on table checkin_sessions is 'Patient check-in sessions tracking workflow and updates';
comment on table consent_forms is 'Library of consent forms available for patient signature';
comment on table patient_consents is 'Record of all patient consent signatures';
