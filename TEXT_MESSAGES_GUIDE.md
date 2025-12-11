# Text Messages Feature - How It Works

## Overview

The **Text Messages** page allows nurses and coordinators to send and receive SMS text messages with patients directly from their computer or phone - all through the internet using Twilio.

---

## How It Works (Internet-Based Texting)

### **No Phone Required!**

You don't need a physical phone to text patients. Everything works through your web browser:

1. **Staff opens the app** on their computer/tablet
2. **Clicks "Text Messages"** in the navigation
3. **Sees all patient conversations** like WhatsApp or iMessage
4. **Types and sends messages** via internet
5. **Messages delivered via Twilio** to patient's real phone number

### **Behind the Scenes:**

```
[Staff Computer/Browser]
      ↓ (internet)
[Your Backend Server]
      ↓ (internet/Twilio API)
[Twilio Service]
      ↓ (cellular network)
[Patient's Phone] 📱
```

---

## Key Features

### **1. Conversation View**
- Left sidebar shows all patients with phone numbers
- Most recent conversations at the top
- Unread message badges
- Search patients by name or phone

### **2. Real-Time Messaging**
- Messages update every 5 seconds when conversation open
- Every 10 seconds for patient list
- See delivery status (sent ✓, delivered ✓✓, failed ✗)
- Time stamps on all messages

### **3. Smart Interface**
- **Outbound messages:** Blue bubbles (from staff)
- **Inbound messages:** White bubbles (from patient)
- Message history preserved
- Press Enter to send
- Shift+Enter for new line

### **4. Patient Selection**
- Only shows patients with valid phone numbers
- Click any patient to start/continue conversation
- See last message and time at a glance

---

## Access

### **Who Can Use It:**
- Providers
- Medical Assistants
- Front Desk Coordinators
- Administrators

(Anyone with system access and proper role)

### **Where to Find It:**
- Top navigation bar
- Between "Labs" and "Tasks"
- URL: `/text-messages`

---

## Requirements to Use

### **1. Twilio Account (One-Time Setup)**
- Create account at https://www.twilio.com
- Buy a phone number (~$1/month)
- Add credentials to backend `.env` file
- Takes ~15 minutes
- See `SMS_SETUP_GUIDE.md` for details

### **2. Patient Must Have:**
- Valid phone number in system
- Opted in to receive SMS (HIPAA/TCPA compliance)

### **3. Internet Connection**
- Any device with web browser
- Desktop, laptop, tablet, or phone
- No special software needed

---

## How Messages Are Sent

### **Step-by-Step:**

1. **Staff types message** in web interface
2. **Frontend sends to backend** via API call
3. **Backend validates:**
   - User is authenticated
   - Patient opted in to SMS
   - Twilio configured correctly
4. **Backend calls Twilio API** over internet
5. **Twilio sends SMS** to patient's cellular number
6. **Patient receives text** on their phone
7. **Delivery status sent back** to your system

### **When Patient Replies:**

1. **Patient texts back** to your Twilio number
2. **Twilio receives SMS** via cellular network
3. **Twilio sends webhook** to your backend over internet
4. **Backend stores message** in database
5. **Frontend polls every 5 seconds** and displays new message
6. **Staff sees reply** in conversation

---

## Costs

### **What You Pay:**
- **Twilio Phone Number:** $1.00/month
- **Outgoing SMS:** $0.0075 per message (less than 1 cent)
- **Incoming SMS:** $0.0075 per message

### **Example Monthly Costs:**

**Small Practice (50 patients texting):**
- 100 outgoing messages
- 30 replies
- **Total:** ~$2/month

**Medium Practice (300 patients):**
- 500 outgoing messages
- 300 replies
- **Total:** ~$7/month

**Large Practice (1000+ patients):**
- 2000 outgoing messages
- 1200 replies
- **Total:** ~$25/month

**Way cheaper than staff making phone calls!**

---

## Use Cases

### **Appointment Reminders:**
```
"Hi Sarah! Reminder: You have an appointment
tomorrow at 2:00 PM with Dr. Smith. Reply C
to confirm or call us to reschedule."
```

### **Prescription Ready:**
```
"Hi John, your prescription for Tretinoin is
ready for pickup at the pharmacy. Let us know
if you have questions!"
```

### **Lab Results:**
```
"Hi Maria, your lab results are ready. Please
call our office at 555-1234 to schedule a
follow-up appointment to discuss."
```

### **Quick Questions:**
```
Patient: "Can I take ibuprofen with my current meds?"
Staff: "Let me check with Dr. Smith and get back
to you within the hour."
```

---

## Security & Compliance

