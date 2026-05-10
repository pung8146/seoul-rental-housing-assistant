import { assessEligibility } from './eligibility.js';
import type { NotificationEvent, PersonalProfile } from '../types.js';

export type NotificationPolicy = 'actionable' | 'all';
export type NotificationPriority = 'high' | 'review' | 'low';

export type PrioritizedNotificationEvents = {
  high: NotificationEvent[];
  review: NotificationEvent[];
  low: NotificationEvent[];
};

type NotificationPolicyInput = {
  events: NotificationEvent[];
  failures: unknown[];
  profile: PersonalProfile | null;
  policy?: NotificationPolicy;
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

const isClosedNotice = (event: NotificationEvent): boolean => {
  if (event.notice.status && /(마감|종료|접수완료)/.test(event.notice.status)) {
    return true;
  }

  return Boolean(event.notice.applicationEndAt && event.notice.applicationEndAt < getKoreaToday());
};

export const getNotificationPriority = (
  event: NotificationEvent,
  profile: PersonalProfile | null,
): NotificationPriority => {
  if (isClosedNotice(event)) {
    return 'low';
  }

  const eligibility = assessEligibility(profile, event.notice);
  if (eligibility.status === 'likely') {
    return 'high';
  }

  return eligibility.status === 'not_target' ? 'low' : 'review';
};

const isActionableEvent = (event: NotificationEvent, profile: PersonalProfile | null): boolean =>
  getNotificationPriority(event, profile) !== 'low';

export const filterNotificationEvents = ({
  events,
  profile,
  policy = 'actionable',
}: NotificationPolicyInput): NotificationEvent[] => {
  if (policy === 'all') {
    return events;
  }

  return events.filter((event) => isActionableEvent(event, profile));
};

export const groupNotificationEvents = ({
  events,
  profile,
  policy = 'actionable',
}: NotificationPolicyInput): PrioritizedNotificationEvents => {
  const groups: PrioritizedNotificationEvents = {
    high: [],
    review: [],
    low: [],
  };

  for (const event of events) {
    const priority = getNotificationPriority(event, profile);
    if (policy === 'actionable' && priority === 'low') {
      continue;
    }

    groups[priority].push(event);
  }

  return groups;
};

export const shouldNotifyCollectResult = ({
  events,
  failures,
  profile,
  policy = 'actionable',
}: NotificationPolicyInput): boolean =>
  failures.length > 0 || filterNotificationEvents({ events, failures, profile, policy }).length > 0;
