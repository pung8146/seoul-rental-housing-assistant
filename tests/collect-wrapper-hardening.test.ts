import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceCollectScript = join(projectRoot, 'scripts', 'collect-and-notify.sh');
const temporaryDirectories: string[] = [];
const lockHolders: ChildProcessWithoutNullStreams[] = [];

interface Fixture {
  appDirectory: string;
  collectScript: string;
  environment: NodeJS.ProcessEnv;
  functionLog: string;
  lockFile: string;
  logFile: string;
  rootDirectory: string;
  stateDirectory: string;
  toolchainDirectory: string;
  workLog: string;
}

afterEach(() => {
  for (const holder of lockHolders.splice(0)) {
    if (holder.exitCode === null) {
      holder.kill('SIGKILL');
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents);
  chmodSync(path, 0o700);
}

function createFixture(): Fixture {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'housing-collect-wrapper-'));
  temporaryDirectories.push(rootDirectory);
  const appDirectory = join(rootDirectory, 'collector-app');
  const scriptDirectory = join(rootDirectory, 'scripts');
  const stateDirectory = join(rootDirectory, 'state');
  const toolchainDirectory = join(rootDirectory, 'toolchain');
  const workLog = join(rootDirectory, 'work.log');
  const functionLog = join(rootDirectory, 'function.log');
  const collectScript = join(scriptDirectory, 'collect-and-notify.sh');
  const lockFile = join(stateDirectory, 'collect.flock');
  const logFile = join(stateDirectory, 'logs', 'collect-notify.log');

  mkdirSync(appDirectory, { recursive: true });
  mkdirSync(join(rootDirectory, 'home'), { recursive: true });
  mkdirSync(scriptDirectory, { recursive: true });
  mkdirSync(toolchainDirectory, { recursive: true });
  copyFileSync(sourceCollectScript, collectScript);
  chmodSync(collectScript, 0o700);

  writeExecutable(
    join(scriptDirectory, 'publish-public-dashboard.sh'),
    `#!/usr/bin/env bash\nprintf 'publish:%s\\n' "$PWD" >> "$STUB_WORK_LOG"\n`,
  );
  writeExecutable(
    join(toolchainDirectory, 'node'),
    `#!/usr/bin/env bash\nif [ "\${1:-}" = '-p' ]; then\n  printf 'linux\\n'\n  exit 0\nfi\nprintf 'node:%s\\n' "$PWD" >> "$STUB_WORK_LOG"\n`,
  );
  writeExecutable(
    join(toolchainDirectory, 'npm'),
    `#!/usr/bin/env bash\nprintf 'collect:%s\\n' "$PWD" >> "$STUB_WORK_LOG"\n`,
  );

  return {
    appDirectory,
    collectScript,
    environment: {
      ...process.env,
      HOME: join(rootDirectory, 'home'),
      HOUSING_NODE_BIN_DIR: toolchainDirectory,
      LC_ALL: 'C',
      NVM_DIR: join(rootDirectory, 'missing-nvm'),
      PATH: `${toolchainDirectory}:/usr/bin:/bin`,
      RENTAL_HOUSING_APP_DIR: appDirectory,
      RENTAL_HOUSING_STATE_DIR: stateDirectory,
      STUB_FUNCTION_LOG: functionLog,
      STUB_WORK_LOG: workLog,
    },
    functionLog,
    lockFile,
    logFile,
    rootDirectory,
    stateDirectory,
    toolchainDirectory,
    workLog,
  };
}

function runCollector(fixture: Fixture, environment = fixture.environment) {
  return spawnSync(
    '/usr/bin/bash',
    ['-c', 'umask 022; exec /usr/bin/bash "$1"', 'runner', fixture.collectScript],
    {
      cwd: fixture.rootDirectory,
      encoding: 'utf8',
      env: environment,
      timeout: 5_000,
    },
  );
}

async function holdLock(fixture: Fixture): Promise<ChildProcessWithoutNullStreams> {
  mkdirSync(fixture.stateDirectory, { recursive: true });
  const readyFile = join(fixture.rootDirectory, `holder-${lockHolders.length}.ready`);
  const holder = spawn(
    '/usr/bin/bash',
    [
      '-c',
      'exec 9>"$1"; /usr/bin/flock -n 9 || exit 73; printf ready > "$2"; read -r _',
      'holder',
      fixture.lockFile,
      readyFile,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  lockHolders.push(holder);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(readyFile)) {
      return holder;
    }
    if (holder.exitCode !== null) {
      throw new Error(`lock holder exited early with ${holder.exitCode}`);
    }
    await delay(10);
  }
  throw new Error('lock holder did not become ready');
}

