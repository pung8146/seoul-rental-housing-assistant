#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${RENTAL_HOUSING_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_DIR="${RENTAL_HOUSING_STATE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/housing}"
DASHBOARD_DIR="${HOUSING_DASHBOARD_DIR:-$HOME/projects/housing/web-dashboard}"
FEED_PATH="$DASHBOARD_DIR/public/public-feed.json"

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

if ! git -C "$DASHBOARD_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'dashboard Git repository not found: %s\n' "$DASHBOARD_DIR" >&2
  exit 1
fi

if [ -n "$(git -C "$DASHBOARD_DIR" status --porcelain)" ]; then
  printf 'dashboard must be clean before publishing: %s\n' "$DASHBOARD_DIR" >&2
  exit 1
fi

export RENTAL_HOUSING_DB_PATH="${RENTAL_HOUSING_DB_PATH:-$STATE_DIR/rental-housing.db}"
if [ ! -f "$RENTAL_HOUSING_DB_PATH" ]; then
  printf 'housing database file not found: %s\n' "$RENTAL_HOUSING_DB_PATH" >&2
  exit 1
fi

select_linux_node
cd "$APP_DIR"
PUBLIC_FEED_PATH="$FEED_PATH" npm run export:public-feed
npm --prefix "$DASHBOARD_DIR" run build:public-dashboard

git -C "$DASHBOARD_DIR" add -- public/public-feed.json
if git -C "$DASHBOARD_DIR" diff --cached --quiet -- public/public-feed.json; then
  printf 'public housing feed unchanged\n'
  exit 0
fi

git -C "$DASHBOARD_DIR" commit -m 'data: update public housing notices'
GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" push origin main
