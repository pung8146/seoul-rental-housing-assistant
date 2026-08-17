#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${RENTAL_HOUSING_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_DIR="${RENTAL_HOUSING_STATE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/housing}"
DASHBOARD_INPUT="${HOUSING_DASHBOARD_DIR:-$HOME/projects/housing/web-dashboard}"
FEED_RELATIVE_PATH="public/public-feed.json"
AUTOMATION_COMMIT_SUBJECT="data: update public housing notices"
NODE_BIN=''
NPM_BIN=''
TEMP_FEED=''
BACKUP_FEED=''
PENDING_TEMP=''
RESTORE_TEMP=''
FEED_REPLACED=0
COMMIT_CREATED=0
BASELINE_HEAD=''
ORIGIN_FETCH_URL=''
ORIGIN_PUSH_URL=''

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

linux_node_and_npm_available() {
  local candidate node_path node_real_path npm_path npm_real_path

  node_path="$(type -P node 2>/dev/null)" || return 1
  npm_path="$(type -P npm 2>/dev/null)" || return 1
  node_real_path="$(readlink -f "$node_path" 2>/dev/null)" || return 1
  npm_real_path="$(readlink -f "$npm_path" 2>/dev/null)" || return 1

  for candidate in "$node_path" "$node_real_path" "$npm_path" "$npm_real_path"; do
    case "$candidate" in
      /mnt/* | *.bat | *.cmd | *.exe) return 1 ;;
    esac
  done
  [ "$("$node_real_path" -p 'process.platform' 2>/dev/null)" = "linux" ] || return 1

  NODE_BIN="$node_real_path"
  NPM_BIN="$npm_real_path"
}

select_linux_node() {
  local node_bin_dir

  if [ -n "${HOUSING_NODE_BIN_DIR:-}" ]; then
    case "$HOUSING_NODE_BIN_DIR" in
      /*) node_bin_dir="$HOUSING_NODE_BIN_DIR" ;;
      *)
        node_bin_dir="$(cd "$HOUSING_NODE_BIN_DIR" 2>/dev/null && pwd -P)" || fail "Linux Node.js bin directory not found: $HOUSING_NODE_BIN_DIR"
        ;;
    esac
    export PATH="$node_bin_dir:/usr/local/bin:/usr/bin:/bin"
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
  linux_node_and_npm_available || fail 'Linux Node.js and Linux npm are required'
}

tracked_feed_mode() {
  git -C "$DASHBOARD_DIR" ls-files -s -- "$FEED_RELATIVE_PATH" | awk 'NR == 1 { print $1 }'
}

worktree_feed_mode() {
  if [ -x "$FEED_PATH" ]; then
    printf '100755\n'
  else
    printf '100644\n'
  fi
}

feed_hash() {
  sha256sum "$1" | awk '{ print $1 }'
}

validate_public_directory() {
  local current_public_dir

  if [ -L "$PUBLIC_INPUT" ] || [ ! -d "$PUBLIC_INPUT" ]; then
    fail "dashboard public path must be a regular directory: $PUBLIC_INPUT"
  fi
  current_public_dir="$(cd "$PUBLIC_INPUT" && pwd -P)"
  [ "$current_public_dir" = "$PUBLIC_DIR" ] || fail 'dashboard public path changed during publishing'
}

validate_regular_feed() {
  if [ -L "$FEED_PATH" ] || [ ! -f "$FEED_PATH" ]; then
    fail "public housing feed must be a regular file: $FEED_PATH"
  fi
  git -C "$DASHBOARD_DIR" ls-files --error-unmatch -- "$FEED_RELATIVE_PATH" >/dev/null 2>&1 || fail "public housing feed must be tracked: $FEED_RELATIVE_PATH"
}

capture_origin_urls() {
  local -a fetch_urls push_urls

  mapfile -t fetch_urls < <(git -C "$DASHBOARD_DIR" remote get-url --all origin)
  [ "${#fetch_urls[@]}" -eq 1 ] || fail 'dashboard origin must have exactly one fetch URL'
  mapfile -t push_urls < <(git -C "$DASHBOARD_DIR" remote get-url --push --all origin)
  [ "${#push_urls[@]}" -eq 1 ] || fail 'dashboard origin must have exactly one push URL'

  if [ -z "$ORIGIN_FETCH_URL" ]; then
    ORIGIN_FETCH_URL="${fetch_urls[0]}"
    ORIGIN_PUSH_URL="${push_urls[0]}"
  elif [ "${fetch_urls[0]}" != "$ORIGIN_FETCH_URL" ] || [ "${push_urls[0]}" != "$ORIGIN_PUSH_URL" ]; then
    fail 'dashboard origin URL changed during publishing'
  fi
}

remote_main_oid() {
  local output oid ref extra

  output="$(GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" ls-remote --exit-code "$1" refs/heads/main)" \
    || fail 'dashboard push URL main branch cannot be queried'
  read -r oid ref extra <<< "$output"
  [ -n "$oid" ] && [ "$ref" = 'refs/heads/main' ] && [ -z "${extra:-}" ] \
    || fail 'dashboard push URL returned an invalid main branch'
  printf '%s\n' "$oid"
}

validate_push_context() {
  local expected_head=$1 expected_remote_oid=$2 current_remote_oid current_branch current_head

  capture_origin_urls
  current_remote_oid="$(remote_main_oid "$ORIGIN_PUSH_URL")"
  [ "$current_remote_oid" = "$expected_remote_oid" ] || fail 'dashboard remote main changed before push'
  capture_origin_urls
  current_branch="$(git -C "$DASHBOARD_DIR" symbolic-ref --quiet --short HEAD || true)"
  [ "$current_branch" = 'main' ] || fail 'dashboard branch changed before push'
  current_head="$(git -C "$DASHBOARD_DIR" rev-parse HEAD)"
  [ "$current_head" = "$expected_head" ] || fail 'dashboard HEAD changed before push'
}

validate_repository_identity() {
  local current_branch current_head

  current_branch="$(git -C "$DASHBOARD_DIR" symbolic-ref --quiet --short HEAD || true)"
  [ "$current_branch" = "main" ] || fail "dashboard branch changed during publishing: ${current_branch:-detached HEAD}"
  current_head="$(git -C "$DASHBOARD_DIR" rev-parse HEAD)"
  [ "$current_head" = "$BASELINE_HEAD" ] || fail 'dashboard HEAD changed during publishing'
  capture_origin_urls
}

validate_exported_feed() {
  validate_public_directory
  validate_regular_feed
  [ "$(tracked_feed_mode)" = "$BASELINE_TRACKED_MODE" ] || fail 'public housing feed tracked mode changed during publishing'
  [ "$(worktree_feed_mode)" = "$BASELINE_TRACKED_MODE" ] || fail 'public housing feed executable mode changed during publishing'
  [ "$(stat -c %a "$FEED_PATH")" = "$EXPORTED_FILE_MODE" ] || fail 'public housing feed file mode changed during publishing'
  [ "$(feed_hash "$FEED_PATH")" = "$EXPORTED_HASH" ] || fail 'public housing feed content changed during dashboard build'
}

read_pending_marker() {
  if [ -L "$PENDING_MARKER" ] || [ ! -f "$PENDING_MARKER" ]; then
    fail 'dashboard pending publish marker is missing or unsafe'
  fi
  PENDING_OID="$(sed -n '1p' "$PENDING_MARKER")"
  [ "$(wc -l < "$PENDING_MARKER")" -eq 1 ] || fail 'dashboard pending publish marker is invalid'
}

clear_pending_marker() {
  if [ -L "$PENDING_MARKER" ]; then
    fail 'dashboard pending publish marker is unsafe'
  fi
  rm -f -- "$PENDING_MARKER"
}

write_pending_marker() {
  local oid=$1

  PENDING_TEMP="$(mktemp "$GIT_DIR/housing-publish.pending.XXXXXX")"
  printf '%s\n' "$oid" > "$PENDING_TEMP"
  chmod 0600 "$PENDING_TEMP"
  mv -f -- "$PENDING_TEMP" "$PENDING_MARKER"
  PENDING_TEMP=''
}

pending_commit_is_allowed() {
  local commit=$1 subject changed_paths parent

  [ "$(git -C "$DASHBOARD_DIR" rev-list --count "$REMOTE_HEAD..$commit")" = "1" ] || return 1
  parent="$(git -C "$DASHBOARD_DIR" rev-parse "$commit^")"
  [ "$parent" = "$REMOTE_HEAD" ] || return 1
  subject="$(git -C "$DASHBOARD_DIR" show -s --format=%s "$commit")"
  changed_paths="$(git -C "$DASHBOARD_DIR" diff-tree --no-commit-id --name-only -r "$commit")"
  [ "$subject" = "$AUTOMATION_COMMIT_SUBJECT" ] && [ "$changed_paths" = "$FEED_RELATIVE_PATH" ]
}

cleanup() {
  local status=$? current_head current_public_dir keep_backup=0
  set +e

  if [ "$status" -ne 0 ] && [ "$FEED_REPLACED" -eq 1 ] && [ "$COMMIT_CREATED" -eq 0 ] && [ -n "$BASELINE_HEAD" ] && [ -n "$BACKUP_FEED" ]; then
    current_head="$(git -C "$DASHBOARD_DIR" rev-parse HEAD 2>/dev/null)"
    current_public_dir=''
    if [ ! -L "$PUBLIC_INPUT" ] && [ -d "$PUBLIC_INPUT" ]; then
      current_public_dir="$(cd "$PUBLIC_INPUT" 2>/dev/null && pwd -P)"
    fi
    if [ "$current_head" = "$BASELINE_HEAD" ] && [ "$current_public_dir" = "$PUBLIC_DIR" ]; then
      RESTORE_TEMP="$(mktemp "$PUBLIC_DIR/.public-feed.restore.XXXXXX" 2>/dev/null)"
      if [ -n "$RESTORE_TEMP" ] \
        && cp -p -- "$BACKUP_FEED" "$RESTORE_TEMP" \
        && git -C "$DASHBOARD_DIR" reset -q "$BASELINE_HEAD" -- "$FEED_RELATIVE_PATH" \
        && mv -Tf -- "$RESTORE_TEMP" "$FEED_PATH"; then
        RESTORE_TEMP=''
      else
        keep_backup=1
      fi
    else
      keep_backup=1
    fi
    if [ "$keep_backup" -eq 1 ]; then
      printf 'public housing feed rollback failed; backup retained: %s\n' "$BACKUP_FEED" >&2
    fi
  fi

  [ -z "$TEMP_FEED" ] || rm -f -- "$TEMP_FEED"
  [ -z "$RESTORE_TEMP" ] || rm -f -- "$RESTORE_TEMP"
  if [ -n "$BACKUP_FEED" ] && [ "$keep_backup" -eq 0 ]; then
    rm -f -- "$BACKUP_FEED"
  fi
  [ -z "$PENDING_TEMP" ] || rm -f -- "$PENDING_TEMP"
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

git -C "$DASHBOARD_INPUT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "dashboard Git repository not found: $DASHBOARD_INPUT"
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
PENDING_MARKER="$GIT_DIR/housing-publish.pending"

FLOCK_BIN="$(readlink -f /usr/bin/flock 2>/dev/null)" || fail 'canonical Linux flock is required for dashboard publishing'
[ "$FLOCK_BIN" = '/usr/bin/flock' ] && [ -x "$FLOCK_BIN" ] || fail 'canonical Linux flock is required for dashboard publishing'
LOCK_FILE="$GIT_DIR/housing-publish.flock"
if { [ -e "$LOCK_FILE" ] || [ -L "$LOCK_FILE" ]; } && { [ -L "$LOCK_FILE" ] || [ ! -f "$LOCK_FILE" ]; }; then
  fail "dashboard publisher lock endpoint must be a regular non-symlink file: $LOCK_FILE"
fi
exec 9>>"$LOCK_FILE"
[ ! -L "$LOCK_FILE" ] && [ -f "$LOCK_FILE" ] || fail "dashboard publisher lock endpoint became unsafe: $LOCK_FILE"
"$FLOCK_BIN" -n 9 || fail "housing publisher already running for dashboard: $DASHBOARD_DIR"

[ -z "$(git -C "$DASHBOARD_DIR" status --porcelain --untracked-files=all)" ] || fail "dashboard must be clean before publishing: $DASHBOARD_DIR"
CURRENT_BRANCH="$(git -C "$DASHBOARD_DIR" symbolic-ref --quiet --short HEAD || true)"
[ "$CURRENT_BRANCH" = "main" ] || fail "dashboard publisher must run on main, not ${CURRENT_BRANCH:-detached HEAD}"
validate_regular_feed
BASELINE_TRACKED_MODE="$(tracked_feed_mode)"
case "$BASELINE_TRACKED_MODE" in
  100644 | 100755) ;;
  *) fail 'public housing feed must use a regular tracked file mode' ;;
esac
[ "$(worktree_feed_mode)" = "$BASELINE_TRACKED_MODE" ] || fail 'public housing feed worktree mode does not match Git'

capture_origin_urls
GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" fetch --quiet "$ORIGIN_FETCH_URL" '+refs/heads/main:refs/remotes/origin/main'
LOCAL_HEAD="$(git -C "$DASHBOARD_DIR" rev-parse HEAD)"
FETCHED_REMOTE_HEAD="$(git -C "$DASHBOARD_DIR" rev-parse refs/remotes/origin/main)"
REMOTE_HEAD="$(remote_main_oid "$ORIGIN_PUSH_URL")"
[ "$REMOTE_HEAD" = "$FETCHED_REMOTE_HEAD" ] || fail 'dashboard fetch and push URLs disagree on origin main'
capture_origin_urls
BASELINE_HEAD="$LOCAL_HEAD"
[ "$(git -C "$DASHBOARD_DIR" rev-parse HEAD)" = "$BASELINE_HEAD" ] || fail 'dashboard HEAD changed after fetch'

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  [ ! -e "$PENDING_MARKER" ] && [ ! -L "$PENDING_MARKER" ] || clear_pending_marker
elif git -C "$DASHBOARD_DIR" merge-base --is-ancestor "$REMOTE_HEAD" "$LOCAL_HEAD"; then
  read_pending_marker
  [ "$PENDING_OID" = "$LOCAL_HEAD" ] || fail 'dashboard pending publish marker does not match HEAD'
  pending_commit_is_allowed "$LOCAL_HEAD" || fail 'dashboard pending publish commit is not the single allowed automation feed commit'
  validate_push_context "$BASELINE_HEAD" "$REMOTE_HEAD"
  GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" push \
    --force-with-lease="refs/heads/main:$REMOTE_HEAD" \
    "$ORIGIN_PUSH_URL" "$LOCAL_HEAD:refs/heads/main"
  clear_pending_marker
  REMOTE_HEAD="$LOCAL_HEAD"
elif git -C "$DASHBOARD_DIR" merge-base --is-ancestor "$LOCAL_HEAD" "$REMOTE_HEAD"; then
  fail 'dashboard main is behind origin/main; update it explicitly before publishing'
else
  fail 'dashboard main has diverged from origin/main; reconcile it explicitly before publishing'
fi

[ "$BASELINE_HEAD" = "$REMOTE_HEAD" ] || fail 'dashboard local and remote baselines differ after pending publish handling'
[ "$(git -C "$DASHBOARD_DIR" rev-parse HEAD)" = "$BASELINE_HEAD" ] || fail 'dashboard HEAD changed before exporting'
DATABASE_INPUT="${RENTAL_HOUSING_DB_PATH:-$STATE_DIR/rental-housing.db}"
[ -f "$DATABASE_INPUT" ] || fail "housing database file not found: $DATABASE_INPUT"
RENTAL_HOUSING_DB_PATH="$(readlink -f -- "$DATABASE_INPUT")" || fail "housing database path cannot be resolved: $DATABASE_INPUT"
export RENTAL_HOUSING_DB_PATH
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
EXPORTED_FILE_MODE="$(stat -c %a "$TEMP_FEED")"
EXPORTED_HASH="$(feed_hash "$TEMP_FEED")"
EXPORTED_GIT_OID="$(git -C "$DASHBOARD_DIR" hash-object --no-filters "$TEMP_FEED")"
FEED_REPLACED=1
mv -f -- "$TEMP_FEED" "$FEED_PATH"
TEMP_FEED=''

"$NPM_BIN" --prefix "$DASHBOARD_DIR" run build:public-dashboard
validate_repository_identity
validate_exported_feed

UNSTAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --name-only)"
STAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --cached --name-only)"
UNTRACKED_PATHS="$(git -C "$DASHBOARD_DIR" ls-files --others --exclude-standard)"
if { [ -n "$UNSTAGED_PATHS" ] && [ "$UNSTAGED_PATHS" != "$FEED_RELATIVE_PATH" ]; } || [ -n "$STAGED_PATHS" ] || [ -n "$UNTRACKED_PATHS" ]; then
  fail 'dashboard build changed or staged files other than the public housing feed'
fi

git -C "$DASHBOARD_DIR" add -- "$FEED_RELATIVE_PATH"
validate_repository_identity
validate_exported_feed
[ "$(git -C "$DASHBOARD_DIR" rev-parse ":$FEED_RELATIVE_PATH")" = "$EXPORTED_GIT_OID" ] || fail 'staged public housing feed does not match the exported artifact'
STAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --cached --name-only)"
UNSTAGED_PATHS="$(git -C "$DASHBOARD_DIR" diff --name-only)"
UNTRACKED_PATHS="$(git -C "$DASHBOARD_DIR" ls-files --others --exclude-standard)"
if [ -n "$UNSTAGED_PATHS" ] || [ -n "$UNTRACKED_PATHS" ] || { [ -n "$STAGED_PATHS" ] && [ "$STAGED_PATHS" != "$FEED_RELATIVE_PATH" ]; }; then
  fail 'public housing feed is not the sole dashboard change'
fi

if [ -z "$STAGED_PATHS" ]; then
  printf 'public housing feed unchanged\n'
  exit 0
fi

git -C "$DASHBOARD_DIR" commit --only -m "$AUTOMATION_COMMIT_SUBJECT" -- "$FEED_RELATIVE_PATH"
COMMIT_CREATED=1
PUBLISH_COMMIT="$(git -C "$DASHBOARD_DIR" rev-parse HEAD)"
[ "$(git -C "$DASHBOARD_DIR" rev-parse "$PUBLISH_COMMIT^")" = "$BASELINE_HEAD" ] || fail 'dashboard automation commit parent changed unexpectedly'
[ "$(git -C "$DASHBOARD_DIR" show -s --format=%s "$PUBLISH_COMMIT")" = "$AUTOMATION_COMMIT_SUBJECT" ] || fail 'dashboard automation commit subject changed unexpectedly'
[ "$(git -C "$DASHBOARD_DIR" diff-tree --no-commit-id --name-only -r "$PUBLISH_COMMIT")" = "$FEED_RELATIVE_PATH" ] || fail 'dashboard automation commit changed more than the public housing feed'
[ "$(git -C "$DASHBOARD_DIR" rev-parse "$PUBLISH_COMMIT:$FEED_RELATIVE_PATH")" = "$EXPORTED_GIT_OID" ] || fail 'committed public housing feed does not match the exported artifact'
[ "$(git -C "$DASHBOARD_DIR" ls-tree "$PUBLISH_COMMIT" -- "$FEED_RELATIVE_PATH" | awk '{ print $1 }')" = "$BASELINE_TRACKED_MODE" ] || fail 'committed public housing feed mode changed unexpectedly'
validate_exported_feed
write_pending_marker "$PUBLISH_COMMIT"

validate_push_context "$PUBLISH_COMMIT" "$REMOTE_HEAD"
GIT_TERMINAL_PROMPT=0 git -C "$DASHBOARD_DIR" push \
  --force-with-lease="refs/heads/main:$REMOTE_HEAD" \
  "$ORIGIN_PUSH_URL" "$PUBLISH_COMMIT:refs/heads/main"
clear_pending_marker
