#!/bin/bash
set -e

# Database Migration Script
# Applies SQL migrations in order

echo "==================================="
echo "Database Migration Script"
echo "==================================="

# Check for required environment variable
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  echo "Example: DATABASE_URL=postgres://user:pass@host:port/dbname"
  exit 1
fi

# Set migration directory
MIGRATION_DIR="${MIGRATION_DIR:-./backend/migrations}"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "Error: Migration directory not found: $MIGRATION_DIR"
  exit 1
fi

echo "Migration directory: $MIGRATION_DIR"
echo "Database: $DATABASE_URL"
echo ""

# Create migrations table if it doesn't exist
echo "Creating migrations tracking table..."
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
" || { echo "Failed to create migrations table"; exit 1; }

# Function to apply a migration
apply_migration() {
  local migration_file=$1
  local filename=$(basename "$migration_file")

  # Check if migration already applied
  local applied=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM schema_migrations WHERE filename='$filename';" | xargs)

  if [ "$applied" -gt 0 ]; then
    echo "  ✓ Already applied: $filename"
    return 0
  fi

  echo "  → Applying: $filename"

  # Apply migration in a transaction
  psql "$DATABASE_URL" <<SQL
    BEGIN;
    \i $migration_file
    INSERT INTO schema_migrations (filename) VALUES ('$filename');
    COMMIT;
SQL

  if [ $? -eq 0 ]; then
    echo "  ✓ Successfully applied: $filename"
  else
    echo "  ✗ Failed to apply: $filename"
    exit 1
  fi
}

# Find and apply migrations in order
migration_count=0
for migration in $(find "$MIGRATION_DIR" -name "*.sql" | sort); do
  apply_migration "$migration"
  ((migration_count++))
done

echo ""
echo "==================================="
echo "Migration complete!"
echo "Total migrations processed: $migration_count"
echo "==================================="
