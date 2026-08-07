#!/bin/bash
# Syncs POSTGRES_USER and app_user passwords from env vars to the running DB.
# Runs on every `docker-compose up` so password changes in .env take effect without
# dropping volumes. Connects via Unix socket (trust auth) — no old password needed.
set -e

echo "--------------------------------------------------------"
echo "Syncing database passwords..."
echo "--------------------------------------------------------"

# Escape single quotes for SQL string literals (SQL standard: ' → '')
PG_PASS_ESC="${POSTGRES_PASSWORD//\'/\'\'}"

# Only the superuser password is synced here.
# app_user is created and its password set by db-init (init.ts step 1).
# -d is required: psql defaults the database name to the connecting user, so omitting it only
# works when a database happens to share the superuser's name. Any other POSTGRES_USER fails
# with 'database "<user>" does not exist'.
psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "ALTER USER \"$POSTGRES_USER\" WITH PASSWORD '$PG_PASS_ESC';"

echo "Password sync completed."
