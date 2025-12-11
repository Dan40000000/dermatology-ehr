# Fee Schedule Management

## Overview

The Fee Schedule Management system allows administrators and billing staff to create and manage multiple fee schedules for different payer types (e.g., Commercial Insurance, Medicare, Cash Pay).

## Features

### 1. Multiple Fee Schedules
- Create unlimited fee schedules
- Set one as default for automatic application
- Clone existing schedules to save time

### 2. Fee Management
- Add individual CPT codes with fees
- Edit fees inline or via modal
- Delete individual fee entries
- Search and filter CPT codes

### 3. Import/Export
- **Import from CSV**: Bulk upload fees from a CSV file
- **Export to CSV**: Download fee schedule for backup or external use
- CSV Format: `CPT Code, Description, Fee`

### 4. Security & Permissions
- **Role-Based Access Control (RBAC)**
  - Only `admin` and `billing` roles can access fee schedules
  - Regular users see permission denied message

### 5. Integration
- When creating charges in encounters, the default fee schedule is used
- Fees can be overridden on a per-charge basis
- Fees are stored in cents to avoid floating-point issues

## User Guide

### Creating a Fee Schedule

1. Navigate to **Fee Schedules** from the main menu
2. Click **+ Create Fee Schedule**
3. Enter:
   - **Name**: e.g., "Commercial Insurance", "Medicare 2025"
   - **Description**: Optional notes
   - **Clone from**: Optionally copy from existing schedule
   - **Set as Default**: Check to make this the default
4. Click **Create Schedule**

### Adding Fees

**Method 1: Manual Entry**
1. Select a fee schedule from the sidebar
2. Click **+ Add Fee**
3. Enter:
   - **CPT Code**: e.g., "99213"
   - **Description**: e.g., "Office visit, established patient"
   - **Fee**: e.g., "110.00"
4. Click **Save Fee**

**Method 2: Bulk Import**
1. Prepare a CSV file with format:
   ```
   CPT Code,Description,Fee
   99213,Office visit - established patient,110.00
   11100,Biopsy of skin - single lesion,125.00
   ```
2. Click **Import CSV**
3. Select your file
4. Review preview
5. Click **Import**

### Managing Fees

- **Edit**: Click **Edit** next to any fee to modify
- **Delete**: Click **Delete** to remove a fee
- **Search**: Use the search box to filter CPT codes
- **Export**: Click **Export CSV** to download all fees

### Setting Default Schedule

- Click the **☆** (star) icon next to a schedule to set as default
- Only one schedule can be default at a time
- The default schedule is used when creating new charges

### Deleting a Schedule

- Click **×** next to a schedule to delete
- Cannot delete the default schedule (unset default first)
- All fees in the schedule will be deleted (irreversible)

## Technical Details

### Database Schema

**fee_schedules table**
```sql
id UUID PRIMARY KEY
tenant_id VARCHAR(255) NOT NULL
name VARCHAR(255) NOT NULL
is_default BOOLEAN DEFAULT false
description TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

**fee_schedule_items table**
```sql
id UUID PRIMARY KEY
fee_schedule_id UUID NOT NULL
cpt_code VARCHAR(10) NOT NULL
cpt_description TEXT
fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0)
created_at TIMESTAMP
updated_at TIMESTAMP
UNIQUE (fee_schedule_id, cpt_code)
```

### API Endpoints

- `GET /api/fee-schedules` - List all schedules
- `POST /api/fee-schedules` - Create new schedule
- `GET /api/fee-schedules/:id` - Get schedule with items
- `PUT /api/fee-schedules/:id` - Update schedule
- `DELETE /api/fee-schedules/:id` - Delete schedule
- `GET /api/fee-schedules/:id/items` - Get items
- `PUT /api/fee-schedules/:id/items/:cptCode` - Upsert item
- `DELETE /api/fee-schedules/:id/items/:cptCode` - Delete item
- `POST /api/fee-schedules/:id/items/import` - Bulk import
- `GET /api/fee-schedules/:id/export` - Export to CSV
- `GET /api/fee-schedules/default/schedule` - Get default schedule
- `GET /api/fee-schedules/default/fee/:cptCode` - Get fee for CPT code

### Tenant Isolation

All fee schedules are isolated by `tenant_id`. Each tenant can only access their own fee schedules.

### Audit Trail

All changes to fee schedules are tracked via:
- `created_at` timestamp
- `updated_at` timestamp
- Backend audit logs (if enabled)

## Best Practices

1. **Naming Convention**
   - Use clear, descriptive names
   - Include year for time-based schedules (e.g., "Medicare 2025")
   - Specify payer type (e.g., "Blue Cross PPO", "Cash Pay")

2. **Default Schedule**
   - Set your most commonly used schedule as default
   - Update default when payer contracts change

3. **Regular Updates**
   - Review fees quarterly
   - Update when CPT codes change annually
   - Archive old schedules rather than deleting

4. **Backup**
   - Export schedules regularly
   - Store CSV backups in secure location

5. **Validation**
   - Always preview imports before confirming
   - Check for formatting errors in CSV files
   - Verify fees are in correct format (dollars, not cents)

## Sample Fee Schedule

A sample fee schedule CSV is available at:
`/backend/data/sample_fee_schedule.csv`

This includes common dermatology CPT codes with typical fees.

## Troubleshooting

### Import Issues

**Problem**: Import fails or skips rows
- **Solution**: Ensure CSV has header row: `CPT Code,Description,Fee`
- Check for proper comma separation
- Ensure fees are numeric (no $ symbols)

**Problem**: Duplicate CPT codes
- **Solution**: System will update existing fees with new values

### Permission Denied

**Problem**: Cannot access fee schedules
- **Solution**: Contact admin to change role to `admin` or `billing`

### Default Schedule Issues

**Problem**: Cannot delete schedule
- **Solution**: Unset as default first, then delete

## Future Enhancements

Potential improvements for future versions:
- Fee schedule versioning
- Effective date ranges
- Multiple units/modifiers
- Insurance contract management
- Fee schedule comparison tool
- Historical fee tracking
- Automatic fee increases based on percentage
