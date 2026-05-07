import { describe, expect, it } from 'vitest';

import { parseCommand } from '../src/commands/parse.js';

describe('parseCommand', () => {
  it('parses 오늘 공고 보여줘 as the default today list query', () => {
    expect(parseCommand('오늘 공고 보여줘')).toEqual({
      intent: 'list',
      filters: {
        postedAfter: 'today',
        postedBefore: 'today',
      },
    });
  });

  it('parses 서울만 보여줘 as a region-only list query', () => {
    expect(parseCommand('서울만 보여줘')).toEqual({
      intent: 'list',
      filters: {
        region: '서울',
      },
    });
  });

  it('parses slash-separated structured filters', () => {
    expect(parseCommand('공고 조회 / 지역 경기 / 상태 모집중 / 기관 SH')).toEqual({
      intent: 'list',
      filters: {
        region: '경기',
        status: '모집중',
        source: 'sh',
      },
    });
  });

  it('parses numbered detail lookups', () => {
    expect(parseCommand('1번 자세히')).toEqual({
      intent: 'detail',
      index: 1,
    });
  });

  it('parses link-only requests', () => {
    expect(parseCommand('2번 링크만')).toEqual({
      intent: 'linkOnly',
      index: 2,
    });
  });
});
