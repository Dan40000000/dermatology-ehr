# EMA Blueprint Gap Analysis (Repo vs ModMed Docs)

## Sources Reviewed
- /Users/danperry/Downloads/ModMed_EMA_Documentation/complete_module_list.md
- /Users/danperry/Downloads/ModMed_EMA_Documentation/ModMed_EMA_Comprehensive_Feature_Report.md
- /Users/danperry/Downloads/ModMed_EMA_Documentation/MASTER_Engineering_Specification.md
- /Users/danperry/Downloads/ModMed_EMA_Documentation/technical_specs_ui_ux_design.md
- /Users/danperry/Downloads/ModMed_EMA_Documentation/technical_specs_fhir_api.md
- /Users/danperry/Downloads/ModMed_EMA_Documentation/technical_specs_hl7_integrations.md
- /Users/danperry/Downloads/ModMed_EMA_Documentation/technical_specs_chargeitem_financial.md

Repo reviewed: /Users/danperry/Desktop/Dermatology program/derm-app

---

## Module Parity (29 Modules)

Status legend: Implemented = working UI + backend, Partial = UI or backend only / limited, Missing = no module

| Module | Status | Notes |
| --- | --- | --- |
| Home | Partial | Dashboard exists; note actions and some filters are present but not full parity. |
| OfficeFlow | Partial | UI exists; room/resource workflows and real-time status parity not confirmed. |
| Schedule | Partial | UI exists; time blocks and waitlist are present but not full parity (recurrence/resource rules). |
| Appt Flow | Partial | UI exists; end-to-end status flows need validation. |
| Tasks | Partial | UI exists; automation and role policies incomplete. |
| Patients | Partial | Core pages exist; advanced demographics/eligibility workflows incomplete. |
| Rx | Partial | eRx present; EPCS, formulary, and payer PA integrations incomplete. |
| Mail | Partial | UI and API exist; routing and Direct interoperability incomplete. |
| Document Mgmt | Partial | UI exists; indexing, OCR, and workflow routing incomplete. |
| Orders | Partial | UI exists; lab/imaging vendor integrations incomplete. |
| Path / Labs | Partial | Lab orders/results exist; pathology integration limited. |
| Radiology / Other | Partial | UI exists; imaging vendor integration missing. |
| Reminders | Partial | UI exists; multi-channel automation incomplete. |
| Analytics | Partial | UI exists; benchmarking and data explorer parity missing. |
| Telehealth | Partial | UI exists; production-grade video workflow not confirmed. |
| Inventory | Partial | UI exists; full POS/dispensing workflows not confirmed. |
| Financials | Partial | UI exists; ERA/EFT, denial management, statements incomplete. |
| Quotes | Partial | UI exists; workflow integration incomplete. |
| Recalls | Partial | Backend exists; UI is placeholder. |
| Admin | Partial | Page exists; enterprise SSO and deep settings parity missing. |
| Reports | Partial | Report endpoints and UI exist; report library parity unknown. |
| Quality | Partial | Measures and MIPS submission exist; full QPP parity unknown. |
| Registry | Missing | Placeholder UI only, no data model or workflows. |
| Referrals | Missing | Placeholder UI only, no data model or workflows. |
| Forms | Missing | No standalone Forms module in navigation. |
| Protocols | Missing | Placeholder UI only, no protocol engine. |
| Templates | Partial | Note templates page exists but not exposed in nav. |
| Preferences | Missing | Placeholder UI only. |
| Help | Missing | Placeholder UI only. |

---

## Clinical Workflow Gaps

- Adaptive learning UI is not surfaced in clinical documentation flows.
- Touch-first/tap-and-go workflows (gestures, split views) are not implemented.
- Visual exam tooling exists (body diagram, photos) but lacks iPad-first UX and advanced annotation parity.
- Coding suggestions and charge capture linkage are limited vs blueprint.

---

## Patient Engagement Gaps

- Patient portal exists, but end-to-end patient collaboration (routing, tasking, self-service flows) is partial.
- Kiosk/check-in is present but parity with EMA intake sequencing and validation is incomplete.
- Appointment reminders and recall automation lack full multi-channel rule sets.

---

## Integration Gaps

### FHIR R4
- Only a subset of resources is implemented (Patient, Practitioner, Encounter, Observation, Condition, Procedure, Appointment, Organization).
- Missing resources from blueprint: AllergyIntolerance, CarePlan, CareTeam, Coverage, Device, DiagnosticReport, DocumentReference, Goal, Immunization, Location, Medication, MedicationRequest, PractitionerRole, Provenance, RelatedPerson, ServiceRequest.
- Bulk export ($export) and app registration/consent flows are missing.

### HL7 v2.x
- Inbound parsing exists but full ADT/SIU/DFT/ORM/ORU coverage is incomplete.
- No MLLP listener or durable delivery pipeline for external interfaces.

### eRx / Pharmacy / Lab / Imaging
- eRx exists but EPCS, formulary, and payer interactions are not complete.
- Lab/radiology interfaces are mock or partial; vendor routing and results normalization are incomplete.

### Direct Messaging / Fax
- Direct messaging and fax routes exist; external vendor integration and delivery guarantees are not complete.

---

## Financial and RCM Gaps

- ChargeItem/financial workflows are partial vs blueprint (claim scrubbing, ERA/EFT, denial workflows, statements).
- Clearinghouse integration appears stubbed; inbound/outbound claim lifecycle is not end-to-end.

---

## Security / Compliance / Multi-Tenancy

- RBAC exists but comprehensive permission matrix for modules is incomplete.
- Multi-tenant isolation uses tenant_id; schema-per-tenant parity not implemented.
- Enterprise SSO (Keycloak/SAML), MFA, and IP allowlisting are not implemented.

---

## Priority Recommendations

1. Module parity: Forms, Registry, Referrals, Protocols, Preferences, Help, Recalls workflow UI.
2. FHIR/HL7 parity: expand resources and message support; add bulk export and MLLP listener.
3. Clinical UX: adaptive learning surfacing + touch-first patterns.
4. Financial/RCM: claims lifecycle, ERA/EFT, payment posting, denial management.

