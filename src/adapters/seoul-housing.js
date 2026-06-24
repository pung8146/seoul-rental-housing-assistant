import { isActionableNoticeTitle } from '../domain/actionable.js';
const SEOUL_HOUSING_PROVIDER = '서울주거포털';
const SEOUL_HOUSING_ORIGIN = 'https://housing.seoul.go.kr';
const SEOUL_HOUSING_PUBLIC_LEASE_URL = `${SEOUL_HOUSING_ORIGIN}/site/main/sh/publicLease/list`;
const stripHtml = (html) => html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
const extractCells = (rowHtml) => Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => stripHtml(match[1] ?? ''));
const extractHref = (rowHtml) => {
    const href = rowHtml.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*바로가기\s*<\/a>/i)?.[1];
    if (!href) {
        return undefined;
    }
    return new URL(href.replace(/&amp;/gi, '&'), SEOUL_HOUSING_ORIGIN).toString();
};
const extractSeq = (sourceUrl, fallback) => {
    if (!sourceUrl) {
        return fallback;
    }
    try {
        const url = new URL(sourceUrl);
        return url.searchParams.get('seq') ?? fallback;
    }
    catch {
        return fallback;
    }
};
const normalizeStatus = (value) => {
    if (value === '모집중') {
        return '공고중';
    }
    if (value === '모집마감') {
        return '마감';
    }
    return value || 'posted';
};
export const parseSeoulHousingPublicLeaseHtml = (html) => {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const notices = [];
    for (const [, rowHtml] of rows) {
        const cells = extractCells(rowHtml);
        if (cells.length < 8) {
            continue;
        }
        const [rowNo, category, title, postedAt, announcedAt, rawStatus, department] = cells;
        if (!title || !isActionableNoticeTitle(title)) {
            continue;
        }
        const sourceUrl = extractHref(rowHtml);
        const sourceId = extractSeq(sourceUrl, rowNo ?? title);
        const status = normalizeStatus(rawStatus ?? '');
        const rawIds = { seq: sourceId };
        const targetTags = category ? [category] : undefined;
        notices.push({
            sourceId,
            title,
            status,
            region: '서울',
            ...(targetTags ? { targetTags } : {}),
            postedAt,
            sourceUrl,
            metadata: {
                provider: SEOUL_HOUSING_PROVIDER,
                ...(category ? { category } : {}),
                ...(department ? { department } : {}),
                ...(announcedAt ? { announcedAt } : {}),
                rawIds,
            },
            listings: [
                {
                    title,
                    supplyType: category,
                    region: '서울',
                    ...(targetTags ? { targetTags } : {}),
                    status,
                    metadata: {
                        rawIds,
                        ...(category ? { category } : {}),
                    },
                },
            ],
        });
    }
    return notices;
};
export const createSeoulHousingAdapter = (options = {}) => {
    const fetchImpl = options.fetch ?? fetch;
    return {
        source: 'seoul-housing',
        async fetchNotices() {
            const response = await fetchImpl(SEOUL_HOUSING_PUBLIC_LEASE_URL);
            const html = await response.text();
            return parseSeoulHousingPublicLeaseHtml(html);
        },
    };
};
