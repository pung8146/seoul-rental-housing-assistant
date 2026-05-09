import { createLhAdapter } from '../adapters/lh.js';
import { createShAdapter } from '../adapters/sh.js';
import { createRepository } from '../db/repository.js';
import { diffNoticeAndListings, shouldSnapshotListingEvent } from '../domain/diff.js';
import { normalizeAdapterOutput } from '../domain/normalize.js';
import { formatDailySummary } from '../notifier/formatter.js';
const toMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return 'unknown error';
};
export const createDefaultAdapters = () => [createLhAdapter(), createShAdapter()];
export const formatCollectResult = (result) => formatDailySummary(result.events, result.failures) || '새 공고/변경 없음';
export const runCollect = async ({ adapters, repository }) => {
    const events = [];
    const failures = [];
    for (const adapter of adapters) {
        const startedAt = new Date().toISOString();
        try {
            const rawNotices = await adapter.fetchNotices();
            const { notices, listings } = normalizeAdapterOutput({ source: adapter.source, notices: rawNotices });
            for (const notice of notices) {
                const incomingListings = listings.filter((listing) => listing.source === notice.source && listing.noticeSourceId === notice.sourceId);
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
        }
        catch (error) {
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
        }
        else {
            console.log(formatCollectResult(result));
        }
    }
    finally {
        repository.close();
    }
};
if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
