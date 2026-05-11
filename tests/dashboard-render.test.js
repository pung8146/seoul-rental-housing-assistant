import { describe, expect, it } from 'vitest';
import { renderDashboardHtml } from '../src/app/dashboard-render.js';
const view = {
    filters: {
        noticeType: 'all',
    },
    stats: {
        actionableCount: 1,
        excludedCount: 1,
        sourceRunCount: 1,
        sourceIssueCount: 1,
        lastCollectedAt: '2026-05-09T10:00:02.000Z',
    },
    profile: {
        birthYear: 1995,
        isHomeless: true,
        residenceRegion: '서울',
        householdSize: 1,
        monthlyIncome: 2500000,
        totalAssets: 50000000,
        vehicleValue: 0,
        interestTags: ['청년'],
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
            eligibility: {
                status: 'likely',
                label: '지원가능성 높음',
                reasons: ['관심 유형 일치'],
            },
        },
    ],
    noticeGroups: {
        high: [
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
                eligibility: {
                    status: 'likely',
                    label: '지원가능성 높음',
                    reasons: ['관심 유형 일치'],
                },
            },
        ],
        review: [],
        low: [],
    },
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
            eligibility: {
                status: 'missing_profile',
                label: '프로필 필요',
                reasons: ['내 정보가 아직 저장되지 않음'],
            },
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
            metadata: {
                attachments: [{ title: '공고문.pdf', url: 'https://example.com/file.pdf' }],
                primaryApplicationAttachment: {
                    title: '공고문.pdf',
                    url: 'https://example.com/file.pdf',
                },
            },
            eligibility: {
                status: 'likely',
                label: '지원가능성 높음',
                reasons: ['관심 유형 일치'],
            },
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
    sourceStatuses: [
        {
            source: 'lh',
            runStatus: 'success',
            statusLabel: '최근 성공',
            lastFinishedAt: '2026-05-09T10:00:02.000Z',
            message: null,
            totalNotices: 1,
            actionableNotices: 1,
            excludedNotices: 0,
            detailListings: 1,
            parsedConditionNotices: 1,
            attachmentNotices: 1,
        },
        {
            source: 'sh',
            runStatus: 'failure',
            statusLabel: '최근 실패',
            lastFinishedAt: '2026-05-09T10:00:03.000Z',
            message: 'network timeout',
            totalNotices: 0,
            actionableNotices: 0,
            excludedNotices: 0,
            detailListings: 0,
            parsedConditionNotices: 0,
            attachmentNotices: 0,
        },
    ],
    sourceRuns: [
        {
            source: 'lh',
            startedAt: '2026-05-09T10:00:00.000Z',
            finishedAt: '2026-05-09T10:00:02.000Z',
            status: 'success',
            message: null,
        },
    ],
    notificationStatus: {
        totalSent: 2,
        channelCount: 1,
        lastSentAt: '2026-05-09T10:05:00.000Z',
    },
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
            noticeGroups: {
                ...view.noticeGroups,
                high: [
                    {
                        ...view.noticeGroups.high[0],
                        title: '<script>alert(1)</script> 입주자 모집공고',
                    },
                ],
            },
        });
        expect(html).toContain('관리 대시보드');
        expect(html).toContain('지원 가능 공고');
        expect(html).toContain('aria-label="공고 유형 필터"');
        expect(html).toContain('href="/?type=sale"');
        expect(html).toContain('<span class="type-badge">임대</span>');
        expect(html).toContain('<span class="type-badge">청년</span>');
        expect(html).toContain('바로 볼 공고');
        expect(html).toContain('제외된 글');
        expect(html).toContain('수집 상태');
        expect(html).toContain('<strong>1</strong><span>수집 주의</span>');
        expect(html).toContain('<strong>2026-05-09 19:00</strong><span>마지막 수집</span>');
        expect(html).toContain('<strong>2026-05-09 19:05</strong><span>마지막 알림</span>');
        expect(html).toContain('<strong>2</strong><span>알림 발송</span>');
        expect(html).toContain('<strong>1</strong><span>알림 채널</span>');
        expect(html).toContain('<span class="collection-freshness stale">오래됨</span>');
        expect(html).toContain('수집 확인 필요: SH 최근 실패');
        expect(html).toContain('기관별 수집 상태');
        expect(html).toContain('최근 성공');
        expect(html).toContain('최근 실패');
        expect(html).toContain('<td><span class="collect-badge success">성공</span></td>');
        expect(html).toContain('<td>2026-05-09 19:00</td>');
        expect(html).not.toContain('<td>2026-05-09T10:00:02.000Z</td>');
        expect(html).toContain('class="source-status success"');
        expect(html).toContain('class="source-status failure"');
        expect(html).toContain('<div class="source-status-time">2026-05-09 19:00</div>');
        expect(html).toContain('전체 1건');
        expect(html).toContain('조건 1건');
        expect(html).toContain('첨부 1건');
        expect(html).toContain('network timeout');
        expect(html).toContain('확인할 공고문');
        expect(html).toContain('href="https://example.com/file.pdf"');
        expect(html).toContain('<details class="profile-panel">');
        expect(html).toContain('<summary class="profile-summary">');
        expect(html).toContain('내 조건');
        expect(html).toContain('name="birthYear"');
        expect(html).toContain('value="1995"');
        expect(html).toContain('지원가능성 높음');
        expect(html).toContain('class="detail-quality-item review"');
        expect(html).toContain('<span>신청기간</span>');
        expect(html).toContain('<strong>일부 확인</strong>');
        expect(html).toContain('<span>공고문</span>');
        expect(html).toContain('<strong>확인됨</strong>');
        expect(html).toContain('<span>신청조건</span>');
        expect(html).toContain('<strong>확인필요</strong>');
        expect(html).toContain('<span>매물정보</span>');
        expect(html).toContain('<strong>1건</strong>');
        expect(html).toContain('<span>유형</span>');
        expect(html).toContain('신청 준비');
        expect(html).toContain('자동 신청 전에 직접 확인해야 할 항목입니다.');
        expect(html).toContain('<div class="dday">D-9</div>');
        expect(html).toContain('신청 링크');
        expect(html).toContain('공고문 확인');
        expect(html).toContain('필요 확인 항목');
        expect(html).toContain('<span>신청조건</span>');
        expect(html).toContain('<strong>확인필요</strong>');
        expect(html).toContain('<em>확인필요</em>');
        expect(html).toContain('<span>신청 링크</span>');
        expect(html).toContain('<strong>원문 연결됨</strong>');
        expect(html).toContain('16형 대학생');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
    });
    it('renders active sale filters and preserves filter links on notice rows', () => {
        const saleNotice = {
            ...view.actionableNotices[0],
            title: '남양주왕숙2 A-3BL 공공분양주택 입주자모집공고',
            targetTags: ['분양', '신혼부부'],
        };
        const html = renderDashboardHtml({
            ...view,
            filters: {
                noticeType: 'sale',
            },
            actionableNotices: [saleNotice],
            noticeGroups: {
                high: [saleNotice],
                review: [],
                low: [],
            },
            selectedNotice: {
                ...view.selectedNotice,
                notice: saleNotice,
            },
        });
        expect(html).toContain('<a class="active" href="/?type=sale">');
        expect(html).toContain('분양 1건');
        expect(html).toContain('href="/?notice=lh%3Anotice-1&amp;type=sale"');
        expect(html).toContain('<span class="type-badge">분양</span>');
        expect(html).toContain('<span class="type-badge">신혼부부</span>');
        expect(html).toContain('분양 확인 항목');
        expect(html).toContain('분양 공고는 청약 자격을 공고문 기준으로 최종 확인해야 합니다.');
        expect(html).toContain('<span>청약통장</span>');
        expect(html).toContain('<strong>가입기간/납입횟수 확인</strong>');
        expect(html).toContain('<span>무주택세대</span>');
        expect(html).toContain('<span>거주지역</span>');
        expect(html).toContain('<span>특별공급</span>');
        expect(html).toContain('<strong>신혼부부 조건 확인</strong>');
    });
    it('does not render sale-specific preparation for rental notices', () => {
        const html = renderDashboardHtml(view);
        expect(html).not.toContain('분양 확인 항목');
        expect(html).not.toContain('<span>청약통장</span>');
    });
    it('opens the profile filter by default when no profile is saved', () => {
        const html = renderDashboardHtml({
            ...view,
            profile: null,
        });
        expect(html).toContain('<details class="profile-panel" open>');
        expect(html).toContain('미입력');
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
            noticeGroups: {
                high: [],
                review: [],
                low: [
                    {
                        ...view.actionableNotices[0],
                        title: '서울가좌 행복주택 예비입주자 모집공고(2026.05.07) 1일전',
                        postedAt: '2026-05-08',
                        applicationEndAt: '2020-01-01',
                    },
                ],
            },
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
            noticeGroups: {
                high: [
                    {
                        ...view.actionableNotices[0],
                        title: '신청 가능한 공고 입주자 모집공고',
                        applicationStartAt: '2020-01-01',
                        applicationEndAt: '2999-01-01',
                    },
                ],
                review: [
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
                low: [],
            },
        });
        expect(html).toContain('<span class="status-badge available">신청가능</span>');
        expect(html).toContain('<span class="status-badge upcoming">접수예정</span>');
        expect(html).toContain('<span class="status-badge posted">공고중</span>');
        expect(html).toContain('<span class="status-badge unknown">확인필요</span>');
        expect(html).not.toContain('>진행</span>');
    });
    it('highlights partial source collection status as attention-needed', () => {
        const html = renderDashboardHtml({
            ...view,
            sourceStatuses: [
                {
                    ...view.sourceStatuses[0],
                    runStatus: 'partial',
                    statusLabel: '최근 일부 실패',
                    message: '상세 수집 실패 2건',
                },
            ],
        });
        expect(html).toContain('class="source-status partial"');
        expect(html).toContain('class="collect-badge partial"');
        expect(html).toContain('최근 일부 실패');
        expect(html).toContain('상세 수집 실패 2건');
    });
    it('does not render a source issue summary when every source is healthy', () => {
        const html = renderDashboardHtml({
            ...view,
            stats: {
                ...view.stats,
                sourceIssueCount: 0,
            },
            sourceStatuses: [
                {
                    ...view.sourceStatuses[0],
                    runStatus: 'success',
                    statusLabel: '최근 성공',
                    message: null,
                },
            ],
        });
        expect(html).not.toContain('수집 확인 필요:');
    });
    it('marks recent collection as fresh', () => {
        const html = renderDashboardHtml({
            ...view,
            stats: {
                ...view.stats,
                lastCollectedAt: new Date().toISOString(),
            },
        });
        expect(html).toContain('<span class="collection-freshness fresh">최신</span>');
    });
    it('renders source run history statuses as Korean badges', () => {
        const html = renderDashboardHtml({
            ...view,
            sourceRuns: [
                {
                    source: 'lh',
                    startedAt: '2026-05-09T10:00:00.000Z',
                    finishedAt: '2026-05-09T10:00:02.000Z',
                    status: 'partial',
                    message: '상세 수집 실패 1건',
                },
                {
                    source: 'sh',
                    startedAt: '2026-05-09T10:00:00.000Z',
                    finishedAt: '2026-05-09T10:00:03.000Z',
                    status: 'failure',
                    message: 'network timeout',
                },
            ],
        });
        expect(html).toContain('<td><span class="collect-badge partial">일부 실패</span></td>');
        expect(html).toContain('<td><span class="collect-badge failure">실패</span></td>');
        expect(html).not.toContain('<td>partial</td>');
        expect(html).not.toContain('<td>failure</td>');
    });
});
