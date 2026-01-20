# Cosmetic Dermatology Fee Schedules

## Overview

Comprehensive cosmetic procedure fee schedules have been implemented for the dermatology application. This includes database migrations, seed data with detailed pricing for all major cosmetic procedures, backend API endpoints, and a user-friendly frontend interface.

## What Was Built

### 1. Database Schema (Migration 064)

**File**: `/backend/migrations/064_cosmetic_fee_schedules.sql`

**New Columns Added to `fee_schedule_items` Table:**
- `category` - Primary category grouping (e.g., 'neurotoxins', 'dermal_fillers')
- `subcategory` - Secondary category (e.g., 'upper_face', 'lips')
- `units` - Unit type (e.g., 'per unit', 'per syringe', 'per session')
- `min_price_cents` - Minimum price for price range display
- `max_price_cents` - Maximum price for price range display
- `typical_units` - Typical number of units/syringes used
- `is_cosmetic` - Boolean flag for cosmetic procedures
- `package_sessions` - Number of sessions for package deals
- `notes` - Additional notes about the procedure

**New Tables:**
- `cosmetic_procedure_categories` - Lookup table for procedure categories with display names and descriptions

**Database Views:**
- `v_cosmetic_pricing` - Consolidated view of all cosmetic procedures with pricing information

**Database Functions:**
- `get_cosmetic_fees_by_category()` - Retrieve cosmetic procedures by category with pricing

### 2. Seed Data (Migration 065)

**File**: `/backend/migrations/065_seed_cosmetic_fee_schedules.sql`

**Comprehensive Procedure Coverage:**

#### Neurotoxins (Botox/Dysport/Xeomin)
- Botox - Glabella (20 units, $240-$300)
- Botox - Forehead (10-20 units, $120-$240)
- Botox - Crow's Feet per side (12 units, $144-$180)
- Botox - Full Face package (44-64 units, $400-$500)
- Botox - Lip Flip (4-6 units, $50-$75)
- Botox - Masseter/jawline slimming (25 units per side, $300-$375)
- Botox - Hyperhidrosis/underarms (50 units each, $500-$700)
- Botox - Platysmal Bands/neck ($350-$450)
- Dysport - Per unit ($4-$5/unit)
- Xeomin - Per unit ($10-$12/unit)

#### Dermal Fillers
- Juvederm Ultra XC (lips) - $600-$800
- Juvederm Ultra Plus XC (nasolabial folds) - $650-$850
- Juvederm Voluma XC (cheeks) - $800-$1,000
- Juvederm Volbella XC (fine lines/lips) - $550-$700
- Restylane (lips/lines) - $550-$700
- Restylane Lyft (cheeks/hands) - $700-$900
- Restylane Contour (cheeks) - $650-$850
- Restylane Kysse (lips) - $600-$750
- Sculptra per vial (collagen stimulator) - $750-$900
- Radiesse per syringe - $700-$850
- RHA Collection per syringe - $650-$800
- Bellafill per syringe (long-lasting) - $900-$1,100

#### Body Contouring
- Kybella per vial (double chin) - $600-$800
- Kybella full treatment 2-4 vials - $1,200-$3,200

#### Laser Hair Removal
- Small Area (upper lip, chin, underarms) - $75-$150 per session
- Medium Area (bikini, neck, lower face) - $150-$250 per session
- Large Area (full legs, back, chest) - $300-$500 per session
- Full Face - $200-$300 per session
- Full Brazilian - $250-$400 per session
- 6-Session Packages with discounted pricing

#### Laser Skin Treatments
- IPL Photofacial (face) - $300-$500
- IPL Photofacial (face + neck) - $400-$600
- Fraxel fractional laser - $800-$1,500
- CO2 Laser Resurfacing (full face) - $2,500-$4,000
- Vascular Laser (spider veins) - $250-$400
- Pico Laser (pigmentation) - $400-$600
- Tattoo Removal (small/medium/large) - $150-$600

#### Chemical Peels
- Light Peel (glycolic/lactic 20-30%) - $100-$150
- Medium Peel (glycolic 50-70%, TCA 15-35%) - $200-$350
- Deep Peel (TCA 50%, phenol) - $500-$1,000
- VI Peel - $350-$450
- Perfect Derma Peel - $400-$500

#### Microneedling
- Microneedling (face) - $250-$400
- Microneedling with PRP (face) - $600-$900
- Microneedling (face + neck) - $350-$500
- RF Microneedling (Morpheus8, Vivace) - $800-$1,200

#### Other Cosmetic Services
- Hydrafacial - $175-$250
- Dermaplaning - $100-$150
- Microdermabrasion - $125-$200
- LED Light Therapy - $75-$125
- PRP for Hair per session - $700-$1,000
- Sclerotherapy (spider veins) - $350-$500

### 3. Backend API Routes

**File**: `/backend/src/routes/feeSchedules.ts` (Updated)

**New Endpoints:**

#### GET `/api/fee-schedules/cosmetic/procedures`
Retrieve all cosmetic procedures with pricing
- Query params: `category`, `feeScheduleId`
- Returns: Array of procedures with full details

#### GET `/api/fee-schedules/cosmetic/categories`
Get all cosmetic procedure categories
- Returns: Array of categories with display names and descriptions

#### GET `/api/fee-schedules/cosmetic/pricing`
Get cosmetic pricing with filtering
- Query params: `category`, `search`
- Returns: Filtered procedures from the pricing view

