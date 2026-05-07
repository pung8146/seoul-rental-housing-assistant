import type { RawNoticeCandidate, SourceAdapter } from './base.js';

const LH_PROVIDER = 'LH';

const extractCells = (rowHtml: string): string[] => {
  const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
  return matches.map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim());
};

export const parseLhNoticeListHtml = (html: string): RawNoticeCandidate[] => {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const notices: RawNoticeCandidate[] = [];

  for (const [, rowHtml] of rows) {
    const buttonMatch = rowHtml.match(/<[^>]*class=["'][^"']*wrtancInfoBtn[^"']*["'][^>]*data-id1=["']([^"']+)["'][^>]*data-id2=["']([^"']*)["'][^>]*>/i);
    if (!buttonMatch) {
      continue;
    }

    const [, dataId1, dataId2] = buttonMatch;
    const cells = extractCells(rowHtml);
    const title = cells[1] ?? '';
    const supplyType = cells[2] ?? '';
    const region = cells[3] ?? '';
    const postedAt = cells[4] ?? '';
    const applicationEndAt = cells[5] ?? '';
    const status = cells[6] ?? '';
    const rawIds = { dataId1, dataId2 };

    notices.push({
      sourceId: dataId1,
      title,
      status,
      region,
      postedAt,
      applicationEndAt,
      metadata: {
        provider: LH_PROVIDER,
        rawIds,
      },
      listings: [
        {
          title,
          supplyType,
          region,
          status,
          metadata: {
            rawIds,
          },
        },
      ],
    });
  }

  return notices;
};

const LH_FIXTURE: RawNoticeCandidate[] = [
  {
    sourceId: 'lh-notice-1',
    title: 'LH 서울 청년 매입임대주택 모집',
    status: '모집중',
    region: '서울특별시',
    targetTags: ['청년', '신혼부부'],
    postedAt: '2026-05-07',
    applicationStartAt: '2026-05-10',
    applicationEndAt: '2026-05-20',
    sourceUrl: 'https://example.com/lh/notices/1',
    metadata: { provider: LH_PROVIDER, fixture: true },
    listings: [
      {
        title: '101동 201호',
        supplyType: '매입임대',
        region: '서울특별시',
        targetTags: ['청년'],
        deposit: '10,000,000',
        monthlyRent: '250,000',
        floorAreaM2: '39.8',
        status: '공급중',
        metadata: { building: '101동', unit: '201호' },
      },
    ],
  },
];

export const createLhAdapter = (): SourceAdapter => ({
  source: 'lh',
  async fetchNotices() {
    return LH_FIXTURE;
  },
  async fetchNoticeDetails(id: string) {
    return LH_FIXTURE.find((notice) => notice.sourceId === id) ?? null;
  },
});

// TODO: Replace fixture-backed adapter with live LH endpoint wiring.
