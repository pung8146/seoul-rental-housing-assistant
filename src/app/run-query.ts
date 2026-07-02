import { createRepository, type Repository } from '../db/repository.js';
import { parseCommand } from '../commands/parse.js';
import type { ParsedCommand } from '../commands/parse.js';
import { isActionableNotice } from '../domain/actionable.js';
import { assessEligibility, type EligibilityAssessment } from '../domain/eligibility.js';
import { hasNoticeType } from '../domain/notice-type.js';
import { formatNoticeDetails, formatNoticeSummaryLine } from '../notifier/formatter.js';
import type { Notice, PersonalProfile } from '../types.js';

type RunQueryInput = {
  repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice' | 'getPersonalProfile'>;
  command: ParsedCommand;
  previousNotices?: Notice[];
};

type RunQueryResult = {
  text: string;
  lines: string[];
  notices: Notice[];
};

type RunQueryTextInput = {
  repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice' | 'getPersonalProfile'>;
  input: string;
  previousNotices?: Notice[];
};

const MAX_SUMMARY_COUNT = 5;

type NoticeWithEligibility = {
  notice: Notice;
  eligibility: EligibilityAssessment;
};

const eligibilityPriority: Record<EligibilityAssessment['status'], number> = {
  likely: 0,
  review: 1,
  financial_review: 2,
  missing_profile: 3,
  not_target: 4,
};

const selectNotices = (repository: Pick<Repository, 'queryNotices'>, index?: number, previousNotices?: Notice[]) => {
  const notices = previousNotices ?? repository.queryNotices({}).filter(isActionableNotice);
  if (typeof index === 'number') {
    return { notices, selected: notices[index - 1] ?? null };
  }

  return { notices, selected: null };
};

const withEligibility = (profile: PersonalProfile | null, notice: Notice): NoticeWithEligibility => ({
  notice,
  eligibility: assessEligibility(profile, notice),
});

const safestFirst = (items: NoticeWithEligibility[]): NoticeWithEligibility[] =>
  [...items].sort((left, right) => {
    const priorityDifference =
      eligibilityPriority[left.eligibility.status] - eligibilityPriority[right.eligibility.status];
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return (right.notice.postedAt ?? '').localeCompare(left.notice.postedAt ?? '');
  });

const formatEligibilityHeader = (items: NoticeWithEligibility[]): string => {
  const likelyCount = items.filter((item) => item.eligibility.status === 'likely').length;
  const reviewCount = items.filter((item) =>
    ['review', 'financial_review', 'missing_profile'].includes(item.eligibility.status),
  ).length;
  const notTargetCount = items.filter((item) => item.eligibility.status === 'not_target').length;
  const parts = [`신청 가능성 높은 공고 ${likelyCount}건`, `확인 필요 ${reviewCount}건`];

  if (notTargetCount > 0) {
    parts.push(`대상 아님 ${notTargetCount}건`);
  }

  return `결론: ${parts.join(', ')} 보여요.`;
};

export const runQuery = ({ repository, command, previousNotices }: RunQueryInput): RunQueryResult => {
  if (command.intent === 'list') {
    const profile = repository.getPersonalProfile();
    const noticeItems = safestFirst(
      repository
        .queryNotices(command.filters)
        .filter((notice) => hasNoticeType(notice, command.filters.noticeTypes ?? []))
        .filter(isActionableNotice)
        .map((notice) => withEligibility(profile, notice)),
    ).slice(0, MAX_SUMMARY_COUNT);
    const notices = noticeItems.map((item) => item.notice);
    const lines = noticeItems.map((item, index) => formatNoticeSummaryLine(item.notice, index + 1, item.eligibility));

    if (lines.length === 0) {
      return {
        text: '조건에 맞는 공고 없음',
        lines: ['조건에 맞는 공고 없음'],
        notices,
      };
    }

    return {
      text: [formatEligibilityHeader(noticeItems), ...lines].join('\n'),
      lines,
      notices,
    };
  }

  const { notices, selected } = selectNotices(repository, command.index, previousNotices);

  if (!selected) {
    return {
      text: '',
      lines: [],
      notices,
    };
  }

  if (command.intent === 'linkOnly') {
    return {
      text: selected.sourceUrl ?? '',
      lines: selected.sourceUrl ? [selected.sourceUrl] : [],
      notices,
    };
  }

  const listings = repository.queryListingsByNotice(selected.source, selected.sourceId);
  const text = formatNoticeDetails(selected, listings, assessEligibility(repository.getPersonalProfile(), selected));

  return {
    text,
    lines: text ? text.split('\n') : [],
    notices,
  };
};

export const runQueryText = ({ repository, input, previousNotices }: RunQueryTextInput): RunQueryResult =>
  runQuery({ repository, command: parseCommand(input), previousNotices });

if (import.meta.url === `file://${process.argv[1]}`) {
  const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');

  try {
    const input = process.argv.slice(2).join(' ') || '공고 조회';
    const result = runQueryText({
      repository,
      input,
    });
    console.log(result.text);
  } finally {
    repository.close();
  }
}

export type { RunQueryInput, RunQueryResult, RunQueryTextInput };
