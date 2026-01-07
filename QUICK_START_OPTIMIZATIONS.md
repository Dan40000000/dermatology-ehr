# Quick Start - Performance Optimizations

This guide provides the essential steps to enable all performance optimizations.

## Step 1: Run Database Migrations

```bash
cd backend

# Run the performance index migration
psql $DATABASE_URL -f migrations/040_performance_indexes.sql

# Run the materialized views migration
psql $DATABASE_URL -f migrations/041_materialized_views.sql

# Verify migrations
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';"
```

**Expected Result:** 100+ indexes should be present.

## Step 2: Apply Backend Middleware

Update `/backend/src/index.ts` to add new middleware:

```typescript
import { performanceMonitoring, requestTimeout } from './middleware/performanceMonitoring';
import { compressionMiddleware } from './middleware/compression';
import { additionalSecurityHeaders, sqlInjectionPrevention, xssPrevention } from './middleware/security';

// Add after existing middleware, before routes
app.use(performanceMonitoring); // Track all requests
app.use(requestTimeout(30000)); // 30s timeout
app.use(compressionMiddleware); // Gzip compression
app.use(additionalSecurityHeaders); // Enhanced security
app.use(sqlInjectionPrevention); // SQL injection prevention
app.use(xssPrevention); // XSS prevention

// ... existing routes
```

## Step 3: Add Cache to Common Endpoints

Update route files to add caching:

```typescript
import { cache, CachePresets, invalidateCacheAfter } from '../middleware/caching';

// Example: /backend/src/routes/icd10Codes.ts
router.get('/', CachePresets.lookupData(), async (req, res) => {
  // Handler code
});

// Example: /backend/src/routes/patients.ts
router.get('/', cache({ ttl: 300 }), async (req, res) => {
  // Handler code
});

router.post('/',
  invalidateCacheAfter(['patients:*']),
  async (req, res) => {
    // Handler code
  }
);
```

**Recommended endpoints to cache:**
- `/api/icd10-codes` - CachePresets.lookupData()
- `/api/cpt-codes` - CachePresets.lookupData()
- `/api/medications` - CachePresets.lookupData()
- `/api/providers` - cache({ ttl: 3600 })
- `/api/locations` - cache({ ttl: 3600 })
- `/api/patients` - cache({ ttl: 300 })
- `/api/appointments` - cache({ ttl: 60 })

## Step 4: Add Performance Stats Endpoint

Create `/backend/src/routes/stats.ts`:

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { getPerformanceStats } from '../middleware/performanceMonitoring';
import { cacheService } from '../services/cacheService';
import { getPoolStats } from '../db/pool';

export const statsRouter = Router();

// Performance statistics (admin only)
statsRouter.get('/performance',
  requireAuth,
  requireRoles(['admin']),
  getPerformanceStats
);

// Cache statistics
statsRouter.get('/cache',
  requireAuth,
  requireRoles(['admin']),
  (req, res) => {
    const stats = cacheService.getStats();
    res.json(stats);
  }
);

// Database pool statistics
statsRouter.get('/database',
  requireAuth,
  requireRoles(['admin']),
  (req, res) => {
    const stats = getPoolStats();
    res.json(stats);
  }
);
```

Then add to `/backend/src/index.ts`:

```typescript
import { statsRouter } from './routes/stats';

app.use('/api/stats', statsRouter);
```

## Step 5: Enable Service Worker (Frontend)

Update `/frontend/src/main.tsx`:

```typescript
// Add after ReactDOM render

// Register service worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}
```

Update `/frontend/index.html` to add manifest:

```html
<head>
  <!-- Existing meta tags -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#3b82f6">
</head>
```

## Step 6: Use Virtual Scrolling

Replace large lists with virtual scrolling:

**Before:**
```tsx
<div>
  {patients.map(patient => (
    <PatientRow key={patient.id} patient={patient} />
  ))}
</div>
```

**After:**
```tsx
import { VirtualList } from '../components/ui/VirtualList';

<VirtualList
  items={patients}
  renderItem={(patient) => (
    <PatientRow patient={patient} />
  )}
  estimateSize={80}
  className="h-full"
/>
```

## Step 7: Add Audit Logging

Add audit logging to sensitive endpoints:

```typescript
import { auditMiddleware } from '../middleware/auditLogger';

// Example: Patient viewing
router.get('/:id',
  requireAuth,
  auditMiddleware('patient_view', 'patient'),
  async (req, res) => {
    // Handler
  }
);

