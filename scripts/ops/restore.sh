#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# == 3 && "$2" == --into && "$3" =~ ^[a-z][a-z0-9_]{0,62}$ ]] || { echo 'Usage: bash scripts/ops/restore.sh <backup.dump> --into <new-database-name>' >&2; exit 1; }
file=$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")
destination=$3
source "$(dirname -- "$0")/common.sh"
[[ -f "$file" && -f "$file.sha256" && -f "$file.meta" ]] || { echo 'Backup, checksum and metadata are required.' >&2; exit 1; }
[[ "$(sha256sum "$file" | cut -d ' ' -f 1)" == "$(cut -d ' ' -f 1 "$file.sha256")" ]] || { echo 'Backup checksum mismatch.' >&2; exit 1; }
lock_operation
dc exec -T postgres pg_restore --list < "$file" >/dev/null
[[ "$(sql "SELECT count(*) FROM pg_database WHERE datname = '$destination';")" == 0 ]] || { echo 'Destination database already exists; nothing was changed.' >&2; exit 1; }
# An empty destination avoids retaining objects from later migrations.
dc exec -T postgres sh -c 'exec createdb -U "$POSTGRES_USER" --template=template0 "$1"' sh "$destination"
dc exec -T postgres sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --single-transaction --exit-on-error' sh "$destination" < "$file"
printf 'Restored into %s. The active database was preserved.\n' "$destination"
echo 'Follow the recovery guide to verify data, select the matching release and auth secret, and switch the site.'
