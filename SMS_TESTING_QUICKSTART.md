# SMS Feature - Quick Testing Guide

## What Was Built

A complete SMS text messaging feature with:
- **Two-way messaging**: Send and receive SMS with patients
- **WhatsApp-style chat UI**: Conversations tab with message history
- **Message templates**: Pre-written messages with variable substitution
- **Bulk messaging**: Send to multiple patients at once
- **Scheduled messages**: Set messages to send at future dates
- **TCPA compliance**: Automatic opt-out handling, consent tracking

## Quick Setup (5 Minutes)

### 1. Get Twilio Credentials

**If you already have a Twilio account:**
1. Login to https://console.twilio.com/
2. Copy your **Account SID** and **Auth Token**
3. Go to **Phone Numbers** and copy your SMS-enabled number

**If you need to create an account:**
1. Sign up at https://www.twilio.com/try-twilio (free $15 credit)
2. Verify your phone number
3. Get a phone number with SMS capability ($1/month or free on trial)
4. Copy Account SID, Auth Token, and phone number

### 2. Update Backend Configuration

Edit `/backend/.env`:
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15551234567
```

### 3. Update Database Settings

Run this SQL (replace with your actual credentials):
```sql
UPDATE sms_settings
SET
  twilio_account_sid = 'ACxxxxxxxxxxxxxxxxx',
  twilio_auth_token = 'xxxxxxxxxxxxxxxxx',
  twilio_phone_number = '+15551234567',
  is_active = true,
  is_test_mode = false
WHERE tenant_id = 'default-tenant';
```

### 4. Run Migration

```bash
cd backend
npm run db:migrate
```

This creates the new `sms_message_reads` table.

### 5. Start Servers

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## Testing the Feature

### Test 1: Send Your First Message

1. Log in to the app at http://localhost:5173
2. Navigate to **Text Messages** in the main menu
3. Click the **Conversations** tab
4. If you have patients with phone numbers, select one
   - Otherwise, add your phone number to a test patient first
5. Type a message and click **Send**
6. Check your phone - you should receive the message!

### Test 2: Receive a Reply

1. Reply to the message from your phone
2. Wait a few seconds
3. The reply should appear in the conversation

**Note:** For local development, you need to expose your backend to the internet for webhooks:
```bash
# Install ngrok if you don't have it
brew install ngrok

# Expose your local backend
ngrok http 4000

