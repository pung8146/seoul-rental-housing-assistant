import { describe, expect, it } from 'vitest';

import {
  normalizeAdapterOutput,
  normalizeRegion,
  parseNumber,
  parseTags,
} from '../src/domain/normalize.js';
import { createLhAdapter, parseLhNoticeListHtml, type CreateLhAdapterOptions } from '../src/adapters/lh.js';
import { createShAdapter, parseShNoticeListHtml, type CreateShAdapterOptions } from '../src/adapters/sh.js';
import { ListingSchema, NoticeSchema } from '../src/types.js';

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

describe('adapter contract', () => {
  it('returns raw notice and listing candidate records in a shared shape for each adapter', async () => {
    const adapters = [createLhAdapter(), createShAdapter()];

    for (const adapter of adapters) {
      const notices = await adapter.fetchNotices();

      expect(Array.isArray(notices)).toBe(true);
      expect(notices.length).toBeGreaterThan(0);

      for (const notice of notices) {
        expect(typeof notice.sourceId).toBe('string');
        expect(notice.sourceId.length).toBeGreaterThan(0);
        expect(typeof notice.title).toBe('string');
        expect(notice.title.length).toBeGreaterThan(0);
        expect(Array.isArray(notice.listings)).toBe(true);
        expect(notice.listings.length).toBeGreaterThan(0);

        for (const listing of notice.listings) {
          expect(typeof listing.title).toBe('string');
          expect(listing.title.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('parses LH notice list HTML rows into raw notice candidates', () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>
              <button
                type="button"
                class="wrtancInfoBtn"
                data-id1="12345"
                data-id2="A1"
              >상세보기</button>
            </td>
            <td class="al">서울 청년 매입임대주택 모집</td>
            <td>매입임대</td>
            <td>서울특별시</td>
            <td>2026-05-01</td>
            <td>2026-05-15</td>
            <td>접수중</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseLhNoticeListHtml(html)).toEqual([
      {
        sourceId: '12345',
        title: '서울 청년 매입임대주택 모집',
        status: '접수중',
        region: '서울특별시',
        postedAt: '2026-05-01',
        applicationEndAt: '2026-05-15',
        metadata: {
          provider: 'LH',
          rawIds: {
            dataId1: '12345',
            dataId2: 'A1',
          },
        },
        listings: [
          {
            title: '서울 청년 매입임대주택 모집',
            supplyType: '매입임대',
            region: '서울특별시',
            status: '접수중',
            metadata: {
              rawIds: {
                dataId1: '12345',
                dataId2: 'A1',
              },
            },
          },
        ],
      },
    ]);
  });

  it('fetches live LH notice HTML with an injected fetch implementation', async () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>
              <button
                type="button"
                class="wrtancInfoBtn"
                data-id1="67890"
                data-id2="B2"
              >상세보기</button>
            </td>
            <td class="al">경기 신혼부부 전세임대 모집</td>
            <td>전세임대</td>
            <td>경기도</td>
            <td>2026-05-03</td>
            <td>2026-05-22</td>
            <td>공고중</td>
          </tr>
        </tbody>
      </table>
    `;
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl: NonNullable<CreateLhAdapterOptions['fetch']> = async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    };

    const adapter = createLhAdapter({ fetch: fetchImpl });
    expect(adapter.source).toBe('lh');

    const notices = await adapter.fetchNotices();
    expect(fetchCalls).toEqual([
      {
        input: 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026',
        init: undefined,
      },
    ]);

    expect(notices).toEqual([
      {
        sourceId: '67890',
        title: '경기 신혼부부 전세임대 모집',
        status: '공고중',
        region: '경기도',
        postedAt: '2026-05-03',
        applicationEndAt: '2026-05-22',
        metadata: {
          provider: 'LH',
          rawIds: {
            dataId1: '67890',
            dataId2: 'B2',
          },
        },
        listings: [
          {
            title: '경기 신혼부부 전세임대 모집',
            supplyType: '전세임대',
            region: '경기도',
            status: '공고중',
            metadata: {
              rawIds: {
                dataId1: '67890',
                dataId2: 'B2',
              },
            },
          },
        ],
      },
    ]);
  });

  it('parses SH notice list HTML rows into raw notice candidates', () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>1607</td>
            <td class="txtL">
              <a href="#" class="ellipsis" onclick="javascript:getDetailView('304116');return false;">
                2026 SH rental housing notice
              </a>
            </td>
            <td>Rental Supply Team</td>
            <td class="num">2026-05-08</td>
            <td class="num">4031</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseShNoticeListHtml(html)).toEqual([
      {
        sourceId: '304116',
        title: '2026 SH rental housing notice',
        status: 'posted',
        region: '서울',
        postedAt: '2026-05-08',
        sourceUrl: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2&seq=304116',
        metadata: {
          provider: 'SH',
          department: 'Rental Supply Team',
          rawIds: {
            seq: '304116',
          },
        },
        listings: [
          {
            title: '2026 SH rental housing notice',
            supplyType: 'Rental Supply Team',
            region: '서울',
            status: 'posted',
            metadata: {
              rawIds: {
                seq: '304116',
              },
            },
          },
        ],
      },
    ]);
  });

  it('fetches live SH notice HTML with an injected fetch implementation', async () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>1608</td>
            <td class="txtL">
              <a href="#" class="ellipsis" onclick="javascript:getDetailView('304117');return false;">
                2026 SH youth rental notice
              </a>
            </td>
            <td>Youth Housing Team</td>
            <td class="num">2026-05-09</td>
            <td class="num">100</td>
          </tr>
        </tbody>
      </table>
    `;
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl: NonNullable<CreateShAdapterOptions['fetch']> = async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    };

    const adapter = createShAdapter({ fetch: fetchImpl });
    expect(adapter.source).toBe('sh');

    const notices = await adapter.fetchNotices();
    expect(fetchCalls).toEqual([
      {
        input: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/list.do?multi_itm_seq=2',
        init: undefined,
      },
    ]);

    expect(notices).toEqual([
      {
        sourceId: '304117',
        title: '2026 SH youth rental notice',
        status: 'posted',
        region: '서울',
        postedAt: '2026-05-09',
        sourceUrl: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2&seq=304117',
        metadata: {
          provider: 'SH',
          department: 'Youth Housing Team',
          rawIds: {
            seq: '304117',
          },
        },
        listings: [
          {
            title: '2026 SH youth rental notice',
            supplyType: 'Youth Housing Team',
            region: '서울',
            status: 'posted',
            metadata: {
              rawIds: {
                seq: '304117',
              },
            },
          },
        ],
      },
    ]);
  });
});

describe('normalization helpers', () => {
  it('maps raw adapter output into notice and listing arrays', () => {
    const result = normalizeAdapterOutput({
      source: 'lh',
      notices: [
        {
          sourceId: 'notice-1',
          title: ' 서울특별시 청년 임대주택 모집 ',
          status: ' 모집중 ',
          region: '서울특별시',
          targetTags: '청년, 신혼부부',
          postedAt: '2026-05-07',
          applicationStartAt: '',
          applicationEndAt: undefined,
          sourceUrl: 'https://example.com/notices/1',
          metadata: { provider: 'LH' },
          listings: [
            {
              title: ' 101동 201호 ',
              supplyType: ' 행복주택 ',
              region: '서울특별시',
              targetTags: ['청년', ' 신혼부부 '],
              deposit: '10,000,000',
              monthlyRent: '250,000',
              floorAreaM2: '39.8',
              status: ' 공급중 ',
              metadata: { building: '101동', unit: '201호' },
            },
          ],
        },
      ],
    });

    expect(result.notices).toHaveLength(1);
    expect(result.listings).toHaveLength(1);
    expect(NoticeSchema.parse(result.notices[0]).region).toBe('서울');
    expect(NoticeSchema.parse(result.notices[0]).targetTags).toEqual(['청년', '신혼부부']);

    const listing = ListingSchema.parse(result.listings[0]);
    expect(listing.noticeSourceId).toBe('notice-1');
    expect(listing.deposit).toBe(10000000);
    expect(listing.monthlyRent).toBe(250000);
    expect(listing.floorAreaM2).toBe(39.8);
    expect(listing.stableKey).toBeTruthy();
    expect(listing.changeHash).toBeTruthy();
  });

  it('keeps notice stableKey for identity while changeHash tracks meaningful notice content changes', () => {
    const makeNotice = (overrides: Record<string, unknown> = {}) =>
      normalizeAdapterOutput({
        source: 'lh',
        notices: [
          {
            sourceId: 'notice-2',
            title: '경기도 매입임대',
            status: 'open',
            region: '경기도',
            targetTags: ['청년'],
            postedAt: '2026-05-07',
            applicationStartAt: '2026-05-08',
            applicationEndAt: '2026-05-20',
            sourceUrl: 'https://example.com/notices/2',
            ...overrides,
          },
        ],
      }).notices[0];

    const baseNotice = NoticeSchema.parse(makeNotice());
    const sameIdentityChangedContent = NoticeSchema.parse(makeNotice({ status: 'closed' }));
    const sameContent = NoticeSchema.parse(makeNotice());

    expect(baseNotice.stableKey).toBe('notice:lh:notice-2');
    expect(sameIdentityChangedContent.stableKey).toBe(baseNotice.stableKey);
    expect(sameContent.changeHash).toBe(baseNotice.changeHash);
    expect(sameIdentityChangedContent.changeHash).not.toBe(baseNotice.changeHash);
  });

  it('converts missing optional values to null instead of undefined', () => {
    const result = normalizeAdapterOutput({
      source: 'sh',
      notices: [
        {
          sourceId: 'notice-2',
          title: '경기도 매입임대',
          listings: [
            {
              title: 'A-1',
            },
          ],
        },
      ],
    });

    const notice = NoticeSchema.parse(result.notices[0]);
    const listing = ListingSchema.parse(result.listings[0]);

    expect(notice.status).toBeNull();
    expect(notice.region).toBeNull();
    expect(notice.applicationStartAt).toBeNull();
    expect(notice.applicationEndAt).toBeNull();
    expect(notice.sourceUrl).toBeNull();
    expect(listing.supplyType).toBeNull();
    expect(listing.region).toBeNull();
    expect(listing.deposit).toBeNull();
    expect(listing.monthlyRent).toBeNull();
    expect(listing.floorAreaM2).toBeNull();
    expect(listing.status).toBeNull();
  });

  it('normalizes region text like 서울특별시 to 서울', () => {
    expect(normalizeRegion('서울특별시')).toBe('서울');
    expect(normalizeRegion(' 경기도 ')).toBe('경기');
    expect(normalizeRegion('')).toBeNull();
    expect(parseNumber('12,345')).toBe(12345);
    expect(parseTags('청년 / 신혼부부, 대학생')).toEqual(['청년', '신혼부부', '대학생']);
  });
});
