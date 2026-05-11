import { describe, expect, it } from 'vitest';

import { filterNotificationEvents, getNotificationPriority, groupNotificationEvents } from '../src/domain/notification-policy.js';
import { formatPrioritizedDailySummary } from '../src/notifier/formatter.js';
import type { Notice, NotificationEvent, PersonalProfile } from '../src/types.js';

const profile: PersonalProfile = {
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
};

const makeNotice = (overrides: Partial<Notice> = {}): Notice => ({
  source: 'lh',
  sourceId: 'notice-1',
  title: '서울 청년 행복주택 입주자 모집공고',
  stableKey: 'notice:1',
  changeHash: 'hash',
  status: '모집중',
  region: '서울',
  targetTags: ['청년'],
  postedAt: '2026-05-09',
  applicationStartAt: '2026-05-10',
  applicationEndAt: '2026-05-20',
  sourceUrl: 'https://example.com/notice',
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
  ...overrides,
});

const makeEvent = (notice: Notice): NotificationEvent => ({
  type: 'new_notice',
  notice,
  listing: null,
  previousNotice: null,
  previousListing: null,
  occurredAt: '2026-05-09T10:00:00.000Z',
});

describe('notification policy', () => {
  it('prioritizes likely notices above review-only notices and low priority notices', () => {
    expect(getNotificationPriority(makeEvent(makeNotice()), profile)).toBe('high');
    expect(getNotificationPriority(makeEvent(makeNotice({ metadata: {} })), profile)).toBe('review');
    expect(
      getNotificationPriority(
        makeEvent(makeNotice({ title: '서울 고령자 국민임대 입주자 모집공고', targetTags: ['고령자'] })),
        profile,
      ),
    ).toBe('low');
  });

  it('filters low priority notices from the default actionable policy', () => {
    const high = makeEvent(makeNotice({ sourceId: 'high', title: '서울 청년 행복주택 입주자 모집공고' }));
    const review = makeEvent(makeNotice({ sourceId: 'review', title: '서울 청년 조건 미확인 입주자 모집공고', metadata: {} }));
    const low = makeEvent(makeNotice({ sourceId: 'low', title: '서울 고령자 국민임대 입주자 모집공고', targetTags: ['고령자'] }));

    expect(filterNotificationEvents({ events: [high, review, low], failures: [], profile })).toEqual([high, review]);
    expect(filterNotificationEvents({ events: [high, review, low], failures: [], profile, policy: 'all' })).toEqual([
      high,
      review,
      low,
    ]);
  });

  it('groups notices for quieter Telegram summaries', () => {
    const high = makeEvent(makeNotice({ sourceId: 'high', title: '서울 청년 행복주택 입주자 모집공고' }));
    const review = makeEvent(makeNotice({ sourceId: 'review', title: '서울 청년 조건 미확인 입주자 모집공고', metadata: {} }));
    const low = makeEvent(makeNotice({ sourceId: 'low', title: '서울 고령자 국민임대 입주자 모집공고', targetTags: ['고령자'] }));
    const groups = groupNotificationEvents({ events: [high, review, low], failures: [], profile });

    expect(groups.high).toEqual([high]);
    expect(groups.review).toEqual([review]);
    expect(groups.low).toEqual([]);

    const summary = formatPrioritizedDailySummary(groups);
    expect(summary).toContain('바로 볼 공고');
    expect(summary).toContain('확인 필요한 공고');
    expect(summary).not.toContain('낮은 우선순위');
    expect(summary).not.toContain('고령자 국민임대');
  });
});
