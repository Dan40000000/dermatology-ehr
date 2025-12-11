# Dermatology EHR Feature Guide
## Plain English Explanation of What Everything Does

**Last Updated:** December 8, 2025
**For:** Sales & Demo - Non-Medical Users

---

## Quick Overview

This is an **Electronic Health Record (EHR)** system specifically for dermatology practices. Think of it as a digital version of:
- Patient charts (replacing paper files)
- Appointment scheduler (replacing paper calendar)
- Billing system (replacing paper superbills)
- Communication hub (replacing phone calls & faxes)

---

## MAIN SECTIONS EXPLAINED

### 1. **HOME / DASHBOARD**
**What it is:** The main screen you see when you log in

**What you see:**
- **Today's Stats:** Quick numbers (patients seen, appointments, revenue)
- **Upcoming Appointments:** Next patients coming in
- **Recent Activity:** What happened recently (new patients, notes, etc.)
- **Quick Actions:** Shortcuts to common tasks

**Why it's useful:** Gives everyone a quick overview of the day's activity

---

### 2. **PATIENTS**
**What it is:** The digital patient chart system

#### **Patient List**
- Shows all patients in the practice
- Search by name, DOB, phone, or medical record number (MRN)
- Filter by insurance, age, last visit, etc.

#### **Patient Detail Page**
When you click on a patient, you see their complete record:

**Demographics Tab:**
- Basic info: Name, DOB, address, phone, email
- Insurance information
- Emergency contacts
- **Why it matters:** Need this for billing, scheduling, and communication

**Clinical Tab:**
- **Allergies:** What medications/substances they're allergic to
  - Example: "Penicillin" means doctor can't prescribe penicillin-based antibiotics
- **Medications:** What drugs they're currently taking
  - Important: Some drugs interact badly with each other
- **Medical History:** Past surgeries, chronic conditions
  - Example: Diabetes, heart disease, previous skin cancers

**Visit History:**
- List of all past appointments
- What was done each visit
- Photos taken
- Procedures performed

**Documents:**
- Consent forms
- Lab results
- Insurance cards (scanned copies)
- Referral letters

**Photos:**
- Clinical photos of skin conditions
- Before/after treatment photos
- Dermoscopy images (magnified skin photos)
- **Why it matters:** Track changes over time, document conditions for insurance

---

### 3. **SCHEDULE / APPOINTMENTS**

**What it is:** Digital appointment calendar

**Main View:**
- Calendar showing all booked appointments
- Color-coded by:
  - Provider (Dr. Smith = Blue, Dr. Jones = Green)
  - Appointment type (New patient, Follow-up, Procedure)
  - Status (Scheduled, Checked In, Completed, Cancelled)

**Time Slots:**
- Broken into 5-minute intervals
- Shows provider availability
- Blocks out lunch breaks, meetings, etc.

**Appointment Types:**
- **New Patient Consult (30 min):** First-time patients
- **Follow-up (15-20 min):** Returning patients checking progress
- **Skin Check / Screening (30 min):** Full body check for skin cancer
- **Procedure (45-60 min):** Biopsy, excision, laser treatment, etc.
- **Cosmetic Consult (30 min):** Botox, fillers, cosmetic procedures

**Appointment Status Flow:**
1. **Scheduled:** Patient booked, not here yet
2. **Confirmed:** Patient confirmed they're coming
3. **Checked In:** Patient arrived, waiting in lobby
4. **In Room:** Patient in exam room, waiting for doctor
5. **With Provider:** Doctor is seeing them now
6. **Completed:** Visit finished, patient left
7. **Cancelled / No Show:** Patient didn't come

**Why it matters:**
- Keeps everyone on schedule
- Reduces wait times
- Maximizes revenue (fewer empty slots)

---

### 4. **ENCOUNTERS (CLINICAL NOTES)**

**What it is:** Digital version of the doctor's exam notes

**Think of it like:** The doctor's medical diary entry for each visit

**Sections of a Note:**

**Chief Complaint (CC):**
- Why the patient came in today
- Example: "Rash on left arm for 2 weeks"

**History of Present Illness (HPI):**
- Details about the problem
- Example: "Started 2 weeks ago, itchy, getting worse, tried hydrocortisone cream without improvement"

