import { describe, expect, it } from 'vitest';

import {
  normalizeAdapterOutput,
  normalizeRegion,
  parseNumber,
  parseTags,
} from '../src/domain/normalize.js';
import {
  createLhAdapter,
  parseLhNoticeDetailHtml,
  parseLhNoticeListHtml,
  type CreateLhAdapterOptions,
} from '../src/adapters/lh.js';
import {
  createShAdapter,
  parseShNoticeDetailHtml,
  parseShNoticeListHtml,
  type CreateShAdapterOptions,
} from '../src/adapters/sh.js';
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
    const adapters = [
      createLhAdapter({
        fetch: async () =>
          new Response(`
            <table>
              <tr>
                <td>1</td>
                <td>
                  <button class="wrtancInfoBtn" data-id1="lh-contract" data-id2="01">LH contract notice</button>
                </td>
                <td>매입임대</td>
                <td>서울특별시</td>
                <td>2026.05.07</td>
                <td>2026.05.20</td>
                <td>접수중</td>
              </tr>
            </table>
          `),
      }),
      createShAdapter({
        fetch: async () =>
          new Response(`
            <table>
              <tr>
                <td>1</td>
                <td class="txtL">
                  <a href="#" onclick="javascript:getDetailView('sh-contract');return false;">SH contract notice</a>
                </td>
                <td>Rental Team</td>
                <td>2026-05-08</td>
                <td>10</td>
              </tr>
            </table>
          `),
      }),
    ];

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

  it('parses current LH list rows without treating attachment text as region', () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>1</td>
            <td>국민임대</td>
            <td>
              <a href="javascript:" data-id1="2015122300019915" data-id2="03" data-id3="06" data-id4="07" class="wrtancInfoBtn">
                <span>김제하동 국민임대주택 모집공고 <em class="day">1일전</em></span>
              </a>
            </td>
            <td>전북</td>
            <td>첨부파일 있음</td>
            <td>2026.05.08</td>
            <td>2026.05.21</td>
            <td class="mVw stt noti">공고중</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseLhNoticeListHtml(html)).toEqual([
      {
        sourceId: '2015122300019915',
        title: '김제하동 국민임대주택 모집공고 1일전',
        status: '공고중',
        region: '전북',
        postedAt: '2026-05-08',
        applicationEndAt: '2026-05-21',
        sourceUrl:
          'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?ccrCnntSysDsCd=03&panId=2015122300019915&aisTpCd=07&uppAisTpCd=06&mi=1026&panKdCd=&otxtPanId=',
        metadata: {
          provider: 'LH',
          rawIds: {
            dataId1: '2015122300019915',
            dataId2: '03',
            dataId3: '06',
            dataId4: '07',
          },
        },
        listings: [
          {
            title: '김제하동 국민임대주택 모집공고 1일전',
            supplyType: '국민임대',
            region: '전북',
            status: '공고중',
            metadata: {
              rawIds: {
                dataId1: '2015122300019915',
                dataId2: '03',
                dataId3: '06',
                dataId4: '07',
              },
            },
          },
        ],
      },
    ]);
  });

  it('parses LH detail tables into listing rows', () => {
    const notice = {
      sourceId: '2015122300019916',
      title: '고령자복지주택 예비입주자 모집',
      status: '공고중',
      region: '경북',
      postedAt: '2026-05-08',
      sourceUrl: 'https://apply.lh.or.kr/detail',
      metadata: {
        provider: 'LH',
        rawIds: { dataId1: '2015122300019916' },
      },
      listings: [
        {
          title: '목록 placeholder',
          supplyType: '고령자복지주택',
          region: '경북',
          status: '공고중',
        },
      ],
    };
    const html = `
      <script>
        var contentString_0 = ' 경상북도 경주시 안강읍 화전길 61-2 ';
      </script>
      <table>
        <caption>주택형 안내 : 주택형, 전용면적, 세대수, 금회공급 세대수, 임대보증금, 월임대료</caption>
        <thead>
          <tr>
            <th>주택형</th>
            <th>전용면적(㎡)</th>
            <th>세대수</th>
            <th>금회공급 세대수</th>
            <th>임대보증금(원)</th>
            <th>월임대료(원)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>26A</td>
            <td>26.4</td>
            <td>103</td>
            <td>20</td>
            <td>10,000,000</td>
            <td>250,000</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseLhNoticeDetailHtml(html, notice)).toMatchObject({
      sourceId: '2015122300019916',
      title: '고령자복지주택 예비입주자 모집',
      listings: [
        {
          title: '고령자복지주택 예비입주자 모집 26A',
          supplyType: '26A',
          region: '경북',
          deposit: '10,000,000',
          monthlyRent: '250,000',
          floorAreaM2: '26.4',
          status: '공고중',
          metadata: {
            building: '경상북도 경주시 안강읍 화전길 61-2',
            rawIds: { dataId1: '2015122300019916' },
          },
        },
      ],
    });
  });

  it('fetches LH notice details from the list-provided detail URL', async () => {
    const listHtml = `
      <table>
        <tbody>
          <tr>
            <td>1</td>
            <td>국민임대</td>
            <td>
              <a href="javascript:" data-id1="2015122300019916" data-id2="03" data-id3="06" data-id4="09" class="wrtancInfoBtn">
                <span>고령자복지주택 예비입주자 모집</span>
              </a>
            </td>
            <td>경북</td>
            <td>2026.05.08</td>
            <td>2026.05.21</td>
            <td>공고중</td>
          </tr>
        </tbody>
      </table>
    `;
    const detailHtml = `
      <script>var contentString_0 = ' 경상북도 경주시 안강읍 화전길 61-2 ';</script>
      <table>
        <tr><th>주택형</th><th>전용면적(㎡)</th><th>임대보증금(원)</th><th>월임대료(원)</th></tr>
        <tr><td>26A</td><td>26.4</td><td>10,000,000</td><td>250,000</td></tr>
      </table>
    `;
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl: NonNullable<CreateLhAdapterOptions['fetch']> = async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(fetchCalls.length === 1 ? listHtml : detailHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    };
    const adapter = createLhAdapter({ fetch: fetchImpl });

    await adapter.fetchNotices();
    const detail = await adapter.fetchNoticeDetails?.('2015122300019916');

    expect(fetchCalls[1]?.input).toBe(
      'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?ccrCnntSysDsCd=03&panId=2015122300019916&aisTpCd=09&uppAisTpCd=06&mi=1026&panKdCd=&otxtPanId=',
    );
    expect(detail?.listings).toMatchObject([
      {
        title: '고령자복지주택 예비입주자 모집 26A',
        deposit: '10,000,000',
        monthlyRent: '250,000',
        floorAreaM2: '26.4',
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

  it('parses SH detail pages into attachment metadata', () => {
    const notice = {
      sourceId: '304116',
      title: '제7차 장기전세주택2 청약접수 결과 안내',
      status: 'posted',
      region: '서울',
      postedAt: '2026-05-08',
      sourceUrl: 'https://www.i-sh.co.kr/main/view.do?seq=304116',
      metadata: {
        provider: 'SH',
        rawIds: { seq: '304116' },
      },
      listings: [
        {
          title: '제7차 장기전세주택2 청약접수 결과 안내',
          region: '서울',
          status: 'posted',
        },
      ],
    };
    const html = `
      <table>
        <tr><th>등록일</th><td>2026-05-08</td></tr>
        <tr>
          <th>첨부</th>
          <td>
            <a href="#">.pdf</a>
            <a href="#">청약경쟁률.pdf</a>
            <a href="/main/com/util/htmlConverter.do?brd_id=GS0401&amp;seq=304116&amp;file_seq=1">미리보기</a>
            <a href="https://www.i-sh.co.kr/files/guide.xlsx">단지별 결과.xlsx</a>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            제7차 장기전세주택2 최종 청약접수 결과를 아래와 같이 게시합니다.
          </td>
        </tr>
      </table>
    `;

    expect(parseShNoticeDetailHtml(html, notice)).toMatchObject({
      metadata: {
        provider: 'SH',
        rawIds: { seq: '304116' },
        attachments: [
          {
            title: '청약경쟁률.pdf',
            url: 'https://www.i-sh.co.kr/main/com/util/htmlConverter.do?brd_id=GS0401&seq=304116&file_seq=1',
          },
          {
            title: '단지별 결과.xlsx',
            url: 'https://www.i-sh.co.kr/files/guide.xlsx',
          },
        ],
        bodyPreview: '등록일 2026-05-08 첨부 청약경쟁률.pdf 단지별 결과.xlsx 제7차 장기전세주택2 최종 청약접수 결과를 아래와 같이 게시합니다.',
      },
    });
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
