#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
TEST_TEMP_PARENT="${TMPDIR:-/tmp}"
if [ ! -d "$TEST_TEMP_PARENT" ] || [ -L "$TEST_TEMP_PARENT" ]; then
  echo "Unsafe test temporary-directory parent: $TEST_TEMP_PARENT" >&2
  exit 1
fi
TEST_TEMP_PARENT_RESOLVED="$(cd "$TEST_TEMP_PARENT" && pwd -P)"
TEST_ROOT="$(mktemp -d "$TEST_TEMP_PARENT_RESOLVED/derm-backup-test.XXXXXX")"
if [ -z "$TEST_ROOT" ] || [ ! -d "$TEST_ROOT" ]; then
  echo "Unable to create backup-script test workspace" >&2
  exit 1
fi

cleanup() {
  case "${TEST_ROOT:-}" in
    "$TEST_TEMP_PARENT_RESOLVED"/derm-backup-test.*) rm -rf -- "$TEST_ROOT" ;;
    *) echo "Refusing unexpected test cleanup target: ${TEST_ROOT:-unset}" >&2 ;;
  esac
}
trap cleanup EXIT

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN" "$TEST_ROOT/failure" "$TEST_ROOT/success" "$TEST_ROOT/success-encrypted" \
  "$TEST_ROOT/success-s3" "$TEST_ROOT/success-s3-kms"

printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'if [ "${PG_DUMP_MODE:-success}" = "fail" ]; then exit 42; fi' \
  'OUTPUT_PATH=""' \
  'while [ "$#" -gt 0 ]; do' \
  '  if [ "$1" = "--file" ]; then shift; OUTPUT_PATH="$1"; fi' \
  '  shift' \
  'done' \
  'if [ -z "$OUTPUT_PATH" ]; then exit 43; fi' \
  "printf '%s\\n' 'create table tenants (id text primary key);' 'create table patients (id text primary key);' > \"\$OUTPUT_PATH\"" \
  > "$FAKE_BIN/pg_dump"
chmod +x "$FAKE_BIN/pg_dump"

printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'if [ "${1:-}" != "s3" ] || [ "${2:-}" != "cp" ]; then exit 44; fi' \
  'printf "%s\\n" "$@" > "${AWS_ARGS_LOG:?}"' \
  > "$FAKE_BIN/aws"
chmod +x "$FAKE_BIN/aws"

if env \
  PATH="$FAKE_BIN:$PATH" \
  PG_DUMP_MODE=fail \
  DATABASE_URL=postgresql://backup-test.invalid/db \
  BACKUP_DIR="$TEST_ROOT/failure" \
  BACKUP_KEEP_LOCAL=true \
  bash "$REPO_ROOT/scripts/backup.sh" >"$TEST_ROOT/failure.log" 2>&1; then
  echo "backup.sh masked a pg_dump failure" >&2
  exit 1
fi
grep -q "Failed to create database dump" "$TEST_ROOT/failure.log"

env \
  PATH="$FAKE_BIN:$PATH" \
  PG_DUMP_MODE=success \
  DATABASE_URL=postgresql://backup-test.invalid/db \
  BACKUP_DIR="$TEST_ROOT/success" \
  BACKUP_KEEP_LOCAL=true \
  bash "$REPO_ROOT/scripts/backup.sh" >"$TEST_ROOT/success.log" 2>&1

SUCCESS_BACKUP="$(find "$TEST_ROOT/success" -type f -name 'derm_db_backup_*.sql.gz' -print | head -n 1)"
if [ -z "$SUCCESS_BACKUP" ] || [ ! -s "$SUCCESS_BACKUP" ]; then
  echo "backup.sh did not create a non-empty compressed dump" >&2
  exit 1
fi
gzip -t "$SUCCESS_BACKUP"

env \
  PATH="$FAKE_BIN:$PATH" \
  PG_DUMP_MODE=success \
  DATABASE_URL=postgresql://backup-test.invalid/db \
  BACKUP_DIR="$TEST_ROOT/success-encrypted" \
  BACKUP_ENCRYPTION_KEY=backup-test-key \
  BACKUP_KEEP_LOCAL=true \
  bash "$REPO_ROOT/scripts/backup.sh" >"$TEST_ROOT/success-encrypted.log" 2>&1

ENCRYPTED_BACKUP="$(find "$TEST_ROOT/success-encrypted" -type f -name 'derm_db_backup_*.sql.gz.enc' -print | head -n 1)"
if [ -z "$ENCRYPTED_BACKUP" ] || [ ! -s "$ENCRYPTED_BACKUP" ]; then
  echo "backup.sh did not create an encrypted dump" >&2
  exit 1
