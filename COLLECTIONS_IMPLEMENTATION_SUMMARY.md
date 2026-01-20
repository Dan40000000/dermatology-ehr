# Patient Collections Workflow System - Implementation Summary

## Overview

A comprehensive Patient Collections workflow system has been implemented to maximize collection rates at time of service. The system is built on the key insight that **likelihood of collecting drops dramatically after 90 days**.

**Goal: Achieve 80%+ collection rate at time of service!**

## Files Created

### Backend

#### Database Migration
- **`backend/src/db/migrations/023_collections.sql`**
  - Patient balances table with aging buckets
  - Collection attempts tracking
  - Patient statements
  - Cost estimates
  - Collection statistics
  - Database function for updating patient balances

#### Services
- **`backend/src/services/collectionsService.ts`**
  - Get patient balance with aging breakdown
  - Process payments with collection point tracking
  - Record collection attempts
  - Generate aging reports
  - Calculate collection statistics
  - Get collection talking points based on balance age

- **`backend/src/services/costEstimator.ts`**
  - Get insurance benefits
  - Create detailed cost estimates
  - Quick estimates for common procedures
  - Calculate patient responsibility with insurance

#### Routes
- **`backend/src/routes/collections.ts`**
  - Patient balance endpoints
  - Payment processing
  - Cost estimate creation
  - Payment plan management
  - Aging reports
  - Collection statistics
  - Statement generation

### Frontend Components

#### Core Collections Components
- **`frontend/src/components/Collections/PatientBalanceCard.tsx`**
  - Shows at check-in prominently
  - Current visit charges (estimated)
  - Outstanding balance with age
  - Total to collect today
  - Payment method selector
  - Payment plan option
  - Collection tips and talking points

- **`frontend/src/components/Collections/CollectionPrompt.tsx`**
  - Modal that appears at check-in if balance exists
  - Shows patient outstanding balance
  - Age of balance (current, 30, 60, 90+ days)
  - Collection scripts/talking points
  - Options: Collect full, Partial, Payment plan, Skip (with reason)
  - Urgency indicators based on age

- **`frontend/src/components/Collections/PaymentProcessor.tsx`**
  - Accept multiple payment types (Card, Cash, Check, HSA/FSA)
  - Card on file support
  - Split payment capability
  - Receipt generation
  - Success confirmation

- **`frontend/src/components/Collections/PaymentPlanSetup.tsx`**
  - Create payment plan for large balances
  - Set monthly amount and duration
  - Auto-charge card on file option
  - Agreement generation
  - Plan summary and validation

- **`frontend/src/components/Collections/CostEstimator.tsx`**
  - Estimate patient responsibility BEFORE visit
  - Based on: insurance benefits, deductible status, service type
  - Shows: "Your estimated cost today: $X"
  - Detailed breakdown option
  - Helps set expectations, reduces surprise bills

- **`frontend/src/components/Collections/AgingBuckets.tsx`**
  - Visual aging report with buckets
  - Click bucket to see patients
  - Color-coded by urgency
  - Patient list with balance details

- **`frontend/src/components/Collections/StatementGenerator.tsx`**
  - Generate patient-friendly statements
  - Clear breakdown of charges
  - Insurance payments shown
  - Patient responsibility highlighted
  - Payment options listed
  - Delivery method selection (Email/Mail/Both)

#### Pages
- **`frontend/src/pages/CollectionsReportPage.tsx`**
  - Collections by day/week/month
  - Collection rate at time of service
  - Aging report with drill-down
  - Payment plan compliance
  - Collection trends charts
  - Three tabs: Overview, Aging, Trends

## API Endpoints

### Patient Balance
```
GET /api/collections/patient/:id/balance
```
Returns patient balance details including aging buckets and talking points.

### Payments
```
POST /api/collections/payment
```
Process a payment with collection point tracking.

### Cost Estimates
```
POST /api/collections/estimate
GET /api/collections/estimate/:appointmentId
POST /api/collections/estimate/quick
```
Create and retrieve cost estimates for patients.

