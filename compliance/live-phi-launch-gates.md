# Live-PHI Launch Gates

Last reviewed: 2026-08-31

Status: **NO-GO FOR REAL PATIENT DATA**

The Railway deployment is a synthetic-data pilot. The future real-patient deployment is AWS. This file is an engineering and compliance-readiness control list, not legal advice or a substitute for accountable privacy, security, practice, and healthcare-counsel approval.

## What is ready

- The hardening branch's technical release gate is green, including lint, security scans, backend and frontend suites, route contracts, browser smoke tests, and disposable PostgreSQL migration/backup regressions.
- AWS BAA evidence exists for account `213598696247`.
- AWS HealthScribe/Transcribe, S3, KMS, temporary-object cleanup, 1-day lifecycle backstops, encrypted backups, 90-day backup retention, and a successful disposable restore drill are documented.
- OpenAI calls fail closed without provider BAA attestation and API-call enablement. Chat requests force `store:false`. Production requests also require exact endpoint and model allowlists; raw audio has a separate disabled-by-default gate.
- Twilio, Stedi live traffic, transactional email, fax, e-prescribing/prior authorization, Sentry, and synthetic production fallbacks remain disabled or fail closed unless their own activation evidence exists.

## External blockers

1. **OpenAI agreement and provisioning:** obtain the executed OpenAI Business Associate and Healthcare Addendum for organization `org-j77W6L5lwWAkHLIDvKYySq9q`; verify the exact data-control provisioning, endpoints, and models. Do not enable OpenAI raw audio for this architecture.
2. **Customer contract:** execute a BAA and services agreement with each dermatology practice before creating or converting that practice's tenant to real patient data.
3. **AWS privileged access:** verify MFA for every privileged human identity, eliminate routine root use, inventory access keys, and retain the review evidence.
4. **AWS audit operations:** verify organization/account CloudTrail coverage, protected log storage, alerting, named review owner, and an actual review cadence.
5. **AWS application environment:** provision the approved compute, managed PostgreSQL, cache, network, TLS, DNS, secrets, monitoring, and backup schedule; run migrations and readiness checks against the exact deployed configuration.
6. **Human approval:** obtain named privacy-officer, security-officer, practice-owner, and healthcare-counsel go-live approval based on the final architecture and contracts.

## Intentionally disabled capabilities

- Railway real patient data
- OpenAI raw audio
- E-prescribing and electronic prior authorization
- Twilio patient messaging
- Live Stedi eligibility/claims/ERA traffic
- Transactional patient email
- External fax
- Sentry or other third-party telemetry that could receive PHI

Disabled capabilities are not launch blockers if the production workflow and user interface clearly keep them unavailable. Enabling any one later requires a new scoped vendor, security, privacy, and integration review.

## Activation sequence

1. Collect executed agreement and provisioning artifacts in the confidential local agreement repository; commit only non-confidential references.
2. Configure AWS infrastructure without real patient data and use managed secrets, least-privilege roles, TLS, encryption, audit logging, and backups.
3. Run migrations, strict readiness, full release CI, backup/restore, security, accessibility, and browser verification against synthetic data.
4. Enter only evidence-backed vendor flags and exact allowlists. Never copy a signature or status from an email subject line alone.
5. Obtain written human approval and record the decision, scope, date, owners, and rollback plan.
6. Activate a single approved practice tenant, monitor closely, and expand only after the pilot review passes.
