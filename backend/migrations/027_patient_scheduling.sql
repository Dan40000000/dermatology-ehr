-- Patient Self-Scheduling System
-- Comprehensive online booking for dermatology appointments

-- Provider availability templates (recurring weekly schedule)
CREATE TABLE provider_availability_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  day_of_week integer NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time time NOT NULL,
  end_time time NOT NULL,

  slot_duration_minutes integer DEFAULT 15, -- appointment slot length (15, 30, 60)
  allow_online_booking boolean DEFAULT true,

  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT current_timestamp,
  updated_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT valid_times CHECK (start_time < end_time),
  CONSTRAINT valid_slot_duration CHECK (slot_duration_minutes IN (15, 30, 60))
);

CREATE INDEX idx_availability_provider ON provider_availability_templates(provider_id);
CREATE INDEX idx_availability_dow ON provider_availability_templates(day_of_week);
CREATE INDEX idx_availability_tenant ON provider_availability_templates(tenant_id);
CREATE INDEX idx_availability_active ON provider_availability_templates(is_active) WHERE is_active = true;

COMMENT ON TABLE provider_availability_templates IS 'Recurring weekly availability schedules for providers';
COMMENT ON COLUMN provider_availability_templates.day_of_week IS '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
COMMENT ON COLUMN provider_availability_templates.slot_duration_minutes IS 'Length of each bookable time slot (15, 30, or 60 minutes)';
COMMENT ON COLUMN provider_availability_templates.allow_online_booking IS 'Whether patients can book these slots online';

-- Provider time-off / exceptions (vacations, conferences, etc.)
CREATE TABLE provider_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  start_datetime timestamp NOT NULL,
  end_datetime timestamp NOT NULL,

  reason varchar(255), -- vacation, sick, conference, training, other
  notes text,
  is_all_day boolean DEFAULT false,

  created_at timestamp DEFAULT current_timestamp,
  created_by uuid REFERENCES users(id),

  CONSTRAINT valid_time_off_dates CHECK (start_datetime < end_datetime)
);

CREATE INDEX idx_time_off_provider ON provider_time_off(provider_id);
CREATE INDEX idx_time_off_dates ON provider_time_off(start_datetime, end_datetime);
CREATE INDEX idx_time_off_tenant ON provider_time_off(tenant_id);

COMMENT ON TABLE provider_time_off IS 'Provider unavailability periods (vacations, conferences, sick days)';
COMMENT ON COLUMN provider_time_off.is_all_day IS 'If true, provider is unavailable all day regardless of normal schedule';

-- Online booking settings per tenant
CREATE TABLE online_booking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL UNIQUE,

  is_enabled boolean DEFAULT true,
  booking_window_days integer DEFAULT 60, -- how far in advance patients can book
  min_advance_hours integer DEFAULT 24, -- minimum notice required (e.g., 24 hours)
  max_advance_days integer DEFAULT 90, -- maximum days in future

  allow_cancellation boolean DEFAULT true,
  cancellation_cutoff_hours integer DEFAULT 24, -- must cancel 24+ hours before

  require_reason boolean DEFAULT false, -- require patient to provide visit reason
  confirmation_email boolean DEFAULT true,
  reminder_email boolean DEFAULT true,
  reminder_hours_before integer DEFAULT 24,

  custom_message text, -- custom message shown to patients during booking

  created_at timestamp DEFAULT current_timestamp,
  updated_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_booking_window CHECK (booking_window_days > 0 AND booking_window_days <= max_advance_days),
  CONSTRAINT valid_min_advance CHECK (min_advance_hours >= 0),
  CONSTRAINT valid_cancellation_cutoff CHECK (cancellation_cutoff_hours >= 0)
);

CREATE INDEX idx_booking_settings_tenant ON online_booking_settings(tenant_id);

COMMENT ON TABLE online_booking_settings IS 'Tenant-level configuration for patient online booking';
COMMENT ON COLUMN online_booking_settings.booking_window_days IS 'Default window for online booking (can be overridden by max_advance_days)';
COMMENT ON COLUMN online_booking_settings.min_advance_hours IS 'Minimum hours notice required before appointment';
COMMENT ON COLUMN online_booking_settings.cancellation_cutoff_hours IS 'Hours before appointment when cancellation is no longer allowed';

-- Appointment booking history (audit trail for patient bookings)
CREATE TABLE appointment_booking_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id),

  action varchar(50) NOT NULL, -- booked, rescheduled, cancelled
  previous_scheduled_start timestamp,
  previous_scheduled_end timestamp,
  new_scheduled_start timestamp,
  new_scheduled_end timestamp,

  reason text, -- cancellation/reschedule reason
  booked_via varchar(50) DEFAULT 'patient_portal', -- patient_portal, phone, walk_in, admin

  ip_address varchar(50),
  user_agent text,

  created_at timestamp DEFAULT current_timestamp,
  created_by uuid -- patient account ID if via portal
);

CREATE INDEX idx_booking_history_appointment ON appointment_booking_history(appointment_id);
CREATE INDEX idx_booking_history_patient ON appointment_booking_history(patient_id);
CREATE INDEX idx_booking_history_tenant ON appointment_booking_history(tenant_id);
CREATE INDEX idx_booking_history_created_at ON appointment_booking_history(created_at DESC);

COMMENT ON TABLE appointment_booking_history IS 'Audit trail of all patient booking actions';
COMMENT ON COLUMN appointment_booking_history.action IS 'Type of booking action: booked, rescheduled, cancelled';
COMMENT ON COLUMN appointment_booking_history.booked_via IS 'Channel used for booking: patient_portal, phone, walk_in, admin';

-- Add indexes to appointments table for scheduling queries
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_start ON appointments(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_appointments_provider_date ON appointments(provider_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status) WHERE status IN ('scheduled', 'confirmed');

-- Seed default online booking settings for demo tenant
INSERT INTO online_booking_settings (
  tenant_id,
  is_enabled,
  booking_window_days,
  min_advance_hours,
  max_advance_days,
  allow_cancellation,
  cancellation_cutoff_hours,
  require_reason,
  confirmation_email,
  reminder_email,
  reminder_hours_before,
  custom_message
) VALUES (
  'tenant-demo',
  true,
  60,
  24,
  90,
  true,
  24,
  false,
  true,
  true,
  24,
  'Welcome to our online booking system. Please select your preferred appointment time.'
) ON CONFLICT (tenant_id) DO NOTHING;

-- Seed sample availability templates for demo providers
-- Monday through Friday, 9am-5pm, 15-minute slots
INSERT INTO provider_availability_templates (
  tenant_id,
  provider_id,
  day_of_week,
  start_time,
  end_time,
  slot_duration_minutes,
  allow_online_booking
)
SELECT
  'tenant-demo',
  p.id,
  dow,
  '09:00:00'::time,
  '17:00:00'::time,
  15,
  true
FROM providers p
CROSS JOIN generate_series(1, 5) as dow  -- Monday (1) through Friday (5)
WHERE p.tenant_id = 'tenant-demo'
ON CONFLICT DO NOTHING;

-- Add lunch breaks (12pm-1pm marked as unavailable via reduced hours)
-- This creates morning session (9am-12pm) and afternoon session (1pm-5pm)
-- For a more sophisticated approach, you could split into two templates per day

COMMENT ON TABLE provider_availability_templates IS 'Defines when providers are available for appointments on a recurring weekly basis';
COMMENT ON TABLE provider_time_off IS 'Exceptions to normal availability (vacations, conferences, etc.)';
COMMENT ON TABLE online_booking_settings IS 'Controls patient self-scheduling rules and settings';
