import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, } from 'node:fs';
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
elif [ "\${1:-}" = "run" ] && [ "\${2:-}" = "export:public-feed" ]; then
  printf '%s\\n' "\${STUB_FEED_CONTENT:?}" > "\${PUBLIC_FEED_PATH:?}"
elif [ "\${1:-}" = "--prefix" ] && [ "\${3:-}" = "run" ] && [ "\${4:-}" = "build:public-dashboard" ]; then
  test -f "\${2}/public/public-feed.json"
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
    mkdirSync(homeDirectory, { recursive: true });
    return {
        ...process.env,
        HOME: homeDirectory,
        HOUSING_DASHBOARD_DIR: fixture.dashboardDirectory,
        HOUSING_NODE_BIN_DIR: fixture.stubBinDirectory,
        PATH: `${fixture.stubBinDirectory}:/usr/bin:/bin`,
        RENTAL_HOUSING_DB_PATH: join(fixture.rootDirectory, 'rental-housing.db'),
        STUB_COLLECT_RECORD: join(fixture.rootDirectory, 'collect-record.txt'),
        STUB_FEED_CONTENT: feed.trim(),
        'BASH_FUNC_npm%%': `() { /usr/bin/bash '${join(fixture.stubBinDirectory, 'npm')}' "$@"; }`,
    };
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
    writeFileSync(join(runtimeDirectory, 'collector.env'), 'COLLECTOR_ENV_MARKER=loaded\n');
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
