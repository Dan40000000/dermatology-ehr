# AI Project Guide

## Golden Visit v1 follow-up

Golden Visit v1 adds a pre-visit brief, clinician-reviewed ambient note revision, note-readiness signals, clinician-selected post-visit actions, and explicit patient-summary sharing. These features must be evaluated as one encounter workflow, not as isolated AI output.

Before a pilot with real patient information:

1. Run a synthetic visit against a deployed staging frontend, backend, and database: schedule, check-in, encounter, recording with consent, note generation, Magic Edit preview, clinician approval, selected follow-up actions, portal sharing, and checkout. Record each step's result and any recovery path.
2. Verify that the configured AI provider, model, endpoint, and data-retention settings are covered by the applicable signed agreements. Do not send real PHI until privacy and security owners approve the complete vendor path.
3. Complete the [production-readiness runbook](docs/production-readiness-runbook.md), including role-based access checks, audit evidence, strict staging readiness, backup/restore evidence, and release revision matching.
4. Ask practicing dermatology clinicians to test realistic synthetic encounters. Measure time to a signed note, correction burden, missed follow-up items, and confusing steps. Prioritize changes from observed failures before adding more AI features.

Automated tests and mocked browser checks do not prove live vendor connectivity, production safety, HIPAA compliance, or clinical effectiveness. A privacy officer, security officer, and healthcare counsel must sign off on material compliance decisions.