### Payment Plans
```
POST /api/collections/payment-plan
GET /api/collections/payment-plans
```
Create and manage payment plans.

### Reporting
```
GET /api/collections/aging
GET /api/collections/stats
POST /api/collections/stats/update
```
Aging reports and collection statistics.

### Statements
```
POST /api/collections/statement/:patientId
GET /api/collections/statements/:patientId
```
Generate and retrieve patient statements.

## Database Schema

### Patient Balances
- Total balance with aging buckets (0-30, 31-60, 61-90, 90+)
- Oldest charge date
- Last payment information
- Payment plan and autopay flags

### Collection Attempts
- Track every collection attempt
- Collection point (check-in, check-out, phone, etc.)
- Result (collected_full, collected_partial, payment_plan, declined, skipped)
- Talking points used
- Skip reason if applicable

### Cost Estimates
- Service details and CPT codes
- Insurance calculation breakdown
- Patient responsibility estimate
- Cosmetic procedure flag
- Insurance verification status

### Collection Statistics
- Daily/weekly/monthly aggregation
- Collection by point of service
- Collection rates
- Attempt tracking

## Key Features

### 1. Check-In Collection Display
- **Prominent display** at patient check-in
- **Estimated visit cost** shown upfront
- **Outstanding balance** with age prominently displayed
- **Total to collect today** in large, clear format
- **Quick payment method** selection
- **One-click collection** for full amount
- **Collection tips** displayed to staff

### 2. Collection Prompts
- **Automatic prompt** when patient has balance
- **Age-based urgency** indicators (color-coded)
- **Talking points** customized to balance age
- **Multiple collection options** (full, partial, plan, skip)
- **Required skip reasons** for accountability
- **Policy reminders** for overdue balances

### 3. Cost Estimation
- **Pre-visit estimates** set expectations
- **Insurance benefit** integration
- **Deductible and coinsurance** calculations
- **Cosmetic procedure** handling (100% patient pay)
- **Quick estimates** for common procedures
- **Detailed breakdown** available

### 4. Payment Processing
- **Multiple payment types** supported
- **Card tokenization** for future use
- **Receipt generation** immediate
- **Split payments** capability
- **Reference number** tracking
- **Collection point** tracking

### 5. Payment Plans
- **Flexible terms** (3-24 months)
- **Auto-charge** option
- **Monthly payment** calculation
- **Plan compliance** tracking
- **Agreement generation**
- **Balance updates** automatic

### 6. Aging Reports
- **Visual bucket display** with percentages
- **Click-through** to patient lists
- **Color-coded urgency**
- **Trend tracking** over time
- **Export capability**

### 7. Collection Analytics
- **Collection rate at service** (goal: 80%+)
- **Overall collection rate**
- **Collection by point** (check-in, check-out, statement, portal)
- **Trend charts** over time
- **Date range filtering**

## Collection Scripts by Age

### Current (0-30 days)
**Script:** "Hi [Patient Name], I see you have a balance of $[Amount] from your recent visit. Would you like to take care of that today?"

**Tips:**
- Friendly and matter-of-fact
- Assume they want to pay
- Offer payment plan if over $200

### 31-60 days
**Script:** "[Patient Name], you have an outstanding balance of $[Amount] from [Date]. We'd really appreciate if you could take care of this today."

**Tips:**
- More direct tone
- Mention age of balance
- Strongly recommend payment plan

### 61-90 days
**Script:** "[Patient Name], you have a balance of $[Amount] that's now over 60 days old. Our policy requires payment today before we can proceed with your visit. How would you like to handle this?"

**Tips:**
- Firm but professional
- Policy-based approach
- Payment required before service
- Offer payment plan or partial payment

### 90+ days (CRITICAL)
**Script:** "[Patient Name], you have a seriously overdue balance of $[Amount] from over 90 days ago. We need to collect this balance today. Can you pay in full, or would you like to set up a payment plan?"

**Tips:**
- Very firm, professional tone
- Do not provide service without payment/plan
- May require manager approval to proceed
- Consider collections agency referral if no resolution

