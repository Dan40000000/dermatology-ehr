# Access Review Log

| Date | Environment | Reviewer | Scope | Outcome | Follow-ups |
|---|---|---|---|---|---|
| 2026-08-26 | Production release controls | Codex automated release review | Static least-privilege mappings plus authenticated authorization and navigation coverage for PR #8; no live identity roster was accessed | Technical controls passed and this release does not change role mappings | Practice administrator/compliance officer must separately recertify named production users, dual-role assignments, break-glass access, and approval records |
| 2026-05-19 | Production | Platform Security | Admin, billing, provider, ma, front desk, and patient portal role boundaries | Complete | Keep production break-glass access limited to documented emergency workflow; next quarterly review due in August 2026 |
| 2026-02-16 | Staging | Platform Security | Admin, billing, provider, ma role boundaries | Complete | Confirm JIT elevation design for production break-glass access |

## Review Expectations

- Validate least-privilege role mappings.
- Confirm dual-role users only have required secondary roles.
- Confirm financial and admin access paths match policy.
- Record approvals and remediation ticket links.

The 2026-08-26 entry is release-engineering evidence only. It does not claim that a human owner reviewed the live production user roster.
