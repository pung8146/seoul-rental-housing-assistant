#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${RENTAL_HOUSING_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_DIR="${RENTAL_HOUSING_STATE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/housing}"
DASHBOARD_INPUT="${HOUSING_DASHBOARD_DIR:-$HOME/projects/housing/web-dashboard}"
FEED_RELATIVE_PATH="public/public-feed.json"
AUTOMATION_COMMIT_SUBJECT="data: update public housing notices"
NPM_BIN=''

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

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

  NPM_BIN="$npm_path"
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
    fail 'Linux Node.js and Linux npm are required; install NVM or set HOUSING_NODE_BIN_DIR'
  fi

  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use --silent default >/dev/null

  if ! linux_node_and_npm_available; then
    fail 'Linux Node.js and Linux npm are required'
  fi
}

if ! git -C "$DASHBOARD_INPUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "dashboard Git repository not found: $DASHBOARD_INPUT"
fi

DASHBOARD_DIR="$(cd "$DASHBOARD_INPUT" && pwd -P)"
GIT_DIR="$(git -C "$DASHBOARD_DIR" rev-parse --absolute-git-dir)"
PUBLIC_INPUT="$DASHBOARD_DIR/public"
if [ -L "$PUBLIC_INPUT" ] || [ ! -d "$PUBLIC_INPUT" ]; then
  fail "dashboard public path must be a regular directory: $PUBLIC_INPUT"
