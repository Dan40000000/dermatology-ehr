# Metrics Tracking - Quick Start Guide

## 🚀 Get Started in 5 Minutes

This guide will get your metrics tracking system up and running quickly.

---

## Step 1: Database Setup (1 minute)

```bash
cd backend
npm run migrate
```

This creates all necessary tables and seeds default benchmarks.

---

## Step 2: Backend Integration (2 minutes)

### Register the Routes

Edit `/backend/src/index.ts`:

```typescript
import metricsRouter from './routes/metrics.js';

// Add with your other routes
app.use('/api/metrics', metricsRouter);
```

### Restart Backend

```bash
npm run dev
```

---

## Step 3: Frontend Integration (2 minutes)

### Add MetricsProvider

Edit `/frontend/src/main.tsx` or `/frontend/src/App.tsx`:

```typescript
import { MetricsProvider } from './components/Metrics/MetricsProvider';

// Wrap your app
<AuthProvider>
  <MetricsProvider>
    <App />
  </MetricsProvider>
</AuthProvider>
```

### Add to Routes (if using React Router)

Edit your router configuration:

```typescript
import MetricsDashboard from './pages/admin/MetricsDashboard';

// Add to admin routes
{
  path: '/admin/metrics',
  element: <MetricsDashboard />,
}
```

---

## Step 4: Test It Out

### Option A: Quick Test

Add to any page:

```typescript
import { useMetrics } from '../hooks/useMetrics';

function TestPage() {
  const { trackClick } = useMetrics();

  return (
    <button onClick={() => trackClick('test-button', 'Test Click')}>
      Test Metrics
    </button>
  );
}
```

Click the button, then check:
1. Browser DevTools → Network → Look for `/api/metrics/events`
2. Database → `SELECT * FROM metric_events LIMIT 10;`

### Option B: Full Integration

Add to an encounter page:

```typescript
import { EfficiencyBadge } from '../components/Metrics/EfficiencyBadge';
import { EncounterSummary } from '../components/Metrics/EncounterSummary';
import { useEncounterMetrics } from '../hooks/useMetrics';

function EncounterPage({ encounterId, patientId }) {
  const [showSummary, setShowSummary] = useState(false);
  const metrics = useEncounterMetrics(encounterId, patientId);

  const handleComplete = async () => {
    await completeEncounter();
    setShowSummary(true);
  };

  return (
    <>
      <EfficiencyBadge />

      {/* Your encounter content */}

      <button onClick={handleComplete}>Complete Encounter</button>

      {showSummary && (
        <EncounterSummary
          encounterId={encounterId}
          patientName="Test Patient"
          onClose={() => setShowSummary(false)}
        />
      )}
    </>
  );
}
```

---

## Step 5: View Results

Navigate to:
```
http://localhost:5173/admin/metrics
```

You should see:
- Summary cards
- Provider leaderboard
- Trends chart
- Feature usage

---

## Common Use Cases

### Track a Button Click

```typescript
const { trackButtonClick } = useMetrics();

<button onClick={() => trackButtonClick('save-btn', 'Save Encounter')}>
  Save
</button>
```

### Track Form Submission

```typescript
const { trackFormSubmit } = useMetrics();

const handleSubmit = (e) => {
  e.preventDefault();
  trackFormSubmit('patient-form', formData);
  // ... submit logic
};
```

### Track AI Feature Usage

```typescript
const { trackAIFeature } = useMetrics();

const generateNote = async () => {
  const startTime = Date.now();
  const note = await callAI();
  const timeSaved = 45; // seconds

  trackAIFeature('note-generation', true, timeSaved);
};
```

### Measure Task Duration

```typescript
const { measureAsync } = useMetrics();

const result = await measureAsync('load-patient-data', async () => {
  return await fetchPatientData();
});
// Automatically logs duration
```

### Track Page Navigation

```typescript
const { trackNavigation } = useMetrics();

useEffect(() => {
  trackNavigation(previousPage, currentPage);
}, [currentPage]);
```

---

## Verification Checklist

After setup, verify:

- [ ] Backend compiles without errors
- [ ] Frontend compiles without errors
- [ ] Can log in to application
- [ ] Button clicks appear in Network tab
- [ ] Events appear in `metric_events` table
- [ ] Dashboard loads at `/admin/metrics`
- [ ] EfficiencyBadge renders on encounter pages
- [ ] EncounterSummary shows after completion
- [ ] Offline mode works (disconnect network, click buttons, reconnect)

---

## Troubleshooting

### "MetricsContext is null"
Make sure MetricsProvider wraps your component:

```typescript
<MetricsProvider>
  <YourComponent />
</MetricsProvider>
```

### Events not sending
Check browser console for errors. Common issues:
- CORS misconfigured
- Authentication token missing
- API URL incorrect

### Dashboard empty
1. Complete at least one encounter
2. Wait 30 seconds for events to batch
3. Check time period (default: 30 days)
4. Verify admin permissions

### Database errors
Run migration again:
```bash
cd backend
npm run migrate
```

---

## What's Next?

### Customize Benchmarks

```sql
UPDATE efficiency_benchmarks
SET target_duration_seconds = 150,  -- 2:30
    target_clicks = 12
WHERE encounter_type = 'follow-up';
```

### Add More Tracking

Look for high-value actions:
- Photo capture
- Prescription writing
- Order placement
- Document uploads
- Search queries

### Review Analytics

Weekly review:
1. Check provider leaderboard
2. Identify slow areas
3. Look for unused features
4. Celebrate achievements

---

## Demo Script

For showing to stakeholders:

1. **Start encounter** → Show EfficiencyBadge appear
2. **Click around** → Watch click count increase
3. **Wait 30 seconds** → Show time ticking
4. **Complete encounter** → Show EncounterSummary with confetti
5. **Open dashboard** → Show aggregate stats
6. **Point out:**
   - "We're 90 seconds faster than industry average"
   - "That's 47 hours saved this month"
   - "Dr. Smith is crushing it at #1"

---

## Support

Need help? Check:
1. [Full Implementation Guide](./METRICS_TRACKING_IMPLEMENTATION.md)
2. Code comments in each file
3. TypeScript types for API reference

---

**You're all set!** Start tracking and proving your efficiency claims! 🎯