fi
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$ENCRYPTED_BACKUP" \
  -out "$TEST_ROOT/decrypted.sql.gz" \
  -k backup-test-key
gzip -t "$TEST_ROOT/decrypted.sql.gz"

env \
  PATH="$FAKE_BIN:$PATH" \
  PG_DUMP_MODE=success \
  DATABASE_URL=postgresql://backup-test.invalid/db \
  BACKUP_DIR="$TEST_ROOT/success-s3" \
  BACKUP_BUCKET=backup-test-bucket \
  BACKUP_KEEP_LOCAL=true \
  AWS_ARGS_LOG="$TEST_ROOT/non-kms-aws-args.log" \
  bash "$REPO_ROOT/scripts/backup.sh" >"$TEST_ROOT/success-s3.log" 2>&1
grep -Fxq -- "--sse" "$TEST_ROOT/non-kms-aws-args.log"
grep -Fxq -- "AES256" "$TEST_ROOT/non-kms-aws-args.log"
if grep -Fxq -- "aws:kms" "$TEST_ROOT/non-kms-aws-args.log" || \
  grep -Fxq -- "--sse-kms-key-id" "$TEST_ROOT/non-kms-aws-args.log"; then
  echo "backup.sh used KMS arguments without a KMS key ID" >&2
  exit 1
fi

env \
  PATH="$FAKE_BIN:$PATH" \
  PG_DUMP_MODE=success \
  DATABASE_URL=postgresql://backup-test.invalid/db \
  BACKUP_DIR="$TEST_ROOT/success-s3-kms" \
  BACKUP_BUCKET=backup-test-bucket \
  BACKUP_KMS_KEY_ID=backup-test-kms-key-id \
  BACKUP_KEEP_LOCAL=true \
  AWS_ARGS_LOG="$TEST_ROOT/kms-aws-args.log" \
  bash "$REPO_ROOT/scripts/backup.sh" >"$TEST_ROOT/success-s3-kms.log" 2>&1
grep -Fxq -- "--sse" "$TEST_ROOT/kms-aws-args.log"
grep -Fxq -- "aws:kms" "$TEST_ROOT/kms-aws-args.log"
grep -Fxq -- "--sse-kms-key-id" "$TEST_ROOT/kms-aws-args.log"
grep -Fxq -- "backup-test-kms-key-id" "$TEST_ROOT/kms-aws-args.log"
if grep -Fxq -- "AES256" "$TEST_ROOT/kms-aws-args.log"; then
  echo "backup.sh retained SSE-S3 arguments when a KMS key ID was configured" >&2
  exit 1
fi

printf '%s\n' \
  '#!/bin/bash' \
  'echo production_database' \
  > "$FAKE_BIN/psql"
chmod +x "$FAKE_BIN/psql"

if env \
  PATH="$FAKE_BIN:$PATH" \
  VERIFY_DATABASE_URL=postgresql://production.invalid/db \
  bash "$REPO_ROOT/scripts/verify-backup-restore.sh" "$SUCCESS_BACKUP" \
  >"$TEST_ROOT/restore-refusal.log" 2>&1; then
  echo "verify-backup-restore.sh accepted a non-verification database" >&2
  exit 1
fi
grep -q "Refusing to restore into non-verification database" "$TEST_ROOT/restore-refusal.log"

printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'if [[ "$*" == *"current_database()"* ]]; then echo restore_verify; exit 0; fi' \
  'if [[ "$*" == *"COUNT(*) FROM information_schema.tables"* ]]; then echo 4; exit 0; fi' \
  'cat >/dev/null' \
  > "$FAKE_BIN/psql"
chmod +x "$FAKE_BIN/psql"

printf '%s\n' yes | env \
  PATH="$FAKE_BIN:$PATH" \
  DATABASE_URL=postgresql://restore-test.invalid/derm_restore_verify \
  BACKUP_ENCRYPTION_KEY=backup-test-key \
  bash "$REPO_ROOT/scripts/restore.sh" "$ENCRYPTED_BACKUP" \
  >"$TEST_ROOT/restore-script.log" 2>&1
grep -q "Backup decrypted successfully" "$TEST_ROOT/restore-script.log"
grep -q "Restore complete!" "$TEST_ROOT/restore-script.log"

echo "Backup script regression checks passed"
