# Dermatology EHR System - User Guide

**Version 1.0**
**Last Updated:** December 29, 2025

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Patient Management](#patient-management)
3. [Scheduling & Calendar](#scheduling--calendar)
4. [Clinical Documentation](#clinical-documentation)
5. [Prescriptions](#prescriptions)
6. [Lab Management](#lab-management)
7. [Billing & Coding](#billing--coding)
8. [Telehealth](#telehealth)
9. [Communications](#communications)
10. [Reports & Analytics](#reports--analytics)

---

## Getting Started

### Logging In

1. **Access the System**
   - Open your web browser (Chrome, Firefox, Safari, or Edge)
   - Navigate to your practice's EHR URL
   - You will see the login screen

2. **Enter Your Credentials**
   - **Email:** Your practice email address
   - **Password:** Your secure password
   - **Tenant ID:** Your practice identifier (provided by your administrator)

3. **First-Time Login**
   - You will be prompted to change your password
   - Create a strong password with:
     - At least 8 characters
     - Mix of uppercase and lowercase letters
     - At least one number
     - At least one special character (@, #, $, etc.)

4. **Forgot Password?**
   - Click "Forgot Password" on the login screen
   - Enter your email address
   - Check your email for a password reset link
   - Follow the link and create a new password

### Dashboard Overview

After logging in, you'll see your **Dashboard** - your daily command center.

**Dashboard Components:**

1. **Today's Stats** (Top Cards)
   - **Patients Seen:** Number of completed visits today
   - **Appointments:** Total scheduled appointments
   - **Revenue:** Today's charges and collections
   - **Pending Tasks:** Items requiring your attention

2. **Upcoming Appointments**
   - Next 5 appointments on your schedule
   - Shows patient name, time, and appointment type
   - Click any appointment to view details

3. **Recent Activity**
   - New patient registrations
   - Lab results received
   - Messages requiring response
   - Claims submitted

4. **Quick Actions**
   - **New Patient:** Register a new patient
   - **Schedule Appointment:** Book a visit
   - **Create Note:** Document a visit
   - **Send Message:** Communicate with staff or patients

### Navigation Basics

**Main Navigation Bar** (Left Side)

The sidebar contains all major sections of the system:

- **Home:** Dashboard overview
- **Schedule:** Appointment calendar
- **Office Flow:** Track patient flow through office
- **Appt Flow:** Manage appointment statuses
- **Patients:** Patient records and search
- **Orders:** Lab and imaging orders
- **Rx:** Prescriptions and e-prescribing
- **Labs:** Lab results and pathology
- **Text Messages:** SMS communication with patients
- **Tasks:** To-do items and assignments
- **Mail:** Internal messaging
- **Documents:** Document management
- **Photos:** Clinical photography
- **Body Diagram:** Anatomical marking and tracking
- **Reminders:** Recalls and follow-ups
- **Analytics:** Reports and quality measures
- **Reports:** Custom reporting
- **Telehealth:** Virtual visits
- **Inventory:** Product management
- **Financials:** Billing and claims
- **Fee Schedules:** Pricing management
- **Quotes:** Treatment estimates
- **Audit Log:** Security and compliance tracking

**User Menu** (Top Right)

Click your name to access:
- **Profile:** Update your information
- **Settings:** Personal preferences
- **Keyboard Shortcuts:** View shortcuts (press ? key)
- **Logout:** Sign out of system

**Keyboard Shortcuts**

Press **?** (question mark) to view all keyboard shortcuts:
- **Ctrl+K:** Quick search
- **Ctrl+N:** New patient
- **Ctrl+S:** Save current form
- **Esc:** Close modal/dialog
- **Tab:** Navigate between fields

---

## Patient Management

### Adding New Patients

1. **Navigate to New Patient**
   - Click **Patients** in the sidebar
   - Click **+ New Patient** button
   - Or use shortcut: **Ctrl+N**

2. **Enter Demographics**

   **Required Fields:**
   - First Name
   - Last Name
   - Date of Birth
   - Gender
   - Phone Number

   **Optional but Recommended:**
   - Middle Name
   - Email Address
   - Social Security Number (for billing)
   - Address (street, city, state, ZIP)
   - Emergency Contact (name, relationship, phone)
   - Preferred Language
   - Race and Ethnicity (for quality reporting)

3. **Medical Record Number (MRN)**
   - System automatically generates a unique MRN
   - Cannot be changed after creation

4. **Save the Patient**
   - Click **Save Patient**
   - You'll be redirected to the patient's chart

### Searching for Patients

**Quick Search:**
1. Click the search bar at the top of the Patients page
2. Type any of the following:
   - Patient name (first or last)
   - Date of birth (MM/DD/YYYY)
   - Phone number
   - Medical record number (MRN)
   - Email address

3. Results appear as you type
4. Click a patient to open their chart

**Advanced Search:**
1. Click **Advanced Search** on the Patients page
2. Use multiple filters:
   - Age range
   - Insurance provider
   - Last visit date range
   - Provider
   - Diagnosis
   - Status (active/inactive)

3. Click **Search**
4. Export results to CSV if needed

### Updating Patient Demographics

1. **Open Patient Chart**
   - Search for and select the patient

2. **Edit Demographics**
   - Click **Edit** in the Demographics section
   - Update any field
   - Click **Save**

3. **Track Changes**
   - All demographic changes are automatically logged
   - View history in the Audit Log

### Managing Insurance Information

**Adding Insurance:**

1. **Navigate to Insurance Tab**
   - Open patient chart
   - Click **Insurance** tab

2. **Add Primary Insurance**
   - Click **+ Add Insurance**
   - Select insurance company from dropdown
   - Enter:
     - Policy Number
     - Group Number
     - Subscriber Name (if different from patient)
     - Subscriber Date of Birth
     - Relationship to Patient
     - Policy Start/End Dates

3. **Upload Insurance Card**
   - Click **Upload Card Image**
   - Scan or photograph front and back of card
   - Upload both images
   - System stores with patient record

4. **Add Secondary Insurance** (if applicable)
   - Repeat process for secondary coverage
   - System marks as "Secondary"

**Verifying Insurance:**

1. **Check Eligibility**
   - Click **Verify Coverage** button
   - System checks eligibility in real-time
   - Results show:
     - Active/Inactive status
     - Coverage effective dates
     - Copay amount
     - Deductible and remaining balance
     - Benefits available

2. **Document Verification**
   - Verification is automatically logged with timestamp
   - Re-verify every 30 days or before major procedures

**Updating Insurance:**

1. When patient brings new card:
   - Click **Edit** on existing insurance
   - Update policy/group numbers
   - Upload new card images
   - Save changes

2. Deactivating Old Insurance:
   - Set End Date on old policy
   - Insurance becomes inactive automatically

---

## Scheduling & Calendar

### Creating Appointments

**Quick Appointment:**

1. **Navigate to Schedule**
   - Click **Schedule** in sidebar
   - View shows current day by default

2. **Select Time Slot**
   - Click on any empty time slot
   - Appointment creation modal opens

3. **Enter Appointment Details**
   - **Patient:** Search and select patient (or create new)
   - **Appointment Type:** Select from dropdown
     - New Patient Consult (30 min)
     - Follow-up Visit (15 min)
     - Skin Check/Screening (30 min)
     - Procedure (45-60 min)
     - Cosmetic Consult (30 min)
   - **Provider:** Select treating physician
   - **Location:** Select office location
   - **Chief Complaint:** Brief reason for visit
   - **Notes:** Any special instructions

4. **Confirm Appointment**
   - Click **Save Appointment**
   - Appointment appears on calendar
   - Patient receives confirmation (if enabled)

**Appointment Types Explained:**

| Type | Duration | Description | Common Uses |
|------|----------|-------------|-------------|
| New Patient | 30 min | First-time patient visit | Initial consultation, full assessment |
| Follow-up | 15-20 min | Return visit for existing condition | Check progress, medication adjustments |
| Skin Check | 30 min | Full body skin examination | Annual screening, mole checks |
| Procedure | 45-60 min | Surgical or invasive procedure | Biopsies, excisions, cryotherapy |
| Cosmetic | 30 min | Aesthetic services | Botox, fillers, laser treatments |

### Managing Time Blocks

**What are Time Blocks?**
Time blocks reserve calendar time for non-patient activities.

**Creating a Time Block:**

1. **Click Block Time**
   - On the Schedule page, click **Block Time** button

2. **Select Block Type**
   - **Lunch:** Lunch break
   - **Meeting:** Staff or administrative meetings
   - **Admin:** Administrative time, paperwork
   - **Continuing Education:** Training or CME
   - **Out of Office:** Vacation, conferences, sick time
   - **Blocked:** General unavailable time

3. **Set Details**
   - **Provider:** Who is unavailable
   - **Start Time:** When block begins
   - **End Time:** When block ends
   - **Location:** Which office
   - **Recurrence:** (Optional) Repeat pattern
     - Daily
     - Weekly (select days of week)
     - Biweekly
     - Monthly

4. **Save Block**
   - Time appears on calendar with color coding
   - Prevents appointment booking during blocked time

**Color Coding:**
- Lunch: Amber/Orange
- Meeting: Blue
- Admin: Purple
- Continuing Education: Green
- Out of Office: Red
- Blocked: Gray

**Deleting Time Blocks:**
- Click on the time block
- Click **Delete**
- Confirms before removing

### Waitlist Management

**What is the Waitlist?**
Track patients who want earlier appointments when cancellations occur.

**Adding Patient to Waitlist:**

1. **Navigate to Waitlist**
   - Click **Schedule** > **Waitlist** tab

2. **Add to Waitlist**
   - Click **+ Add to Waitlist**
   - Select patient
   - Enter preferences:
     - Preferred provider
     - Preferred days/times
     - Appointment type needed
     - Earliest acceptable date
     - Latest acceptable date
     - Priority (Low, Normal, High)
     - Notes (reason for urgency)

3. **Save**
   - Patient added to waitlist
   - System tracks creation date

**Automatic Notifications:**

When an appointment is cancelled:
1. System scans waitlist for matches
2. Matches based on:
   - Provider preference
   - Time/day preference
   - Priority level
3. Automatically notifies matching patients via:
   - SMS text
   - Email
   - Patient portal message

**Manual Notifications:**

1. View waitlist
2. Select patient
3. Click **Notify Patient**
4. Choose notification method
5. Message sent immediately
6. Notification logged in patient record

**Managing Waitlist:**
- **View History:** See all notifications sent
- **Remove from Waitlist:** When patient scheduled
- **Update Priority:** Change urgency level
- **Edit Preferences:** Modify time/provider preferences

### Self-Scheduling Portal

**Patient Portal Self-Scheduling:**

Patients can book their own appointments online through the patient portal.

**How Patients Book:**

1. Patient logs into portal
2. Clicks **Book Appointment**
3. Selects:
   - Appointment type
   - Preferred provider (or "First Available")
   - Preferred date range
4. System shows available time slots
5. Patient selects time
6. Enters chief complaint
7. Confirms booking

**Staff Review:**

1. Self-scheduled appointments marked with indicator
2. Front desk reviews and confirms
3. Can modify time or details if needed
4. Patient receives confirmation email/SMS

**Configuring Self-Scheduling:**

(Admin only)
1. Go to **Settings** > **Scheduling**
2. Enable **Allow Patient Self-Scheduling**
3. Configure:
   - Which appointment types are bookable
   - How far in advance patients can book
   - Blackout dates
   - Minimum notice required
   - Auto-confirm or require staff approval

---

## Clinical Documentation

### Creating Encounters

**What is an Encounter?**
An encounter is the clinical note documenting a patient visit.

**Starting an Encounter:**

1. **From Patient Chart**
   - Open patient record
   - Click **Encounters** tab
   - Click **+ New Encounter**

2. **From Schedule**
   - Click on scheduled appointment
   - Click **Start Encounter**

3. **Quick Entry**
   - From Dashboard
   - Click **Quick Actions** > **Create Note**
   - Search for patient

**Encounter Details:**

- **Date of Service:** Date of visit (defaults to today)
- **Provider:** Treating physician
- **Location:** Office location
- **Appointment Type:** Type of visit
- **Chief Complaint:** Why patient came in today

### SOAP Notes

**SOAP Format:**

Clinical notes follow the SOAP structure:
- **S**ubjective (what patient tells you)
- **O**bjective (what you observe/measure)
- **A**ssessment (diagnosis)
- **P**lan (treatment)

**Subjective Section:**

1. **Chief Complaint (CC)**
   - Brief statement of why patient is here
   - Example: "Rash on left arm for 2 weeks"

2. **History of Present Illness (HPI)**
   - Detailed description of the problem
   - Include:
     - **Location:** Where is the problem?
     - **Duration:** How long has it been present?
     - **Onset:** Sudden or gradual?
     - **Character:** What does it look/feel like?
     - **Severity:** Mild, moderate, severe?
     - **Timing:** Constant or intermittent?
     - **Context:** What makes it better/worse?
     - **Associated Symptoms:** Other symptoms?
   - Example: "Started 2 weeks ago on left forearm, gradually worsening. Red, itchy patches that are worse at night. Tried over-the-counter hydrocortisone without improvement. No fever, no known exposure to allergens."

3. **Review of Systems (ROS)**
   - Checklist of body systems
   - Click checkboxes for pertinent positives/negatives
   - System auto-fills common responses
   - Categories:
     - Constitutional (fever, weight loss)
     - Eyes
     - ENT (ears, nose, throat)
     - Cardiovascular
     - Respiratory
     - Gastrointestinal
     - Genitourinary
     - Musculoskeletal
     - Skin (see HPI)
     - Neurological
     - Psychiatric
     - Endocrine
     - Hematologic/Lymphatic
     - Allergic/Immunologic

**Objective Section:**

1. **Vitals**
   - Auto-populated from MA entry
   - Blood Pressure
   - Heart Rate
   - Temperature
   - Weight
   - Height
   - BMI (calculated automatically)

2. **Physical Exam**
   - Document exam findings
   - Use templates or free text
   - Example: "Skin: 3cm erythematous patch on left forearm with fine scaling. No oozing, no crust. Surrounding skin normal. Dermoscopy shows fine scaling without vascular changes."

3. **Photos**
   - Link clinical photos
   - Click **Add Photo** to upload
   - Photos appear in note

4. **Body Diagram**
   - Mark location on body diagram
   - Click **Body Diagram** button
   - Click location on diagram
   - Add lesion details

**Assessment Section:**

1. **Diagnoses**
   - Search for ICD-10 codes
   - Click **Add Diagnosis**
   - Type condition name or ICD-10 code
   - Select from dropdown
   - Can add multiple diagnoses
   - Example: "L30.9 - Dermatitis, unspecified"

2. **Assessment Text**
   - Narrative assessment
   - Example: "Likely allergic contact dermatitis based on clinical presentation and dermoscopy findings. Will treat with topical corticosteroid and recommend patch testing if not improved."

**Plan Section:**

1. **Treatment Plan**
   - Document all planned actions
   - Include:
     - **Medications:** Prescriptions (links to Rx module)
     - **Procedures:** Biopsies, cryotherapy, etc.
     - **Labs:** Orders for testing
     - **Imaging:** Dermoscopy, photography
     - **Referrals:** Specialists
     - **Follow-up:** When to return
     - **Patient Education:** Instructions given

2. **Orders**
   - Orders created in note automatically link
   - Click **Add Order** to create:
     - Prescriptions
     - Lab orders
     - Procedures
     - Referrals

3. **Follow-up**
   - Specify return timeframe
   - Example: "Return in 2 weeks for re-evaluation. Call if worsening before then."

### Templates and Macros

**What are Templates?**
Pre-filled note formats for common visit types.

**Using Templates:**

1. **Select Template**
   - When creating new encounter
   - Click **Use Template**
   - Choose from dropdown:
     - Acne Visit
     - Skin Cancer Screening
     - Psoriasis Follow-up
     - Eczema Management
     - Cosmetic Consultation
     - Biopsy Procedure
     - Post-op Visit
     - And many more...

2. **Template Auto-fills**
   - HPI questions
   - ROS items
   - Common exam findings
   - Standard treatment plans

3. **Customize**
   - Edit any auto-filled content
   - Add patient-specific details
   - Delete irrelevant sections

**Creating Custom Templates:**

(Provider/Admin only)

1. **Navigate to Templates**
   - Click **Settings** > **Note Templates**

2. **Create New Template**
   - Click **+ New Template**
   - Enter:
     - Template Name
     - Appointment Type (associated visit type)
     - Specialty (Dermatology, Cosmetic, etc.)

3. **Build Template**
   - Add sections for each SOAP component
   - Use placeholders: {patientName}, {age}, {gender}
   - Include common diagnoses
   - Pre-fill typical plans

4. **Save Template**
   - Available for all providers
   - Can be edited or deactivated

**Macros (Text Shortcuts):**

Macros are text shortcuts that expand to full phrases.

**Using Macros:**
1. Type shortcode (e.g., `.acne`)
2. Press Tab or Space
3. Expands to full text
4. Example: `.acne` → "Patient presents with inflammatory acne vulgaris on face and upper back"

**Common Macros:**
- `.normal` → "Physical examination normal for age and gender"
- `.rosacea` → "Facial erythema and telangiectasia consistent with rosacea"
- `.bcc` → "Clinical appearance concerning for basal cell carcinoma, biopsy recommended"
- `.fu2w` → "Follow-up in 2 weeks for reassessment"
- `.fu6w` → "Follow-up in 6 weeks to evaluate treatment response"

### Ambient AI Scribe Usage

**What is Ambient AI Scribe?**
AI-powered transcription and documentation assistance that listens to patient conversations and drafts clinical notes.

**Starting a Scribe Session:**

1. **Open Encounter**
   - Start or open existing encounter

2. **Enable Scribe**
   - Click **Start Scribe** button
   - Patient consent popup appears

3. **Obtain Patient Consent**
   - Read consent statement to patient
   - "This visit will be recorded and transcribed by AI for documentation purposes. Do you consent?"
   - Patient must verbally agree
   - Click **Patient Consented**
   - Recording begins

4. **Conduct Visit Normally**
   - Speak naturally with patient
   - AI listens and transcribes in real-time
   - Focus on patient, not computer

5. **Stop Recording**
   - When visit complete, click **Stop Scribe**
   - AI processes conversation (10-30 seconds)

**AI Draft Note:**

After processing:
1. **Review Draft**
   - AI generates SOAP note from conversation
   - Extracts:
     - Chief Complaint
     - HPI details
     - ROS mentions
     - Exam findings discussed
     - Assessment and plan

2. **Edit as Needed**
   - Review for accuracy
   - Add missing details
   - Correct any errors
   - AI is 90-95% accurate but requires review

3. **Accept Draft**
   - Click **Accept Draft**
   - AI content populates note fields
   - Add diagnoses and complete orders

**Best Practices:**
- Speak clearly and audibly
- Mention key details explicitly ("I see a 2cm lesion on the left forearm")
- State diagnoses ("This appears to be allergic contact dermatitis")
- Verbalize plan ("I'm prescribing triamcinolone cream")
- Review and edit before signing

**Privacy and Compliance:**
- All recordings encrypted
- Auto-deleted after 30 days
- HIPAA compliant
- Patient consent required and documented

### E-Signatures

**Signing Notes:**

1. **Complete Note**
   - Ensure all sections filled
   - Add diagnoses and orders
   - Review for accuracy

2. **Sign Note**
   - Click **Sign Note** button
   - Confirmation popup appears
   - Review note summary
   - Click **Sign**

3. **Locked Status**
   - Signed notes cannot be edited
   - Status changes to "Signed"
   - Only addendums can be added

**Addendums:**

If you need to add to a signed note:

1. **Open Signed Note**
   - Navigate to encounter
   - Note shows "Signed" status

2. **Add Addendum**
   - Click **Add Addendum**
   - Enter additional information
   - Example: "Addendum: Patient called back to report worsening symptoms. Advised to come in tomorrow for re-evaluation."

3. **Save Addendum**
   - Addendum timestamped and attributed to you
   - Appears below original note
   - Original note remains locked

**Legal Importance:**
- Signed notes are legal medical records
- Cannot be altered after signing
- Addendums maintain integrity
- All changes tracked in audit log

---

## Prescriptions

### E-Prescribing Workflow

**Creating a Prescription:**

1. **From Encounter**
   - During patient visit
   - In Plan section, click **Add Prescription**

2. **From Patient Chart**
   - Click **Rx** tab
   - Click **+ New Prescription**

3. **Search Medication**
   - Type medication name
   - Suggestions appear as you type
   - Select correct medication
   - Choose strength/formulation

**Common Dermatology Medications:**

| Category | Examples |
|----------|----------|
| **Topical Steroids** | Triamcinolone, Clobetasol, Hydrocortisone |
| **Topical Retinoids** | Tretinoin, Adapalene, Tazarotene |
| **Oral Antibiotics** | Doxycycline, Minocycline, Cephalexin |
| **Topical Antibiotics** | Clindamycin, Erythromycin, Mupirocin |
| **Antifungals** | Fluconazole, Ketoconazole, Terbinafine |
| **Immunosuppressants** | Methotrexate, Cyclosporine |
| **Biologics** | Dupixent (dupilumab), Humira (adalimumab) |

**Prescription Details:**

1. **Medication Information**
   - Medication name
   - Strength (e.g., 0.1%, 100mg)
   - Form (cream, tablet, capsule)

2. **Directions (Sig)**
   - **Quantity:** How much to dispense (e.g., 60g, 30 tablets)
   - **Dosage:** How much to take (e.g., "Apply twice daily", "Take 1 tablet by mouth")
   - **Frequency:** How often (BID = twice daily, QD = once daily, TID = three times daily)
   - **Route:** How to use (topical, oral, injection)
   - **Duration:** How long (e.g., "for 2 weeks", "for 30 days")

3. **Refills**
   - Number of refills allowed (0-12)
   - Controlled substances limited by law

4. **Substitution**
   - Allow generic substitution (cheaper)
   - Or "Dispense as Written" (brand name only)

5. **Special Instructions**
   - Additional patient instructions
   - Example: "Apply to affected area. Avoid face. Wash hands after use."

**E-Prescribe to Pharmacy:**

1. **Select Pharmacy**
   - Click **Select Pharmacy**
   - Search by:
     - Patient's preferred pharmacy (saved in chart)
     - Nearby pharmacies (location-based)
     - Pharmacy name or chain
     - City/ZIP code
     - NCPDP ID

2. **Review Pharmacy Details**
   - Name and address
   - Phone and fax
   - Hours of operation
   - Distance from patient

3. **Send Prescription**
   - Review all details
   - Click **Send to Pharmacy**
   - Transmits electronically via NCPDP network
   - Confirmation within seconds
   - 95% success rate

4. **Transmission Status**
   - **Sent:** Successfully transmitted
   - **Delivered:** Pharmacy received
   - **Failed:** Transmission error (call pharmacy)

**Alternative: Print Prescription:**
- If e-prescribe unavailable
- Click **Print** instead of Send
- Give paper Rx to patient
- Less secure, slower, but always works

### Medication History

**Viewing Patient Rx History:**

1. **Open Patient Chart**
   - Navigate to patient record
   - Click **Rx** tab or **Medications** section

2. **Rx History Shows:**
   - All prescriptions from all pharmacies
   - Imported via Surescripts network
   - Includes:
     - Medication name and strength
     - Prescribing provider
     - Pharmacy dispensed
     - Date filled
     - Quantity dispensed
     - Days supply
     - Refills remaining

3. **Import Updated History**
   - Click **Import from Surescripts**
   - Fetches latest data from pharmacy network
   - Updates within seconds
   - Shows medications filled at any pharmacy

**Uses for Rx History:**
- Verify medication compliance
- Check for drug interactions
- See what other providers prescribed
- Identify pharmacy shopping (controlled substances)
- Reconcile medication list

### Pharmacy Search

**Finding Pharmacies:**

1. **Search Methods**
   - **By Name:** Type pharmacy name (e.g., "CVS", "Walgreens")
   - **By Location:** Enter city, state, or ZIP
   - **Nearby:** Use patient's address to find closest
   - **Chain:** Filter by pharmacy chain
   - **NCPDP:** Lookup by NCPDP identifier

2. **Search Results Show:**
   - Pharmacy name
   - Full address
   - Phone and fax numbers
   - Distance from patient (if location-based search)
   - Hours of operation
   - Capabilities (new Rx, refills, specialty)

3. **Select Pharmacy**
   - Click on pharmacy to select
   - Save as patient's preferred pharmacy
   - System remembers for future prescriptions

**Pharmacy Chains Available:**
- CVS Pharmacy
- Walgreens
- Walmart Pharmacy
- Rite Aid
- Kroger Pharmacy
- Publix Pharmacy
- Target Pharmacy
- Costco Pharmacy
- Sam's Club Pharmacy
- Independent pharmacies

### Controlled Substances

**Special Rules for Controlled Substances:**

**What are Controlled Substances?**
Medications with abuse potential, regulated by DEA.

**Common Dermatology Controlled Substances:**
- Schedule III: Testosterone (for hair loss)
- Schedule IV: Ativan (for anxiety before procedures)
- Schedule V: Some cough medications with codeine

**E-Prescribing Controlled Substances:**

1. **DEA Registration Required**
   - Provider must have active DEA number
   - DEA EPCS (Electronic Prescribing for Controlled Substances) approval
   - Two-factor authentication enabled

2. **Enhanced Security**
   - When prescribing controlled substance
   - System prompts for two-factor authentication
   - Enter password
   - Enter code from authenticator app
   - Required by federal law

3. **Limitations**
   - Maximum 30-day supply
   - Limited refills (varies by schedule)
   - Schedule II: No refills, new Rx each time
   - Patient identity verification required at pharmacy

4. **State PDMP Integration**
   - System checks Prescription Drug Monitoring Program
   - Shows patient's controlled substance history
   - Identifies potential abuse or pharmacy shopping
   - Required in most states before prescribing

**Best Practices:**
- Only prescribe when medically necessary
- Document indication in note
- Check PDMP every time
- Limit quantities
- Schedule regular follow-ups
- Watch for red flags (early refills, lost prescriptions)

---

## Lab Management

### Ordering Labs

**Creating a Lab Order:**

1. **From Encounter**
   - During visit, in Plan section
   - Click **Add Order**
   - Select **Laboratory**

2. **From Patient Chart**
   - Open patient record
   - Click **Orders** tab
   - Click **+ New Order**
   - Select **Laboratory**

3. **Select Lab Type**
   - **Skin Biopsy:** Most common in dermatology
   - **Blood Tests:** For medication monitoring
   - **Patch Testing:** Allergy identification
   - **Fungal Culture:** For suspected fungal infections
   - **Bacterial Culture:** For infected lesions

**Skin Biopsy Order:**

1. **Biopsy Details**
   - **Procedure Type:** Punch, shave, or excisional
   - **Location:** Where on body (use body diagram)
   - **Size:** Lesion size in mm or cm
   - **Clinical Impression:** Suspected diagnosis
   - **Special Stains:** If needed (immunofluorescence, etc.)

2. **Lab Information**
   - **Pathology Lab:** Select preferred dermatopathology lab
   - **Priority:** Routine or STAT
   - **Special Instructions:** Additional details

3. **Link to Clinical**
   - Associate with photo (if taken)
   - Mark on body diagram
   - Link to encounter note

4. **Submit Order**
   - Order saved and sent to lab
   - Specimen label prints (if integrated)
   - Tracking number generated

**Blood Test Orders:**

Common blood tests in dermatology:

| Test | Indication |
|------|-----------|
| **CBC** | Monitor methotrexate, cyclosporine |
| **CMP** | Liver and kidney function |
| **Lipid Panel** | Monitor isotretinoin (Accutane) |
| **Pregnancy Test** | Required before isotretinoin |
| **ANA** | Autoimmune screening |
| **Hepatitis Panel** | Before immunosuppressants |

1. **Select Tests**
   - Check boxes for desired tests
   - Can order multiple at once

2. **Order Details**
   - **Diagnosis:** ICD-10 code (required for insurance)
   - **Clinical Notes:** Why test is needed
   - **Frequency:** One-time or recurring (monthly, etc.)

3. **Lab Selection**
   - Choose lab facility
   - Patient can go to any location in network

4. **Submit**
   - Order sent electronically to lab
   - Patient receives requisition

### Using Order Sets

**What are Order Sets?**
Pre-configured groups of commonly ordered tests.

**Common Dermatology Order Sets:**

1. **Isotretinoin Monitoring**
   - CBC
   - CMP (liver function)
   - Lipid panel
   - Pregnancy test (females)
   - Ordered monthly during treatment

2. **Biologics Baseline**
   - CBC
   - CMP
   - Hepatitis B/C screening
   - TB test (QuantiFERON)
   - Ordered before starting biologic therapy

3. **Methotrexate Monitoring**
   - CBC with platelets
   - CMP
   - Ordered every 3 months

**Using Order Sets:**

1. **Select Order Set**
   - Click **Use Order Set**
   - Choose from dropdown
   - All tests auto-populate

2. **Customize if Needed**
   - Add or remove individual tests
   - Adjust frequency
   - Modify diagnoses

3. **Submit**
   - All orders created at once
   - Saves time vs. individual ordering

**Creating Custom Order Sets:**

(Admin/Provider only)

1. Navigate to **Settings** > **Order Sets**
2. Click **+ New Order Set**
3. Name the set (e.g., "Psoriasis Baseline")
4. Add tests
5. Save for practice-wide use

### Reviewing Results

**Receiving Lab Results:**

1. **Notification**
   - Dashboard shows "New Results" badge
   - Email notification sent (if enabled)
   - Labs page shows "Pending Results" count

2. **Navigate to Results**
   - Click **Labs** in sidebar
   - Or click notification
   - Results listed by date received

3. **Review Result**
   - Click on result to open
   - Shows:
     - Patient name
     - Test name
     - Result value
     - Reference range (normal values)
     - Flag (High, Low, Critical)
     - Result date
     - Ordering provider

**Normal vs. Abnormal Results:**

- **Normal:** Value within reference range, no flag
- **Abnormal:** Flagged as High (H) or Low (L)
- **Critical:** Life-threatening value, flagged as CRITICAL
  - System sends urgent alert
  - Requires immediate action

**Acting on Results:**

1. **Review and Sign**
   - Click **Review** button
   - Add interpretation note
   - Example: "CBC normal. Continue current therapy."
   - Click **Sign**
   - Marks result as reviewed

2. **Notify Patient**
   - Click **Notify Patient**
   - Choose method:
     - Phone call (log in task)
     - Portal message
     - Text message
   - Document notification

3. **Create Follow-up Actions**
   - If abnormal:
     - Create task for follow-up testing
     - Schedule appointment
     - Adjust medications
     - Refer to specialist

**Pathology Results:**

Biopsy results require special attention:

1. **Received from Lab**
   - Full pathology report uploaded
   - PDF viewable in system

2. **Review Diagnosis**
   - Pathologist's interpretation
   - Histologic findings
   - Final diagnosis

3. **Common Diagnoses:**
   - **Benign:** Seborrheic keratosis, nevus, dermatitis
   - **Pre-cancerous:** Actinic keratosis
   - **Malignant:** Basal cell carcinoma, squamous cell carcinoma, melanoma

4. **Action Required:**
   - If benign: Notify patient, reassure
   - If pre-cancerous: Schedule treatment
   - If malignant: Schedule excision/Mohs surgery, refer oncology if melanoma

5. **Document in Note**
   - Add diagnosis to patient problem list
   - Create treatment plan
   - Schedule follow-up

### Trend Analysis

**Viewing Lab Trends:**

For chronic conditions requiring regular monitoring:

1. **Open Lab Trends**
   - From patient chart
   - Click **Labs** tab
   - Select **Trend View**

2. **Select Tests to Track**
   - Choose test (e.g., "ALT" for liver function)
   - Can select multiple tests

3. **View Graph**
   - Line graph shows values over time
   - X-axis: Date
   - Y-axis: Value
   - Reference range shaded
   - Abnormal values highlighted

4. **Interpret Trends**
   - **Stable:** Values consistent over time
   - **Improving:** Moving toward normal
   - **Worsening:** Moving away from normal
   - **Fluctuating:** Inconsistent results

**Use Cases:**
- Methotrexate monitoring: Track liver enzymes
- Isotretinoin: Monitor lipids and liver
- Biologics: Watch WBC counts
- Chronic conditions: Long-term disease markers

### Dermatopathology

**Working with Dermatopathology Labs:**

Dermatopathology is specialized pathology for skin biopsies.

**Preferred Dermatopathology Labs:**

Set up in **Settings** > **Lab Facilities**:
- Main dermatopathology partner
- Backup labs
- Mohs surgery pathology
- Special stains capabilities

**Ordering Dermatopathology:**

1. **Perform Biopsy**
   - Document in encounter
   - Mark on body diagram
   - Take clinical photo

2. **Create Order**
   - Link to encounter
   - Include clinical impression
   - Request special stains if needed:
     - PAS (fungal)
     - GMS (fungal)
     - Direct immunofluorescence (autoimmune)

3. **Specimen Handling**
   - Label specimen container
   - Include patient name, DOB, MRN
   - Include site/location
   - Send to lab with requisition

4. **Track Status**
   - Order status shows:
     - Received by lab
     - In process
     - Results ready

5. **Review and Act**
   - Detailed pathology report
   - Diagnosis and recommendations
   - Create follow-up plan

**Turnaround Times:**
- Routine: 3-7 business days
- STAT: 24-48 hours (extra fee)
- Special stains: Add 2-3 days
- Immunofluorescence: Add 3-5 days

---

## Billing & Coding

### Encounter Billing

**How Billing Works:**

When you complete a clinical note, charges are automatically generated based on:
1. **CPT Codes:** What you did (office visit, procedure)
2. **ICD-10 Codes:** Why you did it (diagnosis)
3. **Linkage:** CPT must be linked to at least one ICD-10

**Automatic Charge Capture:**

1. **During Encounter**
   - As you document the visit
   - System suggests appropriate CPT codes based on:
     - Appointment type
     - Time spent
     - Complexity
     - Procedures performed

2. **Review Charges**
   - In encounter, click **Billing** tab
   - Shows suggested codes:
     - Office visit code (99201-99215)
     - Procedure codes (if applicable)
     - Modifiers (if needed)

3. **Adjust if Needed**
   - Change visit level if complexity differs
   - Add missed procedures
   - Remove incorrect codes

**Office Visit Codes (E/M):**

| Code | Patient Type | Complexity | Typical Time |
|------|--------------|------------|--------------|
| 99201 | New | Straightforward | 10 min |
| 99202 | New | Low | 20 min |
| 99203 | New | Moderate | 30 min |
| 99204 | New | Moderate-High | 45 min |
| 99205 | New | High | 60 min |
| 99211 | Established | Minimal | 5 min |
| 99212 | Established | Straightforward | 10 min |
| 99213 | Established | Low-Moderate | 15 min |
| 99214 | Established | Moderate | 25 min |
| 99215 | Established | High | 40 min |

**Common Dermatology Procedure Codes:**

| CPT | Description | Typical Use |
|-----|-------------|-------------|
| 11100 | Skin biopsy, first lesion | Initial biopsy |
| 11101 | Skin biopsy, each additional | Multiple biopsies |
| 11200 | Removal of skin tag, first 15 | Skin tag removal |
| 17000 | Destruction of pre-malignant lesion, first | Actinic keratosis |
| 17003 | Destruction, each additional (2-14) | Multiple AKs |
| 17110 | Destruction, benign lesion, <14 | Wart treatment |
| 11400-11446 | Excision benign lesion | Mole removal |
| 11600-11646 | Excision malignant lesion | Skin cancer |
| 96900-96999 | Phototherapy codes | UVB/PUVA treatment |

### Superbills

**What is a Superbill?**
A summary document listing all services provided and diagnoses, used for billing.

**Generating a Superbill:**

1. **From Encounter**
   - After completing note
   - Click **Generate Superbill**

2. **Superbill Contents**
   - Patient demographics
   - Provider information
   - Date of service
   - CPT codes and charges
   - ICD-10 codes
   - Total charges
   - Patient responsibility (copay, deductible)

3. **Review Accuracy**
   - Verify all codes present
   - Check diagnosis linkage
   - Confirm charges correct

4. **Print or Export**
   - Print for patient
   - Export to PDF
   - Email to patient
   - Send to billing department

**Customizing Superbills:**

(Admin only)

1. Navigate to **Settings** > **Superbill Templates**
2. Customize:
   - Practice logo and information
   - Common procedure codes
   - Layout and format
   - What information displays

### Claims Submission

**Creating a Claim:**

Claims are automatically created from encounter charges.

1. **Claim Draft**
   - When encounter signed, claim created
   - Status: "Draft"
   - Appears in Financials > Claims tab

2. **Claim Scrubbing**
   - System checks for errors:
     - Missing diagnosis
     - Invalid code combinations
     - Missing patient insurance
     - Incorrect patient demographics
     - Missing authorization (if required)
   - Errors flagged in red
   - Fix errors before submitting

3. **Ready to Submit**
   - All errors resolved
   - Status changes to "Ready"
   - Green checkmark indicator

**Submitting to Insurance:**

1. **Batch Submission**
   - Go to **Financials** > **Claims**
   - Select multiple claims (checkbox)
   - Click **Submit Selected**
   - Or submit individually

2. **Electronic Submission**
   - Claims sent via clearinghouse
   - Electronic claim format (837)
   - Transmitted securely
   - Confirmation within minutes

3. **Submission Status**
   - **Accepted:** Clearinghouse accepted claim
   - **Rejected:** Errors found, fix and resubmit
   - **Pending:** Waiting for insurance to process
   - **Paid:** Payment received
   - **Denied:** Insurance denied claim

4. **Track Status**
   - Claim timeline shows:
     - Created date
     - Submitted date
     - Accepted date
     - Paid/denied date
   - Check status button for real-time updates

### Clearinghouse Integration

**What is a Clearinghouse?**
An intermediary that routes claims from your practice to insurance companies.

**Benefits:**
- One connection to reach all insurances
- Claim scrubbing and validation
- Electronic remittance advice (ERA)
- Real-time eligibility checking
- Claims tracking

**Clearinghouse Functions:**

1. **Claims Submission**
   - Submit claims to clearinghouse
   - Clearinghouse routes to correct payer
   - Faster than mailing paper claims

2. **ERA (Electronic Remittance Advice)**
   - Electronic explanation of benefits
   - Shows payment details:
     - Amount billed
     - Amount allowed
     - Amount paid
     - Patient responsibility
     - Adjustment reason codes

3. **Auto-posting Payments**
   - ERA can auto-post to claims
   - Click **Post ERA**
   - Payments automatically applied
   - Saves manual entry time

4. **EFT (Electronic Funds Transfer)**
   - Direct deposit of insurance payments
   - Linked to ERA
   - Automatic reconciliation
   - Faster cash flow

**Using Clearinghouse Features:**

1. **Submit Claims**
   - Covered above in Claims Submission

2. **View ERA**
   - Navigate to **Clearinghouse** page
   - Click **ERA** tab
   - List of all remittance advice received
   - Click to view details

3. **Post ERA**
   - Select ERA
   - Click **Post to Claims**
   - System matches ERA to claims
   - Payments auto-posted
   - Claim status updated

4. **View EFT**
   - Click **EFT** tab
   - Shows all electronic deposits
   - Amount and date
   - Link to corresponding ERA

5. **Reconcile Payments**
   - Click **Reconciliation** tab
   - Matches ERA to EFT
   - Flags variances:
     - ERA says $500 paid, but EFT shows $480
     - Investigate discrepancy
   - Mark as reconciled when resolved

### Payment Posting

**Manual Payment Posting:**

For checks or cash payments:

1. **Navigate to Payments**
   - Go to **Financials** > **Patient Payments** or **Payer Payments**

2. **Post Payment**
   - Click **+ Post Payment**
   - Enter:
     - Patient or Insurance Company
     - Payment Date
     - Amount
     - Payment Method (check, cash, card)
     - Check number (if applicable)

3. **Apply to Claims**
   - Select claim(s) to apply payment
   - Enter amount for each claim
   - System calculates patient balance

4. **Save Payment**
   - Payment recorded
   - Claim balance updated
   - Patient statement reflects payment

**Copay Collection:**

1. **At Check-in**
   - Front desk collects copay
   - Go to patient chart
   - Click **Collect Payment**
   - Enter copay amount
   - Select payment method
   - Print receipt

2. **Links to Claim**
   - When claim created, copay already on account
   - Applied to patient responsibility
   - Reduces patient balance

**Batch Payment Posting:**

For posting multiple payments at once:

1. **Navigate to Batches**
   - Go to **Financials** > **Batches**

2. **Create Batch**
   - Click **+ New Batch**
   - Enter batch name (e.g., "Blue Cross ERA 12/15/2025")
   - Enter total expected amount

3. **Add Payments**
   - Add each payment from ERA
   - Link to corresponding claim
   - Enter adjustments and reasons

4. **Balance Batch**
   - Total entered payments must equal batch total
   - System shows variance
   - Find and fix discrepancies

5. **Close Batch**
   - When balanced, click **Close Batch**
   - All payments posted
   - Batch locked (cannot edit)

---

## Telehealth

### Starting Video Visits

**What is Telehealth?**
Virtual medical visits conducted via secure video conferencing.

**Use Cases:**
- Follow-up visits that don't require physical exam
- Prescription refills
- Reviewing lab results
- Post-procedure check-ins
- Consultations for minor skin concerns

**Scheduling Telehealth:**

1. **Create Telehealth Appointment**
   - On Schedule page, create appointment
   - Select **Appointment Type: Telehealth**
   - Choose provider and time
   - Enter patient phone and email
   - Save appointment

2. **System Actions**
   - Generates unique meeting link
   - Sends link to patient via:
     - Email
     - SMS text
     - Patient portal
   - Sends reminder 1 hour before visit

**Conducting a Telehealth Visit:**

1. **Provider Preparation**
   - 5 minutes before appointment time
   - Go to **Telehealth** page
   - See list of scheduled telehealth visits
   - Your next visit highlighted

2. **Start Visit**
   - Click **Start Visit** button
   - Video window opens
   - System shows "Waiting for patient"
   - Patient sees virtual waiting room

3. **Patient Joins**
   - Patient clicks link from email/text
   - Enters virtual waiting room
   - Provider sees "Patient Ready" notification
   - Click **Admit Patient**

4. **Video Consultation**
   - Video and audio activated
   - Full-screen or windowed mode
   - Can minimize to access patient chart
   - Use screen share to show:
     - Lab results
     - Photos
     - Educational materials

5. **During Visit**
   - Document in encounter note (same as in-office)
   - Can e-prescribe
   - Can order labs
   - Can schedule follow-up

6. **End Visit**
   - Click **End Visit**
   - Both disconnected
   - Complete encounter note
   - Sign and bill as telehealth visit (use modifier -95 or GT)

### Waiting Room

**Virtual Waiting Room Features:**

1. **Patient Experience**
   - Branded waiting room with practice logo
   - "Please wait, the provider will see you shortly"
   - Can test audio/video before admission
   - Estimated wait time shown

2. **Provider Control**
   - See all patients in waiting room
   - Admit in order or select specific patient
   - Can send message to waiting patient
   - Example: "Running 5 minutes late, thank you for waiting"

3. **Queue Management**
   - Multiple patients can wait
   - Provider sees list:
     - Patient name
     - Appointment time
     - Wait duration
   - Admit patients one at a time

**Best Practices:**
- Join waiting room 2-3 minutes before scheduled time
- Test audio/video before first patient
- Keep waiting times minimal
- Communicate delays proactively

### Recording and Notes

**Recording Telehealth Visits:**

(Optional feature, requires patient consent)

1. **Enable Recording**
   - Before admitting patient
   - Click **Record Visit** toggle
   - Patient sees consent notice when joining
   - Patient must click "I Consent" to proceed

2. **Recording Stored**
   - Video saved securely
   - Encrypted storage
   - Auto-deleted after 30 days (configurable)
   - Accessible from encounter record

3. **Uses for Recording**
   - Review complex cases
   - Training purposes
   - Dispute resolution
   - Documentation support

**Note Documentation:**

1. **During Visit**
   - Use split-screen mode
   - Video on one side, chart on other
   - Type notes as you talk
   - Or use voice-to-text

2. **After Visit**
   - Complete encounter note
   - Include "Telehealth" designation
   - Document:
     - Patient location (state) - required for licensure compliance
     - Technology used
     - Any technical issues
     - Visit reason and findings

3. **Telehealth-Specific Billing**
   - Use same CPT codes as in-office
   - Add modifier: **-95** (synchronous telemedicine)
   - Or modifier: **GT** (via telehealth)
   - Document time and medical necessity
   - Some insurances have different telehealth rates

**Compliance Notes:**
- Provider must be licensed in patient's state
- Patient must consent to telehealth
- Document consent in note
- Follow state telehealth laws
- HIPAA-compliant video platform required

---

## Communications

### Text Messaging

**SMS Communication with Patients:**

The Text Messages feature allows HIPAA-compliant texting with patients.

**Accessing Text Messages:**

1. Navigate to **Text Messages** in sidebar
2. Four tabs available:
   - **Messages:** One-on-one conversations
   - **Templates:** Reusable message templates
   - **Bulk Send:** Send to multiple patients
   - **Scheduled:** Schedule future messages

**Sending a Text Message:**

1. **Messages Tab**
   - Click patient from list (left sidebar)
   - Or search for patient
   - Conversation opens on right

2. **Compose Message**
   - Type in message box
   - Use template button for quick messages
   - Character count shown (160 chars = 1 SMS)
   - Multiple SMS segments if longer

3. **Send**
   - Press Enter or click Send
   - Message appears in conversation
   - Status indicators:
     - ✓ Sent
     - ✓✓ Delivered
     - ✗ Failed

4. **Receive Reply**
   - Patient's reply appears in conversation
   - Real-time updates (polls every 5 seconds)
   - Unread badge on patient list

**Message Templates:**

**Using Templates:**

1. **Templates Tab**
   - View all saved templates
   - Organized by category:
     - Appointment Reminder
     - Follow-up
     - Instructions
     - Education
     - General

2. **Insert Template**
   - In Messages tab, click **Template** button
   - Select from dropdown
   - Template text inserts
   - Variables auto-replaced:
     - {firstName} → Patient's first name
     - {lastName} → Patient's last name
     - {providerName} → Your name
     - {clinicPhone} → Practice phone number

3. **Example Templates:**
   - "Hi {firstName}, this is a reminder of your appointment tomorrow at 2pm with Dr. Smith. Reply C to confirm."
   - "Your lab results are ready. Please call us at {clinicPhone} to discuss."
   - "Apply the medication twice daily to affected areas. Call if any questions."

**Creating Templates:**

1. Click **+ New Template**
2. Enter:
   - Template Name
   - Category
   - Message Body (use variables)
3. Save
4. Available for all staff

**Bulk Messaging:**

**Sending to Multiple Patients:**

1. **Bulk Send Tab**
   - Shows patient selection panel

2. **Select Recipients**
   - Check boxes next to patient names
   - Or use filters to select group:
     - All patients with appointments tomorrow
     - All patients on certain medication
     - All patients due for annual screening
   - Selected count shows at top

3. **Compose Message**
   - Type message or use template
   - Variables personalized per patient
   - Preview shows example

4. **Send Options**
   - **Send Now:** Immediate delivery
   - **Schedule:** Send at specific date/time

5. **Send**
   - Click **Send Bulk SMS**
   - Confirm
   - System sends to all selected patients
   - Results show:
     - Total sent
     - Failed count
     - Opt-outs excluded

**Scheduled Messages:**

**Scheduling Future Messages:**

1. **Scheduled Tab**
   - View all scheduled messages

2. **Create Scheduled Message**
   - Click **+ Schedule Message**
   - Select patient(s)
   - Compose message
   - Select date and time
   - Optional: Set recurrence:
     - Daily
     - Weekly
     - Monthly
     - Custom

3. **Recurring Campaigns**
   - Example: Monthly medication reminder
   - Set recurrence pattern
   - Set end date (or indefinite)
   - System sends automatically

4. **Manage Scheduled**
   - View upcoming scheduled messages
   - Edit or cancel before sending
   - View history of sent scheduled messages

**Compliance and Opt-Out:**

1. **Patient Consent**
   - Patients must opt-in to receive texts
   - Checkbox on patient registration form
   - Can opt-out anytime

2. **Opt-Out Process**
   - Patient replies "STOP"
   - System auto-marks patient as opted out
   - No more texts sent to that patient
   - Can opt back in by replying "START"

3. **HIPAA Compliance**
   - All texts encrypted
   - Sent via secure Twilio integration
   - Audit log tracks all messages
   - Cannot send unencrypted PHI

**Best Practices:**
- Keep messages brief and professional
- Don't send sensitive medical information
- Use for appointment reminders, general instructions
- Respect quiet hours (not before 8am or after 8pm)
- Monitor opt-out rates

### Fax Management

**Sending and Receiving Faxes:**

**Inbox (Received Faxes):**

1. **Navigate to Fax**
   - Click **Documents** > **Fax** tab
   - Or dedicated **Fax** link (if configured)

2. **Inbox Shows:**
   - All received faxes
   - Unread count badge
   - Filter by:
     - Status (unread, assigned, all)
     - Date range
     - Patient (if assigned)

3. **Review Fax**
   - Click on fax to open
   - PDF preview displays
   - Shows:
     - From phone number
     - Pages received
     - Date/time received
     - Subject (if detectable)

4. **Process Fax**
   - **Assign to Patient:**
     - Click **Assign to Patient**
     - Search for patient
     - Select patient
     - Fax moves to patient's Documents tab
   - **Add Notes:**
     - Click **Add Note**
     - Type note (e.g., "Lab result - normal")
   - **Mark as Read:**
     - Automatically marked when opened
     - Or manually toggle read/unread

5. **Delete Fax**
   - If spam or wrong number
   - Click **Delete**
   - Permanently removed

**Outbox (Sent Faxes):**

1. **Sending a Fax**
   - Click **Send Fax** button
   - Enter:
     - **To:** Recipient fax number
     - **From:** Your practice fax number
     - **Subject:** Brief description
     - **Cover Page:** Optional checkbox
     - **Patient:** Link to patient (optional)
     - **Attachment:** Upload document or select from chart

2. **Cover Page**
   - Auto-generated with practice letterhead
   - Includes:
     - To/From information
     - Number of pages
     - Subject
     - Confidentiality notice

3. **Send**
   - Click **Send Fax**
   - System transmits via internet fax service
   - Takes 1-2 minutes
   - Status updates:
     - Sending
     - Sent (successfully received)
     - Failed (number busy, no answer, error)

4. **Track Sent Faxes**
   - Outbox shows all sent faxes
   - Transmission status
   - Confirmation ID
   - Can resend if failed

**Common Fax Uses:**
- Receive lab results
- Receive insurance authorizations
- Send referrals to specialists
- Send prescriptions to pharmacies (if e-prescribe unavailable)
- Receive prior auth approvals

**Fax Integration:**
- Uses eFax or RingCentral Fax service
- Internet-based, no phone line needed
- Faxes arrive as PDFs
- Searchable and archivable

### Direct Secure Messaging

**What is Direct Messaging?**
HIPAA-compliant secure email for communicating with other healthcare providers.

**Uses:**
- Send patient records to specialists
- Receive consultation notes
- Share lab results
- Coordinate care with other providers

**Sending a Direct Message:**

1. **Navigate to Direct Messages**
   - Click **Mail** > **Direct** tab
   - Or dedicated **Direct Messaging** page

2. **Compose Message**
   - Click **+ New Message**
   - **To:** Enter provider's Direct address
     - Format: name@practice.direct.example.com
     - Or select from directory
   - **Subject:** Brief description
   - **Message:** Type your message
   - **Attachments:** Attach patient documents

3. **Send**
   - Click **Send**
   - Message encrypted and transmitted
   - Confirmation within seconds
   - Transmission ID provided

4. **Delivery Status**
   - **Sent:** Left your system
   - **Delivered:** Received by recipient's system
   - **Read:** Recipient opened (if read receipt enabled)

**Provider Directory:**

1. **Add External Provider**
   - Click **Contacts** > **+ Add Provider**
   - Enter:
     - Provider name
     - Specialty
     - Organization
     - Direct address
     - Phone, fax, address (optional)

2. **Quick Select**
   - When composing, select from directory
   - Favorite providers starred for easy access

**Receiving Direct Messages:**

1. **Inbox**
   - All received Direct messages
   - Shows:
     - From address
     - Subject
     - Date received
     - Attachment count
     - Unread indicator

2. **Read Message**
   - Click to open
   - View message content
   - Download attachments
   - Assign to patient (if applicable)

3. **Reply**
   - Click **Reply**
   - Compose response
   - Send securely

**Security:**
- All messages encrypted end-to-end
- Complies with HIPAA Direct protocol
- Authenticated sender verification
- Cannot be intercepted
- Audit trail maintained

### Portal Messages

**Patient Portal Messaging:**

Patients can send secure messages through the patient portal.

**Receiving Portal Messages:**

1. **Notification**
   - New message badge on dashboard
   - Email notification (if enabled)

2. **Navigate to Messages**
   - Click **Mail** > **Portal Messages** tab
   - Or from patient chart > **Messages** section

3. **View Message**
   - Click message to open
   - Shows:
     - Patient name
     - Subject
     - Message text
     - Date sent
     - Attachments (if any)

4. **Reply**
   - Click **Reply**
   - Type response
   - Click **Send**
   - Patient receives notification in portal

**Message Types:**

Common patient portal messages:
- Medication refill requests
- Appointment change requests
- General questions about care
- Billing inquiries
- Test result questions

**Best Practices:**
- Respond within 24-48 hours
- Set patient expectations (not for urgent issues)
- Direct urgent issues to phone call
- Keep responses professional
- Document important exchanges in chart

**Portal Message Settings:**

(Admin configuration)
1. Auto-reply for after-hours messages
2. Category routing (billing to front desk, clinical to nurse)
3. Response time targets
4. Message templates for common replies

---

## Reports & Analytics

### Dashboard Metrics

**Analytics Overview:**

The Analytics page provides real-time practice insights.

**Accessing Analytics:**

1. Click **Analytics** in sidebar
2. Dashboard loads with key metrics

**Dashboard Cards:**

1. **Today's Appointments**
   - Total scheduled
   - Completed
   - Cancelled
   - No-shows
   - Percentage show rate

2. **Revenue Summary**
   - Today's charges
   - Month-to-date revenue
   - Year-to-date revenue
   - Comparison to last month/year

3. **Patient Statistics**
   - Total active patients
   - New patients this month
   - Patient demographics breakdown

4. **Outstanding Claims**
   - Claims submitted
   - Claims pending
   - Claims denied
   - Average time to payment

5. **Provider Productivity**
   - Patients seen per provider
   - Average visit time
   - Revenue per provider
   - Utilization percentage

**Visual Charts:**

1. **Revenue Trend**
   - Line graph showing daily/weekly/monthly revenue
   - Compare to prior periods
   - Identify trends and patterns

2. **Appointment Volume**
   - Bar chart of appointments by day of week
   - Shows busiest days
   - Helps with staffing decisions

3. **Top Diagnoses**
   - Pie chart of most common conditions treated
   - Helps identify practice specialization

4. **Procedure Volume**
   - Bar chart of most performed procedures
   - Track trends over time

### Custom Reports

**Creating Custom Reports:**

1. **Navigate to Reports**
   - Click **Reports** in sidebar

2. **Select Report Type**

   **Financial Reports:**
   - Revenue by Provider
   - Revenue by Procedure Code
   - Collection Rate
   - Aging Report (outstanding balances)
   - Payment by Insurance
   - Daily Deposit Report

   **Clinical Reports:**
   - Diagnosis Frequency
   - Procedure Volume
   - Medication Prescribing Patterns
   - Lab Order Volume
   - Patient Demographics

   **Operational Reports:**
   - Appointment Statistics
   - No-Show Report
   - Wait Time Analysis
   - Provider Schedule Utilization
   - Staff Productivity

3. **Configure Report**
   - **Date Range:** Start and end dates
   - **Providers:** All or specific providers
   - **Locations:** All or specific offices
   - **Additional Filters:** Diagnosis, procedure, insurance, etc.

4. **Generate Report**
   - Click **Run Report**
   - Report generates (may take 10-30 seconds for large datasets)
   - Results display in table

5. **Export Options**
   - **CSV:** Excel-compatible spreadsheet
   - **PDF:** Printable document
   - **Print:** Direct to printer
   - **Email:** Send to recipient

**Saved Reports:**

1. **Save Custom Configuration**
   - After configuring report
   - Click **Save Report**
   - Name the report (e.g., "Monthly Revenue Summary")
   - Saves filters and settings

2. **Run Saved Reports**
   - Click **Saved Reports** tab
   - Select from list
   - Click **Run**
   - No need to reconfigure

3. **Schedule Reports**
   - Click **Schedule** on saved report
   - Set frequency:
     - Daily
     - Weekly
     - Monthly
   - Set email recipients
   - Report auto-generates and emails on schedule

**Common Report Examples:**

**Revenue by Provider Report:**
- Shows total charges per provider
- Helps track productivity
- Used for compensation planning

**No-Show Report:**
- Lists all no-show appointments
- Shows patterns (same patients repeatedly)
- Helps implement no-show policy

**Aging Report:**
- Shows outstanding patient balances by age:
  - 0-30 days
  - 31-60 days
  - 61-90 days
  - 90+ days
- Helps prioritize collections

### Quality Measures (MIPS)

**What is MIPS?**
Merit-based Incentive Payment System - Medicare quality reporting program.

**Quality Measures Tracking:**

1. **Navigate to Quality**
   - Click **Analytics** > **Quality** tab

2. **Dashboard View**
   - Summary cards showing:
     - Total measures tracked
     - Average performance rate
     - Open quality gaps
     - MIPS submission status

**Tracked Measures:**

Dermatology-specific quality measures:

1. **DERM-001: Melanoma Screening Rate**
   - **Target:** 80% of high-risk patients screened annually
   - **Numerator:** Patients screened
   - **Denominator:** High-risk patients
   - **Exclusions:** Patients who refused

2. **DERM-002: Acne Treatment Appropriateness**
   - **Target:** 90% of moderate/severe acne patients on appropriate therapy
   - **Criteria:** Topical + oral or isotretinoin for severe

3. **DERM-003: Psoriasis Management**
   - **Target:** 85% of moderate/severe psoriasis on biologics or systemics
   - **Tracking:** Treatment plan documented

4. **DERM-004: Skin Cancer Biopsy Appropriateness**
   - **Target:** 95% of suspicious lesions biopsied
   - **Measure:** Dermoscopy documentation

5. **PREV-001: Diabetic Foot Exam**
   - **Target:** 80% of diabetic patients with annual foot exam
   - **Cross-specialty measure**

**Performance Tracking:**

1. **View Performance**
   - Click on any measure
   - Shows:
     - Current performance rate
     - Target/benchmark (typically 80%)
     - Color coding:
       - Green: ≥80% (meeting benchmark)
       - Yellow: 60-79% (approaching)
       - Red: <60% (below benchmark)
     - Number of patients in numerator/denominator
     - List of attributed patients

2. **Gap Closure**
   - Click **Gaps** tab
   - Shows patients needing intervention
   - Example: "Patient X is high-risk but hasn't had melanoma screening in 18 months"
   - Action items:
     - Schedule appointment
     - Send reminder
     - Document refusal if applicable

3. **Close Gap**
   - When intervention completed
   - Click **Close Gap**
   - Enter intervention notes
   - Gap marked complete
   - Performance recalculates

**MIPS Submission:**

1. **Submit Tab**
   - Shows submission wizard
   - Required quarterly or annually

2. **Select Period**
   - Choose year and quarter
   - Or full year

3. **Review Measures**
   - All measures with performance rates
   - Shows what will be submitted

4. **Submit to MIPS**
   - Click **Submit to MIPS**
   - System generates submission file
   - Confirmation number provided
   - Save confirmation for records

5. **Download Report**
   - PDF summary of submission
   - Includes all measure data
   - Performance scores
   - Patient attribution

**Reports Tab:**

Generate quality reports:

1. **MIPS Quality Report**
   - Full MIPS submission summary
   - All measures and scores

2. **PQRS Report**
   - Physician Quality Reporting System
   - Category breakdown

3. **Provider Comparison**
   - Compare providers' performance
   - Identify top performers

4. **Trend Analysis**
   - Performance over time
   - Track improvements

**Benefits of Quality Tracking:**
- Maximize Medicare reimbursement
- Avoid MIPS penalties (up to 9% payment reduction)
- Qualify for bonuses (up to 7% increase)
- Improve patient outcomes
- Demonstrate quality to payers
- Identify care gaps

---

**End of User Guide**

For additional assistance:
- **Quick Start Guide:** See QUICK_START_GUIDE.md
- **Admin Guide:** See ADMIN_GUIDE.md
- **FAQ:** See FAQ.md
- **Support:** Contact your system administrator or support@yourdomain.com
