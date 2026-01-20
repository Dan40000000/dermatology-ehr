# Cosmetic Dermatology Provider Setup

## Summary

Successfully added a cosmetic-focused PA (Physician Assistant) provider to the derm app database for tenant-demo.

## What Was Done

### 1. Updated Existing Providers

All existing providers now have proper credentials:

1. **Dr. David Skin, MD, FAAD**
   - ID: `prov-demo`
   - Specialty: Dermatology - General
   - NPI: 1234567890
   - Credentials: MD (Medical Doctor), FAAD (Fellow of American Academy of Dermatology)

2. **Riley Johnson, PA-C**
   - ID: `prov-demo-2`
   - Specialty: Dermatology - General
   - NPI: 2345678901
   - Credentials: PA-C (Physician Assistant - Certified)

3. **Dr. Maria Martinez, MD, FAAD**
   - ID: `prov-demo-3`
   - Specialty: Dermatology - General & Medical
   - NPI: 3456789012
   - Credentials: MD, FAAD

### 2. Added New Cosmetic PA Provider

**Sarah Mitchell, PA-C**
- **ID:** `prov-cosmetic-pa`
- **Specialty:** Cosmetic Dermatology
- **NPI:** 4567890123
- **Credentials:** PA-C (Physician Assistant - Certified)
- **Active:** Yes

**Schedule:**
- Monday - Friday: 9:00 AM - 6:00 PM
- Weekends: Not available

**Services Offered:**
- Botox injections
- Dermal fillers (Juvederm, Restylane, etc.)
- Chemical peels
- Microneedling
- Laser treatments
- Sclerotherapy for spider veins
- Photodynamic therapy
- Cosmetic consultations

### 3. Added Cosmetic Appointment Types

Three new appointment types were created:

1. **Cosmetic Consultation** (`appttype-cosmetic-consult`)
   - Duration: 45 minutes
   - For initial evaluations and treatment planning

2. **Botox/Filler** (`appttype-botox`)
   - Duration: 30 minutes
   - For injectable treatments

3. **Cosmetic Procedure** (`appttype-cosmetic-proc`)
   - Duration: 60 minutes
   - For laser treatments, chemical peels, etc.

### 4. Added Cosmetic CPT Codes

Added 26 cosmetic dermatology procedure codes:

#### Botox/Neurotoxin
- **64650** - Chemodenervation of eccrine glands; both axillae ($750.00)
- **64653** - Chemodenervation of eccrine glands; other area ($600.00)

#### Chemical Peels
- **15788** - Chemical peel, facial; epidermal ($300.00 - also used for microneedling)
- **15789** - Chemical peel, facial; dermal ($250.00)
- **15792** - Chemical peel, nonfacial; epidermal ($200.00)
- **15793** - Chemical peel, nonfacial; dermal ($300.00)
- **17360** - Chemical exfoliation for acne ($120.00)

#### Dermabrasion
- **15780** - Dermabrasion; total face ($1,500.00)
- **15781** - Dermabrasion; segmental, face ($1,000.00)
- **15782** - Dermabrasion; regional, other than face ($1,200.00)
- **15783** - Dermabrasion; superficial, any site ($800.00)

#### Laser Treatments
- **17106** - Destruction of cutaneous vascular lesions; <10 sq cm ($350.00)
- **17107** - Destruction of cutaneous vascular lesions; 10-50 sq cm ($550.00)
- **17108** - Destruction of cutaneous vascular lesions; >50 sq cm ($750.00)
- **96920** - Laser treatment; <250 sq cm ($285.00)
- **96921** - Laser treatment; 250-500 sq cm ($385.00)
- **96922** - Laser treatment; >500 sq cm ($485.00)

#### Sclerotherapy (Spider Veins)
- **36465** - Injection of non-compounded foam sclerosant ($400.00)
- **36466** - Injection of compounded foam sclerosant ($450.00)
- **36468** - Spider vein injections (telangiectasia) ($350.00)
- **36471** - Injection of sclerosant; single incompetent vein ($500.00)

#### Photodynamic Therapy (PDT)
- **96567** - PDT by external application of light ($850.00)
- **96573** - PDT by endoscopic application of light ($1,200.00)
- **96574** - Debridement of premalignant lesions, first 15 min ($450.00)

#### Cosmetic Surgery
- **67346** - Blepharoplasty; upper eyelid ($2,500.00)

### 5. Created Sample Appointments

Three sample cosmetic appointments were created to demonstrate the system:

1. **Cosmetic Consultation** - Jan 22, 2026 at 10:00 AM
2. **Botox/Filler** - Jan 29, 2026 at 2:00 PM
3. **Cosmetic Procedure (Laser)** - Feb 5, 2026 at 11:00 AM

All appointments are with Sarah Mitchell, PA-C for patient Jamie Patient at Main Clinic.

## Database Information

- **Database:** derm_db
- **Host:** localhost:5432
- **User:** derm_user
- **Tenant:** tenant-demo

### Tables Modified

1. **providers** - Updated 3 existing, added 1 new provider
2. **provider_availability** - Added 5 availability slots for Sarah Mitchell
3. **appointment_types** - Added 3 cosmetic appointment types
4. **cpt_codes** - Added 26 cosmetic procedure codes
5. **appointments** - Created 3 sample cosmetic appointments

## How to Use

### Scheduling Cosmetic Appointments

1. Select **Sarah Mitchell, PA-C** as the provider
2. Choose one of the cosmetic appointment types:
   - Cosmetic Consultation (45 min)
   - Botox/Filler (30 min)
   - Cosmetic Procedure (60 min)
3. Select an available time slot (Mon-Fri, 9am-6pm)
4. Book the appointment as normal

### Billing for Cosmetic Procedures

When documenting a cosmetic encounter:

1. Use the appropriate CPT code from the list above
2. Most cosmetic procedures are **cash-pay** (not covered by insurance)
3. Document the procedure in the encounter notes
4. Create charges using the cosmetic CPT codes
5. Generate an invoice for the patient

### Provider Selection in Frontend

The cosmetic provider will now appear in all provider dropdowns and can be selected for:
- Appointment scheduling
- Encounter creation
- Provider availability views
- Reporting and analytics

## Status

✅ **READY FOR USE**

- 4 total providers (2 MDs with FAAD, 2 PAs with PA-C)
- 1 cosmetic specialist
- 3 cosmetic appointment types
- 26 cosmetic CPT codes
- Provider availability configured
- Sample appointments created

## Verification

To verify the setup, you can:

1. Check providers list in the frontend
2. Try scheduling a cosmetic appointment
3. View Sarah Mitchell's availability
4. Look for cosmetic appointment types in dropdowns

## Notes

- Provider services/procedures are tracked via appointment types and CPT codes in encounters
- The cosmetic provider can see all types of dermatology patients, but specializes in cosmetic procedures
- All cosmetic CPT codes have default fees set (can be adjusted per practice)
- Most cosmetic procedures are elective and paid out-of-pocket
