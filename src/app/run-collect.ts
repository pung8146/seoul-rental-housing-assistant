import type { SourceAdapter } from '../adapters/base';
import { createRepository, type Repository } from '../db/repository';
import { diffNoticeAndListings, shouldSnapshotListingEvent } from '../domain/diff';
import { normalizeAdapterOutput } from '../domain/normalize';
import type { NotificationEvent } from '../types';

export type CollectFailure = {
  source: string;
  message: string;
};

export type RunCollectInput = {
  adapters: SourceAdapter[];
  repository: Repository;
};

export type RunCollectResult = {
  events: NotificationEvent[];
  failures: CollectFailure[];
};

const toMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
};

export const runCollect = async ({ adapters, repository }: RunCollectInput): Promise<RunCollectResult> => {
  const events: NotificationEvent[] = [];
  const failures: CollectFailure[] = [];

  for (const adapter of adapters) {
    const startedAt = new Date().toISOString();

    try {
      const rawNotices = await adapter.fetchNotices();
      const { notices, listings } = normalizeAdapterOutput({ source: adapter.source, notices: rawNotices });

      for (const notice of notices) {
        const incomingListings = listings.filter(
          (listing) => listing.source === notice.source && listing.noticeSourceId === notice.sourceId,
        );
        const existingNotice = repository.findNoticeBySourceId(notice.source, notice.sourceId);
        const existingListings = repository.queryListingsByNotice(notice.source, notice.sourceId);
        const diffEvents = diffNoticeAndListings({
          incomingNotice: notice,
          incomingListings,
          existingNotice,
          existingListings,
        });

        repository.upsertNotice(notice);
        for (const listing of incomingListings) {
          repository.upsertListing(listing);
        }
        for (const event of diffEvents) {
          if (event.listing && shouldSnapshotListingEvent(event)) {
            repository.insertListingSnapshot(event.listing);
          }
        }

        events.push(...diffEvents);
      }

      repository.recordSourceRun({
        source: adapter.source,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'success',
        message: null,
      });
    } catch (error) {
      const message = toMessage(error);
      failures.push({ source: adapter.source, message });
      repository.recordSourceRun({
        source: adapter.source,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'failure',
        message,
      });
    }
  }

  return { events, failures };
};

const main = async () => {
  const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');

  try {
    const result = await runCollect({ adapters: [], repository });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    repository.close();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
