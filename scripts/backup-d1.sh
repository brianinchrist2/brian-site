#!/bin/bash
set -e

DB_NAME="brianinchrist-db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

TABLES=$(npx wrangler d1 execute "${DB_NAME}" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' AND name NOT LIKE 'sqlite%'" --json 2>/dev/null | grep '"name"' | sed 's/.*"name": "\(.*\)".*/\1/')

for TABLE in ${TABLES}; do
  echo "Backing up ${TABLE}..."
  npx wrangler d1 execute "${DB_NAME}" --remote --command "SELECT * FROM ${TABLE}" --json > "${BACKUP_DIR}/${TABLE}.json" 2>/dev/null
done

echo "Backup complete: ${BACKUP_DIR}"
ls -la "${BACKUP_DIR}"
