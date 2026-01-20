# Slack and Microsoft Teams Integrations

This module provides real-time notifications to Slack and Microsoft Teams for important events in the dermatology EHR system.

## Features

- **Slack Integration**: Send notifications to Slack channels via incoming webhooks
- **Microsoft Teams Integration**: Send notifications to Teams channels using adaptive cards
- **9 Notification Types**:
  - Appointment booked
  - Appointment cancelled
  - Patient checked in
  - Prior authorization approved
  - Prior authorization denied
  - Lab results ready
  - Urgent messages received
  - Daily schedule summary
  - End of day report
- **Configurable Per Tenant**: Each tenant can configure their own integrations
- **Notification Logging**: All notifications are logged for audit and debugging
- **Test Functionality**: Test webhooks before enabling
- **Statistics Tracking**: Track success/failure rates for each integration

## Setup

### Database Migration

Run the migration to create the necessary tables:

```bash
# The migration creates:
# - integrations table
# - integration_notification_logs table
```

Migration file: `backend/migrations/057_integrations.sql`

### Backend Setup

The integration services are automatically loaded when the backend starts. No additional configuration needed.

### Slack Webhook Setup

1. Go to your Slack workspace settings
2. Navigate to Apps > Incoming Webhooks
3. Click "Add to Slack"
4. Select the channel where notifications should be posted
5. Copy the webhook URL (format: `https://hooks.slack.com/services/...`)
6. In the EHR admin panel, go to Settings > Integrations
7. Click "Connect Slack" and paste the webhook URL
8. Select which notification types you want to receive
9. Click "Test Connection" to verify

### Microsoft Teams Webhook Setup

1. Open Microsoft Teams
2. Go to the channel where you want to receive notifications
3. Click the three dots (...) next to the channel name
4. Select "Connectors"
5. Find "Incoming Webhook" and click "Configure"
6. Give it a name (e.g., "EHR Notifications") and upload an icon if desired
7. Copy the webhook URL (format: `https://...webhook.office.com/...`)
8. In the EHR admin panel, go to Settings > Integrations
9. Click "Connect Teams" and paste the webhook URL
10. Select which notification types you want to receive
11. Click "Test Connection" to verify

## Usage

### Sending Notifications

Notifications are automatically sent when certain events occur in the system. To manually send a notification:

```typescript
import { notificationService } from './services/integrations/notificationService';

await notificationService.sendNotification({
  tenantId: 'tenant-uuid',
  notificationType: 'appointment_booked',
  data: {
    patientName: 'John Doe',
    appointmentType: 'Follow-up',
    scheduledStart: '2024-01-15T10:00:00Z',
    scheduledEnd: '2024-01-15T10:30:00Z',
    providerName: 'Dr. Smith',
    locationName: 'Main Clinic',
  },
});
```

### Notification Types and Required Data

#### appointment_booked
```typescript
{
  patientName: string;
  appointmentType: string;
  scheduledStart: string; // ISO datetime
  scheduledEnd: string; // ISO datetime
  providerName: string;
  locationName: string;
  appointmentUrl?: string; // Optional link
}
```

#### appointment_cancelled
```typescript
{
  patientName: string;
  appointmentType: string;
  scheduledStart: string;
  providerName: string;
  cancelReason?: string;
  appointmentUrl?: string;
}
```

#### patient_checked_in
```typescript
{
  patientName: string;
  appointmentType: string;
  scheduledStart: string;
  providerName: string;
  checkedInAt: string; // ISO datetime
  appointmentUrl?: string;
}
```

#### prior_auth_approved
```typescript
{
  patientName: string;
  medication: string;
  insurancePlan: string;
  approvedAt: string;
  referenceNumber?: string;
  priorAuthUrl?: string;
}
```

#### prior_auth_denied
```typescript
{
  patientName: string;
  medication: string;
  insurancePlan: string;
  deniedAt: string;
  denialReason?: string;
  priorAuthUrl?: string;
}
```

#### lab_results_ready
```typescript
{
  patientName: string;
  labTest: string;
  orderedBy: string;
  completedAt: string;
  resultsUrl?: string;
}
```

#### urgent_message
```typescript
{
  patientName: string;
  messageSubject: string;
  messagePreview: string; // First 150 chars
  sentAt: string;
  messageUrl?: string;
}
```

#### daily_schedule_summary
```typescript
{
  date: string;
  totalAppointments: number;
  providers: Array<{
    name: string;
    appointmentCount: number;
  }>;
  firstAppointmentTime?: string;
  lastAppointmentTime?: string;
  scheduleUrl?: string;
}
```

#### end_of_day_report
```typescript
{
  date: string;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  totalRevenue?: number;
  reportUrl?: string;
}
```

## API Endpoints

