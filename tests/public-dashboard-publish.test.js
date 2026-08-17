import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, statSync, writeFileSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collectScript = join(projectRoot, 'scripts', 'collect-and-notify.sh');
const publishScript = join(projectRoot, 'scripts', 'publish-public-dashboard.sh');
const temporaryDirectories = [];
afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { force: true, recursive: true });
    }
});
function git(cwd, ...args) {
    return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' }).trim();
}
function waitFor(condition, description) {
    const sleeper = new Int32Array(new SharedArrayBuffer(4));
    for (let attempt = 0; attempt < 200; attempt += 1) {
        if (condition())
            return;
        Atomics.wait(sleeper, 0, 0, 10);
    }
    throw new Error(`timed out waiting for ${description}`);
}
function pendingMarkerPath(fixture) {
    return join(git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir'), 'housing-publish.pending');
}
function writePendingMarker(fixture, oid) {
    const marker = pendingMarkerPath(fixture);
    writeFileSync(marker, `${oid}\n`, { mode: 0o600 });
    chmodSync(marker, 0o600);
}
function createFixture(feed = '{"notices":[]}\n') {
    const rootDirectory = mkdtempSync(join(tmpdir(), 'housing-publish-'));
    temporaryDirectories.push(rootDirectory);
    const dashboardDirectory = join(rootDirectory, 'dashboard');
    const remoteDirectory = join(rootDirectory, 'remote.git');
    const stubBinDirectory = join(rootDirectory, 'bin');
    mkdirSync(join(dashboardDirectory, 'public'), { recursive: true });
    mkdirSync(stubBinDirectory);
    git(rootDirectory, 'init', '--bare', '--initial-branch=main', remoteDirectory);
    git(rootDirectory, 'init', '--initial-branch=main', dashboardDirectory);
    git(dashboardDirectory, 'config', 'user.name', 'Housing Test');
    git(dashboardDirectory, 'config', 'user.email', 'housing-test@example.invalid');
    writeFileSync(join(dashboardDirectory, 'public', 'public-feed.json'), feed);
    writeFileSync(join(dashboardDirectory, 'keep.txt'), 'keep\n');
    git(dashboardDirectory, 'add', '.');
    git(dashboardDirectory, 'commit', '-m', 'initial dashboard');
    git(dashboardDirectory, 'remote', 'add', 'origin', remoteDirectory);
    git(dashboardDirectory, 'push', '-u', 'origin', 'main');
    symlinkSync(process.execPath, join(stubBinDirectory, 'node'));
    const npmStub = join(stubBinDirectory, 'npm');
    writeFileSync(npmStub, `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "run" ] && [ "\${2:-}" = "collect:notify" ]; then
  printf 'db=%s\\ncontext=%s\\nenv=%s\\n' \
    "\${RENTAL_HOUSING_DB_PATH:-}" \
    "\${RENTAL_HOUSING_CONTEXT_PATH:-}" \
    "\${COLLECTOR_ENV_MARKER:-}" > "\${STUB_COLLECT_RECORD:?}"
  if [ "\${STUB_FAIL_STAGE:-}" = "collect" ]; then
    exit 72
  fi
	elif [ "\${1:-}" = "run" ] && [ "\${2:-}" = "export:public-feed" ]; then
	  if [ -n "\${STUB_DB_RECORD:-}" ]; then
	    printf '%s\\n' "\${RENTAL_HOUSING_DB_PATH:-}" > "\${STUB_DB_RECORD}"
	  fi
	  printf '%s\\n' "\${STUB_FEED_CONTENT:?}" > "\${PUBLIC_FEED_PATH:?}"
  if [ "\${STUB_FAIL_STAGE:-}" = "export" ]; then
    exit 70
  fi
elif [ "\${1:-}" = "--prefix" ] && [ "\${3:-}" = "run" ] && [ "\${4:-}" = "build:public-dashboard" ]; then
  test -f "\${2}/public/public-feed.json"
  if [ "\${STUB_STAGE_UNRELATED:-}" = "yes" ]; then
    printf 'changed by build\\n' > "\${2}/keep.txt"
    /usr/bin/git -C "\${2}" add -- keep.txt
  fi
	if [ "\${STUB_FAIL_STAGE:-}" = "build" ]; then
	  exit 71
	fi
	case "\${STUB_BUILD_MUTATION:-}" in
	  feed-content)
	    printf 'tampered by build\\n' > "\${2}/public/public-feed.json"
	    ;;
	  feed-symlink)
	    printf 'outside stays unchanged\\n' > "\${STUB_SYMLINK_TARGET:?}"
	    rm -f -- "\${2}/public/public-feed.json"
	    ln -s "\${STUB_SYMLINK_TARGET}" "\${2}/public/public-feed.json"
	    ;;
	  feed-mode)
	    chmod +x "\${2}/public/public-feed.json"
	    ;;
	  branch)
	    /usr/bin/git -C "\${2}" switch -q -c build-mutated
	    ;;
	  commit)
	    /usr/bin/git -C "\${2}" add -- public/public-feed.json
	    /usr/bin/git -C "\${2}" commit -q -m 'build mutation commit'
	    ;;
	  remote)
	    /usr/bin/git -C "\${2}" remote set-url origin "\${STUB_ALT_REMOTE:?}"
	    ;;
	  remote-rewind)
	    /usr/bin/git --git-dir="\${STUB_REMOTE_DIRECTORY:?}" update-ref refs/heads/main "\${STUB_REMOTE_REWIND_OID:?}"
	    ;;
	  public-symlink)
	    mv "\${2}/public" "\${2}/public-real"
	    ln -s public-real "\${2}/public"
	    ;;
	  rollback-blocked)
	    chmod 0444 "\${2}/public/public-feed.json"
	    chmod 0555 "\${2}/public"
	    exit 71
	    ;;
	  feed-directory)
	    rm -f -- "\${2}/public/public-feed.json"
	    mkdir "\${2}/public/public-feed.json"
	    exit 71
	    ;;
	esac
else
  printf 'unexpected npm command: %s\\n' "$*" >&2
  exit 64
fi
`);
    chmodSync(npmStub, 0o755);
    return { dashboardDirectory, remoteDirectory, rootDirectory, stubBinDirectory };
}
function scriptEnvironment(fixture, feed) {
    const homeDirectory = join(fixture.rootDirectory, 'home');
    const databasePath = join(fixture.rootDirectory, 'rental-housing.db');
    mkdirSync(homeDirectory, { recursive: true });
    writeFileSync(databasePath, 'test database\n');
    const environment = {
        ...process.env,
        HOME: homeDirectory,
        HOUSING_DASHBOARD_DIR: fixture.dashboardDirectory,
        HOUSING_NODE_BIN_DIR: fixture.stubBinDirectory,
        PATH: `${fixture.stubBinDirectory}:/usr/bin:/bin`,
        RENTAL_HOUSING_DB_PATH: databasePath,
        STUB_COLLECT_RECORD: join(fixture.rootDirectory, 'collect-record.txt'),
        STUB_FEED_CONTENT: feed.trim(),
        'BASH_FUNC_npm%%': `() { /usr/bin/bash '${join(fixture.stubBinDirectory, 'npm')}' "$@"; }`,
    };
    delete environment.NVM_DIR;
    return environment;
}
function runPublisher(fixture, feed, overrides = {}) {
    return spawnSync('/usr/bin/bash', [publishScript], {
        encoding: 'utf8',
        env: { ...scriptEnvironment(fixture, feed), ...overrides },
    });
}
function pushRemoteCommit(fixture, suffix) {
    const writerDirectory = join(fixture.rootDirectory, `remote-writer-${suffix}`);
    git(fixture.rootDirectory, 'clone', '--quiet', fixture.remoteDirectory, writerDirectory);
    git(writerDirectory, 'config', 'user.name', 'Remote Test');
    git(writerDirectory, 'config', 'user.email', 'remote-test@example.invalid');
    writeFileSync(join(writerDirectory, `remote-${suffix}.txt`), `remote ${suffix}\n`);
    git(writerDirectory, 'add', '.');
    git(writerDirectory, 'commit', '-m', `remote ${suffix}`);
    git(writerDirectory, 'push', 'origin', 'main');
}
function useWindowsNpmShim(fixture) {
    const npmPath = join(fixture.stubBinDirectory, 'npm');
    const windowsNpmPath = join(fixture.stubBinDirectory, 'npm.cmd');
    renameSync(npmPath, windowsNpmPath);
    symlinkSync(windowsNpmPath, npmPath);
}
describe('public dashboard publisher', () => {
    test('publishes a changed feed as the only dashboard file change', () => {
        const fixture = createFixture();
        const nextFeed = '{"notices":[{"id":"new"}]}\n';
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            encoding: 'utf8',
            env: scriptEnvironment(fixture, nextFeed),
        });
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8')).toBe(nextFeed);
        expect(readFileSync(join(fixture.dashboardDirectory, 'keep.txt'), 'utf8')).toBe('keep\n');
        expect(git(fixture.dashboardDirectory, 'log', '-1', '--format=%s')).toBe('data: update public housing notices');
        expect(git(fixture.dashboardDirectory, 'status', '--porcelain')).toBe('');
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(git(fixture.remoteDirectory, 'rev-parse', 'main'));
    });
    test('does not create a commit when the exported feed is unchanged', () => {
        const feed = '{"notices":[]}\n';
        const fixture = createFixture(feed);
        const before = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            encoding: 'utf8',
            env: scriptEnvironment(fixture, feed),
        });
        expect(result.status, result.stderr).toBe(0);
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(before);
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(before);
    });
    test('rejects a missing housing database before exporting', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const before = readFileSync(feedPath, 'utf8');
        const environment = scriptEnvironment(fixture, '{"notices":[{"id":"new"}]}\n');
        rmSync(join(fixture.rootDirectory, 'rental-housing.db'));
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            encoding: 'utf8',
            env: environment,
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('database');
        expect(readFileSync(feedPath, 'utf8')).toBe(before);
    });
    test('rejects a Windows npm shim even when node is Linux', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const before = readFileSync(feedPath, 'utf8');
        useWindowsNpmShim(fixture);
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            encoding: 'utf8',
            env: scriptEnvironment(fixture, '{"notices":[{"id":"new"}]}\n'),
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Linux npm');
        expect(readFileSync(feedPath, 'utf8')).toBe(before);
    });
    test('uses the validated Linux npm executable instead of an exported npm function', () => {
        const fixture = createFixture();
        const nextFeed = '{"notices":[{"id":"linux-npm"}]}\n';
        const result = runPublisher(fixture, nextFeed, {
            'BASH_FUNC_npm%%': "() { printf 'Windows npm shim function invoked\\n' >&2; return 86; }",
        });
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8')).toBe(nextFeed);
    });
    test('canonicalizes a relative Linux node bin directory before changing directory', () => {
        const fixture = createFixture();
        const nextFeed = '{"notices":[{"id":"relative-bin"}]}\n';
        const environment = scriptEnvironment(fixture, nextFeed);
        environment.HOUSING_NODE_BIN_DIR = 'bin';
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            cwd: fixture.rootDirectory,
            encoding: 'utf8',
            env: environment,
        });
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8')).toBe(nextFeed);
    });
    test('canonicalizes a relative database path before changing directory', () => {
        const fixture = createFixture();
        const databaseRecord = join(fixture.rootDirectory, 'database-record.txt');
        const environment = scriptEnvironment(fixture, '{"notices":[]}\n');
        environment.RENTAL_HOUSING_DB_PATH = 'rental-housing.db';
        environment.STUB_DB_RECORD = databaseRecord;
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            cwd: fixture.rootDirectory,
            encoding: 'utf8',
            env: environment,
        });
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(databaseRecord, 'utf8')).toBe(`${join(fixture.rootDirectory, 'rental-housing.db')}\n`);
    });
    test('refuses a dirty dashboard before exporting', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const before = readFileSync(feedPath, 'utf8');
        writeFileSync(join(fixture.dashboardDirectory, 'dirty.txt'), 'dirty\n');
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            encoding: 'utf8',
            env: scriptEnvironment(fixture, '{"notices":[{"id":"new"}]}\n'),
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('clean');
        expect(readFileSync(feedPath, 'utf8')).toBe(before);
    });
});
test('collector uses the XDG housing runtime and then publishes', () => {
    const feed = '{"notices":[{"id":"collected"}]}\n';
    const fixture = createFixture();
    const xdgDataHome = join(fixture.rootDirectory, 'xdg-data');
    const runtimeDirectory = join(xdgDataHome, 'housing');
    const collectRecordPath = join(fixture.rootDirectory, 'collect-record.txt');
    mkdirSync(runtimeDirectory, { recursive: true });
    writeFileSync(join(runtimeDirectory, 'rental-housing.db'), 'test database\n');
    writeFileSync(join(runtimeDirectory, 'collector.env'), 'COLLECTOR_ENV_MARKER=loaded\n', {
        mode: 0o600,
    });
    const environment = {
        ...scriptEnvironment(fixture, feed),
        OPENCLAW_STATE_DIR: join(fixture.rootDirectory, 'legacy-state'),
        STUB_COLLECT_RECORD: collectRecordPath,
        XDG_DATA_HOME: xdgDataHome,
    };
    delete environment.RENTAL_HOUSING_DB_PATH;
    const result = spawnSync('/usr/bin/bash', [collectScript], {
        cwd: fixture.rootDirectory,
        encoding: 'utf8',
        env: environment,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(collectRecordPath, 'utf8')).toBe(`db=${join(runtimeDirectory, 'rental-housing.db')}\n` +
        `context=${join(runtimeDirectory, 'telegram-context.json')}\n` +
        'env=loaded\n');
    expect(readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8')).toBe(feed);
    expect(readFileSync(join(runtimeDirectory, 'logs', 'collect-notify.log'), 'utf8')).toContain('collect notify done');
    expect(readFileSync(collectScript, 'utf8')).not.toContain('/home/pung8146/.openclaw');
});
test('collector failure prevents dashboard feed and remote mutation', () => {
    const fixture = createFixture();
    const originalFeed = readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8');
    const originalRemoteHead = git(fixture.rootDirectory, '--git-dir', fixture.remoteDirectory, 'rev-parse', 'main');
    const result = spawnSync('/usr/bin/bash', [collectScript], {
        cwd: fixture.rootDirectory,
        encoding: 'utf8',
        env: {
            ...scriptEnvironment(fixture, '{"notices":[{"id":"must-not-publish"}]}\n'),
            STUB_FAIL_STAGE: 'collect',
        },
    });
    expect(result.status).toBe(72);
    expect(readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8')).toBe(originalFeed);
    expect(git(fixture.rootDirectory, '--git-dir', fixture.remoteDirectory, 'rev-parse', 'main')).toBe(originalRemoteHead);
});
test('collector rejects a Windows npm shim before collection starts', () => {
    const fixture = createFixture();
    const xdgDataHome = join(fixture.rootDirectory, 'xdg-data');
    const runtimeDirectory = join(xdgDataHome, 'housing');
    const collectRecordPath = join(fixture.rootDirectory, 'collect-record.txt');
    const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
    const feedBefore = readFileSync(feedPath, 'utf8');
    mkdirSync(runtimeDirectory, { recursive: true });
    writeFileSync(join(runtimeDirectory, 'rental-housing.db'), 'test database\n');
    useWindowsNpmShim(fixture);
    const environment = {
        ...scriptEnvironment(fixture, '{"notices":[{"id":"should-not-run"}]}\n'),
        STUB_COLLECT_RECORD: collectRecordPath,
        XDG_DATA_HOME: xdgDataHome,
    };
    delete environment.RENTAL_HOUSING_DB_PATH;
    const result = spawnSync('/usr/bin/bash', [collectScript], {
        cwd: fixture.rootDirectory,
        encoding: 'utf8',
        env: environment,
    });
    expect(result.status).not.toBe(0);
    expect(readFileSync(join(runtimeDirectory, 'logs', 'collect-notify.log'), 'utf8')).toContain('Linux npm');
    expect(existsSync(collectRecordPath)).toBe(false);
    expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
    expect(git(fixture.dashboardDirectory, 'log', '--format=%s')).toBe('initial dashboard');
});
test('collector uses the validated Linux npm executable instead of an exported npm function', () => {
    const feed = '{"notices":[{"id":"linux-npm"}]}\n';
    const fixture = createFixture();
    const xdgDataHome = join(fixture.rootDirectory, 'xdg-data');
    const runtimeDirectory = join(xdgDataHome, 'housing');
    const collectRecordPath = join(fixture.rootDirectory, 'collect-record.txt');
    mkdirSync(runtimeDirectory, { recursive: true });
    writeFileSync(join(runtimeDirectory, 'rental-housing.db'), 'test database\n');
    const environment = {
        ...scriptEnvironment(fixture, feed),
        'BASH_FUNC_npm%%': "() { printf 'Windows npm shim function invoked\\n' >&2; return 86; }",
        STUB_COLLECT_RECORD: collectRecordPath,
        XDG_DATA_HOME: xdgDataHome,
    };
    delete environment.RENTAL_HOUSING_DB_PATH;
    const result = spawnSync('/usr/bin/bash', [collectScript], {
        cwd: fixture.rootDirectory,
        encoding: 'utf8',
        env: environment,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(collectRecordPath, 'utf8')).toContain(`db=${join(runtimeDirectory, 'rental-housing.db')}`);
    expect(readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8')).toBe(feed);
});
describe('publisher repository safety', () => {
    test.each(['feature', 'detached'])('refuses a %s checkout before mutation', (checkoutState) => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        if (checkoutState === 'feature') {
            git(fixture.dashboardDirectory, 'checkout', '-b', 'feature');
        }
        else {
            git(fixture.dashboardDirectory, 'checkout', '--detach');
        }
        const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('main');
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(headBefore);
        expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
    });
    test('refuses non-automation commits ahead of origin main', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        const remoteBefore = git(fixture.remoteDirectory, 'rev-parse', 'main');
        writeFileSync(join(fixture.dashboardDirectory, 'manual-refinement.txt'), 'manual\n');
        git(fixture.dashboardDirectory, 'add', 'manual-refinement.txt');
        git(fixture.dashboardDirectory, 'commit', '-m', 'fix: manual dashboard refinement');
        const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('pending');
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(headBefore);
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
        expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
    });
    test('refuses an unmarked automation-looking commit ahead of origin main', () => {
        const fixture = createFixture();
        const feed = '{"notices":[{"id":"pending"}]}\n';
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        writeFileSync(feedPath, feed);
        git(fixture.dashboardDirectory, 'add', 'public/public-feed.json');
        git(fixture.dashboardDirectory, 'commit', '-m', 'data: update public housing notices');
        const pendingHead = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const result = runPublisher(fixture, feed);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('pending');
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).not.toBe(pendingHead);
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(pendingHead);
    });
    test('records a rejected push and retries only the marked automation commit', () => {
        const fixture = createFixture();
        const feed = '{"notices":[{"id":"pending"}]}\n';
        const remoteBefore = git(fixture.remoteDirectory, 'rev-parse', 'main');
        const rejectFlag = join(fixture.remoteDirectory, 'reject-push');
        const hookPath = join(fixture.remoteDirectory, 'hooks', 'pre-receive');
        writeFileSync(hookPath, '#!/usr/bin/env bash\nif [ -f "$(dirname "$0")/../reject-push" ]; then exit 1; fi\n');
        chmodSync(hookPath, 0o755);
        writeFileSync(rejectFlag, 'reject\n');
        const rejected = runPublisher(fixture, feed);
        expect(rejected.status).not.toBe(0);
        const pendingHead = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const marker = pendingMarkerPath(fixture);
        expect(pendingHead).not.toBe(remoteBefore);
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
        expect(readFileSync(marker, 'utf8')).toBe(`${pendingHead}\n`);
        expect(statSync(marker).mode & 0o777).toBe(0o600);
        rmSync(rejectFlag);
        const retry = runPublisher(fixture, feed);
        expect(retry.status, retry.stderr).toBe(0);
        expect(existsSync(marker)).toBe(false);
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(pendingHead);
        expect(git(fixture.dashboardDirectory, 'rev-list', '--count', `${remoteBefore}..HEAD`)).toBe('1');
    });
    test('refuses a pending marker that does not name HEAD', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        writeFileSync(feedPath, '{"notices":[{"id":"pending"}]}\n');
        git(fixture.dashboardDirectory, 'add', 'public/public-feed.json');
        git(fixture.dashboardDirectory, 'commit', '-m', 'data: update public housing notices');
        writePendingMarker(fixture, '0000000000000000000000000000000000000000');
        const remoteBefore = git(fixture.remoteDirectory, 'rev-parse', 'main');
        const result = runPublisher(fixture, '{"notices":[{"id":"pending"}]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('pending');
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
    });
    test('refuses more than one marked automation commit ahead of origin main', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        for (const id of ['one', 'two']) {
            writeFileSync(feedPath, `{"notices":[{"id":"${id}"}]}\n`);
            git(fixture.dashboardDirectory, 'add', 'public/public-feed.json');
            git(fixture.dashboardDirectory, 'commit', '-m', 'data: update public housing notices');
        }
        const pendingHead = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        writePendingMarker(fixture, pendingHead);
        const remoteBefore = git(fixture.remoteDirectory, 'rev-parse', 'main');
        const result = runPublisher(fixture, '{"notices":[{"id":"two"}]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('single allowed');
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
    });
    test('clears a stale pending marker when origin main already equals HEAD', () => {
        const fixture = createFixture();
        const marker = pendingMarkerPath(fixture);
        writePendingMarker(fixture, '0000000000000000000000000000000000000000');
        const result = runPublisher(fixture, '{"notices":[]}\n');
        expect(result.status, result.stderr).toBe(0);
        expect(existsSync(marker)).toBe(false);
    });
    test.each(['behind', 'diverged'])('refuses a %s main before mutating the feed', (repositoryState) => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        if (repositoryState === 'diverged') {
            writeFileSync(join(fixture.dashboardDirectory, 'local-only.txt'), 'local\n');
            git(fixture.dashboardDirectory, 'add', 'local-only.txt');
            git(fixture.dashboardDirectory, 'commit', '-m', 'local divergence');
        }
        const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        pushRemoteCommit(fixture, repositoryState);
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(repositoryState);
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(headBefore);
        expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
        expect(git(fixture.dashboardDirectory, 'status', '--porcelain')).toBe('');
    });
    test.each(['export', 'build', 'commit'])('restores the feed and index after %s failure', (failureStage) => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const hookPath = join(fixture.dashboardDirectory, '.git', 'hooks', 'pre-commit');
        const overrides = {};
        if (failureStage === 'commit') {
            writeFileSync(hookPath, '#!/usr/bin/env bash\nexit 72\n');
            chmodSync(hookPath, 0o755);
        }
        else {
            overrides.STUB_FAIL_STAGE = failureStage;
        }
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n', overrides);
        expect(result.status).not.toBe(0);
        expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(headBefore);
        expect(git(fixture.dashboardDirectory, 'status', '--porcelain')).toBe('');
        rmSync(hookPath, { force: true });
        const retry = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n');
        expect(retry.status, retry.stderr).toBe(0);
    });
    test('rejects a tracked symlink feed without changing its target', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const outsidePath = join(fixture.rootDirectory, 'outside-feed.json');
        const outsideBefore = '{"outside":true}\n';
        writeFileSync(outsidePath, outsideBefore);
        rmSync(feedPath);
        symlinkSync(outsidePath, feedPath);
        git(fixture.dashboardDirectory, 'add', 'public/public-feed.json');
        git(fixture.dashboardDirectory, 'commit', '-m', 'test symlink feed');
        git(fixture.dashboardDirectory, 'push', 'origin', 'main');
        const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('regular');
        expect(readFileSync(outsidePath, 'utf8')).toBe(outsideBefore);
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(headBefore);
    });
    test('never commits an unrelated file staged during the dashboard build', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const remoteBefore = git(fixture.remoteDirectory, 'rev-parse', 'main');
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n', {
            STUB_STAGE_UNRELATED: 'yes',
        });
        expect(result.status).not.toBe(0);
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(headBefore);
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
        expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
        expect(git(fixture.dashboardDirectory, 'diff', '--cached', '--name-only')).toBe('keep.txt');
    });
    test('never pushes feed content replaced by a concurrent commit hook', () => {
        const fixture = createFixture();
        const remoteBefore = git(fixture.remoteDirectory, 'rev-parse', 'main');
        const hookPath = join(fixture.dashboardDirectory, '.git', 'hooks', 'pre-commit');
        writeFileSync(hookPath, '#!/usr/bin/env bash\nprintf \'tampered during commit\\n\' > public/public-feed.json\ngit add -- public/public-feed.json\n');
        chmodSync(hookPath, 0o755);
        const result = runPublisher(fixture, '{"notices":[{"id":"verified"}]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('artifact');
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
        expect(existsSync(pendingMarkerPath(fixture))).toBe(false);
    });
    test('retains the standalone backup when an atomic feed rollback cannot start', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        const gitDirectory = git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir');
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n', {
            STUB_BUILD_MUTATION: 'rollback-blocked',
        });
        chmodSync(join(fixture.dashboardDirectory, 'public'), 0o755);
        chmodSync(feedPath, 0o644);
        const backups = readdirSync(gitDirectory).filter((name) => name.startsWith('housing-feed-backup.'));
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('backup retained');
        expect(backups).toHaveLength(1);
        expect(readFileSync(join(gitDirectory, backups[0]), 'utf8')).toBe(feedBefore);
    });
    test('does not mistake a feed directory for a successful atomic rollback', () => {
        const fixture = createFixture();
        const gitDirectory = git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir');
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n', {
            STUB_BUILD_MUTATION: 'feed-directory',
        });
        const backups = readdirSync(gitDirectory).filter((name) => name.startsWith('housing-feed-backup.'));
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('backup retained');
        expect(backups).toHaveLength(1);
        expect(lstatSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json')).isDirectory()).toBe(true);
    });
    test.each([
        'feed-content',
        'feed-symlink',
        'feed-mode',
        'branch',
        'commit',
        'remote',
        'public-symlink',
    ])('rejects a %s mutation made by the dashboard build', (mutation) => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const remoteBefore = git(fixture.remoteDirectory, 'rev-parse', 'main');
        const outsidePath = join(fixture.rootDirectory, 'outside-feed.json');
        const alternateRemote = join(fixture.rootDirectory, 'alternate.git');
        git(fixture.rootDirectory, 'init', '--bare', '--initial-branch=main', alternateRemote);
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n', {
            STUB_ALT_REMOTE: alternateRemote,
            STUB_BUILD_MUTATION: mutation,
            STUB_SYMLINK_TARGET: outsidePath,
        });
        expect(result.status).not.toBe(0);
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
        expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD') === headBefore).toBe(mutation !== 'commit');
        if (mutation !== 'commit' && mutation !== 'public-symlink') {
            expect(lstatSync(feedPath).isSymbolicLink()).toBe(false);
            expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
            expect(git(fixture.dashboardDirectory, 'diff', '--cached', '--', 'public/public-feed.json')).toBe('');
        }
        if (mutation === 'remote') {
            expect(git(fixture.dashboardDirectory, 'remote', 'get-url', 'origin')).toBe(alternateRemote);
            expect(() => git(alternateRemote, 'rev-parse', 'main')).toThrow();
        }
    });
    test('pins the final push to a captured commit object id', () => {
        const source = readFileSync(publishScript, 'utf8');
        expect(source.match(/--force-with-lease="refs\/heads\/main:\$REMOTE_HEAD"/g)).toHaveLength(2);
        expect(source).toContain('origin "$PUBLISH_COMMIT:refs/heads/main"');
        expect(source).toContain('origin "$LOCAL_HEAD:refs/heads/main"');
        expect(source).not.toContain('push origin HEAD:main');
    });
    test('does not resurrect remote history rewound after fetch', () => {
        const fixture = createFixture();
        const rewindTarget = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        writeFileSync(join(fixture.dashboardDirectory, 'keep.txt'), 'second baseline\n');
        git(fixture.dashboardDirectory, 'add', 'keep.txt');
        git(fixture.dashboardDirectory, 'commit', '-m', 'second dashboard baseline');
        git(fixture.dashboardDirectory, 'push', 'origin', 'main');
        const fetchedBaseline = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n', {
            STUB_BUILD_MUTATION: 'remote-rewind',
            STUB_REMOTE_DIRECTORY: fixture.remoteDirectory,
            STUB_REMOTE_REWIND_OID: rewindTarget,
        });
        expect(result.status).not.toBe(0);
        expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(rewindTarget);
        const pendingHead = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
        expect(pendingHead).not.toBe(fetchedBaseline);
        expect(readFileSync(pendingMarkerPath(fixture), 'utf8')).toBe(`${pendingHead}\n`);
    });
    test('ignores a stale legacy lock directory', () => {
        const fixture = createFixture();
        const gitDirectory = git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir');
        mkdirSync(join(gitDirectory, 'housing-publish.lock'));
        const result = runPublisher(fixture, '{"notices":[]}\n');
        expect(result.status, result.stderr).toBe(0);
    });
    test('rejects a symlink publisher lock without truncating its target', () => {
        const fixture = createFixture();
        const gitDirectory = git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir');
        const lockTarget = join(fixture.rootDirectory, 'lock-target.txt');
        writeFileSync(lockTarget, 'must remain intact\n');
        symlinkSync(lockTarget, join(gitDirectory, 'housing-publish.flock'));
        const result = runPublisher(fixture, '{"notices":[]}\n');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('lock endpoint');
        expect(readFileSync(lockTarget, 'utf8')).toBe('must remain intact\n');
    });
    test('rejects a FIFO publisher lock without blocking', () => {
        const fixture = createFixture();
        const gitDirectory = git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir');
        execFileSync('/usr/bin/mkfifo', [join(gitDirectory, 'housing-publish.flock')]);
        const result = spawnSync('/usr/bin/bash', [publishScript], {
            encoding: 'utf8',
            env: scriptEnvironment(fixture, '{"notices":[]}\n'),
            timeout: 500,
        });
        expect(result.signal).toBeNull();
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('lock endpoint');
    });
    test('blocks only while the dashboard flock is held and reuses the released lock file', () => {
        const fixture = createFixture();
        const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
        const feedBefore = readFileSync(feedPath, 'utf8');
        const gitDirectory = git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir');
        const lockPath = join(gitDirectory, 'housing-publish.flock');
        const readyPath = join(fixture.rootDirectory, 'lock-ready');
        const holder = spawn('/usr/bin/bash', ['-c', 'exec 9>"$1"; /usr/bin/flock -n 9; printf ready > "$2"; read -r', 'bash', lockPath, readyPath], { stdio: ['pipe', 'ignore', 'pipe'] });
        waitFor(() => existsSync(readyPath), 'publisher lock holder');
        const blocked = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n');
        expect(blocked.status).not.toBe(0);
        expect(blocked.stderr).toContain('already running');
        expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
        holder.kill('SIGTERM');
        waitFor(() => spawnSync('/usr/bin/flock', ['-n', lockPath, '/usr/bin/true']).status === 0, 'publisher lock release');
        const released = runPublisher(fixture, '{"notices":[]}\n');
        expect(released.status, released.stderr).toBe(0);
        expect(existsSync(lockPath)).toBe(true);
    });
});
