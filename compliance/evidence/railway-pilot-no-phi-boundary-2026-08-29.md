# Railway Synthetic-Only Pilot Boundary

Decision recorded: 2026-08-29

The platform owner confirmed the following deployment boundary for the Dermatology EHR:

- Railway is a test-pilot cloud environment only.
- Railway may contain synthetic test data only and is not approved to create, receive, maintain, or transmit real patient PHI.
- The future live-patient environment will use the BAA-covered AWS account and only verified HIPAA-eligible AWS services.
- No customer practice or patient tenant may be activated on Railway.

This decision makes a Railway BAA not applicable to the current synthetic-only pilot. It does not represent a Railway BAA or a finding that Railway is HIPAA-covered. Any proposal to place PHI on Railway requires a new vendor assessment, an executed Railway BAA covering the exact account and services, privacy/security/counsel approval, and a fresh release-readiness review before the scope changes.

The earlier Railway BAA inquiry is retained as historical evidence, but no paid commitment was accepted.