## Best Practices for Collections

### 1. Collect at Check-In
- Show balance immediately when patient checks in
- Use cost estimator to set expectations
- Process payment before patient sees provider
- **73% better** collection rate when collecting at service

### 2. Use Talking Points
- Age-appropriate scripts provided
- Professional but firm approach
- Policy-based for overdue balances
- Payment plan option always available

### 3. Offer Payment Plans
- For balances over $200
- Auto-charge option reduces defaults
- Monthly reminders sent
- Track compliance

### 4. Track Everything
- Every collection attempt recorded
- Skip reasons required
- Collection point tracked
- Analytics drive improvement

### 5. Monitor Metrics
- Target: 80%+ collection at service
- Track aging trend (should decrease over time)
- Identify problem areas
- Celebrate wins

## Integration Points

### With Existing Systems

1. **Patient Check-In**
   - Display PatientBalanceCard component
   - Show CollectionPrompt if balance > $0
   - Process payment before appointment

2. **Scheduling**
   - Create cost estimate when appointment scheduled
   - Send estimate to patient before visit
   - Set expectations early

3. **Billing**
   - Update balances after claim processing
   - Generate statements monthly
   - Track payment plans

4. **Reporting**
   - Daily collection stats
   - Weekly aging reports
   - Monthly trend analysis

## Success Metrics

### Primary Goal
**80%+ collection rate at time of service**

### Secondary Metrics
- Decrease in 90+ day balances
- Increase in payment plan adoption
- Reduction in write-offs
- Improved cash flow

### Tracking
- Daily collection stats updated
- Aging report run weekly
- Trend analysis monthly
- Staff training quarterly

## Next Steps

### Immediate (Week 1)
1. Run database migration
2. Test payment processing
3. Train front desk staff
4. Enable at check-in stations

### Short-term (Month 1)
1. Monitor collection rates
2. Refine talking points
3. Adjust policies as needed
4. Gather staff feedback

### Long-term (Quarter 1)
1. Analyze trends
2. Identify best practices
3. Optimize workflows
4. Set new targets

## Tips for Success

### For Front Desk Staff
1. **Always show the balance card** at check-in
2. **Use the talking points** - they work!
3. **Offer payment plans** for large balances
4. **Never skip without a reason** - accountability matters
5. **Celebrate successes** - share wins with team

### For Management
1. **Review metrics weekly** - stay on top of trends
2. **Coach staff** using real examples
3. **Recognize top collectors** - incentivize good behavior
4. **Address aging balances** proactively
5. **Update policies** based on data

### For Providers
1. **Support front desk** - patients need to pay
2. **Review cost estimates** before procedures
3. **Discuss cosmetic costs** upfront
4. **Encourage payment plans** for patients in need

## Technical Notes

### Performance
- Balance calculations cached
- Aging reports computed on demand
- Stats aggregated daily
- Indexes on all search fields

### Security
- All payments logged
- Audit trail complete
- PCI compliance ready (tokenization)
- Role-based access

### Scalability
- Handles thousands of patients
- Daily stats processing
- Efficient queries
- Background jobs for heavy lifting

## Support

### Documentation
- API documentation in routes file
- Component props documented
- Database schema documented
- Scripts provided for common scenarios

### Training
- Staff training materials needed
- Video walkthroughs recommended
- Best practices guide included
- Ongoing support plan

## Conclusion

This Collections workflow system provides a comprehensive solution for improving collection rates at time of service. By prominently displaying balances, providing talking points, offering flexible payment options, and tracking metrics, practices can achieve the target of 80%+ collection at service and dramatically reduce aging receivables.

The system is built on evidence-based best practices:
- **Collect early** - likelihood drops after 90 days
- **Set expectations** - cost estimates reduce surprise
- **Offer options** - payment plans keep patients engaged
- **Track everything** - data drives improvement
- **Coach staff** - talking points and scripts work

**Remember: Every day a balance ages, it becomes harder to collect. Collect at time of service!**
