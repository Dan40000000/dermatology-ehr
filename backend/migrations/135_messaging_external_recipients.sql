ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS external_recipients JSONB NOT NULL DEFAULT '[]'::jsonb;
