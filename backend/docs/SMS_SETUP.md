# SMS/Text Messaging Setup Guide

This guide walks you through setting up SMS/text messaging functionality in the dermatology EHR using Twilio.

## Table of Contents

1. [Overview](#overview)
2. [Create Twilio Account](#create-twilio-account)
3. [Get Phone Number](#get-phone-number)
4. [Configure Webhooks](#configure-webhooks)
5. [Update Application Settings](#update-application-settings)
6. [Test in Development](#test-in-development)
7. [Go Live](#go-live)
8. [Cost Estimates](#cost-estimates)
9. [Compliance Requirements](#compliance-requirements)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The SMS messaging feature enables:

- **Automated appointment reminders** sent 24 hours before appointments
- **Two-way messaging** with patients via text
- **Keyword-based auto-responses** (C=confirm, R=reschedule, X=cancel, STOP=opt-out)
- **SMS conversation threading** integrated with patient message threads
- **Opt-in/opt-out management** (TCPA compliance)
- **Delivery tracking and audit logs**

**Tech Stack:**
- Provider: Twilio
- Cost: ~$0.0079 per SMS segment (US)
- Database: PostgreSQL tables for message logs and settings
- Backend: Node.js/TypeScript with Twilio SDK
- Frontend: React/TypeScript (admin settings UI)

---

## Create Twilio Account

### Step 1: Sign Up

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Click "Sign up and start building"
3. Fill out the registration form
4. Verify your email address
5. Verify your phone number (required)

### Step 2: Get Trial Credits

- New accounts receive **$15 in free trial credits**
- Trial mode limitations:
  - Can only send SMS to verified phone numbers
  - Messages include "Sent from a Twilio trial account" prefix
  - Limited to ~1,900 SMS messages ($15 / $0.0079)

### Step 3: Get Account Credentials

1. Log into Twilio Console: [https://console.twilio.com/](https://console.twilio.com/)
2. From the Dashboard, copy:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click "Show" to reveal)
3. Save these credentials - you'll need them later

---

## Get Phone Number

### For Development/Testing (Trial)

1. In Twilio Console, go to **Phone Numbers** → **Manage** → **Buy a number**
2. Select country: **United States**
3. Check capabilities:
   - ✅ Voice
   - ✅ SMS
   - ✅ MMS (optional, for image support)
4. Search for available numbers
5. Click **Buy** (uses trial credits - free during trial)
6. Copy the phone number (format: +1XXXXXXXXXX)

### For Production

1. **Upgrade account** (see "Go Live" section)
2. Purchase a phone number ($1.15/month for US local number)
3. Choose a local number in your area code for better patient recognition
4. Configure SMS capabilities

**Recommended:** Get a local number (not toll-free) to avoid carrier filtering.

---

## Configure Webhooks

Webhooks allow Twilio to notify your application about incoming SMS and delivery status updates.

### Step 1: Determine Webhook URLs

**For Development (ngrok):**
```
Incoming SMS: https://your-ngrok-url.ngrok.io/api/sms/webhook/incoming
Status Updates: https://your-ngrok-url.ngrok.io/api/sms/webhook/status
```

**For Production:**
```
Incoming SMS: https://yourdomain.com/api/sms/webhook/incoming
Status Updates: https://yourdomain.com/api/sms/webhook/status
```

### Step 2: Configure Phone Number Webhooks

1. In Twilio Console, go to **Phone Numbers** → **Manage** → **Active numbers**
2. Click on your purchased phone number
3. Scroll to **Messaging Configuration**
4. Under "A MESSAGE COMES IN":
   - Webhook: `https://yourdomain.com/api/sms/webhook/incoming`
   - HTTP Method: `POST`
5. Under "PRIMARY HANDLER FAILS":
   - Webhook: (leave blank or add fallback URL)
6. Click **Save**

### Step 3: Configure Status Callbacks (Optional but Recommended)

1. In Twilio Console, go to **Messaging** → **Settings** → **General Settings**
2. Under "Status Callback URL":
   - Webhook: `https://yourdomain.com/api/sms/webhook/status`
   - HTTP Method: `POST`
3. Check:
   - ✅ Queued
   - ✅ Sent
   - ✅ Delivered
   - ✅ Failed
4. Click **Save**

---

## Update Application Settings

### Step 1: Update Environment Variables

Edit `/backend/.env`:

```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

**Security Note:** Never commit these credentials to version control!

### Step 2: Run Database Migration

```bash
cd backend
npm run db:migrate
```

This creates the SMS tables:
- `sms_settings` - Twilio configuration per tenant
- `sms_messages` - Message audit log
- `patient_sms_preferences` - Opt-in/opt-out tracking
- `sms_auto_responses` - Keyword responses (C, R, X, STOP, etc.)
- `appointment_sms_reminders` - Reminder scheduling

### Step 3: Configure SMS Settings via Admin UI

1. Log into the EHR as an admin
2. Go to **Settings** → **SMS/Text Messaging**
3. Enter Twilio credentials:
   - Account SID
   - Auth Token
   - Phone Number (+15551234567 format)
4. Click **Test Connection** to verify
5. Configure reminder settings:
   - Enable appointment reminders: ✅
   - Hours before appointment: 24
   - Allow patient replies: ✅
6. Customize message templates (optional)
7. Click **Save**
8. Toggle "Active" to enable SMS

---

## Test in Development

### Option 1: Test with ngrok (Recommended)

ngrok creates a secure tunnel to your localhost for webhook testing.

1. **Install ngrok:**
   ```bash
   brew install ngrok  # macOS
   # or download from https://ngrok.com/download
   ```

2. **Start backend server:**
   ```bash
   cd backend
   npm run dev  # Runs on port 4000
   ```

3. **Start ngrok tunnel:**
   ```bash
   ngrok http 4000
   ```

4. **Copy ngrok URL:**
   ```
   Forwarding: https://abc123.ngrok.io -> http://localhost:4000
   ```

5. **Update Twilio webhooks** with ngrok URL:
   ```
   https://abc123.ngrok.io/api/sms/webhook/incoming
   https://abc123.ngrok.io/api/sms/webhook/status
   ```

6. **Send test SMS:**
   - Add a test patient with YOUR verified phone number
   - Manually send SMS from admin UI
   - Reply with "C", "R", "X", or "STOP"
   - Check ngrok console to see webhook requests

### Option 2: Test without webhooks

For basic send-only testing (no incoming messages):

1. Skip webhook configuration
2. Test sending SMS from admin UI
3. Verify messages are received
4. Check SMS logs in admin UI

### Testing Checklist

- [ ] Send SMS to patient
- [ ] Receive SMS from patient
- [ ] Test keyword responses (C, R, X)
- [ ] Test STOP opt-out
- [ ] Test START opt-in
- [ ] Send appointment reminder
- [ ] Verify delivery status updates
- [ ] Check SMS audit logs
- [ ] Test with opted-out patient (should fail)

---

## Go Live

### Step 1: Upgrade Twilio Account

**Trial limitations prevent production use.** You must upgrade to send SMS to all patients.

1. Go to Twilio Console → **Billing**
2. Click **Upgrade Account**
3. Add payment method (credit card)
4. Set up auto-recharge (recommended: $20 minimum)
5. Enable SMS sending to unverified numbers

**Cost:** No monthly fee, pay-as-you-go for usage.

### Step 2: Enable A2P 10DLC (Required for US)

As of 2024, US carriers require registration for Application-to-Person (A2P) messaging.

1. In Twilio Console, go to **Messaging** → **Regulatory Compliance** → **A2P 10DLC**
2. Click **Register a Brand**
3. Fill out business information:
   - Business name
   - EIN/Tax ID
   - Business address
   - Website
   - Contact information
4. Submit for approval (takes 1-2 business days)
5. Once approved, register a campaign:
   - Use case: "Healthcare appointment reminders"
   - Sample messages: Paste your reminder template
   - Opt-in workflow: Describe patient consent process
6. Wait for approval (takes 1-2 weeks)

**Cost:**
- Brand registration: $4 one-time fee
- Campaign registration: ~$15/month per campaign
- Without registration, messages may be blocked by carriers

### Step 3: Configure Production Webhooks

1. Update Twilio phone number webhooks with production URLs:
   ```
   https://yourdomain.com/api/sms/webhook/incoming
   https://yourdomain.com/api/sms/webhook/status
   ```

2. Verify HTTPS is enabled (required by Twilio)

3. Test webhooks using Twilio's webhook debugger:
   - Console → **Messaging** → **Debugger**

### Step 4: Verify Compliance

**TCPA Compliance (Required by Law):**
- [ ] Obtain patient consent before sending SMS
- [ ] Implement STOP keyword (auto opt-out)
- [ ] Implement START keyword (opt-in)
- [ ] Implement HELP keyword
- [ ] Honor opt-outs immediately (within seconds)
- [ ] Keep opt-out records for compliance
- [ ] Include opt-out instructions in first message
- [ ] Don't send marketing messages without explicit consent

**HIPAA Compliance:**
- [ ] Use Twilio's Business Associate Agreement (BAA)
- [ ] Don't send PHI via SMS (only appointment details)
- [ ] Encrypt credentials in database
- [ ] Log all SMS for audit trail
- [ ] Implement access controls

**Get Twilio BAA:**
1. Contact Twilio sales: [https://www.twilio.com/legal/baa](https://www.twilio.com/legal/baa)
2. Sign Business Associate Agreement
3. Enable HIPAA compliance features

### Step 5: Enable Features

1. In EHR admin settings, enable SMS:
   - Toggle "Active" to ON
   - Disable "Test Mode"
2. Enable appointment reminders
3. Configure reminder schedule (24 hours default)
4. Train staff on SMS features

---

## Cost Estimates

### Twilio Pricing (US - as of 2024)

**Per-Message Costs:**
- Outbound SMS: $0.0079 per segment
- Inbound SMS: $0.0079 per segment
- MMS (images): $0.02 per message

**Segment Calculation:**
- Standard SMS: 160 characters = 1 segment
- 161-320 characters = 2 segments
- Unicode/emoji: 70 characters = 1 segment
- Typical reminder: 1-2 segments (~$0.008 - $0.016)

**Monthly Costs:**
- Phone number: $1.15/month (local US number)
- A2P 10DLC campaign: ~$15/month (required for production)

**Volume Pricing Examples:**

| Patients | Reminders/Month | Monthly Cost |
|----------|-----------------|--------------|
| 100 | 200 | $16.58 |
| 500 | 1,000 | $22.90 |
| 1,000 | 2,000 | $31.80 |
| 5,000 | 10,000 | $94.00 |

**Formula:** (Messages × $0.0079) + $1.15 + $15

**Cost Savings:**
- Reduces no-show rate by 20-30%
- Reduces phone call time for staff
- Improves patient satisfaction
- ROI typically positive after 100 patients

---

## Compliance Requirements

### TCPA (Telephone Consumer Protection Act)

**Required by US law for all SMS communications:**

1. **Prior Express Consent:**
   - Obtain written or electronic consent before sending ANY messages
   - Consent must be clear and unambiguous
   - Cannot be a condition of service
   - Store consent date and method

2. **Mandatory Keywords:**
   - **STOP** - Immediate opt-out (legally required)
   - **START** - Opt back in
   - **HELP** - Information about SMS program
   - Must respond within seconds

3. **Message Content Requirements:**
   - First message MUST include opt-out instructions
   - Example: "Reply STOP to unsubscribe"
   - Include sender identification
   - Provide customer service contact

4. **Time Restrictions:**
   - Don't send before 8 AM or after 9 PM (recipient's time zone)
   - Respect quiet hours
   - Don't send on holidays (optional but recommended)

5. **Record Keeping:**
   - Keep consent records for 4 years
   - Log all opt-outs
   - Maintain audit trail of all messages

**Penalties:** Up to $500-$1,500 per violation. Non-compliance can result in class-action lawsuits.

### HIPAA (Health Insurance Portability and Accountability Act)

**Required for healthcare communications:**

1. **Business Associate Agreement (BAA):**
   - Sign BAA with Twilio
   - Enable HIPAA-compliant features
   - Encrypt all data at rest and in transit

2. **PHI Restrictions:**
   - ❌ Don't send diagnosis via SMS
   - ❌ Don't send treatment details
   - ❌ Don't send test results
   - ❌ Don't send medical records
   - ✅ OK: Appointment date/time
   - ✅ OK: Provider name
   - ✅ OK: Location
   - ✅ OK: General reminders

3. **Security Requirements:**
   - Encrypt Twilio credentials
   - Secure webhook endpoints (HTTPS only)
   - Validate webhook signatures
   - Implement access controls
   - Audit logging

4. **Patient Rights:**
   - Right to opt-out
   - Right to request communication restrictions
   - Right to access message history

---

## Troubleshooting

### Messages Not Sending

**Check:**
1. Twilio credentials are correct (Account SID, Auth Token)
2. Phone number is in E.164 format (+15551234567)
3. Patient is not opted out
4. SMS is enabled in settings
5. Sufficient Twilio balance
6. Phone number has SMS capability

**View Logs:**
```sql
-- Recent failed messages
SELECT * FROM sms_messages
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- Error details
SELECT error_code, error_message, COUNT(*)
FROM sms_messages
WHERE status = 'failed'
GROUP BY error_code, error_message;
```

**Common Twilio Error Codes:**
- `21211` - Invalid "To" phone number
- `21408` - Permission to send SMS has not been enabled
- `21610` - Recipient opted out (STOP)
- `30003` - Unreachable destination
- `30007` - Message blocked by carrier (spam filter)

### Webhooks Not Working

**Check:**
1. Webhook URL is publicly accessible (use ngrok for local testing)
2. Webhook URL is HTTPS (required by Twilio)
3. Webhook signature validation is working
4. Phone number webhook is configured correctly

**Test Webhook:**
```bash
# Check if endpoint is accessible
curl -X POST https://yourdomain.com/api/sms/webhook/incoming

# View Twilio webhook debugger
# Console → Messaging → Debugger
```

**View Webhook Logs:**
```bash
# Backend logs
tail -f logs/app.log | grep webhook
```

### Patient Not Receiving Messages

**Check:**
1. Patient phone number is correct and formatted properly
2. Patient is not opted out
3. Message was sent successfully (check SMS logs)
4. Patient's carrier is not blocking messages
5. Patient's phone supports SMS

**Verify Delivery:**
```sql
-- Check message status
SELECT
  to_number,
  message_body,
  status,
  delivered_at,
  error_message
FROM sms_messages
WHERE patient_id = 'patient-uuid'
ORDER BY created_at DESC;
```

### Auto-Responses Not Working

**Check:**
1. Keywords are in uppercase in database
2. Keyword matches exactly (no extra spaces)
3. Auto-response is active
4. Patient is identified correctly

**View Auto-Responses:**
```sql
SELECT * FROM sms_auto_responses
WHERE tenant_id = 'your-tenant-id'
ORDER BY priority DESC;
```

### High Costs

**Reduce Costs:**
1. Shorten reminder templates (reduce segments)
2. Remove unnecessary emojis (triggers unicode = more segments)
3. Consolidate multiple reminders
4. Implement smarter scheduling (don't remind for cancelled appointments)
5. Use email for non-urgent communications

**Monitor Usage:**
```sql
-- Messages per day
SELECT
  DATE(created_at) as date,
  COUNT(*) as count,
  SUM(segment_count) as segments
FROM sms_messages
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Estimated cost per month
SELECT
  SUM(segment_count) * 0.0079 as estimated_cost
FROM sms_messages
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
```

---

## Support Resources

**Twilio Support:**
- Documentation: [https://www.twilio.com/docs/sms](https://www.twilio.com/docs/sms)
- Support: [https://support.twilio.com](https://support.twilio.com)
- Phone: 1-888-TWILIO-1
- Community: [https://www.twilio.com/community](https://www.twilio.com/community)

**Compliance Resources:**
- TCPA Compliance: [https://www.twilio.com/learn/voice-and-video/tcpa-compliance](https://www.twilio.com/learn/voice-and-video/tcpa-compliance)
- HIPAA Compliance: [https://www.twilio.com/legal/baa](https://www.twilio.com/legal/baa)
- A2P 10DLC: [https://www.twilio.com/docs/messaging/compliance/a2p-10dlc](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)

**Application Support:**
- Check backend logs: `/backend/logs/app.log`
- Database queries: See examples above
- Contact development team for application issues

---

## Quick Start Checklist

**Development Setup:**
- [ ] Create Twilio trial account
- [ ] Get free trial phone number
- [ ] Add Twilio credentials to .env
- [ ] Run database migration
- [ ] Start backend with ngrok
- [ ] Configure webhooks with ngrok URL
- [ ] Test sending SMS
- [ ] Test receiving SMS
- [ ] Test keywords (C, R, X, STOP)

**Production Setup:**
- [ ] Upgrade Twilio account
- [ ] Register for A2P 10DLC
- [ ] Sign Twilio BAA (HIPAA)
- [ ] Configure production webhooks
- [ ] Update message templates
- [ ] Train staff
- [ ] Obtain patient consent
- [ ] Monitor costs and delivery rates

---

## Next Steps

After SMS is set up, consider:

1. **Frontend Integration** - Build admin UI for SMS settings
2. **Bulk Messaging** - Send announcements to patient cohorts
3. **SMS Campaigns** - Marketing and recall campaigns
4. **Analytics** - Track open rates, response rates, ROI
5. **Advanced Features** - MMS images, appointment confirmations, two-factor auth

---

**Last Updated:** December 2024
**Version:** 1.0
