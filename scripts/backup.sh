#!/bin/bash
set -euo pipefail

# Database Backup Script
# Creates encrypted backups and uploads to S3

echo "==================================="
echo "Database Backup Script"
echo "==================================="

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_FILE="derm_db_backup_${TIMESTAMP}.sql"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"
BACKUP_FILE_ENCRYPTED="${BACKUP_FILE_GZ}.enc"

# Check required environment variables
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Timestamp: $TIMESTAMP"
echo "Backup directory: $BACKUP_DIR"
echo "Backup file: $BACKUP_FILE"
echo ""

# Step 1: Create database dump
echo "Step 1: Creating database dump..."
if ! pg_dump "$DATABASE_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --file "$BACKUP_DIR/$BACKUP_FILE"; then
  echo "✗ Failed to create database dump"
  exit 1
fi

if [ ! -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
  echo "✗ Database dump is empty"
  exit 1
fi
echo "✓ Database dump created successfully"

# Step 2: Compress backup
echo ""
echo "Step 2: Compressing backup..."
gzip -9 "$BACKUP_DIR/$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE_GZ" | cut -f1)
echo "✓ Backup compressed successfully (Size: $BACKUP_SIZE)"

# Step 3: Encrypt backup (if encryption key is provided)
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo ""
  echo "Step 3: Encrypting backup..."
  openssl enc -aes-256-cbc \
    -salt \
    -pbkdf2 \
    -in "$BACKUP_DIR/$BACKUP_FILE_GZ" \
    -out "$BACKUP_DIR/$BACKUP_FILE_ENCRYPTED" \
    -pass env:BACKUP_ENCRYPTION_KEY

  echo "✓ Backup encrypted successfully"
  rm "$BACKUP_DIR/$BACKUP_FILE_GZ"
  FINAL_BACKUP="$BACKUP_FILE_ENCRYPTED"
else
  echo ""
  echo "Step 3: Skipping encryption (BACKUP_ENCRYPTION_KEY not set)"
  FINAL_BACKUP="$BACKUP_FILE_GZ"
fi

# Step 4: Upload to S3 (if configured)
if [ -n "${BACKUP_BUCKET:-}" ] && command -v aws &> /dev/null; then
  echo ""
  echo "Step 4: Uploading to S3..."

  S3_PATH="s3://${BACKUP_BUCKET}/backups/${DATE}/${FINAL_BACKUP}"

  if [ -n "${BACKUP_KMS_KEY_ID:-}" ]; then
    S3_ENCRYPTION_ARGS=(
      --sse aws:kms
      --sse-kms-key-id "$BACKUP_KMS_KEY_ID"
    )
  else
    S3_ENCRYPTION_ARGS=(
      --sse AES256
    )
  fi

  if aws s3 cp "$BACKUP_DIR/$FINAL_BACKUP" "$S3_PATH" \
    --storage-class STANDARD_IA \
    "${S3_ENCRYPTION_ARGS[@]}"; then
    echo "✓ Backup uploaded to S3: $S3_PATH"

    # Optionally remove local backup after successful upload
    if [ "${BACKUP_KEEP_LOCAL:-false}" != "true" ]; then
      rm "$BACKUP_DIR/$FINAL_BACKUP"
      echo "  Local backup removed"
    fi
  else
    echo "✗ Failed to upload backup to S3"
    exit 1
  fi
else
  echo ""
  echo "Step 4: Skipping S3 upload (BACKUP_BUCKET not set or AWS CLI not available)"
fi

# Step 5: Cleanup old backups
if [ -n "${BACKUP_RETENTION_DAYS:-}" ]; then
  echo ""
  echo "Step 5: Cleaning up old backups (older than ${BACKUP_RETENTION_DAYS} days)..."

  case "$BACKUP_RETENTION_DAYS" in
    *[!0-9]*)
      echo "✗ BACKUP_RETENTION_DAYS must be a non-negative integer"
      exit 1
      ;;
  esac
  if [ -L "$BACKUP_DIR" ]; then
    echo "✗ Refusing cleanup through a symbolic-link backup directory"
    exit 1
  fi
  BACKUP_DIR_RESOLVED="$(cd "$BACKUP_DIR" && pwd -P)"
  case "$BACKUP_DIR_RESOLVED" in
    /|"${HOME:-__no_home__}")
      echo "✗ Refusing cleanup of unsafe backup directory: $BACKUP_DIR_RESOLVED"
      exit 1
      ;;
  esac
  find "$BACKUP_DIR_RESOLVED" -type f -name "derm_db_backup_*.sql.gz*" \
    -mtime "+$BACKUP_RETENTION_DAYS" -print | while IFS= read -r EXPIRED_BACKUP; do
      case "$EXPIRED_BACKUP" in
        "$BACKUP_DIR_RESOLVED"/derm_db_backup_*.sql.gz*) rm -- "$EXPIRED_BACKUP" ;;
        *) echo "✗ Refusing unexpected cleanup target: $EXPIRED_BACKUP"; exit 1 ;;
      esac
    done

  echo "✓ Old backups cleaned up"

  # Cleanup old S3 backups if configured
  if [ -n "${BACKUP_BUCKET:-}" ] && command -v aws &> /dev/null; then
    CUTOFF_DATE=$(date -d "${BACKUP_RETENTION_DAYS} days ago" +%Y-%m-%d 2>/dev/null || date -v-${BACKUP_RETENTION_DAYS}d +%Y-%m-%d)

    aws s3 ls "s3://${BACKUP_BUCKET}/backups/" | while read -r line; do
      BACKUP_DATE=$(echo "$line" | awk '{print $2}' | tr -d '/')
      if [[ "$BACKUP_DATE" < "$CUTOFF_DATE" ]]; then
        aws s3 rm "s3://${BACKUP_BUCKET}/backups/${BACKUP_DATE}/" --recursive
        echo "  Removed old S3 backup: $BACKUP_DATE"
      fi
    done
  fi
else
  echo ""
  echo "Step 5: Skipping cleanup (BACKUP_RETENTION_DAYS not set)"
fi

echo ""
echo "==================================="
echo "Backup complete!"
echo "Backup file: $BACKUP_DIR/$FINAL_BACKUP"
if [ -n "${BACKUP_BUCKET:-}" ]; then
  echo "S3 location: s3://${BACKUP_BUCKET}/backups/${DATE}/${FINAL_BACKUP}"
fi
echo "==================================="

# Send notification (optional)
if [ -n "${BACKUP_NOTIFICATION_URL:-}" ]; then
  curl -X POST "$BACKUP_NOTIFICATION_URL" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"success\",\"timestamp\":\"$TIMESTAMP\",\"file\":\"$FINAL_BACKUP\"}" \
    > /dev/null 2>&1 || true
fi
