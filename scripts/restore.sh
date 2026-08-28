#!/bin/bash
set -euo pipefail

umask 077

# Database Restore Script
# Restores database from encrypted backup

echo "==================================="
echo "Database Restore Script"
echo "==================================="

# Check arguments
BACKUP_FILE="${1:-}"
FROM_S3="${2:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore.sh <backup_file> [--from-s3]"
  echo ""
  echo "Examples:"
  echo "  ./restore.sh ./backups/derm_db_backup_20250101_120000.sql.gz"
  echo "  ./restore.sh derm_db_backup_20250101_120000.sql.gz.enc --from-s3"
  echo ""
  exit 1
fi

if [ "$#" -gt 2 ] || { [ -n "$FROM_S3" ] && [ "$FROM_S3" != "--from-s3" ]; }; then
  echo "Error: unsupported restore option"
  exit 1
fi

REQUESTED_BACKUP_NAME="${BACKUP_FILE##*/}"

# Check required environment variables
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

if [ "$FROM_S3" != "--from-s3" ] && [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found"
  exit 1
fi

RESTORE_TEMP_PARENT="${TMPDIR:-/tmp}"
if [ ! -d "$RESTORE_TEMP_PARENT" ] || [ -L "$RESTORE_TEMP_PARENT" ]; then
  echo "Error: Unsafe temporary-directory parent"
  exit 1
fi
if ! RESTORE_TEMP_PARENT_RESOLVED="$(cd -- "$RESTORE_TEMP_PARENT" && pwd -P)"; then
  echo "Error: Unable to resolve temporary-directory parent"
  exit 1
fi

RESTORE_TEMP_DIR=""
cleanup() {
  local status=$?
  trap - EXIT HUP INT TERM

  if [ -n "${RESTORE_TEMP_DIR:-}" ]; then
    case "$RESTORE_TEMP_DIR" in
      "$RESTORE_TEMP_PARENT_RESOLVED"/derm-restore.*)
        if [ -d "$RESTORE_TEMP_DIR" ] && [ ! -L "$RESTORE_TEMP_DIR" ]; then
          if ! rm -rf -- "$RESTORE_TEMP_DIR"; then
            echo "Error: Failed to clean restore workspace" >&2
            status=1
          fi
        fi
        ;;
      *)
        echo "Error: Refusing to clean unexpected restore workspace" >&2
        status=1
        ;;
    esac
  fi

  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if ! RESTORE_TEMP_DIR="$(mktemp -d "$RESTORE_TEMP_PARENT_RESOLVED/derm-restore.XXXXXX")"; then
  echo "Error: Unable to create restore workspace"
  exit 1
fi
if [ -z "$RESTORE_TEMP_DIR" ] || [ ! -d "$RESTORE_TEMP_DIR" ] || [ -L "$RESTORE_TEMP_DIR" ]; then
  echo "Error: Invalid restore workspace"
  exit 1
fi
if ! chmod 700 "$RESTORE_TEMP_DIR"; then
  echo "Error: Unable to secure restore workspace"
  exit 1
fi

# Download from S3 if requested
if [ "$FROM_S3" = "--from-s3" ]; then
  if [ -z "${BACKUP_BUCKET:-}" ]; then
    echo "Error: BACKUP_BUCKET environment variable is not set"
    exit 1
  fi
  if ! command -v aws >/dev/null 2>&1; then
    echo "Error: AWS CLI is not available"
    exit 1
  fi
  if [ -z "$REQUESTED_BACKUP_NAME" ] || [ "$REQUESTED_BACKUP_NAME" = "." ] || [ "$REQUESTED_BACKUP_NAME" = ".." ]; then
    echo "Error: Invalid S3 backup name"
    exit 1
  fi

  echo "Downloading backup from S3..."

  # Find the backup in S3 without echoing the requested path or any AWS output.
  if ! S3_PATH="$(aws s3 ls "s3://${BACKUP_BUCKET}/backups/" --recursive 2>/dev/null | \
    awk -v needle="$REQUESTED_BACKUP_NAME" 'index($4, needle) { print $4; exit }')"; then
    echo "Error: Failed to list backups in S3"
    exit 1
  fi

  if [ -z "$S3_PATH" ]; then
    echo "Error: Backup file not found in S3"
    exit 1
  fi

  LOCAL_BACKUP="$RESTORE_TEMP_DIR/$REQUESTED_BACKUP_NAME"
  if ! aws s3 cp "s3://${BACKUP_BUCKET}/${S3_PATH}" "$LOCAL_BACKUP" >/dev/null 2>&1; then
    echo "Error: Failed to download backup from S3"
    exit 1
  fi

  echo "✓ Backup downloaded from S3"
  BACKUP_FILE="$LOCAL_BACKUP"
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found"
  exit 1
fi

# Determine the target database without printing the connection URL.
if ! DB_NAME="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select current_database()' 2>/dev/null)"; then
  echo "Error: Unable to determine target database"
  exit 1
fi
if [ -z "$DB_NAME" ] || [[ "$DB_NAME" == *$'\n'* || "$DB_NAME" == *$'\r'* ]]; then
  echo "Error: Target database name is invalid"
  exit 1
