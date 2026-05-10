import type { Listing, NotificationEvent, Notice } from '../types.js';
import type { EligibilityAssessment } from '../domain/eligibility.js';

export const formatNoticeSummaryLine = (notice: Notice, index: number, eligibility?: EligibilityAssessment): string => {
  const details = [notice.region, notice.status].filter((value): value is string => Boolean(value)).join(' · ');
  const prefix = eligibility ? `[${eligibility.label}] ` : '';
  const reasons = eligibility?.reasons.length ? ` - ${eligibility.reasons.join(', ')}` : '';
  return `${index}. ${prefix}${notice.title}${details ? ` (${details})` : ''}${reasons}`;
};

type Failure = {
  source: string;
  message: string | null;
};

const formatCurrency = (value: number | null): string => {
  if (value === null) {
    return '미정';
  }

  return `${value.toLocaleString('ko-KR')}원`;
};

const formatNoticeMeta = (notice: Notice): string => {
  const parts = [notice.region, notice.targetTags.length ? notice.targetTags.join(', ') : null, notice.postedAt]
    .filter((value): value is string => Boolean(value));

  return parts.join(' · ');
};

const formatChangedFields = (event: NotificationEvent): string[] => {
  if (event.type !== 'listing_changed' || !event.listing || !event.previousListing) {
    return [];
  }

  const changes: string[] = [];

  if (event.previousListing.monthlyRent !== event.listing.monthlyRent) {
    changes.push(
      `월세: ${formatCurrency(event.previousListing.monthlyRent)} → ${formatCurrency(event.listing.monthlyRent)}`,
    );
  }

  if (event.previousListing.deposit !== event.listing.deposit) {
    changes.push(
      `보증금: ${formatCurrency(event.previousListing.deposit)} → ${formatCurrency(event.listing.deposit)}`,
    );
  }

  if (event.previousListing.status !== event.listing.status) {
    changes.push(`상태: ${event.previousListing.status ?? '미정'} → ${event.listing.status ?? '미정'}`);
  }

  return changes;
};

export const formatDailySummary = (
  events: NotificationEvent[],
  failures: Failure[] = [],
): string => {
  const lines = events.map((event) => {
    const countLabel = event.type === 'new_notice' ? '매물 1건' : null;
    const header = [
      event.type === 'listing_changed' ? '변경' : event.type === 'listing_added' ? '추가' : '신규',
      event.notice.title,
    ].join(' · ');

    const body = [formatNoticeMeta(event.notice), countLabel, event.notice.sourceUrl]
      .filter((value): value is string => Boolean(value))
      .join('\n');

    const changed = formatChangedFields(event);

    return [header, body, ...changed].filter(Boolean).join('\n');
  });

  if (failures.length > 0) {
    lines.push(
      ['수집 실패:', ...failures.map((failure) => `${failure.source}: ${failure.message ?? '원인 미상'}`)].join(
        '\n',
      ),
    );
  }

  return lines.join('\n\n');
};

export const formatNoticeDetails = (
  notice: Notice,
  listings: Listing[],
  eligibility?: EligibilityAssessment,
): string => {
  const lines = [notice.title];

  if (eligibility) {
    lines.push(`지원가능성: ${eligibility.label}`);
    if (eligibility.reasons.length > 0) {
      lines.push(`판정 근거: ${eligibility.reasons.join(', ')}`);
    }
  }

  if (notice.sourceUrl) {
    lines.push(notice.sourceUrl);
  }

  listings.forEach((listing, index) => {
    lines.push(
      `${index + 1}. ${listing.title}`,
      `보증금 ${formatCurrency(listing.deposit)} / 월세 ${formatCurrency(listing.monthlyRent)}`,
    );
  });

  return lines.join('\n');
};
