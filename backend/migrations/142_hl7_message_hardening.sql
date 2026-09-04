-- MSH-10 is required for idempotency and ACK correlation. New queue rows must
-- never be persisted without the sender's control id.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hl7_messages WHERE message_control_id IS NULL) THEN
    ALTER TABLE hl7_messages
      ALTER COLUMN message_control_id SET NOT NULL;
  END IF;
END $$;