**Review of Systems (ROS):**
- Checklist of body systems
- Example: "Skin: See HPI. Constitutional: No fever. Eyes: Normal. Respiratory: Normal..."
- **Why:** Makes sure doctor doesn't miss related problems

**Physical Exam:**
- What the doctor saw/found
- Example: "3cm erythematous patch on left forearm, no scaling, no oozing"
- Translation: "3cm red spot on left forearm, not flaky, not wet"

**Assessment & Plan:**
- **Assessment:** Doctor's diagnosis
  - Example: "Contact dermatitis, likely allergic"
- **Plan:** What to do about it
  - Example: "Rx Triamcinolone cream 0.1% apply BID x 2 weeks, avoid known allergens, RTC 2 weeks"
  - Translation: "Prescription steroid cream twice daily for 2 weeks, avoid what caused it, return to clinic in 2 weeks"

**Templates:**
- Pre-filled note formats for common visits
- Example: "Acne Follow-up" template auto-fills common sections
- **Why:** Saves doctors time, ensures nothing is forgotten

---

### 5. **VITALS**

**What it is:** Basic health measurements taken at each visit

**What's measured:**
- **Height & Weight:** Track growth (kids), calculate medication doses
- **Blood Pressure:** 120/80 is normal, higher = hypertension
- **Pulse:** Normal = 60-100 beats per minute
- **Temperature:** Normal = 98.6°F / 37°C

**Who takes them:** Medical Assistant (MA) before doctor sees patient

**Why for dermatology:**
- Some skin medications affect blood pressure
- Some procedures require normal vitals
- Insurance requires vitals for billing certain codes

---

### 6. **PHOTOS (CLINICAL PHOTOGRAPHY)**

**What it is:** Medical-grade photos of skin conditions

**Types of Photos:**
- **Clinical:** Standard photos of skin conditions
- **Dermoscopy:** Magnified photos using special lens
- **Before/After:** Track treatment progress
- **Baseline:** Initial photos for comparison

**Photo Comparison Tool:**
- Side-by-side view of same area over time
- Example: Acne "Before Treatment" vs "After 3 months"
- **Why:** Shows treatment is working (or not)

**Annotations:**
- Draw arrows, circles on photos
- Mark areas of concern
- Example: Circle a suspicious mole, add note "Monitor for changes"

---

### 7. **BODY DIAGRAM**

**What it is:** Interactive map of the human body

**How it works:**
- Click on body part where lesion/condition is
- Add details:
  - Type: Mole, wart, rash, biopsy site, etc.
  - Size: 5mm, 1cm, etc.
  - Color: Brown, red, pink, black
  - Status: Active, resolved, monitoring
  - Diagnosis: Basal cell carcinoma, seborrheic keratosis, etc.

**Views:**
- Front of body
- Back of body
- Zoom into specific areas (face, hands, feet)

**Use Cases:**
- **Skin Cancer Screening:** Mark all moles, track changes
- **Procedure Documentation:** Record where biopsies were taken
- **Treatment Tracking:** Mark areas treated with laser, liquid nitrogen, etc.

**Example:**
- Patient has 15 moles across body
- Doctor examines all 15, marks them on body diagram
- 2 look suspicious, flagged for monitoring
- Next visit, easy to find those exact 2 moles again

---

### 8. **ORDERS**

**What it is:** Digital prescription and lab order system

**Types of Orders:**

**Prescriptions (Rx):**
- **Topical:** Creams, ointments, gels
  - Example: Tretinoin cream 0.05% - Apply to face nightly
- **Oral:** Pills, liquids
  - Example: Doxycycline 100mg - Take 1 pill twice daily for acne
- **Biologics:** Injections (expensive specialty drugs)
  - Example: Dupixent injection every 2 weeks for severe eczema

**Lab Orders:**
- **Skin Biopsy:** Send tissue to lab for analysis
  - Takes 3-7 days to get results
  - Tells if lesion is cancerous or benign
- **Blood Tests:** Check for drug side effects
  - Example: Monthly liver tests for Accutane patients
- **Allergy Testing:** Patch tests to find what causes reactions

**Imaging:**
- **Dermoscopy:** Magnified imaging of moles
- **Photography:** Clinical photos

---

