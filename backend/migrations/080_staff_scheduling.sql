-- Staff Scheduling & Resource Management System
-- Migration 080: Staff schedules, credentials, training, rooms, and overtime tracking

-- =====================================================
-- STAFF SCHEDULES
-- =====================================================
CREATE TABLE IF NOT EXISTS staff_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    schedule_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    shift_type VARCHAR(50) NOT NULL DEFAULT 'regular', -- regular, on_call, overtime, split
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    CONSTRAINT staff_schedules_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT staff_schedules_staff_fk FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_staff_schedules_tenant ON staff_schedules(tenant_id);
CREATE INDEX idx_staff_schedules_staff ON staff_schedules(staff_id);
CREATE INDEX idx_staff_schedules_date ON staff_schedules(schedule_date);
CREATE INDEX idx_staff_schedules_tenant_date ON staff_schedules(tenant_id, schedule_date);
CREATE INDEX idx_staff_schedules_staff_date ON staff_schedules(staff_id, schedule_date);

-- =====================================================
-- SHIFT SWAP REQUESTS
-- =====================================================
CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_schedule_id UUID NOT NULL,
    requesting_staff_id UUID NOT NULL,
    target_staff_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, denied, cancelled
    reason TEXT,
    admin_notes TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    CONSTRAINT shift_swap_original_fk FOREIGN KEY (original_schedule_id) REFERENCES staff_schedules(id) ON DELETE CASCADE,
    CONSTRAINT shift_swap_requesting_fk FOREIGN KEY (requesting_staff_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT shift_swap_target_fk FOREIGN KEY (target_staff_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_shift_swap_original ON shift_swap_requests(original_schedule_id);
CREATE INDEX idx_shift_swap_requesting ON shift_swap_requests(requesting_staff_id);
CREATE INDEX idx_shift_swap_target ON shift_swap_requests(target_staff_id);
CREATE INDEX idx_shift_swap_status ON shift_swap_requests(status);

-- =====================================================
-- PTO REQUESTS
-- =====================================================
CREATE TABLE IF NOT EXISTS pto_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    request_type VARCHAR(50) NOT NULL, -- vacation, sick, personal, bereavement, jury_duty, fmla, other
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    hours DECIMAL(5,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, denied, cancelled
    reason TEXT,
    admin_notes TEXT,
    approved_by UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT pto_requests_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT pto_requests_staff_fk FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT pto_requests_approved_by_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_pto_requests_tenant ON pto_requests(tenant_id);
CREATE INDEX idx_pto_requests_staff ON pto_requests(staff_id);
CREATE INDEX idx_pto_requests_dates ON pto_requests(start_date, end_date);
CREATE INDEX idx_pto_requests_status ON pto_requests(status);

-- =====================================================
-- PTO BALANCES
-- =====================================================
CREATE TABLE IF NOT EXISTS pto_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    pto_type VARCHAR(50) NOT NULL, -- vacation, sick, personal, floating_holiday
    balance_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    accrued_ytd DECIMAL(6,2) NOT NULL DEFAULT 0,
    used_ytd DECIMAL(6,2) NOT NULL DEFAULT 0,
    year INTEGER NOT NULL,
    carry_over_hours DECIMAL(6,2) DEFAULT 0,
    max_carry_over DECIMAL(6,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pto_balances_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT pto_balances_staff_fk FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT pto_balances_unique UNIQUE (tenant_id, staff_id, pto_type, year)
);

CREATE INDEX idx_pto_balances_tenant ON pto_balances(tenant_id);
CREATE INDEX idx_pto_balances_staff ON pto_balances(staff_id);
CREATE INDEX idx_pto_balances_year ON pto_balances(year);

-- =====================================================
-- ROOMS
-- =====================================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    room_type VARCHAR(50) NOT NULL, -- exam_room, procedure_room, consultation, lab, imaging, waiting
    capacity INTEGER DEFAULT 1,
    equipment JSONB DEFAULT '[]'::jsonb, -- Array of equipment items
    status VARCHAR(50) NOT NULL DEFAULT 'available', -- available, occupied, maintenance, out_of_service
    location_id UUID,
    floor VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rooms_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT rooms_location_fk FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE INDEX idx_rooms_tenant ON rooms(tenant_id);
CREATE INDEX idx_rooms_type ON rooms(room_type);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_location ON rooms(location_id);

-- =====================================================
-- ROOM SCHEDULES
-- =====================================================
CREATE TABLE IF NOT EXISTS room_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    appointment_id UUID,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'reserved', -- reserved, in_use, completed, cancelled
    reserved_by UUID,
    purpose TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT room_schedules_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT room_schedules_appointment_fk FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    CONSTRAINT room_schedules_reserved_by_fk FOREIGN KEY (reserved_by) REFERENCES users(id) ON DELETE SET NULL,
    -- Prevent overlapping reservations for the same room
    EXCLUDE USING gist (room_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status NOT IN ('cancelled', 'completed'))
);

CREATE INDEX idx_room_schedules_room ON room_schedules(room_id);
CREATE INDEX idx_room_schedules_appointment ON room_schedules(appointment_id);
CREATE INDEX idx_room_schedules_times ON room_schedules(start_time, end_time);
CREATE INDEX idx_room_schedules_status ON room_schedules(status);

-- =====================================================
-- STAFF CREDENTIALS
-- =====================================================
CREATE TABLE IF NOT EXISTS staff_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    credential_type VARCHAR(50) NOT NULL, -- MEDICAL_LICENSE, DEA, NPI, BOARD_CERTIFICATION, BLS, ACLS
    credential_number VARCHAR(100),
    issuing_authority VARCHAR(200),
    issuing_state VARCHAR(2),
    issue_date DATE,
    expiration_date DATE,
    verified BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMPTZ,
    verified_by UUID,
    document_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT staff_credentials_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT staff_credentials_staff_fk FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT staff_credentials_verified_by_fk FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_staff_credentials_tenant ON staff_credentials(tenant_id);
CREATE INDEX idx_staff_credentials_staff ON staff_credentials(staff_id);
CREATE INDEX idx_staff_credentials_type ON staff_credentials(credential_type);
CREATE INDEX idx_staff_credentials_expiration ON staff_credentials(expiration_date);
CREATE INDEX idx_staff_credentials_verified ON staff_credentials(verified);

-- =====================================================
-- TRAINING REQUIREMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS training_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL, -- physician, nurse, ma, admin, billing, all
    training_name VARCHAR(200) NOT NULL,
    description TEXT,
    required BOOLEAN DEFAULT TRUE,
    frequency_months INTEGER, -- NULL for one-time, otherwise recurrence interval
    category VARCHAR(100), -- compliance, clinical, safety, hipaa, etc.
    passing_score INTEGER, -- minimum score if applicable
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT training_requirements_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_training_requirements_tenant ON training_requirements(tenant_id);
CREATE INDEX idx_training_requirements_role ON training_requirements(role);
CREATE INDEX idx_training_requirements_required ON training_requirements(required);

-- =====================================================
-- STAFF TRAINING RECORDS
-- =====================================================
CREATE TABLE IF NOT EXISTS staff_training_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL,
    training_id UUID NOT NULL,
    completed_date DATE NOT NULL,
    expiration_date DATE,
    score INTEGER,
    certificate_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'completed', -- completed, expired, in_progress, failed
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT staff_training_records_staff_fk FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT staff_training_records_training_fk FOREIGN KEY (training_id) REFERENCES training_requirements(id) ON DELETE CASCADE
);

CREATE INDEX idx_staff_training_records_staff ON staff_training_records(staff_id);
CREATE INDEX idx_staff_training_records_training ON staff_training_records(training_id);
CREATE INDEX idx_staff_training_records_expiration ON staff_training_records(expiration_date);
CREATE INDEX idx_staff_training_records_status ON staff_training_records(status);

-- =====================================================
-- OVERTIME ALERTS
-- =====================================================
CREATE TABLE IF NOT EXISTS overtime_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    week_start DATE NOT NULL,
    hours_worked DECIMAL(5,2) NOT NULL,
    threshold DECIMAL(5,2) NOT NULL DEFAULT 40,
    alert_type VARCHAR(50) NOT NULL, -- approaching, exceeded
    alert_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    notes TEXT,
    CONSTRAINT overtime_alerts_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT overtime_alerts_staff_fk FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_overtime_alerts_tenant ON overtime_alerts(tenant_id);
CREATE INDEX idx_overtime_alerts_staff ON overtime_alerts(staff_id);
CREATE INDEX idx_overtime_alerts_week ON overtime_alerts(week_start);
CREATE INDEX idx_overtime_alerts_type ON overtime_alerts(alert_type);

-- =====================================================
-- PRODUCTIVITY METRICS (for tracking RVUs, utilization, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS staff_productivity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    metric_date DATE NOT NULL,
    scheduled_hours DECIMAL(5,2) DEFAULT 0,
    worked_hours DECIMAL(5,2) DEFAULT 0,
    patient_encounters INTEGER DEFAULT 0,
    procedures_performed INTEGER DEFAULT 0,
    rvu_total DECIMAL(8,2) DEFAULT 0,
    utilization_percent DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT productivity_metrics_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT productivity_metrics_staff_fk FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT productivity_metrics_unique UNIQUE (tenant_id, staff_id, metric_date)
);

CREATE INDEX idx_productivity_metrics_tenant ON staff_productivity_metrics(tenant_id);
CREATE INDEX idx_productivity_metrics_staff ON staff_productivity_metrics(staff_id);
CREATE INDEX idx_productivity_metrics_date ON staff_productivity_metrics(metric_date);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp on staff_schedules
CREATE OR REPLACE FUNCTION update_staff_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staff_schedules_updated_at_trigger
    BEFORE UPDATE ON staff_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_schedules_updated_at();

-- Update updated_at timestamp on pto_balances
CREATE TRIGGER pto_balances_updated_at_trigger
    BEFORE UPDATE ON pto_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_schedules_updated_at();

-- Update updated_at timestamp on rooms
CREATE TRIGGER rooms_updated_at_trigger
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_schedules_updated_at();

-- Update updated_at timestamp on staff_credentials
CREATE TRIGGER staff_credentials_updated_at_trigger
    BEFORE UPDATE ON staff_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_schedules_updated_at();

-- Update updated_at timestamp on training_requirements
CREATE TRIGGER training_requirements_updated_at_trigger
    BEFORE UPDATE ON training_requirements
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_schedules_updated_at();

-- Update updated_at timestamp on staff_training_records
CREATE TRIGGER staff_training_records_updated_at_trigger
    BEFORE UPDATE ON staff_training_records
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_schedules_updated_at();

-- Update updated_at timestamp on staff_productivity_metrics
CREATE TRIGGER staff_productivity_metrics_updated_at_trigger
    BEFORE UPDATE ON staff_productivity_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_schedules_updated_at();

-- =====================================================
-- AUTO-UPDATE PTO BALANCE ON REQUEST APPROVAL
-- =====================================================
CREATE OR REPLACE FUNCTION update_pto_balance_on_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        -- Deduct from balance
        UPDATE pto_balances
        SET
            balance_hours = balance_hours - NEW.hours,
            used_ytd = used_ytd + NEW.hours,
            updated_at = NOW()
        WHERE staff_id = NEW.staff_id
          AND pto_type = NEW.request_type
          AND year = EXTRACT(YEAR FROM NEW.start_date);
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
        -- Restore balance if cancelling approved request
        UPDATE pto_balances
        SET
            balance_hours = balance_hours + NEW.hours,
            used_ytd = used_ytd - NEW.hours,
            updated_at = NOW()
        WHERE staff_id = NEW.staff_id
          AND pto_type = NEW.request_type
          AND year = EXTRACT(YEAR FROM NEW.start_date);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pto_balance_update_trigger
    AFTER UPDATE ON pto_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_pto_balance_on_approval();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE staff_schedules IS 'Staff work schedules including shifts and time slots';
COMMENT ON TABLE shift_swap_requests IS 'Requests from staff to swap shifts with colleagues';
COMMENT ON TABLE pto_requests IS 'Paid time off and leave requests';
COMMENT ON TABLE pto_balances IS 'Running PTO balances for each staff member by type and year';
COMMENT ON TABLE rooms IS 'Physical rooms in the practice for scheduling';
COMMENT ON TABLE room_schedules IS 'Room reservations linked to appointments or other purposes';
COMMENT ON TABLE staff_credentials IS 'Professional credentials and licenses for staff members';
COMMENT ON TABLE training_requirements IS 'Required training courses by role';
COMMENT ON TABLE staff_training_records IS 'Completed training records for staff';
COMMENT ON TABLE overtime_alerts IS 'Alerts generated when staff approach or exceed overtime thresholds';
COMMENT ON TABLE staff_productivity_metrics IS 'Daily productivity metrics including RVUs and utilization';
