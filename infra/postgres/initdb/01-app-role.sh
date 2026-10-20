#!/bin/sh
# Rola, którą łączy się API. Nie jest właścicielem tabel, więc podlega Row-Level Security.
set -eu
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v pw="$PIXGYM_APP_DB_PASSWORD" <<'SQL'
CREATE ROLE pixgym_app LOGIN PASSWORD :'pw';
SQL
