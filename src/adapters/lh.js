const LH_PROVIDER = 'LH';
const LH_NOTICE_LIST_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026';
const extractCells = (rowHtml) => {
    const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
    return matches.map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim());
};
const isDateCell = (value) => /^\d{4}[-.]\d{2}[-.]\d{2}$/.test(value);
const normalizeLhDate = (value) => value.replace(/\./g, '-');
export const parseLhNoticeListHtml = (html) => {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const notices = [];
    for (const [, rowHtml] of rows) {
        const buttonMatch = rowHtml.match(/<[^>]*class=["'][^"']*wrtancInfoBtn[^"']*["'][^>]*data-id1=["']([^"']+)["'][^>]*data-id2=["']([^"']*)["'][^>]*>/i);
        if (!buttonMatch) {
            continue;
        }
        const [, dataId1, dataId2] = buttonMatch;
        const cells = extractCells(rowHtml);
        const titleCellIndex = cells.findIndex((cell, index) => index > 0 && !isDateCell(cell) && isDateCell(cells[index + 3] ?? ''));
        const title = cells[titleCellIndex] ?? '';
        const supplyType = cells[titleCellIndex + 1] ?? '';
        const region = cells[titleCellIndex + 2] ?? '';
        const postedAt = normalizeLhDate(cells[titleCellIndex + 3] ?? '');
        const applicationEndAt = normalizeLhDate(cells[titleCellIndex + 4] ?? '');
        const status = cells[titleCellIndex + 5] ?? '';
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
const LH_FIXTURE = [
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
export const createLhAdapter = (options = {}) => {
    const fetchImpl = options.fetch ?? fetch;
    return {
        source: 'lh',
        async fetchNotices() {
            const response = await fetchImpl(LH_NOTICE_LIST_URL);
            const html = await response.text();
            const notices = parseLhNoticeListHtml(html);
            return notices.length > 0 ? notices : LH_FIXTURE;
        },
        async fetchNoticeDetails(id) {
            // TODO: Fetch and parse the LH detail page for individual notice records.
            return LH_FIXTURE.find((notice) => notice.sourceId === id) ?? null;
        },
    };
};