async function releaseLock(holder: ChildProcessWithoutNullStreams): Promise<void> {
  holder.stdin.end('\n');
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => rejectPromise(new Error('lock holder did not exit')), 2_000);
    holder.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

function permissions(path: string): number {
  return statSync(path).mode & 0o777;
}

test('a stale legacy collect.lock directory does not block collection', () => {
  const fixture = createFixture();
  const legacyLockDirectory = join(fixture.stateDirectory, 'collect.lock');
  mkdirSync(legacyLockDirectory, { recursive: true });

  const result = runCollector(fixture);

  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(fixture.workLog, 'utf8')).toContain('collect:');
  expect(readFileSync(fixture.workLog, 'utf8')).toContain('publish:');
  expect(existsSync(legacyLockDirectory)).toBe(true);
});

test('an active collect.flock skips work, records the skip, and exits successfully', async () => {
  const fixture = createFixture();
  const holder = await holdLock(fixture);

  const result = runCollector(fixture);

  expect(result.status, result.stderr).toBe(0);
  expect(existsSync(fixture.workLog)).toBe(false);
  expect(readFileSync(fixture.logFile, 'utf8')).toContain('previous collect still running');
  await releaseLock(holder);
});

test('collection resumes after the flock holder exits even though collect.flock remains', async () => {
  const fixture = createFixture();
  const holder = await holdLock(fixture);

  const skipped = runCollector(fixture);
  expect(skipped.status, skipped.stderr).toBe(0);
  expect(existsSync(fixture.workLog)).toBe(false);

  await releaseLock(holder);
  expect(existsSync(fixture.lockFile)).toBe(true);

  const resumed = runCollector(fixture);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(readFileSync(fixture.workLog, 'utf8')).toContain('collect:');
});

test('a permissive caller umask still yields private runtime paths', () => {
  const fixture = createFixture();

  const result = runCollector(fixture);

  expect(result.status, result.stderr).toBe(0);
  expect(permissions(fixture.stateDirectory)).toBe(0o700);
  expect(permissions(join(fixture.stateDirectory, 'logs'))).toBe(0o700);
  expect(permissions(fixture.lockFile)).toBe(0o600);
  expect(permissions(fixture.logFile)).toBe(0o600);
});

test.each([
  {
    configure: (fixture: Fixture) => {
      const target = join(fixture.rootDirectory, 'collector.env.target');
      writeFileSync(target, 'COLLECTOR_ENV_MARKER=symlinked\n', { mode: 0o600 });
      symlinkSync(target, join(fixture.stateDirectory, 'collector.env'));
    },
    name: 'a symlink',
  },
  {
    configure: (fixture: Fixture) => {
      writeFileSync(join(fixture.stateDirectory, 'collector.env'), 'COLLECTOR_ENV_MARKER=open\n', {
        mode: 0o640,
      });
    },
    name: 'group permissions',
  },
])('rejects collector.env with $name before collection', ({ configure }) => {
  const fixture = createFixture();
  mkdirSync(fixture.stateDirectory, { recursive: true });
  configure(fixture);

  const result = runCollector(fixture);
  const log = existsSync(fixture.logFile) ? readFileSync(fixture.logFile, 'utf8') : '';

  expect(result.status).not.toBe(0);
  expect(`${result.stderr}\n${log}`).toContain('collector.env');
  expect(existsSync(fixture.workLog)).toBe(false);
});

test('allows a missing collector.env', () => {
  const fixture = createFixture();

  const result = runCollector(fixture);

  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(fixture.workLog, 'utf8')).toContain('collect:');
});

test('a relative node bin stays canonical after cd and exported functions cannot win', () => {
  const fixture = createFixture();
  const environment: NodeJS.ProcessEnv = {
    ...fixture.environment,
    'BASH_FUNC_node%%':
      `() { printf 'node-function\\n' >> "$STUB_FUNCTION_LOG"; printf 'linux\\n'; }`,
    'BASH_FUNC_npm%%':
      `() { printf 'npm-function\\n' >> "$STUB_FUNCTION_LOG"; return 86; }`,
    HOUSING_NODE_BIN_DIR: 'toolchain',
  };

  const result = runCollector(fixture, environment);

  expect(result.status, `${result.stderr}\n${readFileSync(fixture.logFile, 'utf8')}`).toBe(0);
  expect(existsSync(fixture.functionLog)).toBe(false);
  expect(readFileSync(fixture.workLog, 'utf8')).toContain(`collect:${fixture.appDirectory}`);
  expect(readFileSync(fixture.workLog, 'utf8')).toContain(`publish:${fixture.appDirectory}`);
});
