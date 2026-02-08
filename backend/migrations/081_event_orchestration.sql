-- ============================================================================
-- Event Orchestration Migration
-- Master Event Bus System for Dermatology CRM
-- Connects all systems: Patient Engagement, Referrals, Intake, Revenue Cycle,
-- Inventory, Quality Measures, Staff Scheduling, SMS Workflow
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- EVENT DEFINITIONS TABLE
-- Defines all events that can be emitted in the system
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name VARCHAR(255) NOT NULL UNIQUE,
  event_category VARCHAR(100) NOT NULL,
  description TEXT,
  payload_schema JSONB DEFAULT '{}',
  example_payload JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_definitions_name ON event_definitions(event_name);
CREATE INDEX idx_event_definitions_category ON event_definitions(event_category);
CREATE INDEX idx_event_definitions_active ON event_definitions(is_active);

-- ============================================================================
-- EVENT HANDLERS TABLE
-- Defines handlers that respond to events
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_handlers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name VARCHAR(255) NOT NULL,
  handler_name VARCHAR(255) NOT NULL,
  handler_service VARCHAR(255) NOT NULL,
  handler_method VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  is_async BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  retry_delay_ms INTEGER DEFAULT 1000,
  timeout_ms INTEGER DEFAULT 30000,
  config JSONB DEFAULT '{}',
  conditions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_name, handler_name)
);

CREATE INDEX idx_event_handlers_event_name ON event_handlers(event_name);
CREATE INDEX idx_event_handlers_service ON event_handlers(handler_service);
CREATE INDEX idx_event_handlers_active ON event_handlers(is_active);
CREATE INDEX idx_event_handlers_priority ON event_handlers(event_name, priority);

-- ============================================================================
-- EVENT LOG TABLE
-- Audit trail of all events processed
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  event_id VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}',
  source_service VARCHAR(255),
  source_user_id UUID,
  entity_type VARCHAR(100),
  entity_id UUID,
  correlation_id UUID,
  parent_event_id UUID,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_duration_ms INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  processed_handlers JSONB DEFAULT '[]',
  errors JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_event_log_tenant ON event_log(tenant_id);
CREATE INDEX idx_event_log_event_name ON event_log(event_name);
CREATE INDEX idx_event_log_triggered_at ON event_log(triggered_at DESC);
CREATE INDEX idx_event_log_status ON event_log(status);
CREATE INDEX idx_event_log_entity ON event_log(entity_type, entity_id);
CREATE INDEX idx_event_log_correlation ON event_log(correlation_id);
CREATE INDEX idx_event_log_source ON event_log(source_service);

-- Partitioning for large event logs (optional - can be enabled later)
-- CREATE TABLE event_log_y2024m01 PARTITION OF event_log
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================================================
-- EVENT HANDLER EXECUTION LOG
-- Detailed log of each handler execution
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_handler_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_log_id UUID NOT NULL REFERENCES event_log(id),
  handler_id UUID NOT NULL REFERENCES event_handlers(id),
  handler_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  attempt_number INTEGER DEFAULT 1,
  result JSONB DEFAULT '{}',
  error_message TEXT,
  error_stack TEXT,
  retry_scheduled_at TIMESTAMPTZ
);

CREATE INDEX idx_handler_executions_event_log ON event_handler_executions(event_log_id);
CREATE INDEX idx_handler_executions_handler ON event_handler_executions(handler_id);
CREATE INDEX idx_handler_executions_status ON event_handler_executions(status);
CREATE INDEX idx_handler_executions_retry ON event_handler_executions(retry_scheduled_at) WHERE status = 'failed';

-- ============================================================================
-- EVENT SUBSCRIPTIONS TABLE
-- External webhook subscriptions for events
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  subscription_name VARCHAR(255) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  event_pattern VARCHAR(255),
  webhook_url TEXT NOT NULL,
  http_method VARCHAR(10) DEFAULT 'POST',
  headers JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  secret_key VARCHAR(255),
  signing_algorithm VARCHAR(50) DEFAULT 'sha256',
  retry_count INTEGER DEFAULT 3,
  retry_delay_ms INTEGER DEFAULT 1000,
  timeout_ms INTEGER DEFAULT 10000,
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  UNIQUE(tenant_id, subscription_name)
);

