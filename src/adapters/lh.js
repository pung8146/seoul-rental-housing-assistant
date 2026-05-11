import { findPrimaryApplicationAttachment } from '../domain/attachments.js';
import { extractEligibilityRequirementsFromText } from '../domain/requirements.js';
const LH_PROVIDER = 'LH';
const LH_NOTICE_LIST_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?viewType=srch';
const LH_NOTICE_DETAIL_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do';
const LH_ORIGIN = 'https://apply.lh.or.kr';
const extractCells = (rowHtml) => {
    const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
    return matches.map((match) => stripHtml(match[1]));
};
const extractHeaderCells = (rowHtml) => {
    const matches = Array.from(rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi));
    return matches.map((match) => stripHtml(match[1]));
};
const stripHtml = (html) => {
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    return withoutScripts.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
};
const decodeHtmlEntities = (value) => value
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
const toAbsoluteLhUrl = (url) => {
    const decodedUrl = decodeHtmlEntities(url);
    try {
        return new URL(decodedUrl, LH_ORIGIN).toString();
    }
    catch {
        return decodedUrl;
    }
};
const extractAttribute = (html, name) => {
    const match = html.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
    return match ? decodeHtmlEntities(match[1] ?? '') : null;
};
const extractAnchorText = (rowHtml) => {
    const anchorMatch = rowHtml.match(/<([a-z]+)\b[^>]*class=["'][^"']*wrtancInfoBtn[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
    return anchorMatch?.[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
};
const normalizeNoticeTitle = (value) => value
    .replace(/\s*\d+일전\s*/g, ' ')
    .replace(/\s*오늘\s*/g, ' ')
    .replace(/\bNEW\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
const DATE_TEXT_PATTERN = /(\d{4})\s*(?:년|[-.])\s*(\d{1,2})\s*(?:월|[-.])\s*(\d{1,2})\s*일?/g;
const isDateCell = (value) => /^\d{4}[-.]\d{2}[-.]\d{2}$/.test(value);
const normalizeLhDate = (value) => value.replace(/\./g, '-');
const isSupportedLhSupplyType = (value) => /임대|행복주택|분양주택|공공분양|신혼희망|사전청약/.test(value) && !/상가|토지|어린이집/.test(value);
const normalizeDateMatch = (match) => `${match[1]}-${(match[2] ?? '').padStart(2, '0')}-${(match[3] ?? '').padStart(2, '0')}`;
const extractDates = (text) => Array.from(text.matchAll(DATE_TEXT_PATTERN)).map((match) => normalizeDateMatch(match));
const extractApplicationPeriod = (html) => {
    const text = stripHtml(html);
    const scopedText = text.match(/(?:신청접수기간|신청기간|접수기간|청약접수)[\s\S]{0,140}/)?.[0] ?? text;
    const dates = extractDates(scopedText);
    if (dates.length < 2) {
        return {};
    }
    return {
        applicationStartAt: dates[0],
        applicationEndAt: dates[1],
    };
};
const extractEligibilityRequirements = (html) => {
    const text = stripHtml(html);
    return extractEligibilityRequirementsFromText(text);
};
const isAttachmentLink = (title, url) => {
    const lowerUrl = url.toLowerCase();
    return (/\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)(\?|#|$)/i.test(lowerUrl) ||
        lowerUrl.includes('filedownload') ||
        lowerUrl.includes('download') ||
        title.includes('공고문') ||
        title.includes('첨부') ||
        title.includes('공급대상'));
};
const extractAttachments = (html) => Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) => {
    const url = toAbsoluteLhUrl(match[1] ?? '');
    const title = decodeHtmlEntities(stripHtml(match[2] ?? ''));
    return { title, url };
})
    .filter((attachment) => attachment.title.length > 0 && attachment.url.length > 0)
    .filter((attachment) => isAttachmentLink(attachment.title, attachment.url));
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
        title = normalizeNoticeTitle(title);
        const postedAtIndex = cells.findIndex((cell, index) => index > titleCellIndex && isDateCell(cell));
        const supplyType = titleCellIndex > 1 ? cells[titleCellIndex - 1] : cells[titleCellIndex + 1] ?? '';
        const regionStartIndex = titleCellIndex > 1 ? titleCellIndex + 1 : titleCellIndex + 2;
        const regionCandidates = postedAtIndex > titleCellIndex ? cells.slice(regionStartIndex, postedAtIndex).filter(Boolean) : [];
        const region = regionCandidates.find((cell) => !cell.includes('첨부')) ?? regionCandidates.at(-1) ?? '';
        const postedAt = normalizeLhDate(cells[postedAtIndex] ?? '');
        const applicationEndAt = normalizeLhDate(cells.find((cell, index) => index > postedAtIndex && isDateCell(cell)) ?? '');
        const status = cells[postedAtIndex + 2] ?? cells[postedAtIndex + 1] ?? '';
        const rawIds = compactRawIds({ dataId1, dataId2, dataId3, dataId4 });
        if (!isSupportedLhSupplyType(supplyType)) {
            continue;
        }
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
const findHeaderIndex = (headers, candidates) => headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
const extractDetailBuildings = (html) => Array.from(html.matchAll(/contentString_\d+\s*=\s*['"]([^'"]+)['"]/gi))
    .map((match) => stripHtml(match[1]))
    .filter((value) => !value.startsWith('<') && !value.includes('\\'))
    .filter(Boolean);
export const parseLhNoticeDetailHtml = (html, notice) => {
    const tables = Array.from(html.matchAll(/<table\b[\s\S]*?<\/table>/gi));
    const buildings = extractDetailBuildings(html);
    const applicationPeriod = extractApplicationPeriod(html);
    const eligibilityRequirements = extractEligibilityRequirements(html);
    const attachments = extractAttachments(html);
    const primaryApplicationAttachment = findPrimaryApplicationAttachment(attachments);
    const bodyPreview = stripHtml(html).slice(0, 300);
    const listings = tables.flatMap((tableMatch, tableIndex) => {
        const tableHtml = tableMatch[0];
        const headers = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
            .flatMap(([, rowHtml]) => extractHeaderCells(rowHtml))
            .filter(Boolean);
        if (!headers.some((header) => header.includes('주택형'))) {
            return [];
        }
        const typeIndex = findHeaderIndex(headers, ['주택형']);
        const areaIndex = findHeaderIndex(headers, ['전용면적']);
        const depositIndex = findHeaderIndex(headers, ['임대보증금']);
        const rentIndex = findHeaderIndex(headers, ['월임대료']);
        const supplyCountIndex = findHeaderIndex(headers, ['금회공급']);
        const rows = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
        return rows
            .map(([, rowHtml]) => [...extractHeaderCells(rowHtml), ...extractCells(rowHtml)])
            .filter((cells) => cells.length > 0)
            .filter((cells) => cells.some((cell) => !headers.includes(cell)))
            .map((cells) => {
            const housingType = cells[typeIndex] ?? '';
            const building = buildings[tableIndex];
            return {
                title: [notice.title, housingType].filter(Boolean).join(' '),
                supplyType: housingType,
                region: notice.region,
                targetTags: notice.targetTags,
                deposit: cells[depositIndex],
                monthlyRent: cells[rentIndex],
                floorAreaM2: cells[areaIndex],
                status: notice.status,
                metadata: {
                    ...(notice.metadata ?? {}),
                    building,
                    supplyCount: supplyCountIndex >= 0 ? cells[supplyCountIndex] : undefined,
                },
            };
        });
    });
    return {
        ...notice,
        ...applicationPeriod,
        metadata: {
            ...(notice.metadata ?? {}),
            ...(attachments.length > 0 ? { attachments } : {}),
            ...(primaryApplicationAttachment ? { primaryApplicationAttachment } : {}),
            bodyPreview,
            ...(eligibilityRequirements ? { eligibilityRequirements } : {}),
        },
        listings: listings.length > 0 ? listings : notice.listings,
    };
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
    const useFixtureFallback = options.useFixtureFallback ?? false;
    const noticesById = new Map();
    return {
        source: 'lh',
        async fetchNotices() {
            const response = await fetchImpl(LH_NOTICE_LIST_URL);
            const html = await response.text();
            const notices = parseLhNoticeListHtml(html);
            const result = notices.length > 0 || !useFixtureFallback ? notices : LH_FIXTURE;
            noticesById.clear();
            result.forEach((notice) => noticesById.set(notice.sourceId, notice));
            return result;
        },
        async fetchNoticeDetails(id) {
            const notice = noticesById.get(id) ?? (useFixtureFallback ? LH_FIXTURE.find((fixture) => fixture.sourceId === id) : undefined);
            if (!notice?.sourceUrl) {
                return notice ?? null;
            }
            const response = await fetchImpl(notice.sourceUrl);
            const html = await response.text();
            return parseLhNoticeDetailHtml(html, notice);
        },
    };
};