fi
PUBLIC_DIR="$(cd "$PUBLIC_INPUT" && pwd -P)"
case "$PUBLIC_DIR/" in
  "$DASHBOARD_DIR"/*) ;;
  *) fail "dashboard public path escapes the repository: $PUBLIC_DIR" ;;
esac

FEED_PATH="$PUBLIC_DIR/public-feed.json"
if [ -L "$FEED_PATH" ] || [ ! -f "$FEED_PATH" ]; then
  fail "public housing feed must be a regular file: $FEED_PATH"
fi
if ! git -C "$DASHBOARD_DIR" ls-files --error-unmatch -- "$FEED_RELATIVE_PATH" >/dev/null 2>&1; then
  fail "public housing feed must be tracked: $FEED_RELATIVE_PATH"
fi

LOCK_DIR="$GIT_DIR/housing-publish.lock"
LOCK_ACQUIRED=0
TEMP_FEED=''
BACKUP_FEED=''
FEED_REPLACED=0
COMMIT_CREATED=0

cleanup() {
  local status=$?
  set +e

  if [ "$status" -ne 0 ] && [ "$FEED_REPLACED" -eq 1 ] && [ "$COMMIT_CREATED" -eq 0 ]; then
    git -C "$DASHBOARD_DIR" reset -q HEAD -- "$FEED_RELATIVE_PATH"
    rm -f -- "$FEED_PATH"
    cp -p -- "$BACKUP_FEED" "$FEED_PATH"
  fi

  if [ -n "$TEMP_FEED" ]; then
    rm -f -- "$TEMP_FEED"
  fi
  if [ -n "$BACKUP_FEED" ]; then
    rm -f -- "$BACKUP_FEED"
  fi
  if [ "$LOCK_ACQUIRED" -eq 1 ]; then
    rmdir "$LOCK_DIR"
  fi

  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "housing publisher already running for dashboard: $DASHBOARD_DIR"
fi
LOCK_ACQUIRED=1

if [ -n "$(git -C "$DASHBOARD_DIR" status --porcelain --untracked-files=all)" ]; then
  fail "dashboard must be clean before publishing: $DASHBOARD_DIR"
fi

CURRENT_BRANCH="$(git -C "$DASHBOARD_DIR" symbolic-ref --quiet --short HEAD || true)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  fail "dashboard publisher must run on main, not ${CURRENT_BRANCH:-detached HEAD}"
fi

GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" fetch --quiet origin \
  '+refs/heads/main:refs/remotes/origin/main'
LOCAL_HEAD="$(git -C "$DASHBOARD_DIR" rev-parse HEAD)"
REMOTE_HEAD="$(git -C "$DASHBOARD_DIR" rev-parse refs/remotes/origin/main)"

automation_commits_only() {
  local commit subject changed_paths

  while IFS= read -r commit; do
    [ -n "$commit" ] || continue
    subject="$(git -C "$DASHBOARD_DIR" show -s --format=%s "$commit")"
    changed_paths="$(git -C "$DASHBOARD_DIR" diff-tree --no-commit-id --name-only -r "$commit")"
    if [ "$subject" != "$AUTOMATION_COMMIT_SUBJECT" ] \
      || [ "$changed_paths" != "$FEED_RELATIVE_PATH" ]; then
      return 1
    fi
  done < <(git -C "$DASHBOARD_DIR" rev-list --reverse "$REMOTE_HEAD..$LOCAL_HEAD")

  return 0
}

if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  if git -C "$DASHBOARD_DIR" merge-base --is-ancestor "$REMOTE_HEAD" "$LOCAL_HEAD"; then
    if ! automation_commits_only; then
      fail 'dashboard has non-automation commits ahead of origin/main; push them explicitly'
    fi
    GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" push origin HEAD:main
  elif git -C "$DASHBOARD_DIR" merge-base --is-ancestor "$LOCAL_HEAD" "$REMOTE_HEAD"; then
    fail 'dashboard main is behind origin/main; update it explicitly before publishing'
  else
    fail 'dashboard main has diverged from origin/main; reconcile it explicitly before publishing'
  fi
fi

export RENTAL_HOUSING_DB_PATH="${RENTAL_HOUSING_DB_PATH:-$STATE_DIR/rental-housing.db}"
if [ ! -f "$RENTAL_HOUSING_DB_PATH" ]; then
  fail "housing database file not found: $RENTAL_HOUSING_DB_PATH"
fi

select_linux_node

BACKUP_FEED="$(mktemp "$GIT_DIR/housing-feed-backup.XXXXXX")"
cp -p -- "$FEED_PATH" "$BACKUP_FEED"
TEMP_FEED="$(mktemp "$PUBLIC_DIR/.public-feed.json.XXXXXX")"

cd "$APP_DIR"
PUBLIC_FEED_PATH="$TEMP_FEED" "$NPM_BIN" run export:public-feed
if [ -L "$TEMP_FEED" ] || [ ! -f "$TEMP_FEED" ]; then
  fail 'public feed exporter did not produce a regular file'
fi
chmod --reference="$FEED_PATH" "$TEMP_FEED"
FEED_REPLACED=1
mv -f -- "$TEMP_FEED" "$FEED_PATH"
TEMP_FEED=''

"$NPM_BIN" --prefix "$DASHBOARD_DIR" run build:public-dashboard

UNSTAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --name-only)"
STAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --cached --name-only)"
UNTRACKED_PATHS="$(git -C "$DASHBOARD_DIR" ls-files --others --exclude-standard)"
if { [ -n "$UNSTAGED_PATHS" ] && [ "$UNSTAGED_PATHS" != "$FEED_RELATIVE_PATH" ]; } \
  || [ -n "$STAGED_PATHS" ] \
  || [ -n "$UNTRACKED_PATHS" ]; then
  fail 'dashboard build changed or staged files other than the public housing feed'
fi

git -C "$DASHBOARD_DIR" add -- "$FEED_RELATIVE_PATH"
STAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --cached --name-only)"
UNSTAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --name-only)"
UNTRACKED_PATHS="$(git -C "$DASHBOARD_DIR" ls-files --others --exclude-standard)"
if [ -n "$UNSTAGED_PATHS" ] \
  || [ -n "$UNTRACKED_PATHS" ] \
  || { [ -n "$STAGED_PATHS" ] && [ "$STAGED_PATHS" != "$FEED_RELATIVE_PATH" ]; }; then
  fail 'public housing feed is not the sole dashboard change'
fi

if [ -z "$STAGED_PATHS" ]; then
  printf 'public housing feed unchanged\n'
  exit 0
fi

git -C "$DASHBOARD_DIR" commit --only -m "$AUTOMATION_COMMIT_SUBJECT" -- "$FEED_RELATIVE_PATH"
COMMIT_CREATED=1
GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" push origin HEAD:main