CREATE INDEX idx_event_subscriptions_tenant ON event_subscriptions(tenant_id);
CREATE INDEX idx_event_subscriptions_event ON event_subscriptions(event_name);
CREATE INDEX idx_event_subscriptions_active ON event_subscriptions(is_active);
CREATE INDEX idx_event_subscriptions_pattern ON event_subscriptions(event_pattern);

-- ============================================================================
-- EVENT SUBSCRIPTION DELIVERY LOG
-- Track webhook deliveries
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_subscription_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES event_subscriptions(id),
  event_log_id UUID NOT NULL REFERENCES event_log(id),
  attempt_number INTEGER DEFAULT 1,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  next_retry_at TIMESTAMPTZ
);

CREATE INDEX idx_subscription_deliveries_subscription ON event_subscription_deliveries(subscription_id);
CREATE INDEX idx_subscription_deliveries_event ON event_subscription_deliveries(event_log_id);
CREATE INDEX idx_subscription_deliveries_status ON event_subscription_deliveries(status);
CREATE INDEX idx_subscription_deliveries_retry ON event_subscription_deliveries(next_retry_at) WHERE status = 'pending';

-- ============================================================================
-- EVENT QUEUE TABLE
-- For async event processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 100,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  status VARCHAR(50) DEFAULT 'pending',
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(255),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_queue_status ON event_queue(status, scheduled_at);
CREATE INDEX idx_event_queue_tenant ON event_queue(tenant_id);
CREATE INDEX idx_event_queue_priority ON event_queue(priority DESC, scheduled_at);
CREATE INDEX idx_event_queue_locked ON event_queue(locked_at) WHERE status = 'processing';

-- ============================================================================
-- DEAD LETTER QUEUE
-- Failed events that need manual review
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_event_id UUID,
  tenant_id UUID NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  source_service VARCHAR(255),
  error_message TEXT,
  error_stack TEXT,
  failure_count INTEGER DEFAULT 1,
  first_failed_at TIMESTAMPTZ DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  requeued_at TIMESTAMPTZ
);

CREATE INDEX idx_dlq_tenant ON event_dead_letter_queue(tenant_id);
CREATE INDEX idx_dlq_status ON event_dead_letter_queue(status);
CREATE INDEX idx_dlq_event_name ON event_dead_letter_queue(event_name);
CREATE INDEX idx_dlq_first_failed ON event_dead_letter_queue(first_failed_at DESC);

-- ============================================================================
-- SEED DEFAULT EVENT DEFINITIONS
-- ============================================================================

INSERT INTO event_definitions (event_name, event_category, description, payload_schema, is_system) VALUES
-- Appointment Events
('appointment.scheduled', 'appointment', 'Fired when a new appointment is scheduled',
  '{"type": "object", "properties": {"appointmentId": {"type": "string"}, "patientId": {"type": "string"}, "providerId": {"type": "string"}, "startTime": {"type": "string"}, "appointmentType": {"type": "string"}}}', true),
('appointment.confirmed', 'appointment', 'Fired when patient confirms appointment',
  '{"type": "object", "properties": {"appointmentId": {"type": "string"}, "confirmedAt": {"type": "string"}, "confirmedVia": {"type": "string"}}}', true),
('appointment.completed', 'appointment', 'Fired when appointment is marked as completed',
  '{"type": "object", "properties": {"appointmentId": {"type": "string"}, "encounterId": {"type": "string"}, "completedAt": {"type": "string"}}}', true),
('appointment.cancelled', 'appointment', 'Fired when appointment is cancelled',
  '{"type": "object", "properties": {"appointmentId": {"type": "string"}, "cancelledBy": {"type": "string"}, "reason": {"type": "string"}}}', true),
