import { describe, expect, it } from 'vitest';

import { buildDashboardView } from '../src/app/dashboard-view.js';
import { createRepository } from '../src/db/repository.js';
import type { Listing, Notice } from '../src/types.js';

const makeNotice = (index: number, overrides: Partial<Notice> = {}): Notice => ({
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

const makeListing = (notice: Notice, index: number, overrides: Partial<Listing> = {}): Listing => ({
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
      interestTags: ['청년'],
    });
    repository.recordSourceRun({
      source: 'lh',
      startedAt: '2026-05-09T10:00:00.000Z',
      finishedAt: '2026-05-09T10:00:02.000Z',
      status: 'success',
      message: null,
    });

    const view = buildDashboardView({
      repository,
      selectedNoticeKey: null,
    });

    expect(view.stats.actionableCount).toBe(2);
    expect(view.stats.excludedCount).toBe(1);
    expect(view.profile?.birthYear).toBe(1995);
    expect(view.actionableNotices.map((notice) => notice.eligibility.label)).toEqual([
      '지원가능성 높음',
      '조건 확인 필요',
    ]);
    expect(view.actionableNotices[0]?.title).toBe(likelyNotice.title);
    expect(view.actionableNotices[0]?.eligibility.label).toBe('지원가능성 높음');
    expect(view.excludedNotices[0]).toMatchObject({
      title: excluded.title,
      exclusionReason: 'service_notice',
    });
    expect(view.selectedNotice?.notice.title).toBe(likelyNotice.title);
    expect(view.selectedNotice?.listings).toHaveLength(1);
    expect(view.sourceRuns[0]).toMatchObject({
      source: 'lh',
      status: 'success',
    });
  });
});
