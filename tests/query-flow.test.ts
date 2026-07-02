import { describe, expect, it } from 'vitest';

import { runQuery, runQueryText } from '../src/app/run-query.js';
import { createRepository } from '../src/db/repository.js';
import { getNoticeExclusionReason } from '../src/domain/actionable.js';
import type { Listing, Notice } from '../src/types.js';

const makeNotice = (index: number, overrides: Partial<Notice> = {}): Notice => ({
  source: index % 2 === 0 ? 'sh' : 'lh',
  sourceId: `notice-${index}`,
  title: `공고 ${index}`,
  stableKey: `notice:${index}`,
  changeHash: `notice-hash-${index}`,
  status: '모집중',
  region: index % 2 === 0 ? '경기' : '서울',
  targetTags: ['청년'],
  postedAt: `2026-05-0${Math.min(index, 9)}`,
  applicationStartAt: null,
  applicationEndAt: null,
  sourceUrl: `https://example.com/notices/${index}`,
  metadata: {},
  ...overrides,
});

const makeListing = (notice: Notice, index: number, overrides: Partial<Listing> = {}): Listing => ({
  source: notice.source,
  noticeSourceId: notice.sourceId,
  title: `${notice.title} 매물 ${index}`,
  stableKey: `listing:${notice.sourceId}:${index}`,
  changeHash: `listing-hash:${notice.sourceId}:${index}`,
  supplyType: '행복주택',
  region: notice.region,
  targetTags: notice.targetTags,
  deposit: 10000000 * index,
  monthlyRent: 200000 * index,
  floorAreaM2: 30 + index,
  status: '공급중',
  metadata: {},
  ...overrides,
});

