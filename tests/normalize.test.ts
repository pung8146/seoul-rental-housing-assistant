import { describe, expect, it } from 'vitest';

import { ListingSchema, NoticeSchema } from '../src/types';

describe('core domain schemas', () => {
  it('accepts a normalized notice with required fields', () => {
    const result = NoticeSchema.safeParse({
      source: 'lh',
      sourceId: 'notice-1',
      title: '서울 청년 임대주택 모집',
      stableKey: 'notice:lh:notice-1',
      changeHash: 'hash-1',
      status: 'open',
      region: '서울',
      targetTags: ['청년', '신혼부부'],
      postedAt: '2026-05-07',
      applicationStartAt: null,
      applicationEndAt: null,
      sourceUrl: 'https://example.com/notices/1',
      metadata: {},
    });

    expect(result.success).toBe(true);
  });

  it('rejects a notice missing required identifying fields', () => {
    const result = NoticeSchema.safeParse({
      sourceId: 'notice-1',
      status: 'open',
      region: '서울',
      targetTags: ['청년'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['source', 'title', 'stableKey', 'changeHash']),
      );
    }
  });

  it('accepts a normalized listing with required fields', () => {
    const result = ListingSchema.safeParse({
      source: 'lh',
      noticeSourceId: 'notice-1',
      title: '행복주택 101동 201호',
      stableKey: 'listing:lh:notice-1:101-201',
      changeHash: 'hash-2',
      supplyType: '행복주택',
      region: '서울',
      targetTags: ['청년'],
      deposit: 10000000,
      monthlyRent: 250000,
      floorAreaM2: 39.8,
      status: 'available',
      metadata: {},
    });

    expect(result.success).toBe(true);
  });

  it('rejects a listing missing required identifying fields', () => {
    const result = ListingSchema.safeParse({
      noticeSourceId: 'notice-1',
      supplyType: '행복주택',
      region: '서울',
      targetTags: [],
      deposit: null,
      monthlyRent: null,
      floorAreaM2: null,
      status: null,
      metadata: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['source', 'title', 'stableKey', 'changeHash']),
      );
    }
  });
});
