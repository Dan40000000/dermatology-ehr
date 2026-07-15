-- Accounts receivable collection workflow
-- Tracks patient contact attempts, follow-up dates, promises to pay, disputes,
-- financial-assistance discussions, and collection notes.

alter table collection_attempts
  add column if not exists contact_method text,
  add column if not exists contact_direction text default 'outbound',
  add column if not exists contact_person text,
  add column if not exists outcome text,
  add column if not exists patient_response text,
  add column if not exists staff_next_step text,
  add column if not exists next_follow_up_date date,
  add column if not exists follow_up_status text default 'open',
  add column if not exists assigned_to text references users(id) on delete set null,
  add column if not exists patient_promised_amount numeric(10,2),
  add column if not exists patient_promised_date date,
  add column if not exists dispute_status text,
  add column if not exists financial_assistance_status text,
  add column if not exists payment_plan_discussed boolean default false,
  add column if not exists financial_assistance_discussed boolean default false,
  add column if not exists contact_preference_confirmed boolean default false,
  add column if not exists do_not_contact boolean default false;

update collection_attempts
set contact_method = coalesce(contact_method, collection_point),
    contact_direction = coalesce(contact_direction, 'outbound'),
    outcome = coalesce(outcome, result),
    follow_up_status = coalesce(follow_up_status, 'open')
where contact_method is null
   or contact_direction is null
   or outcome is null
   or follow_up_status is null;

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'collection_attempts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%result%'
  limit 1;

  if v_constraint is not null then
    execute format('alter table collection_attempts drop constraint %I', v_constraint);
  end if;

  alter table collection_attempts
    add constraint collection_attempts_result_check
    check (result in (
      'collected_full',
      'collected_partial',
      'payment_plan',
      'declined',
      'skipped',
      'no_answer',
      'left_voicemail',
      'left_message',
      'spoke_patient',
      'spoke_guarantor',
      'promise_to_pay',
      'payment_plan_requested',
      'partial_payment_expected',
      'dispute_opened',
      'financial_assistance_requested',
      'insurance_follow_up',
      'insurance_issue',
      'wrong_number',
      'bad_address',
      'refused_to_pay',
      'do_not_contact',
      'resolved'
    ));
exception
  when duplicate_object then null;
end $$;

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'collection_attempts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%contact_method%'
  limit 1;

  if v_constraint is not null then
    execute format('alter table collection_attempts drop constraint %I', v_constraint);
  end if;

  alter table collection_attempts
    add constraint collection_attempts_contact_method_check
    check (contact_method is null or contact_method in (
      'phone',
      'text',
      'email',
      'mail',
      'portal',
      'in_person',
      'statement',
      'check_in',
      'check_out',
      'other'
    ));
exception
  when duplicate_object then null;
end $$;

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'collection_attempts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%contact_direction%'
  limit 1;

  if v_constraint is not null then
    execute format('alter table collection_attempts drop constraint %I', v_constraint);
  end if;

  alter table collection_attempts
    add constraint collection_attempts_contact_direction_check
    check (contact_direction in ('outbound', 'inbound'));
exception
  when duplicate_object then null;
end $$;

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'collection_attempts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%follow_up_status%'
  limit 1;

  if v_constraint is not null then
    execute format('alter table collection_attempts drop constraint %I', v_constraint);
  end if;

  alter table collection_attempts
    add constraint collection_attempts_follow_up_status_check
    check (follow_up_status in ('open', 'scheduled', 'resolved', 'paused', 'do_not_contact'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_collection_attempts_follow_up
  on collection_attempts(tenant_id, next_follow_up_date)
  where next_follow_up_date is not null and follow_up_status in ('open', 'scheduled');

create index if not exists idx_collection_attempts_assigned_to
  on collection_attempts(tenant_id, assigned_to)
  where assigned_to is not null;

create index if not exists idx_collection_attempts_do_not_contact
  on collection_attempts(tenant_id, patient_id)
  where do_not_contact = true;
