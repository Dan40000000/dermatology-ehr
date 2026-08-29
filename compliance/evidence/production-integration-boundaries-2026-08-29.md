# Production Integration Boundary Evidence

Verified: 2026-08-29 UTC

Environment reviewed: Railway project `97cf6144-5c9f-4156-b9e9-7f6a8286f8dd`, production environment `d3b46649-ce15-4fb0-871a-0d5885965428`, API service `830ece71-d176-4928-9c4a-37c6def7f5c1`.

No secret values are recorded in this artifact. The production variable-name inventory and non-secret feature flags were reviewed through the Railway dashboard. The platform owner states that production contains no real patient data.

## Disabled vendor boundaries

| Vendor or workflow | Production configuration evidence | Application enforcement | Current determination |
| --- | --- | --- | --- |
| Sentry | `SENTRY_DSN` is absent from the production API service. | `backend/src/lib/sentry.ts` returns without initializing Sentry when the DSN is absent. | Sentry does not currently receive application telemetry. A BAA or an approved and tested no-PHI boundary is required before enabling it. |
| Phaxio / external fax | `PHAXIO_API_KEY`, `PHAXIO_API_SECRET`, and `PHAXIO_FROM_NUMBER` are absent. | Commit `b864db2d3facffc72cb009588e8abea23c5a2ed8` blocks synthetic external adapters in production and returns service-unavailable before the legacy fax route records a simulated transmission. A non-mock Phaxio adapter also fails when credentials are absent. | No external fax vendor currently creates, receives, maintains, or transmits PHI. A vendor agreement, BAA, credentialed account, and end-to-end validation are required before activation. |
| E-prescribing and electronic prior authorization | No production e-prescribing/prior-auth provider selection or credentials are configured. The platform owner confirmed these workflows are not set up. | Commit `b864db2d3facffc72cb009588e8abea23c5a2ed8` blocks explicit/default mock providers, direct Surescripts scaffolding, and mock prior-auth factories and methods in production. | No e-prescribing or prior-auth network currently receives PHI. Vendor contracting, identity proofing, certification, BAA review as applicable, and EPCS controls are required before activation. |

## Enabled or potentially enabled boundaries that still require evidence

- Twilio SMS is configured for live send (`SMS_LIVE_SEND_ENABLED=true`) and remains BAA-gated.
- Transactional email delivery is enabled with notification-only content enforcement; the provider/account and BAA coverage still require verification.
- Stedi credentials are present for healthcare transactions; BAA, production-plan, payer-enrollment, and trading-partner evidence remain required.
- OpenAI API-call flags are enabled while live ambient transcription/insights flags are disabled. Because clinical-text endpoints remain potentially PHI-capable, the OpenAI API BAA and eligible-endpoint/retention evidence remain required before PHI use.
- Railway hosts the API and PostgreSQL database and therefore remains BAA-gated before hosted PHI.

## Synthetic-success control

The shared production guard added in commit `b864db2d3facffc72cb009588e8abea23c5a2ed8` rejects synthetic vendor outcomes in production. It is enforced at common adapter construction and at direct legacy boundaries for prescribing, prior authorization, clearinghouse claims, fax, SMS and voice reminders, Stripe checkout and portal payments, referral communications, and intake notifications. Legacy mock override flags are also release-gate failures and cannot bypass the runtime production guard.

Verification for the commit:

- Backend focused guard and route set: 331 tests passed.
- Backend full suite: 264 suites and 4,571 tests passed; 101 tests skipped by their existing suite configuration.
- Backend lint, logging guard, TypeScript build, and backup-script regressions passed.

This evidence only establishes the current disabled/no-egress boundaries. It does not authorize live PHI and does not replace vendor contracts, BAAs, customer agreements, security/privacy approvals, or legal review.
