#!/usr/bin/env bash
# Run from examples/gyrotron. Only for Docker Compose PostgreSQL.
set -euo pipefail
umask 077
backup_dir="${1:-backups}"
mkdir -p "$backup_dir"
target="$backup_dir/gyrotron_$(date -u +%Y%m%dT%H%M%SZ).dump"
if ! docker compose exec -T db pg_dump -U gyrotron -d gyrotron --format=custom > "$target"; then
    rm -f "$target"
    echo "Backup failed" >&2
    exit 1
fi
echo "Backup saved to $target"
