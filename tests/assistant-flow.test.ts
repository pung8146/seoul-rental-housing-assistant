import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAssistantContext, runAssistantText, saveAssistantContext } from '../src/app/run-assistant.js';
import { createRepository } from '../src/db/repository.js';
import type { SourceAdapter } from '../src/adapters/base.js';
import type { Listing, Notice } from '../src/types.js';

const makeNotice = (index: number, overrides: Partial<Notice> = {}): Notice => ({
  source: 'lh',
  sourceId: `notice-${index}`,
  title: `서울 청년 임대주택 ${index} 입주자 모집공고`,
  stableKey: `notice:${index}`,
  changeHash: `notice-hash-${index}`,
  status: '모집중',
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

describe('runAssistantText', () => {
  it('collects fresh notices when the user asks for the latest data', async () => {
    const repository = createRepository(':memory:');
    const adapters: SourceAdapter[] = [
      {
        source: 'lh',
        async fetchNotices() {
          return [
            {
              sourceId: 'notice-1',
              title: '서울 청년 임대주택 1 입주자 모집공고',
              region: '서울',
              targetTags: ['청년'],
              postedAt: '2026-05-01',
              sourceUrl: 'https://example.com/notices/1',
              listings: [],
            },
          ];
        },
      },
    ];

    const result = await runAssistantText({
      repository,
      adapters,
      input: '최신 공고 확인해줘',
    });

    expect(result.mode).toBe('collect');
    expect(result.text).toContain('신규');
    expect(result.text).toContain('서울 청년 임대주택 1');
    expect(result.text).toContain('https://example.com/notices/1');
  });

  it('answers ordinary user questions from stored notices', async () => {
    const repository = createRepository(':memory:');
    repository.upsertNotice(makeNotice(1));
    repository.upsertNotice(makeNotice(2));

    const result = await runAssistantText({
      repository,
      adapters: [],
      input: '서울만 보여줘',
    });

    expect(result.mode).toBe('query');
    expect(result.text).toContain('1. [프로필 필요] [임대] 서울 청년 임대주택 2');
    expect(result.text).toContain('2. [프로필 필요] [임대] 서울 청년 임대주택 1');
  });

  it('collects before answering a list query when the database is empty', async () => {
    const repository = createRepository(':memory:');
    const adapters: SourceAdapter[] = [
      {
        source: 'lh',
        async fetchNotices() {
          return [
            {
              sourceId: 'notice-1',
              title: '서울 청년 임대주택 1 입주자 모집공고',
              region: '서울',
              targetTags: ['청년'],
              postedAt: '2026-05-01',
              sourceUrl: 'https://example.com/notices/1',
              listings: [],
            },
          ];
        },
      },
    ];

    const result = await runAssistantText({
      repository,
      adapters,
      input: '서울만 보여줘',
    });

    expect(result.mode).toBe('query');
    expect(result.text).toContain('1. [프로필 필요] [임대] 서울 청년 임대주택 1');
  });

  it('carries the shown list forward for follow-up detail questions', async () => {
    const repository = createRepository(':memory:');
    const context = { notices: [] as Notice[] };
    const notices = [
      makeNotice(1),
      makeNotice(2, { region: '경기', title: '경기 청년 임대주택 2 입주자 모집공고' }),
      makeNotice(3),
    ];

    notices.forEach((notice) => repository.upsertNotice(notice));
    repository.upsertListing(makeListing(notices[0], 1, { title: '서울 1번 상세' }));
    repository.upsertListing(makeListing(notices[1], 1, { title: '경기 상세' }));

    const listResult = await runAssistantText({
      repository,
      adapters: [],
      input: '서울만 보여줘',
      context,
    });
    const detailResult = await runAssistantText({
      repository,
      adapters: [],
      input: '2번 자세히',
      context,
    });

    expect(listResult.text).toContain('1. [프로필 필요] [임대] 서울 청년 임대주택 3');
    expect(listResult.text).toContain('2. [프로필 필요] [임대] 서울 청년 임대주택 1');
    expect(detailResult.text).toContain('서울 청년 임대주택 1');
    expect(detailResult.text).toContain('서울 1번 상세');
    expect(detailResult.text).not.toContain('경기 상세');
  });


  it('answers operation status questions from source runs and notification history', async () => {
    const repository = createRepository(':memory:');
    repository.recordSourceRun({
      source: 'lh',
      startedAt: '2026-07-02T00:00:00.000Z',
      finishedAt: '2026-07-02T00:00:10.000Z',
      status: 'success',
      message: null,
    });
    repository.recordSourceRun({
      source: 'gh',
      startedAt: '2026-07-02T00:00:00.000Z',
      finishedAt: '2026-07-02T00:00:15.000Z',
      status: 'failure',
      message: 'timeout',
    });
    repository.recordNotification('telegram:chat', 'payload-hash', '2026-07-02T00:01:00.000Z');

    const result = await runAssistantText({
      repository,
      adapters: [],
      input: '수집상태 알려줘',
    });

    expect(result.mode).toBe('status');
    expect(result.text).toContain('수집 상태');
    expect(result.text).toContain('마지막 수집: 2026-07-02T00:00:15.000Z');
    expect(result.text).toContain('성공 1개');
    expect(result.text).toContain('실패 1개');
    expect(result.text).toContain('gh: 실패 - timeout');
    expect(result.text).toContain('마지막 텔레그램 알림: 2026-07-02T00:01:00.000Z');
  });

  it('persists the shown list so separate answer invocations can use it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rental-housing-context-'));
    const contextPath = join(directory, 'context.json');
    const notice = makeNotice(1);

    try {
      saveAssistantContext(contextPath, { notices: [notice] });

      expect(loadAssistantContext(contextPath)).toEqual({ notices: [notice] });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
