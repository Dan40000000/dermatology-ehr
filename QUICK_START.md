# Quick Start Guide - Security & Testing

**Dermatology EHR System**

---

## Development Commands

### Start the Application

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Both (from root)
npm run dev
```

### Run Tests

```bash
# All tests
npm run test:all

# Backend tests only
cd backend && npm test

# Frontend tests only
cd frontend && npm test

# E2E tests
npm run test:e2e

# With coverage
cd backend && npm run test:coverage
cd frontend && npm run test:coverage
```

### Security Checks

```bash
# Dependency audit
npm audit

# SQL injection audit
# See: backend/SQL_INJECTION_AUDIT.md

# Run security tests
cd backend && npm test -- --testPathPattern=security
```

---

## Environment Setup

### Required Environment Variables

Create `/backend/.env`:

```env
# Database
DATABASE_URL=postgresql://localhost/derm_app

# Authentication
JWT_SECRET=your-super-secret-key-here-32-chars-min
REFRESH_TOKEN_SECRET=your-refresh-token-secret-here

# Server
PORT=4000
NODE_ENV=development

# Multi-tenancy
TENANT_HEADER=X-Tenant-Id

# Frontend
FRONTEND_URL=http://localhost:5173

# Logging
LOG_LEVEL=info
```

---

## Security Features Enabled

✅ Helmet.js security headers
✅ Rate limiting (auth: 5/15min, API: 100/15min)
✅ CSRF protection
✅ Input sanitization (XSS, NoSQL injection)
✅ File upload validation
✅ Structured logging & audit trail
✅ JWT authentication (15min access, 7day refresh)
✅ RBAC authorization

---

## Health Checks

```bash
# Basic health check
curl http://localhost:4000/health

# Detailed health check with metrics
curl http://localhost:4000/health/detailed

# Liveness probe (for k8s)
curl http://localhost:4000/health/live

# Readiness probe (for k8s)
curl http://localhost:4000/health/ready
```

---

## Load Testing

```bash
# Test health endpoint
node backend/performance/load-test.js /health

# Test authenticated endpoint (replace TOKEN)
node backend/performance/load-test.js /api/patients YOUR_JWT_TOKEN
```

---

## Common Issues

### Tests failing with "Cannot find module"

```bash
cd backend && npx jest --clearCache
cd frontend && rm -rf node_modules/.vitest
```

### Database connection errors

```bash
# Check database is running
psql -l

# Check connection string
echo $DATABASE_URL
```

### Port already in use

```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

---

## Documentation

- **Security:** `/SECURITY.md` - Complete security documentation
- **Testing:** `/TESTING.md` - Testing guide and best practices
- **Summary:** `/IMPLEMENTATION_SUMMARY.md` - Implementation details
- **SQL Audit:** `/backend/SQL_INJECTION_AUDIT.md` - SQL security audit

---

## Pre-Production Checklist

- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Run all tests: `npm run test:all`
- [ ] Set strong JWT_SECRET (32+ chars)
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set up database backups
- [ ] Configure logging aggregation
- [ ] Set up monitoring alerts
- [ ] Complete HIPAA compliance review
- [ ] Conduct security penetration test

---

## Support

For detailed information, see:
- SECURITY.md
- TESTING.md
- IMPLEMENTATION_SUMMARY.md
