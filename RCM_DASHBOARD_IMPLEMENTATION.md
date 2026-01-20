# Revenue Cycle Management Dashboard - Implementation Summary

## Overview

This document summarizes the comprehensive Revenue Cycle Management (RCM) Dashboard implementation for office managers to monitor the financial health of their dermatology practice.

## Implementation Date
January 19, 2026

## Files Created

### Backend Files

1. **`/backend/src/db/migrations/023_rcm_metrics.sql`**
   - Database schema for RCM metrics tracking
   - Tables created:
     - `rcm_daily_metrics` - Daily snapshot of key metrics
     - `rcm_payer_metrics` - Performance tracking by insurance payer
     - `rcm_provider_metrics` - Provider productivity metrics
     - `rcm_denial_reasons` - Denial tracking and analysis
     - `rcm_action_items` - Items requiring attention
     - `rcm_benchmarks` - Industry benchmarks for comparison
   - Includes stored function `calculate_rcm_daily_metrics()` for automated metric calculation

2. **`/backend/src/services/rcmAnalytics.ts`**
   - Core analytics service with methods:
     - `calculateKPIs()` - Calculate key performance indicators
     - `getARAgingData()` - Get A/R aging breakdown
     - `getCollectionsTrend()` - Track collections over time
     - `getDenialAnalysis()` - Analyze denial reasons and trends
     - `getPayerPerformance()` - Revenue breakdown by payer
     - `getProviderProductivity()` - Provider productivity metrics
     - `getActionItems()` - Items requiring attention
     - `getFinancialEvents()` - Upcoming financial events
     - `getBenchmarks()` - Industry benchmark comparison
     - `generateAlerts()` - Alert generation based on thresholds

3. **`/backend/src/routes/rcm.ts`**
   - RESTful API endpoints:
     - `GET /api/rcm/dashboard` - Full dashboard data
     - `GET /api/rcm/kpis` - Key performance indicators
     - `GET /api/rcm/aging` - A/R aging detail
     - `GET /api/rcm/collections` - Collection statistics
     - `GET /api/rcm/denials` - Denial analysis
     - `GET /api/rcm/payer-mix` - Payer breakdown
     - `GET /api/rcm/provider-stats` - Provider productivity
     - `GET /api/rcm/trends` - Historical trends
     - `GET /api/rcm/action-items` - Items needing attention
     - `GET /api/rcm/calendar` - Financial calendar events
     - `POST /api/rcm/action-items/:id/resolve` - Resolve action item
     - `POST /api/rcm/metrics/calculate` - Trigger metric calculation
     - `GET /api/rcm/benchmarks` - Industry benchmarks

### Frontend Files

4. **`/frontend/src/components/RCM/KPICards.tsx`**
   - Big number cards displaying:
     - Total Charges (this period)
     - Total Collections
     - Collection Rate %
     - Days in A/R
     - Denial Rate %
     - Clean Claim Rate %
   - Month-over-month comparison with trend arrows
   - Color-coded status indicators (green=good, yellow=fair, red=needs attention)
   - Benchmark comparison badges

5. **`/frontend/src/components/RCM/AgingChart.tsx`**
   - Visual A/R aging breakdown:
     - Current (0-30 days)
     - 31-60 days
     - 61-90 days
     - 91-120 days
     - 120+ days
   - Bar chart visualization with color coding
   - Detailed breakdown list with percentages
   - Warning banner for high aged A/R
   - Drill-down capability to patient list

6. **`/frontend/src/components/RCM/CollectionsTrend.tsx`**
   - Line/area chart showing collections vs charges over time
   - Switchable views: Monthly, Weekly, Daily
   - Gap analysis visualization
   - Summary statistics cards
   - Year-over-year comparison capability

7. **`/frontend/src/components/RCM/DenialAnalysis.tsx`**
   - Pie chart of top 5 denial reasons
   - Denial reason breakdown with counts and amounts
   - Recovery rate on appealed denials
   - Total denial metrics
   - Actionable recommendations

