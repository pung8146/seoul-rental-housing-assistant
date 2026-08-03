import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collectScript = join(projectRoot, 'scripts', 'collect-and-notify.sh');
const publishScript = join(projectRoot, 'scripts', 'publish-public-dashboard.sh');
const temporaryDirectories: string[] = [];

type Fixture = {
  dashboardDirectory: string;
  remoteDirectory: string;
  stubBinDirectory: string;
  rootDirectory: string;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' }).trim();
}

function createFixture(feed = '{"notices":[]}\n'): Fixture {
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
  writeFileSync(
    npmStub,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "run" ] && [ "\${2:-}" = "collect:notify" ]; then
  printf 'db=%s\\ncontext=%s\\nenv=%s\\n' \
    "\${RENTAL_HOUSING_DB_PATH:-}" \
    "\${RENTAL_HOUSING_CONTEXT_PATH:-}" \
    "\${COLLECTOR_ENV_MARKER:-}" > "\${STUB_COLLECT_RECORD:?}"
elif [ "\${1:-}" = "run" ] && [ "\${2:-}" = "export:public-feed" ]; then
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
else
  printf 'unexpected npm command: %s\\n' "$*" >&2
  exit 64
fi
`,
  );
  chmodSync(npmStub, 0o755);

  return { dashboardDirectory, remoteDirectory, rootDirectory, stubBinDirectory };
}

function scriptEnvironment(fixture: Fixture, feed: string): NodeJS.ProcessEnv {
  const homeDirectory = join(fixture.rootDirectory, 'home');
  const databasePath = join(fixture.rootDirectory, 'rental-housing.db');
  mkdirSync(homeDirectory, { recursive: true });
  writeFileSync(databasePath, 'test database\n');

  const environment: NodeJS.ProcessEnv = {
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

function runPublisher(
  fixture: Fixture,
  feed: string,
  overrides: NodeJS.ProcessEnv = {},
) {
  return spawnSync('/usr/bin/bash', [publishScript], {
    encoding: 'utf8',
    env: { ...scriptEnvironment(fixture, feed), ...overrides },
  });
}

function pushRemoteCommit(fixture: Fixture, suffix: string): void {
  const writerDirectory = join(fixture.rootDirectory, `remote-writer-${suffix}`);
  git(fixture.rootDirectory, 'clone', '--quiet', fixture.remoteDirectory, writerDirectory);
  git(writerDirectory, 'config', 'user.name', 'Remote Test');
  git(writerDirectory, 'config', 'user.email', 'remote-test@example.invalid');
  writeFileSync(join(writerDirectory, `remote-${suffix}.txt`), `remote ${suffix}\n`);
  git(writerDirectory, 'add', '.');
  git(writerDirectory, 'commit', '-m', `remote ${suffix}`);
  git(writerDirectory, 'push', 'origin', 'main');
}

function useWindowsNpmShim(fixture: Fixture): void {
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
    expect(git(fixture.dashboardDirectory, 'log', '-1', '--format=%s')).toBe(
      'data: update public housing notices',
    );
    expect(git(fixture.dashboardDirectory, 'status', '--porcelain')).toBe('');
    expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(
      git(fixture.remoteDirectory, 'rev-parse', 'main'),
    );
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
  writeFileSync(join(runtimeDirectory, 'collector.env'), 'COLLECTOR_ENV_MARKER=loaded\n');
  const environment: NodeJS.ProcessEnv = {
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
  expect(readFileSync(collectRecordPath, 'utf8')).toBe(
    `db=${join(runtimeDirectory, 'rental-housing.db')}\n` +
      `context=${join(runtimeDirectory, 'telegram-context.json')}\n` +
      'env=loaded\n',
  );
  expect(readFileSync(join(fixture.dashboardDirectory, 'public', 'public-feed.json'), 'utf8')).toBe(feed);
  expect(readFileSync(join(runtimeDirectory, 'logs', 'collect-notify.log'), 'utf8')).toContain(
    'collect notify done',
  );
  expect(readFileSync(collectScript, 'utf8')).not.toContain('/home/pung8146/.openclaw');
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
  const environment: NodeJS.ProcessEnv = {
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
  expect(readFileSync(join(runtimeDirectory, 'logs', 'collect-notify.log'), 'utf8')).toContain(
    'Linux npm',
  );
  expect(existsSync(collectRecordPath)).toBe(false);
  expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
  expect(git(fixture.dashboardDirectory, 'log', '--format=%s')).toBe('initial dashboard');
});

describe('publisher repository safety', () => {
  test.each(['feature', 'detached'] as const)('refuses a %s checkout before mutation', (checkoutState) => {
    const fixture = createFixture();
    const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
    const feedBefore = readFileSync(feedPath, 'utf8');
    if (checkoutState === 'feature') {
      git(fixture.dashboardDirectory, 'checkout', '-b', 'feature');
    } else {
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
    expect(result.stderr).toContain('non-automation');
    expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(remoteBefore);
    expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
  });

  test('retries an unpushed automation-only feed commit before unchanged export', () => {
    const fixture = createFixture();
    const feed = '{"notices":[{"id":"pending"}]}\n';
    const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
    writeFileSync(feedPath, feed);
    git(fixture.dashboardDirectory, 'add', 'public/public-feed.json');
    git(fixture.dashboardDirectory, 'commit', '-m', 'data: update public housing notices');
    const pendingHead = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');

    const result = runPublisher(fixture, feed);

    expect(result.status, result.stderr).toBe(0);
    expect(git(fixture.remoteDirectory, 'rev-parse', 'main')).toBe(pendingHead);
    expect(git(fixture.dashboardDirectory, 'rev-parse', 'HEAD')).toBe(pendingHead);
  });

  test.each(['behind', 'diverged'] as const)(
    'refuses a %s main before mutating the feed',
    (repositoryState) => {
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
    },
  );

  test.each(['export', 'build', 'commit'] as const)(
    'restores the feed and index after %s failure',
    (failureStage) => {
      const fixture = createFixture();
      const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
      const feedBefore = readFileSync(feedPath, 'utf8');
      const headBefore = git(fixture.dashboardDirectory, 'rev-parse', 'HEAD');
      const hookPath = join(fixture.dashboardDirectory, '.git', 'hooks', 'pre-commit');
      const overrides: NodeJS.ProcessEnv = {};
      if (failureStage === 'commit') {
        writeFileSync(hookPath, '#!/usr/bin/env bash\nexit 72\n');
        chmodSync(hookPath, 0o755);
      } else {
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
    },
  );

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

  test('refuses a concurrent publisher lock scoped to the dashboard', () => {
    const fixture = createFixture();
    const feedPath = join(fixture.dashboardDirectory, 'public', 'public-feed.json');
    const feedBefore = readFileSync(feedPath, 'utf8');
    const gitDirectory = git(fixture.dashboardDirectory, 'rev-parse', '--absolute-git-dir');
    mkdirSync(join(gitDirectory, 'housing-publish.lock'));

    const result = runPublisher(fixture, '{"notices":[{"id":"new"}]}\n');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already running');
    expect(readFileSync(feedPath, 'utf8')).toBe(feedBefore);
    expect(git(fixture.dashboardDirectory, 'log', '--format=%s')).toBe('initial dashboard');
  });
});
