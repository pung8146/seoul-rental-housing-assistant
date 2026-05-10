import { getNoticeExclusionReason } from '../domain/actionable.js';
import { assessEligibility } from '../domain/eligibility.js';
const toNoticeKey = (notice) => `${notice.source}:${notice.sourceId}`;
const withNoticeKey = (notice, profile) => ({
    ...notice,
    noticeKey: toNoticeKey(notice),
    eligibility: assessEligibility(profile, notice),
});
const latestFirst = (runs) => [...runs].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));
export const buildDashboardView = ({ repository, selectedNoticeKey, }) => {
    const notices = repository.queryNotices({});
    const sourceRuns = repository.listSourceRuns();
    const profile = repository.getPersonalProfile();
    const actionableNotices = [];
    const excludedNotices = [];
    for (const notice of notices) {
        const keyedNotice = withNoticeKey(notice, profile);
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
        profile,
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