fi

# Build an admin connection URL without parsing or echoing credentials.
DATABASE_URL_BASE="${DATABASE_URL%%\?*}"
DATABASE_URL_QUERY=""
if [[ "$DATABASE_URL" == *\?* ]]; then
  DATABASE_URL_QUERY="?${DATABASE_URL#*\?}"
fi
case "$DATABASE_URL_BASE" in
  */*) ADMIN_URL="${DATABASE_URL_BASE%/*}/postgres${DATABASE_URL_QUERY}" ;;
  *)
    echo "Error: DATABASE_URL must include a database name"
    exit 1
    ;;
esac

echo "Backup source is ready"
echo "Target database connection validated"
echo ""

# Warning prompt
echo "⚠️  WARNING: This will REPLACE all data in the target database!"
echo "⚠️  Make sure you have a backup of the current database before proceeding."
echo ""
if ! IFS= read -r -p "Are you sure you want to continue? (yes/no): " CONFIRM; then
  echo "Restore cancelled"
  exit 0
fi

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

# Decrypt if needed
if [[ "$BACKUP_FILE" == *.enc ]]; then
  echo ""
  echo "Step 1: Decrypting backup..."

  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "Error: BACKUP_ENCRYPTION_KEY environment variable is not set"
    exit 1
  fi

  if [[ "$BACKUP_FILE" == *.gz.enc ]]; then
    DECRYPTED_FILE="$RESTORE_TEMP_DIR/backup.sql.gz"
  else
    DECRYPTED_FILE="$RESTORE_TEMP_DIR/backup.sql"
  fi

  if ! openssl enc -aes-256-cbc -d -pbkdf2 \
    -in "$BACKUP_FILE" \
    -out "$DECRYPTED_FILE" \
    -pass env:BACKUP_ENCRYPTION_KEY >/dev/null 2>&1; then
    echo "Error: Failed to decrypt backup"
    exit 1
  fi

  echo "✓ Backup decrypted successfully"
  BACKUP_FILE="$DECRYPTED_FILE"
fi

# Decompress if needed. All derived files stay in the private workspace.
SQL_PATH="$RESTORE_TEMP_DIR/backup.sql"
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo ""
  echo "Step 2: Decompressing backup..."

  if ! gzip -dc < "$BACKUP_FILE" > "$SQL_PATH"; then
    echo "Error: Failed to decompress backup"
    exit 1
  fi

  echo "✓ Backup decompressed successfully"
else
  if [ "$BACKUP_FILE" != "$SQL_PATH" ]; then
    if ! cat < "$BACKUP_FILE" > "$SQL_PATH"; then
      echo "Error: Failed to prepare backup SQL"
      exit 1
    fi
  fi
fi

if [ ! -s "$SQL_PATH" ]; then
  echo "Error: Backup SQL is empty"
  exit 1
fi

# Drop existing connections
echo ""
echo "Step 3: Terminating existing connections..."

if ! psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v "target_db=$DB_NAME" \
  -c "
    SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity
    WHERE pg_stat_activity.datname = :'target_db'
      AND pid <> pg_backend_pid();
  " >/dev/null 2>&1; then
  echo "Error: Failed to terminate existing connections"
  exit 1
fi

echo "✓ Connections terminated"

# Drop and recreate database
echo ""
echo "Step 4: Recreating database..."

if ! psql "$ADMIN_URL" \
  -v ON_ERROR_STOP=1 \
  -v "target_db=$DB_NAME" \
  >/dev/null 2>&1 <<'SQL'
  DROP DATABASE IF EXISTS :"target_db";
  CREATE DATABASE :"target_db";
SQL
then
  echo "Error: Failed to recreate database"
  exit 1
fi

echo "✓ Database recreated"

# Restore backup
echo ""
echo "Step 5: Restoring backup..."

if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_PATH" >/dev/null 2>&1; then
  echo "Error: Failed to restore backup"
  exit 1
fi

echo "✓ Backup restored successfully"

# Verify restore
echo ""
echo "Step 6: Verifying restore..."

if ! TABLE_COUNT="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc \
  'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';' \
  2>/dev/null)"; then
  echo "Error: Failed to verify restore"
  exit 1
fi
case "$TABLE_COUNT" in
  ''|*[!0-9]*)
    echo "Error: Restore verification returned an invalid table count"
    exit 1
    ;;
esac

echo "✓ Restore verified ($TABLE_COUNT tables found)"

echo ""
echo "==================================="
echo "Restore complete!"
echo "Tables: $TABLE_COUNT"
echo "==================================="

# Send notification (optional)
if [ -n "${BACKUP_NOTIFICATION_URL:-}" ]; then
  NOTIFICATION_FILE="$REQUESTED_BACKUP_NAME"
  case "$NOTIFICATION_FILE" in
    ""|*[!A-Za-z0-9._-]*) NOTIFICATION_FILE="backup" ;;
  esac
  curl -X POST "$BACKUP_NOTIFICATION_URL" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"restored\",\"timestamp\":\"$(date +%Y%m%d_%H%M%S)\",\"file\":\"$NOTIFICATION_FILE\"}" \
    >/dev/null 2>&1 || true
fi
