import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRepository } from '../db/repository.js';
import { detectPublicNoticeTypes } from './notice-type.js';
const toPublicListing = (listing) => ({
    title: listing.title,
    supplyType: listing.supplyType,
    region: listing.region,
    status: listing.status,
    targetTags: listing.targetTags,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    floorAreaM2: listing.floorAreaM2,
    metadata: listing.metadata,
});
const toPublicMetadata = (metadata) => ({
    ...metadata,
    attachments: Array.isArray(metadata.attachments) ? metadata.attachments : [],
});
const toPublicNotice = (notice, listings) => ({
    source: notice.source,
    sourceId: notice.sourceId,
    title: notice.title,
    region: notice.region,
    status: notice.status,
    postedAt: notice.postedAt,
    applicationStartAt: notice.applicationStartAt,
    applicationEndAt: notice.applicationEndAt,
    sourceUrl: notice.sourceUrl,
    targetTags: notice.targetTags,
    typeLabels: detectPublicNoticeTypes(notice),
    metadata: toPublicMetadata(notice.metadata),
    listings: listings.map(toPublicListing),
});
export const buildPublicFeed = ({ generatedAt = new Date().toISOString(), notices, getListings }) => ({
    generatedAt,
    notices: notices.map((notice) => toPublicNotice(notice, getListings(notice.source, notice.sourceId))),
});
export const exportPublicFeed = async ({ repository, outputPath, }) => {
    const feed = buildPublicFeed({
        notices: repository.queryNotices({}),
        getListings: (source, sourceId) => repository.queryListingsByNotice(source, sourceId),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
    return feed;
};
const main = async () => {
    const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
    const outputPath = resolve(process.env.PUBLIC_FEED_PATH ?? 'public/public-feed.json');
    try {
        const feed = await exportPublicFeed({ repository, outputPath });
        console.log(`public feed exported: ${outputPath} (${feed.notices.length} notices)`);
    }
    finally {
        repository.close();
    }
};
if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