### **HIPAA Compliance:**
- ✅ All messages encrypted in transit (HTTPS)
- ✅ Messages stored securely in database
- ✅ Audit log tracks all SMS activity
- ✅ No sensitive medical details in messages (follow best practices)
- ✅ Twilio is HIPAA-compliant (BAA required)

### **TCPA Compliance:**
- ✅ Patient must opt-in to receive texts
- ✅ System tracks opt-in date and method
- ✅ Patients can opt-out anytime (reply STOP)
- ✅ Staff can't text patients who opted out

### **Best Practices:**
- ❌ Don't send: "Your melanoma biopsy results are positive"
- ✅ Do send: "Your lab results are ready, please call to discuss"
- ❌ Don't send: "You tested positive for gonorrhea"
- ✅ Do send: "Please call regarding your recent test results"

**General rule:** Use SMS for scheduling/logistics, NOT for diagnoses or sensitive info.

---

## Troubleshooting

### **"Patient not receiving texts"**
1. Check patient has valid US phone number
2. Verify patient opted in (check patient preferences)
3. Check Twilio account has credit
4. Test by texting your own phone first

### **"Cannot send message"**
1. Check SMS settings configured (`/api/sms/settings`)
2. Verify Twilio credentials in `.env` file
3. Make sure Twilio phone number has SMS capability
4. Check patient didn't opt out

### **"Not seeing new messages"**
1. Page auto-refreshes every 5 seconds
2. Click "Refresh" button manually
3. Check browser console for errors
4. Verify backend is running

---

## Technical Details (For Developers)

### **Frontend:**
- **File:** `/frontend/src/pages/TextMessagesPage.tsx`
- **Route:** `/text-messages`
- **Polling:** 5 seconds for conversation, 10 seconds for patient list
- **UI:** Conversation-style interface (inspired by iMessage)

### **Backend:**
- **Routes:** `/backend/src/routes/sms.ts`
- **Service:** `/backend/src/services/twilioService.ts`
- **Webhooks:** `/api/sms/webhook/incoming` (Twilio calls this)
- **Status Callbacks:** `/api/sms/webhook/status` (delivery updates)

### **Database Tables:**
- `sms_messages` - All SMS history
- `sms_settings` - Twilio configuration per tenant
- `patient_sms_preferences` - Opt-in/opt-out status
- `sms_auto_responses` - Auto-reply keywords (STOP, START, HELP)

### **API Endpoints:**

**GET /api/sms/messages/patient/:patientId**
- Returns all SMS for a patient
- Used to load conversation history

**POST /api/sms/send**
- Send SMS to patient
- Requires: `patientId`, `messageBody`
- Returns: `messageId`, `twilioSid`, `status`

**POST /api/sms/webhook/incoming**
- Receives incoming SMS from Twilio
- Validates webhook signature
- Stores message in database

---

## Comparison to Other Features

| Feature | What It Does | Internet-Based? |
|---------|-------------|-----------------|
| **Text Messages** | SMS to patient phones via Twilio | ✅ YES |
| **Mail** | Internal staff messaging (like email) | ✅ YES |
| **Patient Portal Messages** | Secure messaging via patient portal | ✅ YES |
| **Reminders** | Automated appointment/recall reminders | ✅ YES (uses Text Messages feature) |

**Text Messages = The only way to reach patients via SMS to their actual phone**

---

## FAQs

**Q: Do patients need to install an app?**
A: No! They receive regular SMS texts on their existing phone.

**Q: Can patients initiate conversations?**
A: Yes! They just text your Twilio number and it shows up in the interface.

**Q: Does this work from my phone?**
A: Yes! Open the web app in your phone's browser. Fully responsive.

**Q: What about group messages?**
A: Not yet. Each conversation is one-on-one (staff ↔ one patient).

**Q: Can multiple staff members text the same patient?**
A: Yes! All staff see the same conversation history.

**Q: What happens if Twilio is down?**
A: Messages won't send until Twilio is back up. Use phone calls as backup.

**Q: Can I text international numbers?**
A: Yes, but costs more (~$0.05-0.20 per message depending on country).

---

## Summary

**Text Messages page = Web-based SMS interface**

- Staff use **web browser** to send texts
- Patients receive on **real phones** via cellular network
- Powered by **Twilio** (internet → SMS gateway)
- No special equipment needed
- Works from **any device** with internet
- Messages stored in **your database**
- Fully **HIPAA & TCPA compliant**

**It's like having a professional SMS messaging system built into your EHR!**

---

*For Twilio setup instructions, see `SMS_SETUP_GUIDE.md`*
*For feature overview, see `FEATURE_GUIDE_FOR_NON_DOCTORS.md`*
