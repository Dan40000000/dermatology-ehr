# SMS Texting Setup Guide
## How to Activate Appointment & Prescription Reminders

**Time Required:** 15 minutes
**Monthly Cost:** ~$8-15 depending on volume
**Status:** Built and ready, just needs Twilio credentials

---

## Step 1: Create Twilio Account (5 minutes)

1. **Go to:** https://www.twilio.com/try-twilio
2. **Sign up** with email
3. **Verify** phone number (they'll text you)
4. **Free trial:** Get $15 credit to test with

---

## Step 2: Get Phone Number (2 minutes)

1. **In Twilio dashboard:**
   - Click "Phone Numbers" → "Buy a Number"
   - Select your area code (e.g., 720 for Denver)
   - Look for number with **SMS** capability
   - **Cost:** $1/month

2. **Buy the number** (uses trial credit if testing)

3. **Copy the number:** e.g., `+17205551234`

---

## Step 3: Get API Credentials (1 minute)

1. **In Twilio dashboard:**
   - Go to "Account Info" section
   - Find **Account SID** (starts with AC...)
   - Find **Auth Token** (click to reveal)

2. **Copy both** - you'll need them next

**Example:**
```
Account SID: AC1234567890abcdef1234567890abcd
Auth Token: 1234567890abcdef1234567890abcd
```

---

## Step 4: Add to Your App (2 minutes)

1. **Open:** `/derm-app/backend/.env`

2. **Add these lines:**
```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcd
TWILIO_AUTH_TOKEN=1234567890abcdef1234567890abcd
TWILIO_PHONE_NUMBER=+17205551234
TWILIO_STATUS_CALLBACK_URL=http://localhost:4000/api/sms/status

# SMS Settings
SMS_REMINDER_ENABLED=true
SMS_REMINDER_HOURS_BEFORE=24
```

3. **Save file**

---

## Step 5: Restart Backend (1 minute)

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run dev
```

**Look for:** `Twilio service initialized` in logs

---

## Step 6: Test It! (5 minutes)

### **Test 1: Manual SMS**

1. **Login to app** as admin
2. **Go to Settings** → SMS Configuration
3. **Test Message:**
   - To: Your phone number
   - Message: "Test from dermatology app!"
   - Click "Send Test"

4. **You should receive text** within seconds

### **Test 2: Appointment Reminder**

1. **Create test appointment:**
   - Patient: Pick any demo patient
   - Date: Tomorrow
   - Time: 2:00 PM
   - Patient phone: YOUR phone number

2. **Trigger reminder manually:**
   - Go to Tasks → SMS Reminders
   - Click "Send Now" for tomorrow's appointments

3. **You should receive:**
```
Your appointment with Dr. Smith tomorrow at 2:00 PM.
Reply C to confirm or call 555-1234 to reschedule.
```

---

## Message Templates

### **Appointment Reminder (24 hours before)**
```
Hi [PatientName]! You have an appointment with [Provider]
tomorrow at [Time]. Reply C to confirm or call [ClinicPhone]
to cancel/reschedule.
```

### **Confirmation Response**
```
Thank you! Your appointment is confirmed for tomorrow at [Time].
See you then!
```

### **Prescription Refill**
```
Hi [PatientName]! Your prescription for [Medication] needs a
refill. Please call [ClinicPhone] to schedule a follow-up.
```

### **Lab Results Ready**
```
Hi [PatientName]! Your lab results from [Date] are ready.
Please call [ClinicPhone] to discuss with your provider.
```

---

## Automated Sending Schedule

**The system runs every hour** and checks:

1. **24 hours before appointment:**
   - Send initial reminder
   - Patient can reply "C" to confirm

2. **3 hours before appointment:**
   - If not confirmed, send 2nd reminder
   - "Reminder: Your appt today at 2pm"

3. **Patient replies:**
   - "C" or "CONFIRM" → Mark as confirmed
   - "CANCEL" → Offer to reschedule
   - "STOP" → Unsubscribe from SMS
   - "HELP" → Send clinic contact info

---

## Patient Opt-In/Opt-Out

**TCPA Compliance (Federal Law):**
- Patients MUST opt-in to receive texts
- Must be able to opt-out anytime

**How it works:**

1. **Opt-In Methods:**
   - Patient Portal: Checkbox "Send me SMS reminders"
   - Kiosk Check-In: "Receive text reminders? YES/NO"
   - Paper Form: "I consent to receive appointment reminders via SMS"

2. **Opt-Out:**
   - Patient texts "STOP" → Automatically unsubscribed
   - Or uncheck box in Patient Portal
   - Or ask front desk

3. **Database Tracking:**
   - `patients.sms_opt_in` = true/false
   - `patients.sms_opt_in_date` = when they agreed
   - Required for legal compliance

---

## Cost Breakdown

### **Twilio Pricing:**
- **Phone Number:** $1.00/month
- **Outgoing SMS:** $0.0075 per message
- **Incoming SMS:** $0.0075 per message

### **Example Costs:**

**Small Practice (100 patients, 50% opt-in):**
- 50 patients receiving reminders
- 100 appts/month = 100 outgoing texts
- 30 confirmation replies = 30 incoming texts
- **Total:** $1 + (130 × $0.0075) = **$1.98/month**

**Medium Practice (500 patients, 60% opt-in):**
- 300 patients receiving reminders
- 500 appts/month = 500 texts
- 300 replies = 300 texts
- **Total:** $1 + (800 × $0.0075) = **$7/month**

**Large Practice (2000 patients, 70% opt-in):**
- 1400 patients receiving reminders
- 2000 appts/month = 2000 texts
- 1200 replies = 1200 texts
- **Total:** $1 + (3200 × $0.0075) = **$25/month**

---

## What Happens If You Don't Set Up Twilio?

**The app still works perfectly!**

- ❌ No SMS reminders sent
- ✅ All other features work (scheduling, clinical notes, billing, etc.)
- ✅ Can use email reminders instead
- ✅ Can use phone call reminders
- ✅ Patients can still use portal

**When to set it up:**
- After first customer signs up
- When they specifically request SMS reminders
- When they want to reduce no-shows

---

## Production vs. Testing

### **Testing Mode (Trial Account):**
- $15 free credit
- Can only send to verified numbers
- Must verify each test phone number
- Perfect for demos

### **Production Mode (Paid Account):**
- Add payment method
- Send to any valid US phone number
- No verification needed
- Auto-billing monthly

**Recommendation:** Start with trial, upgrade when customer goes live

---

## Monitoring & Analytics

**Built-in Dashboard Shows:**
- Total SMS sent (today/week/month)
- Delivery rate (% successfully delivered)
- Confirmation rate (% patients who reply "C")
- Opt-out rate
- Cost tracking

**Access:** Settings → SMS Analytics

---

## Troubleshooting

### **"SMS not sending"**
✅ Check Twilio credentials in `.env`
✅ Verify phone number has SMS capability
✅ Check patient opted in (`sms_opt_in = true`)
✅ Verify patient has valid phone number
✅ Check Twilio account has credit

### **"Patient not receiving texts"**
✅ Verify number is valid US number
✅ Check if patient's carrier blocks short codes
✅ Ask patient to check spam/blocked numbers
✅ Try sending test from Twilio dashboard

### **"Delivery failed"**
✅ Invalid number format
✅ Landline (can't receive SMS)
✅ Carrier blocking
✅ Phone off/out of service

---

## Legal Requirements

**TCPA (Telephone Consumer Protection Act):**
- ✅ Must have written consent
- ✅ Must provide opt-out method
- ✅ Must honor opt-outs immediately
- ✅ Must identify sender
- ✅ No automated calls without consent

**HIPAA:**
- ✅ SMS is allowed for appointment reminders
- ✅ Don't include sensitive details (diagnosis, meds)
- ✅ Use generic messages only
- ✅ Offer alternative (email/phone) for more detail

**Best Practice Messages:**
✅ "Appt tomorrow 2pm - Reply C to confirm"
❌ "Your melanoma biopsy results are ready"

---

## Next Steps

After setup:

1. ✅ Test with your phone
2. ✅ Train staff on monitoring SMS inbox
3. ✅ Add opt-in to kiosk workflow
4. ✅ Update consent forms to include SMS
5. ✅ Monitor delivery rates first week
6. ✅ Adjust reminder timing if needed

---

**Questions? Issues?**
Twilio Support: https://support.twilio.com
Twilio Console: https://console.twilio.com

---

**Total Time to Go Live:** 15 minutes
**Total Setup Cost:** $0 (use trial)
**Monthly Cost:** ~$8-25 depending on volume
**ROI:** Reduce no-shows by 20-30% = Huge revenue increase