('appointment.no_show', 'appointment', 'Fired when patient is marked as no-show',
  '{"type": "object", "properties": {"appointmentId": {"type": "string"}, "patientId": {"type": "string"}}}', true),
('appointment.checked_in', 'appointment', 'Fired when patient checks in',
  '{"type": "object", "properties": {"appointmentId": {"type": "string"}, "checkedInAt": {"type": "string"}}}', true),
('appointment.roomed', 'appointment', 'Fired when patient is roomed',
  '{"type": "object", "properties": {"appointmentId": {"type": "string"}, "roomId": {"type": "string"}}}', true),

-- Referral Events
('referral.received', 'referral', 'Fired when a new referral is received',
  '{"type": "object", "properties": {"referralId": {"type": "string"}, "patientId": {"type": "string"}, "referringProviderId": {"type": "string"}, "urgency": {"type": "string"}}}', true),
('referral.scheduled', 'referral', 'Fired when referral appointment is scheduled',
  '{"type": "object", "properties": {"referralId": {"type": "string"}, "appointmentId": {"type": "string"}}}', true),
('referral.completed', 'referral', 'Fired when referral visit is completed',
  '{"type": "object", "properties": {"referralId": {"type": "string"}, "encounterId": {"type": "string"}, "consultationReportId": {"type": "string"}}}', true),
('referral.expired', 'referral', 'Fired when referral expires without being scheduled',
  '{"type": "object", "properties": {"referralId": {"type": "string"}, "expiredAt": {"type": "string"}}}', true),

-- Billing Events
('claim.submitted', 'billing', 'Fired when a claim is submitted to payer',
  '{"type": "object", "properties": {"claimId": {"type": "string"}, "claimNumber": {"type": "string"}, "payerId": {"type": "string"}, "totalCents": {"type": "integer"}}}', true),
('claim.paid', 'billing', 'Fired when claim payment is received',
  '{"type": "object", "properties": {"claimId": {"type": "string"}, "paidAmountCents": {"type": "integer"}, "patientResponsibilityCents": {"type": "integer"}}}', true),
('claim.denied', 'billing', 'Fired when claim is denied',
  '{"type": "object", "properties": {"claimId": {"type": "string"}, "denialCode": {"type": "string"}, "denialReason": {"type": "string"}, "appealDeadline": {"type": "string"}}}', true),
('claim.adjusted', 'billing', 'Fired when claim adjustment is posted',
  '{"type": "object", "properties": {"claimId": {"type": "string"}, "adjustmentCode": {"type": "string"}, "adjustmentCents": {"type": "integer"}}}', true),
('payment.received', 'billing', 'Fired when any payment is received',
  '{"type": "object", "properties": {"paymentId": {"type": "string"}, "patientId": {"type": "string"}, "amountCents": {"type": "integer"}, "paymentMethod": {"type": "string"}}}', true),
('payment_plan.payment_due', 'billing', 'Fired when payment plan payment is due',
  '{"type": "object", "properties": {"planId": {"type": "string"}, "patientId": {"type": "string"}, "amountDueCents": {"type": "integer"}, "dueDate": {"type": "string"}}}', true),

-- Clinical Events
('lab_result.received', 'clinical', 'Fired when lab result is received',
  '{"type": "object", "properties": {"resultId": {"type": "string"}, "patientId": {"type": "string"}, "testName": {"type": "string"}, "isCritical": {"type": "boolean"}}}', true),
('prescription.sent', 'clinical', 'Fired when prescription is sent to pharmacy',
  '{"type": "object", "properties": {"prescriptionId": {"type": "string"}, "patientId": {"type": "string"}, "medicationName": {"type": "string"}, "pharmacyName": {"type": "string"}}}', true),
