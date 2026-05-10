import { getNoticeExclusionReason } from '../domain/actionable.js';
const toNoticeKey = (notice) => `${notice.source}:${notice.sourceId}`;
const withNoticeKey = (notice) => ({
    ...notice,
    noticeKey: toNoticeKey(notice),
});
const latestFirst = (runs) => [...runs].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));
export const buildDashboardView = ({ repository, selectedNoticeKey, }) => {
    const notices = repository.queryNotices({});
    const sourceRuns = repository.listSourceRuns();
    const actionableNotices = [];
    const excludedNotices = [];
    for (const notice of notices) {
        const keyedNotice = withNoticeKey(notice);
        const exclusionReason = getNoticeExclusionReason(notice);
        if (exclusionReason) {
            excludedNotices.push({
                ...keyedNotice,
                exclusionReason,
            });
        }
        else {
            actionableNotices.push(keyedNotice);
        }
    }
    const selectedNotice = actionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ?? actionableNotices[0] ?? null;
    return {
        stats: {
            actionableCount: actionableNotices.length,
            excludedCount: excludedNotices.length,
            sourceRunCount: sourceRuns.length,
        },
        actionableNotices,
        excludedNotices,
        selectedNotice: selectedNotice
            ? {
                notice: selectedNotice,
                listings: repository.queryListingsByNotice(selectedNotice.source, selectedNotice.sourceId),
            }
            : null,
        sourceRuns: latestFirst(sourceRuns).slice(0, 10),
    };
};
