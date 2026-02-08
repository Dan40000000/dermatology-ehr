-- Patient Communication Hub
-- Multi-channel messaging, templates, broadcasts, and preferences management

-- =====================================================
-- CONVERSATIONS
-- =====================================================

-- Track all patient conversations across channels
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    subject VARCHAR(500),
    status VARCHAR(20) DEFAULT 'open', -- open, pending, resolved, closed
    channel VARCHAR(20) NOT NULL, -- sms, email, portal, phone
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    priority VARCHAR(10) DEFAULT 'normal', -- low, normal, high, urgent
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',

    INDEX idx_conversations_tenant_patient (tenant_id, patient_id, created_at DESC),
    INDEX idx_conversations_status (tenant_id, status, last_message_at DESC),
    INDEX idx_conversations_assigned (tenant_id, assigned_to, status, last_message_at DESC),
    INDEX idx_conversations_channel (tenant_id, channel, status),
    INDEX idx_conversations_priority (tenant_id, priority, status, last_message_at DESC)
);

-- =====================================================
-- MESSAGES
-- =====================================================

-- Individual messages within conversations
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL, -- inbound, outbound
    sender_type VARCHAR(20) NOT NULL, -- patient, staff, system, auto
    sender_id UUID, -- user_id for staff, patient_id for patient, null for system
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text', -- text, html, template
    attachments JSONB DEFAULT '[]', -- [{filename, url, mime_type, size}]
    read_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    external_id VARCHAR(255), -- External SMS/email ID for tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_conv_messages_conversation (conversation_id, created_at),
    INDEX idx_conv_messages_unread (conversation_id, direction, read_at),
    INDEX idx_conv_messages_external (external_id)
);

-- =====================================================
-- MESSAGE TEMPLATES
-- =====================================================

-- Reusable message templates
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- appointment, billing, clinical, marketing, recall, general
    subject VARCHAR(500), -- For email templates
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- [{name, description, default_value}]
    channel VARCHAR(20), -- sms, email, portal, any (null = any)
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INT DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, name),
    INDEX idx_message_templates_category (tenant_id, category, is_active),
    INDEX idx_message_templates_channel (tenant_id, channel, is_active)
);

-- =====================================================
-- BROADCAST MESSAGES
-- =====================================================

-- Bulk message campaigns
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    subject VARCHAR(500), -- For email broadcasts
    channel VARCHAR(20) NOT NULL, -- sms, email, portal
    target_criteria JSONB NOT NULL, -- {patient_filters, include_ids, exclude_ids}
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    recipient_count INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    delivered_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, sending, sent, cancelled, failed
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_broadcast_messages_status (tenant_id, status, scheduled_at),
    INDEX idx_broadcast_messages_scheduled (tenant_id, status, scheduled_at) WHERE status = 'scheduled'
);

-- Track individual broadcast recipients
CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES broadcast_messages(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, opened, clicked, failed, unsubscribed
    external_id VARCHAR(255), -- External tracking ID

    UNIQUE(broadcast_id, patient_id),
    INDEX idx_broadcast_recipients_broadcast (broadcast_id, status),
    INDEX idx_broadcast_recipients_patient (patient_id, sent_at DESC)
);

-- =====================================================
-- COMMUNICATION PREFERENCES
-- =====================================================

-- Patient communication preferences
CREATE TABLE IF NOT EXISTS communication_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    sms_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    portal_enabled BOOLEAN DEFAULT TRUE,
    marketing_enabled BOOLEAN DEFAULT FALSE,
    reminder_enabled BOOLEAN DEFAULT TRUE,
    preferred_channel VARCHAR(20) DEFAULT 'sms', -- sms, email, portal
    quiet_hours_start TIME, -- e.g., 21:00
    quiet_hours_end TIME, -- e.g., 08:00
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, patient_id),
    INDEX idx_comm_prefs_patient (tenant_id, patient_id)
);

-- =====================================================
-- UNSUBSCRIBES
-- =====================================================

-- Track patient unsubscribes
CREATE TABLE IF NOT EXISTS communication_unsubscribes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL, -- sms, email, marketing, all
    reason TEXT,
    unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),
    resubscribed_at TIMESTAMPTZ,

    INDEX idx_unsubscribes_patient (tenant_id, patient_id, channel),
    INDEX idx_unsubscribes_channel (tenant_id, channel, unsubscribed_at DESC)
);

-- =====================================================
-- AUTO-ROUTING RULES
-- =====================================================

-- Rules for auto-assigning conversations
CREATE TABLE IF NOT EXISTS conversation_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    priority INT DEFAULT 100, -- Lower = higher priority
    conditions JSONB NOT NULL, -- {channel, keywords, patient_criteria, time_range}
    action_type VARCHAR(50) NOT NULL, -- assign_user, assign_pool, auto_respond
    action_config JSONB NOT NULL, -- {user_id, pool_ids, response_template_id}
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_routing_rules_active (tenant_id, is_active, priority)
);

