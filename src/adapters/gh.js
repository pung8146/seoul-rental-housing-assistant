import { request as httpsRequest } from 'node:https';
import { isActionableNoticeTitle } from '../domain/actionable.js';
import { findPrimaryApplicationAttachment } from '../domain/attachments.js';
import { extractEligibilityRequirementsFromText } from '../domain/requirements.js';
const GH_PROVIDER = 'GH';
const GH_ORIGIN = 'https://gh.or.kr';
const GH_HOUSING_NOTICE_LIST_URL = 'https://gh.or.kr/gh/announcement-of-salerental001.do?srCategoryId=12';
const GH_APPLY_ORIGIN = 'https://apply.gh.or.kr';
const GH_APPLY_RENT_NOTICE_LIST_URL = `${GH_APPLY_ORIGIN}/sb/sr/sr7150/selectPbancRentHouseList.do`;
const GH_APPLY_RENT_NOTICE_DETAIL_URL = `${GH_APPLY_ORIGIN}/sb/sr/sr7150/selectPbancDetailView.do`;
const GH_APPLY_PURCHASE_NOTICE_LIST_URL = `${GH_APPLY_ORIGIN}/sb/sr/sr7155/selectPbancRentHouseList.do`;
const GH_APPLY_PURCHASE_NOTICE_DETAIL_URL = `${GH_APPLY_ORIGIN}/sb/sr/sr7155/selectPbancDetailView.do`;
const GH_APPLY_SHOP_NOTICE_LIST_URL = `${GH_APPLY_ORIGIN}/sb/sr/sr7170/selectPbancRentSopsrtList.do`;
const GH_APPLY_SHOP_NOTICE_DETAIL_URL = `${GH_APPLY_ORIGIN}/sb/sr/sr7170/selectPbancDetailView.do`;
const GH_APPLY_NOTICE_SOURCES = [
    {
        category: '임대주택',
        listUrl: GH_APPLY_RENT_NOTICE_LIST_URL,
        detailUrl: GH_APPLY_RENT_NOTICE_DETAIL_URL,
        sourceIdPrefix: 'apply-rent',
    },
    {
        category: '매입임대',
        listUrl: GH_APPLY_PURCHASE_NOTICE_LIST_URL,
        detailUrl: GH_APPLY_PURCHASE_NOTICE_DETAIL_URL,
        sourceIdPrefix: 'apply-purchase',
    },
    {
        category: '임대상가',
        listUrl: GH_APPLY_SHOP_NOTICE_LIST_URL,
        detailUrl: GH_APPLY_SHOP_NOTICE_DETAIL_URL,
        sourceIdPrefix: 'apply-shop',
    },
];
const stripHtml = (html) => decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
const isGhApplyUrl = (url) => {
    try {
        return new URL(url).hostname === 'apply.gh.or.kr';
    }
    catch {
        return false;
    }
};
const isCertificateVerificationError = (error) => {
    const cause = error instanceof Error ? error.cause : undefined;
    return cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
};
const fetchGhApplyTextWithoutCertificateVerification = (url) => new Promise((resolve, reject) => {
    const request = httpsRequest(url, { rejectUnauthorized: false }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('error', reject);
    request.setTimeout(15_000, () => request.destroy(new Error('GH apply request timeout')));
    request.end();
});
const fetchText = async (url, fetchImpl) => {
    try {
        const response = fetchImpl === fetch
            ? await fetchImpl(url, { signal: AbortSignal.timeout(15_000) })
            : await fetchImpl(url);
        return await response.text();
    }
    catch (error) {
        if (fetchImpl === fetch && isGhApplyUrl(url) && isCertificateVerificationError(error)) {
            return fetchGhApplyTextWithoutCertificateVerification(url);
        }
        throw error;
    }
};
const decodeHtmlEntities = (value) => value
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&e;/gi, 'e');
const toAbsoluteUrl = (url, baseUrl) => {
    const decodedUrl = decodeHtmlEntities(url);
    try {
        return new URL(decodedUrl, baseUrl).toString();
    }
    catch {
        return decodedUrl;
    }
};
const toAbsoluteGhUrl = (url) => toAbsoluteUrl(url, GH_HOUSING_NOTICE_LIST_URL);
const toAbsoluteGhApplyUrl = (url) => toAbsoluteUrl(url, GH_APPLY_RENT_NOTICE_LIST_URL);
const extractCells = (rowHtml) => {
    const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
    return matches.map((match) => stripHtml(match[1] ?? ''));
};
const extractAttribute = (html, name) => {
    const match = html.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
    return match ? decodeHtmlEntities(match[1] ?? '') : null;
};
const extractRowTextLines = (rowHtml) => rowHtml
    .split(/\r?\n/g)
    .map(stripHtml)
    .filter((line) => line.length > 0 && line !== '확인');