8. **`/frontend/src/components/RCM/PayerMix.tsx`**
   - Revenue breakdown by insurance payer
   - Performance metrics per payer:
     - Total charges
     - Payments received
     - Denial rate
     - Average days to pay
     - Collection rate
   - Color-coded performance indicators
   - Sortable table view

9. **`/frontend/src/components/RCM/ProviderProductivity.tsx`**
   - Revenue by provider visualization
   - Productivity metrics:
     - Number of encounters
     - Unique patients seen
     - Total charges
     - Charges per patient
     - Collection rate
     - Denial rate
   - Bar chart for revenue comparison
   - Detailed table with all metrics

10. **`/frontend/src/components/RCM/ActionItems.tsx`**
    - Prioritized list of items needing attention:
      - Denied claims to appeal
      - Claims needing review
      - High patient balances to collect
      - Prior authorizations expiring
      - Insurance verification issues
      - Claims needing scrub review
    - Priority levels: Urgent, High, Medium, Low
    - Due date tracking with overdue indicators
    - Quick resolve and view actions
    - Empty state for when no actions needed

11. **`/frontend/src/components/RCM/FinancialCalendar.tsx`**
    - Calendar view of financial events:
      - Expected payments by day
      - Upcoming billing runs
      - Payment plan due dates
      - Prior auth expiration dates
      - Statement generation dates
    - Monthly calendar grid
    - Event list view
    - Event type indicators with icons
    - Color-coded event categories

12. **`/frontend/src/pages/admin/RevenueCycleDashboard.tsx`**
    - Main dashboard page that orchestrates all components
    - Features:
      - Period selector (MTD, QTD, YTD)
      - Auto-refresh toggle (5-minute intervals)
      - Manual refresh button
      - PDF export functionality
      - Excel/CSV export functionality
      - Alert banner for performance issues
      - Responsive grid layout
      - Real-time data updates
      - Error handling and loading states

## Key Features

### 1. Comprehensive KPI Tracking
- **Total Charges**: Track medical and cosmetic charges
- **Total Collections**: Monitor insurance and patient payments
- **Collection Rate**: Calculate percentage of charges collected
- **Days in A/R**: Average age of outstanding receivables
- **Denial Rate**: Percentage of claims denied
- **Clean Claim Rate**: First-pass claim acceptance rate
- **Net Collection Rate**: Collections after adjustments

### 2. A/R Aging Management
- Visual breakdown by aging buckets
- Percentage distribution
- Dollar amounts per bucket
- Warning indicators for old A/R
- Drill-down capability

### 3. Trend Analysis
- Collections over time
- Charges vs collections gap
- Monthly, weekly, and daily views
- Historical comparison

### 4. Denial Management
- Top 5 denial reasons with percentages
- Denial amount tracking
- Recovery rate monitoring
- Actionable recommendations

### 5. Payer Performance
- Revenue by insurance payer
- Denial rates per payer
- Average days to payment
- Collection rates by payer
- Performance indicators

### 6. Provider Productivity
- Revenue by provider
- Encounters and patient counts
- Charges per patient
- Collection rates
- Quality metrics

### 7. Action Item Management
- Prioritized task list
- Multiple action types
- Due date tracking
- Status management
- Quick resolution

### 8. Financial Calendar
- Visual calendar view
- Upcoming financial events
- Payment schedules
- Important date tracking
- Event categorization

### 9. Benchmarking
- Industry benchmark comparison
- Dermatology-specific metrics
- Percentile rankings (25th, 50th, 75th, 90th)
- Performance status indicators

### 10. Export Capabilities
- PDF report generation
- Excel/CSV export
- Comprehensive data inclusion
- Print-friendly formatting

## Dashboard Layout

