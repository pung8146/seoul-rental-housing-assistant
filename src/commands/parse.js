const REGION_ALIASES = {
    서울: '서울',
    서울시: '서울',
    서울특별시: '서울',
    경기: '경기',
    경기도: '경기',
};
const SOURCE_ALIASES = {
    lh: 'lh',
    sh: 'sh',
};
const normalizeWhitespace = (value) => value.trim().replace(/\s+/g, ' ');
const normalizeRegion = (value) => REGION_ALIASES[value] ?? value;
const normalizeSource = (value) => SOURCE_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase();
const parseStructuredFilters = (input) => {
    const filters = {};
    const segments = input
        .split('/')
        .map((segment) => normalizeWhitespace(segment))
        .filter(Boolean);
    for (const segment of segments) {
        const match = segment.match(/^(지역|상태|기관)\s+(.+)$/);
        if (!match) {
            continue;
        }
        const [, key, rawValue] = match;
        const value = normalizeWhitespace(rawValue);
        if (key === '지역') {
            filters.region = normalizeRegion(value);
        }
        else if (key === '상태') {
            filters.status = value;
        }
        else if (key === '기관') {
            filters.source = normalizeSource(value);
        }
    }
    return filters;
};
export const parseCommand = (input) => {
    const normalized = normalizeWhitespace(input);
    const detailMatch = normalized.match(/^(\d+)번(?:\s+자세히)?$/);
    if (detailMatch) {
        return { intent: 'detail', index: Number(detailMatch[1]) };
    }
    const linkOnlyMatch = normalized.match(/^(\d+)번\s+링크만$/);
    if (linkOnlyMatch) {
        return { intent: 'linkOnly', index: Number(linkOnlyMatch[1]) };
    }
    if (normalized.includes('/')) {
        return {
            intent: 'list',
            filters: parseStructuredFilters(normalized),
        };
    }
    if (normalized.includes('오늘')) {
        return {
            intent: 'list',
            filters: {
                postedAfter: 'today',
                postedBefore: 'today',
            },
        };
    }
    const regionMatch = normalized.match(/(서울(?:특별시|시)?|경기(?:도)?)/);
    if (regionMatch) {
        return {
            intent: 'list',
            filters: {
                region: normalizeRegion(regionMatch[1]),
            },
        };
    }
    return {
        intent: 'list',
        filters: {},
    };
};