const normalizeGhDate = (value) => {
    const match = value.match(/^(\d{2,4})[.-](\d{1,2})[.-](\d{1,2})$/);
    if (!match) {
        return value;
    }
    const rawYear = match[1] ?? '';
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const month = (match[2] ?? '').padStart(2, '0');
    const day = (match[3] ?? '').padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const DATE_TEXT_PATTERN = /(\d{4})\s*(?:년|[-.])\s*(\d{1,2})\s*(?:월|[-.])\s*(\d{1,2})\s*일?/g;
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
const extractTitle = (rowHtml) => {
    const linkMatch = rowHtml.match(/<a\b[^>]*href=["'][^"']*articleNo=\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    return stripHtml(linkMatch?.[1] ?? '');
};
const preferPdfAttachments = (attachments) => [...attachments].sort((left, right) => {
    const leftIsPdf = /\.pdf(?:$|[?#])/i.test(left.title) || /\.pdf(?:$|[?#])/i.test(left.url);
    const rightIsPdf = /\.pdf(?:$|[?#])/i.test(right.title) || /\.pdf(?:$|[?#])/i.test(right.url);
    return Number(rightIsPdf) - Number(leftIsPdf);
});
const extractAttachments = (html) => {
    const items = Array.from(html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi));
    const attachments = items
        .map(([, itemHtml]) => {
        const title = stripHtml(itemHtml?.match(/<div\b[^>]*class=["'][^"']*fileNm[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '');
        const href = itemHtml?.match(/<a\b[^>]*href=["']([^"']*mode=download[^"']*)["'][^>]*>/i)?.[1] ?? '';
        return {
            title,
            url: href ? toAbsoluteGhUrl(href) : '',
        };
    })
        .filter((attachment) => attachment.title.length > 0 && attachment.url.length > 0);
    if (attachments.length > 0) {
        return preferPdfAttachments(attachments);
    }
    const fallbackAttachments = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']*mode=download[^"']*)["'][^>]*title=["']([^"']*)["'][^>]*>/gi))
        .map(([, href, title]) => ({
        title: stripHtml(decodeHtmlEntities(title ?? '').replace(/\s*다운로드\s*$/g, '')),
        url: toAbsoluteGhUrl(href ?? ''),
    }))
        .filter((attachment) => attachment.title.length > 0 && attachment.url.length > 0);
    return preferPdfAttachments(fallbackAttachments);
};
const extractBodyPreview = (html) => stripHtml(html.match(/<div\b[^>]*class=["'][^"']*fr-view[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? html).slice(0, 300);
export const parseGhNoticeListHtml = (html) => {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const notices = [];
    for (const [, rowHtml] of rows) {
        const linkMatch = rowHtml.match(/<a\b[^>]*href=["']([^"']*articleNo=(\d+)[^"']*)["'][^>]*>/i);
        if (!linkMatch) {
            continue;
        }
        const href = linkMatch[1] ?? '';
        const articleNo = linkMatch[2] ?? '';
        const title = extractTitle(rowHtml);
        if (!articleNo || !title || !isActionableNoticeTitle(title)) {
            continue;
        }
        const cells = extractCells(rowHtml);
        const category = cells[1] ?? '주택';
        const department = cells[3] ?? '';
        const postedAt = normalizeGhDate(cells.find((cell) => /^\d{2,4}[.-]\d{1,2}[.-]\d{1,2}$/.test(cell)) ?? '');
        const sourceUrl = toAbsoluteGhUrl(href);
        const rawIds = { articleNo };
        notices.push({
            sourceId: articleNo,
            title,
            status: 'posted',
            region: '경기',
            postedAt,
            sourceUrl,
            metadata: {
                provider: GH_PROVIDER,
                category,
                department,
                rawIds,
            },
            listings: [
                {
                    title,
                    supplyType: category,
                    region: '경기',
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
const extractApplyTitle = (rowHtml) => {
    const linkMatch = rowHtml.match(/<a\b[^>]*data-pbancNo=["']\d+["'][^>]*>([\s\S]*?)<\/a>/i);
    return stripHtml(linkMatch?.[1] ?? '');
};
const normalizeApplyStatus = (value) => {
    if (value === '접수중') {
        return '신청가능';
    }
    if (value === '접수마감') {
        return '마감';
    }
    return value;
};
export const parseGhApplyNoticeListHtml = (html, source = GH_APPLY_NOTICE_SOURCES[0]) => {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const notices = [];
    for (const [, rowHtml] of rows) {
        const pbancNo = extractAttribute(rowHtml, 'data-pbancNo');
        const title = extractApplyTitle(rowHtml);
        if (!pbancNo || !title || !isActionableNoticeTitle(title)) {
            continue;
        }
        const textLines = extractRowTextLines(rowHtml);
        const bizType = extractAttribute(rowHtml, 'data-bizTyNm') ?? textLines[1] ?? '임대주택';
        const dates = textLines.filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
        const status = normalizeApplyStatus(textLines.find((line) => /^(접수중|접수예정|접수마감|마감|공고중)$/.test(line)) ?? 'posted');
        const firstDateIndex = textLines.findIndex((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
        const locality = firstDateIndex > 0 ? textLines[firstDateIndex - 1] : '';
        const sourceUrl = `${source.detailUrl}?pbancNo=${encodeURIComponent(pbancNo)}`;
        const rawIds = { pbancNo };
        const targetTags = source.category === '임대상가' ? ['상가임대'] : undefined;
        notices.push({
            sourceId: `${source.sourceIdPrefix}-${pbancNo}`,
            title,
            status,
            region: '경기',
            ...(targetTags ? { targetTags } : {}),
            postedAt: dates[0],
            applicationEndAt: dates[1],
            sourceUrl,
            metadata: {
                provider: GH_PROVIDER,
                channel: 'apply-center',
                category: source.category,
                ...(locality ? { locality } : {}),
                skipDocumentText: true,
                rawIds,
            },
            listings: [
                {
                    title,
                    supplyType: bizType,
                    region: '경기',
                    ...(targetTags ? { targetTags } : {}),
                    status,
                    metadata: {
                        ...(locality ? { locality } : {}),
                        rawIds,
                    },
                },
            ],
        });
    }
    return notices;
};
const extractApplyAttachments = (html) => {
    const attachments = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']*selectFileDown\.do[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi))
        .map(([, href, title]) => ({
        title: stripHtml(title ?? '').replace(/\s*\(\d+\s*Byte\)\s*$/i, ''),
        url: toAbsoluteGhApplyUrl(href ?? ''),
    }))
        .filter((attachment) => attachment.title.length > 0 && attachment.url.length > 0);
    return preferPdfAttachments(attachments);
};
export const parseGhNoticeDetailHtml = (html, notice) => {
    const isApplyCenter = notice.metadata?.channel === 'apply-center';
    const attachments = isApplyCenter ? extractApplyAttachments(html) : extractAttachments(html);
    const primaryApplicationAttachment = findPrimaryApplicationAttachment(attachments);
    const bodyPreview = extractBodyPreview(html);
    const eligibilityRequirements = extractEligibilityRequirementsFromText(stripHtml(html));
    return {
        ...notice,
        ...extractApplicationPeriod(html),
        metadata: {
            ...(notice.metadata ?? {}),
            attachments,
            ...(primaryApplicationAttachment ? { primaryApplicationAttachment } : {}),
            bodyPreview,
            ...(eligibilityRequirements ? { eligibilityRequirements } : {}),
        },
    };
};
const GH_FIXTURE = [
    {
        sourceId: 'gh-notice-1',
        title: 'GH 경기행복주택 입주자 모집공고',
        status: 'posted',
        region: '경기',
        targetTags: ['행복주택', '청년'],
        postedAt: '2026-05-07',
        sourceUrl: 'https://example.com/gh/notices/1',
        metadata: { provider: GH_PROVIDER, fixture: true },
        listings: [
            {
                title: 'GH 경기행복주택 입주자 모집공고',
                supplyType: '주택',
                region: '경기',
                targetTags: ['행복주택', '청년'],
                status: 'posted',
                metadata: { fixture: true },
            },
        ],
    },
];
export const createGhAdapter = (options = {}) => {
    const fetchImpl = options.fetch ?? fetch;
    const fetchApplyDetails = options.fetchApplyDetails ?? false;
    const useFixtureFallback = options.useFixtureFallback ?? false;
    const noticesById = new Map();
    return {
        source: 'gh',
        async fetchNotices() {
            const html = await fetchText(GH_HOUSING_NOTICE_LIST_URL, fetchImpl);
            const applyNoticeGroups = await Promise.all(GH_APPLY_NOTICE_SOURCES.map(async (source) => parseGhApplyNoticeListHtml(await fetchText(source.listUrl, fetchImpl), source)));
            const notices = [...parseGhNoticeListHtml(html), ...applyNoticeGroups.flat()];
            const result = notices.length > 0 || !useFixtureFallback ? notices : GH_FIXTURE;
            noticesById.clear();
            result.forEach((notice) => noticesById.set(notice.sourceId, notice));
            return result;
        },
        async fetchNoticeDetails(id) {
            const notice = noticesById.get(id) ?? (useFixtureFallback ? GH_FIXTURE.find((fixture) => fixture.sourceId === id) : undefined);
            if (!notice?.sourceUrl) {
                return notice ?? null;
            }
            if (notice.metadata?.channel === 'apply-center' && !fetchApplyDetails) {
                return {
                    ...notice,
                    metadata: {
                        ...(notice.metadata ?? {}),
                        detailSkipped: 'apply-center-default',
                    },
                };
            }
            const html = await fetchText(notice.sourceUrl, fetchImpl);
            return parseGhNoticeDetailHtml(html, notice);
        },
    };
};
