# Collections Workflow - Quick Start Guide

## Goal: 80%+ Collection Rate at Time of Service!

### Key Insight
**Likelihood of collecting drops dramatically after 90 days. Collect at time of service!**

## Quick Setup

### 1. Database Migration
```bash
# Run the collections migration
psql -U your_user -d your_database -f backend/src/db/migrations/023_collections.sql
```

### 2. Backend Routes Registration
Add to `backend/src/index.ts`:
```typescript
import { collectionsRouter } from "./routes/collections";

// Register route
app.use("/api/collections", collectionsRouter);
```

### 3. Frontend Integration
Import components where needed:
```typescript
import { PatientBalanceCard } from "./components/Collections/PatientBalanceCard";
import { CollectionPrompt } from "./components/Collections/CollectionPrompt";
import { PaymentProcessor } from "./components/Collections/PaymentProcessor";
```

## Usage Examples

### At Patient Check-In

```tsx
import { useState } from "react";
import { PatientBalanceCard } from "./components/Collections/PatientBalanceCard";
import { CollectionPrompt } from "./components/Collections/CollectionPrompt";
import { PaymentProcessor } from "./components/Collections/PaymentProcessor";

function CheckInPage({ patient, appointment }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);

  return (
    <div>
      {/* Show balance card prominently */}
      <PatientBalanceCard
        patientId={patient.id}
        encounterId={appointment.id}
        estimatedVisitCost={40} // From cost estimator
        onPaymentClick={(amount) => {
          setPaymentAmount(amount);
          setShowPayment(true);
        }}
        onPaymentPlanClick={() => {
          // Open payment plan setup
        }}
      />

      {/* Payment processor modal */}
      <PaymentProcessor
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        patientId={patient.id}
        patientName={patient.name}
        amount={paymentAmount}
        encounterId={appointment.id}
        collectionPoint="check_in"
        onSuccess={(paymentId, receiptNumber) => {
          console.log("Payment successful:", receiptNumber);
          setShowPayment(false);
        }}
      />
    </div>
  );
}
```

### Pre-Visit Cost Estimate

```tsx
import { CostEstimator } from "./components/Collections/CostEstimator";

function AppointmentScheduling({ patient, serviceType }) {
  return (
    <div>
      <CostEstimator
        patientId={patient.id}
        serviceType={serviceType}
        cptCodes={["99213"]} // Office visit
        onEstimateReady={(amount) => {
          console.log("Estimated patient responsibility:", amount);
        }}
      />
    </div>
  );
}
```

### Collections Report

```tsx
import { CollectionsReportPage } from "./pages/CollectionsReportPage";

// Add to your router
<Route path="/reports/collections" element={<CollectionsReportPage />} />
```

## Common Workflows

### Workflow 1: Patient with Outstanding Balance Checks In

1. **System displays** PatientBalanceCard showing:
   - Outstanding balance: $125.00 (45 days old)
   - Today's visit estimate: $40.00
   - Total to collect: $165.00

2. **Front desk clicks** "Collect Full $165"

3. **PaymentProcessor opens**
   - Staff selects payment method (Card)
   - Enters last 4 digits
   - Clicks "Process"

4. **Receipt generated** and printed

5. **Balance updated** automatically

### Workflow 2: Patient Can't Pay Full Amount

1. **System displays** balance at check-in

2. **Staff clicks** "Payment Plan"

3. **PaymentPlanSetup opens**:
   - Total: $500.00
   - Suggested: $83.33/month for 6 months
   - Staff adjusts to $100/month for 5 months
   - Auto-charge option enabled

4. **Plan created** and patient agreement generated

5. **First payment** collected today

### Workflow 3: Patient Disputes Balance

1. **System shows** balance at check-in

