#!/usr/bin/env bash
# Promotes the most recent Sunday daily backup into a weekly/ folder, then
# prunes daily/ and weekly/ to bounded retention. Called by backup.sh, but
# safe to run standalone/idempotently.
set -euo pipefail

GDRIVE_REMOTE="${GDRIVE_REMOTE:-gdrive}"
DAILY_KEEP="${DAILY_KEEP:-14}"
WEEKLY_KEEP="${WEEKLY_KEEP:-8}"

DAILY_DIR="$GDRIVE_REMOTE:autograder-backups/daily"
WEEKLY_DIR="$GDRIVE_REMOTE:autograder-backups/weekly"

# Promote today's backup to weekly/ if today is Sunday.
if [ "$(date +%u)" = "7" ]; then
    latest=$(rclone lsf "$DAILY_DIR" | sort | tail -1)
    if [ -n "$latest" ]; then
        echo "[retention] promoting $latest to weekly/"
        rclone copyto "$DAILY_DIR/$latest" "$WEEKLY_DIR/$latest"
    fi
fi

prune() {
    local dir="$1" keep="$2"
    local files
    files=$(rclone lsf "$dir" | sort)
    local total
    total=$(echo "$files" | grep -c . || true)
    if [ "$total" -gt "$keep" ]; then
        echo "$files" | head -n "$((total - keep))" | while read -r f; do
            [ -n "$f" ] && echo "[retention] deleting $dir/$f" && rclone deletefile "$dir/$f"
        done
    fi
}

prune "$DAILY_DIR" "$DAILY_KEEP"
prune "$WEEKLY_DIR" "$WEEKLY_KEEP"
