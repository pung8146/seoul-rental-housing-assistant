import { describe, expect, it } from 'vitest';
import { buildDashboardView } from '../src/app/dashboard-view.js';
import { createRepository } from '../src/db/repository.js';
const makeNotice = (index, overrides = {}) => ({
    source: 'lh',
    sourceId: `notice-${index}`,
    title: `서울 청년 임대주택 ${index} 입주자 모집공고`,
    stableKey: `notice:${index}`,
    changeHash: `notice-hash-${index}`,
    status: '공고중',
    region: '서울',
    targetTags: ['청년'],
    postedAt: `2026-05-0${index}`,
    applicationStartAt: null,
    applicationEndAt: null,
    sourceUrl: `https://example.com/notices/${index}`,
    metadata: {},
    ...overrides,
});
const makeListing = (notice, index, overrides = {}) => ({
    source: notice.source,
    noticeSourceId: notice.sourceId,
    title: `${notice.title} ${index}호`,
    stableKey: `listing:${notice.sourceId}:${index}`,
    changeHash: `listing-hash:${notice.sourceId}:${index}`,
    supplyType: '행복주택',
    region: notice.region,
    targetTags: notice.targetTags,
    deposit: 10000000,
    monthlyRent: 250000,
    floorAreaM2: 29.5,
    status: '공급중',
    metadata: {},
    ...overrides,
});
describe('buildDashboardView', () => {
    it('separates actionable and excluded notices with selected details', () => {
        const repository = createRepository(':memory:');
        const reviewNotice = makeNotice(1, { postedAt: '2026-05-09' });
        const likelyNotice = makeNotice(3, {
            postedAt: '2026-05-01',
            metadata: {
                eligibilityRequirements: {
                    minAge: 19,
                    maxAge: 39,
                    requiresHomeless: true,
                    maxMonthlyIncome: 3589957,
                    maxTotalAssets: 345000000,
                    maxVehicleValue: 37080000,
                },
            },
        });
        const excluded = makeNotice(2, {
            title: '전산작업에 따른 서비스(신한인증서) 이용 안내',
            source: 'sh',
        });
        repository.upsertNotice(reviewNotice);
        repository.upsertNotice(likelyNotice);
        repository.upsertNotice(excluded);
        repository.upsertListing(makeListing(likelyNotice, 1));
        repository.savePersonalProfile({
            birthYear: 1995,
            isHomeless: true,
            residenceRegion: '서울',
            householdSize: 1,
            monthlyIncome: 2500000,
            totalAssets: 50000000,
            vehicleValue: 0,
            subscriptionAccountMonths: 36,
            subscriptionPaymentCount: 24,
            interestTags: ['청년'],
        });
        repository.recordSourceRun({
            source: 'lh',
            startedAt: '2026-05-09T10:00:00.000Z',
            finishedAt: '2026-05-09T10:00:02.000Z',
            status: 'success',
            message: null,
        });
        repository.recordNotification('telegram:123', 'payload-1', '2026-05-09T10:05:00.000Z');
        repository.recordNotification('telegram:456', 'payload-1', '2026-05-09T10:06:00.000Z');
        const view = buildDashboardView({
            repository,
            selectedNoticeKey: null,
        });
        expect(view.stats.actionableCount).toBe(2);
        expect(view.stats.excludedCount).toBe(1);
        expect(view.stats.sourceIssueCount).toBe(1);
        expect(view.stats.lastCollectedAt).toBe('2026-05-09T10:00:02.000Z');
        expect(view.notificationStatus).toEqual({
            totalSent: 2,
            channelCount: 2,
            lastSentAt: '2026-05-09T10:06:00.000Z',
        });
        expect(view.profile?.birthYear).toBe(1995);
        expect(view.actionableNotices.map((notice) => notice.eligibility.label)).toEqual([
            '지원가능성 높음',
            '조건 확인 필요',
        ]);
        expect(view.actionableNotices[0]?.title).toBe(likelyNotice.title);
        expect(view.actionableNotices[0]?.eligibility.label).toBe('지원가능성 높음');
        expect(view.noticeGroups.high.map((notice) => notice.title)).toEqual([likelyNotice.title]);
        expect(view.noticeGroups.review.map((notice) => notice.title)).toEqual([reviewNotice.title]);
        expect(view.noticeGroups.low).toEqual([]);
        expect(view.excludedNotices[0]).toMatchObject({
            title: excluded.title,
            exclusionReason: 'service_notice',
        });
        expect(view.selectedNotice?.notice.title).toBe(likelyNotice.title);
        expect(view.selectedNotice?.listings).toHaveLength(1);
        expect(view.sourceStatuses).toEqual([
            {
                source: 'lh',
                runStatus: 'success',
                statusLabel: '최근 성공',
                lastFinishedAt: '2026-05-09T10:00:02.000Z',
                message: null,
                totalNotices: 2,
                actionableNotices: 2,
                excludedNotices: 0,
                detailListings: 1,
                parsedConditionNotices: 1,
                attachmentNotices: 0,
            },
            {
                source: 'sh',
                runStatus: 'unknown',
                statusLabel: '수집 기록 없음',
                lastFinishedAt: null,
                message: null,
                totalNotices: 1,
                actionableNotices: 0,
                excludedNotices: 1,
                detailListings: 0,
                parsedConditionNotices: 0,
                attachmentNotices: 0,
            },
        ]);
        expect(view.sourceRuns[0]).toMatchObject({
            source: 'lh',
            status: 'success',
        });
    });
    it('filters actionable notices by dashboard notice type', () => {
        const repository = createRepository(':memory:');
        const rentNotice = makeNotice(1, {
            title: '서울 청년 매입임대주택 입주자 모집공고',
            targetTags: ['청년', '매입임대'],
        });
        const saleNotice = makeNotice(2, {
            title: '남양주왕숙2 A-3BL 공공분양주택 입주자모집공고',
            targetTags: ['분양', '신혼부부'],
        });
        repository.upsertNotice(rentNotice);
        repository.upsertNotice(saleNotice);
        const saleView = buildDashboardView({
            repository,
            noticeTypeFilter: 'sale',
        });
        const newlywedView = buildDashboardView({
            repository,
            noticeTypeFilter: 'newlywed',
        });
        const youthView = buildDashboardView({
            repository,
            noticeTypeFilter: 'youth',
        });
        expect(saleView.filters.noticeType).toBe('sale');
        expect(saleView.actionableNotices.map((notice) => notice.title)).toEqual([saleNotice.title]);
        expect(newlywedView.actionableNotices.map((notice) => notice.title)).toEqual([saleNotice.title]);
        expect(youthView.actionableNotices.map((notice) => notice.title)).toEqual([rentNotice.title]);
    });
});
