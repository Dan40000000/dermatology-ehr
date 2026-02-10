-- Migration: Room Status Board / Patient Flow Tracking System
-- Description: Creates tables for exam rooms, patient flow tracking, and room assignments

-- ============================================
-- EXAM ROOMS TABLE
-- Master list of all exam rooms in each location
-- ============================================

CREATE TABLE IF NOT EXISTS exam_rooms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  room_number TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL DEFAULT 'exam', -- exam, procedure, consult, triage
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  equipment TEXT[], -- Array of equipment in the room
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique room number per location
  UNIQUE(tenant_id, location_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_exam_rooms_tenant ON exam_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exam_rooms_location ON exam_rooms(location_id);
CREATE INDEX IF NOT EXISTS idx_exam_rooms_active ON exam_rooms(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_exam_rooms_type ON exam_rooms(room_type);

-- ============================================
-- PATIENT FLOW TABLE
-- Tracks current patient status through the visit workflow
-- ============================================

CREATE TABLE IF NOT EXISTS patient_flow (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES exam_rooms(id) ON DELETE SET NULL,

  -- Flow status
  status TEXT NOT NULL DEFAULT 'checked_in',
  -- Valid statuses: checked_in, rooming, vitals_complete, ready_for_provider, with_provider, checkout, completed

  -- Timestamps for each stage
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,
  rooming_at TIMESTAMPTZ,
  vitals_complete_at TIMESTAMPTZ,
  ready_for_provider_at TIMESTAMPTZ,
  with_provider_at TIMESTAMPTZ,
  checkout_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Assigned staff
  assigned_provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  assigned_ma_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Notes and flags
  priority TEXT DEFAULT 'normal', -- normal, urgent, add-on
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one active flow per appointment
  UNIQUE(tenant_id, appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_flow_tenant ON patient_flow(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_flow_appointment ON patient_flow(appointment_id);
CREATE INDEX IF NOT EXISTS idx_patient_flow_patient ON patient_flow(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_flow_room ON patient_flow(room_id);
CREATE INDEX IF NOT EXISTS idx_patient_flow_status ON patient_flow(status);
CREATE INDEX IF NOT EXISTS idx_patient_flow_provider ON patient_flow(assigned_provider_id);
CREATE INDEX IF NOT EXISTS idx_patient_flow_ma ON patient_flow(assigned_ma_id);
CREATE INDEX IF NOT EXISTS idx_patient_flow_date ON patient_flow(created_at);

-- ============================================
-- FLOW STATUS HISTORY TABLE
-- Audit trail of all status changes
-- ============================================

CREATE TABLE IF NOT EXISTS flow_status_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flow_id TEXT NOT NULL REFERENCES patient_flow(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,

  -- Additional context
  room_id TEXT REFERENCES exam_rooms(id) ON DELETE SET NULL,
  duration_seconds INTEGER -- Time spent in previous status
);

CREATE INDEX IF NOT EXISTS idx_flow_history_tenant ON flow_status_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flow_history_flow ON flow_status_history(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_history_changed_at ON flow_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_history_status ON flow_status_history(to_status);

-- ============================================
-- ROOM ASSIGNMENTS TABLE
-- Provider room assignments by day/time
-- ============================================

CREATE TABLE IF NOT EXISTS room_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES exam_rooms(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  time_slot TEXT, -- e.g., 'morning', 'afternoon', 'all_day', or specific time like '09:00-12:00'
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
  effective_date DATE, -- For specific date overrides
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique assignment per room/day/timeslot (excluding specific date overrides)
  UNIQUE NULLS NOT DISTINCT (tenant_id, room_id, day_of_week, time_slot, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_room_assignments_tenant ON room_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_room_assignments_room ON room_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_room_assignments_provider ON room_assignments(provider_id);
CREATE INDEX IF NOT EXISTS idx_room_assignments_day ON room_assignments(day_of_week);
CREATE INDEX IF NOT EXISTS idx_room_assignments_active ON room_assignments(is_active) WHERE is_active = TRUE;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to calculate wait time between stages
CREATE OR REPLACE FUNCTION calculate_stage_wait_time(
  p_flow_id TEXT,
  p_from_status TEXT,
  p_to_status TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_from_time TIMESTAMPTZ;
  v_to_time TIMESTAMPTZ;
BEGIN
  SELECT
    CASE p_from_status
      WHEN 'checked_in' THEN checked_in_at
      WHEN 'rooming' THEN rooming_at
      WHEN 'vitals_complete' THEN vitals_complete_at
      WHEN 'ready_for_provider' THEN ready_for_provider_at
      WHEN 'with_provider' THEN with_provider_at
      WHEN 'checkout' THEN checkout_at
    END,
    CASE p_to_status
      WHEN 'rooming' THEN rooming_at
      WHEN 'vitals_complete' THEN vitals_complete_at
      WHEN 'ready_for_provider' THEN ready_for_provider_at
      WHEN 'with_provider' THEN with_provider_at
      WHEN 'checkout' THEN checkout_at
      WHEN 'completed' THEN completed_at
    END
  INTO v_from_time, v_to_time
  FROM patient_flow
  WHERE id = p_flow_id;

  IF v_from_time IS NOT NULL AND v_to_time IS NOT NULL THEN
    RETURN EXTRACT(EPOCH FROM (v_to_time - v_from_time))::INTEGER;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE exam_rooms IS 'Master list of exam rooms per location for patient flow tracking';
COMMENT ON TABLE patient_flow IS 'Current patient flow status through the visit workflow';
COMMENT ON TABLE flow_status_history IS 'Audit trail of all patient flow status changes';
COMMENT ON TABLE room_assignments IS 'Provider-to-room assignments by day and time slot';

COMMENT ON COLUMN patient_flow.status IS 'Current flow status: checked_in, rooming, vitals_complete, ready_for_provider, with_provider, checkout, completed';
COMMENT ON COLUMN patient_flow.priority IS 'Visit priority: normal, urgent, add-on';
COMMENT ON COLUMN exam_rooms.room_type IS 'Room type: exam, procedure, consult, triage';
COMMENT ON COLUMN room_assignments.day_of_week IS 'Day of week (0=Sunday through 6=Saturday)';
COMMENT ON COLUMN room_assignments.time_slot IS 'Time slot: morning, afternoon, all_day, or specific time range';
