import type { Listing, NotificationEvent, Notice } from '../types.js';
import { getPrimaryApplicationAttachment } from '../domain/attachments.js';
import type { EligibilityAssessment } from '../domain/eligibility.js';
import { formatNoticeCategoryLabel } from '../domain/notice-type.js';
import type { PrioritizedNotificationEvents } from '../domain/notification-policy.js';

export const formatNoticeSummaryLine = (notice: Notice, index: number, eligibility?: EligibilityAssessment): string => {
  const details = [notice.region, getApplicationStatus(notice), notice.postedAt ? `게시 ${notice.postedAt}` : null]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  const eligibilityPrefix = eligibility ? `[${eligibility.label}] ` : '';
  const typeLabel = formatNoticeCategoryLabel(notice);
  const typePrefix = typeLabel ? `[${typeLabel}] ` : '';
  const reasons = eligibility?.reasons.length ? ` - ${eligibility.reasons.join(', ')}` : '';
  return `${index}. ${eligibilityPrefix}${typePrefix}${notice.title}${details ? ` (${details})` : ''}${reasons}`;
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

const getApplicationStatus = (notice: Pick<Notice, 'applicationStartAt' | 'applicationEndAt' | 'status'>): string => {
  if (notice.status && /(마감|종료|접수완료)/.test(notice.status)) {
    return '마감';
  }

  const today = getKoreaToday();

  if (notice.applicationEndAt && notice.applicationEndAt < today) {
    return '마감';
  }

  if (notice.applicationStartAt && notice.applicationStartAt > today) {
    return '접수예정';
  }

  if (
    notice.applicationStartAt &&
    notice.applicationStartAt <= today &&
    notice.applicationEndAt &&
    notice.applicationEndAt >= today
  ) {
    return '신청가능';
  }

  if (notice.status && /(공고중|정정공고중|게시|posted|모집중)/i.test(notice.status)) {
    return '공고중';
  }

  return '확인필요';
};

const formatApplicationPeriod = (notice: Pick<Notice, 'applicationStartAt' | 'applicationEndAt'>): string => {
  if (notice.applicationStartAt && notice.applicationEndAt) {
    return `${notice.applicationStartAt} ~ ${notice.applicationEndAt}`;
  }

  if (notice.applicationStartAt) {
    return `${notice.applicationStartAt} ~ 확인필요`;
  }

  if (notice.applicationEndAt) {
    return `확인필요 ~ ${notice.applicationEndAt}`;
  }

  return '확인필요';
};

type Attachment = {
  title: string;
  url: string;
};

const getAttachments = (notice: Notice): Attachment[] => {
  const attachments = notice.metadata.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.filter(
    (attachment): attachment is Attachment =>
      typeof attachment === 'object' &&
      attachment !== null &&
      typeof (attachment as Attachment).title === 'string' &&
      typeof (attachment as Attachment).url === 'string',
  );
};

const hasEligibilityRequirements = (notice: Notice): boolean => {
  const requirements = notice.metadata.eligibilityRequirements;
  return Boolean(
    requirements &&
      typeof requirements === 'object' &&
      !Array.isArray(requirements) &&
      Object.keys(requirements).length > 0,
  );
};

const formatDetailQuality = (notice: Notice, listings: Listing[]): string => {
  const attachments = getAttachments(notice);
  const applicationPeriod = notice.applicationStartAt && notice.applicationEndAt
    ? '신청기간 확인됨'
    : notice.applicationStartAt || notice.applicationEndAt
      ? '신청기간 일부 확인'
      : '신청기간 확인필요';
  const applicationAttachment = getPrimaryApplicationAttachment(notice.metadata)
    ? '공고문 확인됨'
    : attachments.length > 0
      ? '공고문 첨부 있음'
      : '공고문 확인필요';
  const eligibilityRequirements = hasEligibilityRequirements(notice) ? '신청조건 추출됨' : '신청조건 확인필요';
  const listingQuality = listings.length > 0 ? `매물정보 ${listings.length}건` : '매물정보 확인필요';

  return [applicationPeriod, applicationAttachment, eligibilityRequirements, listingQuality].join(' · ');
};

const formatNoticeMeta = (notice: Notice): string => {
  const parts = [
    notice.region,
    getApplicationStatus(notice),
    notice.targetTags.length ? notice.targetTags.join(', ') : null,
    notice.postedAt ? `게시 ${notice.postedAt}` : null,
  ]
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

const eventNoticeKey = (event: NotificationEvent): string =>
  `${event.notice.source}:${event.notice.sourceId}:${event.type === 'new_notice' ? event.occurredAt : 'listing'}`;

const summarizeEventGroup = (events: NotificationEvent[]): string => {
  const firstEvent = events[0];
  if (!firstEvent) {
    return '';
  }

  const hasNewNotice = events.some((event) => event.type === 'new_notice');
  const hasChangedListing = events.some((event) => event.type === 'listing_changed');
  const eventLabel = hasNewNotice ? '신규' : hasChangedListing ? '변경' : '추가';
  const listingCount = events.filter((event) => event.listing).length;
  const countLabel = hasNewNotice ? '매물 1건' : listingCount > 0 ? `매물 ${listingCount}건` : null;
  const typeLabel = formatNoticeCategoryLabel(firstEvent.notice);
  const title = typeLabel ? `[${typeLabel}] ${firstEvent.notice.title}` : firstEvent.notice.title;
  const header = [eventLabel, title].join(' · ');
  const body = [formatNoticeMeta(firstEvent.notice), countLabel, firstEvent.notice.sourceUrl]
    .filter((value): value is string => Boolean(value))
    .join('\n');
  const changed = events.flatMap(formatChangedFields);
  const uniqueChanged = Array.from(new Set(changed)).slice(0, 3);

  return [header, body, ...uniqueChanged].filter(Boolean).join('\n');
};

const summarizeFailures = (failures: Failure[]): string[] => {
  const detailFailureCounts = new Map<string, number>();
  const lines: string[] = [];

  for (const failure of failures) {
    const message = failure.message ?? '원인 미상';
    if (message.startsWith('상세 수집 실패 ')) {
      detailFailureCounts.set(failure.source, (detailFailureCounts.get(failure.source) ?? 0) + 1);
      continue;
    }

    lines.push(`${failure.source}: ${message}`);
  }

  for (const [source, count] of detailFailureCounts) {
    lines.push(`${source}: 상세 수집 실패 ${count}건`);
  }

  return lines;
};

export const formatDailySummary = (
  events: NotificationEvent[],
  failures: Failure[] = [],
): string => {
  const eventGroups = new Map<string, NotificationEvent[]>();
  for (const event of events) {
    const key = eventNoticeKey(event);
    eventGroups.set(key, [...(eventGroups.get(key) ?? []), event]);
  }
  const lines = Array.from(eventGroups.values()).map(summarizeEventGroup);

  if (failures.length > 0) {
    lines.push(['수집 실패:', ...summarizeFailures(failures)].join('\n'));
  }

  return lines.join('\n\n');
};

const formatPriorityBlock = (title: string, events: NotificationEvent[]): string | null => {
  if (events.length === 0) {
    return null;
  }

  const body = formatDailySummary(events);
  return body ? `${title}\n${body}` : null;
};

export const formatPrioritizedDailySummary = (
  groups: PrioritizedNotificationEvents,
  failures: Failure[] = [],
): string => {
  const lines = [
    formatPriorityBlock('바로 볼 공고', groups.high),
    formatPriorityBlock('확인 필요한 공고', groups.review),
    formatPriorityBlock('낮은 우선순위', groups.low),
  ].filter((value): value is string => Boolean(value));

  if (failures.length > 0) {
    lines.push(['수집 실패:', ...summarizeFailures(failures)].join('\n'));
  }

  return lines.join('\n\n');
};

export const formatNoticeDetails = (
  notice: Notice,
  listings: Listing[],
  eligibility?: EligibilityAssessment,
): string => {
  const typeLabel = formatNoticeCategoryLabel(notice);
  const title = typeLabel ? `[${typeLabel}] ${notice.title}` : notice.title;
  const lines = [title];
  lines.push(`신청상태: ${getApplicationStatus(notice)}`);
  if (notice.postedAt) {
    lines.push(`게시일: ${notice.postedAt}`);
  }
  lines.push(`신청기간: ${formatApplicationPeriod(notice)}`);
  lines.push(`상세 확인: ${formatDetailQuality(notice, listings)}`);

  if (eligibility) {
    lines.push(`지원가능성: ${eligibility.label}`);
    if (eligibility.reasons.length > 0) {
      lines.push(`판정 근거: ${eligibility.reasons.join(', ')}`);
    }
  }

  if (notice.sourceUrl) {
    lines.push(notice.sourceUrl);
  }

  const primaryAttachment = getPrimaryApplicationAttachment(notice.metadata);
  if (primaryAttachment) {
    lines.push(`확인할 공고문: ${primaryAttachment.title}`, primaryAttachment.url);
  }

  listings.forEach((listing, index) => {
    lines.push(
      `${index + 1}. ${listing.title}`,
      `보증금 ${formatCurrency(listing.deposit)} / 월세 ${formatCurrency(listing.monthlyRent)}`,
    );
  });

  return lines.join('\n');
};
