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
    expect(result.lines[0]).toContain('1. 공고 6 입주자 모집공고');
    expect(result.lines[4]).toContain('5. 공고 2 입주자 모집공고');
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
      expect.stringContaining('1. 공고 3 입주자 모집공고'),
      expect.stringContaining('2. 공고 1 입주자 모집공고'),
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
