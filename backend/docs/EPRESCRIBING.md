# ePrescribing System Documentation

## Overview

This document describes the ePrescribing system implementation for the Dermatology EHR. The current implementation is a **fully functional local stub** that stores prescriptions in the database and provides all the UI/UX necessary for prescribing workflows. It is designed to be **Surescripts-ready** for future electronic prescription transmission.

## Current Implementation (v1.0 - Local Stub)

### Status: OPERATIONAL (Local Storage Only)

The system currently:
- ✅ Stores prescriptions locally in PostgreSQL database
- ✅ Validates prescriptions for DEA compliance
- ✅ Supports controlled substance prescribing with restrictions
- ✅ Provides medication search from curated dermatology medication database
- ✅ Manages pharmacy information
- ✅ Integrates with patient charts and encounters
- ✅ Maintains comprehensive audit logs for compliance
- ✅ Validates quantities, refills, and days supply
- ❌ Does NOT transmit to pharmacies electronically (stub implementation)
- ❌ Does NOT check real-time drug interactions (returns placeholder)
- ❌ Does NOT verify insurance formulary (assumes all covered)

### Architecture

```
Frontend (React/TypeScript)
  ├── PrescriptionsPage.tsx - Main prescription management
  ├── PrescriptionModal.tsx - New/edit prescription form
  ├── MedicationSearch.tsx - Autocomplete medication search
  ├── PharmacySearch.tsx - Pharmacy selection
  ├── DrugInteractionChecker.tsx - Stub for future integration
  └── PrescriptionHistory.tsx - Patient prescription history

Backend (Node/Express/TypeScript)
  ├── routes/
  │   ├── prescriptions.ts - Prescription CRUD operations
  │   ├── medications.ts - Medication search
  │   └── pharmacies.ts - Pharmacy management
  ├── services/
  │   └── prescriptionValidator.ts - Validation logic
  └── migrations/
      ├── 021_prescriptions.sql - Database schema
      └── 022_seed_medications.sql - 46 curated dermatology medications

Database (PostgreSQL)
  ├── prescriptions - Main prescription records
  ├── medications - Medication master database
  ├── pharmacies - Pharmacy directory
  └── prescription_audit_log - Compliance tracking
```

## Database Schema

### Medications Table
Stores the medication formulary with 46 pre-seeded dermatology medications:
- Topical medications (retinoids, steroids, antibiotics, antifungals, immunomodulators)
- Oral medications (antibiotics, antifungals, corticosteroids, retinoids, immunosuppressants)
- Biologics (injectable treatments)

Fields include: name, generic_name, brand_name, strength, dosage_form, route, dea_schedule, is_controlled, category

### Prescriptions Table
Comprehensive prescription tracking:
- Patient and provider linkage
- Medication details (stored for historical accuracy)
- Prescription details (sig, quantity, refills, days supply)
- Pharmacy information
- Status workflow (pending → sent → transmitted/error/cancelled)
- Surescripts integration fields (message_id, transaction_id)
- Clinical fields (indication, notes)
- Audit fields (created_by, created_at, updated_at)

### Pharmacies Table
Pharmacy directory with NCPDP identifiers ready for Surescripts:
- NCPDP ID (required for electronic prescribing)
- Contact information (name, phone, fax, address)
- Capabilities (is_preferred, is_24_hour, accepts_erx)

### Prescription Audit Log
Maintains complete audit trail for controlled substances compliance:
- All create, modify, cancel, transmit actions
- Changed fields (JSONB)
- User, IP address, timestamp

## API Endpoints

