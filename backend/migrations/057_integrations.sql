-- Create integrations table for Slack and Teams configurations
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('slack', 'teams')),
  webhook_url TEXT NOT NULL,
  channel_name VARCHAR(255),
  enabled BOOLEAN NOT NULL DEFAULT true,
  notification_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_integrations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Create index on tenant_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_tenant_id ON integrations(tenant_id);

-- Create index on enabled integrations for faster filtering
CREATE INDEX IF NOT EXISTS idx_integrations_enabled ON integrations(tenant_id, enabled) WHERE enabled = true;

-- Create notification logs table
CREATE TABLE IF NOT EXISTS integration_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  notification_type VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_notification_logs_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Create indexes for notification logs
CREATE INDEX IF NOT EXISTS idx_notification_logs_integration_id ON integration_notification_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_tenant_id ON integration_notification_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON integration_notification_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_success ON integration_notification_logs(success);

-- Create updated_at trigger for integrations table
CREATE OR REPLACE FUNCTION update_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_integrations_updated_at();

-- Add comments for documentation
COMMENT ON TABLE integrations IS 'Stores Slack and Microsoft Teams integration configurations per tenant';
COMMENT ON TABLE integration_notification_logs IS 'Logs all notifications sent through integrations for audit and debugging';
COMMENT ON COLUMN integrations.notification_types IS 'Array of enabled notification types: appointment_booked, appointment_cancelled, patient_checked_in, prior_auth_approved, prior_auth_denied, lab_results_ready, urgent_message, daily_schedule_summary, end_of_day_report';
