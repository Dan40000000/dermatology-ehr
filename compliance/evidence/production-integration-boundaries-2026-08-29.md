# Production Integration Boundary Evidence

Verified: 2026-08-29 UTC

Environment reviewed: Railway project `97cf6144-5c9f-4156-b9e9-7f6a8286f8dd`, production environment `d3b46649-ce15-4fb0-871a-0d5885965428`, API service `830ece71-d176-4928-9c4a-37c6def7f5c1`.

No secret values are recorded in this artifact. The production variable-name inventory, non-secret feature flags, and non-PHI integration-mode metadata were reviewed through the Railway dashboard, authenticated Railway CLI, and read-only database queries. The platform owner states that production contains no real patient data.

## Disabled vendor boundaries

| Vendor or workflow | Production configuration evidence | Application enforcement | Current determination |
| --- | --- | --- | --- |
| Sentry | `SENTRY_DSN` is absent from the production API service. | `backend/src/lib/sentry.ts` returns without initializing Sentry when the DSN is absent. | Sentry does not currently receive application telemetry. A BAA or an approved and tested no-PHI boundary is required before enabling it. |
| Phaxio / external fax | `PHAXIO_API_KEY`, `PHAXIO_API_SECRET`, and `PHAXIO_FROM_NUMBER` are absent. | Commit `b864db2d3facffc72cb009588e8abea23c5a2ed8` blocks synthetic external adapters in production and returns service-unavailable before the legacy fax route records a simulated transmission. A non-mock Phaxio adapter also fails when credentials are absent. | No external fax vendor currently creates, receives, maintains, or transmits PHI. A vendor agreement, BAA, credentialed account, and end-to-end validation are required before activation. |
| E-prescribing and electronic prior authorization | No production e-prescribing/prior-auth provider selection or credentials are configured. The platform owner confirmed these workflows are not set up. | Commit `b864db2d3facffc72cb009588e8abea23c5a2ed8` blocks explicit/default mock providers, direct Surescripts scaffolding, and mock prior-auth factories and methods in production. | No e-prescribing or prior-auth network currently receives PHI. Vendor contracting, identity proofing, certification, BAA review as applicable, and EPCS controls are required before activation. |
| Twilio SMS and voice | The production database has one active, live-mode Twilio configuration, but `TWILIO_BAA_ENABLED` is unset. | Commit `fd841a67afbb8cd2cc5278fb896cd4232ebdbae6` adds a production BAA gate at the shared `TwilioService` SMS and voice egress methods. Credentials and `SMS_LIVE_SEND_ENABLED` cannot bypass the gate. | The release target cannot send through Twilio until an effective BAA is verified and the exact production account is intentionally attested. Twilio remains prohibited for PHI until then. |
| Stedi eligibility | The active eligibility integration is `provider=stedi`, `environment=sandbox`; the configured API key is a `test_` key, and `STEDI_BAA_ENABLED` is unset. No key value is recorded. | Commit `fd841a67afbb8cd2cc5278fb896cd4232ebdbae6` rejects Stedi sandbox mode and `test_` credentials in production before fetch, and separately requires the BAA attestation for any future live key. | The release target cannot send production patient data to Stedi. Production-plan approval, BAA, payer enrollment, and trading-partner evidence are required before activation. |
| Transactional email | Email delivery credentials and `ENABLE_EMAIL_DELIVERY=true` are present, while `EMAIL_VENDOR_BAA_ENABLED` is unset. No credential values are recorded. | Commit `fd841a67afbb8cd2cc5278fb896cd4232ebdbae6` gates the shared SMTP, SendGrid, and SES adapter before provider selection or network egress. | The release target cannot send email until the exact provider/account BAA is verified and intentionally attested. This also blocks legacy payment receipts and message bodies that bypassed notification-only call-site checks. |

## Enabled or potentially enabled boundaries that still require evidence

- OpenAI API-call flags are enabled while live ambient transcription/insights flags and `OPENAI_BAA_ENABLED` are disabled/unset. A BAA request was sent on 2026-08-29, but the executed OpenAI Business Associate and Healthcare Addendum, exact organization data-control provisioning, and eligible endpoint/model evidence remain required before PHI use. The application additionally requires exact endpoint/model allowlists; OpenAI raw audio remains separately disabled because AWS HealthScribe is the intended production scribe.
- Railway hosts only the synthetic-data pilot. The platform owner designated the BAA-covered AWS account as the future live-PHI environment. Railway is not approved for real patient data; changing that scope would require an executed Railway BAA and a fresh assessment before PHI use.

## Synthetic-success control

The shared production guard added in commit `b864db2d3facffc72cb009588e8abea23c5a2ed8` rejects synthetic vendor outcomes in production. It is enforced at common adapter construction and at direct legacy boundaries for prescribing, prior authorization, clearinghouse claims, fax, SMS and voice reminders, Stripe checkout and portal payments, referral communications, and intake notifications. Legacy mock override flags are also release-gate failures and cannot bypass the runtime production guard.

Commit `fd841a67afbb8cd2cc5278fb896cd4232ebdbae6` extends the release boundary so production also rejects Stedi sandbox traffic and all Twilio, Stedi-live, and email egress unless the corresponding BAA attestation flag is true. These flags are activation attestations, not substitutes for agreement evidence, and they remain unset in the reviewed production environment.

Verification for the commit:

- New Stedi/Twilio/email boundary tests: 23 tests passed.
- Backend full suite: 265 suites and 4,575 tests passed; 101 tests skipped by their existing suite configuration. One first-run legacy refill-route order failure passed in isolation (16 tests) and the complete rerun passed.
- Backend lint, logging guard, TypeScript build, and backup-script regressions passed.

This evidence only establishes the current disabled/no-egress boundaries. It does not authorize live PHI and does not replace vendor contracts, BAAs, customer agreements, security/privacy approvals, or legal review.
