import { describe, expect, it } from 'vitest';
import { createLhAdapter } from '../src/adapters/lh.js';
import { createRepository } from '../src/db/repository.js';
import { createDefaultAdapters, formatCollectResult, runCollect } from '../src/app/run-collect.js';
const makeNotice = (overrides = {}) => ({
    source: 'lh',
    sourceId: 'notice-1',
    title: '서울 청년 임대주택 모집',
    stableKey: 'notice:lh:notice-1',
    changeHash: 'notice-hash-1',
    status: 'open',
    region: '서울',
    targetTags: ['청년'],
    postedAt: '2026-05-07',
    applicationStartAt: null,
    applicationEndAt: null,
    sourceUrl: 'https://example.com/notices/1',
    metadata: { round: 1 },
    ...overrides,
});
const makeListing = (overrides = {}) => ({
    source: 'lh',
    noticeSourceId: 'notice-1',
    title: '행복주택 101동 201호',
    stableKey: 'listing:lh:notice-1:101-201',
    changeHash: 'listing-hash-1',
    supplyType: '행복주택',
    region: '서울',
    targetTags: ['청년'],
    deposit: 10000000,
    monthlyRent: 250000,
    floorAreaM2: 39.8,
    status: 'available',
    metadata: { building: '101동', unit: '201호' },
    ...overrides,
});
describe('sqlite repository', () => {
    it('uses LH and SH as the default collection adapters', () => {
        expect(createDefaultAdapters().map((adapter) => adapter.source)).toEqual(['lh', 'sh']);
    });
    it('formats collection results as a Telegram-ready summary', () => {
        const notice = makeNotice();
        const text = formatCollectResult({
            events: [
                {
                    type: 'new_notice',
                    notice,
                    listing: null,
                    previousNotice: null,
                    previousListing: null,
                    occurredAt: '2026-05-07T09:00:00.000Z',
                },
            ],
            failures: [],
        });
        expect(text).toContain('신규');
        expect(text).toContain('서울 청년 임대주택 모집');
        expect(text).toContain('https://example.com/notices/1');
    });
    it('formats empty collection results as a Telegram-safe message', () => {
        expect(formatCollectResult({ events: [], failures: [] })).toBe('새 공고/변경 없음');
    });
    it('initializes schema successfully', () => {
        const repository = createRepository(':memory:');
        expect(repository.queryNotices({})).toEqual([]);
    });
    it('inserts and fetches notices and listings', () => {
        const repository = createRepository(':memory:');
        const notice = makeNotice();
        const listing = makeListing();
        repository.upsertNotice(notice);
        repository.upsertListing(listing);
        repository.insertListingSnapshot(listing);
        expect(repository.findNoticeBySourceId('lh', 'notice-1')).toMatchObject({
            title: notice.title,
            stableKey: notice.stableKey,
            metadata: notice.metadata,
        });
        expect(repository.findListingByStableKey(listing.stableKey)).toMatchObject({
            title: listing.title,
            changeHash: listing.changeHash,
            metadata: listing.metadata,
        });
        expect(repository.queryNotices({ source: 'lh' })).toHaveLength(1);
        expect(repository.queryListingsByNotice('lh', 'notice-1')).toMatchObject([
            expect.objectContaining({ stableKey: listing.stableKey }),
        ]);
    });
    it('suppresses duplicate notification payload hashes', () => {
        const repository = createRepository(':memory:');
        expect(repository.hasNotification('daily-summary', 'payload-hash-1')).toBe(false);
        repository.recordNotification('daily-summary', 'payload-hash-1', '2026-05-07T09:00:00.000Z');
        expect(repository.hasNotification('daily-summary', 'payload-hash-1')).toBe(true);
        expect(repository.hasNotification('daily-summary', 'payload-hash-2')).toBe(false);
    });
    it('records source runs including failure messages', () => {
        const repository = createRepository(':memory:');
        repository.recordSourceRun({
            source: 'lh',
            startedAt: '2026-05-07T09:00:00.000Z',
            finishedAt: '2026-05-07T09:05:00.000Z',
            status: 'failure',
            message: 'network timeout',
        });
        expect(repository.listSourceRuns()).toMatchObject([
            {
                source: 'lh',
                status: 'failure',
                message: 'network timeout',
            },
        ]);
    });
    it('runs collection across adapters, persists output, emits events, and keeps partial failures', async () => {
        const repository = createRepository(':memory:');
        const primaryAdapter = {
            source: 'lh',
            async fetchNotices() {
                return [
                    {
                        sourceId: 'notice-1',
                        title: '서울 청년 임대주택 모집',
                        region: '서울특별시',
                        targetTags: ['청년'],
                        postedAt: '2026-05-07',
                        sourceUrl: 'https://example.com/notices/1',
                        listings: [
                            {
                                title: '101동 201호',
                                supplyType: '행복주택',
                                region: '서울특별시',
                                targetTags: ['청년'],
                                deposit: 10000000,
                                monthlyRent: 250000,
                                floorAreaM2: 39.8,
                                status: 'available',
                                metadata: { unit: '201호' },
                            },
                        ],
                    },
                ];
            },
        };
        const failingAdapter = {
            source: 'sh',
            async fetchNotices() {
                throw new Error('adapter offline');
            },
        };
        const firstRun = await runCollect({
            adapters: [primaryAdapter, failingAdapter],
            repository,
        });
        expect(firstRun.events).toHaveLength(1);
        expect(firstRun.events[0]).toMatchObject({
            type: 'new_notice',
            notice: expect.objectContaining({ source: 'lh', sourceId: 'notice-1' }),
            listing: null,
        });
        expect(firstRun.failures).toEqual([{ source: 'sh', message: 'adapter offline' }]);
        expect(repository.findNoticeBySourceId('lh', 'notice-1')).toMatchObject({
            title: '서울 청년 임대주택 모집',
            region: '서울',
        });
        expect(repository.queryListingsByNotice('lh', 'notice-1')).toHaveLength(1);
        expect(repository.listListingSnapshots()).toHaveLength(0);
        expect(repository.listSourceRuns()).toMatchObject([
            expect.objectContaining({ source: 'lh', status: 'success', message: null }),
            expect.objectContaining({ source: 'sh', status: 'failure', message: 'adapter offline' }),
        ]);
        const changedAdapter = {
            source: 'lh',
            async fetchNotices() {
                return [
                    {
                        sourceId: 'notice-1',
                        title: '서울 청년 임대주택 모집',
                        region: '서울특별시',
                        targetTags: ['청년'],
                        postedAt: '2026-05-07',
                        sourceUrl: 'https://example.com/notices/1',
                        listings: [
                            {
                                title: '101동 201호',
                                supplyType: '행복주택',
                                region: '서울특별시',
                                targetTags: ['청년'],
                                deposit: 10000000,
                                monthlyRent: 270000,
                                floorAreaM2: 39.8,
                                status: 'available',
                                metadata: { unit: '201호' },
                            },
                        ],
                    },
                ];
            },
        };
        const secondRun = await runCollect({
            adapters: [changedAdapter],
            repository,
        });
        expect(secondRun.failures).toEqual([]);
        expect(secondRun.events).toHaveLength(1);
        expect(secondRun.events[0]).toMatchObject({
            type: 'listing_changed',
            listing: expect.objectContaining({ monthlyRent: 270000 }),
            previousListing: expect.objectContaining({ monthlyRent: 250000 }),
        });
        expect(repository.listListingSnapshots()).toHaveLength(1);
        expect(repository.listListingSnapshots()[0]).toMatchObject({
            listingStableKey: secondRun.events[0]?.listing?.stableKey,
            changeHash: secondRun.events[0]?.listing?.changeHash,
        });
    });
    it('prefers adapter detail output when a notice has detailed listings', async () => {
        const repository = createRepository(':memory:');
        const adapter = {
            source: 'lh',
            async fetchNotices() {
                return [
                    {
                        sourceId: 'notice-1',
                        title: '서울 청년 임대주택 모집',
                        region: '서울',
                        targetTags: ['청년'],
                        postedAt: '2026-05-07',
                        sourceUrl: 'https://example.com/notices/1',
                        listings: [
                            {
                                title: '목록 placeholder',
                                supplyType: '행복주택',
                                region: '서울',
                                status: '공급중',
                            },
                        ],
                    },
                ];
            },
            async fetchNoticeDetails(id) {
                return {
                    sourceId: id,
                    title: '서울 청년 임대주택 모집',
                    region: '서울',
                    targetTags: ['청년'],
                    postedAt: '2026-05-07',
                    sourceUrl: 'https://example.com/notices/1',
                    listings: [
                        {
                            title: '101동 201호',
                            supplyType: '행복주택',
                            region: '서울',
                            deposit: '10,000,000',
                            monthlyRent: '250,000',
                            floorAreaM2: '39.8',
                            status: '공급중',
                        },
                    ],
                };
            },
        };
        await runCollect({ repository, adapters: [adapter] });
        expect(repository.queryListingsByNotice('lh', 'notice-1')).toMatchObject([
            expect.objectContaining({
                title: '101동 201호',
                deposit: 10000000,
                monthlyRent: 250000,
                floorAreaM2: 39.8,
            }),
        ]);
    });
    it('fetches notice details with limited parallelism', async () => {
        const repository = createRepository(':memory:');
        let active = 0;
        let maxActive = 0;
        const adapter = {
            source: 'lh',
            async fetchNotices() {
                return Array.from({ length: 8 }, (_, index) => ({
                    sourceId: `notice-${index + 1}`,
                    title: `공고 ${index + 1}`,
                    region: '서울',
                    listings: [{ title: `목록 ${index + 1}` }],
                }));
            },
            async fetchNoticeDetails(id) {
                active += 1;
                maxActive = Math.max(maxActive, active);
                await new Promise((resolve) => setTimeout(resolve, 10));
                active -= 1;
                return {
                    sourceId: id,
                    title: id,
                    region: '서울',
                    listings: [{ title: `상세 ${id}` }],
                };
            },
        };
        await runCollect({ repository, adapters: [adapter] });
        expect(maxActive).toBeGreaterThan(1);
        expect(maxActive).toBeLessThanOrEqual(5);
    });
    it('collects live LH adapter notices without missing downstream-required fields', async () => {
        const repository = createRepository(':memory:');
        const html = `
      <table>
        <tbody>
          <tr>
            <td>1</td>
            <td>
              <button class="wrtancInfoBtn" data-id1="202605070001" data-id2="01">상반기 청년 매입임대주택 모집</button>
            </td>
            <td>매입임대</td>
            <td>서울특별시</td>
            <td>2026.05.07</td>
            <td>2026.05.20</td>
            <td>접수중</td>
          </tr>
        </tbody>
      </table>
    `;
        const adapter = createLhAdapter({
            fetch: async () => new Response(html, {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }),
        });
        const result = await runCollect({ adapters: [adapter], repository });
        expect(result.failures).toEqual([]);
        expect(result.events).toHaveLength(1);
        expect(result.events[0]).toMatchObject({
            type: 'new_notice',
            notice: expect.objectContaining({
                source: 'lh',
                sourceId: '202605070001',
                title: '상반기 청년 매입임대주택 모집',
                region: '서울',
                postedAt: '2026-05-07',
                applicationEndAt: '2026-05-20',
                metadata: expect.objectContaining({
                    provider: 'LH',
                    rawIds: { dataId1: '202605070001', dataId2: '01' },
                }),
            }),
            listing: null,
        });
        expect(repository.findNoticeBySourceId('lh', '202605070001')).toMatchObject({
            title: '상반기 청년 매입임대주택 모집',
            region: '서울',
            postedAt: '2026-05-07',
            applicationEndAt: '2026-05-20',
        });
        expect(repository.queryListingsByNotice('lh', '202605070001')).toMatchObject([
            expect.objectContaining({
                title: '상반기 청년 매입임대주택 모집',
                supplyType: '매입임대',
                region: '서울',
                status: '접수중',
            }),
        ]);
    });
});