-- After-hours auto-response configuration
CREATE TABLE IF NOT EXISTS after_hours_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL, -- sms, email, all
    start_time TIME NOT NULL, -- e.g., 17:00
    end_time TIME NOT NULL, -- e.g., 08:00
    days_of_week INT[] DEFAULT ARRAY[0,6], -- 0=Sunday, 6=Saturday
    response_template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    custom_message TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, channel),
    INDEX idx_after_hours_active (tenant_id, is_active)
);

-- =====================================================
-- SEED DATA
-- =====================================================

-- Seed default message templates
INSERT INTO message_templates (id, tenant_id, name, category, subject, content, variables, channel, is_active)
SELECT
    gen_random_uuid(),
    t.id,
    templates.name,
    templates.category,
    templates.subject,
    templates.content,
    templates.variables::jsonb,
    templates.channel,
    TRUE
FROM tenants t
CROSS JOIN (VALUES
    ('Appointment Reminder', 'appointment', 'Your Appointment Reminder',
     'Hi {{patient_name}}, this is a reminder of your appointment on {{appointment_date}} at {{appointment_time}} with {{provider_name}}. Reply C to confirm or call us to reschedule.',
     '[{"name": "patient_name", "description": "Patient first name"}, {"name": "appointment_date", "description": "Appointment date"}, {"name": "appointment_time", "description": "Appointment time"}, {"name": "provider_name", "description": "Provider name"}]',
     'sms'),
    ('Appointment Confirmation', 'appointment', 'Appointment Confirmed',
     'Hi {{patient_name}}, your appointment is confirmed for {{appointment_date}} at {{appointment_time}}. Please arrive 15 minutes early. Reply STOP to opt out.',
     '[{"name": "patient_name", "description": "Patient first name"}, {"name": "appointment_date", "description": "Appointment date"}, {"name": "appointment_time", "description": "Appointment time"}]',
     'sms'),
    ('Payment Reminder', 'billing', 'Payment Reminder',
     'Hi {{patient_name}}, you have an outstanding balance of ${{balance_amount}}. Please call our office or visit the patient portal to make a payment. Thank you!',
     '[{"name": "patient_name", "description": "Patient first name"}, {"name": "balance_amount", "description": "Outstanding balance"}]',
     'sms'),
    ('Lab Results Ready', 'clinical', 'Your Lab Results Are Ready',
     'Hi {{patient_name}}, your lab results are now available. Please log into the patient portal to view them or call our office if you have questions.',
     '[{"name": "patient_name", "description": "Patient first name"}]',
     'sms'),
    ('Prescription Ready', 'clinical', 'Prescription Ready for Pickup',
     'Hi {{patient_name}}, your prescription for {{medication_name}} has been sent to {{pharmacy_name}}. It should be ready for pickup shortly.',
     '[{"name": "patient_name", "description": "Patient first name"}, {"name": "medication_name", "description": "Medication name"}, {"name": "pharmacy_name", "description": "Pharmacy name"}]',
     'sms'),
    ('Recall Reminder', 'recall', 'Time for Your Check-up',
     'Hi {{patient_name}}, it''s time for your {{recall_type}}. Please call us or book online to schedule your appointment. We look forward to seeing you!',
     '[{"name": "patient_name", "description": "Patient first name"}, {"name": "recall_type", "description": "Type of recall visit"}]',
     'sms'),
    ('Skin Check Reminder', 'recall', 'Annual Skin Check Reminder',
     'Hi {{patient_name}}, it''s been a year since your last skin check. Early detection is key! Please schedule your annual skin cancer screening. Call us or book online.',
     '[{"name": "patient_name", "description": "Patient first name"}]',
     'sms'),
    ('Welcome New Patient', 'general', 'Welcome to Our Practice',
     'Welcome to {{practice_name}}, {{patient_name}}! We''re excited to have you as a patient. Your first appointment is on {{appointment_date}}. Please complete your intake forms via the patient portal.',
     '[{"name": "patient_name", "description": "Patient first name"}, {"name": "practice_name", "description": "Practice name"}, {"name": "appointment_date", "description": "First appointment date"}]',
     'sms'),
    ('After Hours Response', 'general', NULL,
     'Thank you for contacting us. Our office is currently closed. We will respond to your message during normal business hours (Mon-Fri, 8am-5pm). For emergencies, please call 911 or go to your nearest ER.',
     '[]',
     'sms'),
    ('Promotional Offer', 'marketing', 'Special Offer Just for You',
     'Hi {{patient_name}}, as a valued patient, we''re offering you {{discount_percent}}% off {{service_name}}! Offer valid until {{expiry_date}}. Book now!',
     '[{"name": "patient_name", "description": "Patient first name"}, {"name": "discount_percent", "description": "Discount percentage"}, {"name": "service_name", "description": "Service name"}, {"name": "expiry_date", "description": "Offer expiry date"}]',
     'sms')
) AS templates(name, category, subject, content, variables, channel)
ON CONFLICT DO NOTHING;

