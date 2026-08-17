#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${RENTAL_HOUSING_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_DIR="${RENTAL_HOUSING_STATE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/housing}"
ENV_FILE="${RENTAL_HOUSING_ENV_FILE:-$STATE_DIR/collector.env}"
LOG_DIR="$STATE_DIR/logs"
LOCK_FILE="$STATE_DIR/collect.flock"
LOG_FILE="$LOG_DIR/collect-notify.log"
NODE_BIN=''
NPM_BIN=''

mkdir -p "$LOG_DIR"
: >> "$LOG_FILE"
exec {LOCK_FD}>>"$LOCK_FILE"
chmod 600 "$LOG_FILE" "$LOCK_FILE"

if ! /usr/bin/flock -n "$LOCK_FD"; then
  printf '[%s] previous collect still running\n' "$(date -Is)" >> "$LOG_FILE"
  exit 0
fi

validate_env_file() {
  local env_mode env_owner

  if [ -L "$ENV_FILE" ]; then
    printf 'collector.env must be a regular non-symlink file: %s\n' "$ENV_FILE" >&2
    return 1
  fi
  if [ ! -e "$ENV_FILE" ]; then
    return 0
  fi
  if [ ! -f "$ENV_FILE" ]; then
    printf 'collector.env must be a regular file: %s\n' "$ENV_FILE" >&2
    return 1
  fi

  env_owner="$(/usr/bin/stat -c '%u' -- "$ENV_FILE")"
  if [ "$env_owner" != "$(/usr/bin/id -u)" ]; then
    printf 'collector.env must be owned by the current user: %s\n' "$ENV_FILE" >&2
    return 1
  fi

  env_mode="$(/usr/bin/stat -c '%a' -- "$ENV_FILE")"
  if (( (8#$env_mode & 077) != 0 )); then
    printf 'collector.env must not grant group or other permissions: %s\n' "$ENV_FILE" >&2
    return 1
  fi
}

validate_env_file
if [ -e "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
  set -euo pipefail
  umask 077
fi

export RENTAL_HOUSING_STATE_DIR="$STATE_DIR"
export RENTAL_HOUSING_DB_PATH="${RENTAL_HOUSING_DB_PATH:-$STATE_DIR/rental-housing.db}"
export RENTAL_HOUSING_CONTEXT_PATH="${RENTAL_HOUSING_CONTEXT_PATH:-$STATE_DIR/telegram-context.json}"

linux_node_and_npm_available() {
  local node_path npm_path

  node_path="$(type -P node 2>/dev/null)" || return 1
  npm_path="$(type -P npm 2>/dev/null)" || return 1
  NODE_BIN="$(readlink -f "$node_path" 2>/dev/null)" || return 1
  NPM_BIN="$(readlink -f "$npm_path" 2>/dev/null)" || return 1

  [ -x "$NODE_BIN" ] || return 1
  [ -x "$NPM_BIN" ] || return 1

  case "$NODE_BIN" in
    /mnt/* | *.bat | *.cmd | *.exe) return 1 ;;
  esac
  case "$NPM_BIN" in
    /mnt/* | *.bat | *.cmd | *.exe) return 1 ;;
  esac
  [ "$("$NODE_BIN" -p 'process.platform' 2>/dev/null)" = "linux" ] || return 1

  return 0
}

select_linux_node() {
  local requested_node_bin_dir

  if [ -n "${HOUSING_NODE_BIN_DIR:-}" ]; then
    requested_node_bin_dir="$HOUSING_NODE_BIN_DIR"
    case "$requested_node_bin_dir" in
      /*) ;;
      *) requested_node_bin_dir="$(pwd)/$requested_node_bin_dir" ;;
    esac
    requested_node_bin_dir="$(cd "$requested_node_bin_dir" 2>/dev/null && pwd -P)" || {
      printf 'HOUSING_NODE_BIN_DIR is not a readable directory\n' >&2
      return 1
    }
    export PATH="$requested_node_bin_dir:/usr/local/bin:/usr/bin:/bin"
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
  "$NPM_BIN" run collect:notify -- "$@"
  "$SCRIPT_DIR/publish-public-dashboard.sh"
  printf '[%s] collect notify done\n' "$(date -Is)"
} >> "$LOG_FILE" 2>&1
