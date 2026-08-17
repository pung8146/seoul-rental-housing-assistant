import type { SourceAdapter } from '../adapters/base.js';
import type { RawNoticeCandidate } from '../adapters/base.js';
import { createLhAdapter } from '../adapters/lh.js';
import { createShAdapter } from '../adapters/sh.js';
import { createGhAdapter } from '../adapters/gh.js';
import { createSocoAdapter } from '../adapters/soco.js';
import { createSeoulHousingAdapter } from '../adapters/seoul-housing.js';
import { createApplyHomeAdapter } from '../adapters/applyhome.js';
import { createRepository, type Repository } from '../db/repository.js';
import { diffNoticeAndListings, shouldSnapshotListingEvent } from '../domain/diff.js';
import { findPrimaryApplicationAttachment, type Attachment } from '../domain/attachments.js';
import { fetchDocumentTexts } from '../domain/document-text.js';
import { normalizeAdapterOutput, normalizeRegion } from '../domain/normalize.js';
import { extractEligibilityRequirementsFromText } from '../domain/requirements.js';
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
  documentFetch?: typeof fetch;
};

export type RunCollectResult = {
  events: NotificationEvent[];
  failures: CollectFailure[];
  successfulSourceCount: number;
};

const toMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
};

const DETAIL_FETCH_CONCURRENCY = 5;
const DOCUMENT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_COLLECT_REGIONS = ['서울', '경기'];
const EMPTY_COLLECT_MESSAGE = '수집 결과가 0건입니다. 사이트 구조 변경이나 일시적인 빈 응답을 확인하세요.';

export const createDefaultAdapters = (): SourceAdapter[] => {
  const adapters: SourceAdapter[] = [
    createLhAdapter(),
    createShAdapter(),
    createGhAdapter(),
    createSocoAdapter(),
    createSeoulHousingAdapter(),
  ];

  if (process.env.CHUNGYAK_HOME_SERVICE_KEY) {
    adapters.push(createApplyHomeAdapter());
  }

  return adapters;
};

export const formatCollectResult = (result: Pick<RunCollectResult, 'events' | 'failures'>): string =>
  formatDailySummary(result.events, result.failures) || '새 공고/변경 없음';

const filterNoticesByRegion = (rawNotices: RawNoticeCandidate[], regions: string[]): RawNoticeCandidate[] =>
  rawNotices.filter((notice) => {
    const region = normalizeRegion(notice.region);
    return region ? regions.includes(region) : true;
  });

const hydrateNoticeDetails = async (
  adapter: SourceAdapter,
  rawNotices: RawNoticeCandidate[],
): Promise<{ notices: RawNoticeCandidate[]; failures: CollectFailure[] }> => {
  if (!adapter.fetchNoticeDetails) {
    return { notices: rawNotices, failures: [] };
  }

  const hydrated: RawNoticeCandidate[] = [];
  const detailFailures: CollectFailure[] = [];
  for (let index = 0; index < rawNotices.length; index += DETAIL_FETCH_CONCURRENCY) {
    const chunk = rawNotices.slice(index, index + DETAIL_FETCH_CONCURRENCY);
    const detailedChunk = await Promise.all(
      chunk.map(async (rawNotice) => {
        try {
          const detailedNotice = await adapter.fetchNoticeDetails?.(rawNotice.sourceId);
          return detailedNotice ?? rawNotice;
        } catch (error) {
          detailFailures.push({
            source: adapter.source,
            message: `상세 수집 실패 ${rawNotice.sourceId}: ${toMessage(error)}`,
          });
          return rawNotice;
        }
      }),
    );
    hydrated.push(...detailedChunk);
  }

  return { notices: hydrated, failures: detailFailures };
};

const getAttachments = (notice: RawNoticeCandidate): Attachment[] => {
  const attachments = notice.metadata?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.filter(
    (attachment): attachment is Attachment =>
      typeof attachment === 'object' &&
      attachment !== null &&
      typeof (attachment as Attachment).title === 'string' &&
      typeof (attachment as Attachment).url === 'string',
  );
};

const hydrateNoticeDocumentTexts = async (
  notices: RawNoticeCandidate[],
  fetchImpl: typeof fetch,
): Promise<RawNoticeCandidate[]> => {
  const hydrated: RawNoticeCandidate[] = [];

  for (const notice of notices) {
    const attachments = getAttachments(notice);
    const primaryAttachment = findPrimaryApplicationAttachment(attachments);
    if (!primaryAttachment || notice.metadata?.eligibilityRequirements || notice.metadata?.skipDocumentText) {
      hydrated.push(notice);
      continue;
    }

    const documentText = await fetchDocumentTexts([primaryAttachment], fetchImpl);
    const extractedText = documentText.results[0]?.text;
    const eligibilityRequirements = extractedText
      ? extractEligibilityRequirementsFromText(extractedText)
      : undefined;
    const failures = documentText.failures.map((failure) => ({
      title: failure.attachment.title,
      message: failure.message,
    }));

    hydrated.push({
      ...notice,
      metadata: {
        ...(notice.metadata ?? {}),
        ...(extractedText ? { attachmentBodyPreview: extractedText.slice(0, 300) } : {}),
        ...(eligibilityRequirements ? { eligibilityRequirements } : {}),
        ...(failures.length > 0 ? { attachmentTextFailures: failures } : {}),
      },
    });
  }

  return hydrated;
};

const withTimeoutFetch = (fetchImpl: typeof fetch, timeoutMs: number): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) =>
    fetchImpl(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    })) as typeof fetch;

export const runCollect = async ({
  adapters,
  repository,
  regions = DEFAULT_COLLECT_REGIONS,
  documentFetch = fetch,
}: RunCollectInput): Promise<RunCollectResult> => {
  const events: NotificationEvent[] = [];
  const failures: CollectFailure[] = [];
  let successfulSourceCount = 0;

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
      const detailResult = await hydrateNoticeDetails(adapter, scopedNotices);
      failures.push(...detailResult.failures);
      const detailedNotices = await hydrateNoticeDocumentTexts(
        detailResult.notices,
        withTimeoutFetch(documentFetch, DOCUMENT_FETCH_TIMEOUT_MS),
      );
      const { notices, listings } = normalizeAdapterOutput({ source: adapter.source, notices: detailedNotices });

      const sourceEvents = repository.withTransaction(() => {
        const stagedEvents: NotificationEvent[] = [];

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

          stagedEvents.push(...diffEvents);
        }

        repository.recordSourceRun({
          source: adapter.source,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: detailResult.failures.length > 0 ? 'partial' : 'success',
          message: detailResult.failures.length > 0 ? `상세 수집 실패 ${detailResult.failures.length}건` : null,
        });
        return stagedEvents;
      });

      events.push(...sourceEvents);
      successfulSourceCount += 1;
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

  return { events, failures, successfulSourceCount };
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
