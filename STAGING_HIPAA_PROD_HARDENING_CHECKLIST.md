# Staging HIPAA and Production Hardening Checklist

This checklist is an engineering readiness runbook. It does not replace legal advice.

## 1. Automated Technical Gate

Run environment and data-path checks:

```bash
npm run hipaa:staging-readiness
```

Run strict gate (fails on critical failures):

```bash
npm run hipaa:staging-readiness:strict
```

Run strict gate with warning enforcement:

```bash
npm run hipaa:staging-readiness:strict-warnings
```

## 2. Application Security Baseline

- [ ] `NODE_ENV=production` (or staging equivalent) in deployed environment.
- [ ] `PHI_ENCRYPTION_ENABLED=true`.
- [ ] `ENCRYPTION_KEY` is 32+ chars and sourced from secret manager.
- [ ] DB TLS enforced (`DB_SSL_ENABLED=true` or `DATABASE_URL` with `sslmode=require`).
- [ ] Explicit `CORS_ORIGIN` allowlist (no wildcard, no localhost in staging/prod).
- [ ] `ENABLE_API_DOCS=false` in production.
- [ ] `ENABLE_PLAYGROUND=false` in production.
- [ ] All `USE_MOCK_*` flags disabled in staging/prod.
- [ ] `STORAGE_PROVIDER=s3` with encrypted bucket configuration.
- [ ] `SENTRY_DSN` configured for incident forensics.

## 3. Data Protection and Auditing

- [ ] Verify `patients.ssn` plaintext values are fully scrubbed.
- [ ] Verify SSN usage remains encrypted/last4-only in app flows.
- [ ] Verify `audit_log` receives patient data access events.
- [ ] Verify `AUDIT_LOG_RETENTION_DAYS` meets policy target.
- [ ] Confirm audit export/reporting path for investigations.

## 4. Operations and Governance

- [ ] Vendor BAAs verified and evidence linked in `compliance/evidence/vendor-baa-inventory.csv`.
- [ ] Current risk analysis documented in `compliance/evidence/hipaa-risk-analysis-latest.md`.
- [ ] Role/access review evidence updated in `compliance/evidence/access-review-log.md`.
- [ ] Incident tabletop evidence updated in `compliance/evidence/incident-response-tabletop.md`.
- [ ] Evidence freshness within policy windows (or `EVIDENCE_MAX_AGE_DAYS` override) for all files in `compliance/evidence/`.
- [ ] Break-glass/JIT privileged access process documented and approved.

## 5. Cloud and Infrastructure Hardening

- [ ] Private networking for DB and internal services.
- [ ] Production secrets rotated and versioned in secret manager.
- [ ] Backup schedule enabled; restore drill completed and documented.
- [ ] File upload malware scanning enabled and tested.
- [ ] Alerting configured for privileged actions and unusual PHI access.

## 6. Release Decision

Promote only when:

1. `hipaa:staging-readiness:strict` passes.
2. Release gate (`npm run test:release-gate`) passes.
3. Evidence binder files under `compliance/evidence/` are updated with current date and reviewer sign-off.

## 7. Primary HIPAA References (HHS)

Use these as the baseline source set when validating policy/technical controls:

- HIPAA Privacy Rule: https://www.hhs.gov/hipaa/for-professionals/privacy/index.html
- HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/index.html
- HIPAA Breach Notification Rule: https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html
- HIPAA Laws and Regulations overview (links to CFR text): https://www.hhs.gov/hipaa/for-professionals/laws-regulations/index.html
- Security Risk Analysis guidance: https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html
- Business Associates guidance: https://www.hhs.gov/hipaa/for-professionals/covered-entities/business-associates/index.html
- Cloud Computing guidance: https://www.hhs.gov/hipaa/for-professionals/special-topics/cloud-computing/index.html
