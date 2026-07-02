import { readFileSync } from 'node:fs';
import { createDefaultAdapters } from '../src/app/run-collect.js';
import { describe, it, expect } from 'vitest';
describe('project bootstrap', () => {
    it('runs vitest', () => {
        expect(true).toBe(true);
    });
    it('documents the Telegram-ready answer command', () => {
        const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
        const readme = readFileSync('README.md', 'utf8');
        expect(packageJson.scripts.answer).toBe('tsx src/app/run-assistant.ts');
        expect(readme).toContain('npm run answer -- 최신 공고 확인해줘');
    });
    it('provides a stable OpenClaw wrapper script', () => {
        const script = readFileSync('scripts/openclaw-answer.sh', 'utf8');
        expect(script).toContain('RENTAL_HOUSING_DB_PATH');
        expect(script).toContain('RENTAL_HOUSING_CONTEXT_PATH');
        expect(script).toContain('npm run answer -- "$@"');
    });
    it('adds ApplyHome to default collection only when configured', () => {
        const previousKey = process.env.CHUNGYAK_HOME_SERVICE_KEY;
        try {
            delete process.env.CHUNGYAK_HOME_SERVICE_KEY;
            expect(createDefaultAdapters().map((adapter) => adapter.source)).not.toContain('applyhome');
            process.env.CHUNGYAK_HOME_SERVICE_KEY = 'test-key';
            expect(createDefaultAdapters().map((adapter) => adapter.source)).toContain('applyhome');
        }
        finally {
            if (previousKey == null) {
                delete process.env.CHUNGYAK_HOME_SERVICE_KEY;
            }
            else {
                process.env.CHUNGYAK_HOME_SERVICE_KEY = previousKey;
            }
        }
    });
});
