import { getNoticeExclusionReason } from '../domain/actionable.js';
import { assessEligibility } from '../domain/eligibility.js';
import { dedupeNoticesForDisplay } from '../domain/notice-dedupe.js';
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
const noticeSearchText = (notice) => [notice.title, ...notice.targetTags].join(' ');
const isSaleNotice = (notice) => /분양|공공분양|분양주택|사전청약/.test(noticeSearchText(notice));
const isShopNotice = (notice) => /상가임대|임대상가/.test(noticeSearchText(notice));
const isRentNotice = (notice) => !isSaleNotice(notice) &&
    !isShopNotice(notice) &&
    /임대|행복주택|장기전세|전세임대|매입임대|국민임대|공공임대|도시형생활주택|두레주택/.test(noticeSearchText(notice));
const filterNoticeByType = (notice, filter) => {
    if (filter === 'sale') {
        return isSaleNotice(notice);
    }
    if (filter === 'rent') {
        return isRentNotice(notice);
    }
    if (filter === 'shop') {
        return isShopNotice(notice);
    }
    if (filter === 'newlywed') {
        return noticeSearchText(notice).includes('신혼');
    }
    if (filter === 'youth') {
        return /청년|대학생/.test(noticeSearchText(notice));
    }
    return true;
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
export const buildDashboardView = ({ repository, selectedNoticeKey, noticeTypeFilter = 'all', }) => {
    const notices = dedupeNoticesForDisplay(repository.queryNotices({}));
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
    const filter = noticeTypeFilter ?? 'all';
    const sortedActionableNotices = safestFirst(actionableNotices);
    const filteredActionableNotices = sortedActionableNotices.filter((notice) => filterNoticeByType(notice, filter));
    const noticeGroups = groupNoticesByPriority(filteredActionableNotices);
    const selectedNotice = filteredActionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ??
        filteredActionableNotices[0] ??
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
        filters: {
            noticeType: filter,
        },
        stats: {
            actionableCount: actionableNotices.length,
            excludedCount: excludedNotices.length,
            sourceRunCount: sourceRuns.length,
            sourceIssueCount: sourceStatuses.filter((status) => status.runStatus !== 'success').length,
            lastCollectedAt: latestSourceRun?.finishedAt ?? null,
        },
        profile,
        actionableNotices: filteredActionableNotices,
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
