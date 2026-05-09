import { describe, expect, it } from 'vitest';

import { runQuery, runQueryText } from '../src/app/run-query.js';
import { createRepository } from '../src/db/repository.js';
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
    const notices = [1, 2, 3, 4, 5, 6].map((index) => makeNotice(index));

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
    expect(result.lines[0]).toContain('1. 공고 6');
    expect(result.lines[4]).toContain('5. 공고 2');
    expect(result.text).not.toContain('공고 1');
  });

  it('returns listing rows for detail intent', () => {
    const repository = createRepository(':memory:');
    const notices = [makeNotice(1), makeNotice(2)];

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

  it('returns only source url for link-only intent', () => {
    const repository = createRepository(':memory:');
    const notices = [makeNotice(1), makeNotice(2)];

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
    const notices = [makeNotice(1), makeNotice(2)];

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
