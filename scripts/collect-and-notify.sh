#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/pung8146/.openclaw/workspace/apps/rental-housing-assistant"
STATE_DIR="${OPENCLAW_STATE_DIR:-/home/pung8146/.openclaw}/rental-housing-assistant"
NODE_BIN="/home/pung8146/.nvm/versions/node/v24.15.0/bin"
LOCK_DIR="$STATE_DIR/collect.lock"
LOG_FILE="$STATE_DIR/collect-notify.log"

mkdir -p "$STATE_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  printf '[%s] previous collect still running\n' "$(date -Is)" >> "$LOG_FILE"
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR"
}
trap cleanup EXIT

cd "$APP_DIR"

export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
export RENTAL_HOUSING_DB_PATH="${RENTAL_HOUSING_DB_PATH:-$STATE_DIR/rental-housing.db}"
export RENTAL_HOUSING_CONTEXT_PATH="${RENTAL_HOUSING_CONTEXT_PATH:-$STATE_DIR/telegram-context.json}"

if [ -f "$STATE_DIR/collect-notify.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$STATE_DIR/collect-notify.env"
  set +a
fi

{
  printf '\n[%s] collect notify start\n' "$(date -Is)"
  npm run collect:notify -- "$@"
  printf '[%s] collect notify done\n' "$(date -Is)"
} >> "$LOG_FILE" 2>&1