('treatment_plan.created', 'clinical', 'Fired when treatment plan is created',
  '{"type": "object", "properties": {"treatmentPlanId": {"type": "string"}, "patientId": {"type": "string"}, "diagnosisCode": {"type": "string"}, "treatmentType": {"type": "string"}}}', true),
('encounter.signed', 'clinical', 'Fired when encounter is signed/locked',
  '{"type": "object", "properties": {"encounterId": {"type": "string"}, "providerId": {"type": "string"}, "signedAt": {"type": "string"}}}', true),

-- Inventory Events
('inventory.low_stock', 'inventory', 'Fired when inventory item falls below reorder point',
  '{"type": "object", "properties": {"itemId": {"type": "string"}, "itemName": {"type": "string"}, "currentQuantity": {"type": "integer"}, "reorderPoint": {"type": "integer"}}}', true),
('inventory.expired', 'inventory', 'Fired when inventory lot expires',
  '{"type": "object", "properties": {"lotId": {"type": "string"}, "itemId": {"type": "string"}, "itemName": {"type": "string"}, "quantity": {"type": "integer"}}}', true),
('inventory.used', 'inventory', 'Fired when inventory is used for procedure',
  '{"type": "object", "properties": {"itemId": {"type": "string"}, "encounterId": {"type": "string"}, "quantity": {"type": "integer"}}}', true),
('equipment.maintenance_due', 'inventory', 'Fired when equipment maintenance is due',
  '{"type": "object", "properties": {"equipmentId": {"type": "string"}, "equipmentName": {"type": "string"}, "dueDate": {"type": "string"}}}', true),

-- Patient Events
('patient.created', 'patient', 'Fired when new patient is created',
  '{"type": "object", "properties": {"patientId": {"type": "string"}, "firstName": {"type": "string"}, "lastName": {"type": "string"}, "isFromReferral": {"type": "boolean"}}}', true),
('patient.birthday', 'patient', 'Fired on patient birthday',
  '{"type": "object", "properties": {"patientId": {"type": "string"}, "patientName": {"type": "string"}, "age": {"type": "integer"}}}', true),
('patient.anniversary', 'patient', 'Fired on patient practice anniversary',
  '{"type": "object", "properties": {"patientId": {"type": "string"}, "years": {"type": "integer"}}}', true),
('patient.inactive', 'patient', 'Fired when patient becomes inactive',
  '{"type": "object", "properties": {"patientId": {"type": "string"}, "lastVisitDate": {"type": "string"}, "daysSinceVisit": {"type": "integer"}}}', true),

-- Quality/Compliance Events
('quality_measure.gap_identified', 'quality', 'Fired when care gap is identified',
  '{"type": "object", "properties": {"patientId": {"type": "string"}, "measureId": {"type": "string"}, "gapType": {"type": "string"}}}', true),
('quality_measure.met', 'quality', 'Fired when quality measure is met',
  '{"type": "object", "properties": {"patientId": {"type": "string"}, "measureId": {"type": "string"}, "metAt": {"type": "string"}}}', true),

-- Staff Events
('staff.overtime_alert', 'staff', 'Fired when staff approaches overtime threshold',
  '{"type": "object", "properties": {"staffId": {"type": "string"}, "hoursWorked": {"type": "number"}, "threshold": {"type": "number"}}}', true),
('staff.credential_expiring', 'staff', 'Fired when staff credential is expiring',
  '{"type": "object", "properties": {"staffId": {"type": "string"}, "credentialType": {"type": "string"}, "expirationDate": {"type": "string"}}}', true),
('staff.schedule_conflict', 'staff', 'Fired when scheduling conflict detected',
  '{"type": "object", "properties": {"staffId": {"type": "string"}, "conflictDetails": {"type": "object"}}}', true)

ON CONFLICT (event_name) DO NOTHING;

-- ============================================================================
-- SEED DEFAULT EVENT HANDLERS
-- ============================================================================

