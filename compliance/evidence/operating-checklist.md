# HIPAA Operating Checklist

Last technical release review: 2026-08-27
Last practice-owner attestation recorded: 2026-05-24
Owner: Practice administrator and compliance officer
Scope: Dermatology EHR staging and production operations

This checklist is the operating control list for a practice using the system with real patient data. It supports readiness review; it is not legal advice and should be reviewed with counsel before go-live.

## Daily Controls

- Verify failed login, access-denied, AI guardrail, claim release, prescription, SMS, and patient-record audit events are being captured.
- Confirm the Command Center and Clinical Inbox do not hide source failures as zero-count queues.
- Review post-visit coding work for unsigned notes, unconfirmed diagnosis codes, missing CPT codes, unlinked diagnoses, and unreleased claims.
- Review lab/pathology and critical-result queues for unresolved results and patient-notification status.
- Review outbound communication queues for SMS opt-out handling and failed delivery.
- Confirm backup jobs and error monitoring reported successfully for the prior day.

## Weekly Controls

- Reconcile claims, ERA/EFT, patient payments, store payments, adjustments, and collections totals.
- Review open access requests and role changes for least-privilege fit.
- Spot-check five completed visits for note signature, diagnosis confirmation, charge linkage, claim status, and patient-facing records.
- Review unresolved accessibility accommodation requests and kiosk or portal support issues.
- Confirm vendor dashboards for SMS, clearinghouse, voice/ambient transcription, storage, and payment processing have no unresolved production-impacting incidents.

## Monthly Controls

- Recertify admin, provider, billing, front desk, clinical, manager, and compliance role access.
- Export and retain audit-log evidence for access changes, billing release activity, AI-assisted clinical updates, SMS consent, and patient portal activity.
- Run accessibility smoke checks for login, patient portal, booking, intake, schedule, patients, Command Center, and coding review.
- Review incident response contacts, breach triage owner, and escalation path.
- Verify restore drill evidence or backup integrity checks are current.
- Review vendor BAA inventory for Railway, AWS, voice/ambient transcription, SMS, clearinghouse/eligibility, fax, e-prescribing/prior authorization, payment processor, email, error monitoring, and any AI provider used with PHI.

## Vendor Status Snapshot

| Vendor / capability | Operating status | Evidence needed before live PHI |
| --- | --- | --- |
| Railway synthetic-only pilot | Test deployment target; real patient data prohibited | Monthly confirmation that only synthetic data is present; execute a Railway BAA and reassess before any scope change to PHI |
| AWS storage and hosting | Configured as HIPAA-capable infrastructure | Signed BAA, encryption, backup, logging, access review |
| Voice / ambient transcription | Configured for healthcare workflow | Signed BAA and live-region configuration evidence |
| SMS texting | Credentials configured; approval status checked separately | 10DLC/toll-free approval evidence, opt-in language, privacy/terms pages |
| Stedi eligibility / clearinghouse | Test integration configured | Production enrollment, payer trading partner approvals, claim/ERA test evidence |
| Stripe payments | Customer-owned account connection pattern | Connected account onboarding evidence and no stored bank credentials |
| OpenAI or AI assistant provider | PHI egress blocked because agreement is not executed; endpoint/model and raw-audio gates added | Executed Business Associate and Healthcare Addendum, exact organization provisioning, eligible endpoint/model evidence, warning logs, and user training |
| Phaxio fax | Integration implemented but not approved for live PHI | Signed BAA and HIPAA account/configuration evidence |
| eRx | Deferred until vendor/client onboarding | eRx vendor contract, identity proofing, EPCS controls if controlled substances |

## Go-Live Sign-Off Gates

- No production PHI is entered until vendor BAAs and customer terms are signed.
- Each user role has explicit module and Command Center permissions reviewed.
- Idle logout is set to 5 minutes unless counsel/customer policy sets a shorter value.
- AI assistant mode is either BAA-covered or configured to block/interrupt likely PHI before submission.
- SMS cannot be used for patient care until consent capture, STOP/HELP handling, delivery logging, privacy policy, terms, and carrier approval evidence are in place.
- Accessibility issue register has no open patient-facing critical blocker.
- Incident response owner, data export process, backup process, and audit-log retention are assigned.
- Backup retention matches an approved data-retention/disaster-recovery policy; do not infer that HIPAA's six-year compliance-document retention rule mandates six years of every database backup.

## 2026-05-24 Review Notes

- Added post-visit coding review as a role-controlled queue for providers, medical assistants, nurses, billing, managers, admins, and compliance officers.
- Confirmed 5-minute idle timeout exists in the frontend session manager unless overridden by `VITE_SESSION_IDLE_TIMEOUT_MINUTES`.
- Added this checklist to the automated staging readiness evidence set.

## 2026-08-26 Release Review Notes

- Ran the full release verification for PR #8: frontend and backend suites, authorization/browser smoke coverage, migration checks, route contracts, lint, security scans, TypeScript, and production builds.
- Verified the Railway pilot API health endpoints and visually inspected the authenticated Clinical Inbox on desktop and 390-pixel mobile layouts without console errors or horizontal overflow.
- Rehearsed the technical access-control and incident-response evidence described in the 2026-08-26 entries of the access review and tabletop records.
- No live PHI was entered or changed during this release review; the browser data used for workflow mutation testing was synthetic and restored after the check.
- This technical review does not attest that a human operator completed the daily vendor-dashboard checks, backup-job review, named-user recertification, legal contact validation, or live vendor/BAA sign-off. Those remain the responsibility of the practice administrator and compliance officer before live-PHI go-live.
