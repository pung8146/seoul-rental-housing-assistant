import { getNoticeExclusionReason } from '../domain/actionable.js';
import { assessEligibility } from '../domain/eligibility.js';
const toNoticeKey = (notice) => `${notice.source}:${notice.sourceId}`;
const withNoticeKey = (notice, profile) => ({
    ...notice,
    noticeKey: toNoticeKey(notice),
    eligibility: assessEligibility(profile, notice),
});
const latestFirst = (runs) => [...runs].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));
const eligibilityPriority = {
    likely: 0,
    review: 1,
    financial_review: 2,
    missing_profile: 3,
    not_target: 4,
};
const safestFirst = (notices) => [...notices].sort((left, right) => {
    const priorityDifference = eligibilityPriority[left.eligibility.status] - eligibilityPriority[right.eligibility.status];
    if (priorityDifference !== 0) {
        return priorityDifference;
    }
    return (right.postedAt ?? '').localeCompare(left.postedAt ?? '');
});
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
    const sortedActionableNotices = safestFirst(actionableNotices);
    const selectedNotice = sortedActionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ??
        sortedActionableNotices[0] ??
        null;
    return {
        stats: {
            actionableCount: actionableNotices.length,
            excludedCount: excludedNotices.length,
            sourceRunCount: sourceRuns.length,
        },
        profile,
        actionableNotices: sortedActionableNotices,
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