INSERT INTO event_handlers (event_name, handler_name, handler_service, handler_method, description, priority, is_async) VALUES
-- Appointment.Scheduled Handlers
('appointment.scheduled', 'send_confirmation_sms', 'smsWorkflowService', 'sendAppointmentConfirmation', 'Send SMS confirmation to patient', 100, true),
('appointment.scheduled', 'check_insurance_eligibility', 'eligibilityService', 'queueEligibilityCheck', 'Queue insurance eligibility verification', 90, true),
('appointment.scheduled', 'trigger_intake_if_new', 'patientIntakeService', 'checkAndTriggerIntake', 'Send intake forms if new patient', 80, true),
('appointment.scheduled', 'schedule_reminders', 'reminderService', 'scheduleAppointmentReminders', 'Schedule 24h and 2h reminders', 70, true),

-- Appointment.Completed Handlers
('appointment.completed', 'schedule_survey', 'patientEngagementService', 'schedulePostAppointmentSurvey', 'Schedule satisfaction survey', 100, true),
('appointment.completed', 'award_loyalty_points', 'patientEngagementService', 'awardAppointmentPoints', 'Award loyalty points for visit', 90, true),
('appointment.completed', 'evaluate_quality_measures', 'qualityMeasuresService', 'evaluatePatientMeasures', 'Evaluate quality measures', 80, true),
('appointment.completed', 'generate_recommendations', 'patientEngagementService', 'generateProductRecommendations', 'Generate product recommendations', 70, true),
('appointment.completed', 'send_educational_content', 'patientEngagementService', 'sendEducationalContent', 'Send condition-specific education', 60, true),
('appointment.completed', 'deduct_procedure_inventory', 'inventoryService', 'deductProcedureSupplies', 'Deduct inventory used in procedure', 50, true),

-- Appointment.Cancelled Handlers
('appointment.cancelled', 'notify_waitlist', 'waitlistService', 'notifyWaitlistOfOpening', 'Notify waitlist patients of opening', 100, true),
('appointment.cancelled', 'update_room_schedule', 'staffSchedulingService', 'releaseRoomReservation', 'Release room reservation', 90, true),
('appointment.cancelled', 'send_cancellation_sms', 'smsWorkflowService', 'sendAppointmentCancelled', 'Send cancellation SMS to patient', 80, true),

-- Appointment.NoShow Handlers
('appointment.no_show', 'log_no_show', 'patientEngagementService', 'logNoShow', 'Log no-show and update score', 100, true),
('appointment.no_show', 'trigger_followup', 'recallService', 'scheduleNoShowFollowUp', 'Schedule follow-up outreach', 90, true),
('appointment.no_show', 'update_engagement_score', 'patientEngagementService', 'updateEngagementScore', 'Update patient engagement score', 80, true),

-- Referral.Received Handlers
('referral.received', 'create_patient_if_new', 'patientService', 'createFromReferral', 'Create patient record if new', 100, false),
('referral.received', 'send_intake_link', 'patientIntakeService', 'sendIntakeLink', 'Send intake forms to patient', 90, true),
('referral.received', 'verify_insurance', 'eligibilityService', 'verifyReferralInsurance', 'Verify insurance from referral', 80, true),
('referral.received', 'notify_staff', 'notificationService', 'notifyNewReferral', 'Alert staff of new referral', 70, true),

-- Referral.Scheduled Handlers
('referral.scheduled', 'update_referral_status', 'referralService', 'updateStatusToScheduled', 'Update referral status', 100, false),
('referral.scheduled', 'notify_referring_provider', 'referralService', 'notifyReferringProvider', 'Notify referring provider of scheduling', 90, true),
('referral.scheduled', 'send_patient_confirmation', 'smsWorkflowService', 'sendAppointmentConfirmation', 'Send confirmation to patient', 80, true),

-- Referral.Completed Handlers
('referral.completed', 'generate_consultation_report', 'referralService', 'generateConsultationReport', 'Generate consultation report', 100, true),
('referral.completed', 'send_to_referring_provider', 'referralService', 'sendReportToReferringProvider', 'Send report to referring provider', 90, true),
('referral.completed', 'close_referral_loop', 'referralService', 'closeReferralLoop', 'Close the referral loop', 80, true),

