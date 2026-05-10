import { getNoticeExclusionReason, type NoticeExclusionReason } from '../domain/actionable.js';
import { assessEligibility, type EligibilityAssessment } from '../domain/eligibility.js';
import type { Listing, Notice, PersonalProfile, SourceRun } from '../types.js';
import type { Repository } from '../db/repository.js';

export type DashboardNoticeSummary = Notice & {
  noticeKey: string;
  eligibility: EligibilityAssessment;
};

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

export type DashboardView = {
  stats: {
    actionableCount: number;
    excludedCount: number;
    sourceRunCount: number;
  };
  profile: PersonalProfile | null;
  actionableNotices: DashboardNoticeSummary[];
  excludedNotices: ExcludedDashboardNotice[];
  selectedNotice: SelectedDashboardNotice | null;
  sourceStatuses: SourceCollectionStatus[];
  sourceRuns: SourceRun[];
};

type BuildDashboardViewInput = {
  repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice' | 'listSourceRuns' | 'getPersonalProfile'>;
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

export const buildDashboardView = ({
  repository,
  selectedNoticeKey,
}: BuildDashboardViewInput): DashboardView => {
  const notices = repository.queryNotices({});
  const sourceRuns = repository.listSourceRuns();
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
  const selectedNotice =
    sortedActionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ??
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
    sourceStatuses: buildSourceStatuses({
      notices,
      actionableNotices: sortedActionableNotices,
      excludedNotices,
      repository,
      sourceRuns,
    }),
    sourceRuns: latestFirst(sourceRuns).slice(0, 10),
  };
};
