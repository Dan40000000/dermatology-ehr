# HIPAA-Safe AI Data Migration Plan

This plan governs legacy EMR imports, data cleanup, and AI-assisted mapping work.

## Baseline Rule

Do not put production PHI into Codex, ChatGPT, Claude, or another external AI tool unless all of these are true:

- Perry Software has a signed BAA or applicable healthcare addendum with the vendor for the exact product surface being used.
- The workflow is configured for the covered mode required by that BAA.
- The customer contract allows that subcontractor and the customer has been told which vendors process ePHI.
- Access, logging, retention, and deletion controls are documented before data is processed.

If any item is missing, AI can only be used on de-identified, synthetic, or tokenized data.

## Approved Migration Pattern

1. Receive exports into an encrypted migration workspace controlled by Perry Software.
2. Run deterministic import scripts locally or inside the covered cloud environment.
3. Generate a de-identified schema/sample package by removing direct identifiers and replacing patient/provider keys with temporary tokens.
4. Use AI only for non-PHI tasks: field mapping, parser suggestions, validation-rule drafting, duplicate-detection logic, and exception explanations.
5. Apply AI-generated mapping logic back inside the controlled migration workspace.
6. Run validation reports that show counts, rejects, unmapped fields, and checksum totals without exposing PHI in logs.
7. Import into the customer tenant only after a human signs off on the migration report.

## PHI Handling Rules

- Never paste raw patient rows, insurance member IDs, phone numbers, SSNs, images, notes, PDFs, or appointment histories into non-covered AI tools.
- Logs must redact patient names, DOBs, addresses, phone numbers, emails, member IDs, claim numbers, prescription identifiers, and clinical note text.
- Migration errors should reference internal row IDs or tokenized identifiers, not patient names.
- Store source exports separately from transformed imports and delete or archive source files according to the customer agreement.

## AI Use Cases That Are Safe Without PHI

- Map CSV column names from de-identified headers.
- Draft ETL code from synthetic sample rows.
- Explain validation failures using redacted examples.
- Build import checklists and reconciliation reports.
- Create synthetic test patients that match the legacy system's shape without matching real patients.

## AI Use Cases That Require A BAA-Covered Workflow

- Summarizing real clinical notes.
- Reading real chart PDFs or images.
- Normalizing real medication, diagnosis, billing, insurance, or claims data when tied to identifiable patients.
- Matching duplicate patients from real names, DOBs, addresses, phone numbers, or member IDs.
- Any troubleshooting where a vendor can see production ePHI.

## Go-Live Checklist

- Customer BAA and Perry Software subcontractor list are complete.
- Vendor BAA coverage is confirmed for each AI surface used.
- Migration workspace encryption and access controls are enabled.
- Import scripts run without sending PHI to non-covered services.
- Redaction tests pass for logs and error reports.
- A reconciliation report is saved for patients, appointments, notes, diagnosis codes, charges, claims, payments, inventory, and documents.
- Source export retention/deletion date is documented.
