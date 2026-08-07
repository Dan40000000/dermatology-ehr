#!/bin/bash
set -euo pipefail

BACKUP_PATH="${1:-}"
VERIFY_DATABASE_URL="${VERIFY_DATABASE_URL:-}"

if [ -z "$BACKUP_PATH" ] || [ ! -f "$BACKUP_PATH" ]; then
  echo "Usage: VERIFY_DATABASE_URL=... $0 <backup.sql.gz[.enc]>" >&2
  exit 1
fi

if [ -z "$VERIFY_DATABASE_URL" ]; then
  echo "VERIFY_DATABASE_URL is required" >&2
  exit 1
fi

VERIFY_DATABASE_NAME="$(psql "$VERIFY_DATABASE_URL" -Atqc 'select current_database()')"
case "$VERIFY_DATABASE_NAME" in
  *restore*verify*|*verify*restore*) ;;
  *)
    echo "Refusing to restore into non-verification database: $VERIFY_DATABASE_NAME" >&2
    exit 1
    ;;
esac

RESTORE_TEMP_PARENT="${TMPDIR:-/tmp}"
if [ ! -d "$RESTORE_TEMP_PARENT" ] || [ -L "$RESTORE_TEMP_PARENT" ]; then
  echo "Unsafe temporary-directory parent: $RESTORE_TEMP_PARENT" >&2
  exit 1
fi
RESTORE_TEMP_PARENT_RESOLVED="$(cd "$RESTORE_TEMP_PARENT" && pwd -P)"
RESTORE_TEMP_DIR="$(mktemp -d "$RESTORE_TEMP_PARENT_RESOLVED/derm-restore-verify.XXXXXX")"
if [ -z "$RESTORE_TEMP_DIR" ] || [ ! -d "$RESTORE_TEMP_DIR" ]; then
  echo "Unable to create restore workspace" >&2
  exit 1
fi

cleanup() {
  if [ -n "${RESTORE_TEMP_DIR:-}" ] && [ -d "$RESTORE_TEMP_DIR" ]; then
    case "$RESTORE_TEMP_DIR" in
      "$RESTORE_TEMP_PARENT_RESOLVED"/derm-restore-verify.*) rm -rf -- "$RESTORE_TEMP_DIR" ;;
      *) echo "Refusing to clean unexpected restore workspace: $RESTORE_TEMP_DIR" >&2 ;;
    esac
  fi
}
trap cleanup EXIT

COMPRESSED_PATH="$RESTORE_TEMP_DIR/backup.sql.gz"
SQL_PATH="$RESTORE_TEMP_DIR/backup.sql"

case "$BACKUP_PATH" in
  *.enc)
    if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
      echo "BACKUP_ENCRYPTION_KEY is required for an encrypted backup" >&2
      exit 1
    fi
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "$BACKUP_PATH" \
      -out "$COMPRESSED_PATH" \
      -k "$BACKUP_ENCRYPTION_KEY"
    ;;
  *.sql.gz)
    cp "$BACKUP_PATH" "$COMPRESSED_PATH"
    ;;
  *)
    echo "Unsupported backup file: $BACKUP_PATH" >&2
    exit 1
    ;;
esac

gzip -t "$COMPRESSED_PATH"
gzip -dc "$COMPRESSED_PATH" > "$SQL_PATH"
if [ ! -s "$SQL_PATH" ]; then
  echo "Decompressed SQL dump is empty" >&2
  exit 1
fi

psql "$VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_PATH" >/dev/null

CORE_TABLE_COUNT="$(psql "$VERIFY_DATABASE_URL" -Atqc "
  select count(*)
  from (values
    (to_regclass('public.tenants')),
    (to_regclass('public.patients')),
    (to_regclass('public.cost_estimates')),
    (to_regclass('public.payer_contract_rates'))
  ) as required_tables(table_name)
  where table_name is not null
")"

if [ "$CORE_TABLE_COUNT" -ne 4 ]; then
  echo "Restore completed but required core tables are missing ($CORE_TABLE_COUNT/4 present)" >&2
  exit 1
fi

psql "$VERIFY_DATABASE_URL" -Atqc 'select count(*) from schema_migrations' >/dev/null
echo "Backup restore verified in disposable database $VERIFY_DATABASE_NAME"
