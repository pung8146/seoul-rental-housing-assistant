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
const uniqueTags = (tags) => Array.from(new Set(tags));
export const deriveTargetTags = (...values) => {
    const text = values
        .map((value) => cleanupText(value))
        .filter((value) => value != null)
        .join(' ');
    const tags = [];
    if (/분양|공공분양|분양주택|사전청약/.test(text)) {
        tags.push('분양');
    }
    if (/신혼|신혼부부/.test(text)) {
        tags.push('신혼부부');
    }
    if (/청년|대학생/.test(text)) {
        tags.push('청년');
    }
    if (/행복주택/.test(text)) {
        tags.push('행복주택');
    }
    if (/매입임대/.test(text)) {
        tags.push('매입임대');
    }
    if (/전세임대/.test(text)) {
        tags.push('전세임대');
    }
    if (/국민임대/.test(text)) {
        tags.push('국민임대');
    }
    if (/장기전세/.test(text)) {
        tags.push('장기전세');
    }
    if (/공공임대/.test(text)) {
        tags.push('공공임대');
    }
    return uniqueTags(tags);
};
export const normalizeAdapterOutput = ({ source, notices }) => {
    const normalizedNotices = [];
    const normalizedListings = [];
    for (const rawNotice of notices) {
        const sourceId = cleanupText(rawNotice.sourceId) ?? '';
        const title = cleanupText(rawNotice.title) ?? '';
        const listingTagTexts = (rawNotice.listings ?? []).flatMap((listing) => [
            listing.title,
            listing.supplyType,
            listing.targetTags,
        ]);
        const notice = {
            source,
            sourceId,
            title,
            stableKey: '',
            changeHash: '',
            status: nullableText(rawNotice.status),
            region: normalizeRegion(rawNotice.region),
            targetTags: uniqueTags([...parseTags(rawNotice.targetTags), ...deriveTargetTags(title, ...listingTagTexts)]),
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
            const listingTitle = cleanupText(rawListing.title) ?? '';
            const listingSupplyType = nullableText(rawListing.supplyType);
            const listingBase = {
                source,
                noticeSourceId: sourceId,
                title: listingTitle,
                stableKey: '',
                changeHash: '',
                supplyType: listingSupplyType,
                region: normalizeRegion(rawListing.region),
                targetTags: uniqueTags([
                    ...parseTags(rawListing.targetTags),
                    ...deriveTargetTags(title, listingTitle, listingSupplyType),
                ]),
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