### 9. **BILLING & CHARGES**

**What it is:** System for billing insurance and patients

**Key Concepts:**

**CPT Codes (Procedure Codes):**
- 5-digit codes for what was done
- Examples:
  - **99213:** Office visit, established patient, 15 min
  - **11100:** Skin biopsy, first lesion
  - **17000:** Destruction of pre-cancerous lesion
- Each code has a price (fee)

**ICD-10 Codes (Diagnosis Codes):**
- Codes for what's wrong with the patient
- Examples:
  - **L70.0:** Acne vulgaris
  - **C44.310:** Basal cell carcinoma of face
  - **L30.9:** Dermatitis, unspecified
- **Why:** Insurance requires diagnosis code to justify procedure

**Linking Diagnosis to Procedure:**
- Must link each CPT to at least one ICD-10
- Example:
  - Procedure: Skin biopsy (11100)
  - Linked to: Suspected basal cell carcinoma (C44.310)
- **Why:** Insurance won't pay without proper link

**Superbill:**
- Summary of visit charges
- Lists all procedures done
- Lists all diagnoses
- Total charge
- Given to patient or submitted to insurance

---

### 10. **CLAIMS MANAGEMENT**

**What it is:** System for submitting bills to insurance

**Claim Lifecycle:**
1. **Draft:** Visit completed, charges entered
2. **Ready:** All codes linked, ready to submit
3. **Submitted:** Sent electronically to insurance
4. **Accepted:** Insurance received it
5. **Paid:** Insurance sent payment
6. **Denied:** Insurance rejected claim
   - Reasons: Missing info, not medically necessary, authorization needed

**Claim Scrubbing:**
- Automatic check for errors before submitting
- Catches: Missing diagnosis, invalid code combos, etc.
- **Why:** Reduces denials, gets paid faster

**Payment Posting:**
- Record payments from insurance
- Record copays from patients
- Track what's still owed

---

### 11. **FEE SCHEDULE**

**What it is:** Price list for all services

**How it works:**
- Each CPT code has a fee
- Example:
  - 99213 (office visit) = $150
  - 11100 (biopsy) = $180
  - 17000 (lesion destruction) = $125

**Multiple Fee Schedules:**
- **Standard/Cash:** Full price for self-pay patients
- **Insurance A:** Negotiated rates with Blue Cross
- **Insurance B:** Different rates with Cigna
- **Medicare:** Government-set rates

**Why multiple:** Each insurance negotiates different rates

---

### 12. **TASKS**

**What it is:** Digital to-do list for the practice

**Task Categories:**
- **Patient Follow-up:** Call patient with lab results
- **Prior Authorization:** Get insurance approval for expensive drug
- **Lab/Path Follow-up:** Check if biopsy results came back
- **Prescription Refill:** Patient called for refill, needs approval
- **Insurance Verification:** Check if patient's insurance is active
- **General:** Everything else

**Task Assignment:**
- Assign to specific person (Dr. Smith, MA Jones, etc.)
- Set due date
- Set priority (Low, Normal, High)
- Add notes

**Task Kanban Board:**
- **To Do:** Not started
- **In Progress:** Someone is working on it
- **Completed:** Done

**Example Workflow:**
1. Biopsy done on Monday
2. Task created: "Follow up biopsy results - Patient: Smith"
3. Assigned to: MA Jones
4. Due: Friday
5. Friday: MA checks results, calls patient
6. Task marked complete

---

### 13. **MESSAGES / COMMUNICATION**

**What it is:** Secure messaging system

**Types:**

**Staff Messages:**
- Internal chat between staff
- Example: "MA to Doctor: Patient in Room 3 ready for you"

**Patient Portal Messages:**
- Secure messages with patients
- HIPAA-compliant (encrypted)
- Example: Patient asks about rash photos, doctor responds

**SMS Reminders:**
- Text message appointment reminders
- Example: "Your appt with Dr. Smith tomorrow at 2pm. Reply C to confirm."

**Email Notifications:**
- Lab results available
- Appointment confirmations
- Billing statements

---

### 14. **PATIENT PORTAL**

**What it is:** Patient-facing website where they can:

