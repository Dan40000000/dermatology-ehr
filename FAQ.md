# Frequently Asked Questions (FAQ)

**Dermatology EHR System**
**Version 1.0** | **Last Updated:** December 29, 2025

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Patient Management](#patient-management)
3. [Scheduling](#scheduling)
4. [Clinical Documentation](#clinical-documentation)
5. [Prescriptions](#prescriptions)
6. [Lab & Results](#lab--results)
7. [Billing & Claims](#billing--claims)
8. [Messages & Communication](#messages--communication)
9. [Reports & Analytics](#reports--analytics)
10. [Technical Issues](#technical-issues)
11. [Security & Privacy](#security--privacy)
12. [Contact & Support](#contact--support)

---

## Getting Started

### Q: How do I log in for the first time?

**A:** You'll receive a welcome email with:
- Your unique login URL
- Your email address (username)
- A temporary password

On first login, you'll be required to:
1. Change your temporary password
2. Set up security questions (optional)
3. Enable two-factor authentication (if required by your practice)

---

### Q: I forgot my password. How do I reset it?

**A:** Two methods:

**Method 1: Self-Service**
1. Click "Forgot Password" on login page
2. Enter your email address
3. Check your email for reset link (arrives within 5 minutes)
4. Click link and create new password
5. Password must meet requirements (8+ characters, uppercase, lowercase, number, special character)

**Method 2: Contact Administrator**
- Call your practice administrator
- They can reset your password manually
- You'll receive a temporary password via email

---

### Q: Why can't I see certain menu options?

**A:** Menu options are based on your **role** and **permissions**.

For example:
- **Front Desk** staff can't see Financials or Clinical Notes
- **Billing Staff** can't create clinical notes or prescribe
- **Providers** have access to most clinical features

If you believe you should have access to something, contact your administrator to review your role and permissions.

---

### Q: Can I use this on my phone or tablet?

**A:** Yes! The system is fully responsive and works on:
- Smartphones (iOS and Android)
- Tablets (iPad, Android tablets)
- Laptops and desktop computers

**Tip:** Add to your home screen for an app-like experience:
- **iPhone:** Safari → Share → Add to Home Screen
- **Android:** Chrome → Menu → Add to Home Screen

---

### Q: Which browsers are supported?

**A:** Supported browsers:
- **Google Chrome** (recommended) - latest version
- **Mozilla Firefox** - latest version
- **Apple Safari** - version 14+
- **Microsoft Edge** - latest version

**Not supported:**
- Internet Explorer (discontinued by Microsoft)
- Older browser versions (update for best performance)

---

## Patient Management

### Q: How do I add a new patient?

**A:** Three ways:

**Method 1: Quick Add**
1. Press **Ctrl+N** (keyboard shortcut)
2. Fill in required fields (name, DOB, phone)
3. Click Save

**Method 2: From Patients Page**
1. Click **Patients** in sidebar
2. Click **+ New Patient** button
3. Complete registration form
4. Click Save

**Method 3: From Scheduling**
1. When creating appointment
2. Type patient name
3. If not found, click **Create New Patient**
4. Fill details and save

---

### Q: Can I merge duplicate patient records?

**A:** Yes, but **only administrators** can merge patients due to the complexity and compliance requirements.

**To request a merge:**
1. Contact your practice administrator
2. Provide both patient MRNs
3. Administrator will review and merge
4. All encounters, prescriptions, and documents will be consolidated

**Warning:** This cannot be undone, so administrator will verify carefully before merging.

---

### Q: How do I search for a patient?

**A:** Multiple search methods:

**Quick Search:**
- Click search box on Patients page
- Type any of: Name, DOB, Phone, MRN, Email
- Results appear as you type

**Global Search:**
- Press **Ctrl+K** from anywhere
- Type patient information
- Patient chart opens directly

**Advanced Search:**
- Click **Advanced Search** on Patients page
- Filter by:
  - Age range
  - Insurance provider
  - Last visit date
  - Provider
  - Diagnosis
  - Status (active/inactive)

---

### Q: How do I update patient insurance information?

**A:** Two scenarios:

**New Insurance:**
1. Open patient chart
2. Click **Insurance** tab
3. Click **+ Add Insurance**
4. Select insurance company
5. Enter policy and group numbers
6. Upload front/back of card
7. Save

**Update Existing Insurance:**
1. Open patient chart → Insurance tab
2. Click **Edit** on existing insurance
3. Update policy/group numbers
4. Upload new card images if changed
5. Save
6. Old information is preserved in history

---

### Q: What if a patient changes their name?

**A:** Legal name changes (marriage, etc.):

1. Open patient chart
2. Click **Edit** in Demographics section
3. Update:
   - **Last Name** (new legal name)
   - **Previous Names** (optional field - enter maiden name)
4. Save

**System will:**
- Update all future documents with new name
- Preserve historical records with old name
- Log change in audit trail

**Important:** You may want to upload legal documentation (marriage certificate, court order) to patient Documents tab.

---

## Scheduling

### Q: How do I block time on the schedule for lunch or meetings?

**A:** Use **Time Blocks**:

1. On Schedule page, click **Block Time** button
2. Select block type:
   - Lunch
   - Meeting
   - Admin Time
   - Out of Office
   - Continuing Education
3. Choose provider, start time, end time
4. Optional: Set recurrence (daily, weekly, etc.)
5. Save

**Time block prevents appointment booking during that period.**

---

### Q: How do I handle a patient who wants to cancel?

**A:** Cancellation process:

1. Find appointment on Schedule
2. Click on appointment
3. Click **Cancel Appointment**
4. Select cancellation reason:
   - Patient request
   - Weather
   - Provider unavailable
   - No-show (if patient didn't show up)
5. Optional: Send patient to waitlist
6. Optional: Send cancellation confirmation to patient
7. Save

**Appointment is removed from schedule but preserved in patient's history.**

---

### Q: Can patients book their own appointments online?

**A:** Yes, through the **Patient Portal** (if enabled by your practice):

**Patient Portal Self-Scheduling:**
1. Patient logs into portal
2. Clicks "Book Appointment"
3. Selects appointment type and provider
4. Chooses from available time slots
5. Enters reason for visit
6. Confirms booking

**Front desk can:**
- Review and approve (if set to manual approval)
- Modify time if needed
- Confirm with patient

**To enable:** Administrator must activate in Settings → Patient Portal → Enable Self-Scheduling

---

### Q: How do I see only my schedule (not all providers)?

**A:** Filter the schedule:

1. On Schedule page, look for **Provider Filter** dropdown (top right)
2. Select your name
3. Only your appointments display

**Save this view:**
- Click **Save View** button
- Name it "My Schedule"
- Quick access from dropdown

---

### Q: What do the different appointment colors mean?

**A:** Color coding by **status**:

- **Blue:** Scheduled (not yet checked in)
- **Yellow:** Confirmed (patient confirmed attendance)
- **Green:** Checked In (patient in waiting room)
- **Purple:** In Room (with medical assistant)
- **Teal:** With Provider (doctor is seeing patient)
- **Gray:** Completed (visit finished)
- **Red:** Cancelled or No-Show

**Also color-coded by provider** (each provider has assigned color).

---

## Clinical Documentation

### Q: Can I edit a note after I've signed it?

**A:** No - signed notes are **locked** for legal and compliance reasons.

**Solution: Add an Addendum**
1. Open the signed note
2. Click **Add Addendum** button
3. Enter your additional information or correction
4. Save addendum

**Addendum:**
- Timestamps automatically
- Shows your name as author
- Cannot be deleted
- Displays below original note

**This maintains legal integrity while allowing corrections.**

---

### Q: How do I use the Ambient AI Scribe?

**A:** AI-powered documentation:

**Step 1: Start Recording**
1. Open encounter
2. Click **Start Scribe** button
3. Read consent to patient: "This visit will be recorded for documentation"
4. Patient must verbally agree
5. Click **Patient Consented** to begin

**Step 2: Conduct Visit Normally**
- Speak naturally with patient
- AI transcribes conversation in real-time
- Focus on patient, not computer

**Step 3: Stop and Review**
1. Click **Stop Scribe** when visit complete
2. AI processes recording (10-30 seconds)
3. Review AI-generated SOAP note
4. Edit any errors or add missing details
5. Accept draft to populate note

**Accuracy:** Typically 90-95% accurate, but **always review carefully**.

---

### Q: What's the difference between saving and signing a note?

**A:** Important distinction:

**Saving:**
- Stores note as draft
- Can be edited later
- Not yet a legal medical record
- Doesn't trigger billing
- Status: "Draft" or "Preliminary"

**Signing:**
- Finalizes the note
- Cannot be edited (only addendums)
- Becomes legal medical record
- Triggers automatic billing charge creation
- Status: "Signed"
- Required for claim submission

**Best Practice:** Save frequently while documenting, sign when completely finished.

---

### Q: How do I link a photo to a note?

**A:** Two methods:

**Method 1: During Encounter**
1. In encounter, click **Add Photo** button
2. Upload photo (or take with webcam)
3. Photo automatically links to encounter
4. Appears in encounter when viewing

**Method 2: From Photos Page**
1. Photos page → Upload photo
2. Select patient
3. Link to encounter (dropdown shows patient's encounters)
4. Photo associates with that visit

**Tip:** Tag photos with anatomical location using body diagram.

---

### Q: Can I copy a previous note to save time?

**A:** Not directly, but use **Templates**:

**Better Alternative:**
1. Create a template from your commonly used note format
2. Settings → Note Templates → + New Template
3. Use template for future similar visits
4. Customizes for each patient

**Why not copy notes?**
- Each visit is unique
- Copying risks including incorrect historical information
- Compliance risk ("copy-paste" documentation is scrutinized)

**Use templates for consistency, not copied notes.**

---

## Prescriptions

### Q: How do I know if a prescription was successfully sent?

**A:** Check transmission status:

1. After clicking "Send to Pharmacy"
2. Wait 5-10 seconds for confirmation
3. Status shows:
   - **Sent** ✓ Success, pharmacy received
   - **Sending** ⏳ In progress
   - **Failed** ✗ Error occurred

**If Failed:**
- Error message displays reason
- Options:
  - Try different pharmacy
  - Print prescription instead
  - Report issue to support

**Confirmation:**
- Patient receives text when ready for pickup (from pharmacy, not EHR)
- You can call pharmacy to verify if needed

---

### Q: Can I cancel a prescription after sending it?

**A:** Yes, within a short timeframe:

**If just sent (within 1 hour):**
1. Go to patient Rx tab
2. Find prescription
3. Click **Cancel Prescription**
4. Select reason (sent in error, patient declined, etc.)
5. Cancellation sent to pharmacy

**If already dispensed:**
- Cannot cancel electronically
- Must call pharmacy directly
- Document in patient chart

---

### Q: Why can't I find a medication when searching?

**A:** Possible reasons:

1. **Spelling:** Try alternate spellings (e.g., "sulfur" vs "sulphur")
2. **Brand vs Generic:** Try both (e.g., "Accutane" vs "isotretinoin")
3. **Strength:** Search without strength first, then select
4. **Formulation:** Try without form (cream, tablet, etc.)

**Still can't find?**
- Medication may not be in database
- Click "Request Addition" to submit for inclusion
- Alternative: Print prescription for that medication

---

### Q: How do I prescribe a controlled substance?

**A:** Enhanced security required:

**Prerequisites:**
- Must have DEA number entered in profile
- Must have EPCS (Electronic Prescribing for Controlled Substances) enabled
- Must have two-factor authentication set up

**Process:**
1. Create prescription as normal
2. System detects controlled substance
3. **Two-Factor Authentication prompts:**
   - Enter your password
   - Enter code from authenticator app
4. Prescription sends after authentication

**State PDMP Check:**
- System automatically checks state Prescription Drug Monitoring Program
- Shows patient's controlled substance history
- Required in most states

---

### Q: What if the patient's pharmacy isn't in the system?

**A:** Add the pharmacy:

**Option 1: Search by NCPDP**
1. Click "Find Pharmacy"
2. If you have pharmacy's NCPDP ID, enter it
3. Pharmacy imports from national database

**Option 2: Add Manually**
1. Click "Add Pharmacy"
2. Enter:
   - Pharmacy name
   - Address
   - Phone and fax
   - NCPDP ID (if known)
3. Save
4. Available for future prescriptions

**Option 3: Print Prescription**
- If pharmacy can't be found
- Patient takes paper Rx to pharmacy

---

## Lab & Results

### Q: How do I know when lab results are back?

**A:** Multiple notifications:

1. **Dashboard Badge:** "New Results" count on home screen
2. **Email:** Notification sent to your email (if enabled)
3. **Labs Page:** Results appear in "Pending Review" section

**Urgent Results:**
- Critical values generate urgent alert
- Pop-up notification when you log in
- Email marked "URGENT"

---

### Q: How do I notify a patient of their results?

**A:** After reviewing result:

1. Click **Notify Patient** button
2. Select notification method:
   - **Phone Call:** Creates task reminder to call
   - **Portal Message:** Secure message to patient portal
   - **Text Message:** SMS notification (if patient opted in)
   - **Letter:** Generates printable letter
3. For abnormal results, select "Schedule Follow-up"
4. Document notification in patient chart

---

### Q: Can I see trends in lab values over time?

**A:** Yes, use **Trend View**:

1. Patient chart → Labs tab
2. Click **Trend View** button
3. Select test to track (e.g., "ALT" for liver function)
4. Graph shows values over time
5. Reference range shaded
6. Abnormal values highlighted in red

**Use cases:**
- Monitor liver enzymes for methotrexate patients
- Track lipids for isotretinoin patients
- Follow disease markers for chronic conditions

---

### Q: What do I do if lab results are missing?

**A:** Troubleshooting steps:

1. **Check Order Status:**
   - Orders page → Find order
   - Verify patient actually went to lab (check "Collected" status)

2. **Check Time Frame:**
   - Routine results: 3-7 business days
   - STAT: 24-48 hours
   - May not be late yet

3. **Contact Lab:**
   - Call lab directly
   - Provide order number
   - Ask for status

4. **Manual Entry:**
   - If lab faxes result
   - Upload PDF to patient Documents
   - Link to lab order
   - Or enter manually: Labs → Add Manual Result

---

## Billing & Claims

### Q: How do I bill for a visit?

**A:** Billing is largely automatic:

**Automatic Process:**
1. Complete encounter note
2. Add diagnoses (ICD-10 codes)
3. Document procedures performed
4. Sign note
5. **System automatically creates charges** based on:
   - Visit type
   - Time spent
   - Complexity
   - Procedures performed

**Review Charges:**
1. Go to encounter → **Billing** tab
2. Review suggested codes
3. Adjust if needed (change visit level, add/remove procedures)
4. Save

**Claim Created:**
- Claim auto-generates in "Draft" status
- Review and submit in Financials → Claims

---

### Q: Why was my claim rejected?

**A:** Common rejection reasons:

1. **Missing Diagnosis Code:**
   - Solution: Add ICD-10 to encounter, link to CPT codes

2. **Invalid Patient Demographics:**
   - Solution: Verify DOB, address, insurance numbers

3. **Missing Prior Authorization:**
   - Solution: Obtain auth from insurance, enter auth number

4. **Duplicate Claim:**
   - Solution: Check if already submitted for this date of service

5. **Not Medically Necessary:**
   - Solution: Review diagnosis linkage, may need different ICD-10

**To Fix:**
1. Financials → Claims
2. Click rejected claim
3. View rejection reason codes
4. Fix issue
5. **Resubmit**

---

### Q: How do I post an insurance payment?

**A:** Two methods:

**Method 1: Manual Posting**
1. Financials → Payer Payments
2. Click **+ Post Payment**
3. Select insurance company
4. Enter payment amount
5. Apply to specific claims
6. Enter adjustment codes if applicable
7. Save

**Method 2: Automatic ERA Posting**
1. Clearinghouse → ERA tab
2. Click on remittance advice
3. Click **Post ERA**
4. System automatically applies payments to claims
5. Review and confirm

**Method 2 is faster and more accurate.**

---

### Q: How do I generate a patient statement?

**A:** Statement process:

1. Financials → Statements
2. Click **+ Create Statement**
3. Select patient(s):
   - Individual patient
   - All patients with balance
   - Filter by balance amount or age
4. Configure statement:
   - Include detailed charges
   - Payment options/instructions
   - Due date
5. Preview statement
6. Print or email to patient

**Automatic Statements:**
- Can schedule monthly auto-generation
- Settings → Financials → Automatic Statements

---

### Q: What's the difference between a superbill and a claim?

**A:** Important distinction:

**Superbill:**
- **What:** Summary document of visit charges
- **Purpose:** Given to patient for self-filing with insurance
- **Format:** Printable PDF
- **Used when:** Patient has insurance we don't bill directly
- **Contains:** All CPT and ICD-10 codes, charges, patient responsibility

**Claim:**
- **What:** Electronic submission to insurance
- **Purpose:** We file on behalf of patient
- **Format:** Electronic (837 file)
- **Used when:** We accept patient's insurance
- **Contains:** Same codes, plus NPI, tax ID, payer IDs

**Most practices submit claims electronically rather than giving superbills.**

---

## Messages & Communication

### Q: How do I send a secure message to a patient?

**A:** Through Patient Portal:

1. Click **Mail** in sidebar
2. Select **Portal Messages** tab
3. Click **+ New Message**
4. **To:** Search for patient
5. **Subject:** Brief description
6. **Message:** Type your message
7. Optional: Attach documents
8. Click **Send**

**Patient receives:**
- Email notification: "You have a new message"
- Must log into portal to read (HIPAA security)
- Can reply through portal

**Do not:**
- Send via regular email (not HIPAA-compliant)
- Include sensitive information in text messages

---

### Q: Can I text patients?

**A:** Yes, with restrictions:

**What you CAN text:**
- Appointment reminders
- General instructions (non-specific)
- Follow-up reminders
- "Call the office" notifications

**What you CANNOT text:**
- Specific medical information
- Lab results (specific values)
- Diagnosis information
- Treatment details
- PHI (Protected Health Information)

**Best Practice:**
- Use texts for administrative communication
- Use patient portal messages for clinical communication

---

### Q: How do I use message templates for faster responses?

**A:** Templates save time:

**Using Templates:**
1. In message composition window
2. Click **Template** button
3. Select from dropdown:
   - Appointment Reminder
   - Lab Results Ready (call office)
   - Medication Instructions
   - General Follow-up
4. Template text inserts
5. Customize as needed
6. Send

**Creating Templates:**
1. Settings → Message Templates
2. **+ New Template**
3. Enter message text
4. Use variables: {firstName}, {clinicPhone}, etc.
5. Save for future use

---

### Q: What if I accidentally send a message to the wrong patient?

**A:** Take immediate action:

1. **Cannot unsend** - message is delivered immediately
2. **Notify Administrator:**
   - Report potential breach
   - Required by HIPAA if PHI was disclosed
3. **Document Incident:**
   - Date, time, content of message
   - Who was intended recipient
   - Who actually received it
4. **Mitigation:**
   - Send follow-up to wrong recipient explaining error
   - Ask them to disregard and delete
   - May need to notify correct patient
5. **Prevent Future:**
   - Double-check recipient before sending
   - Use full name + DOB verification

**This is a reportable incident - always inform administrator.**

---

## Reports & Analytics

### Q: How do I generate a report of all patients seen last month?

**A:** Custom report:

1. **Reports** → **Patient Visit Report**
2. **Date Range:** Set to last month (e.g., Nov 1 - Nov 30)
3. **Providers:** Select all or specific
4. **Filters:** Set as needed (appointment status: completed)
5. Click **Run Report**
6. Results show all visits in that period
7. **Export:** Click CSV or PDF

**Data includes:**
- Patient name
- Date of visit
- Provider
- Appointment type
- Diagnoses
- Procedures performed

---

### Q: How do I see my productivity stats?

**A:** Provider Dashboard:

1. Click **Analytics** in sidebar
2. Filter by your name (Provider dropdown)
3. Select date range
4. View metrics:
   - **Patients Seen:** Total encounters
   - **Revenue Generated:** Total charges
   - **RVUs:** Relative value units
   - **Average Visit Time**
   - **Most Common Diagnoses**
   - **Most Common Procedures**

**Compare to:**
- Other providers (if admin)
- Prior periods
- Practice benchmarks

---

### Q: Can I export data to Excel?

**A:** Yes, most pages have export:

**Standard Tables:**
- Look for **Export** button (usually top right)
- Options: CSV, PDF, Print
- CSV opens in Excel

**Reports:**
- All reports have export option
- Select CSV format
- Opens in Excel for further analysis

**Custom Exports:**
- Administrator can create custom queries
- Contact admin for specific data needs

---

### Q: How do I track quality measures for MIPS?

**A:** Quality Page:

1. **Analytics** → **Quality** tab
2. View dashboard showing:
   - All tracked measures
   - Current performance rates
   - Benchmark comparisons
   - Open quality gaps

**Close Gaps:**
1. **Gaps** sub-tab
2. Shows patients needing interventions
3. Click patient → Take action (schedule visit, order test, etc.)
4. Mark gap as closed

**Submit to MIPS:**
1. **Submit** sub-tab
2. Select quarter or year
3. Review measures
4. Click **Submit to MIPS**
5. Confirmation number generated

**Quarterly reporting recommended.**

---

## Technical Issues

### Q: The system is running slowly. What can I do?

**A:** Troubleshooting steps:

1. **Clear Browser Cache:**
   - Chrome: Settings → Privacy → Clear Browsing Data
   - Select "Cached images and files"
   - Time range: "All time"
   - Clear data

2. **Close Unnecessary Tabs:**
   - Multiple tabs consume memory
   - Close other websites

3. **Check Internet Speed:**
   - Visit speedtest.net
   - Minimum recommended: 10 Mbps download
   - If slow, contact IT or internet provider

4. **Try Different Browser:**
   - Chrome recommended
   - Update to latest version

5. **Restart Computer:**
   - Sometimes resolves memory issues

**Still slow? Report to support with:**
- Specific page or action that's slow
- Browser version
- Internet speed

---

### Q: I'm getting an error message. What do I do?

**A:** Error handling:

1. **Read Error Message:**
   - Often tells you what's wrong
   - Example: "Missing required field: Date of Birth"

2. **Take Screenshot:**
   - Press PrintScreen or use Snipping Tool
   - Save error message

3. **Note What You Were Doing:**
   - What page were you on?
   - What button did you click?
   - What were you trying to do?

4. **Try Again:**
   - Sometimes temporary glitch
   - Refresh page and retry

5. **Report to Support:**
   - If persists
   - Include screenshot
   - Describe steps to reproduce

**Common errors with quick fixes:**
- "Session expired" → Log out and back in
- "Network error" → Check internet connection
- "Permission denied" → Contact admin to verify your access

---

### Q: Can I access the system from home?

**A:** Yes, if enabled by your practice:

**Requirements:**
1. Internet connection
2. Supported browser
3. Login credentials
4. **May require VPN** (check with IT)

**Security when remote:**
- Use secure, password-protected WiFi
- Don't use public WiFi
- Lock computer when stepping away
- Log out when finished

**Mobile access:**
- Works on phone/tablet browsers
- Responsive design adjusts to screen size

---

### Q: How do I print from the system?

**A:** Printing options:

**Direct Print:**
1. On most pages, look for **Print** button
2. Clicks opens browser print dialog
3. Select printer
4. Print

**Export then Print:**
1. Click **Export** → **PDF**
2. PDF downloads
3. Open PDF
4. Print from PDF viewer
5. **Better quality and more control**

**Common print items:**
- Patient chart summary
- Superbills
- Prescriptions
- Lab results
- Encounter notes
- Reports

**Tip:** Use PDF export for better formatting and to save a copy.

---

## Security & Privacy

### Q: How secure is patient data?

**A:** Multiple security layers:

**Encryption:**
- **Data in transit:** TLS 1.3 (like banking websites)
- **Data at rest:** AES-256 encryption
- **Backups:** Encrypted before storage

**Access Controls:**
- Role-based permissions
- Minimum necessary access
- Two-factor authentication available

**Audit Logging:**
- Every access to patient data logged
- Who, what, when, where tracked
- 7-year retention (HIPAA requirement)

**Compliance:**
- HIPAA compliant
- Regular security audits
- Business Associate Agreements with all vendors

**Physical Security:**
- Data hosted in SOC 2 certified data centers
- Redundant backups
- Disaster recovery plan

---

### Q: Can I access a patient chart I'm not treating?

**A:** Only with valid reason:

**Permissible Access:**
- You are providing care
- You are covering for another provider
- Administrative task (front desk checking in patient)
- Billing inquiry
- Quality improvement project (with authorization)

**Not Permissible:**
- Curiosity about family/friend
- Looking up your own record
- Unrelated to job duties
- Celebrity or VIP patient (unless treating)

**All access is logged:**
- Audit trail reviewed regularly
- Inappropriate access results in:
  - Disciplinary action
  - Possible termination
  - HIPAA violation fines
  - Legal consequences

**When in doubt, ask supervisor.**

---

### Q: What if I suspect a data breach?

**A:** Report immediately:

1. **Do Not:**
   - Try to fix it yourself
   - Delete evidence
   - Discuss with unauthorized persons

2. **Immediately Report to:**
   - Practice administrator
   - HIPAA privacy officer
   - IT department

3. **Provide Information:**
   - What happened?
   - When did it occur?
   - What patient data may be affected?
   - Who might have accessed it?
   - Any evidence (screenshots, emails, etc.)

4. **Organization Will:**
   - Investigate incident
   - Determine if reportable breach
   - Notify affected patients (if required)
   - Report to HHS if necessary
   - Implement safeguards

**Time is critical - report as soon as you become aware.**

---

### Q: How often should I change my password?

**A:** Policy varies by practice:

**Typical Requirements:**
- Change every **90 days** (automatic prompt)
- Cannot reuse last 5 passwords
- Must meet complexity requirements

**Best Practices:**
- Use unique password (not used elsewhere)
- Use password manager (LastPass, 1Password, etc.)
- Don't write it down
- Don't share with anyone
- Change immediately if compromised

**Strong Password:**
- 12+ characters
- Mix of upper and lowercase
- Numbers and special characters
- Not a dictionary word
- Example: `Dr$k1nC@re2025!`

---

## Contact & Support

### Q: Who do I contact for different issues?

**A:** Contact directory:

**Technical Issues (login, errors, slow performance):**
- **Help Desk:** helpdesk@yourdomain.com
- **Phone:** 1-800-XXX-XXXX
- **Hours:** 24/7 for critical issues

**Clinical Questions (how to document, use features):**
- **Clinical Support:** clinicalsupport@yourdomain.com
- **Hours:** Monday-Friday, 8am-6pm

**Billing Questions (claims, payments, coding):**
- **Billing Support:** billing@yourdomain.com
- **Hours:** Monday-Friday, 9am-5pm

**Administrative (users, settings, configuration):**
- **Your Practice Administrator**
- **Admin Support:** admin@yourdomain.com

**Training (how to use the system):**
- **Training Department:** training@yourdomain.com
- **Live Training:** Monthly webinars
- **On-Demand:** Video library in Help section

---

### Q: Is there training available?

**A:** Multiple training resources:

**Documentation:**
- **USER_GUIDE.md:** Complete feature documentation
- **QUICK_START_USER_GUIDE.md:** 5-minute quick start
- **This FAQ:** 50+ common questions
- **VIDEO_TUTORIAL_SCRIPTS.md:** Video tutorial scripts

**Live Training:**
- **New User Orientation:** Monthly webinar for new staff
- **Advanced Features:** Quarterly deep-dive sessions
- **Office Hours:** Weekly Q&A sessions

**Self-Paced:**
- Video tutorials (10-15 minutes each)
- Interactive demos
- Practice environment for testing

**One-on-One:**
- Schedule with training coordinator
- Customized to your role and needs
- Remote or on-site

**Contact training@yourdomain.com to schedule.**

---

### Q: How do I request a new feature or report a bug?

**A:** Feedback process:

**Feature Requests:**
1. Navigate to **Help** → **Feature Request**
2. Describe desired feature
3. Explain use case (why needed)
4. Submit

**Or:**
- Email: features@yourdomain.com
- Include screenshots or mockups if helpful

**Bug Reports:**
1. Navigate to **Help** → **Report Bug**
2. Describe the problem
3. Provide steps to reproduce
4. Include screenshot of error
5. Submit

**Or:**
- Email: bugs@yourdomain.com
- Include browser version and OS

**Tracking:**
- You'll receive ticket number
- Updates sent via email
- Check status in portal

**Critical bugs addressed within 24 hours.**

---

### Q: Where can I find more help?

**A:** Additional resources:

**In-System Help:**
- Click **?** icon (top right)
- Context-sensitive help for each page
- Keyboard shortcuts: Press **?** key

**Documentation:**
- **Help** → **User Guide** (this document)
- **Help** → **Video Tutorials**
- **Help** → **FAQs**

**Community:**
- User forum (if available)
- Share tips with other practices
- Feature discussions

**Support Portal:**
- support.yourdomain.com
- Knowledge base articles
- Submit tickets
- Live chat (during business hours)

**Phone Support:**
- 1-800-XXX-XXXX
- 24/7 for urgent issues
- Business hours for general questions

---

### Q: What are the support hours?

**A:** Support availability:

**Critical Support (System Down):**
- **Available:** 24/7/365
- **Response Time:** 1 hour
- **Contact:** Call 1-800-XXX-XXXX

**High Priority (Major Feature Broken):**
- **Available:** Monday-Friday, 7am-7pm
- **Response Time:** 4 hours
- **Contact:** helpdesk@yourdomain.com or call

**Standard Support (Questions, Minor Issues):**
- **Available:** Monday-Friday, 8am-6pm
- **Response Time:** 24 hours
- **Contact:** support@yourdomain.com

**Training & Documentation:**
- **Available:** Self-service 24/7
- **Live Training:** Scheduled sessions
- **Contact:** training@yourdomain.com

---

**Still have questions?**

**Contact Support:**
- **Email:** support@yourdomain.com
- **Phone:** 1-800-XXX-XXXX
- **Portal:** support.yourdomain.com

**Or consult:**
- **USER_GUIDE.md:** Comprehensive feature documentation
- **ADMIN_GUIDE.md:** Administrator instructions
- **QUICK_START_USER_GUIDE.md:** Quick reference guide

---

**End of FAQ**

**Version 1.0** | **Last Updated:** December 29, 2025
