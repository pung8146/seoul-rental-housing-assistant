import type { RawNoticeCandidate, SourceAdapter } from './base.js';

const SH_PROVIDER = 'SH';
const SH_NOTICE_LIST_URL = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/list.do?multi_itm_seq=2';
const SH_NOTICE_DETAIL_BASE_URL = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2';

type ShFetch = typeof fetch;

export type CreateShAdapterOptions = {
  fetch?: ShFetch;
};

const extractCells = (rowHtml: string): string[] => {
  const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
  return matches.map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim());
};

const extractTitle = (rowHtml: string): string => {
  const anchorMatch = rowHtml.match(/<a\b[^>]*onclick=["'][^"']*getDetailView\(['"][^'"]+['"]\)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  return anchorMatch?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
};

export const parseShNoticeListHtml = (html: string): RawNoticeCandidate[] => {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const notices: RawNoticeCandidate[] = [];

  for (const [, rowHtml] of rows) {
    const detailMatch = rowHtml.match(/getDetailView\(['"]([^'"]+)['"]\)/i);
    if (!detailMatch) {
      continue;
    }

    const [, seq] = detailMatch;
    const cells = extractCells(rowHtml);
    const title = extractTitle(rowHtml);
    const department = cells.at(-3) ?? '';
    const postedAt = cells.find((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell)) ?? '';
    const sourceUrl = `${SH_NOTICE_DETAIL_BASE_URL}&seq=${encodeURIComponent(seq)}`;
    const rawIds = { seq };

    notices.push({
      sourceId: seq,
      title,
      status: 'posted',
      region: '서울',
      postedAt,
      sourceUrl,
      metadata: {
        provider: SH_PROVIDER,
        department,
        rawIds,
      },
      listings: [
        {
          title,
          supplyType: department,
          region: '서울',
          status: 'posted',
          metadata: {
            rawIds,
          },
        },
      ],
    });
  }

  return notices;
};

const SH_FIXTURE: RawNoticeCandidate[] = [
  {
    sourceId: 'sh-notice-1',
    title: 'SH Seoul rental housing notice',
    status: 'posted',
    region: '서울',
    targetTags: 'rental',
    postedAt: '2026-05-06',
    applicationStartAt: '2026-05-12',
    applicationEndAt: '2026-05-19',
    sourceUrl: 'https://example.com/sh/notices/1',
    metadata: { provider: SH_PROVIDER, fixture: true },
    listings: [
      {
        title: 'SH Seoul rental housing notice',
        supplyType: 'rental',
        region: '서울',
        targetTags: 'rental',
        deposit: '20,000,000',
        monthlyRent: '180,000',
        floorAreaM2: '49.5',
        status: 'posted',
        metadata: { fixture: true },
      },
    ],
  },
];

export const createShAdapter = (options: CreateShAdapterOptions = {}): SourceAdapter => {
  const fetchImpl = options.fetch ?? fetch;

  return {
    source: 'sh',
    async fetchNotices() {
      const response = await fetchImpl(SH_NOTICE_LIST_URL);
      const html = await response.text();
      const notices = parseShNoticeListHtml(html);
      return notices.length > 0 ? notices : SH_FIXTURE;
    },
    async fetchNoticeDetails(id: string) {
      // TODO: Fetch and parse the SH detail page for individual notice records.
      return SH_FIXTURE.find((notice) => notice.sourceId === id) ?? null;
    },
  };
};