# Copy the https URL (e.g., https://abc123.ngrok.io)
# Update Twilio webhook configuration:
# 1. Go to Twilio Console > Phone Numbers > Active Numbers
# 2. Click your number
# 3. Under "Messaging", set:
#    - A MESSAGE COMES IN: https://abc123.ngrok.io/api/sms/webhook/incoming
#    - MESSAGE STATUS: https://abc123.ngrok.io/api/sms/webhook/status
```

### Test 3: Message Templates

1. Click the **Templates** tab
2. View the pre-configured templates
3. Click **+ New Template** to create a custom one
4. Variables you can use:
   - `{firstName}` - Patient's first name
   - `{lastName}` - Patient's last name
   - `{patientName}` - Full name
   - `{date}` - Current date
   - `{time}` - Current time
5. Go back to Conversations
6. Click the **T** button in the message input
7. Select a template - it will be inserted with variables replaced

### Test 4: Bulk Messaging

1. Click the **Bulk Send** tab
2. Select multiple patients (or use "Select All Opted-In")
3. Choose a template or write a custom message
4. Click **Send to X Patients**
5. All selected patients will receive the message

### Test 5: Scheduled Messages

1. Click the **Scheduled** tab
2. Click **+ Schedule Message**
3. Select a patient
4. Choose a template or write a message
5. Set a future date/time
6. Click **Schedule Message**
7. The message will be sent automatically at the scheduled time

### Test 6: Opt-Out Handling (TCPA Compliance)

1. From your phone, reply "STOP" to one of the messages
2. In the app, go to **Settings** tab
3. You should see the patient marked as "Opted Out"
4. Try to send a message to that patient - it should be blocked
5. Reply "START" to opt back in

## API Endpoints

The feature exposes these REST APIs:

**Conversations:**
- `GET /api/sms/conversations` - List all conversations
- `GET /api/sms/conversations/:patientId` - Get conversation with patient
- `POST /api/sms/conversations/:patientId/send` - Send message
- `PUT /api/sms/conversations/:patientId/mark-read` - Mark as read

**Templates:**
- `GET /api/sms/templates` - List templates
- `POST /api/sms/templates` - Create template
- `PATCH /api/sms/templates/:id` - Update template
- `DELETE /api/sms/templates/:id` - Delete template

**Bulk/Scheduled:**
- `POST /api/sms/send-bulk` - Send bulk messages
- `GET /api/sms/scheduled` - List scheduled messages
- `POST /api/sms/scheduled` - Create scheduled message
- `DELETE /api/sms/scheduled/:id` - Cancel scheduled message

**Webhooks (Twilio calls these):**
- `POST /api/sms/webhook/incoming` - Receive incoming messages
- `POST /api/sms/webhook/status` - Receive delivery status updates

## Database Schema

New table created:
```sql
sms_message_reads (
  tenant_id,
  patient_id,
  last_read_at,
  PRIMARY KEY (tenant_id, patient_id)
)
```

Existing tables used:
- `sms_messages` - All sent/received messages
- `sms_settings` - Twilio configuration per tenant
- `patient_sms_preferences` - Opt-in/opt-out status
- `sms_message_templates` - Reusable templates
- `sms_scheduled_messages` - Scheduled/recurring messages

## Common Issues

### Issue: "SMS not configured or not active"
**Solution:**
```sql
UPDATE sms_settings SET is_active = true WHERE tenant_id = 'default-tenant';
```

### Issue: "Patient has opted out of SMS"
**Solution:**
```sql
UPDATE patient_sms_preferences
SET opted_in = true, opted_out_at = NULL
WHERE patient_id = '<patient-id>' AND tenant_id = 'default-tenant';
```

### Issue: Not receiving incoming messages
**Checklist:**
- [ ] ngrok is running and URL is correct
- [ ] Twilio webhook URLs are configured with ngrok URL
- [ ] Webhook signature validation is working
- [ ] Backend server is running
- [ ] Check Twilio debugger: https://console.twilio.com/us1/monitor/logs/debugger

### Issue: Messages sending but not appearing in conversation
**Check:**
- The message is being saved to `sms_messages` table
- The `patient_id` matches the patient you're viewing
- Refresh the conversation or reload the page

## Production Deployment Checklist

Before deploying to production:

1. **Security:**
   - [ ] Replace `.env` credentials with environment variables
   - [ ] Enable HTTPS for webhook endpoints
   - [ ] Encrypt `twilio_auth_token` in database
   - [ ] Set up proper authentication and authorization

2. **Twilio Configuration:**
   - [ ] Update webhook URLs to production domain
   - [ ] Disable test mode: `UPDATE sms_settings SET is_test_mode = false`
   - [ ] Verify webhook signature validation is enabled

3. **Compliance:**
   - [ ] Ensure opt-in consent forms are in place
   - [ ] Test STOP keyword handling
   - [ ] Verify audit logging is working
   - [ ] Review message templates for HIPAA compliance

4. **Monitoring:**
   - [ ] Set up alerts for failed messages
   - [ ] Monitor Twilio usage and costs
   - [ ] Track delivery rates
   - [ ] Review webhook error logs

## Cost Estimate for Testing

**Twilio Trial Account:**
- $15 free credit
- Free phone number (or $1/month)
- Can send to verified numbers only
- Perfect for testing/demos

**Example Test Costs:**
- 100 test messages = $0.79
- You can test extensively within the $15 credit

## Next Steps

After successful testing:

1. **Train staff** on using the messaging interface
2. **Create custom templates** for your practice
3. **Configure opt-in** workflows (patient portal, kiosk)
4. **Set up appointment reminders** (automatic scheduling)
5. **Monitor usage** and adjust as needed

## Support Resources

- **Twilio Console:** https://console.twilio.com/
- **Twilio Debugger:** https://console.twilio.com/us1/monitor/logs/debugger
- **Twilio Docs:** https://www.twilio.com/docs/sms
- **ngrok:** https://ngrok.com/

---

**Ready to test?** Just follow the Quick Setup steps above and start messaging!