-- Claim Handlers
('claim.submitted', 'log_submission', 'revenueCycleService', 'logClaimSubmission', 'Log claim submission for tracking', 100, true),
('claim.submitted', 'start_tracking', 'revenueCycleService', 'startClaimTracking', 'Start claim status tracking', 90, true),

('claim.paid', 'check_underpayment', 'revenueCycleService', 'identifyUnderpayment', 'Check for underpayment vs contract', 100, true),
('claim.paid', 'update_ar', 'revenueCycleService', 'updateAccountsReceivable', 'Update A/R balance', 90, true),
('claim.paid', 'post_payment', 'revenueCycleService', 'postPayment', 'Post payment to patient account', 80, true),

('claim.denied', 'categorize_denial', 'revenueCycleService', 'processDenial', 'Categorize and process denial', 100, true),
('claim.denied', 'create_appeal_task', 'taskService', 'createAppealTask', 'Create task for appeal review', 90, true),
('claim.denied', 'notify_billing_staff', 'notificationService', 'notifyClaimDenied', 'Alert billing staff', 80, true),

('payment.received', 'apply_to_balance', 'revenueCycleService', 'applyPaymentToBalance', 'Apply payment to patient balance', 100, false),
('payment.received', 'check_payment_plan', 'revenueCycleService', 'checkPaymentPlanStatus', 'Update payment plan if applicable', 90, true),
('payment.received', 'send_receipt', 'smsWorkflowService', 'sendPaymentReceipt', 'Send payment receipt', 80, true),

-- Clinical Handlers
('lab_result.received', 'notify_provider', 'notificationService', 'notifyLabResult', 'Notify ordering provider', 100, true),
('lab_result.received', 'notify_patient', 'smsWorkflowService', 'sendLabResultsReady', 'Notify patient results ready', 90, true),
('lab_result.received', 'check_quality_measures', 'qualityMeasuresService', 'evaluateLabMeasures', 'Evaluate quality measures', 80, true),

('prescription.sent', 'track_for_pi', 'qualityMeasuresService', 'trackEPrescribing', 'Track for PI e-prescribing measure', 100, true),
('prescription.sent', 'notify_patient', 'smsWorkflowService', 'sendPrescriptionSent', 'Notify patient prescription sent', 90, true),

('treatment_plan.created', 'schedule_adherence_reminders', 'patientEngagementService', 'scheduleAdherenceReminders', 'Schedule adherence reminders', 100, true),
('treatment_plan.created', 'send_educational_content', 'patientEngagementService', 'sendEducationalContent', 'Send educational content', 90, true),

-- Inventory Handlers
('inventory.low_stock', 'create_purchase_order', 'inventoryService', 'autoCreatePurchaseOrder', 'Auto-create PO for low stock', 100, true),
('inventory.low_stock', 'notify_manager', 'notificationService', 'notifyLowStock', 'Alert inventory manager', 90, true),

('inventory.expired', 'remove_from_available', 'inventoryService', 'removeExpiredLot', 'Remove from available inventory', 100, false),
('inventory.expired', 'log_waste', 'inventoryService', 'logInventoryWaste', 'Log waste for reporting', 90, true),
('inventory.expired', 'alert_staff', 'notificationService', 'notifyExpiredInventory', 'Alert staff of expired items', 80, true),

('equipment.maintenance_due', 'schedule_maintenance', 'staffSchedulingService', 'scheduleMaintenance', 'Schedule maintenance appointment', 100, true),
('equipment.maintenance_due', 'notify_staff', 'notificationService', 'notifyMaintenanceDue', 'Alert maintenance staff', 90, true),

