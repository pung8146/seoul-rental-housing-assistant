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
    it('shows posted dates instead of relative day labels and distinguishes closed notices', () => {
        const html = renderDashboardHtml({
            ...view,
            actionableNotices: [
                {
                    ...view.actionableNotices[0],
                    title: '서울가좌 행복주택 예비입주자 모집공고(2026.05.07) 1일전',
                    postedAt: '2026-05-08',
                    applicationEndAt: '2020-01-01',
                },
            ],
            selectedNotice: {
                notice: {
                    ...view.selectedNotice.notice,
                    title: '서울가좌 행복주택 예비입주자 모집공고(2026.05.07) 1일전',
                    postedAt: '2026-05-08',
                    applicationEndAt: '2020-01-01',
                },
                listings: [
                    {
                        ...view.selectedNotice.listings[0],
                        title: '서울가좌 행복주택 예비입주자 모집공고(2026.05.07) 1일전 16형 대학생',
                    },
                ],
            },
        });
        expect(html).toContain('등록일 2026-05-08');
        expect(html).toContain('<span class="status-badge closed">마감</span>');
        expect(html).toContain('서울가좌 행복주택 예비입주자 모집공고(2026.05.07)');
        expect(html).toContain('서울가좌 행복주택 예비입주자 모집공고(2026.05.07) 16형 대학생');
        expect(html).not.toContain('1일전');
    });
    it('uses precise application status badges instead of generic progress labels', () => {
        const html = renderDashboardHtml({
            ...view,
            actionableNotices: [
                {
                    ...view.actionableNotices[0],
                    title: '신청 가능한 공고 입주자 모집공고',
                    applicationStartAt: '2020-01-01',
                    applicationEndAt: '2999-01-01',
                },
                {
                    ...view.actionableNotices[0],
                    sourceId: 'notice-2',
                    noticeKey: 'lh:notice-2',
                    title: '접수 예정 공고 입주자 모집공고',
                    applicationStartAt: '2999-01-01',
                    applicationEndAt: '2999-02-01',
                },
                {
                    ...view.actionableNotices[0],
                    sourceId: 'notice-3',
                    noticeKey: 'lh:notice-3',
                    title: '날짜 부족 공고 입주자 모집공고',
                    status: '공고중',
                    applicationStartAt: null,
                    applicationEndAt: null,
                },
                {
                    ...view.actionableNotices[0],
                    sourceId: 'notice-4',
                    noticeKey: 'lh:notice-4',
                    title: '확인 필요한 공고 입주자 모집공고',
                    status: null,
                    applicationStartAt: null,
                    applicationEndAt: null,
                },
            ],
        });
        expect(html).toContain('<span class="status-badge available">신청가능</span>');
        expect(html).toContain('<span class="status-badge upcoming">접수예정</span>');
        expect(html).toContain('<span class="status-badge posted">공고중</span>');
        expect(html).toContain('<span class="status-badge unknown">확인필요</span>');
        expect(html).not.toContain('>진행</span>');
    });
});
