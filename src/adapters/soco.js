import { isActionableNoticeTitle } from '../domain/actionable.js';
const SOCO_PROVIDER = '서울시 청년안심주택';
const SOCO_ORIGIN = 'https://soco.seoul.go.kr';
const SOCO_NOTICE_LIST_URL = `${SOCO_ORIGIN}/youth/bbs/BMSR00015/list.do?menuNo=400008`;
const SOCO_NOTICE_JSON_URL = `${SOCO_ORIGIN}/youth/pgm/home/yohome/bbsListJson.json`;
const stripHtml = (html) => html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
const extractCells = (rowHtml) => Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => stripHtml(match[1]));
const normalizeDate = (value) => {
    const match = value.match(/(\d{4})\s*(?:년|[-.])\s*(\d{1,2})\s*(?:월|[-.])\s*(\d{1,2})\s*일?/);
    if (!match) {
        return undefined;
    }
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};
const extractDates = (value) => Array.from(value.matchAll(/(\d{4})\s*(?:년|[-.])\s*(\d{1,2})\s*(?:월|[-.])\s*(\d{1,2})\s*일?/g)).map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
const decodeHtmlEntities = (value) => value.replace(/&amp;/gi, '&').replace(/&#40;/g, '(').replace(/&#41;/g, ')');
const toAbsoluteSocoUrl = (value) => new URL(decodeHtmlEntities(value), SOCO_ORIGIN).toString();
const extractTitleAndUrl = (rowHtml) => {
    const anchorMatch = rowHtml.match(/<a\b[^>]*href=["']([^"']*BMSR00015[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) {
        return null;
    }
    const sourceUrl = toAbsoluteSocoUrl(anchorMatch[1]);
    const url = new URL(sourceUrl);
    const sourceId = url.searchParams.get('nttId') ?? url.searchParams.get('bbscttSn') ?? url.searchParams.get('seq');
    if (!sourceId) {
        return null;
    }
    return {
        title: stripHtml(anchorMatch[2]),
        sourceUrl,
        sourceId,
    };
};
const inferCategory = (cells) => cells.find((cell) => /^(최초|추가|민간|공공)$/.test(cell));
const mapRentalCategory = (value) => {
    if (value === '1') {
        return '공공';
    }
    if (value === '2') {
        return '민간';
    }
    return undefined;
};
const mapRoundCategory = (value) => {
    if (value === '1') {
        return '최초';
    }
    if (value === '2') {
        return '추가';
    }
    return undefined;
};
const buildTags = (category) => {
    const tags = ['청년', '청년안심주택'];
    if (category) {
        tags.push(category);
    }
    return tags;
};
const buildSocoNotice = ({ sourceId, title, sourceUrl, postedAt, applicationText, category, round, operator, }) => {
    const periodDates = extractDates(applicationText ?? '');
    const applicationStartAt = periodDates[0];
    const applicationEndAt = periodDates[1] ?? periodDates[0];
    const targetTags = ['청년', '청년안심주택', ...[category, round].filter((value) => value != null)];
    const rawIds = { boardId: sourceId };
    return {
        sourceId,
        title,
        status: 'posted',
        region: '서울',
        targetTags,
        postedAt,
        applicationStartAt,
        applicationEndAt,
        sourceUrl,
        metadata: {
            provider: SOCO_PROVIDER,
            ...(category ? { category } : {}),
            ...(round ? { round } : {}),
            ...(operator ? { operator } : {}),
            rawIds,
        },
        listings: [
            {
                title,
                supplyType: '청년안심주택',
                region: '서울',
                targetTags,
                status: 'posted',
                metadata: {
                    rawIds,
                    ...(category ? { category } : {}),
                    ...(round ? { round } : {}),
                    ...(operator ? { operator } : {}),
                },
            },
        ],
    };
};
export const parseSocoNoticeListHtml = (html) => {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const notices = [];
    for (const [, rowHtml] of rows) {
        const titleAndUrl = extractTitleAndUrl(rowHtml);
        if (!titleAndUrl || !isActionableNoticeTitle(titleAndUrl.title)) {
            continue;
        }
        const cells = extractCells(rowHtml);
        const category = inferCategory(cells);
        const postedAt = cells.map(normalizeDate).find((date) => date != null);
        const periodCell = cells.find((cell) => extractDates(cell).length >= 2) ?? '';
        const periodDates = extractDates(periodCell);
        notices.push(buildSocoNotice({
            sourceId: titleAndUrl.sourceId,
            title: titleAndUrl.title,
            sourceUrl: titleAndUrl.sourceUrl,
            postedAt,
            applicationText: periodCell,
            category,
        }));
    }
    return notices;
};
export const parseSocoNoticeListJson = (payload) => (payload.resultList ?? [])
    .map((item) => {
    const sourceId = item.boardId == null ? '' : String(item.boardId);
    const title = stripHtml(item.nttSj ?? '');
    if (!sourceId || !isActionableNoticeTitle(title)) {
        return null;
    }
    const category = mapRentalCategory(item.optn2);
    const round = mapRoundCategory(item.optn5);
    const postedAt = normalizeDate(item.optn1 ?? '');
    const sourceUrl = new URL(`view.do?optn1=${encodeURIComponent(item.optn1 ?? '')}&boardId=${encodeURIComponent(sourceId)}&menuNo=400008&pageIndex=1`, SOCO_NOTICE_LIST_URL).toString();
    return buildSocoNotice({
        sourceId,
        title,
        sourceUrl,
        postedAt,
        applicationText: item.optn4,
        category,
        round,
        operator: stripHtml(item.optn3 ?? ''),
    });
})
    .filter((notice) => notice != null);
export const createSocoAdapter = (options = {}) => {
    const fetchImpl = options.fetch ?? fetch;
    return {
        source: 'soco',
        async fetchNotices() {
            const response = await fetchImpl(SOCO_NOTICE_JSON_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: new URLSearchParams({
                    bbsId: 'BMSR00015',
                    pageIndex: '1',
                    searchAdresGu: '',
                    searchCondition: '',
                    searchKeyword: '',
                    optn2: '',
                    optn5: '',
                }),
            });
            const payload = (await response.json());
            return parseSocoNoticeListJson(payload);
        },
    };
};
