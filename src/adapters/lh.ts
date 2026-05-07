import type { RawNoticeCandidate, SourceAdapter } from './base.js';

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
    metadata: { provider: 'LH', fixture: true },
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