```
┌── Revenue Cycle Dashboard ───────────────────────────────────────────────┐
│  January 2026                                   [MTD][QTD][YTD] [🔄][📄] │
├──────────────────────────────────────────────────────────────────────────┤
│  ⚠️  Alerts: High denial rate | Days in A/R exceeds target               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─ Charges ─┐ ┌─ Collections ┐ ┌─ A/R Days ─┐ ┌─ Denial % ┐ ┌─ Clean ┐│
│  │ $185,420  │ │ $142,850     │ │ 28 days    │ │ 6.2%      │ │ 94%    ││
│  │ ↑ 8% MoM  │ │ ↑ 12% MoM    │ │ ↓ from 35  │ │ ↓ from 14%│ │ ↑ 3%   ││
│  │ [GOOD]    │ │ [EXCELLENT]  │ │ [GOOD]     │ │ [GOOD]    │ │ [GOOD] ││
│  └───────────┘ └──────────────┘ └────────────┘ └───────────┘ └────────┘│
│                                                                          │
│  ┌─ A/R AGING ─────────────────┐  ┌─ COLLECTIONS TREND ───────────────┐ │
│  │ Current    ████████ $45K 65%│  │      📈                           │ │
│  │ 31-60      ███ $12K     17% │  │     /  \    /\                    │ │
│  │ 61-90      ██ $8K      12%  │  │    /    \  /  \  /                │ │
│  │ 91-120     █ $4K        6%  │  │ ──/──────\/────\/──               │ │
│  │ 120+       █ $2K   ⚠️  3%   │  │  Jan  Feb  Mar  Apr               │ │
│  └─────────────────────────────┘  └───────────────────────────────────┘ │
│                                                                          │
│  ┌─ TOP DENIAL REASONS ────────┐  ┌─ ACTION ITEMS ────────────────────┐ │
│  │ 🔴 28% Missing PA           │  │ ⚠️ URGENT (3)                     │ │
│  │ 🟠 22% Invalid Modifier     │  │ • 5 claims denied - appeal ready  │ │
│  │ 🟡 18% Cosmetic Flag        │  │ • 3 PAs expiring this week       │ │
│  │ 🟢 12% Duplicate Claim      │  │ 🔥 HIGH (5)                       │ │
│  │ 🔵 8% Other                 │  │ • 12 patients >$500 balance      │ │
│  │ Recovery Rate: 35%          │  │ • 8 claims need scrub            │ │
│  └─────────────────────────────┘  └───────────────────────────────────┘ │
│                                                                          │
│  ┌─ PAYER PERFORMANCE ─────────────────────────────────────────────────┐│
│  │ Payer        │ Charges   │ Paid      │ Denial │ Days │ Collection ││
│  │ Blue Cross   │ $45K      │ $38K      │ 4.2%🟢 │ 18🟢 │ 95%🟢      ││
│  │ Aetna        │ $32K      │ $27K      │ 8.1%🟡 │ 24🟢 │ 92%🟢      ││
│  │ Medicare     │ $28K      │ $25K      │ 2.1%🟢 │ 14🟢 │ 97%🟢      ││
│  │ United       │ $25K      │ $20K      │ 12.5%🔴│ 32🔴 │ 85%🟡      ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─ PROVIDER PRODUCTIVITY ─────────────────────────────────────────────┐│
│  │ Provider       │ Encounters │ Patients │ Revenue │ Per Pt │ Coll % ││
│  │ Dr. Smith      │ 145        │ 128      │ $42K    │ $328   │ 96%🟢  ││
│  │ Dr. Johnson    │ 132        │ 115      │ $38K    │ $330   │ 94%🟢  ││
│  │ Dr. Williams   │ 98         │ 87       │ $28K    │ $322   │ 95%🟢  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─ FINANCIAL CALENDAR (Next 30 Days) ────────────────────────────────┐│
│  │ Sun Mon Tue Wed Thu Fri Sat                                         ││
│  │  1💰  2   3📄  4   5💰  6   7                                       ││
│  │  8   9💰 10  11  12⏰ 13  14                                        ││
│  │ 15💳 16  17  18  19  20  21                                         ││
│  └─────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

## Integration Points

### 1. Backend Integration Required

To make the RCM dashboard functional, the following backend route needs to be registered in `/backend/src/index.ts`:

```typescript
import { rcmRouter } from './routes/rcm';

