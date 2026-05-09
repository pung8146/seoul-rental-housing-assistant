const LH_PROVIDER = 'LH';
const LH_NOTICE_LIST_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026';
const LH_NOTICE_DETAIL_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do';
const extractCells = (rowHtml) => {
    const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
    return matches.map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim());
};
const extractAttribute = (html, name) => {
    const match = html.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
    return match?.[1] ?? null;
};
const extractAnchorText = (rowHtml) => {
    const anchorMatch = rowHtml.match(/<([a-z]+)\b[^>]*class=["'][^"']*wrtancInfoBtn[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
    return anchorMatch?.[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
};
const isDateCell = (value) => /^\d{4}[-.]\d{2}[-.]\d{2}$/.test(value);
const normalizeLhDate = (value) => value.replace(/\./g, '-');
const compactRawIds = (ids) => Object.fromEntries(Object.entries(ids).filter(([, value]) => value.length > 0));
const buildLhNoticeDetailUrl = (rawIds) => {
    const panId = rawIds.dataId1;
    const ccrCnntSysDsCd = rawIds.dataId2;
    const uppAisTpCd = rawIds.dataId3;
    const aisTpCd = rawIds.dataId4;
    if (!panId || !ccrCnntSysDsCd || !uppAisTpCd || !aisTpCd) {
        return undefined;
    }
    const params = new URLSearchParams({
        ccrCnntSysDsCd,
        panId,
        aisTpCd,
        uppAisTpCd,
        mi: '1026',
        panKdCd: '',
        otxtPanId: '',
    });
    return `${LH_NOTICE_DETAIL_URL}?${params.toString()}`;
};
export const parseLhNoticeListHtml = (html) => {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const notices = [];
    for (const [, rowHtml] of rows) {
        const buttonMatch = rowHtml.match(/<[^>]*class=["'][^"']*wrtancInfoBtn[^"']*["'][^>]*>/i);
        if (!buttonMatch) {
            continue;
        }
        const dataId1 = extractAttribute(buttonMatch[0], 'data-id1');
        if (!dataId1) {
            continue;
        }
        const dataId2 = extractAttribute(buttonMatch[0], 'data-id2') ?? '';
        const dataId3 = extractAttribute(buttonMatch[0], 'data-id3') ?? '';
        const dataId4 = extractAttribute(buttonMatch[0], 'data-id4') ?? '';
        const cells = extractCells(rowHtml);
        let title = extractAnchorText(rowHtml);
        let titleCellIndex = cells.findIndex((cell) => title.length > 0 && cell.includes(title));
        if (titleCellIndex === 0 || titleCellIndex < 0) {
            titleCellIndex = cells.findIndex((cell, index) => index > 0 && !isDateCell(cell) && isDateCell(cells[index + 3] ?? ''));
            title = cells[titleCellIndex] ?? title;
        }
        const postedAtIndex = cells.findIndex((cell, index) => index > titleCellIndex && isDateCell(cell));
        const supplyType = titleCellIndex > 1 ? cells[titleCellIndex - 1] : cells[titleCellIndex + 1] ?? '';
        const regionStartIndex = titleCellIndex > 1 ? titleCellIndex + 1 : titleCellIndex + 2;
        const regionCandidates = postedAtIndex > titleCellIndex ? cells.slice(regionStartIndex, postedAtIndex).filter(Boolean) : [];
        const region = regionCandidates.find((cell) => !cell.includes('첨부')) ?? regionCandidates.at(-1) ?? '';
        const postedAt = normalizeLhDate(cells[postedAtIndex] ?? '');
        const applicationEndAt = normalizeLhDate(cells.find((cell, index) => index > postedAtIndex && isDateCell(cell)) ?? '');
        const status = cells[postedAtIndex + 2] ?? cells[postedAtIndex + 1] ?? '';
        const rawIds = compactRawIds({ dataId1, dataId2, dataId3, dataId4 });
        notices.push({
            sourceId: dataId1,
            title,
            status,
            region,
            postedAt,
            applicationEndAt,
            sourceUrl: buildLhNoticeDetailUrl(rawIds),
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
