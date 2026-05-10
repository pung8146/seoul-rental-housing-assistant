import { describe, expect, it } from 'vitest';
import { renderDashboardHtml } from '../src/app/dashboard-render.js';
const view = {
    stats: {
        actionableCount: 1,
        excludedCount: 1,
        sourceRunCount: 1,
    },
    actionableNotices: [
        {
            source: 'lh',
            sourceId: 'notice-1',
            noticeKey: 'lh:notice-1',
            title: '서울 청년 임대주택 입주자 모집공고',
            stableKey: 'notice:1',
            changeHash: 'hash',
            status: '공고중',
            region: '서울',
            targetTags: ['청년'],
            postedAt: '2026-05-09',
            applicationStartAt: null,
            applicationEndAt: '2026-05-20',
            sourceUrl: 'https://example.com/notice',
            metadata: {},
        },
    ],
    excludedNotices: [
        {
            source: 'sh',
            sourceId: 'notice-2',
            noticeKey: 'sh:notice-2',
            title: '전산작업에 따른 서비스 이용 안내',
            stableKey: 'notice:2',
            changeHash: 'hash',
            status: 'posted',
            region: '서울',
            targetTags: [],
            postedAt: '2026-05-09',
            applicationStartAt: null,
            applicationEndAt: null,
            sourceUrl: 'https://example.com/excluded',
            metadata: {},
            exclusionReason: 'service_notice',
        },
    ],
    selectedNotice: {
        notice: {
            source: 'lh',
            sourceId: 'notice-1',
            noticeKey: 'lh:notice-1',
            title: '서울 청년 임대주택 입주자 모집공고',
            stableKey: 'notice:1',
            changeHash: 'hash',
            status: '공고중',
            region: '서울',
            targetTags: ['청년'],
            postedAt: '2026-05-09',
            applicationStartAt: null,
            applicationEndAt: '2026-05-20',
            sourceUrl: 'https://example.com/notice',
            metadata: { attachments: [{ title: '공고문.pdf', url: 'https://example.com/file.pdf' }] },
        },
        listings: [
            {
                source: 'lh',
                noticeSourceId: 'notice-1',
                title: '16형 대학생',
                stableKey: 'listing:1',
                changeHash: 'hash',
                supplyType: '행복주택',
                region: '서울',
                targetTags: ['청년'],
                deposit: 10000000,
                monthlyRent: 250000,
                floorAreaM2: 29.5,
                status: '공급중',
                metadata: {},
            },
        ],
    },
    sourceRuns: [
        {
            source: 'lh',
            startedAt: '2026-05-09T10:00:00.000Z',
            finishedAt: '2026-05-09T10:00:02.000Z',
            status: 'success',
            message: null,
        },
    ],
};
describe('renderDashboardHtml', () => {
    it('renders dashboard sections and escapes HTML', () => {
        const html = renderDashboardHtml({
            ...view,
            actionableNotices: [
                {
                    ...view.actionableNotices[0],
                    title: '<script>alert(1)</script> 입주자 모집공고',
                },
            ],
        });
        expect(html).toContain('관리 대시보드');
        expect(html).toContain('지원 가능 공고');
        expect(html).toContain('제외된 글');
        expect(html).toContain('수집 상태');
        expect(html).toContain('16형 대학생');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
    });
});