-- Seed default after-hours configuration
INSERT INTO after_hours_config (id, tenant_id, channel, start_time, end_time, days_of_week, custom_message, is_active)
SELECT
    gen_random_uuid(),
    t.id,
    'sms',
    '17:00'::TIME,
    '08:00'::TIME,
    ARRAY[0,6],
    'Thank you for contacting us. Our office is currently closed. We will respond during normal business hours (Mon-Fri, 8am-5pm). For emergencies, please call 911.',
    TRUE
FROM tenants t
ON CONFLICT DO NOTHING;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to check if within quiet hours
CREATE OR REPLACE FUNCTION is_within_quiet_hours(
    p_tenant_id UUID,
    p_patient_id UUID,
    p_check_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS BOOLEAN AS $$
DECLARE
    v_quiet_start TIME;
    v_quiet_end TIME;
    v_current_time TIME;
BEGIN
    -- Get patient's quiet hours
    SELECT quiet_hours_start, quiet_hours_end
    INTO v_quiet_start, v_quiet_end
    FROM communication_preferences
    WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;

    -- If no quiet hours set, return false
    IF v_quiet_start IS NULL OR v_quiet_end IS NULL THEN
        RETURN FALSE;
    END IF;

    v_current_time := p_check_time::TIME;

    -- Handle overnight quiet hours (e.g., 21:00 to 08:00)
    IF v_quiet_start > v_quiet_end THEN
        RETURN v_current_time >= v_quiet_start OR v_current_time <= v_quiet_end;
    ELSE
        RETURN v_current_time >= v_quiet_start AND v_current_time <= v_quiet_end;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check if patient can be contacted
CREATE OR REPLACE FUNCTION can_contact_patient(
    p_tenant_id UUID,
    p_patient_id UUID,
    p_channel VARCHAR(20),
    p_message_type VARCHAR(20) DEFAULT 'general' -- general, marketing, reminder
) RETURNS BOOLEAN AS $$
DECLARE
    v_prefs RECORD;
    v_unsubscribed BOOLEAN;
BEGIN
    -- Check for unsubscribes
    SELECT EXISTS (
        SELECT 1 FROM communication_unsubscribes
        WHERE tenant_id = p_tenant_id
          AND patient_id = p_patient_id
          AND (channel = p_channel OR channel = 'all')
          AND resubscribed_at IS NULL
    ) INTO v_unsubscribed;

    IF v_unsubscribed THEN
        RETURN FALSE;
    END IF;

    -- Get preferences
    SELECT * INTO v_prefs
    FROM communication_preferences
    WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;

    -- If no preferences, assume defaults (enabled except marketing)
    IF v_prefs IS NULL THEN
        RETURN p_message_type != 'marketing';
    END IF;

    -- Check channel preference
    IF p_channel = 'sms' AND NOT v_prefs.sms_enabled THEN RETURN FALSE; END IF;
    IF p_channel = 'email' AND NOT v_prefs.email_enabled THEN RETURN FALSE; END IF;
    IF p_channel = 'portal' AND NOT v_prefs.portal_enabled THEN RETURN FALSE; END IF;

    -- Check message type
    IF p_message_type = 'marketing' AND NOT v_prefs.marketing_enabled THEN RETURN FALSE; END IF;
    IF p_message_type = 'reminder' AND NOT v_prefs.reminder_enabled THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION get_unread_count(
    p_tenant_id UUID,
    p_user_id UUID
) RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(DISTINCT c.id)
    INTO v_count
    FROM conversations c
    JOIN conversation_messages m ON m.conversation_id = c.id
    WHERE c.tenant_id = p_tenant_id
      AND (c.assigned_to = p_user_id OR c.assigned_to IS NULL)
      AND c.status IN ('open', 'pending')
      AND m.direction = 'inbound'
      AND m.read_at IS NULL;

    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET last_message_at = NEW.created_at,
        status = CASE
            WHEN NEW.direction = 'inbound' AND status = 'closed' THEN 'open'
            ELSE status
        END
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON conversation_messages;
CREATE TRIGGER trigger_update_conversation_last_message
    AFTER INSERT ON conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_last_message();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE conversations IS 'Patient communication threads across all channels';
COMMENT ON TABLE conversation_messages IS 'Individual messages within conversations';
COMMENT ON TABLE message_templates IS 'Reusable message templates for common communications';
COMMENT ON TABLE broadcast_messages IS 'Bulk messaging campaigns';
COMMENT ON TABLE broadcast_recipients IS 'Individual recipients and their status for broadcasts';
COMMENT ON TABLE communication_preferences IS 'Patient communication preferences and opt-ins';
COMMENT ON TABLE communication_unsubscribes IS 'Patient unsubscribe records for compliance';
COMMENT ON TABLE conversation_routing_rules IS 'Auto-routing rules for incoming messages';
COMMENT ON TABLE after_hours_config IS 'After-hours auto-response configuration';
