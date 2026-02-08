-- Migration: Add live transcript chunks table for real-time transcription persistence
-- This allows recovery of transcription progress if connection is lost

-- Live transcript chunks table
-- Stores individual transcript chunks during live recording sessions
CREATE TABLE IF NOT EXISTS ambient_live_transcript_chunks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recording_id TEXT NOT NULL REFERENCES ambient_recordings(id) ON DELETE CASCADE,

  -- Chunk metadata
  chunk_index INTEGER NOT NULL,

  -- Transcription data
  text TEXT NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.85, -- 0.00 to 1.00
  source TEXT NOT NULL CHECK (source IN ('live', 'mock')),

  -- Timing
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Processing status
  is_processed BOOLEAN DEFAULT false, -- Whether this chunk has been incorporated into final transcript

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_live_chunks_recording ON ambient_live_transcript_chunks(recording_id);
CREATE INDEX idx_live_chunks_tenant ON ambient_live_transcript_chunks(tenant_id);
CREATE INDEX idx_live_chunks_recording_index ON ambient_live_transcript_chunks(recording_id, chunk_index);
CREATE INDEX idx_live_chunks_unprocessed ON ambient_live_transcript_chunks(recording_id, is_processed) WHERE is_processed = false;

-- Unique constraint to prevent duplicate chunks
CREATE UNIQUE INDEX idx_live_chunks_unique ON ambient_live_transcript_chunks(recording_id, chunk_index);

-- Add trigger for cleanup of old chunks (processed chunks older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_live_chunks()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete processed chunks older than 24 hours
  DELETE FROM ambient_live_transcript_chunks
  WHERE is_processed = true
    AND created_at < NOW() - INTERVAL '24 hours';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger that runs periodically (on new inserts)
CREATE TRIGGER cleanup_live_chunks_trigger
  AFTER INSERT ON ambient_live_transcript_chunks
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_live_chunks();

-- Comments
COMMENT ON TABLE ambient_live_transcript_chunks IS 'Stores live transcript chunks for real-time transcription recovery and persistence';
COMMENT ON COLUMN ambient_live_transcript_chunks.chunk_index IS 'Sequential index of the audio chunk within the recording session';
COMMENT ON COLUMN ambient_live_transcript_chunks.is_processed IS 'Whether this chunk has been incorporated into the final transcript';
