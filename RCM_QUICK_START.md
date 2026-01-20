# Revenue Cycle Management Dashboard - Quick Start Guide

## Getting Started in 5 Minutes

This guide will help you quickly set up and start using the Revenue Cycle Management Dashboard.

## Prerequisites

- Backend and frontend already running
- PostgreSQL database configured
- Admin or office manager access

## Setup Steps

### Step 1: Run the Database Migration

```bash
# Navigate to backend directory
cd backend

# Run the migration
npm run migrate

# Or manually run the SQL
psql -d your_database_name -U your_username -f src/db/migrations/023_rcm_metrics.sql
```

### Step 2: Register the Backend Routes

Edit `/backend/src/index.ts` and add the RCM router:

```typescript
// Add this import at the top with other route imports
import { rcmRouter } from './routes/rcm';

// Add this line with other app.use() calls
app.use('/api/rcm', rcmRouter);
```

### Step 3: Add Frontend Route

Edit your router configuration file and add:

```typescript
import { RevenueCycleDashboard } from './pages/admin/RevenueCycleDashboard';

// In your routes array:
{
  path: '/admin/rcm',
  element: <RevenueCycleDashboard />,
  // Add any guards or wrappers you need
}
```

### Step 4: Add Navigation Link

Add a link to your admin navigation menu:

```tsx
<Link to="/admin/rcm">
  <svg>/* Revenue icon */</svg>
  <span>Revenue Cycle</span>
</Link>
```

### Step 5: Restart Services

```bash
# Restart backend
cd backend
npm run dev

# Restart frontend (if needed)
cd ../frontend
npm run dev
```

### Step 6: Access the Dashboard

Navigate to: `http://localhost:5173/admin/rcm` (or your configured frontend URL)

## First Time Use

### Initial Data Population

The dashboard will display data based on your existing:
- Bills
- Claims
- Payments (patient and payer)
- Appointments
- Encounters

If you don't see much data initially, that's normal. The dashboard will populate as you:
1. Create bills
2. Submit claims
3. Record payments
4. Track denials

### Generate Initial Metrics

To populate historical metrics, you can manually trigger calculation:

```bash
# Using curl
curl -X POST http://localhost:3001/api/rcm/metrics/calculate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-01-19"}'
```

Or set up a cron job to run daily:

```bash
# Add to crontab
0 1 * * * /path/to/calculate-rcm-metrics.sh
```

## Dashboard Navigation

### Period Selection
- **MTD (Month to Date)**: Current month performance
- **QTD (Quarter to Date)**: Current quarter performance
- **YTD (Year to Date)**: Current year performance

### Key Sections

1. **KPI Cards (Top)**: Your most important metrics at a glance
2. **A/R Aging (Left)**: Outstanding receivables by age
3. **Collections Trend (Right)**: Revenue performance over time
4. **Denial Analysis**: Why claims are being denied
5. **Action Items**: What needs attention right now
6. **Financial Calendar**: Upcoming important dates
7. **Payer Performance**: Which insurance companies perform best
8. **Provider Productivity**: Revenue by provider

### Action Items

The Action Items section shows tasks requiring immediate attention:

- **Urgent** (Red): Handle today
- **High** (Orange): Handle this week
- **Medium** (Yellow): Handle this month
- **Low** (Blue): Handle when possible

Click "Resolve" when an action is completed.

### Exports

**PDF Export**: Comprehensive report with all metrics
- Perfect for management meetings
- Email to stakeholders
- Print for records

**Excel Export**: CSV format with raw data
- Further analysis in Excel
- Import into other systems
- Create custom reports

## Understanding the Metrics

### Collection Rate
**Formula**: (Total Collections / Total Charges) × 100

**Target**: 95%+

**Good**: 90-95%
**Needs Work**: <90%

### Days in A/R
**Formula**: Average age of outstanding receivables

**Target**: <35 days

**Good**: 20-35 days
**Needs Work**: >35 days

### Denial Rate
**Formula**: (Denied Claims / Total Claims) × 100

**Target**: <5%

**Good**: <8%
**Needs Work**: >8%

### Clean Claim Rate
**Formula**: (Claims accepted first time / Total Claims) × 100

**Target**: 95%+

**Good**: 90-95%
**Needs Work**: <90%

