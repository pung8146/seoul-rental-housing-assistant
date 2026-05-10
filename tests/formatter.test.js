import { describe, expect, it } from 'vitest';
import { formatDailySummary, formatNoticeDetails } from '../src/notifier/formatter.js';
const makeNotice = (overrides = {}) => ({
    source: 'lh',
    sourceId: 'notice-1',
    title: '서울 청년 임대주택 모집',
    stableKey: 'notice:lh:notice-1',
    changeHash: 'notice-hash-1',
    status: '모집중',
    region: '서울',
    targetTags: ['청년', '신혼부부'],
    postedAt: '2026-05-07',
    applicationStartAt: '2026-05-10',
    applicationEndAt: '2026-05-20',
    sourceUrl: 'https://example.com/notices/1',
    metadata: {},
    ...overrides,
});
const makeListing = (overrides = {}) => ({
    source: 'lh',
    noticeSourceId: 'notice-1',
    title: '101동 201호',
    stableKey: 'listing:lh:notice-1:101-201',
    changeHash: 'listing-hash-1',
    supplyType: '행복주택',
    region: '서울',
    targetTags: ['청년'],
    deposit: 10000000,
    monthlyRent: 250000,
    floorAreaM2: 39.8,
    status: '공급중',
    metadata: {},
    ...overrides,
});
const makeEvent = (overrides = {}) => ({
    type: 'new_notice',
    notice: makeNotice(),
    listing: null,
    previousNotice: null,
    previousListing: null,
    occurredAt: '2026-05-07T08:00:00.000Z',
    ...overrides,
});
describe('formatDailySummary', () => {
    it('includes title, region, targets, date, listing count, and link for new notices', () => {
        const summary = formatDailySummary([
            makeEvent({
                type: 'new_notice',
                notice: makeNotice(),
            }),
        ]);
        expect(summary).toContain('서울 청년 임대주택 모집');
        expect(summary).toContain('서울');
        expect(summary).toContain('청년, 신혼부부');
        expect(summary).toContain('2026-05-07');
        expect(summary).toContain('매물 1건');
        expect(summary).toContain('https://example.com/notices/1');
    });
    it('includes changed fields for listing_changed events', () => {
        const summary = formatDailySummary([
            makeEvent({
                type: 'listing_changed',
                notice: makeNotice(),
                listing: makeListing({ changeHash: 'listing-hash-2', monthlyRent: 270000, status: '마감임박' }),
                previousNotice: makeNotice(),
                previousListing: makeListing(),
            }),
        ]);
        expect(summary).toContain('변경');
        expect(summary).toContain('월세: 250,000원 → 270,000원');
        expect(summary).toContain('상태: 공급중 → 마감임박');
    });
    it('groups multiple listing events for the same notice into one summary block', () => {
        const summary = formatDailySummary([
            makeEvent({
                type: 'listing_changed',
                notice: makeNotice(),
                listing: makeListing({ changeHash: 'listing-hash-2', title: '101동 201호', monthlyRent: 270000 }),
                previousNotice: makeNotice(),
                previousListing: makeListing({ title: '101동 201호' }),
            }),
            makeEvent({
                type: 'listing_changed',
                notice: makeNotice(),
                listing: makeListing({
                    stableKey: 'listing:lh:notice-1:101-202',
                    changeHash: 'listing-hash-3',
                    title: '101동 202호',
                    monthlyRent: 280000,
                }),
                previousNotice: makeNotice(),
                previousListing: makeListing({
                    stableKey: 'listing:lh:notice-1:101-202',
                    title: '101동 202호',
                }),
            }),
        ]);
        expect(summary.match(/변경 · 서울 청년 임대주택 모집/g)).toHaveLength(1);
        expect(summary).toContain('매물 2건');
        expect(summary).toContain('월세: 250,000원 → 270,000원');
    });
    it('adds a source failure section when some sources fail', () => {
        const summary = formatDailySummary([makeEvent()], [
            { source: 'lh', message: 'network timeout' },
            { source: 'sh', message: null },
        ]);
        expect(summary).toContain('수집 실패:');
        expect(summary).toContain('lh: network timeout');
        expect(summary).toContain('sh: 원인 미상');
    });
    it('summarizes repeated detail collection failures by source', () => {
        const summary = formatDailySummary([], [
            { source: 'lh', message: '상세 수집 실패 notice-1: timeout' },
            { source: 'lh', message: '상세 수집 실패 notice-2: timeout' },
            { source: 'sh', message: '상세 수집 실패 notice-3: timeout' },
            { source: 'sh', message: 'network timeout' },
        ]);
        expect(summary).toContain('수집 실패:');
        expect(summary).toContain('lh: 상세 수집 실패 2건');
        expect(summary).toContain('sh: 상세 수집 실패 1건');
        expect(summary).toContain('sh: network timeout');
        expect(summary).not.toContain('notice-1');
        expect(summary).not.toContain('notice-2');
    });
});
describe('formatNoticeDetails', () => {
    it('formats expandable notice details separately from the default summary', () => {
        const details = formatNoticeDetails(makeNotice({
            metadata: {
                primaryApplicationAttachment: {
                    title: '공고문.pdf',
                    url: 'https://example.com/file.pdf',
                },
            },
        }), [
            makeListing(),
            makeListing({
                title: '101동 202호',
                stableKey: 'listing:lh:notice-1:101-202',
                changeHash: 'listing-hash-2',
                deposit: 12000000,
                monthlyRent: 280000,
            }),
        ]);
        expect(details).toContain('서울 청년 임대주택 모집');
        expect(details).toContain('확인할 공고문: 공고문.pdf');
        expect(details).toContain('https://example.com/file.pdf');
        expect(details).toContain('1. 101동 201호');
        expect(details).toContain('2. 101동 202호');
        expect(details).toContain('보증금 10,000,000원 / 월세 250,000원');
        expect(details).toContain('보증금 12,000,000원 / 월세 280,000원');
    });
});
