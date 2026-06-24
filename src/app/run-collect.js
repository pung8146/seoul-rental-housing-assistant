import { createLhAdapter } from '../adapters/lh.js';
import { createShAdapter } from '../adapters/sh.js';
import { createGhAdapter } from '../adapters/gh.js';
import { createSocoAdapter } from '../adapters/soco.js';
import { createSeoulHousingAdapter } from '../adapters/seoul-housing.js';
import { createRepository } from '../db/repository.js';
import { diffNoticeAndListings, shouldSnapshotListingEvent } from '../domain/diff.js';
import { findPrimaryApplicationAttachment } from '../domain/attachments.js';
import { fetchDocumentTexts } from '../domain/document-text.js';
import { normalizeAdapterOutput, normalizeRegion } from '../domain/normalize.js';
import { extractEligibilityRequirementsFromText } from '../domain/requirements.js';
import { formatDailySummary } from '../notifier/formatter.js';
const toMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return 'unknown error';
};
const DETAIL_FETCH_CONCURRENCY = 5;
const DOCUMENT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_COLLECT_REGIONS = ['서울', '경기'];
const EMPTY_COLLECT_MESSAGE = '수집 결과가 0건입니다. 사이트 구조 변경이나 일시적인 빈 응답을 확인하세요.';
export const createDefaultAdapters = () => [
    createLhAdapter(),
    createShAdapter(),
    createGhAdapter(),
    createSocoAdapter(),
    createSeoulHousingAdapter(),
];
export const formatCollectResult = (result) => formatDailySummary(result.events, result.failures) || '새 공고/변경 없음';
const filterNoticesByRegion = (rawNotices, regions) => rawNotices.filter((notice) => {
    const region = normalizeRegion(notice.region);
    return region ? regions.includes(region) : true;
});
const hydrateNoticeDetails = async (adapter, rawNotices) => {
    if (!adapter.fetchNoticeDetails) {
        return { notices: rawNotices, failures: [] };
    }
    const hydrated = [];
    const detailFailures = [];
    for (let index = 0; index < rawNotices.length; index += DETAIL_FETCH_CONCURRENCY) {
        const chunk = rawNotices.slice(index, index + DETAIL_FETCH_CONCURRENCY);
        const detailedChunk = await Promise.all(chunk.map(async (rawNotice) => {
            try {
                const detailedNotice = await adapter.fetchNoticeDetails?.(rawNotice.sourceId);
                return detailedNotice ?? rawNotice;
            }
            catch (error) {
                detailFailures.push({
                    source: adapter.source,
                    message: `상세 수집 실패 ${rawNotice.sourceId}: ${toMessage(error)}`,
                });
                return rawNotice;
            }
        }));
        hydrated.push(...detailedChunk);
    }
    return { notices: hydrated, failures: detailFailures };
};
const getAttachments = (notice) => {
    const attachments = notice.metadata?.attachments;
    if (!Array.isArray(attachments)) {
        return [];
    }
    return attachments.filter((attachment) => typeof attachment === 'object' &&
        attachment !== null &&
        typeof attachment.title === 'string' &&
        typeof attachment.url === 'string');
};
const hydrateNoticeDocumentTexts = async (notices, fetchImpl) => {
    const hydrated = [];
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
const withTimeoutFetch = (fetchImpl, timeoutMs) => (async (input, init) => fetchImpl(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
}));
export const runCollect = async ({ adapters, repository, regions = DEFAULT_COLLECT_REGIONS, documentFetch = fetch, }) => {
    const events = [];
    const failures = [];
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
            const detailedNotices = await hydrateNoticeDocumentTexts(detailResult.notices, withTimeoutFetch(documentFetch, DOCUMENT_FETCH_TIMEOUT_MS));
            const { notices, listings } = normalizeAdapterOutput({ source: adapter.source, notices: detailedNotices });
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
                repository.deleteStaleListingsByNotice(notice.source, notice.sourceId, incomingListings.map((listing) => listing.stableKey));
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
                status: detailResult.failures.length > 0 ? 'partial' : 'success',
                message: detailResult.failures.length > 0 ? `상세 수집 실패 ${detailResult.failures.length}건` : null,
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
