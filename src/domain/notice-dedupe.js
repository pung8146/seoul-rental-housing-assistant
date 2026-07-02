const SOURCE_PRIORITY = {
    sh: 0,
    'seoul-housing': 1,
};
const normalizeTitle = (title) => title
    .replace(/^\[수정\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const noticeSearchText = (notice) => [notice.title, ...notice.targetTags].join(' ');
const isShopNotice = (notice) => /상가임대|임대상가/.test(noticeSearchText(notice));
const getShSeq = (notice) => {
    if ((notice.source === 'sh' || notice.source === 'seoul-housing') && /^\d+$/.test(notice.sourceId)) {
        return notice.sourceId;
    }
    const rawIds = notice.metadata.rawIds;
    if (rawIds && typeof rawIds === 'object' && !Array.isArray(rawIds)) {
        const seq = rawIds.seq;
        if (typeof seq === 'string' && /^\d+$/.test(seq)) {
            return seq;
        }
    }
    return null;
};
const getDedupeKey = (notice) => {
    const shSeq = getShSeq(notice);
    if (shSeq) {
        return `sh-seq:${shSeq}`;
    }
    const noticeKind = isShopNotice(notice) ? 'shop' : 'general';
    return `title:${noticeKind}:${normalizeTitle(notice.title)}:${notice.postedAt ?? ''}:${notice.region ?? ''}`;
};
const attachmentCount = (notice) => {
    const attachments = notice.metadata.attachments;
    return Array.isArray(attachments) ? attachments.length : 0;
};
const noticeRank = (notice) => {
    const sourcePriority = SOURCE_PRIORITY[notice.source] ?? 10;
    const detailScore = attachmentCount(notice) > 0 ? 0 : 1;
    return sourcePriority * 10 + detailScore;
};
const preferNotice = (left, right) => {
    const leftRank = noticeRank(left);
    const rightRank = noticeRank(right);
    if (leftRank !== rightRank) {
        return leftRank < rightRank ? left : right;
    }
    return (left.postedAt ?? '') >= (right.postedAt ?? '') ? left : right;
};
export const dedupeNoticesForDisplay = (notices) => {
    const byKey = new Map();
    const order = [];
    for (const notice of notices) {
        const key = getDedupeKey(notice);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, notice);
            order.push(key);
            continue;
        }
        byKey.set(key, preferNotice(existing, notice));
    }
    return order.map((key) => byKey.get(key)).filter((notice) => notice != null);
};