### List Integrations
```http
GET /api/integrations
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
```

Returns all configured integrations for the tenant with statistics.

### Create Slack Integration
```http
POST /api/integrations/slack
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
Content-Type: application/json

{
  "webhookUrl": "https://hooks.slack.com/services/...",
  "channelName": "#general",
  "notificationTypes": ["appointment_booked", "urgent_message"]
}
```

### Create Teams Integration
```http
POST /api/integrations/teams
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
Content-Type: application/json

{
  "webhookUrl": "https://...webhook.office.com/...",
  "channelName": "General",
  "notificationTypes": ["appointment_booked", "urgent_message"]
}
```

### Update Integration
```http
PATCH /api/integrations/:id
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
Content-Type: application/json

{
  "enabled": true,
  "notificationTypes": ["appointment_booked", "patient_checked_in"]
}
```

### Delete Integration
```http
DELETE /api/integrations/:id
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
```

### Test Integration
```http
POST /api/integrations/:id/test
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
```

Sends a test notification to verify the webhook is working.

### Get Notification Logs
```http
GET /api/integrations/logs?limit=50&offset=0&success=true
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
```

Query parameters:
- `limit` (default: 50): Number of logs to return
- `offset` (default: 0): Pagination offset
- `integrationId`: Filter by specific integration
- `success`: Filter by success status (true/false)

### Get Integration Statistics
```http
GET /api/integrations/stats?integrationId=<id>
Authorization: Bearer <token>
X-Tenant-Id: <tenant-id>
```

Returns aggregate statistics for all integrations or a specific integration.

## Architecture

### Services

- **slackService.ts**: Handles Slack-specific message formatting and webhook calls
- **teamsService.ts**: Handles Teams-specific adaptive card formatting and webhook calls
- **notificationService.ts**: Orchestrates sending notifications to all enabled integrations
- **messageTemplates.ts**: Contains all message templates for different notification types

### Database Schema

#### integrations
```sql
CREATE TABLE integrations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  type VARCHAR(50) CHECK (type IN ('slack', 'teams')),
  webhook_url TEXT NOT NULL,
  channel_name VARCHAR(255),
  enabled BOOLEAN DEFAULT true,
  notification_types TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### integration_notification_logs
```sql
CREATE TABLE integration_notification_logs (
  id UUID PRIMARY KEY,
  integration_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  notification_type VARCHAR(100) NOT NULL,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Frontend Integration

The admin settings page is located at:
- **Component**: `frontend/src/pages/IntegrationsSettingsPage.tsx`
- **Route**: `/settings/integrations` (add to your routing configuration)

Features:
- Configure Slack and Teams webhooks
- Select notification types for each integration
- Test connections
- View notification logs
- See success/failure statistics
- Enable/disable integrations
- Remove integrations

## Error Handling

All notification sending is non-blocking and will not cause the main operation to fail. If a notification fails to send:

1. The error is logged via the logger
2. The notification attempt is recorded in `integration_notification_logs` with `success = false`
3. The error message is stored for debugging
4. The system continues normal operation

## Performance Considerations

- Notifications are sent asynchronously to avoid blocking main operations
- Multiple integrations for a single event are sent in parallel
- Failed notifications are logged but do not retry automatically
- Webhook timeouts are set to 10 seconds to prevent hanging

## Security

- Webhook URLs are validated (must start with proper domain)
- Only admins can configure integrations (enforced via RBAC)
- Webhook URLs are never exposed in logs (except error messages)
- All API endpoints require authentication and tenant isolation
- PHI is included in notifications - ensure webhook channels are HIPAA-compliant

## Troubleshooting

### Notifications not being sent

1. Check that the integration is enabled
2. Verify the notification type is selected in the integration configuration
3. Check the notification logs for error messages
4. Test the webhook connection from the admin panel
5. Verify the webhook URL is still valid in Slack/Teams

### Test connection fails

1. Verify the webhook URL is correct and starts with the proper domain
2. Check that the webhook hasn't been deleted in Slack/Teams
3. Ensure your server can make outbound HTTPS requests
4. Check firewall rules if behind a corporate proxy

### Messages appear in wrong format

- For Slack: Ensure webhook URL is from Incoming Webhooks (not Bot tokens)
- For Teams: Ensure webhook is an Incoming Webhook connector
- Check the message template in `messageTemplates.ts` for the specific notification type

## Future Enhancements

Potential future improvements:
- Support for Microsoft Teams actionable messages with buttons
- Slack interactive message components
- Email notifications as a third integration type
- Scheduled report digests (weekly summaries, etc.)
- Custom notification templates per tenant
- Notification retry logic for failed sends
- Rate limiting to prevent webhook spam
- Webhook rotation for enhanced security
