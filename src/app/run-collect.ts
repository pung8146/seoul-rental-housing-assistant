import type { SourceAdapter } from '../adapters/base.js';
import type { RawNoticeCandidate } from '../adapters/base.js';
import { createLhAdapter } from '../adapters/lh.js';
import { createShAdapter } from '../adapters/sh.js';
import { createRepository, type Repository } from '../db/repository.js';
import { diffNoticeAndListings, shouldSnapshotListingEvent } from '../domain/diff.js';
import { normalizeAdapterOutput, normalizeRegion } from '../domain/normalize.js';
import { formatDailySummary } from '../notifier/formatter.js';
import type { NotificationEvent } from '../types.js';

export type CollectFailure = {
  source: string;
  message: string;
};

export type RunCollectInput = {
  adapters: SourceAdapter[];
  repository: Repository;
  regions?: string[];
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

const DETAIL_FETCH_CONCURRENCY = 5;
const DEFAULT_COLLECT_REGIONS = ['서울', '경기'];
const EMPTY_COLLECT_MESSAGE = '수집 결과가 0건입니다. 사이트 구조 변경이나 일시적인 빈 응답을 확인하세요.';

export const createDefaultAdapters = (): SourceAdapter[] => [createLhAdapter(), createShAdapter()];

export const formatCollectResult = (result: RunCollectResult): string =>
  formatDailySummary(result.events, result.failures) || '새 공고/변경 없음';

const filterNoticesByRegion = (rawNotices: RawNoticeCandidate[], regions: string[]): RawNoticeCandidate[] =>
  rawNotices.filter((notice) => {
    const region = normalizeRegion(notice.region);
    return region ? regions.includes(region) : true;
  });

const hydrateNoticeDetails = async (
  adapter: SourceAdapter,
  rawNotices: RawNoticeCandidate[],
): Promise<RawNoticeCandidate[]> => {
  if (!adapter.fetchNoticeDetails) {
    return rawNotices;
  }

  const hydrated: RawNoticeCandidate[] = [];
  for (let index = 0; index < rawNotices.length; index += DETAIL_FETCH_CONCURRENCY) {
    const chunk = rawNotices.slice(index, index + DETAIL_FETCH_CONCURRENCY);
    const detailedChunk = await Promise.all(
      chunk.map(async (rawNotice) => {
        const detailedNotice = await adapter.fetchNoticeDetails?.(rawNotice.sourceId);
        return detailedNotice ?? rawNotice;
      }),
    );
    hydrated.push(...detailedChunk);
  }

  return hydrated;
};

export const runCollect = async ({
  adapters,
  repository,
  regions = DEFAULT_COLLECT_REGIONS,
}: RunCollectInput): Promise<RunCollectResult> => {
  const events: NotificationEvent[] = [];
  const failures: CollectFailure[] = [];

  for (const adapter of adapters) {
    const startedAt = new Date().toISOString();

    try {
      const rawNotices = await adapter.fetchNotices();
      if (rawNotices.length === 0) {
        failures.push({ source: adapter.source, message: EMPTY_COLLECT_MESSAGE });
        repository.recordSourceRun({
          source: adapter.source,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: 'partial',
          message: EMPTY_COLLECT_MESSAGE,
        });
        continue;
      }

      const scopedNotices = filterNoticesByRegion(rawNotices, regions);
      const detailedNotices = await hydrateNoticeDetails(adapter, scopedNotices);
      const { notices, listings } = normalizeAdapterOutput({ source: adapter.source, notices: detailedNotices });

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
        repository.deleteStaleListingsByNotice(
          notice.source,
          notice.sourceId,
          incomingListings.map((listing) => listing.stableKey),
        );
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
    const result = await runCollect({ adapters: createDefaultAdapters(), repository });
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatCollectResult(result));
    }
  } finally {
    repository.close();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