**Features:**
- **View Visits:** See past appointments, notes (simplified version)
- **View Documents:** Consent forms, visit summaries
- **Request Appointments:** Book online (if enabled)
- **Message Doctor:** Secure messaging
- **Pay Bills:** View balance, pay online
- **Update Info:** Change phone number, address, etc.

**Why it's valuable:**
- Reduces phone calls to office
- Patients can schedule 24/7
- Faster payments
- Better patient satisfaction

**Kiosk Mode:**
- Tablet in waiting room
- Patients check themselves in
- Update insurance info
- Fill out forms
- Sign consents
- **Why:** Frees up front desk staff

---

### 15. **REPORTS / ANALYTICS**

**What it is:** Business intelligence dashboard

**Reports Available:**

**Financial Reports:**
- **Revenue by Provider:** Which doctor brings in most money
- **Revenue by Procedure:** Which procedures are most profitable
- **Collection Rate:** How much billed vs. how much collected
- **Outstanding AR:** How much patients owe

**Clinical Reports:**
- **Diagnosis Frequency:** Most common conditions seen
- **Procedure Volume:** How many biopsies, excisions per month
- **Patient Demographics:** Age distribution, insurance types

**Operational Reports:**
- **No-Show Rate:** % of patients who don't show up
- **Wait Time:** Average time from check-in to seeing doctor
- **Appointment Utilization:** % of schedule slots filled

**Quality Metrics:**
- **Medication Compliance:** % patients refilling meds on time
- **Follow-up Completion:** % patients returning for follow-up

---

### 16. **REMINDERS**

**What it is:** Automated recall system

**Types:**

**Appointment Reminders:**
- Sent 48 hours before appointment
- Via: SMS, Email, Phone call (automated)

**Recall Reminders:**
- **Annual Skin Check:** "It's been 12 months since your last full body check"
- **Biopsy Follow-up:** "Your biopsy results are ready, please call to schedule follow-up"
- **Treatment Continuation:** "Time for your next Botox appointment"

**Medication Reminders:**
- "Refill needed for Tretinoin cream"
- "Time for your Accutane blood test"

---

### 17. **AUDIT LOG**

**What it is:** Complete history of who did what and when

**Tracks:**
- Who viewed patient chart (date/time)
- Who edited note
- Who deleted appointment
- Who changed medication
- Failed login attempts

**Why it's required:**
- **HIPAA Compliance:** Federal law requires tracking access to patient data
- **Security:** Detect unauthorized access
- **Dispute Resolution:** "Who changed this patient's address?"

**Example:**
```
2025-12-08 2:15pm - User: Dr. Smith - Action: Viewed patient chart - Patient: John Doe
2025-12-08 2:16pm - User: Dr. Smith - Action: Created encounter note
2025-12-08 2:18pm - User: Dr. Smith - Action: Prescribed Tretinoin cream
```

---

### 18. **SETTINGS**

**What it is:** Configuration and admin area

**Sections:**

**Practice Settings:**
- Practice name, address, phone, NPI
- Logo upload
- Business hours
- Tax ID for billing

**User Management:**
- Add/remove staff
- Set roles: Admin, Provider, MA, Front Desk
- Set permissions (who can do what)

**Templates:**
- Create note templates
- Create consent forms
- Customize superbill layouts

**Fee Schedules:**
- Set prices for procedures
- Import fee schedules from insurance

**Appointment Types:**
- Define visit types and durations
- Set which providers can do which types

---

## TYPICAL WORKFLOWS

### **Workflow 1: New Patient Visit**

1. **Front Desk:**
   - Creates patient record
   - Scans insurance card
   - Collects copay ($20)

2. **Medical Assistant:**
   - Checks patient in (status changes to "Checked In")
   - Takes patient to room
   - Takes vitals (BP, pulse, temp, weight)
   - Takes clinical photos if needed
   - Marks status "In Room"

3. **Provider (Doctor):**
   - Reviews patient info
   - Enters clinical note:
     - Chief complaint: "Acne on face"
     - Exam findings: "Moderate inflammatory acne on cheeks and forehead"
     - Diagnosis: "Acne vulgaris (L70.0)"
     - Plan: "Prescribe Tretinoin cream 0.05%, Doxycycline 100mg, return in 6 weeks"
   - Signs note
   - Marks status "Completed"

