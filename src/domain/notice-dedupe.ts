import type { Notice } from '../types.js';

const SOURCE_PRIORITY: Record<string, number> = {
  sh: 0,
  'seoul-housing': 1,
};

const normalizeTitle = (title: string): string =>
  title
    .replace(/^\[수정\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getShSeq = (notice: Notice): string | null => {
  if ((notice.source === 'sh' || notice.source === 'seoul-housing') && /^\d+$/.test(notice.sourceId)) {
    return notice.sourceId;
  }

  const rawIds = notice.metadata.rawIds;
  if (rawIds && typeof rawIds === 'object' && !Array.isArray(rawIds)) {
    const seq = (rawIds as { seq?: unknown }).seq;
    if (typeof seq === 'string' && /^\d+$/.test(seq)) {
      return seq;
    }
  }

  return null;
};

const getDedupeKey = (notice: Notice): string => {
  const shSeq = getShSeq(notice);
  if (shSeq) {
    return `sh-seq:${shSeq}`;
  }

  return `title:${normalizeTitle(notice.title)}:${notice.postedAt ?? ''}:${notice.region ?? ''}`;
};

const attachmentCount = (notice: Notice): number => {
  const attachments = notice.metadata.attachments;
  return Array.isArray(attachments) ? attachments.length : 0;
};

const noticeRank = (notice: Notice): number => {
  const sourcePriority = SOURCE_PRIORITY[notice.source] ?? 10;
  const detailScore = attachmentCount(notice) > 0 ? 0 : 1;
  return sourcePriority * 10 + detailScore;
};

const preferNotice = (left: Notice, right: Notice): Notice => {
  const leftRank = noticeRank(left);
  const rightRank = noticeRank(right);
  if (leftRank !== rightRank) {
    return leftRank < rightRank ? left : right;
  }

  return (left.postedAt ?? '') >= (right.postedAt ?? '') ? left : right;
};

export const dedupeNoticesForDisplay = <T extends Notice>(notices: T[]): T[] => {
  const byKey = new Map<string, T>();
  const order: string[] = [];

  for (const notice of notices) {
    const key = getDedupeKey(notice);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, notice);
      order.push(key);
      continue;
    }

    byKey.set(key, preferNotice(existing, notice) as T);
  }

  return order.map((key) => byKey.get(key)).filter((notice): notice is T => notice != null);
};