2. **Staff must skip** collection (can't just ignore)

3. **CollectionPrompt** requires reason:
   - "Patient disputes charges"

4. **Skip recorded** with reason

5. **Manager notified** for follow-up

## API Quick Reference

### Get Patient Balance
```javascript
const response = await api.get(`/api/collections/patient/${patientId}/balance`);
// Returns: { totalBalance, currentBalance, balance31_60, balance61_90, balanceOver90, talkingPoints }
```

### Process Payment
```javascript
const response = await api.post("/api/collections/payment", {
  patientId: "pat123",
  amount: 125.50,
  paymentMethod: "card",
  cardLastFour: "4242",
  collectionPoint: "check_in",
  encounterId: "enc456"
});
// Returns: { paymentId, receiptNumber }
```

### Create Cost Estimate
```javascript
const response = await api.post("/api/collections/estimate", {
  patientId: "pat123",
  serviceType: "Office Visit",
  cptCodes: ["99213"],
  isCosmetic: false
});
// Returns: { estimate: { patientResponsibility, breakdown } }
```

### Get Aging Report
```javascript
const response = await api.get("/api/collections/aging");
// Returns: { buckets: { current, days31_60, days61_90, over90 }, patients: [...] }
```

## Collection Scripts

### Script for Current Balance (0-30 days)
> "Hi [Patient Name], I see you have a balance of $[Amount] from your recent visit. Would you like to take care of that today?"

### Script for 31-60 days
> "[Patient Name], you have an outstanding balance of $[Amount] from [Date]. We'd really appreciate if you could take care of this today."

### Script for 61-90 days
> "[Patient Name], you have a balance of $[Amount] that's now over 60 days old. Our policy requires payment today before we can proceed with your visit. How would you like to handle this?"

### Script for 90+ days (CRITICAL)
> "[Patient Name], you have a seriously overdue balance of $[Amount] from over 90 days ago. We need to collect this balance today. Can you pay in full, or would you like to set up a payment plan?"

## Best Practices

### DO:
- ✅ Show balance card at EVERY check-in
- ✅ Use the provided talking points
- ✅ Offer payment plans for balances over $200
- ✅ Collect at check-in (not check-out)
- ✅ Record ALL collection attempts
- ✅ Provide receipts immediately
- ✅ Set expectations with cost estimates

### DON'T:
- ❌ Skip without recording a reason
- ❌ Let balances age past 90 days
- ❌ Surprise patients with unexpected costs
- ❌ Ignore small balances (they add up!)
- ❌ Forget to track collection point
- ❌ Provide service without payment/plan for 90+ day balances

## Success Metrics

### Target: 80%+ Collection at Service

**How to Calculate:**
```
Collection Rate at Service = (Amount Collected at Check-in + Check-out) / Total Charges
```

### Track Weekly:
- [ ] Overall collection rate
- [ ] Collection rate at service
- [ ] Aging balances (trend should decrease)
- [ ] Payment plan adoption
- [ ] Staff performance

### Monitor Daily:
- [ ] Today's collections
- [ ] Payment method breakdown
- [ ] Skip reasons
- [ ] Large balances

## Troubleshooting

### "Patient balance not showing"
- Check if patient has any charges with status='pending'
- Verify database function `update_patient_balance` ran
- Check tenant_id matches

### "Cost estimate too high/low"
- Verify fee schedule is configured
- Check insurance benefits are current
- Review deductible/coinsurance settings

### "Payment not posting"
- Check API endpoint is registered
- Verify user has proper role (front_desk, admin, provider)
- Check collection_point is valid value

### "Talking points not appearing"
- Ensure balance.oldestChargeDate exists
- Check talkingPoints in API response
- Verify PatientBalanceCard is using latest version

## Support

### Need Help?
1. Check API response in browser console
2. Review backend logs for errors
3. Verify database tables exist
4. Check user roles and permissions

### Common Issues:
- **"Insufficient permissions"** → User needs front_desk or admin role
- **"Patient not found"** → Check tenant_id and patient_id match
- **"Invalid collection_point"** → Must be: check_in, check_out, phone, statement, portal, or text

## Training Checklist

### For Front Desk Staff:
- [ ] Understand the 90-day rule
- [ ] Practice using talking points
- [ ] Learn payment processor
- [ ] Know how to setup payment plans
- [ ] Understand skip reasons requirement

### For Management:
- [ ] Review daily collection reports
- [ ] Monitor aging trends
- [ ] Coach staff on best practices
- [ ] Set collection targets
- [ ] Recognize top performers

## Quick Wins

### Week 1:
1. Train all front desk staff
2. Enable balance display at check-in
3. Start using talking points
4. Track baseline metrics

### Month 1:
1. Achieve 60%+ collection at service
2. Reduce 90+ day balances by 25%
3. Setup payment plans for large balances
4. Generate first aging report

### Quarter 1:
1. Achieve 80%+ collection at service
2. Reduce 90+ day balances by 50%
3. Implement automated statements
4. Optimize workflows based on data

---

**Remember: The best time to collect is TODAY. Every day a balance ages, it becomes harder to collect!**
