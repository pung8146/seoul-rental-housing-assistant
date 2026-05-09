#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/pung8146/.openclaw/workspace/apps/rental-housing-assistant"
STATE_DIR="${OPENCLAW_STATE_DIR:-/home/pung8146/.openclaw}/rental-housing-assistant"
NODE_BIN="/home/pung8146/.nvm/versions/node/v24.15.0/bin"

mkdir -p "$STATE_DIR"
cd "$APP_DIR"

export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
export RENTAL_HOUSING_DB_PATH="${RENTAL_HOUSING_DB_PATH:-$STATE_DIR/rental-housing.db}"
export RENTAL_HOUSING_CONTEXT_PATH="${RENTAL_HOUSING_CONTEXT_PATH:-$STATE_DIR/telegram-context.json}"

npm run answer -- "$@"
