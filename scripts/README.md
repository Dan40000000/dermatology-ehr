# Migration Management Scripts

This directory contains scripts for analyzing and managing database migrations.

## Background

The migration system has evolved over time, resulting in:
- **65 SQL files** in `/backend/migrations/`
- **47 embedded migrations** in `/backend/src/db/migrate.ts`
- **9 duplicate migration numbers** (files with the same prefix number)
- **18 orphaned migrations** (SQL files that are never executed)

## Scripts

### 1. consolidate-migrations.ts

Analyzes the migration system and generates a detailed report with a consolidation plan.

**Usage:**
```bash
# From backend directory (where TypeScript is installed)
cd /Users/jamesbrady/Projects/dermatology-ehr-copy/backend
npx ts-node-dev --transpile-only ../scripts/consolidate-migrations.ts
```

**What it does:**
- Reads all SQL migration files from `/backend/migrations/`
- Parses embedded migrations from `/backend/src/db/migrate.ts`
- Identifies duplicate migration numbers
- Lists orphaned migrations that never run
- Finds gaps in migration numbering
- Generates a consolidation plan with recommended actions
- Outputs a suggested consolidated migration list

**Output includes:**
- Summary statistics
- List of duplicate migration numbers
- List of orphaned migrations
- Embedded migration list with line numbers
- Consolidation plan with rename operations
- Suggested final migration order

### 2. verify-migrations.ts

Verifies the health of the migration system and reports issues.

**Usage:**
```bash
# From backend directory (where TypeScript is installed)
cd /Users/jamesbrady/Projects/dermatology-ehr-copy/backend
npx ts-node-dev --transpile-only ../scripts/verify-migrations.ts
```

**Exit codes:**
- `0` - All checks passed
- `1` - Errors found (must be fixed)
- `2` - Warnings only (should be reviewed)

**Checks performed:**
1. File and directory existence
2. Duplicate migration numbers
3. Orphaned migration files
4. Basic SQL syntax validation
5. Embedded migration number ordering

## The Duplicate Number Problem

### SQL File Duplicates

The following migration numbers have multiple SQL files:

| Number | Files |
|--------|-------|
| 019 | `019_fhir_oauth_tokens.sql`, `019_hl7_messages.sql` |
| 030 | `030_eprescribing.sql`, `030_sms_templates_scheduling.sql` |
| 032 | `032_medications_ndc_codes.sql`, `032_portal_billing_payments.sql`, `032_telehealth_system.sql` |
| 046 | `046_rx_refill_change_requests.sql`, `046_task_templates.sql` |
| 047 | `047_reminder_enhancements.sql`, `047_telehealth_enhancements.sql` |
| 058 | `058_insurance_eligibility.sql`, `058_lesion_integration.sql` |
| 060 | `060_encounter_billing_chain.sql`, `060_patient_check_ins.sql`, `060_prescription_enhancements.sql` |
| 061 | `061_chronic_conditions.sql`, `061_cosmetic_treatments.sql`, `061_wound_tracking.sql` |
| 062 | `062_seed_chronic_conditions.sql`, `062_seed_cosmetic_treatments.sql` |

### Embedded Migration Duplicates

The following migration numbers are duplicated in `migrate.ts`:

| Number | Migrations |
|--------|------------|
| 041 | `041_procedure_sites`, `041_chronic_conditions` |

### How to Fix Duplicates

1. **Run the consolidation script** to see the recommended renumbering:
   ```bash
   npx ts-node scripts/consolidate-migrations.ts
   ```

2. **Rename duplicate files** with new unique numbers. The script suggests using numbers starting from the highest current number + 1.

3. **Update references** if any code references these migration files by name.

4. **Embed orphaned migrations** in `migrate.ts` if they should be run.

## The Orphaned Migration Problem

Many SQL files exist in `/backend/migrations/` but are not referenced in `migrate.ts`, meaning they never execute during database migrations.

**Options for each orphaned file:**
1. **Embed it** - Add the migration to `migrate.ts` if it should run
2. **Delete it** - Remove if it's obsolete or was replaced
3. **Archive it** - Move to an archive folder if keeping for reference

## Architecture Note

The current system uses **inline SQL in migrate.ts** rather than reading from `.sql` files. This means:
- SQL files in `/backend/migrations/` are only run if their content is copied into `migrate.ts`
- The migration name in `migrate.ts` must match the SQL filename (without `.sql`)
- Adding a new migration requires adding a new object to the `migrations` array in `migrate.ts`

### Example Migration Entry

```typescript
{
  name: "073_new_feature",
  sql: `
    CREATE TABLE new_feature (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `,
},
```

## Safety Notes

- **These scripts are read-only** - they do not modify any files
- Always backup the database before running new migrations
- Test migrations in a development environment first
- Review the consolidation plan carefully before implementing changes