-- Patient Handlers
('patient.birthday', 'send_birthday_message', 'patientEngagementService', 'sendBirthdayMessage', 'Send birthday greeting and offer', 100, true),
('patient.birthday', 'award_bonus_points', 'patientEngagementService', 'awardBirthdayPoints', 'Award birthday bonus points', 90, true),

('patient.created', 'send_welcome', 'patientEngagementService', 'sendWelcomeMessage', 'Send welcome message', 100, true),
('patient.created', 'activate_portal', 'patientPortalService', 'activatePortalAccount', 'Activate patient portal access', 90, true),
('patient.created', 'enroll_in_loyalty', 'patientEngagementService', 'enrollInLoyaltyProgram', 'Enroll in loyalty program', 80, true),

('patient.inactive', 'trigger_recall_campaign', 'recallService', 'initiateRecallCampaign', 'Start recall outreach campaign', 100, true)

ON CONFLICT (event_name, handler_name) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to emit an event (called from application code or triggers)
CREATE OR REPLACE FUNCTION emit_event(
  p_tenant_id UUID,
  p_event_name VARCHAR(255),
  p_payload JSONB,
  p_source_service VARCHAR(255) DEFAULT NULL,
  p_source_user_id UUID DEFAULT NULL,
  p_entity_type VARCHAR(100) DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO event_log (
    tenant_id, event_name, payload, source_service, source_user_id,
    entity_type, entity_id, correlation_id, status
  ) VALUES (
    p_tenant_id, p_event_name, p_payload, p_source_service, p_source_user_id,
    p_entity_type, p_entity_id, COALESCE(p_correlation_id, uuid_generate_v4()), 'pending'
  ) RETURNING id INTO v_event_id;

  -- Also queue for async processing
  INSERT INTO event_queue (tenant_id, event_name, payload, priority)
  SELECT p_tenant_id, p_event_name,
         jsonb_build_object('eventLogId', v_event_id) || p_payload,
         COALESCE((SELECT MIN(priority) FROM event_handlers WHERE event_name = p_event_name AND is_active = true), 100);

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending events for processing
CREATE OR REPLACE FUNCTION get_pending_events(
  p_batch_size INTEGER DEFAULT 10,
  p_worker_id VARCHAR(255) DEFAULT 'default'
) RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  event_name VARCHAR(255),
  payload JSONB
) AS $$
BEGIN
  RETURN QUERY
  UPDATE event_queue eq
  SET status = 'processing',
      locked_at = NOW(),
      locked_by = p_worker_id,
      attempts = attempts + 1
  WHERE eq.id IN (
    SELECT eq2.id
    FROM event_queue eq2
    WHERE eq2.status = 'pending'
      AND eq2.scheduled_at <= NOW()
      AND eq2.attempts < eq2.max_attempts
    ORDER BY eq2.priority DESC, eq2.scheduled_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING eq.id, eq.tenant_id, eq.event_name, eq.payload;
END;
$$ LANGUAGE plpgsql;

-- Function to mark event as completed
CREATE OR REPLACE FUNCTION complete_event(
  p_queue_id UUID,
  p_event_log_id UUID,
  p_processed_handlers JSONB DEFAULT '[]'
) RETURNS VOID AS $$
BEGIN
  -- Update queue
  UPDATE event_queue
  SET status = 'completed', processed_at = NOW(), locked_at = NULL, locked_by = NULL
  WHERE id = p_queue_id;

  -- Update event log
  UPDATE event_log
  SET status = 'completed',
      processed_at = NOW(),
      processing_duration_ms = EXTRACT(EPOCH FROM (NOW() - triggered_at)) * 1000,
      processed_handlers = p_processed_handlers
  WHERE id = p_event_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to fail event
CREATE OR REPLACE FUNCTION fail_event(
  p_queue_id UUID,
  p_event_log_id UUID,
  p_error_message TEXT,
  p_move_to_dlq BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
DECLARE
  v_event_record RECORD;
BEGIN
  SELECT * INTO v_event_record FROM event_queue WHERE id = p_queue_id;

  IF v_event_record.attempts >= v_event_record.max_attempts OR p_move_to_dlq THEN
    -- Move to dead letter queue
    INSERT INTO event_dead_letter_queue (
      original_event_id, tenant_id, event_name, payload, source_service, error_message
    ) VALUES (
      p_event_log_id, v_event_record.tenant_id, v_event_record.event_name,
      v_event_record.payload, 'eventBusService', p_error_message
    );

    UPDATE event_queue SET status = 'dead_letter', locked_at = NULL, locked_by = NULL WHERE id = p_queue_id;
    UPDATE event_log SET status = 'failed', errors = errors || jsonb_build_object('error', p_error_message, 'at', NOW()) WHERE id = p_event_log_id;
  ELSE
    -- Schedule retry
    UPDATE event_queue
    SET status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        scheduled_at = NOW() + (POWER(2, v_event_record.attempts) || ' seconds')::INTERVAL,
        error_message = p_error_message
    WHERE id = p_queue_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

CREATE OR REPLACE VIEW v_event_stats AS
SELECT
  el.event_name,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE el.status = 'completed') as completed,
  COUNT(*) FILTER (WHERE el.status = 'failed') as failed,
  COUNT(*) FILTER (WHERE el.status = 'pending') as pending,
  AVG(el.processing_duration_ms) FILTER (WHERE el.status = 'completed') as avg_duration_ms,
  MAX(el.triggered_at) as last_triggered,
  DATE_TRUNC('hour', el.triggered_at) as hour
FROM event_log el
WHERE el.triggered_at > NOW() - INTERVAL '24 hours'
GROUP BY el.event_name, DATE_TRUNC('hour', el.triggered_at)
ORDER BY hour DESC, total_events DESC;

CREATE OR REPLACE VIEW v_handler_performance AS
SELECT
  ehe.handler_name,
  eh.handler_service,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE ehe.status = 'completed') as successful,
  COUNT(*) FILTER (WHERE ehe.status = 'failed') as failed,
  AVG(ehe.duration_ms) FILTER (WHERE ehe.status = 'completed') as avg_duration_ms,
  MAX(ehe.completed_at) as last_execution
