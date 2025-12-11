# Security Documentation

**Dermatology EHR System - HIPAA Compliant**

Last Updated: 2025-12-08

## Table of Contents

1. [Security Overview](#security-overview)
2. [Security Measures Implemented](#security-measures-implemented)
3. [Threat Model](#threat-model)
4. [Security Checklist](#security-checklist)
5. [Incident Response Plan](#incident-response-plan)
6. [Security Best Practices](#security-best-practices)

---

## Security Overview

This dermatology EHR system is designed to be HIPAA-compliant and implements multiple layers of security to protect sensitive patient health information (PHI).

### Compliance Standards

- **HIPAA** - Health Insurance Portability and Accountability Act
- **WCAG 2.1 AA** - Web Content Accessibility Guidelines
- **OWASP Top 10** - Protection against common web vulnerabilities

---

## Security Measures Implemented

### 1. Authentication & Authorization

**JWT-based Authentication**
- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Tokens are invalidated on password change
- Multi-tenant isolation enforced at token level

**Location:** `/backend/src/middleware/auth.ts`

**Role-Based Access Control (RBAC)**
- Roles: Admin, Provider, MA, Front Desk, Patient
- Granular permissions per role
- Resource-level access control

**Location:** `/backend/src/middleware/rbac.ts`

### 2. Security Headers (Helmet.js)

**Implemented Headers:**
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

**Location:** `/backend/src/middleware/security.ts`

**Configuration:**
```typescript
- Default-src: 'self'
- Script-src: 'self' only
- Object-src: 'none'
- Frame-src: 'none'
- HSTS Max-Age: 1 year with preload
```

### 3. Rate Limiting

**Multiple Rate Limit Tiers:**

| Endpoint Type | Window | Max Requests |
|--------------|--------|--------------|
| General API | 15 min | 100 |
| Auth Endpoints | 15 min | 5 |
| Patient Portal | 15 min | 50 |
| File Uploads | 15 min | 20 |

**Location:** `/backend/src/middleware/rateLimiter.ts`

**Protection Against:**
- Brute force attacks
- Credential stuffing
- DoS attacks
- Automated scraping

### 4. Input Validation & Sanitization

**Zod Schema Validation**
- Type-safe input validation
- Strict schema enforcement
- Custom validation rules

**NoSQL Injection Prevention**
- express-mongo-sanitize middleware
- Removes $ and . from user input

**XSS Prevention**
- xss-clean middleware
- Sanitizes HTML/JavaScript in input

**Location:** `/backend/src/middleware/sanitization.ts`

### 5. SQL Injection Prevention

**Status:** ✅ PASSED AUDIT

**Implementation:**
- 100% parameterized queries
- No string concatenation in SQL
- $1, $2 placeholders throughout

**Audit Report:** `/backend/SQL_INJECTION_AUDIT.md`

### 6. File Upload Security

**Validations:**
- File type whitelist (PDF, JPEG, PNG, GIF, DOCX)
- Maximum file size: 10MB
- MIME type verification with magic numbers
- Filename sanitization
- Directory traversal prevention
- Antivirus scanning integration ready

**Features:**
- Secure random filenames
- Tenant-isolated storage
- File signature validation (prevents spoofing)

**Location:** `/backend/src/utils/fileUpload.ts`

### 7. CSRF Protection

**Implementation:**
- CSRF tokens for all state-changing operations
- Cookie-based token storage
- Strict SameSite policy
- Secure flag in production

**Location:** `/backend/src/middleware/csrf.ts`

**Note:** CSRF package is deprecated. For production, migrate to:
- `@edge-csrf/nextjs` for Next.js
- Custom token implementation using `crypto.randomBytes()`

### 8. CORS Configuration

**Allowed:**
- Origin: Frontend URL only (localhost:5173 in dev)
- Methods: GET, POST, PUT, DELETE, PATCH
- Credentials: True
- Headers: Content-Type, Authorization, X-Tenant-Id

**Location:** `/backend/src/index.ts`

### 9. Structured Logging & Audit Trail

**Winston Logger:**
- Error logs: `/logs/error.log`
- Combined logs: `/logs/combined.log`
- Audit logs: `/logs/audit.log`
- Log rotation: 5MB max, 5 files retained

**HIPAA Audit Events:**
- All data access logged with user, resource, action
- Authentication events tracked
- Security events recorded
- Searchable audit trail

**Location:** `/backend/src/lib/logger.ts`

### 10. Encryption

**In Transit:**
- TLS 1.2+ required in production
- HSTS enforced
- Secure cookies only in production

**At Rest:**
- Database encryption (PostgreSQL native)
- Bcrypt password hashing (12 rounds)
- Secure token storage

**Sensitive Data:**
- Passwords: Bcrypt hashed
- Tokens: Signed with JWT secret
- Files: Encrypted at storage layer (S3 SSE or disk encryption)

### 11. Session Management

**Security Features:**
- HTTP-only cookies
- Secure flag in production
- SameSite: strict
- Short token expiration
- Automatic token rotation
- Session invalidation on logout

---

## Threat Model

### Assets to Protect

1. **Patient Health Information (PHI)**
   - Medical records
   - Encounter notes
   - Photos
   - Lab results

2. **Authentication Credentials**
   - User passwords
   - API tokens
   - Session tokens

3. **Business Data**
   - Billing information
   - Insurance data
   - Provider schedules

### Threat Actors

1. **External Attackers**
   - Motivation: Financial gain, data theft
   - Methods: SQL injection, XSS, brute force

2. **Malicious Insiders**
   - Motivation: Data theft, sabotage
   - Methods: Privilege escalation, data exfiltration

3. **Accidental Disclosure**
   - Cause: User error, misconfiguration
   - Impact: HIPAA violation, data breach

### Attack Vectors & Mitigations

| Attack Vector | Risk Level | Mitigation |
|--------------|------------|------------|
| SQL Injection | ❌ Low | Parameterized queries |
| XSS | ❌ Low | Input sanitization, CSP |
| CSRF | ❌ Low | CSRF tokens |
| Brute Force | ❌ Low | Rate limiting |
| Session Hijacking | ⚠️ Medium | Secure cookies, short expiration |
| File Upload Exploits | ❌ Low | Type validation, virus scanning |
| Privilege Escalation | ⚠️ Medium | RBAC, audit logging |
| Data Exfiltration | ⚠️ Medium | Access logging, monitoring |

---

## Security Checklist

### Pre-Deployment

- [ ] Environment variables set correctly
- [ ] JWT_SECRET is strong (32+ characters)
- [ ] Database credentials secured
- [ ] HTTPS/TLS enabled
- [ ] Firewall rules configured
- [ ] Security headers verified
- [ ] Rate limiting tested
- [ ] CORS configuration validated
- [ ] Error messages don't leak sensitive info
- [ ] Logs directory permissions set correctly

### Post-Deployment

- [ ] Monitor error logs daily
- [ ] Review audit logs weekly
- [ ] Scan for vulnerabilities monthly
- [ ] Update dependencies regularly
- [ ] Backup encryption keys
- [ ] Test incident response plan quarterly
- [ ] Review user access permissions monthly
- [ ] Conduct security training annually

### HIPAA Compliance

- [ ] Business Associate Agreements (BAAs) in place
- [ ] Access controls implemented
- [ ] Audit logging enabled
- [ ] Encryption at rest and in transit
- [ ] Automatic log-off implemented
- [ ] Data backup and recovery tested
- [ ] Incident response plan documented
- [ ] Security risk assessment completed

---

## Incident Response Plan

### 1. Detection & Analysis

**Indicators of Compromise:**
- Unusual login patterns
- Failed authentication spikes
- Unexpected data access
- High error rates
- Performance degradation

**Monitoring:**
- `/health/detailed` endpoint
- Error logs: `/backend/logs/error.log`
- Audit logs: `/backend/logs/audit.log`
- Application metrics

### 2. Containment

**Immediate Actions:**
1. Isolate affected systems
2. Revoke compromised credentials
3. Block malicious IP addresses
4. Enable additional logging
5. Preserve evidence for investigation

**Communication:**
- Notify security team
- Alert affected users if necessary
- Document timeline of events

### 3. Eradication

1. Identify root cause
2. Remove malware/backdoors
3. Patch vulnerabilities
4. Update firewall rules
5. Rotate all credentials

### 4. Recovery

1. Restore from clean backups
2. Verify system integrity
3. Monitor for recurring issues
4. Gradual service restoration
5. Post-incident review

### 5. Post-Incident

1. Document lessons learned
2. Update security measures
3. Train staff on new procedures
4. Report to compliance officer
5. HIPAA breach notification if required (within 60 days)

**Breach Notification Thresholds:**
- **Required:** Unsecured PHI of 500+ individuals
- **Recommended:** Any unauthorized access to PHI
- **Timeline:** Within 60 days of discovery

---

## Security Best Practices

### For Developers

1. **Never commit secrets** - Use environment variables
2. **Validate all input** - Trust nothing from users
3. **Use parameterized queries** - Prevent SQL injection
4. **Sanitize output** - Prevent XSS
5. **Implement least privilege** - Minimal permissions needed
6. **Log security events** - Audit trail for compliance
7. **Keep dependencies updated** - Patch vulnerabilities
8. **Review code for security** - Security-focused code reviews

### For System Administrators

1. **Enable HTTPS only** - No plain HTTP
2. **Use strong passwords** - 16+ characters, random
3. **Rotate credentials regularly** - At least every 90 days
4. **Monitor logs daily** - Watch for anomalies
5. **Backup regularly** - Test recovery procedures
6. **Apply security patches** - Within 30 days of release
7. **Restrict network access** - Firewall rules, VPN
8. **Enable 2FA** - For all administrative access

### For Users

1. **Use unique passwords** - No password reuse
2. **Lock screen when away** - Automatic timeout enabled
3. **Don't share credentials** - Individual accounts only
4. **Report suspicious activity** - Security awareness
5. **Verify before clicking links** - Phishing prevention
6. **Keep software updated** - OS and browser patches
7. **Use approved devices only** - BYOD policy
8. **Complete security training** - Annual requirement

---

## Security Testing

### Automated Security Scans

Run security checks regularly:

```bash
# Dependency vulnerability scan
npm audit

# Backend security tests
cd backend && npm test

# Frontend security tests
cd frontend && npm test

# E2E security tests
npm run test:e2e
```

### Manual Security Testing

1. **Penetration Testing** - Annually by qualified firm
2. **Vulnerability Assessment** - Quarterly internal scan
3. **Code Review** - Every PR with security focus
4. **Access Control Testing** - Monthly RBAC verification

---

## Contact

**Security Issues:** security@example.com
**Compliance Officer:** compliance@example.com
**Incident Response:** incident@example.com

**Response Time:**
- Critical: < 1 hour
- High: < 4 hours
- Medium: < 24 hours
- Low: < 1 week

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-08 | Initial security implementation |

---

**Last Security Audit:** 2025-12-08
**Next Review Date:** 2026-03-08
**Document Owner:** CTO
