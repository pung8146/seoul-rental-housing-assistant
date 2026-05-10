import { getNoticeExclusionReason, type NoticeExclusionReason } from '../domain/actionable.js';
import { assessEligibility, type EligibilityAssessment } from '../domain/eligibility.js';
import type { Listing, Notice, PersonalProfile, SourceRun } from '../types.js';
import type { Repository } from '../db/repository.js';

export type DashboardNoticeSummary = Notice & {
  noticeKey: string;
  eligibility: EligibilityAssessment;
};

export type DashboardNoticePriority = 'high' | 'review' | 'low';

export type DashboardNoticeGroups = Record<DashboardNoticePriority, DashboardNoticeSummary[]>;

export type ExcludedDashboardNotice = DashboardNoticeSummary & {
  exclusionReason: NoticeExclusionReason;
};

export type SelectedDashboardNotice = {
  notice: DashboardNoticeSummary;
  listings: Listing[];
};

export type SourceCollectionStatus = {
  source: string;
  runStatus: SourceRun['status'] | 'unknown';
  statusLabel: '최근 성공' | '최근 일부 실패' | '최근 실패' | '수집 기록 없음';
  lastFinishedAt: string | null;
  message: string | null;
  totalNotices: number;
  actionableNotices: number;
  excludedNotices: number;
  detailListings: number;
  parsedConditionNotices: number;
  attachmentNotices: number;
};

export type NotificationOperationStatus = {
  totalSent: number;
  channelCount: number;
  lastSentAt: string | null;
};

export type DashboardView = {
  stats: {
    actionableCount: number;
    excludedCount: number;
    sourceRunCount: number;
    sourceIssueCount: number;
    lastCollectedAt: string | null;
  };
  profile: PersonalProfile | null;
  actionableNotices: DashboardNoticeSummary[];
  noticeGroups: DashboardNoticeGroups;
  excludedNotices: ExcludedDashboardNotice[];
  selectedNotice: SelectedDashboardNotice | null;
  sourceStatuses: SourceCollectionStatus[];
  sourceRuns: SourceRun[];
  notificationStatus: NotificationOperationStatus;
};

type BuildDashboardViewInput = {
  repository: Pick<
    Repository,
    'queryNotices' | 'queryListingsByNotice' | 'listSourceRuns' | 'getPersonalProfile' | 'listNotificationHistory'
  >;
  selectedNoticeKey?: string | null;
};

const toNoticeKey = (notice: Pick<Notice, 'source' | 'sourceId'>): string =>
  `${notice.source}:${notice.sourceId}`;

const withNoticeKey = (notice: Notice, profile: PersonalProfile | null): DashboardNoticeSummary => ({
  ...notice,
  noticeKey: toNoticeKey(notice),
  eligibility: assessEligibility(profile, notice),
});

const latestFirst = (runs: SourceRun[]): SourceRun[] =>
  [...runs].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));

const eligibilityPriority: Record<EligibilityAssessment['status'], number> = {
  likely: 0,
  review: 1,
  financial_review: 2,
  missing_profile: 3,
  not_target: 4,
};

const safestFirst = (notices: DashboardNoticeSummary[]): DashboardNoticeSummary[] =>
  [...notices].sort((left, right) => {
    const priorityDifference = eligibilityPriority[left.eligibility.status] - eligibilityPriority[right.eligibility.status];
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return (right.postedAt ?? '').localeCompare(left.postedAt ?? '');
  });

const getKoreaToday = (): string => {
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

const isClosedNotice = (notice: Notice): boolean => {
  if (notice.status && /(마감|종료|접수완료)/.test(notice.status)) {
    return true;
  }

  return Boolean(notice.applicationEndAt && notice.applicationEndAt < getKoreaToday());
};

const getNoticePriority = (notice: DashboardNoticeSummary): DashboardNoticePriority => {
  if (isClosedNotice(notice) || notice.eligibility.status === 'not_target') {
    return 'low';
  }

  return notice.eligibility.status === 'likely' ? 'high' : 'review';
};

const groupNoticesByPriority = (notices: DashboardNoticeSummary[]): DashboardNoticeGroups => {
  const groups: DashboardNoticeGroups = {
    high: [],
    review: [],
    low: [],
  };

  for (const notice of notices) {
    groups[getNoticePriority(notice)].push(notice);
  }

  return groups;
};

const hasParsedConditions = (notice: Notice): boolean => {
  const requirements = notice.metadata.eligibilityRequirements;
  return Boolean(requirements && typeof requirements === 'object' && !Array.isArray(requirements));
};

const hasAttachments = (notice: Notice): boolean => {
  const attachments = notice.metadata.attachments;
  return Array.isArray(attachments) && attachments.length > 0;
};

const toStatusLabel = (status: SourceCollectionStatus['runStatus']): SourceCollectionStatus['statusLabel'] => {
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

const latestRunBySource = (sourceRuns: SourceRun[]): Map<string, SourceRun> => {
  const latest = new Map<string, SourceRun>();
  for (const run of latestFirst(sourceRuns)) {
    if (!latest.has(run.source)) {
      latest.set(run.source, run);
    }
  }
  return latest;
};

const buildSourceStatuses = ({
  notices,
  actionableNotices,
  excludedNotices,
  repository,
  sourceRuns,
}: {
  notices: Notice[];
  actionableNotices: DashboardNoticeSummary[];
  excludedNotices: ExcludedDashboardNotice[];
  repository: Pick<Repository, 'queryListingsByNotice'>;
  sourceRuns: SourceRun[];
}): SourceCollectionStatus[] => {
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
      detailListings: sourceNotices.filter(
        (notice) => repository.queryListingsByNotice(notice.source, notice.sourceId).length > 0,
      ).length,
      parsedConditionNotices: sourceNotices.filter(hasParsedConditions).length,
      attachmentNotices: sourceNotices.filter(hasAttachments).length,
    };
  });
};

const buildNotificationStatus = (
  notificationHistory: ReturnType<Repository['listNotificationHistory']>,
): NotificationOperationStatus => ({
  totalSent: notificationHistory.length,
  channelCount: new Set(notificationHistory.map((history) => history.channel)).size,
  lastSentAt: notificationHistory[0]?.sentAt ?? null,
});

export const buildDashboardView = ({
  repository,
  selectedNoticeKey,
}: BuildDashboardViewInput): DashboardView => {
  const notices = repository.queryNotices({});
  const sourceRuns = repository.listSourceRuns();
  const notificationHistory = repository.listNotificationHistory();
  const profile = repository.getPersonalProfile();
  const actionableNotices: DashboardNoticeSummary[] = [];
  const excludedNotices: ExcludedDashboardNotice[] = [];

  for (const notice of notices) {
    const keyedNotice = withNoticeKey(notice, profile);
    const exclusionReason = getNoticeExclusionReason(notice);
    if (exclusionReason) {
      excludedNotices.push({
        ...keyedNotice,
        exclusionReason,
      });
    } else {
      actionableNotices.push(keyedNotice);
    }
  }

  const sortedActionableNotices = safestFirst(actionableNotices);
  const noticeGroups = groupNoticesByPriority(sortedActionableNotices);
  const selectedNotice =
    sortedActionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ??
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
