#!/bin/bash
set -e

# Database Restore Script
# Restores database from encrypted backup

echo "==================================="
echo "Database Restore Script"
echo "==================================="

# Check arguments
if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <backup_file> [--from-s3]"
  echo ""
  echo "Examples:"
  echo "  ./restore.sh ./backups/derm_db_backup_20250101_120000.sql.gz"
  echo "  ./restore.sh derm_db_backup_20250101_120000.sql.gz.enc --from-s3"
  echo ""
  exit 1
fi

BACKUP_FILE="$1"
FROM_S3="$2"

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

# Download from S3 if requested
if [ "$FROM_S3" == "--from-s3" ]; then
  if [ -z "$BACKUP_BUCKET" ]; then
    echo "Error: BACKUP_BUCKET environment variable is not set"
    exit 1
  fi

  echo "Downloading backup from S3..."

  TEMP_DIR=$(mktemp -d)
  LOCAL_BACKUP="$TEMP_DIR/$(basename $BACKUP_FILE)"

  # Find the backup in S3
  S3_PATH=$(aws s3 ls "s3://${BACKUP_BUCKET}/backups/" --recursive | grep "$BACKUP_FILE" | head -1 | awk '{print $4}')

  if [ -z "$S3_PATH" ]; then
    echo "Error: Backup file not found in S3: $BACKUP_FILE"
    exit 1
  fi

  aws s3 cp "s3://${BACKUP_BUCKET}/${S3_PATH}" "$LOCAL_BACKUP"

  if [ $? -eq 0 ]; then
    echo "✓ Backup downloaded from S3"
    BACKUP_FILE="$LOCAL_BACKUP"
  else
    echo "✗ Failed to download backup from S3"
    exit 1
  fi
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Backup file: $BACKUP_FILE"
echo "Target database: $DATABASE_URL"
echo ""

# Warning prompt
echo "⚠️  WARNING: This will REPLACE all data in the target database!"
echo "⚠️  Make sure you have a backup of the current database before proceeding."
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

# Decrypt if needed
if [[ "$BACKUP_FILE" == *.enc ]]; then
  echo ""
  echo "Step 1: Decrypting backup..."

  if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
    echo "Error: BACKUP_ENCRYPTION_KEY environment variable is not set"
    exit 1
  fi

  DECRYPTED_FILE="${BACKUP_FILE%.enc}"

  openssl enc -aes-256-cbc -d \
    -in "$BACKUP_FILE" \
    -out "$DECRYPTED_FILE" \
    -k "$BACKUP_ENCRYPTION_KEY"

  if [ $? -eq 0 ]; then
    echo "✓ Backup decrypted successfully"
    BACKUP_FILE="$DECRYPTED_FILE"
  else
    echo "✗ Failed to decrypt backup"
    exit 1
  fi
fi

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo ""
  echo "Step 2: Decompressing backup..."

  gunzip -c "$BACKUP_FILE" > "${BACKUP_FILE%.gz}"

  if [ $? -eq 0 ]; then
    echo "✓ Backup decompressed successfully"
    BACKUP_FILE="${BACKUP_FILE%.gz}"
  else
    echo "✗ Failed to decompress backup"
    exit 1
  fi
fi

# Drop existing connections
echo ""
echo "Step 3: Terminating existing connections..."
DB_NAME=$(echo "$DATABASE_URL" | sed 's/.*\/\([^?]*\).*/\1/')

psql "$DATABASE_URL" -c "
  SELECT pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pg_stat_activity.datname = '$DB_NAME'
    AND pid <> pg_backend_pid();
" > /dev/null 2>&1 || true

echo "✓ Connections terminated"

# Drop and recreate database
echo ""
echo "Step 4: Recreating database..."

# Extract connection details
DB_USER=$(echo "$DATABASE_URL" | sed 's/.*:\/\/\([^:]*\):.*/\1/')
DB_PASS=$(echo "$DATABASE_URL" | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
DB_HOST=$(echo "$DATABASE_URL" | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(echo "$DATABASE_URL" | sed 's/.*:\([0-9]*\)\/.*/\1/')

ADMIN_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/postgres"

psql "$ADMIN_URL" <<SQL
  DROP DATABASE IF EXISTS $DB_NAME;
  CREATE DATABASE $DB_NAME;
SQL

if [ $? -eq 0 ]; then
  echo "✓ Database recreated"
else
  echo "✗ Failed to recreate database"
  exit 1
fi

# Restore backup
echo ""
echo "Step 5: Restoring backup..."

psql "$DATABASE_URL" < "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✓ Backup restored successfully"
else
  echo "✗ Failed to restore backup"
  exit 1
fi

# Verify restore
echo ""
echo "Step 6: Verifying restore..."

TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)

echo "✓ Restore verified ($TABLE_COUNT tables found)"

# Cleanup temporary files
if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
  rm -rf "$TEMP_DIR"
fi

echo ""
echo "==================================="
echo "Restore complete!"
echo "Database: $DB_NAME"
echo "Tables: $TABLE_COUNT"
echo "==================================="

# Send notification (optional)
if [ -n "$BACKUP_NOTIFICATION_URL" ]; then
  curl -X POST "$BACKUP_NOTIFICATION_URL" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"restored\",\"timestamp\":\"$(date +%Y%m%d_%H%M%S)\",\"file\":\"$(basename $1)\"}" \
    > /dev/null 2>&1 || true
fi
