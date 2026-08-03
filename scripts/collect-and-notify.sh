#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${RENTAL_HOUSING_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_DIR="${RENTAL_HOUSING_STATE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/housing}"
ENV_FILE="${RENTAL_HOUSING_ENV_FILE:-$STATE_DIR/collector.env}"
LOG_DIR="$STATE_DIR/logs"
LOCK_DIR="$STATE_DIR/collect.lock"
LOG_FILE="$LOG_DIR/collect-notify.log"

mkdir -p "$LOG_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  printf '[%s] previous collect still running\n' "$(date -Is)" >> "$LOG_FILE"
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR"
}
trap cleanup EXIT

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
fi

export RENTAL_HOUSING_STATE_DIR="$STATE_DIR"
export RENTAL_HOUSING_DB_PATH="${RENTAL_HOUSING_DB_PATH:-$STATE_DIR/rental-housing.db}"
export RENTAL_HOUSING_CONTEXT_PATH="${RENTAL_HOUSING_CONTEXT_PATH:-$STATE_DIR/telegram-context.json}"

linux_node_and_npm_available() {
  local npm_path npm_real_path

  command -v node >/dev/null 2>&1 || return 1
  [ "$(node -p 'process.platform' 2>/dev/null)" = "linux" ] || return 1
  npm_path="$(type -P npm 2>/dev/null)" || return 1
  npm_real_path="$(readlink -f "$npm_path" 2>/dev/null)" || return 1

  case "$npm_path" in
    /mnt/* | *.bat | *.cmd | *.exe) return 1 ;;
  esac
  case "$npm_real_path" in
    /mnt/* | *.bat | *.cmd | *.exe) return 1 ;;
  esac

  return 0
}

select_linux_node() {
  if [ -n "${HOUSING_NODE_BIN_DIR:-}" ]; then
    export PATH="$HOUSING_NODE_BIN_DIR:/usr/local/bin:/usr/bin:/bin"
  fi

  if linux_node_and_npm_available; then
    return
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    printf 'Linux Node.js and Linux npm are required; install NVM or set HOUSING_NODE_BIN_DIR\n' >&2
    return 1
  fi

  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use --silent default >/dev/null

  if ! linux_node_and_npm_available; then
    printf 'Linux Node.js and Linux npm are required\n' >&2
    return 1
  fi
}

{
  printf '\n[%s] collect notify start\n' "$(date -Is)"
  select_linux_node
  cd "$APP_DIR"
  npm run collect:notify -- "$@"
  "$SCRIPT_DIR/publish-public-dashboard.sh"
  printf '[%s] collect notify done\n' "$(date -Is)"
} >> "$LOG_FILE" 2>&1