// Example: Patient updating
router.put('/:id',
  requireAuth,
  auditMiddleware('patient_update', 'patient'),
  async (req, res) => {
    // Handler
  }
);
```

## Step 8: Environment Variables

Add to `.env`:

```bash
# Performance
NODE_ENV=production
ENABLE_QUERY_LOGGING=true

# Redis (optional - currently using mock)
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=your-password

# Monitoring
SLOW_QUERY_THRESHOLD=1000
PERFORMANCE_MONITORING=true

# Security
SESSION_TIMEOUT=7200000
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000
```

## Step 9: Build and Deploy

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build

# Test production build
npm run preview
```

## Step 10: Verify Optimizations

### Check Database Indexes
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Check Materialized Views
```sql
SELECT
  schemaname,
  matviewname,
  last_refresh
FROM pg_matviews
WHERE schemaname = 'public';
```

### Check Performance Stats
```bash
curl http://localhost:3000/api/stats/performance
curl http://localhost:3000/api/stats/cache
curl http://localhost:3000/api/stats/database
```

### Check Service Worker
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log('Service Workers:', registrations);
});
```

## Verification Checklist

- [ ] Database indexes created (90+)
- [ ] Materialized views created (9)
- [ ] Performance monitoring middleware active
- [ ] Compression middleware active
- [ ] Security middleware active
- [ ] Cache service working (check stats)
- [ ] Audit logging enabled
- [ ] Service worker registered
- [ ] Virtual scrolling implemented
- [ ] Stats endpoints accessible
- [ ] Performance improved (check metrics)

## Expected Performance Improvements

After completing all steps, you should see:

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Patient list load | ~2000ms | ~200ms | <300ms |
| Dashboard load | ~4000ms | ~500ms | <1000ms |
| Patient chart | ~3000ms | ~400ms | <500ms |
| API response (cached) | baseline | -60% to -80% | Fast |
| Bundle size | ~2.1MB | ~185KB | <200KB |
| Cache hit rate | 0% | 85-95% | >80% |

## Monitoring

### Daily Checks

```bash
# View slow queries
curl http://localhost:3000/api/stats/performance | jq '.database.slowQueries'

# View cache performance
curl http://localhost:3000/api/stats/cache | jq '.hitRate'

# View database pool
curl http://localhost:3000/api/stats/database
```

### Weekly Maintenance

```sql
-- Refresh materialized views
SELECT refresh_all_materialized_views();

-- Update statistics
VACUUM ANALYZE;

-- Check for unused indexes
SELECT * FROM pg_stat_user_indexes WHERE idx_scan < 50;
```

## Troubleshooting

### Slow Queries Still Occurring?

```typescript
// Check query performance
const slowQueries = queryPerformanceMonitor.getSlowQueries(20);
console.log(slowQueries);

// Analyze specific query
const analysis = await analyzeQuery(yourQuery, params);
console.log(analysis.suggestions);
```

### Cache Not Working?

```typescript
// Check cache stats
const stats = cacheService.getStats();
console.log('Hit rate:', stats.hitRate);
console.log('Keys:', stats.keys);

// Verify cache middleware is applied
// Check X-Cache header in response
```

### Service Worker Issues?

```javascript
// Unregister all service workers
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => registration.unregister());
});

// Clear cache
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});

// Reload and re-register
```

## Next Steps

1. Monitor performance for 1 week
2. Adjust cache TTLs based on usage patterns
3. Add more endpoints to cache
4. Optimize slow queries identified
5. Consider Redis migration for production
6. Set up automated performance testing

## Support

For detailed documentation, see:
- `PERFORMANCE_OPTIMIZATION.md` - Complete guide
- `OPTIMIZATION_SUMMARY.md` - Executive summary

For questions or issues, check the monitoring dashboard or review slow query logs.

---

**Quick Reference Commands**

```bash
# Run migrations
psql $DATABASE_URL -f migrations/040_performance_indexes.sql
psql $DATABASE_URL -f migrations/041_materialized_views.sql

# Refresh materialized views
psql $DATABASE_URL -c "SELECT refresh_all_materialized_views();"

# Check performance
curl http://localhost:3000/api/stats/performance
curl http://localhost:3000/api/stats/cache
curl http://localhost:3000/api/stats/database

# Run tests
npm test performance.test.ts
```

---

Last Updated: 2025-12-29