4. **Billing:**
   - Charges automatically added based on note:
     - 99203 (New patient visit, moderate complexity) - $180
     - Linked to L70.0 (Acne vulgaris)
   - Claim created and submitted to insurance

5. **Front Desk:**
   - Schedules 6-week follow-up
   - Gives patient prescriptions
   - Patient leaves

---

### **Workflow 2: Skin Biopsy**

1. **Provider decides biopsy needed:**
   - Suspicious mole found during screening
   - Enters order: "Skin biopsy - left shoulder"
   - Takes clinical photo + dermoscopy
   - Marks location on body diagram

2. **Biopsy performed:**
   - Numbing injection
   - Tissue sample taken
   - Sample sent to pathology lab

3. **Billing:**
   - Charges: 11100 (Biopsy) + 99213 (Office visit)
   - Diagnosis: D22.5 (Melanocytic nevus) + C44.509 (Suspected melanoma)

4. **Task created:**
   - "Follow up biopsy results - Patient: Smith"
   - Assigned to: MA Jones
   - Due: 7 days

5. **Results return:**
   - MA receives pathology report
   - Attaches to patient chart
   - Calls patient with results
   - Schedules excision if malignant

---

### **Workflow 3: Insurance Claim**

1. **Visit completed, charges entered**

2. **Claim scrubbing:**
   - System checks:
     - All diagnoses linked? ✓
     - Valid code combinations? ✓
     - Patient insurance active? ✓
   - Status: "Ready to submit"

3. **Submit to insurance:**
   - Electronic claim sent to Blue Cross
   - Status: "Submitted"

4. **Insurance processes:**
   - 14-30 days later
   - Insurance pays $150 of $180 charged
   - Patient owes $30 (copay already collected)

5. **Payment posted:**
   - $150 credited to practice account
   - Claim marked "Paid"

---

## COMMON DERMATOLOGY CONDITIONS (What Doctors Treat)

**Acne:**
- Pimples, blackheads, whiteheads
- Treated with: Topical creams, oral antibiotics, Accutane

**Eczema (Atopic Dermatitis):**
- Itchy, inflamed skin
- Treated with: Steroid creams, moisturizers, biologics (Dupixent)

**Psoriasis:**
- Thick, scaly patches
- Treated with: Topical steroids, light therapy, biologics (Humira, Enbrel)

**Rosacea:**
- Facial redness, broken blood vessels
- Treated with: Topical gels, oral antibiotics, laser

**Skin Cancer:**
- **Basal Cell Carcinoma:** Most common, slow-growing
- **Squamous Cell Carcinoma:** More aggressive
- **Melanoma:** Most dangerous, can spread
- Treated with: Excision, Mohs surgery, immunotherapy

**Moles (Nevi):**
- Benign pigmented spots
- Monitored for changes → biopsy if suspicious

**Warts:**
- Viral growths
- Treated with: Liquid nitrogen freezing, chemical destruction

**Fungal Infections:**
- **Athlete's Foot, Ringworm, Nail Fungus**
- Treated with: Antifungal creams or pills

**Actinic Keratosis:**
- Pre-cancerous sun damage spots
- Treated with: Liquid nitrogen, topical chemo cream (Efudex)

**Cosmetic:**
- Botox, fillers, laser hair removal
- Not usually covered by insurance

---

## INSURANCE & BILLING BASICS

**Commercial Insurance:**
- Blue Cross, Cigna, United, Aetna
- Patients pay copay ($20-50) at visit
- Insurance pays rest after claim processed

**Medicare:**
- Government insurance for 65+
- Pays ~80% of allowed amount
- Patient pays 20% coinsurance

**Medicaid:**
- Government insurance for low-income
- Pays very low rates
- Many doctors don't accept

**Self-Pay:**
- No insurance
- Patient pays full fee
- Often get discount for paying cash

**Prior Authorization:**
- Insurance requires approval before expensive treatment
- Example: Dupixent costs $40,000/year → needs approval
- Can take days/weeks

---

## WHY THIS SYSTEM MATTERS

**For the Practice:**
- ✅ No more paper charts (saves space, easier to find)
- ✅ Faster billing (electronic claims process in days vs. weeks)
- ✅ Better compliance (audit logs prove HIPAA compliance)
- ✅ More revenue (fewer missed charges, better coding)
- ✅ Easier growth (data-driven decisions)

