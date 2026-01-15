# Gap Analysis: ModMed EMA vs Derm-App

## Executive Summary

This document provides a comprehensive feature comparison between ModMed EMA (Modernizing Medicine's dermatology EMR) and the derm-app currently in development. The analysis identifies features present in ModMed that need to be implemented or enhanced in derm-app.

---

## Module-by-Module Comparison

### 1. HOME / DASHBOARD

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Quick Actions (New Patient, CSV, Reminder) | Yes | Partial | **GAP** |
| Regulatory Reporting button | Yes | No | **GAP** |
| Note History with advanced filters | Yes | Partial | **GAP** |
| Filter by Note Status (Pending Results, Plan Completion, etc.) | Yes | No | **GAP** |
| Filter by Note Type | Yes | No | **GAP** |
| Filter by Author/Assigned To/Facility | Yes | No | **GAP** |
| Visit Code display | Yes | No | **GAP** |
| My Finalized Notes tab | Yes | No | **GAP** |
| Download Notes bulk action | Yes | No | **GAP** |
| Review and Finalize action | Yes | No | **GAP** |
| Print Table functionality | Yes | No | **GAP** |

### 2. OFFICEFLOW

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| OfficeFlow board view | Yes | Yes | OK |
| Facility filter | Yes | Partial | **ENHANCE** |
| Provider filter | Yes | Yes | OK |
| Patient search | Yes | Yes | OK |
| Call Button functionality | Yes | No | **GAP** |
| Status filters | Yes | Partial | **ENHANCE** |
| Rooms management | Yes | No | **GAP** |

### 3. SCHEDULE / APPOINTMENTS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Today button | Yes | Yes | OK |
| Date picker | Yes | Yes | OK |
| Day/Week view toggle | Yes | Partial | **ENHANCE** |
| Hide Events option | Yes | No | **GAP** |
| Show Deleted Blocks | Yes | No | **GAP** |
| Face Sheets quick access | Yes | No | **GAP** |
| Create Time Block | Yes | No | **GAP** |
| Appointment Finder | Yes | No | **GAP** |
| Expanded Appointment Finder | Yes | No | **GAP** |
| Location/Provider/Resources filters | Yes | Partial | **ENHANCE** |
| 5-minute time slot granularity | Yes | Unknown | **VERIFY** |

### 4. APPT FLOW (Master Check-in)

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Appointment Flow board | Yes | Yes | OK |
| Check-in management | Yes | Partial | **ENHANCE** |

### 5. PATIENTS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Register New Patient button | Yes | Yes | OK |
| Advanced Search | Yes | No | **GAP** |
| Patient Handout Library | Yes | Yes | OK |
| Search by Name/MRN/DOB | Yes | Partial | **ENHANCE** |
| Patient Status filter (Active/Inactive) | Yes | No | **GAP** |
| Quick Create New Patient form | Yes | Yes | OK |
| Preferred Name column | Yes | No | **GAP** |
| PMS ID column | Yes | No | **GAP** |
| Established Patient flag | Yes | Partial | **ENHANCE** |
| Patient list pagination (5/10/25/50/100) | Yes | Yes | OK |
| Dropdown: Register Patient, Advanced Search, Reports | Yes | Partial | **GAP** |

### 6. RX / PRESCRIPTIONS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Rx Overview tab | Yes | Yes | OK |
| ePA (Electronic Prior Auth) tab | Yes | Yes | OK |
| Refill Requests tab | Yes | No | **GAP** |
| Refill Req. Denied with New Rx to follow | Yes | No | **GAP** |
| Rx Change Requests tab | Yes | No | **GAP** |
| Rx Audit Confirmation tab | Yes | No | **GAP** |
| Add New Rx button | Yes | Yes | OK |
| ePrescribe Selected bulk action | Yes | No | **GAP** |
| Refill Selected bulk action | Yes | No | **GAP** |
| Print Selected bulk action | Yes | No | **GAP** |
| Filter by Provider | Yes | Partial | **ENHANCE** |
| Filter by Written Date range | Yes | No | **GAP** |
| Filter by Status (Pending/Printed/eRx/Voided/Canceled) | Yes | Partial | **ENHANCE** |
| Filter by eRx status (Pending/Errors/Success) | Yes | No | **GAP** |
| Controlled Substance filter | Yes | No | **GAP** |
| ePA Status column | Yes | Partial | **ENHANCE** |

### 7. MAIL / INTRAMAIL

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| IntraMail (internal messaging) | Yes | Yes | OK |
| Inbox/Drafts/Sent/Archived | Yes | Partial | **ENHANCE** |
| Intramail Settings | Yes | No | **GAP** |
| Direct Mail (secure external) | Yes | Yes | OK |
| Direct Mail Inbox/Sent/Archived | Yes | Partial | **ENHANCE** |
| Patient Authorizations | Yes | No | **GAP** |
| New Message button | Yes | Yes | OK |
| Archive bulk action | Yes | No | **GAP** |
| Mark Read/Unread bulk actions | Yes | No | **GAP** |
| Flag/Unflag actions | Yes | No | **GAP** |
| Filter by From/Date/Flagged/Priority/Patient/Read/Subject | Yes | Partial | **GAP** |
| Hide Filters toggle | Yes | No | **GAP** |

### 8. DOCUMENT MANAGEMENT

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Upload New Attachments | Yes | Partial | **ENHANCE** |
| Associate Attachments with Patients | Yes | Partial | **ENHANCE** |
| Manage Referral Contacts | Yes | Yes | OK |
| Manage Physician Specialties | Yes | No | **GAP** |
| Import CQM Category 1 Files | Yes | No | **GAP** |
| View Faxes Pending Approval | Yes | Partial | **ENHANCE** |
| Pending Patient Authorization | Yes | No | **GAP** |
| Sent/Received/Archived Faxes | Yes | Yes | OK |
| Add New Consent Form | Yes | Partial | **ENHANCE** |
| Manage Consent Forms | Yes | Partial | **ENHANCE** |

### 9. ORDERS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Orders Log view | Yes | Yes | OK |
| Filters panel | Yes | Partial | **ENHANCE** |
| My Quick Filters (saved filters) | Yes | No | **GAP** |
| Filter by Patient/Provider/Facility | Yes | Partial | **ENHANCE** |
| Filter by Perform At | Yes | No | **GAP** |
| Filter by Workflow Status | Yes | Partial | **ENHANCE** |
| Filter by Insurance Name | Yes | No | **GAP** |
| Filter by Order Req Number | Yes | No | **GAP** |
| Filter by Order Notes | Yes | No | **GAP** |
| Order Associated to Case checkbox | Yes | No | **GAP** |
| Order Type filters (Follow Up, Infusion, Injection, Labs, Pathology, Radiology, Referral, Surgery) | Yes | Partial | **ENHANCE** |
| Date filters (Order/Scheduled/Due/Sent) | Yes | Partial | **ENHANCE** |
| Priority filters (Normal/High/STAT) | Yes | No | **GAP** |
| Status filters (Open/Sent/In Progress/Closed/Canceled) | Yes | Partial | **ENHANCE** |
| Group By (None/Patient/Provider) | Yes | No | **GAP** |
| Select Action bulk operations | Yes | No | **GAP** |
| Refresh View button | Yes | No | **GAP** |

### 10. PATH / LABS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Path tab | Yes | Yes | OK |
| Lab tab | Yes | Yes | OK |
| Sub-tabs: Pending Results, Pending Plan Completion, Completed, Unresolved | Yes | Yes | OK |
| Filter by Provider/Patient | Yes | Partial | **ENHANCE** |
| Facility filter (Preferred/All + dropdown) | Yes | No | **GAP** |
| Entry Date filter | Yes | No | **GAP** |
| Results Processed Date filter | Yes | No | **GAP** |
| Add Manual Entry button | Yes | Yes | OK |
| Print Table button | Yes | No | **GAP** |
| Move to Unresolved action | Yes | No | **GAP** |
| Ddx (Differential Diagnosis) column | Yes | No | **GAP** |
| Photos column | Yes | Partial | **ENHANCE** |

### 11. RADIOLOGY / OTHER

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Results view | Yes | Yes | OK |
| Filters panel | Yes | Partial | **ENHANCE** |
| Select Columns customization | Yes | No | **GAP** |
| My Quick Filters (create/save) | Yes | No | **GAP** |
| Filter by Vendor | Yes | No | **GAP** |
| Filter by Processed By | Yes | No | **GAP** |
| Results Type (Procedures/Radiology/PT-OT) | Yes | Partial | **ENHANCE** |
| Results Status (Preliminary/Final/Correction) | Yes | Partial | **ENHANCE** |
| Workflow Status (8 states including Legacy) | Yes | Partial | **ENHANCE** |
| Results Flag (Benign/Inconclusive/Precancerous/Cancerous/Normal/Abnormal/Low/High/Out of Range/Panic Value/None) | Yes | No | **GAP** |
| Date filters (Received/Performed/Collected) | Yes | Partial | **ENHANCE** |
| Unassociated filters | Yes | No | **GAP** |
| Group By Patient | Yes | No | **GAP** |
| Portal column | Yes | No | **GAP** |

### 12. ANALYTICS / REPORTS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Financials reports tab | Yes | Yes | OK |
| Clinical and Operational tab | Yes | Partial | **ENHANCE** |
| Compliance tab | Yes | No | **GAP** |
| Inventory reports tab | Yes | No | **GAP** |
| Financial Reports dashboard (Qlik) | Yes | No | **GAP** |
| Data Explorer (custom reports) | Yes | No | **GAP** |
| Compliance Reports | Yes | No | **GAP** |
| Charges report | Yes | Partial | **ENHANCE** |
| Outstanding Charges report | Yes | No | **GAP** |
| Payments Received report | Yes | Partial | **ENHANCE** |
| Refunds Issued report | Yes | No | **GAP** |

### 13. FINANCIALS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Bills tab | Yes | Yes | OK |
| Claims tab | Yes | Yes | OK |
| Payer Payments tab | Yes | No | **GAP** |
| Patient Payments tab | Yes | Partial | **ENHANCE** |
| Statements tab | Yes | No | **GAP** |
| Batches tab | Yes | No | **GAP** |
| Practice selector dropdown | Yes | No | **GAP** |
| Key Metrics section (New Bills, In Progress Bills) | Yes | No | **GAP** |
| All filters panel | Yes | Partial | **ENHANCE** |
| Service Date presets (Current Day, etc.) | Yes | No | **GAP** |
| Customize Columns | Yes | No | **GAP** |
| Bulk Actions | Yes | No | **GAP** |

### 14. INVENTORY

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Preferred Cabinets tab | Yes | No | **GAP** |
| Cabinets management | Yes | Partial | **ENHANCE** |
| Filter functionality | Yes | Partial | **ENHANCE** |
| Facility association | Yes | No | **GAP** |

### 15. TELEHEALTH

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Current Telehealth Stats dashboard | Yes | No | **GAP** |
| Cases in progress count | Yes | No | **GAP** |
| Completed cases count | Yes | No | **GAP** |
| Unread messages count | Yes | No | **GAP** |
| Unassigned Cases count | Yes | No | **GAP** |
| Telehealth Cases grid | Yes | Yes | OK |
| Date presets (Current Day/Yesterday/Last 7/31 Days/All Time) | Yes | No | **GAP** |
| Filter by Status (New Visit/In Progress/Completed) | Yes | Partial | **ENHANCE** |
| Filter by Assigned To | Yes | No | **GAP** |
| Filter by Physician | Yes | Partial | **ENHANCE** |
| Filter by Patient | Yes | Yes | OK |
| Reason dropdown (dermatology-specific: Acne, Changing Mole, Eczema, Psoriasis, Rash, etc.) | Yes | No | **GAP** |
| My Unread Only filter | Yes | No | **GAP** |

### 16. QUOTES

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Quotes list | Yes | Yes | OK |
| Quote Favorites tab | Yes | No | **GAP** |
| Create Quote button | Yes | Yes | OK |
| Filters panel | Yes | Partial | **ENHANCE** |
| Patient Search | Yes | Yes | OK |
| Quote Title column | Yes | Yes | OK |
| Procedures column | Yes | Partial | **ENHANCE** |
| Responsible Party column | Yes | No | **GAP** |
| Practice selector dropdown | Yes | No | **GAP** |

### 17. RECALLS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Recalls Home view | Yes | Yes | OK |
| Filters panel | Yes | Partial | **ENHANCE** |
| Export Selected | Yes | No | **GAP** |
| Batch Action Update | Yes | No | **GAP** |
| Due column | Yes | Yes | OK |
| Recall ID column | Yes | Yes | OK |
| Recall Type column | Yes | Yes | OK |
| Preferred Phone column | Yes | No | **GAP** |
| Last Action column | Yes | No | **GAP** |

### 18. TASKS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Received tab | Yes | Partial | **ENHANCE** |
| Sent tab | Yes | Partial | **ENHANCE** |
| All Tasks tab | Yes | Partial | **ENHANCE** |
| Filters panel | Yes | Partial | **ENHANCE** |
| Manage Quick Tasks | Yes | No | **GAP** |
| Create New Task button | Yes | Yes | OK |
| Dropdown: Create New Task, Manage Tasks | Yes | Partial | **ENHANCE** |

### 19. REMINDERS

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Reminders list | Yes | Yes | OK |
| Filter by Status (Due and Past Due) | Yes | No | **GAP** |
| Filter by Patient | Yes | Yes | OK |
| Filter by Reminder Type | Yes | No | **GAP** |
| Filter by Provider | Yes | Partial | **ENHANCE** |
| Reminder Date Range | Yes | No | **GAP** |
| Notify Patient bulk action | Yes | No | **GAP** |
| Doctor's Note column | Yes | No | **GAP** |
| Preferred Contact Method column | Yes | No | **GAP** |
| Notified On column | Yes | No | **GAP** |

---

## Navigation & Global Features

| Feature | ModMed EMA | Derm-App | Gap Status |
|---------|-----------|----------|------------|
| Global Patient Search in header | Yes | Yes | OK |
| Supervisor selector | Yes | No | **GAP** |
| Feedback link | Yes | No | **GAP** |
| Help link | Yes | Yes | OK |
| ScribeMaster integration | Yes | No | **GAP** |
| Customer Portal link | Yes | No | **GAP** |
| Preferences link | Yes | Yes | OK |
| My Account dropdown | Yes | Partial | **ENHANCE** |
| Dropdown menus on nav items | Yes | Yes | OK |

---

## Priority Implementation Recommendations

### High Priority (Core Functionality Gaps)

1. **Rx Module Enhancements**
   - Add Refill Requests tab
   - Add Rx Change Requests tab
   - Implement ePrescribe/Refill/Print bulk actions

2. **Orders Filters**
   - Implement My Quick Filters (saved filters)
   - Add Order Type checkboxes
   - Add Priority filters (Normal/High/STAT)

3. **Financials Module**
   - Add Payer Payments tab
   - Add Statements tab
   - Add Batches tab
   - Implement Key Metrics dashboard

4. **Telehealth Stats Dashboard**
   - Add case statistics cards
   - Implement dermatology-specific reason dropdown

5. **Results Flags**
   - Implement comprehensive result flags (Benign, Precancerous, Cancerous, etc.)

### Medium Priority (Workflow Enhancements)

1. **Advanced Search** for Patients
2. **Appointment Finder** and **Time Block** creation
3. **Quick Filters** system across all modules
4. **Bulk Actions** throughout (Mark Read/Unread, Export, Archive)
5. **Column Customization** for grids
6. **CQM/Compliance** reporting

### Lower Priority (Nice to Have)

1. ScribeMaster integration
2. Customer Portal link
3. Supervisor selector
4. Hide Events in Schedule
5. Practice selector dropdowns

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Total Features Analyzed** | ~200+ |
| **Features OK (Implemented)** | ~60 |
| **Features Needing Enhancement** | ~45 |
| **Features Missing (GAP)** | ~95+ |
| **Features to Verify** | ~5 |

---

## Next Steps

1. Review this gap analysis with stakeholders
2. Prioritize features based on user needs
3. Create detailed user stories for each GAP item
4. Estimate development effort
5. Create implementation roadmap
6. Begin development sprints

---

*Document generated: January 15, 2026*
*ModMed EMA Version analyzed: 7.12.6*
