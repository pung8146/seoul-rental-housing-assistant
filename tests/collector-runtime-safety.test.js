import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceCollectScript = join(projectRoot, 'scripts', 'collect-and-notify.sh');
const temporaryDirectories = [];
afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { force: true, recursive: true });
    }
});
function writeExecutable(path, contents) {
    writeFileSync(path, contents, { mode: 0o700 });
}
function createFixture(label = 'primary') {
    const root = mkdtempSync(join(tmpdir(), `housing-runtime-${label}-`));
    temporaryDirectories.push(root);
    const invocationDirectory = join(root, 'invocation');
    const scriptsDirectory = join(root, 'scripts');
    const appDirectory = join(invocationDirectory, 'app');
    const stateDirectory = join(invocationDirectory, 'runtime');
    const dashboardDirectory = join(invocationDirectory, 'dashboard');
    const nodeBinDirectory = join(invocationDirectory, 'toolchain');
    const workLog = join(root, 'work.log');
    const script = join(scriptsDirectory, 'collect-and-notify.sh');
    mkdirSync(appDirectory, { recursive: true });
    mkdirSync(dashboardDirectory, { recursive: true });
    mkdirSync(nodeBinDirectory, { recursive: true });
    mkdirSync(scriptsDirectory, { recursive: true });
    copyFileSync(sourceCollectScript, script);
    writeExecutable(join(nodeBinDirectory, 'node'), '#!/usr/bin/env bash\n[ "${1:-}" = "-p" ] && printf "linux\\n"\n');
    writeExecutable(join(nodeBinDirectory, 'npm'), `#!/usr/bin/env bash
printf 'collect|cwd=%s|state=%s|env=%s|db=%s|context=%s|dashboard=%s|nodebin=%s\\n' \\
  "$PWD" "$RENTAL_HOUSING_STATE_DIR" "$RENTAL_HOUSING_ENV_FILE" \\
  "$RENTAL_HOUSING_DB_PATH" "$RENTAL_HOUSING_CONTEXT_PATH" "$HOUSING_DASHBOARD_DIR" \\
  "$HOUSING_NODE_BIN_DIR" >> "$STUB_WORK_LOG"
`);
    writeExecutable(join(scriptsDirectory, 'publish-public-dashboard.sh'), `#!/usr/bin/env bash
printf 'publish|cwd=%s|state=%s|env=%s|db=%s|context=%s|dashboard=%s|nodebin=%s\\n' \\
  "$PWD" "$RENTAL_HOUSING_STATE_DIR" "$RENTAL_HOUSING_ENV_FILE" \\
  "$RENTAL_HOUSING_DB_PATH" "$RENTAL_HOUSING_CONTEXT_PATH" "$HOUSING_DASHBOARD_DIR" \\
  "$HOUSING_NODE_BIN_DIR" >> "$STUB_WORK_LOG"
`);
    return {
        appDirectory,
        dashboardDirectory,
        environment: {
            HOME: root,
            HOUSING_DASHBOARD_DIR: 'dashboard',
            HOUSING_NODE_BIN_DIR: 'toolchain',
            PATH: '/usr/local/bin:/usr/bin:/bin',
            RENTAL_HOUSING_APP_DIR: 'app',
            RENTAL_HOUSING_CONTEXT_PATH: 'runtime/data/telegram-context.json',
            RENTAL_HOUSING_DB_PATH: 'runtime/data/rental-housing.db',
            RENTAL_HOUSING_ENV_FILE: 'runtime/collector.env',
            RENTAL_HOUSING_STATE_DIR: 'runtime',
            STUB_WORK_LOG: workLog,
        },
        invocationDirectory,
        lockFile: join(stateDirectory, 'collect.flock'),
        script,
        stateDirectory,
        workLog,
    };
}
function runCollector(fixture, timeout = 2_000) {
    return spawnSync('/usr/bin/bash', [fixture.script], {
        cwd: fixture.invocationDirectory,
        encoding: 'utf8',
        env: fixture.environment,
        timeout,
    });
}
test.each(['fifo', 'symlink'])('rejects a %s collect.flock promptly without starting work', (kind) => {
    const fixture = createFixture(kind);
    mkdirSync(fixture.stateDirectory, { recursive: true });
    if (kind === 'fifo') {
        const result = spawnSync('/usr/bin/mkfifo', [fixture.lockFile], { encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
    }
    else {
        const target = join(fixture.stateDirectory, 'lock-target');
        writeFileSync(target, '');
        symlinkSync(target, fixture.lockFile);
    }
    const result = runCollector(fixture, 750);
    expect(result.error?.code).not.toBe('ETIMEDOUT');
    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.workLog)).toBe(false);
});
test('allows an existing regular collect.flock', () => {
    const fixture = createFixture('regular-lock');
    mkdirSync(fixture.stateDirectory, { recursive: true });
    writeFileSync(fixture.lockFile, '');
    const result = runCollector(fixture);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.workLog, 'utf8')).toContain('collect|');
    expect(readFileSync(fixture.workLog, 'utf8')).toContain('publish|');
});
test('canonicalizes every runtime path against the invocation cwd before changing cwd', () => {
    const fixture = createFixture('canonical');
    const result = runCollector(fixture);
    expect(result.status, result.stderr).toBe(0);
    const lines = readFileSync(fixture.workLog, 'utf8').trim().split('\n');
    const expected = [
        `cwd=${fixture.appDirectory}`,
        `state=${fixture.stateDirectory}`,
        `env=${join(fixture.stateDirectory, 'collector.env')}`,
        `db=${join(fixture.stateDirectory, 'data/rental-housing.db')}`,
        `context=${join(fixture.stateDirectory, 'data/telegram-context.json')}`,
        `dashboard=${fixture.dashboardDirectory}`,
        `nodebin=${join(fixture.invocationDirectory, 'toolchain')}`,
    ];
    expect(lines).toHaveLength(2);
    for (const line of lines) {
        for (const value of expected)
            expect(line).toContain(value);
    }
    expect(existsSync(fixture.lockFile)).toBe(true);
    expect(existsSync(join(fixture.appDirectory, 'runtime', 'collect.flock'))).toBe(false);
});
test('keeps each invocation cwd lock and database in the same canonical scope', () => {
    const first = createFixture('cwd-one');
    const second = createFixture('cwd-two');
    const firstResult = runCollector(first);
    const secondResult = runCollector(second);
    expect(firstResult.status, firstResult.stderr).toBe(0);
    expect(secondResult.status, secondResult.stderr).toBe(0);
    const firstLog = readFileSync(first.workLog, 'utf8');
    const secondLog = readFileSync(second.workLog, 'utf8');
    expect(firstLog).toContain(`state=${first.stateDirectory}`);
    expect(firstLog).toContain(`db=${join(first.stateDirectory, 'data/rental-housing.db')}`);
    expect(secondLog).toContain(`state=${second.stateDirectory}`);
    expect(secondLog).toContain(`db=${join(second.stateDirectory, 'data/rental-housing.db')}`);
    expect(first.lockFile).not.toBe(second.lockFile);
    expect(existsSync(first.lockFile)).toBe(true);
    expect(existsSync(second.lockFile)).toBe(true);
});