#### PUT `/api/fee-schedules/cosmetic/procedures/:cptCode`
Update or create a cosmetic procedure
- Requires: `admin` or `billing` role
- Body: Full procedure details including pricing ranges

### 4. Frontend Interface

**File**: `/frontend/src/pages/CosmeticPricingPage.tsx`

**Features:**
- Category-based filtering with icons
- Search functionality across procedure names and CPT codes
- Grid and table view modes
- Price range display
- Detailed procedure cards showing:
  - Procedure name and description
  - Category and subcategory
  - Typical units/amounts needed
  - Price ranges
  - Package session information
  - Clinical notes
  - CPT codes
- Responsive design
- Beautiful UI with hover effects

**Route**: `/admin/cosmetic-pricing`

## Database Schema Details

### Categories Available

1. **Neurotoxins (Botox/Dysport/Xeomin)**
   - Injectable neuromodulators for wrinkle reduction

2. **Dermal Fillers**
   - Hyaluronic acid and other injectable fillers

3. **Body Contouring**
   - Non-surgical fat reduction and body sculpting

4. **Laser Hair Removal**
   - Permanent hair reduction treatments

5. **Laser Skin Treatments**
   - Laser resurfacing, rejuvenation, and pigmentation

6. **Chemical Peels**
   - Chemical exfoliation for skin rejuvenation

7. **Microneedling & RF Treatments**
   - Collagen induction and RF skin tightening

8. **Other Cosmetic Services**
   - Additional aesthetic treatments

## Running the Migrations

To apply these changes to your database:

```bash
# Navigate to backend directory
cd backend

# Run the migrations in order
psql -d your_database_name -f migrations/064_cosmetic_fee_schedules.sql
psql -d your_database_name -f migrations/065_seed_cosmetic_fee_schedules.sql
```

Or if using a migration runner:
```bash
npm run migrate
```

## API Usage Examples

### Get All Cosmetic Procedures
```javascript
fetch('/api/fee-schedules/cosmetic/procedures', {
  headers: { Authorization: `Bearer ${token}` }
})
```

### Get Procedures by Category
```javascript
fetch('/api/fee-schedules/cosmetic/procedures?category=neurotoxins', {
  headers: { Authorization: `Bearer ${token}` }
})
```

### Get Categories
```javascript
fetch('/api/fee-schedules/cosmetic/categories', {
  headers: { Authorization: `Bearer ${token}` }
})
```

### Search Procedures
```javascript
fetch('/api/fee-schedules/cosmetic/pricing?search=botox', {
  headers: { Authorization: `Bearer ${token}` }
})
```

## Frontend Usage

Navigate to `/admin/cosmetic-pricing` in your application to:
- View all cosmetic procedures
- Filter by category
- Search procedures
- Switch between grid and table views
- See detailed pricing and procedure information

## Customization

### Adding New Procedures
1. Insert into `fee_schedule_items` table with `is_cosmetic = true`
2. Include category, pricing range, and typical units
3. Add detailed notes for providers

### Adding New Categories
1. Insert into `cosmetic_procedure_categories` table
2. Assign sort order and display name
3. Update frontend CATEGORY_ICONS if desired

### Modifying Pricing
- Update `min_price_cents` and `max_price_cents` for price ranges
- Update `fee_cents` for base pricing
- Modify `typical_units` for common usage patterns

## Data Integrity

- All prices stored in cents to avoid floating-point issues
- Foreign key constraints ensure data integrity
- Indexes on frequently queried columns for performance
- Soft deletes supported through the main fee_schedule_items table
- Tenant isolation through fee_schedules relationship

## Security

- All endpoints require authentication
- Admin or billing role required for updates
- Tenant-based data isolation
- Input validation on all endpoints

## Testing

Test the functionality by:
1. Running the migrations
2. Navigating to `/admin/cosmetic-pricing`
3. Testing category filters
4. Testing search functionality
5. Switching between grid/table views
6. Verifying price ranges display correctly

## Future Enhancements

Potential additions:
- Patient-facing pricing page
- Online booking for cosmetic consultations
- Treatment package builder
- Before/after photo galleries
- Consultation request forms
- Email pricing quotes
- Seasonal promotions/discounts
- Membership programs
- Referral rewards tracking

## Support

For questions or issues:
- Check migration files for SQL schema details
- Review API routes in `/backend/src/routes/feeSchedules.ts`
- Examine frontend component at `/frontend/src/pages/CosmeticPricingPage.tsx`
- Verify database functions are created correctly

## Files Created/Modified

### Backend
- `/backend/migrations/064_cosmetic_fee_schedules.sql` - New
- `/backend/migrations/065_seed_cosmetic_fee_schedules.sql` - New
- `/backend/src/routes/feeSchedules.ts` - Modified (added cosmetic endpoints)

### Frontend
- `/frontend/src/pages/CosmeticPricingPage.tsx` - New
- `/frontend/src/router/index.tsx` - Modified (added route)

## Summary

This comprehensive cosmetic dermatology fee schedule system provides:
- 60+ cosmetic procedures with detailed pricing
- 8 major procedure categories
- Flexible pricing ranges
- Package and session tracking
- User-friendly interface
- Robust API endpoints
- Full CRUD operations
- Category-based organization
- Search and filtering
- Professional presentation

The system is ready for production use and can be easily customized to match your practice's specific needs and pricing structure.
