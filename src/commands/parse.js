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
const addTargetTag = (filters, tag) => {
    filters.targetTags = Array.from(new Set([...(filters.targetTags ?? []), tag]));
};
const addNoticeType = (filters, type) => {
    filters.noticeTypes = Array.from(new Set([...(filters.noticeTypes ?? []), type]));
};
const addExcludedNoticeType = (filters, type) => {
    filters.excludedNoticeTypes = Array.from(new Set([...(filters.excludedNoticeTypes ?? []), type]));
};
const hasExcludeKeyword = (input) => /(빼고|제외|아닌|말고)/.test(input);
const parseStructuredFilters = (input) => {
    const filters = {};
    const segments = input
        .split('/')
        .map((segment) => normalizeWhitespace(segment))
        .filter(Boolean);
    for (const segment of segments) {
        const match = segment.match(/^(지역|상태|기관|유형|대상)\s+(.+)$/);
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
        else if (key === '유형') {
            if (value === '임대' || value === '분양' || value === '상가') {
                addNoticeType(filters, value);
            }
            else {
                addTargetTag(filters, value);
            }
        }
        else if (key === '대상') {
            addTargetTag(filters, value);
        }
    }
    return filters;
};
const parseNaturalFilters = (input) => {
    const filters = {};
    const regionMatch = input.match(/(서울(?:특별시|시)?|경기(?:도)?)/);
    if (regionMatch) {
        filters.region = normalizeRegion(regionMatch[1]);
    }
    if (/신청가능|접수중|지원가능/.test(input)) {
        filters.applicationState = 'open';
    }
    else if (/마감\s*(제외|빼고|아닌|안된)|마감공고\s*(제외|빼고)/.test(input)) {
        filters.applicationState = 'notClosed';
    }
    const excludeKeyword = hasExcludeKeyword(input);
    if (/상가|상가임대|임대상가/.test(input)) {
        if (excludeKeyword) {
            addExcludedNoticeType(filters, '상가');
        }
        else {
            addNoticeType(filters, '상가');
        }
    }
    else if (/분양|공공분양|분양주택|사전청약/.test(input)) {
        if (excludeKeyword) {
            addExcludedNoticeType(filters, '분양');
        }
        else {
            addNoticeType(filters, '분양');
            addTargetTag(filters, '분양');
        }
    }
    else if (/임대/.test(input)) {
        if (excludeKeyword) {
            addExcludedNoticeType(filters, '임대');
        }
        else {
            addNoticeType(filters, '임대');
        }
    }
    if (/신혼|신혼부부/.test(input)) {
        addTargetTag(filters, '신혼부부');
    }
    if (/청년|대학생/.test(input)) {
        addTargetTag(filters, '청년');
    }
    if (/행복주택/.test(input)) {
        addTargetTag(filters, '행복주택');
    }
    if (/매입임대/.test(input)) {
        addTargetTag(filters, '매입임대');
    }
    if (/전세임대/.test(input)) {
        addTargetTag(filters, '전세임대');
    }
    if (/국민임대/.test(input)) {
        addTargetTag(filters, '국민임대');
    }
    if (/장기전세/.test(input)) {
        addTargetTag(filters, '장기전세');
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
    const naturalFilters = parseNaturalFilters(normalized);
    if (Object.keys(naturalFilters).length > 0) {
        return {
            intent: 'list',
            filters: naturalFilters,
        };
    }
    return {
        intent: 'list',
        filters: {},
    };
};
