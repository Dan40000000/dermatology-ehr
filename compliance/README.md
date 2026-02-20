# Compliance Evidence Binder

This folder is the working evidence binder for staging/production HIPAA readiness.

## Structure

- `evidence/vendor-baa-inventory.csv`: Business Associate inventory and contract status.
- `evidence/hipaa-risk-analysis-latest.md`: Most recent HIPAA risk analysis snapshot.
- `evidence/access-review-log.md`: Access recertification records and approvals.
- `evidence/incident-response-tabletop.md`: Incident tabletop drills and outcomes.

## Usage

1. Update evidence files before every staging go-live decision.
2. Keep dated updates (append rows/sections instead of overwriting historical facts).
3. Reference ticket IDs, owners, and links to signed artifacts.

## Automated Checks

Run:

```bash
npm run hipaa:staging-readiness
```

Strict mode (fails on checklist failures):

```bash
npm run hipaa:staging-readiness:strict
```
