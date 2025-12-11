-- Tasks Enhancement: Add categories, due dates, completion tracking, and comments

-- Add new columns to tasks table
alter table tasks add column if not exists category text;
alter table tasks add column if not exists priority text default 'normal';
alter table tasks add column if not exists description text;
alter table tasks add column if not exists due_date date;
alter table tasks add column if not exists completed_at timestamptz;
alter table tasks add column if not exists completed_by text references users(id);

-- Update status column to support more statuses
comment on column tasks.status is 'Task status: todo, in_progress, completed, cancelled';

-- Create task comments table
create table if not exists task_comments (
  id text primary key,
  tenant_id text not null references tenants(id),
  task_id text not null references tasks(id) on delete cascade,
  user_id text not null references users(id),
  comment text not null,
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_category on tasks(category);
create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_task_comments_task on task_comments(task_id);
create index if not exists idx_task_comments_user on task_comments(user_id);