FROM event_handler_executions ehe
JOIN event_handlers eh ON eh.id = ehe.handler_id
WHERE ehe.started_at > NOW() - INTERVAL '24 hours'
GROUP BY ehe.handler_name, eh.handler_service
ORDER BY total_executions DESC;

CREATE OR REPLACE VIEW v_dead_letter_queue_summary AS
SELECT
  dlq.event_name,
  COUNT(*) as count,
  MIN(dlq.first_failed_at) as oldest_failure,
  MAX(dlq.last_failed_at) as newest_failure
FROM event_dead_letter_queue dlq
WHERE dlq.status = 'pending'
GROUP BY dlq.event_name
ORDER BY count DESC;

-- ============================================================================
-- CLEANUP FUNCTION (Run periodically)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_events(
  p_days_to_keep INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete old completed events from queue
  DELETE FROM event_queue
  WHERE status = 'completed' AND processed_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Archive old event logs (in production, move to archive table first)
  DELETE FROM event_handler_executions
  WHERE completed_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;

  DELETE FROM event_subscription_deliveries
  WHERE delivered_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;

  -- Note: Don't auto-delete event_log - keep for audit
  -- Consider archiving to cold storage instead

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE event_definitions IS 'Registry of all events that can be emitted in the system';
COMMENT ON TABLE event_handlers IS 'Handlers that respond to events, with priority ordering';
COMMENT ON TABLE event_log IS 'Audit trail of all events processed in the system';
COMMENT ON TABLE event_subscriptions IS 'External webhook subscriptions for events';
COMMENT ON TABLE event_queue IS 'Queue for async event processing';
COMMENT ON TABLE event_dead_letter_queue IS 'Failed events requiring manual intervention';
COMMENT ON FUNCTION emit_event IS 'Main function to emit an event into the system';