### Prescriptions
- `GET /api/prescriptions` - List prescriptions (filterable by patient, status, date, provider)
- `GET /api/prescriptions/:id` - Get single prescription
- `GET /api/prescriptions/patient/:patientId` - Get patient's prescriptions
- `POST /api/prescriptions` - Create new prescription (validates before saving)
- `PUT /api/prescriptions/:id` - Update prescription (if not yet sent)
- `DELETE /api/prescriptions/:id` - Cancel prescription (soft delete, marks as cancelled)
- `POST /api/prescriptions/:id/send` - Send to pharmacy (STUB - logs but doesn't transmit)

### Medications
- `GET /api/medications` - Search medications (by name, category, controlled status)
- `GET /api/medications/:id` - Get single medication
- `GET /api/medications/list/categories` - Get all medication categories

### Pharmacies
- `GET /api/pharmacies` - Search pharmacies (by name, city, state, zip)
- `GET /api/pharmacies/list/preferred` - Get preferred pharmacies
- `GET /api/pharmacies/:id` - Get single pharmacy
- `POST /api/pharmacies` - Add new pharmacy
- `PUT /api/pharmacies/:id` - Update pharmacy
- `DELETE /api/pharmacies/:id` - Delete pharmacy (if not referenced)

## Validation & Compliance

### DEA Controlled Substance Rules (Implemented)

**Schedule II:**
- ❌ No refills allowed
- ✅ Large quantity warning
- ✅ Days supply warning (>30 days)

**Schedule III-V:**
- ✅ Maximum 5 refills
- ✅ Days supply warning (>30 days)

**All Controlled Substances:**
- ✅ Require DEA schedule specification
- ✅ Flagged in UI with warning badges
- ✅ Logged in prescription audit log

### General Validation Rules
- ✅ Required fields: medication name, sig, quantity, patient, provider
- ✅ Quantity must be > 0
- ✅ Refills 0-5 range
- ✅ Days supply 1-90 (warning if >90)
- ✅ Quantity validation by dosage form (topical, oral, injection)
- ✅ Cannot modify prescription once sent

## Medication Database

The system includes 46 curated dermatology medications covering:

**Topical Retinoids (5):**
- Tretinoin (0.025%, 0.05%, 0.1%)
- Adapalene 0.1%
- Tazarotene 0.1%

**Topical Corticosteroids (9):**
- High potency: Clobetasol, Betamethasone dipropionate
- Medium potency: Triamcinolone, Fluocinonide
- Low potency: Hydrocortisone, Desonide

**Topical Antibiotics (3):**
- Mupirocin, Clindamycin, Erythromycin

**Topical Antifungals (4):**
- Ketoconazole, Terbinafine, Clotrimazole, Ciclopirox

**Topical Immunomodulators (3):**
- Tacrolimus (0.1%, 0.03%), Pimecrolimus

**Topical Chemotherapy/Immunotherapy (2):**
- Fluorouracil 5%, Imiquimod 5%

**Oral Antibiotics (4):**
- Doxycycline, Minocycline, Cephalexin

**Oral Antifungals (3):**
- Terbinafine, Fluconazole, Itraconazole

**Oral Corticosteroids (3):**
- Prednisone (10mg, 20mg), Methylprednisolone

**Oral Retinoids (3):**
- Isotretinoin (20mg, 40mg), Acitretin

**Immunosuppressants (3):**
- Methotrexate, Hydroxychloroquine, Cyclosporine

**Biologics (3):**
- Dupilumab (Dupixent), Adalimumab (Humira), Ustekinumab (Stelara)

## Surescripts Integration Roadmap

### Phase 2: Surescripts Integration (Future)

**Prerequisites:**
1. ✅ Practice registered with Surescripts
2. ✅ Provider DEA licenses validated and registered
3. ✅ EPCS (Electronic Prescribing of Controlled Substances) certification (for controlled substances)
4. ✅ Obtain Surescripts SPI (Service Provider ID)
5. ✅ Complete Surescripts certification process

**Technical Integration:**
1. Install Surescripts SDK or integrate via API
2. Implement NCPDP SCRIPT 2017071 message format
3. Add real-time pharmacy directory lookup
4. Implement NewRx message transmission
5. Handle RxChangeRequest, RxRenewalRequest messages
6. Implement Status notifications
7. Add error handling and retry logic
8. Implement prescription history (RxHistoryRequest)

**Code Changes Required:**
- `POST /api/prescriptions/:id/send` - Replace stub with actual Surescripts transmission
- Add webhook endpoints for Surescripts callbacks
- Implement message queue for async processing
- Add retry logic for failed transmissions
- Update status based on Surescripts responses

**Database Changes:**
- Add `surescripts_spi` column
- Add `transmission_attempts` counter
- Add `last_transmission_error` field
- Expand `surescripts_transaction_id` handling

### Phase 3: Clinical Decision Support (Future)

**Drug Interaction Checking:**
- Integrate with First Databank or similar service
- Replace DrugInteractionChecker stub with real-time checking
- Display severity levels (minor, moderate, major, contraindicated)
- Require provider acknowledgment for major interactions

**Allergy Checking:**
- Cross-reference patient allergies with medication
- Check for class allergies (e.g., penicillin allergy → cephalosporin warning)
- Require provider override with documentation

**Formulary Checking:**
- Integrate with patient's insurance formulary
- Display tier information (Tier 1, 2, 3, non-formulary)
- Indicate prior authorization requirements
- Suggest therapeutic alternatives

### Phase 4: Advanced Features (Future)

- **Medication History:** Pull patient's medication history from Surescripts
- **Refill Requests:** Handle electronic refill requests from pharmacies
- **Prior Authorization:** Electronic prior authorization submission
- **Controlled Substance Monitoring:** Integration with state PDMP (Prescription Drug Monitoring Program)
- **Medication Adherence:** Track fill rates and adherence
- **Mobile App:** Patient mobile app for prescription pickup notifications

## EPCS (Electronic Prescribing of Controlled Substances)

### Current Status: NOT IMPLEMENTED

EPCS requires additional security measures:
- Two-factor authentication for providers
- Biometric authentication or hard token
- Audit requirements beyond standard logging
- DEA certification process
- Identity proofing (in-person or remote)

### EPCS Requirements for Future Implementation:

1. **Provider Identity Proofing:**
   - In-person identity verification OR
   - Remote identity verification with two forms of ID
   - Background check

2. **Two-Factor Authentication:**
   - Something you know (password)
   - Something you have (token, mobile device) OR
   - Something you are (biometric)

3. **Audit Requirements:**
   - Log all access to controlled substance prescriptions
   - Log all authentication attempts
   - Maintain logs for 2 years
   - Internal audit procedures

4. **Security:**
   - Encrypted storage of prescriptions
   - Secure transmission (TLS 1.2+)
   - Automatic logout after inactivity
   - Access control (role-based)

## Security & Compliance

### HIPAA Compliance
- ✅ Audit logging of all prescription access
- ✅ Encryption in transit (HTTPS/TLS)
- ✅ Role-based access control (only providers and admins can prescribe)
- ✅ Tenant isolation (multi-tenant safe)
- ⚠️ Encryption at rest (depends on database configuration)

### State Regulations
- ⚠️ State-specific prescribing rules not implemented (varies by state)
- ⚠️ State PDMP integration not implemented
- ✅ DEA controlled substance rules implemented at federal level

### Best Practices Implemented
- ✅ Prescriptions cannot be modified once sent
- ✅ Soft delete (cancellation) preserves audit trail
- ✅ Created_by tracking for accountability
- ✅ IP address logging for security
- ✅ Validation prevents common prescribing errors
- ✅ Warning system for unusual quantities/durations

## User Interface

### PrescriptionsPage
- Prescription list with filters (status, patient, date range)
- Status badges (pending, sent, error, cancelled)
- Search functionality
- Quick actions (send, print, cancel)
- "New Prescription" button

### Prescription Modal
- Patient selection
- Medication search with autocomplete
- Strength and form selection (populated from medication)
- SIG (directions) text area
- Quantity input with validation
- Refills selector (0-5, restricted for Schedule II)
- Days supply input
- Pharmacy search and selection
- Indication field (optional)
- Notes for pharmacist (optional)
- DEA schedule warnings for controlled substances
- Drug interaction checker (stub)
- Validation errors displayed inline

### Integration Points
- Patient Detail Page: "Prescriptions" tab shows patient's prescription history
- Encounter Page: "Prescriptions" section for encounter-specific prescriptions
- Main Navigation: "Prescriptions" link for global prescription management

## Testing Recommendations

### Unit Tests
- Prescription validation logic
- DEA schedule rules
- Quantity validation by dosage form

### Integration Tests
- API endpoints for prescriptions, medications, pharmacies
- Authorization (provider-only prescribing)
- Tenant isolation

### E2E Tests
- Complete prescription workflow (search medication → select pharmacy → create → send)
- Controlled substance prescribing
- Prescription history viewing
- Prescription cancellation

## Known Limitations

1. **No Electronic Transmission:** Prescriptions are stored locally but not transmitted to pharmacies
2. **No Drug Interaction Checking:** Returns placeholder "no interactions found"
3. **No Formulary Checking:** Assumes all medications are covered
4. **No Medication History:** Cannot pull patient's fill history from pharmacies
5. **No Refill Requests:** Cannot receive electronic refill requests
6. **No EPCS:** Cannot electronically prescribe controlled substances (requires additional certification)
7. **Limited Medication Database:** 46 medications vs. thousands in production systems
8. **No Prior Authorization:** Cannot handle PA requirements
9. **No RxNorm Integration:** Medications use local IDs instead of RxNorm CUIs
10. **No NCPDP Integration:** Pharmacy directory is manually maintained

## Migration Path to Production ePrescribing

### Step 1: Obtain Surescripts Access (2-3 months)
- Register practice with Surescripts
- Complete certification process
- Obtain test credentials
- Complete certification testing

### Step 2: Medication Database Enhancement (1 month)
- Integrate with RxNorm API (free from NIH)
- Add RxCUI (RxNorm Concept Unique Identifier) to medications table
- Add NDC (National Drug Code) codes
- Expand medication database to full formulary

### Step 3: Implement Surescripts Integration (2-3 months)
- Install Surescripts SDK
- Implement NCPDP SCRIPT messaging
- Add pharmacy directory lookup
- Implement NewRx transmission
- Handle callbacks and status updates
- Add error handling and retry logic
- Complete Surescripts certification testing

### Step 4: Clinical Decision Support (2 months)
- Integrate with First Databank or similar
- Implement drug interaction checking
- Implement allergy checking
- Implement formulary checking
- Add provider override workflows

### Step 5: EPCS Certification (3-4 months)
- Implement two-factor authentication
- Add biometric authentication or hard token support
- Provider identity proofing process
- Enhanced audit logging
- DEA certification application
- Complete EPCS testing

## Support & Maintenance

### Monitoring
- Monitor prescription creation rates
- Track send failures (once Surescripts integrated)
- Alert on validation errors
- Audit log review for compliance

### Medication Database Updates
- Quarterly review of dermatology medication list
- Add new medications as approved by FDA
- Update strengths/forms as available
- Remove discontinued medications (soft delete to preserve history)

### Compliance
- Annual HIPAA risk assessment
- Quarterly audit log review
- Provider DEA license verification (annual)
- Surescripts certification renewal (every 3 years)

## Contact & Support

For questions about ePrescribing implementation:
- Technical: Review code in `/backend/src/routes/prescriptions.ts`
- Surescripts: https://surescripts.com/
- DEA EPCS: https://www.deadiversion.usdoj.gov/ecomm/e_rx/

---

**Document Version:** 1.0
**Last Updated:** December 8, 2024
**Status:** Local Stub Implementation Complete, Surescripts Integration Pending