**For the Doctor:**
- ✅ Faster note-taking (templates, autofill)
- ✅ Better patient care (complete history at fingertips)
- ✅ Photo comparison (track treatment progress)
- ✅ Less administrative burden (system handles billing)

**For the Staff:**
- ✅ Clear task management (nothing falls through cracks)
- ✅ Easier scheduling (visual calendar, conflict detection)
- ✅ Faster check-in (kiosk mode)
- ✅ Better communication (secure messaging)

**For the Patient:**
- ✅ Online scheduling (book 24/7)
- ✅ Text reminders (fewer missed appointments)
- ✅ Portal access (view results, pay bills)
- ✅ Better care (coordinated, complete records)

---

## SALES TALKING POINTS

### **Problem:** "Our current system is..."
- Paper-based → Can't find charts, takes up space
- Old EHR → Slow, crashes, poor support
- Separate systems → Scheduling in one, billing in another

### **Solution:** This integrated system
- ✅ **All-in-One:** Scheduling + Clinical + Billing + Communication
- ✅ **Cloud-Based:** Access from anywhere, no local servers
- ✅ **Modern UI:** Looks like apps they use daily, easy to learn
- ✅ **Mobile-Friendly:** Use on iPad in exam rooms
- ✅ **Dermatology-Specific:** Built for skin doctors, not generic

### **ROI (Return on Investment):**
- **Faster Billing:** Get paid 2 weeks faster → improved cash flow
- **Fewer Denied Claims:** 95% clean claim rate → +$10K/month
- **More Patients:** Online booking → +20% appointments
- **Less Staff Time:** Automation → Save 10hrs/week front desk time
- **No IT Costs:** Cloud-hosted, no servers to maintain

### **Competitive Advantages:**
- **Body Diagram:** Visual tracking of lesions (competitors don't have this)
- **Photo Comparison:** Side-by-side treatment progress
- **SMS Messaging:** Text patients directly (reduces phone calls)
- **Kiosk Mode:** Patients self-check-in on tablet
- **HIPAA Compliant:** Audit logs, encryption, automatic backups

---

## DEMO SCRIPT

**Step 1: Login**
- "Let me show you how easy it is to use..."
- Login as admin@demo.practice / Password123!

**Step 2: Dashboard**
- "This is your daily snapshot - appointments, revenue, tasks"

**Step 3: Patient Chart**
- Search "Sarah Johnson"
- "Here's her complete record - demographics, insurance, allergies, medications"
- Show photos, body diagram, visit history

**Step 4: Schedule**
- "This is your appointment calendar - color coded by provider"
- Create new appointment for Sarah
- Show conflict detection

**Step 5: Clinical Note**
- Open Sarah's encounter
- "Doctor types their note here - templates make it fast"
- Show CPT/ICD linking

**Step 6: Body Diagram**
- "This is unique to dermatology - track moles, lesions visually"
- Click on body part, add marking
- Show photo link

**Step 7: Billing**
- "Charges automatically created from note"
- Show superbill
- Submit claim

**Step 8: Reports**
- "Built-in analytics - no extra reporting tools needed"
- Show revenue by provider, procedure volume

**Step 9: Patient Portal**
- "Patients can book online, message you, pay bills"
- Show kiosk mode on iPad

**Close:**
- "Any questions on how this would work for your practice?"

---

## QUICK REFERENCE

### **Login Credentials (Demo)**
- Admin: admin@demo.practice / Password123!
- Provider: provider@demo.practice / Password123!
- MA: ma@demo.practice / Password123!
- Front Desk: frontdesk@demo.practice / Password123!

### **Test Patients**
- 30 fake patients loaded
- Various ages, conditions, insurance types
- Try searching: "Johnson", "Chen", "Thompson"

### **Common CPT Codes**
- 99213: Office visit, established ($112)
- 11100: Skin biopsy ($148)
- 17000: Lesion destruction ($115)

### **Common ICD-10 Codes**
- L70.0: Acne vulgaris
- C44.310: Basal cell carcinoma
- L30.9: Dermatitis

---

**Questions? Issues? Feature Requests?**
Contact: support@yourdomain.com

---

**END OF GUIDE**
