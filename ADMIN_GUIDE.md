# Administrator Guide - Dermatology EHR System

**Version 1.0**
**Last Updated:** December 29, 2025

---

## Table of Contents

1. [User Management](#user-management)
2. [Practice Settings](#practice-settings)
3. [System Configuration](#system-configuration)
4. [Security & Compliance](#security--compliance)
5. [Backup & Maintenance](#backup--maintenance)
6. [Troubleshooting](#troubleshooting)

---

## User Management

### Adding Staff Members

**Creating a New User:**

1. **Navigate to User Management**
   - Click **Settings** (gear icon in sidebar)
   - Select **Users**
   - Click **+ Add User**

2. **Enter User Information**

   **Required Fields:**
   - **First Name**
   - **Last Name**
   - **Email Address** (used for login)
   - **Role** (see roles below)
   - **Provider Type** (if clinical staff)
   - **Phone Number**

   **Optional Fields:**
   - **Middle Name**
   - **Professional Title** (MD, DO, NP, PA, RN, MA)
   - **NPI Number** (for providers)
   - **DEA Number** (for prescribers)
   - **License Number**
   - **Specialty**

3. **Set Initial Password**
   - Generate secure temporary password
   - Or use "Send Welcome Email" to auto-generate
   - User will be prompted to change on first login

4. **Assign Access Level**
   - Select role from dropdown (see Roles section below)
   - Configure location access (if multi-location practice)
   - Set provider schedule access

5. **Save User**
   - Click **Save**
   - Welcome email sent automatically (if enabled)
   - User can now log in

### Roles and Permissions

**Available Roles:**

#### 1. Admin
**Full system access**

**Can do:**
- Manage all users
- Configure system settings
- View all patient records
- Access financial reports
- Manage templates and forms
- Configure integrations
- View audit logs

**Cannot do:**
- Sign clinical notes (unless also a provider)
- Prescribe medications (unless licensed provider)

**Typical user:** Practice Manager, IT Administrator

---

#### 2. Physician / Provider
**Clinical documentation and prescribing**

**Can do:**
- Create and sign clinical notes
- Prescribe medications (e-prescribe)
- Order labs and imaging
- View assigned patients
- Access patient portal messages
- Generate clinical reports
- Document procedures
- Review and sign lab results

**Cannot do:**
- Modify system settings
- Add/remove users
- Access other providers' financial data
- Delete audit logs

**Typical user:** Dermatologist, Physician Assistant, Nurse Practitioner

---

#### 3. Nurse / Medical Assistant
**Clinical support and patient care**

**Can do:**
- Record vitals
- Update patient allergies and medications
- Create preliminary notes
- Take clinical photos
- Room patients (Office Flow)
- Send patient messages
- Follow up on lab results
- Schedule appointments
- Complete assigned tasks

**Cannot do:**
- Sign clinical notes
- Prescribe medications
- Modify diagnoses
- Submit claims
- Access financial reports

**Typical user:** RN, LPN, Medical Assistant, Clinical Coordinator

---

#### 4. Front Desk
**Administrative and scheduling**

**Can do:**
- Schedule/modify/cancel appointments
- Check in patients
- Collect copays
- Verify insurance eligibility
- Scan documents
- Update patient demographics
- Send appointment reminders
- Manage waitlist

**Cannot do:**
- View clinical notes
- Access lab results
- Order prescriptions
- View financial reports
- Access billing details

**Typical user:** Receptionist, Patient Services Representative

---

#### 5. Billing Staff
**Financial and claims management**

**Can do:**
- Submit and manage claims
- Post payments
- Generate superbills
- Run financial reports
- Reconcile ERA/EFT
- Manage denials
- Update fee schedules
- Patient statement generation

**Cannot do:**
- Create clinical notes
- Prescribe medications
- Modify patient medical records
- Access other users' information

**Typical user:** Billing Specialist, Revenue Cycle Manager

---

### Deactivating Users

**When to Deactivate:**
- Employee termination
- Extended leave
- Role change requiring new permissions
- Security concern

**How to Deactivate:**

1. **Navigate to User Management**
   - Settings → Users

2. **Find User**
   - Search by name or email
   - Click on user

3. **Deactivate Account**
   - Click **Edit**
   - Toggle **Status** to "Inactive"
   - Optional: Add **Deactivation Reason** note
   - Click **Save**

4. **Immediate Effects:**
   - User cannot log in
   - Active sessions terminated
   - Email notifications stop
   - User removed from assignment dropdowns
   - Audit trail preserved

**Reactivating Users:**
- Same process, toggle Status to "Active"
- User can log in immediately
- Previous permissions restored

---

### Managing User Permissions

**Custom Permission Sets:**

For users needing non-standard access:

1. **Navigate to User**
   - Settings → Users → Select User

2. **Click "Custom Permissions"**
   - Available only for Admin users
   - Overrides role defaults

3. **Configure Granular Permissions:**

   **Patient Access:**
   - View patients (all/assigned only/none)
   - Edit demographics
   - View clinical notes
   - View financial information

   **Clinical:**
   - Create notes
   - Sign notes
   - E-prescribe
   - Order labs

   **Scheduling:**
   - View schedule
   - Create appointments
   - Modify appointments
   - Cancel appointments

   **Financial:**
   - View charges
   - Submit claims
   - Post payments
   - View reports

   **Administrative:**
   - Manage users
   - Configure settings
   - Access audit logs

4. **Save Permission Set**
   - Click **Save Custom Permissions**
   - Changes take effect immediately

---

## Practice Settings

### Practice Information

**Configuring Practice Details:**

1. **Navigate to Practice Settings**
   - Settings → Practice Information

2. **Enter Practice Details:**

   **General Information:**
   - **Practice Name** (appears on all documents)
   - **Legal Business Name**
   - **Tax ID (EIN)**
   - **NPI (National Provider Identifier)**
   - **Physical Address**
   - **Mailing Address** (if different)
   - **Phone Number**
   - **Fax Number**
   - **Email Address**
   - **Website URL**

   **Business Hours:**
   - Monday - Friday: Set open/close times
   - Saturday/Sunday: Check if open
   - Holidays: Mark closed days
   - Lunch hours: Block time

   **Logo and Branding:**
   - Upload practice logo (PNG or JPG, max 2MB)
   - Appears on:
     - Patient portal
     - Printed forms
     - Superbills
     - Statements
   - Recommended size: 400x100 pixels

3. **Save Settings**
   - Click **Save**
   - Changes apply immediately

---

### Insurance Plans

**Adding Insurance Payers:**

1. **Navigate to Insurance Setup**
   - Settings → Insurance Plans

2. **Add New Plan**
   - Click **+ Add Insurance Plan**

3. **Enter Plan Details:**

   **Plan Information:**
   - **Payer Name** (e.g., "Blue Cross Blue Shield")
   - **Plan Name** (e.g., "BCBS PPO")
   - **Payer ID** (for electronic claims)
   - **Phone Number** (member services)
   - **Claims Address**
   - **Claims Submission Method:**
     - Electronic (via clearinghouse)
     - Paper (mail)
     - Portal (payer website)

   **Financial Information:**
   - **Fee Schedule** (link to fee schedule)
   - **Typical Copay Amount**
   - **Accepts Assignment** (yes/no)
   - **Timely Filing Limit** (days)

   **Electronic Submission:**
   - **Electronic Payer ID**
   - **Clearinghouse ID**
   - **Test Mode** (for initial setup)

4. **Save Insurance Plan**
   - Available in patient demographics dropdown
   - Used for eligibility verification
   - Linked to claims submission

---

### Templates

**Managing Note Templates:**

1. **Navigate to Templates**
   - Settings → Note Templates

2. **Create New Template**
   - Click **+ New Template**

3. **Template Configuration:**

   **Basic Information:**
   - **Template Name** (e.g., "Acne Follow-up Visit")
   - **Appointment Type** (links to appointment types)
   - **Specialty** (Dermatology, Cosmetic, etc.)
   - **Active** (toggle on/off)

   **Template Sections:**

   **Chief Complaint:**
   - Pre-filled text
   - Placeholders: {patientName}, {age}, {gender}
   - Example: "{patientName} returns for acne follow-up"

   **HPI Template:**
   - Structured questions
   - Drop-down options
   - Free text areas
   - Example: "Duration of current acne: [dropdown: 1 month, 3 months, 6 months, >1 year]"

   **ROS (Review of Systems):**
   - Checkboxes for each system
   - Default selections
   - Example: Skin section pre-checked for dermatology

   **Physical Exam:**
   - Body areas to examine
   - Normal/abnormal findings
   - Example: "Skin: Moderate inflammatory acne on face and upper back. No cysts or nodules."

   **Assessment & Plan:**
   - Common diagnoses for this template
   - Typical treatment plans
   - Follow-up recommendations
   - Example: "Continue tretinoin 0.05% cream nightly. Add doxycycline 100mg BID. Return in 6 weeks."

4. **Save Template**
   - Available to all providers
   - Appears in template dropdown during encounters

**Managing Templates:**
- **Edit:** Modify existing template
- **Duplicate:** Create similar template
- **Deactivate:** Hide from dropdown (preserve historical data)
- **Delete:** Remove completely (only if never used)

---

### Message Templates

**Creating Canned Responses:**

For Text Messages and Portal Messages:

1. **Navigate to Message Templates**
   - Settings → Message Templates

2. **Create Template**
   - Click **+ New Template**

3. **Template Details:**

   **Information:**
   - **Template Name**
   - **Category:**
     - Appointment Reminder
     - Follow-up
     - Instructions
     - Education
     - General
   - **Message Type:**
     - SMS (160 characters recommended)
     - Portal Message (longer format ok)
     - Email

   **Message Body:**
   - Type template text
   - Use variables:
     - {firstName}
     - {lastName}
     - {patientName} (full name)
     - {providerName}
     - {clinicPhone}
     - {appointmentDate}
     - {appointmentTime}

   **Example Templates:**

   **Appointment Reminder:**
   ```
   Hi {firstName}, reminder of your appointment tomorrow at {appointmentTime} with Dr. {providerName}. Reply C to confirm or call {clinicPhone} to reschedule.
   ```

   **Lab Results Ready:**
   ```
   Your lab results are ready for review. Please call {clinicPhone} to discuss with {providerName}.
   ```

   **Medication Instructions:**
   ```
   Apply medication twice daily to affected areas. Avoid sun exposure. Call {clinicPhone} with questions.
   ```

4. **Save Template**
   - Available in Messages and Text Messages modules
   - Variables auto-replace when sent

---

## System Configuration

### Integrations

**Configuring External Services:**

#### Clearinghouse Integration

**For claims submission and ERA:**

1. **Navigate to Integrations**
   - Settings → Integrations → Clearinghouse

2. **Select Clearinghouse**
   - Options: Change Healthcare, Availity, Waystar, etc.

3. **Enter Credentials:**
   - **Submitter ID**
   - **Submitter Password**
   - **Payer ID List** (insurance companies)
   - **Test vs Production Mode**

4. **Configure Settings:**
   - **Auto-submit claims** (yes/no)
   - **Claim scrubbing rules**
   - **ERA auto-import**
   - **EFT reconciliation**

5. **Test Connection**
   - Submit test claim
   - Verify acceptance
   - Check ERA retrieval

6. **Go Live**
   - Switch to production mode
   - Monitor first batch closely

---

#### E-Prescribing Integration

**Surescripts / NCPDP Configuration:**

1. **Navigate to Integrations**
   - Settings → Integrations → E-Prescribing

2. **Provider Setup:**
   - Each provider needs:
     - **NPI Number**
     - **DEA Number** (for controlled substances)
     - **State License Number**
     - **SPI (Surescripts Provider Identifier)**

3. **Practice Certification:**
   - **EPCS Certification** (for controlled substances)
   - Two-factor authentication setup
   - Identity proofing (per provider)

4. **Pharmacy Network:**
   - System pre-loaded with major pharmacies
   - Import custom pharmacy list if needed

5. **Formulary Integration:**
   - Link insurance plans to formularies
   - Enable real-time benefit checking

6. **Test E-Prescribing:**
   - Use test pharmacy
   - Send test prescription
   - Verify delivery

---

#### Lab Integration

**Connecting to Lab Systems:**

1. **Navigate to Integrations**
   - Settings → Integrations → Laboratory

2. **Add Lab Facility:**
   - **Lab Name**
   - **Lab Type** (Dermatopathology, General, Reference)
   - **CLIA Number**
   - **Address and Contact**

3. **Electronic Ordering:**
   - **HL7 Connection** (if supported)
   - **SFTP Credentials** (for order transmission)
   - **Order Format** (HL7 2.5, custom)

4. **Results Import:**
   - **Interface Type:**
     - HL7 Interface (automatic import)
     - Fax with OCR
     - Manual upload
   - **Result Parsing Rules**
   - **Normal Range Configuration**

5. **Test Integration:**
   - Send test order
   - Verify lab receipt
   - Import test result
   - Review parsing accuracy

---

#### Fax Configuration

**Setting up Internet Fax:**

1. **Navigate to Integrations**
   - Settings → Integrations → Fax Service

2. **Select Fax Provider:**
   - RingCentral Fax
   - eFax Corporate
   - SRFax
   - Fax.Plus

3. **Enter API Credentials:**
   - **API Key**
   - **Account Number**
   - **Fax Number** (your practice's fax)

4. **Configure Routing:**
   - **Incoming Faxes:**
     - Auto-assign by fax number
     - Manual review queue
   - **Outgoing Faxes:**
     - Cover page template
     - Retry settings

5. **Test Faxing:**
   - Send test fax
   - Receive test fax
   - Verify PDF quality

---

#### SMS Configuration

**Twilio Setup for Text Messaging:**

1. **Create Twilio Account**
   - Sign up at twilio.com
   - Verify identity
   - Purchase phone number

2. **Navigate to Integrations**
   - Settings → Integrations → SMS

3. **Enter Twilio Credentials:**
   - **Account SID**
   - **Auth Token**
   - **Phone Number** (Twilio number)

4. **Configure Settings:**
   - **Opt-in Required** (yes - HIPAA requirement)
   - **Quiet Hours** (8am-8pm)
   - **Character Limit Warning**
   - **Delivery Status Tracking**

5. **Test Messaging:**
   - Send test message
   - Verify delivery
   - Test opt-out ("STOP" response)

---

### Clearinghouse Setup

**Detailed Clearinghouse Configuration:**

**Step 1: Account Setup**

1. Create account with clearinghouse
2. Complete provider enrollment
3. Sign payer agreements
4. Obtain credentials

**Step 2: System Configuration**

1. **Settings → Integrations → Clearinghouse**

2. **Enter Connection Details:**
   - Submitter ID
   - Username/Password
   - API Endpoint URL
   - Receiver ID (per payer)

3. **Payer Enrollment:**
   - Add each insurance company:
     - Payer ID
     - Payer Name
     - Electronic Payer ID
     - Supported transaction types (837P, 835, 276/277)

**Step 3: Claim Format**

1. **Configure 837 Settings:**
   - Practice information auto-fills
   - Provider NPI mapping
   - Taxonomy codes
   - Place of service codes

2. **Validation Rules:**
   - Required fields
   - Format checks
   - Code validity

**Step 4: ERA Setup**

1. **Configure 835 Import:**
   - Auto-download ERA files
   - Import frequency (hourly, daily)
   - Auto-post payments (optional)

2. **Adjustment Mapping:**
   - Map adjustment reason codes
   - Configure denial workflows

**Step 5: Testing**

1. **Submit Test Claims:**
   - Use test patient
   - Test NPI
   - Small dollar amounts

2. **Verify Workflow:**
   - Claim accepted
   - Acknowledgment received
   - ERA returns
   - Payment posts

**Step 6: Go Live**

1. **Switch to Production**
2. **Submit Real Claims**
3. **Monitor First Week:**
   - Acceptance rate
   - Rejection reasons
   - Turnaround time

---

### Fax Configuration

**Internet Fax Setup:**

**Recommended Providers:**
- RingCentral Fax ($15-30/month)
- eFax Corporate ($20-40/month)
- SRFax ($10-25/month) - HIPAA-specific

**Configuration Steps:**

1. **Sign up with Provider**
   - Choose HIPAA-compliant plan
   - Sign BAA (Business Associate Agreement)
   - Select fax number (local or toll-free)

2. **Integrate with EHR:**

   **Settings → Integrations → Fax**

   - Provider: [Select from dropdown]
   - API Key: [from fax provider]
   - Account ID: [from fax provider]
   - Fax Number: [your number]

3. **Incoming Fax Routing:**
   - **Email to Fax Inbox** (arrives as PDF)
   - **API Webhook** (automatic import)
   - **Manual Check** (login to retrieve)

4. **Outgoing Fax Settings:**
   - **Cover Page:** Upload template
   - **Sender Information:** Auto-fill from practice settings
   - **Retry Attempts:** 3 (recommended)
   - **Success Notification:** Email to user

5. **Test Faxing:**
   - Send to your own number
   - Send to test number (provider offers test numbers)
   - Verify transmission report

---

### SMS Settings

**Text Messaging Configuration:**

**Important:** SMS for healthcare must be HIPAA-compliant.

**Twilio Setup:**

1. **Create Account:**
   - Go to twilio.com
   - Sign up (provide credit card)
   - Verify identity (required by law)

2. **Purchase Phone Number:**
   - Navigate to Phone Numbers
   - Buy a local number ($1/month)
   - Enable SMS capability
   - Enable MMS (for photo messages) - optional

3. **Configure EHR Integration:**

   **Settings → Integrations → SMS**

   - **Account SID:** [from Twilio console]
   - **Auth Token:** [from Twilio console]
   - **Phone Number:** [number purchased]
   - **Messaging Service SID:** [optional, for multiple numbers]

4. **Compliance Settings:**

   **Opt-In Requirement:**
   - Patients must opt-in to receive texts
   - Checkbox on registration form
   - Consent logged in patient record

   **Opt-Out Handling:**
   - Auto-respond to "STOP"
   - Mark patient as opted-out
   - No further messages sent

   **Quiet Hours:**
   - No texts before 8am or after 8pm local time
   - Configurable per practice

5. **Message Logging:**
   - All messages logged for HIPAA compliance
   - Audit trail includes:
     - Sender
     - Recipient
     - Timestamp
     - Message content
     - Delivery status

6. **Costs:**
   - Outbound SMS: ~$0.0075 per message
   - Inbound SMS: ~$0.0075 per message
   - 1000 messages = ~$15/month
   - Set budget alerts in Twilio

---

## Security & Compliance

### User Access Controls

**Best Practices:**

1. **Password Policy:**
   - Minimum 8 characters
   - Require uppercase, lowercase, number, special character
   - Expire passwords every 90 days
   - No password reuse (last 5 passwords)

   **Configure in:** Settings → Security → Password Policy

2. **Multi-Factor Authentication (MFA):**
   - Require for all users
   - Especially required for:
     - Administrators
     - Providers prescribing controlled substances (EPCS)
     - Remote access

   **Enable:** Settings → Security → Multi-Factor Authentication

3. **Session Management:**
   - Auto-logout after 15 minutes of inactivity
   - Require re-authentication for sensitive actions
   - Limit concurrent sessions (1-2 per user)

4. **Failed Login Attempts:**
   - Lock account after 5 failed attempts
   - Require administrator unlock or wait 30 minutes
   - Alert on repeated failures

5. **IP Restrictions:**
   - Whitelist office IP addresses
   - Require VPN for remote access
   - Block access from foreign countries

---

### Audit Logging

**What is Logged:**

Every action involving patient data:
- Who (user)
- What (action: view, create, edit, delete)
- When (timestamp)
- Where (IP address, location)
- Which patient

**Accessing Audit Logs:**

1. **Navigate to Audit Log**
   - Click **Audit Log** in sidebar
   - Or Settings → Security → Audit Log

2. **Filter Logs:**
   - **Date Range**
   - **User** (specific staff member)
   - **Action Type:**
     - Patient Viewed
     - Patient Created
     - Patient Edited
     - Note Created
     - Note Signed
     - Prescription Sent
     - Lab Result Viewed
     - Document Uploaded
     - Login Success/Failure
   - **Patient** (specific patient MRN)

3. **Review Entries:**

   Each log entry shows:
   - **Timestamp**
   - **User** (name and role)
   - **Action**
   - **Patient** (if applicable)
   - **IP Address**
   - **Details** (what changed)

4. **Export Audit Logs:**
   - Click **Export**
   - Format: CSV or PDF
   - Date range selection
   - Use for HIPAA compliance audits

**Audit Log Retention:**
- Logs kept for 7 years (HIPAA requirement)
- Cannot be deleted or modified
- Stored in encrypted format

---

### HIPAA Compliance

**System Features for Compliance:**

1. **Encryption:**
   - **Data at Rest:** AES-256 encryption
   - **Data in Transit:** TLS 1.3
   - **Database:** Encrypted backups
   - **Files:** Encrypted storage (AWS S3 with SSE)

2. **Access Controls:**
   - Role-based permissions
   - Minimum necessary access
   - Audit all access to PHI

3. **Automatic Logoff:**
   - 15-minute inactivity timeout
   - Prevents unattended access

4. **Audit Trail:**
   - Complete logging of all PHI access
   - 7-year retention
   - Regular review required

5. **Business Associate Agreements (BAAs):**

   Required for all third-party services:
   - Clearinghouse
   - Fax service
   - SMS provider (Twilio)
   - Email service
   - Cloud hosting provider
   - Backup service

   **Obtain BAAs from:**
   - Settings → Compliance → Business Associates
   - Upload signed BAAs
   - Track expiration dates

6. **Breach Notification:**

   In case of data breach:
   - System has breach notification workflow
   - Automatically identifies affected patients
   - Generates notification letters
   - Tracks required reporting (HHS, media)

   **Access:** Settings → Compliance → Breach Protocol

7. **Risk Assessment:**

   Annual HIPAA risk assessment required:
   - Settings → Compliance → Risk Assessment
   - Complete annual questionnaire
   - Generate risk assessment report
   - Create mitigation plan

---

## Backup & Maintenance

### Automated Backups

**Backup Configuration:**

1. **Database Backups:**
   - **Frequency:** Daily at 2am
   - **Retention:** 30 days
   - **Location:** Encrypted S3 bucket
   - **Type:** Full backup

2. **File Backups:**
   - **Frequency:** Hourly incremental
   - **Retention:** 90 days
   - **Location:** Separate S3 bucket
   - **Includes:** Documents, photos, scanned forms

3. **Configuration Backups:**
   - **Frequency:** After any settings change
   - **Retention:** Indefinite
   - **Includes:** Templates, fee schedules, user settings

**Monitoring Backups:**

1. **Navigate to Backups**
   - Settings → System → Backups

2. **View Backup Status:**
   - Last successful backup
   - Backup size
   - Any failures
   - Restore points available

3. **Test Restores:**
   - Monthly test restore recommended
   - Verify data integrity
   - Confirm recovery time

---

### System Updates

**Update Process:**

1. **Notification:**
   - Email sent when update available
   - Banner appears in system
   - Shows version number and changes

2. **Review Release Notes:**
   - Settings → System → Updates
   - Click on pending update
   - Read what's new and fixed

3. **Schedule Update:**
   - Choose maintenance window (off-hours)
   - System recommends: Weekends 2-4am
   - Schedule 1 week in advance

4. **Update Execution:**
   - Automatic at scheduled time
   - System unavailable 15-30 minutes
   - Database backup created automatically
   - Rollback available if issues

5. **Post-Update:**
   - Test major functions
   - Review changelog
   - Report any issues

**Update Types:**

- **Patch Updates** (1.0.x → 1.0.y): Bug fixes, weekly
- **Minor Updates** (1.x → 1.y): New features, monthly
- **Major Updates** (x.0 → y.0): Significant changes, quarterly

---

### System Health Monitoring

**Health Dashboard:**

1. **Navigate to System Health**
   - Settings → System → Health

2. **Monitor Metrics:**

   **Performance:**
   - **Response Time:** Average API response (<100ms is good)
   - **Page Load Time:** Average (<1 second is good)
   - **Database Query Time:** Average (<50ms is good)
   - **Error Rate:** Percentage of failed requests (<0.1% is good)

   **Usage:**
   - **Active Users:** Currently logged in
   - **Daily Active Users:** Unique users per day
   - **Storage Used:** Database and files
   - **API Calls:** Per hour/day

   **System Resources:**
   - **CPU Usage:** Percentage (<70% is good)
   - **Memory Usage:** Percentage (<80% is good)
   - **Disk Space:** Available space (>20% free is good)
   - **Network:** Bandwidth utilization

3. **Set Alerts:**

   Configure notifications for:
   - High error rate
   - Slow performance
   - Low disk space
   - Failed backups
   - Unusual activity

   **Settings → System → Alerts**

   - Email: admin@practice.com
   - SMS: Optional
   - Slack: Optional

---

## Troubleshooting

### Common Issues

#### Users Can't Log In

**Symptoms:**
- "Invalid credentials" error
- Account locked message
- Password reset not working

**Troubleshooting:**

1. **Check Account Status:**
   - Settings → Users → Find user
   - Verify status is "Active"
   - Check "Last Login" date

2. **Unlock Account:**
   - If locked due to failed attempts
   - Click "Unlock Account" button
   - User can try again immediately

3. **Reset Password:**
   - Click "Reset Password"
   - Send reset email
   - Or generate temporary password

4. **Check Email Delivery:**
   - Verify email address is correct
   - Check spam folder
   - Check email service logs

5. **Browser Issues:**
   - Clear browser cache and cookies
   - Try incognito/private mode
   - Try different browser

---

#### E-Prescribing Not Working

**Symptoms:**
- "Failed to send prescription" error
- Pharmacy not found
- Network error

**Troubleshooting:**

1. **Check Provider Credentials:**
   - Settings → Users → Provider
   - Verify NPI is entered
   - Verify DEA (for controlled substances)
   - Check Surescripts enrollment status

2. **Check Pharmacy:**
   - Verify pharmacy is active
   - Check NCPDP ID is correct
   - Try different pharmacy

3. **Check Patient Information:**
   - Verify patient address is complete
   - Check date of birth is entered
   - Verify phone number

4. **Network Connection:**
   - Settings → Integrations → E-Prescribing
   - Click "Test Connection"
   - Check status

5. **Fallback to Print:**
   - If persistent issues
   - Use "Print Prescription" option
   - Report issue to support

---

#### Claims Not Submitting

**Symptoms:**
- Claims stuck in "Draft" status
- Clearinghouse rejection
- Validation errors

**Troubleshooting:**

1. **Run Claim Scrubber:**
   - Financials → Claims
   - Select claim
   - Click "Validate"
   - Review errors

2. **Common Errors:**

   **Missing Diagnosis:**
   - Open encounter
   - Add ICD-10 code
   - Link to CPT codes

   **Missing Patient Information:**
   - Check insurance is entered
   - Verify policy numbers
   - Check patient demographics

   **Invalid Code Combination:**
   - Check CPT code is valid
   - Verify modifier usage
   - Check diagnosis supports procedure

3. **Clearinghouse Status:**
   - Settings → Integrations → Clearinghouse
   - Check connection status
   - Test with sample claim

4. **Resubmit:**
   - After fixing errors
   - Click "Submit to Clearinghouse"
   - Monitor for acceptance

---

#### Slow Performance

**Symptoms:**
- Pages load slowly
- Search is laggy
- Timeouts

**Troubleshooting:**

1. **Check System Health:**
   - Settings → System → Health
   - Look for red indicators
   - Check response times

2. **Database Optimization:**
   - Settings → System → Maintenance
   - Click "Optimize Database"
   - Rebuilds indexes, clears cache

3. **Clear Browser Cache:**
   - Browser Settings → Clear Data
   - Select cache and cookies
   - Refresh page

4. **Check Network:**
   - Run speed test (speedtest.net)
   - Verify internet connection
   - Check if other sites slow

5. **Report to Support:**
   - If persistent
   - Provide specific page/action that's slow
   - Include browser and OS version

---

#### Missing Lab Results

**Symptoms:**
- Lab results not appearing
- Delayed results
- Incomplete results

**Troubleshooting:**

1. **Check Lab Order Status:**
   - Orders page → Find order
   - Verify status is "Completed" or "Resulted"

2. **Manual Import:**
   - If results received via fax
   - Documents → Upload
   - Assign to patient
   - Link to order

3. **Check Lab Integration:**
   - Settings → Integrations → Laboratory
   - Verify connection status
   - Check last import time

4. **Contact Lab:**
   - Call lab directly
   - Verify they sent results
   - Ask for fax or manual upload

5. **Create Manual Entry:**
   - If can't get electronically
   - Labs page → "Add Manual Result"
   - Enter values manually
   - Attach PDF report

---

### Getting Support

**Contact Information:**

- **Email:** support@yourdomain.com
- **Phone:** 1-800-XXX-XXXX (24/7 for critical issues)
- **Portal:** support.yourdomain.com
- **Documentation:** This guide + USER_GUIDE.md + FAQ.md

**Before Contacting Support:**

1. Check this guide and FAQ
2. Try basic troubleshooting
3. Note error messages (screenshot)
4. Document steps to reproduce

**When Contacting Support, Provide:**

- Practice name and tenant ID
- User name and role
- Description of issue
- Steps to reproduce
- Error messages or screenshots
- Browser and OS version
- Time issue occurred

**Response Times:**

- **Critical** (system down): 1 hour
- **High** (major feature broken): 4 hours
- **Medium** (minor issue, workaround available): 24 hours
- **Low** (questions, enhancement requests): 2-3 business days

---

**End of Administrator Guide**

For user-facing documentation, see:
- **USER_GUIDE.md** - Complete user instructions
- **QUICK_START_USER_GUIDE.md** - 5-minute quick start
- **FAQ.md** - Common questions and answers

For technical documentation, see:
- **ARCHITECTURE.md** - System architecture
- **DEPLOYMENT.md** - Deployment guide
- **SECURITY.md** - Security details
