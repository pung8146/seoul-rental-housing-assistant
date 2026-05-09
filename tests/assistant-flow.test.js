import { describe, expect, it } from 'vitest';
import { runAssistantText } from '../src/app/run-assistant.js';
import { createRepository } from '../src/db/repository.js';
const makeNotice = (index) => ({
    source: 'lh',
    sourceId: `notice-${index}`,
    title: `서울 청년 임대주택 ${index}`,
    stableKey: `notice:${index}`,
    changeHash: `notice-hash-${index}`,
    status: '모집중',
    region: '서울',
    targetTags: ['청년'],
    postedAt: `2026-05-0${index}`,
    applicationStartAt: null,
    applicationEndAt: null,
    sourceUrl: `https://example.com/notices/${index}`,
    metadata: {},
});
describe('runAssistantText', () => {
    it('collects fresh notices when the user asks for the latest data', async () => {
        const repository = createRepository(':memory:');
        const adapters = [
            {
                source: 'lh',
                async fetchNotices() {
                    return [
                        {
                            sourceId: 'notice-1',
                            title: '서울 청년 임대주택 1',
                            region: '서울',
                            targetTags: ['청년'],
                            postedAt: '2026-05-01',
                            sourceUrl: 'https://example.com/notices/1',
                            listings: [],
                        },
                    ];
                },
            },
        ];
        const result = await runAssistantText({
            repository,
            adapters,
            input: '최신 공고 확인해줘',
        });
        expect(result.mode).toBe('collect');
        expect(result.text).toContain('신규');
        expect(result.text).toContain('서울 청년 임대주택 1');
        expect(result.text).toContain('https://example.com/notices/1');
    });
    it('answers ordinary user questions from stored notices', async () => {
        const repository = createRepository(':memory:');
        repository.upsertNotice(makeNotice(1));
        repository.upsertNotice(makeNotice(2));
        const result = await runAssistantText({
            repository,
            adapters: [],
            input: '서울만 보여줘',
        });
        expect(result.mode).toBe('query');
        expect(result.text).toContain('1. 서울 청년 임대주택 2');
        expect(result.text).toContain('2. 서울 청년 임대주택 1');
    });
});
