import { afterEach, describe, expect, it } from 'vitest';
const previousExitCode = process.exitCode;
afterEach(() => {
    process.exitCode = previousExitCode;
});
describe('collect and notify process outcome', () => {
    it('marks the process failed when no collection source succeeds', async () => {
        const notifyModule = await import('../src/app/run-collect-and-notify.js');
        expect(notifyModule).toHaveProperty('markCollectionProcessOutcome');
        const markCollectionProcessOutcome = notifyModule.markCollectionProcessOutcome;
        process.exitCode = undefined;
        expect(() => markCollectionProcessOutcome(0)).not.toThrow();
        expect(process.exitCode).toBe(1);
    });
});