// Add this with other route registrations:
app.use('/api/rcm', rcmRouter);
```

### 2. Database Migration

Run the migration to create the necessary tables:

```bash
# From the backend directory
npm run migrate

# Or manually run the SQL file
psql -d your_database -f src/db/migrations/023_rcm_metrics.sql
```

### 3. Frontend Routing

Add the route to your router configuration:

```typescript
// In your router file
import { RevenueCycleDashboard } from './pages/admin/RevenueCycleDashboard';

// Add route
{
  path: '/admin/rcm',
  element: <RevenueCycleDashboard />
}
```

### 4. Navigation Menu

Add a menu item to access the dashboard:

```tsx
<NavLink to="/admin/rcm">
  <span>Revenue Cycle</span>
</NavLink>
```

## Data Flow

1. **Metric Calculation**
   - Runs automatically or on-demand via API
   - Function `calculate_rcm_daily_metrics()` processes daily snapshots
   - Aggregates data from bills, claims, payments, etc.

2. **Dashboard Load**
   - Fetches main dashboard data (KPIs, aging, denials, benchmarks)
   - Parallel requests for supplementary data (trends, payers, providers)
   - Displays loading state during fetch
   - Updates all components with fresh data

3. **Auto-Refresh**
   - Optional 5-minute auto-refresh
   - Preserves user's current view and filters
   - Shows success notification on refresh

4. **Export**
   - PDF: Uses jsPDF and autoTable for formatted reports
   - Excel: Generates CSV format with comprehensive data
   - Includes all KPIs, breakdowns, and analysis

## Performance Considerations

1. **Caching**
   - Daily metrics are pre-calculated and cached
   - Dashboard queries optimized with proper indexes
   - Parallel API calls for faster page load

2. **Database Indexes**
   - All foreign keys indexed
   - Date columns indexed for range queries
   - Tenant_id + date composite indexes
   - Status fields indexed for filtering

3. **Query Optimization**
   - Uses aggregated metrics where possible
   - Limits result sets appropriately
   - Efficient date range filtering
   - Proper use of GROUP BY and aggregate functions

## Security

1. **Authentication**
   - All endpoints require valid session token
   - Tenant isolation enforced on all queries
   - User permissions checked for sensitive operations

2. **Authorization**
   - Only admin and office manager roles should access
   - Provider-specific data filtered by permissions
   - Sensitive financial data protected

## Testing Recommendations

1. **Unit Tests**
   - Test RCMAnalyticsService methods
   - Test KPI calculations
   - Test data aggregations

2. **Integration Tests**
   - Test API endpoints
   - Test database queries
   - Test data flow from DB to UI

3. **UI Tests**
   - Test component rendering
   - Test user interactions
   - Test export functionality

## Maintenance

1. **Regular Tasks**
   - Review and update benchmark values annually
   - Monitor query performance
   - Clean up old metric snapshots (optional)

2. **Monitoring**
   - Track dashboard load times
   - Monitor API response times
   - Alert on metric calculation failures

## Future Enhancements

1. **Advanced Analytics**
   - Predictive cash flow modeling
   - AI-powered denial prevention
   - Automated collections optimization

2. **Integrations**
   - Clearinghouse integration for real-time claim status
   - Payment processor integration
   - Credit bureau integration for patient collections

3. **Automation**
   - Automated denial appeals
   - Smart follow-up scheduling
   - Automated statement generation

4. **Customization**
   - Custom KPI definitions
   - Configurable alerts
   - User-specific dashboard layouts

## Conclusion

This comprehensive RCM dashboard provides office managers with all the tools they need to monitor and improve the financial health of their dermatology practice. The modular component architecture makes it easy to extend and customize, while the robust backend ensures accurate and performant data delivery.

The dashboard focuses on actionable insights, not just raw numbers, helping staff identify issues quickly and take corrective action. With benchmarking, trend analysis, and automated alerts, it serves as the command center for practice finances.

## Support

For issues or questions:
- Check the API documentation at `/api/rcm/` endpoints
- Review component props and interfaces
- Consult the database schema in the migration file
- Test with sample data to verify calculations
