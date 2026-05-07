const SH_FIXTURE = [
    {
        sourceId: 'sh-notice-1',
        title: 'SH 경기 신혼부부 전세임대 모집',
        status: '접수예정',
        region: '경기도',
        targetTags: '신혼부부, 청년',
        postedAt: '2026-05-06',
        applicationStartAt: '2026-05-12',
        applicationEndAt: '2026-05-19',
        sourceUrl: 'https://example.com/sh/notices/1',
        metadata: { provider: 'SH', fixture: true },
        listings: [
            {
                title: 'A-101',
                supplyType: '전세임대',
                region: '경기도',
                targetTags: '신혼부부',
                deposit: '20,000,000',
                monthlyRent: '180,000',
                floorAreaM2: '49.5',
                status: '대기',
                metadata: { block: 'A', unit: '101' },
            },
        ],
    },
];
export const createShAdapter = () => ({
    source: 'sh',
    async fetchNotices() {
        return SH_FIXTURE;
    },
    async fetchNoticeDetails(id) {
        return SH_FIXTURE.find((notice) => notice.sourceId === id) ?? null;
    },
});
// TODO: Replace fixture-backed adapter with live SH endpoint wiring.
