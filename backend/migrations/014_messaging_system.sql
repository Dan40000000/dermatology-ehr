-- Migration 014: Messaging System
-- Complete messaging system with threads, participants, and enhanced messages

-- Create message threads table
create table if not exists message_threads (
  id text primary key,
  tenant_id text not null references tenants(id),
  subject text not null,
  patient_id text references patients(id),
  created_by text not null references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create message participants table
create table if not exists message_participants (
  id text primary key,
  thread_id text not null references message_threads(id) on delete cascade,
  user_id text not null references users(id),
  is_archived boolean default false,
  last_read_at timestamptz,
  joined_at timestamptz default now()
);

-- Alter messages table to support threads
alter table messages add column if not exists thread_id text references message_threads(id) on delete cascade;
alter table messages add column if not exists is_read boolean default false;
alter table messages add column if not exists read_at timestamptz;

-- Add indexes for performance
create index if not exists idx_message_threads_tenant on message_threads(tenant_id);
create index if not exists idx_message_threads_patient on message_threads(patient_id);
create index if not exists idx_message_threads_created_by on message_threads(created_by);
create index if not exists idx_message_participants_thread on message_participants(thread_id);
create index if not exists idx_message_participants_user on message_participants(user_id);
create index if not exists idx_messages_thread on messages(thread_id);
create index if not exists idx_messages_sender on messages(sender);

-- Create unique constraint for participants (one record per user per thread)
create unique index if not exists idx_message_participants_unique on message_participants(thread_id, user_id);
