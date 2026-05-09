import { readFileSync } from 'node:fs';
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
});