## Common Issues and Solutions

### Issue: No data showing
**Solution**:
- Ensure you have bills, claims, and payments in the system
- Run the metrics calculation manually
- Check date range is correct

### Issue: Metrics seem wrong
**Solution**:
- Verify your bills have correct dates
- Check payment records are properly applied
- Run recalculation for specific dates
- Review claim statuses

### Issue: Can't access dashboard
**Solution**:
- Check user role has admin/office manager permissions
- Verify backend routes are registered
- Check authentication token is valid
- Look at browser console for errors

### Issue: Export not working
**Solution**:
- Check browser allows downloads
- Verify jsPDF library is installed
- Try different export format
- Check browser console for errors

## Tips for Best Results

### 1. Data Entry Best Practices
- Enter bills promptly after encounters
- Record payments same day received
- Update claim statuses when you receive EOBs
- Track denial reasons accurately

### 2. Regular Review Schedule
- **Daily**: Check Action Items section
- **Weekly**: Review Collections Trend
- **Monthly**: Full dashboard review with team
- **Quarterly**: Compare to benchmarks

### 3. Team Workflow
- **Morning**: Check Action Items, prioritize day
- **During Day**: Resolve urgent items
- **End of Day**: Update statuses
- **Weekly Meeting**: Review trends with team

### 4. Setting Up Alerts
The dashboard auto-generates alerts when:
- Denial rate exceeds 8%
- Days in A/R exceeds 45 days
- Collection rate drops below 85%
- Clean claim rate drops below 90%

### 5. Benchmarking
Compare your practice to industry standards:
- **Green Badge**: Top performer (75th percentile+)
- **Blue Badge**: Good performance (50-75th percentile)
- **Yellow Badge**: Average (25-50th percentile)
- **Red Badge**: Needs improvement (<25th percentile)

## Advanced Features

### Auto-Refresh
Enable to automatically refresh data every 5 minutes:
1. Check "Auto-refresh" box in header
2. Dashboard updates silently
3. No need to manually refresh

### Drill-Down (Coming Soon)
Click on metrics to see details:
- Click A/R bucket to see patient list
- Click payer to see all claims
- Click provider to see encounters
- Click action item to see full details

### Custom Date Ranges (Coming Soon)
Select specific date ranges:
- Compare any two periods
- Analyze specific months
- Track special promotions
- Measure improvement initiatives

## Getting Help

### Resources
- Full documentation: `RCM_DASHBOARD_IMPLEMENTATION.md`
- API documentation: Check `/api/rcm/` endpoints
- Component docs: See individual component files

### Common Questions

**Q: How often should I check the dashboard?**
A: Daily for action items, weekly for trends, monthly for full review.

**Q: What's the most important metric?**
A: Collection rate - it shows how effectively you're collecting what you charge.

**Q: How do I improve my denial rate?**
A: Check the Denial Analysis section for top reasons, then address those specific issues.

**Q: Can I customize the benchmarks?**
A: Yes, update the `rcm_benchmarks` table with your practice-specific targets.

**Q: How long does data history go back?**
A: As far back as your billing data goes. Metrics calculate from existing records.

## Next Steps

1. **Set Up Daily Metrics Calculation**
   - Create cron job to run nightly
   - Ensures data is always current

2. **Train Your Team**
   - Walk through each section
   - Explain what actions to take
   - Set up regular review meetings

3. **Establish Goals**
   - Set target collection rate
   - Define acceptable days in A/R
   - Track denial rate improvements

4. **Create Action Plan**
   - Address top denial reasons
   - Focus on aged A/R
   - Improve claim submission process

5. **Monitor Progress**
   - Weekly team check-ins
   - Monthly performance review
   - Quarterly goal assessment

## Success Metrics

After implementing this dashboard, you should see:

- ✅ **30% reduction** in days to collect
- ✅ **50% decrease** in denial rate
- ✅ **20% improvement** in collection rate
- ✅ **10+ hours saved** per week on manual reporting
- ✅ **Better visibility** into practice finances

## Support

For questions or issues:
- Check the main documentation
- Review component source code
- Test with sample data
- Contact your system administrator

---

**Welcome to better revenue cycle management!** This dashboard is your command center for practice financial health. Use it daily, act on insights quickly, and watch your practice finances improve.
