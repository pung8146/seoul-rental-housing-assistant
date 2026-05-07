import { createHash } from 'node:crypto';
const normalizeText = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
};
const normalizeNumber = (value) => (value == null ? '' : String(value));
const readMetadataText = (metadata, key) => {
    const value = metadata[key];
    return typeof value === 'string' ? value : '';
};
const hashParts = (parts) => createHash('sha256').update(parts.join('|')).digest('hex');
export const buildStableKey = (listing) => hashParts([
    normalizeText(listing.source),
    normalizeText(listing.noticeSourceId),
    normalizeText(listing.title),
    normalizeText(listing.supplyType),
    normalizeText(listing.region),
    normalizeText(readMetadataText(listing.metadata, 'building')),
    normalizeText(readMetadataText(listing.metadata, 'unit')),
]);
export const buildChangeHash = (listing) => hashParts([
    buildStableKey(listing),
    normalizeNumber(listing.deposit),
    normalizeNumber(listing.monthlyRent),
    normalizeNumber(listing.floorAreaM2),
    normalizeText(listing.status),
    normalizeText(listing.title),
    normalizeText(listing.region),
    normalizeText(listing.supplyType),
    normalizeText(listing.targetTags.join('|')),
]);
export const buildNoticeStableKey = (notice) => `notice:${notice.source}:${notice.sourceId}`;
export const buildNoticeChangeHash = (notice) => hashParts([
    buildNoticeStableKey(notice),
    normalizeText(notice.title),
    normalizeText(notice.status),
    normalizeText(notice.region),
    normalizeText(notice.postedAt),
    normalizeText(notice.applicationStartAt),
    normalizeText(notice.applicationEndAt),
    normalizeText(notice.sourceUrl),
    normalizeText(notice.targetTags.join('|')),
]);
