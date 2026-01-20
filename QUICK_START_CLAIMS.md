# Quick Start: Enhanced Claims System

## TL;DR - Get Running in 3 Steps

```bash
# 1. Navigate to backend and run setup
cd backend
./setup-claims.sh

# 2. Start backend (in one terminal)
npm run dev

# 3. Start frontend (in another terminal)
cd ../frontend
npm run dev
```

Then visit: `http://localhost:5173/claims-dashboard`

## What You Get

### 10 Realistic Claims
- Psoriasis with Kenalog injection (PAID)
- BCC biopsy (SUBMITTED)
- Atopic dermatitis (PAID)
- Seborrheic keratosis (DENIED - cosmetic)
- Acne treatment (PAID)
- Teen acne visit (PENDING)
- Multiple AK destructions (PAID)
- Malignant lesion excision (SUBMITTED)
- Shingles treatment (DRAFT)
- Tinea pedis (PAID)

### 165+ Diagnosis Codes (ICD-10)
Common dermatology conditions including:
- Psoriasis (L40.x)
- Eczema (L20.x)
- Acne (L70.x)
- Melanoma (C43.x)
- BCC/SCC (C44.x)
- Moles (D22.x)
- AK (L57.0)
- Fungal (B35.x)
- Shingles (B02.x)
- And many more!

### 17 CPT Codes
- E/M visits (99213, 99214, 99203, 99204)
- Biopsies (11100, 11101)
- Destructions (17000, 17003, 17110)
- Excisions (11400, 11401, 11600, 11601)
- Repairs (12001, 12032)
- Injections (96372, J3301)

### Dashboard Features
- Pending claims count and $ amount
- Average days to payment
- Denial rate (target < 5%)
- Collection rate
- Aging buckets (0-30, 31-60, 61-90, 90+ days)
- First-pass acceptance rate

## File Changes Made

### Backend
- `/backend/src/db/migrations/024_claims_enhancements.sql` - NEW
- `/backend/src/db/seed-claims.ts` - NEW
- `/backend/src/routes/claims.ts` - UPDATED
- `/backend/setup-claims.sh` - NEW

### Frontend
- `/frontend/src/pages/ClaimsDashboard.tsx` - UPDATED
- `/frontend/src/pages/ClaimsPage.tsx` - UPDATED (fixed patient list bug)
- `/frontend/src/api.ts` - UPDATED

## Manual Setup (if script fails)

```bash
cd backend

# Run migration
npm run db:migrate

# Seed claims (make sure regular seed is run first)
npx ts-node-dev --transpile-only src/db/seed-claims.ts

# Start server
npm run dev
```

## Troubleshooting

### "No patients found" error when seeding
```bash
# Run the main seed first
npm run db:seed
# Then run claims seed
npx ts-node-dev --transpile-only src/db/seed-claims.ts
```

### Migration already exists error
The migration is designed to be idempotent. It uses `CREATE TABLE IF NOT EXISTS` and `ON CONFLICT DO NOTHING`, so it's safe to run multiple times.

### No claims appearing
Check the console output from seed-claims.ts. It should show:
```
Creating 10 claims...
  ✓ Created claim 1/10: CLM-...
  ...
✅ Successfully seeded 10 claims
```

## API Endpoints Added

- `GET /api/claims/metrics` - Dashboard metrics
- `GET /api/claims/diagnosis-codes` - ICD-10 codes
- `GET /api/claims/:id` - Now includes diagnoses and charges

## What's Next?

1. View the dashboard at `/claims-dashboard`
2. Click on claims to see detailed diagnoses and procedures
3. Filter by status (draft, submitted, paid, denied)
4. Review aging buckets and collection metrics
5. Check denial reasons for denied claims

## Key Metrics Explained

- **Collection Rate**: % of billed charges actually collected
- **Denial Rate**: % of submitted claims denied
- **Days in A/R**: Average days from service to payment
- **First-Pass Rate**: % of claims accepted on first submission

## Production Readiness

This system includes:
- ✅ Medical necessity documentation (ICD-10)
- ✅ Proper CPT coding with modifiers
- ✅ Fee schedule integration
- ✅ Denial tracking and categorization
- ✅ Financial KPIs and reporting
- ✅ Aging analysis
- ✅ Payment reconciliation
- ✅ Status workflow management

Ready for real dermatology billing!
