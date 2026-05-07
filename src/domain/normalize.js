import { buildChangeHash, buildNoticeChangeHash, buildNoticeStableKey, buildStableKey } from './keys.js';
const REGION_ALIASES = {
    서울특별시: '서울',
    서울시: '서울',
    경기도: '경기',
};
export const cleanupText = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const cleaned = value.trim().replace(/\s+/g, ' ');
    return cleaned.length > 0 ? cleaned : null;
};
export const normalizeRegion = (value) => {
    const cleaned = cleanupText(value);
    if (!cleaned) {
        return null;
    }
    return REGION_ALIASES[cleaned] ?? cleaned;
};
export const parseNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const cleaned = cleanupText(value);
    if (!cleaned) {
        return null;
    }
    const normalized = cleaned.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};
export const parseTags = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => cleanupText(item))
            .filter((item) => item != null);
    }
    const cleaned = cleanupText(value);
    if (!cleaned) {
        return [];
    }
    return cleaned
        .split(/[\/,]/)
        .map((item) => cleanupText(item))
        .filter((item) => item != null);
};
const nullableText = (value) => cleanupText(value);
export const normalizeAdapterOutput = ({ source, notices }) => {
    const normalizedNotices = [];
    const normalizedListings = [];
    for (const rawNotice of notices) {
        const sourceId = cleanupText(rawNotice.sourceId) ?? '';
        const title = cleanupText(rawNotice.title) ?? '';
        const notice = {
            source,
            sourceId,
            title,
            stableKey: '',
            changeHash: '',
            status: nullableText(rawNotice.status),
            region: normalizeRegion(rawNotice.region),
            targetTags: parseTags(rawNotice.targetTags),
            postedAt: nullableText(rawNotice.postedAt),
            applicationStartAt: nullableText(rawNotice.applicationStartAt),
            applicationEndAt: nullableText(rawNotice.applicationEndAt),
            sourceUrl: nullableText(rawNotice.sourceUrl),
            metadata: rawNotice.metadata ?? {},
        };
        notice.stableKey = buildNoticeStableKey(notice);
        notice.changeHash = buildNoticeChangeHash(notice);
        normalizedNotices.push(notice);
        for (const rawListing of rawNotice.listings ?? []) {
            const listingBase = {
                source,
                noticeSourceId: sourceId,
                title: cleanupText(rawListing.title) ?? '',
                stableKey: '',
                changeHash: '',
                supplyType: nullableText(rawListing.supplyType),
                region: normalizeRegion(rawListing.region),
                targetTags: parseTags(rawListing.targetTags),
                deposit: parseNumber(rawListing.deposit),
                monthlyRent: parseNumber(rawListing.monthlyRent),
                floorAreaM2: parseNumber(rawListing.floorAreaM2),
                status: nullableText(rawListing.status),
                metadata: rawListing.metadata ?? {},
            };
            listingBase.stableKey = buildStableKey(listingBase);
            listingBase.changeHash = buildChangeHash(listingBase);
            normalizedListings.push(listingBase);
        }
    }
    return { notices: normalizedNotices, listings: normalizedListings };
};
