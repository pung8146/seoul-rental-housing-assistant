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

  const selectedNotice =
    actionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ?? actionableNotices[0] ?? null;

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