describe('runQuery', () => {
  it('returns 3–5 notice summaries for list intent', () => {
    const repository = createRepository(':memory:');
    const notices = [1, 2, 3, 4, 5, 6].map((index) =>
      makeNotice(index, {
        title: `공고 ${index} 입주자 모집공고`,
      }),
    );

    notices.forEach((notice) => {
      repository.upsertNotice(notice);
    });

    const result = runQuery({
      repository,
      command: {
        intent: 'list',
        filters: {},
      },
    });

    expect(result.lines).toHaveLength(5);
    expect(result.lines[0]).toContain('1. [프로필 필요] 공고 6 입주자 모집공고');
    expect(result.lines[4]).toContain('5. [프로필 필요] 공고 2 입주자 모집공고');
    expect(result.text).not.toContain('공고 1');
  });

  it('hides non-application announcements from list results', () => {
    const repository = createRepository(':memory:');
    const notices = [
      makeNotice(1, {
        source: 'sh',
        title: '전산작업에 따른 서비스(신한인증서) 이용 안내',
        region: '서울',
        postedAt: '2026-05-09',
      }),
      makeNotice(2, {
        source: 'sh',
        title: '2025년 전세형 매입임대주택 입주자 모집공고(2025.12.26.) 예비1차 당첨자 명단 및 계약안내',
        region: '서울',
        postedAt: '2026-05-08',
      }),
      makeNotice(3, {
        source: 'sh',
        title: '제7차 장기전세주택2(미리내집) 입주자 모집공고(2026. 4. 24.) 최종 청약접수 결과 안내',
        region: '서울',
        postedAt: '2026-05-08',
      }),
      makeNotice(4, {
        source: 'sh',
        title: '행복주택 예비당첨자 게시',
        region: '서울',
        postedAt: '2026-05-07',
      }),
      makeNotice(5, {
        source: 'lh',
        title: '[서울지역본부] 집주인 임대주택 예비입주자 모집공고(건설개량형)',
        region: '서울',
        status: '공고중',
        postedAt: '2026-05-06',
      }),
    ];

    notices.forEach((notice) => {
      repository.upsertNotice(notice);
    });

    const result = runQuery({
      repository,
      command: {
        intent: 'list',
        filters: { region: '서울' },
      },
    });

    expect(result.lines).toHaveLength(1);
    expect(result.text).toContain('집주인 임대주택 예비입주자 모집공고');
    expect(result.text).not.toContain('전산작업');
    expect(result.text).not.toContain('당첨자 명단');
    expect(result.text).not.toContain('청약접수 결과');
    expect(result.text).not.toContain('예비당첨자');
    expect(getNoticeExclusionReason({ title: '전산작업에 따른 서비스(신한인증서) 이용 안내' })).toBe(
      'service_notice',
    );
    expect(
      getNoticeExclusionReason({
        title: '2025년 전세형 매입임대주택 입주자 모집공고(2025.12.26.) 예비1차 당첨자 명단 및 계약안내',
      }),
    ).toBe('application_result');
    expect(
      getNoticeExclusionReason({ title: '[서울지역본부] 집주인 임대주택 예비입주자 모집공고(건설개량형)' }),
    ).toBeNull();
    expect(getNoticeExclusionReason({ title: '위례 A1-1BL 공공분양주택 분양공고' })).toBeNull();
  });

  it('returns only sale notices when filtering by 분양 target tag', () => {
    const repository = createRepository(':memory:');
    const saleNotice = makeNotice(1, {
      title: '위례 A1-1BL 공공분양주택 분양공고',
      targetTags: ['분양', '신혼부부'],
      postedAt: '2026-05-10',
    });
    const rentalNotice = makeNotice(2, {
      title: '서울 청년 매입임대주택 입주자 모집공고',
      targetTags: ['청년', '매입임대'],
      postedAt: '2026-05-09',
    });

    repository.upsertNotice(saleNotice);
    repository.upsertNotice(rentalNotice);

    const result = runQueryText({
      repository,
      input: '분양 공고 보여줘',
    });

    expect(result.lines).toHaveLength(1);
    expect(result.text).toContain('공공분양주택 분양공고');
    expect(result.text).not.toContain('매입임대주택');
  });


  it('returns only rental notices when filtering by 임대 notice type', () => {
    const repository = createRepository(':memory:');
    const rentalNotice = makeNotice(1, {
      title: '서울 청년 매입임대주택 입주자 모집공고',
      targetTags: ['청년', '매입임대'],
      postedAt: '2026-05-11',
    });
    const saleNotice = makeNotice(2, {
      title: '위례 A1-1BL 공공분양주택 분양공고',
      targetTags: ['분양'],
      postedAt: '2026-05-10',
    });
    const shopNotice = makeNotice(3, {
      source: 'gh',
      title: 'GH 복합시설관 일반형 임대상가 임차인 모집공고',
      targetTags: ['상가임대'],
      postedAt: '2026-05-09',
    });

    [rentalNotice, saleNotice, shopNotice].forEach((notice) => repository.upsertNotice(notice));

    const result = runQueryText({ repository, input: '임대 공고 보여줘' });

    expect(result.lines).toHaveLength(1);
    expect(result.text).toContain('[임대] 서울 청년 매입임대주택 입주자 모집공고');
    expect(result.text).not.toContain('공공분양주택');
    expect(result.text).not.toContain('임대상가');
  });

  it('returns only shop notices when filtering by 상가 notice type', () => {
    const repository = createRepository(':memory:');
    const rentalNotice = makeNotice(1, {
      title: '서울 청년 매입임대주택 입주자 모집공고',
      targetTags: ['청년', '매입임대'],
      postedAt: '2026-05-11',
    });
    const shopNotice = makeNotice(2, {
      source: 'gh',
      title: 'GH 복합시설관 일반형 임대상가 임차인 모집공고',
      targetTags: ['상가임대'],
      postedAt: '2026-05-10',
    });

    [rentalNotice, shopNotice].forEach((notice) => repository.upsertNotice(notice));

    const result = runQueryText({ repository, input: '상가 공고 보여줘' });

    expect(result.lines).toHaveLength(1);
    expect(result.text).toContain('[상가] GH 복합시설관 일반형 임대상가 임차인 모집공고');
    expect(result.text).not.toContain('매입임대주택');
  });

  it('returns a readable empty message when list filters match nothing', () => {
    const repository = createRepository(':memory:');

    const result = runQuery({
      repository,
      command: {
        intent: 'list',
        filters: { region: '서울' },
      },
    });

    expect(result.text).toBe('조건에 맞는 공고 없음');
    expect(result.lines).toEqual(['조건에 맞는 공고 없음']);
  });

  it('summarizes and sorts list results by safe eligibility assessment', () => {
    const repository = createRepository(':memory:');
    const reviewNotice = makeNotice(1, {
      title: '서울 청년 조건 미확인 입주자 모집공고',
      region: '서울',
      postedAt: '2026-05-09',
    });
    const likelyNotice = makeNotice(2, {
      title: '서울 청년 조건 확인 입주자 모집공고',
      region: '서울',
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

    repository.upsertNotice(reviewNotice);
    repository.upsertNotice(likelyNotice);
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

    const result = runQuery({
      repository,
      command: {
        intent: 'list',
        filters: { region: '서울' },
      },
    });

    expect(result.text).toContain('신청 가능성 높은 공고 1건');
    expect(result.text).toContain('확인 필요 1건');
    expect(result.lines[0]).toContain('1. [지원가능성 높음] 서울 청년 조건 확인 입주자 모집공고');
    expect(result.lines[1]).toContain('2. [조건 확인 필요] 서울 청년 조건 미확인 입주자 모집공고');
    expect(result.lines[1]).toContain('공고문에서 신청 조건을 찾지 못함');
  });

  it('returns listing rows for detail intent', () => {
    const repository = createRepository(':memory:');
    const notices = [
      makeNotice(1, { title: '공고 1 입주자 모집공고' }),
      makeNotice(2, { title: '공고 2 입주자 모집공고' }),
    ];

    notices.forEach((notice) => {
      repository.upsertNotice(notice);
    });

    repository.upsertListing(makeListing(notices[1], 1, { title: '201호', deposit: 10000000, monthlyRent: 250000 }));
    repository.upsertListing(makeListing(notices[1], 2, { title: '202호', deposit: 12000000, monthlyRent: 280000 }));

    const result = runQuery({
      repository,
      command: {
        intent: 'detail',
        index: 1,
      },
    });

    expect(result.text).toContain('공고 2');
    expect(result.text).toContain('1. 201호');
    expect(result.text).toContain('2. 202호');
  });

  it('uses the previously shown notice list for numbered detail requests', () => {
    const repository = createRepository(':memory:');
    const notices = [1, 2, 3].map((index) =>
      makeNotice(index, {
        title: `공고 ${index} 입주자 모집공고`,
      }),
    );

    notices.forEach((notice) => {
      repository.upsertNotice(notice);
    });

    repository.upsertListing(makeListing(notices[0], 1, { title: '서울 상세 매물' }));
    repository.upsertListing(makeListing(notices[1], 1, { title: '경기 상세 매물' }));

    const listResult = runQuery({
      repository,
      command: {
        intent: 'list',
        filters: { region: '서울' },
      },
    });
    const detailResult = runQuery({
      repository,
      command: {
        intent: 'detail',
        index: 2,
      },
      previousNotices: listResult.notices,
    });

    expect(listResult.lines).toEqual([
      expect.stringContaining('1. [프로필 필요] 공고 3 입주자 모집공고'),
      expect.stringContaining('2. [프로필 필요] 공고 1 입주자 모집공고'),
    ]);
    expect(detailResult.text).toContain('공고 1 입주자 모집공고');
    expect(detailResult.text).toContain('서울 상세 매물');
    expect(detailResult.text).not.toContain('경기 상세 매물');
  });

  it('returns only source url for link-only intent', () => {
    const repository = createRepository(':memory:');
    const notices = [
      makeNotice(1, { title: '공고 1 입주자 모집공고' }),
      makeNotice(2, { title: '공고 2 입주자 모집공고' }),
    ];

    notices.forEach((notice) => {
      repository.upsertNotice(notice);
    });

    const result = runQuery({
      repository,
      command: {
        intent: 'linkOnly',
        index: 2,
      },
    });

    expect(result.text).toBe('https://example.com/notices/1');
  });

  it('parses user text before running query flow', () => {
    const repository = createRepository(':memory:');
    const notices = [
      makeNotice(1, { title: '공고 1 입주자 모집공고' }),
      makeNotice(2, { title: '공고 2 입주자 모집공고' }),
    ];

    notices.forEach((notice) => {
      repository.upsertNotice(notice);
    });

    const result = runQueryText({
      repository,
      input: '2번 링크만',
    });

    expect(result.text).toBe('https://example.com/notices/1');
  });
});
