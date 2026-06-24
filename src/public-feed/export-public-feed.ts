import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createRepository, type Repository } from '../db/repository.js';
import { dedupeNoticesForDisplay } from '../domain/notice-dedupe.js';
import type { Listing, Notice } from '../types.js';
import { detectPublicNoticeTypes, type PublicNoticeTypeLabel } from './notice-type.js';

export type PublicFeedListing = {
  title: string;
  supplyType: string | null;
  region: string | null;
  status: string | null;
  targetTags: string[];
  deposit: number | null;
  monthlyRent: number | null;
  floorAreaM2: number | null;
  metadata: Record<string, unknown>;
};

export type PublicFeedNotice = {
  source: string;
  sourceId: string;
  title: string;
  region: string | null;
  status: string | null;
  postedAt: string | null;
  applicationStartAt: string | null;
  applicationEndAt: string | null;
  sourceUrl: string | null;
  targetTags: string[];
  typeLabels: PublicNoticeTypeLabel[];
  metadata: Record<string, unknown>;
  listings: PublicFeedListing[];
};

export type PublicFeed = {
  generatedAt: string;
  notices: PublicFeedNotice[];
};

export type BuildPublicFeedInput = {
  generatedAt?: string;
  notices: Notice[];
  getListings(source: string, sourceId: string): Listing[];
};

const toPublicListing = (listing: Listing): PublicFeedListing => ({
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

const toPublicMetadata = (metadata: Record<string, unknown>): Record<string, unknown> => ({
  ...metadata,
  attachments: Array.isArray(metadata.attachments) ? metadata.attachments : [],
});

const toPublicNotice = (notice: Notice, listings: Listing[]): PublicFeedNotice => ({
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

export const buildPublicFeed = ({ generatedAt = new Date().toISOString(), notices, getListings }: BuildPublicFeedInput): PublicFeed => ({
  generatedAt,
  notices: dedupeNoticesForDisplay(notices).map((notice) => toPublicNotice(notice, getListings(notice.source, notice.sourceId))),
});

export const exportPublicFeed = async ({
  repository,
  outputPath,
}: {
  repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice'>;
  outputPath: string;
}): Promise<PublicFeed> => {
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
  } finally {
    repository.close();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
