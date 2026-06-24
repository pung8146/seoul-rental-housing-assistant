import { describe, expect, it } from 'vitest';
import { dedupeNoticesForDisplay } from '../src/domain/notice-dedupe.js';
const makeNotice = (overrides) => ({
    source: 'sh',
    sourceId: '306011',
    title: '2026년 가양동 육아 협동조합주택(이음채) 잔여세대 입주자 모집공고(2026. 6. 23.)',
    stableKey: 'notice:sh:306011',
    changeHash: 'hash',
    status: 'posted',
    region: '서울',
    targetTags: ['도시형생활주택'],
    postedAt: '2026-06-23',
    applicationStartAt: null,
    applicationEndAt: null,
    sourceUrl: 'https://example.com',
    metadata: {},
    ...overrides,
});
describe('dedupeNoticesForDisplay', () => {
    it('prefers SH over Seoul Housing portal for the same SH seq', () => {
        const notices = dedupeNoticesForDisplay([
            makeNotice({
                source: 'seoul-housing',
                stableKey: 'notice:seoul-housing:306011',
                metadata: { provider: '서울주거포털' },
            }),
            makeNotice({
                source: 'sh',
                stableKey: 'notice:sh:306011',
                metadata: { provider: 'SH', attachments: [{ title: '공고문.pdf', url: 'https://example.com/file.pdf' }] },
            }),
        ]);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            source: 'sh',
            sourceId: '306011',
            metadata: { provider: 'SH' },
        });
    });
    it('keeps Seoul Housing portal notices when SH does not have the same seq', () => {
        const notices = dedupeNoticesForDisplay([
            makeNotice({
                source: 'seoul-housing',
                sourceId: '306011',
                stableKey: 'notice:seoul-housing:306011',
            }),
            makeNotice({
                source: 'sh',
                sourceId: 'other',
                stableKey: 'notice:sh:other',
                title: '다른 공고 입주자 모집공고',
            }),
        ]);
        expect(notices.map((notice) => `${notice.source}:${notice.sourceId}`)).toEqual([
            'seoul-housing:306011',
            'sh:other',
        ]);
    });
});
