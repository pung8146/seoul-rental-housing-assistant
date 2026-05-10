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
const getKoreaToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Seoul',
        year: 'numeric',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = parts.find((part) => part.type === 'month')?.value ?? '00';
    const day = parts.find((part) => part.type === 'day')?.value ?? '00';
    return `${year}-${month}-${day}`;
};
const isClosedNotice = (notice) => {
    if (notice.status && /(마감|종료|접수완료)/.test(notice.status)) {
        return true;
    }
    return Boolean(notice.applicationEndAt && notice.applicationEndAt < getKoreaToday());
};
const getNoticePriority = (notice) => {
    if (isClosedNotice(notice) || notice.eligibility.status === 'not_target') {
        return 'low';
    }
    return notice.eligibility.status === 'likely' ? 'high' : 'review';
};
const groupNoticesByPriority = (notices) => {
    const groups = {
        high: [],
        review: [],
        low: [],
    };
    for (const notice of notices) {
        groups[getNoticePriority(notice)].push(notice);
    }
    return groups;
};
const hasParsedConditions = (notice) => {
    const requirements = notice.metadata.eligibilityRequirements;
    return Boolean(requirements && typeof requirements === 'object' && !Array.isArray(requirements));
};
const hasAttachments = (notice) => {
    const attachments = notice.metadata.attachments;
    return Array.isArray(attachments) && attachments.length > 0;
};
const toStatusLabel = (status) => {
    if (status === 'success') {
        return '최근 성공';
    }
    if (status === 'partial') {
        return '최근 일부 실패';
    }
    if (status === 'failure') {
        return '최근 실패';
    }
    return '수집 기록 없음';
};
const latestRunBySource = (sourceRuns) => {
    const latest = new Map();
    for (const run of latestFirst(sourceRuns)) {
        if (!latest.has(run.source)) {
            latest.set(run.source, run);
        }
    }
    return latest;
};
const buildSourceStatuses = ({ notices, actionableNotices, excludedNotices, repository, sourceRuns, }) => {
    const latestRuns = latestRunBySource(sourceRuns);
    const sources = Array.from(new Set([...notices.map((notice) => notice.source), ...sourceRuns.map((run) => run.source)])).sort();
    return sources.map((source) => {
        const sourceNotices = notices.filter((notice) => notice.source === source);
        const latestRun = latestRuns.get(source);
        const runStatus = latestRun?.status ?? 'unknown';
        return {
            source,
            runStatus,
            statusLabel: toStatusLabel(runStatus),
            lastFinishedAt: latestRun?.finishedAt ?? null,
            message: latestRun?.message ?? null,
            totalNotices: sourceNotices.length,
            actionableNotices: actionableNotices.filter((notice) => notice.source === source).length,
            excludedNotices: excludedNotices.filter((notice) => notice.source === source).length,
            detailListings: sourceNotices.filter((notice) => repository.queryListingsByNotice(notice.source, notice.sourceId).length > 0).length,
            parsedConditionNotices: sourceNotices.filter(hasParsedConditions).length,
            attachmentNotices: sourceNotices.filter(hasAttachments).length,
        };
    });
};
const buildNotificationStatus = (notificationHistory) => ({
    totalSent: notificationHistory.length,
    channelCount: new Set(notificationHistory.map((history) => history.channel)).size,
    lastSentAt: notificationHistory[0]?.sentAt ?? null,
});
export const buildDashboardView = ({ repository, selectedNoticeKey, }) => {
    const notices = repository.queryNotices({});
    const sourceRuns = repository.listSourceRuns();
    const notificationHistory = repository.listNotificationHistory();
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
    const noticeGroups = groupNoticesByPriority(sortedActionableNotices);
    const selectedNotice = sortedActionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ??
        sortedActionableNotices[0] ??
        null;
    const sourceStatuses = buildSourceStatuses({
        notices,
        actionableNotices: sortedActionableNotices,
        excludedNotices,
        repository,
        sourceRuns,
    });
    const latestSourceRun = latestFirst(sourceRuns)[0] ?? null;
    return {
        stats: {
            actionableCount: actionableNotices.length,
            excludedCount: excludedNotices.length,
            sourceRunCount: sourceRuns.length,
            sourceIssueCount: sourceStatuses.filter((status) => status.runStatus !== 'success').length,
            lastCollectedAt: latestSourceRun?.finishedAt ?? null,
        },
        profile,
        actionableNotices: sortedActionableNotices,
        noticeGroups,
        excludedNotices,
        selectedNotice: selectedNotice
            ? {
                notice: selectedNotice,
                listings: repository.queryListingsByNotice(selectedNotice.source, selectedNotice.sourceId),
            }
            : null,
        sourceStatuses,
        sourceRuns: latestFirst(sourceRuns).slice(0, 10),
        notificationStatus: buildNotificationStatus(notificationHistory),
    };
};
