# Old Suggestions Status

Last reviewed: 2026-05-12

## Implemented In This Pass

- Added a dedicated charge-capture role gate so providers and MAs can add encounter charges without receiving full financial dashboard access.
- Parameterized HL7 retry backoff interval math so retry scheduling no longer embeds computed values into SQL text.
- Tightened event-bus interval math to use typed numeric interval multiplication instead of SQL string-to-interval conversion.
- Added built-in dermatology CPT/ICD medical-necessity warnings for common claim lines including biopsy, Mohs, lesion excision/destruction, dermatopathology, patch testing, phototherapy, and intralesional injection.

## Already Covered In The Current App

- Registry/reminders have been consolidated under the reminders workflow.
- Referrals, protocols, help/training, preferences, and document/form workflows are now real app surfaces instead of placeholders.
- SSN storage uses encrypted/last-4 fields, and plaintext SSN storage is blocked by migration.
- Insurance charges without diagnosis codes are blocked before claim creation.
- Public bill pay and patient payment flows now post back into the financial workflow.

## Still Later Work

- Consolidate billing into one authoritative revenue-cycle ledger across charges, claims, bills, payments, adjustments, statements, and collections.
- Replace the built-in payer-neutral medical-necessity warnings with payer/LCD-specific rule imports when the practice chooses a clearinghouse/payer-policy data source.
- Continue vendor-specific work only after real credentials/contracts are chosen for eligibility, eRx, prior auth, payments, clearinghouse, and messaging.
- Add broader end-to-end CI coverage once the local/cloud test data and deployment state are stabilized.
