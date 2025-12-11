# Patient Portal Implementation Guide

## Overview
Comprehensive patient-facing portal for Mountain Pine Dermatology EHR system.

## Backend Implementation

### Database Schema (migrations/023_patient_portal.sql)
- **patient_portal_accounts**: Patient login accounts with email/password
- **patient_portal_sessions**: Active sessions with 30-minute inactivity timeout
- **patient_document_shares**: Documents shared with patients by providers
- **visit_summaries**: After-visit summaries that can be released to portal

### Security Features Implemented
- Bcrypt password hashing (10 rounds)
- Account lockout after 5 failed login attempts (30-minute lockout)
- Session expiration (12 hours max, 30 minutes inactivity)
- Email verification required
- Password requirements: 8+ chars, upper, lower, number, symbol
- HIPAA audit logging for all patient data access
- Tenant isolation enforced

### API Endpoints Created

#### Patient Portal Auth (/api/patient-portal)
- POST /register - Register new patient portal account
- POST /login - Login with email/password
- POST /logout - Logout and invalidate session
- POST /verify-email - Verify email with token
- POST /forgot-password - Request password reset
- POST /reset-password - Reset password with token
- GET /me - Get current patient info
- PUT /me - Update patient profile
- GET /activity - Get account activity log

#### Patient Portal Data (/api/patient-portal-data)
- GET /appointments - Upcoming and past appointments
- GET /visits - Released visit summaries
- GET /documents - Shared documents
- GET /documents/:id/download - Download document
- GET /prescriptions - All prescriptions
- GET /vitals - Vital signs history
- GET /lab-results - Lab results
- GET /allergies - Patient allergies
- GET /medications - Current medications
- GET /dashboard - Dashboard summary data

#### Visit Summaries (/api/visit-summaries) - Provider Side
- GET / - List all visit summaries
- GET /:id - Get single summary
- POST / - Create visit summary
- POST /auto-generate - Auto-generate from encounter
- PUT /:id - Update summary
- POST /:id/release - Release to patient portal
- POST /:id/unrelease - Hide from patient portal
- DELETE /:id - Delete summary

## Frontend Implementation

### Context
- **PatientPortalAuthContext**: Authentication state management
  - Login/logout/register functions
  - Session token management
  - localStorage persistence
  - Auto-redirect on 401

### Components Created
1. **PatientPortalLayout**: Main layout with sidebar navigation
2. **PortalLoginPage**: Patient login interface
3. **PortalDashboardPage**: Dashboard with quick stats
4. **PortalAppointmentsPage**: View upcoming/past appointments
5. **PortalVisitSummariesPage**: View released visit summaries
6. **PortalDocumentsPage**: View/download shared documents
7. **PortalHealthRecordPage**: Comprehensive health information
8. **PortalProfilePage**: Update profile and change password

### Styling
- ModMed purple theme (#7c3aed, #6B46C1)
- Clean, modern, patient-friendly design
- Fully responsive (mobile, tablet, desktop)
- Large touch targets for mobile
- Accessible (WCAG 2.1 AA compliant)

## Provider Workflow

### Sharing Documents with Patients
1. Navigate to Documents page
2. Select document
3. Click "Share with Patient"
4. Document appears in patient portal instantly
5. Patient notified (optional email notification)

### Releasing Visit Summaries
1. Complete encounter
2. Navigate to Visit Summaries
3. Click "Create from Encounter" or manually create
4. Review and edit summary
5. Click "Release to Portal"
6. Patient can immediately view in portal
7. Can unrelease if needed

## Patient Workflow

### First Time Registration
1. Patient visits portal URL
2. Clicks "Register"
3. Enters first name, last name, DOB
4. System verifies against patient records
5. Patient creates email/password
6. Email verification sent
7. Patient verifies email
8. Can now login

### Daily Usage
1. Login to portal
2. View dashboard with quick stats
3. Check upcoming appointments
4. Read new visit summaries
5. Download documents (lab results, etc)
6. View health record (medications, allergies, vitals)
7. Update contact information
8. Logout

## File Structure

### Backend
```
backend/
├── migrations/
│   └── 023_patient_portal.sql
├── src/
│   ├── middleware/
│   │   └── patientPortalAuth.ts
│   └── routes/
│       ├── patientPortal.ts
│       ├── patientPortalData.ts
│       └── visitSummaries.ts
```

### Frontend
```
frontend/src/
├── contexts/
│   └── PatientPortalAuthContext.tsx
├── components/
│   └── patient-portal/
│       └── PatientPortalLayout.tsx
└── pages/
    └── patient-portal/
        ├── PortalLoginPage.tsx
        ├── PortalDashboardPage.tsx
        ├── PortalAppointmentsPage.tsx
        ├── PortalVisitSummariesPage.tsx
        ├── PortalDocumentsPage.tsx
        ├── PortalHealthRecordPage.tsx
        ├── PortalProfilePage.tsx
        ├── PortalRegisterPage.tsx
        └── index.ts
```

## Security Considerations

### PHI Protection
- No PHI in URLs (only UUIDs)
- No PHI in logs
- All access logged to audit_log
- Tenant isolation strictly enforced
- Session tokens required for all API calls

### HIPAA Compliance
- Audit trail for all patient data access
- Secure session management
- Strong password requirements
- Account lockout on failed attempts
- Encrypted data transmission (HTTPS required in production)

## Deployment Notes

### Environment Variables Required
- VITE_API_URL: Backend API URL
- JWT_SECRET: Secret for session tokens
- TENANT_HEADER: X-Tenant-ID (default)

### Database Migration
Run migration: `psql -U postgres -d dermehr -f migrations/023_patient_portal.sql`

### HTTPS Requirement
**CRITICAL**: Patient portal MUST be deployed with HTTPS in production.
All communication contains PHI and must be encrypted.

## Testing

### Test Patient Account
After running migration, create test account:
- First Name: John
- Last Name: Doe
- DOB: 1990-01-01
- Email: john.doe@example.com
- Password: Test123!@#

### Test Scenarios
1. Register new account
2. Login with wrong password (test lockout after 5 attempts)
3. View dashboard
4. View appointments
5. Download document
6. View visit summary
7. Update profile
8. Logout

## Future Enhancements

### Potential Features
- Secure messaging with providers
- Appointment request/scheduling
- Prescription refill requests
- Bill pay integration
- Telemedicine integration
- Mobile app (React Native)
- Push notifications
- Two-factor authentication

## Support

For patient support:
- Phone: 1-800-555-0100
- Email: support@mountainpinederm.com
- Privacy Policy: [URL]
- Terms of Service: [URL]

---

**Implementation Date**: December 8, 2025
**Version**: 1.0.0
**Status**: Production Ready
