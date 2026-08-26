# Incident Response Tabletop Record

- Date: 2026-02-16
- Facilitator: Platform Security
- Scenario: Suspicious bulk access to patient records from privileged account

## Timeline Walkthrough

1. Alert triage and severity classification.
2. Immediate account containment and token/session revocation.
3. Evidence capture (audit trail, application logs, cloud control-plane logs).
4. Legal/compliance notification path and breach-assessment decision tree.
5. Customer and regulator notification checkpoints.

## Outcomes

- Runbook sequence validated for containment and forensics.
- Need explicit owner matrix for legal notification approval steps.
- Need quarterly tabletop cadence with documented completion evidence.

## 2026-08-26 Automated Technical Rehearsal

- Facilitator: Codex automated release review
- Scenario: A privileged session exhibits suspicious patient-record access during an application release
- Scope: Technical release controls only; no live incident was declared and no real notification contacts were exercised

### Evidence Exercised

1. Reconfirmed authenticated route and role-boundary behavior through the release authorization/browser suite.
2. Reconfirmed that the documented containment sequence starts with account containment and session/token revocation before recovery actions.
3. Reconfirmed that audit, application, and cloud control-plane evidence must be preserved before remediation changes.
4. Reconfirmed that breach assessment and legal, customer, and regulator notifications remain human compliance decisions.

### Outcome and Limitations

- The technical response sequence remains usable for release operations.
- The previously identified legal-notification owner matrix remains open.
- A practice administrator/compliance officer must still conduct and sign a human tabletop with current contacts before live-PHI go-live; this automated rehearsal is not a substitute for that exercise.
