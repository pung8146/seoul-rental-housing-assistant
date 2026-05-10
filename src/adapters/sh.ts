import type { RawNoticeCandidate, SourceAdapter } from './base.js';
import { isActionableNoticeTitle } from '../domain/actionable.js';
import { findPrimaryApplicationAttachment } from '../domain/attachments.js';
import { extractEligibilityRequirementsFromText } from '../domain/requirements.js';

const SH_PROVIDER = 'SH';
const SH_NOTICE_LIST_URL = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/list.do?multi_itm_seq=2';
const SH_NOTICE_DETAIL_BASE_URL = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2';

type ShFetch = typeof fetch;

export type CreateShAdapterOptions = {
  fetch?: ShFetch;
  useFixtureFallback?: boolean;
};

const extractCells = (rowHtml: string): string[] => {
  const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
  return matches.map((match) => stripHtml(match[1]));
};

const stripHtml = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const decodeHtmlEntities = (value: string): string => value.replace(/&amp;/gi, '&');

const normalizeShDate = (value: string): string => value.replace(/\./g, '-');

const extractTitle = (rowHtml: string): string => {
  const anchorMatch = rowHtml.match(/<a\b[^>]*onclick=["'][^"']*getDetailView\(['"][^'"]+['"]\)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  return anchorMatch?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
};

export const parseShNoticeListHtml = (html: string): RawNoticeCandidate[] => {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const notices: RawNoticeCandidate[] = [];

  for (const [, rowHtml] of rows) {
    const detailMatch = rowHtml.match(/getDetailView\(['"]([^'"]+)['"]\)/i);
    if (!detailMatch) {
      continue;
    }

    const [, seq] = detailMatch;
    const cells = extractCells(rowHtml);
    const title = extractTitle(rowHtml);
    if (!isActionableNoticeTitle(title)) {
      continue;
    }

    const department = cells.at(-3) ?? '';
    const postedAt = cells.find((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell)) ?? '';
    const sourceUrl = `${SH_NOTICE_DETAIL_BASE_URL}&seq=${encodeURIComponent(seq)}`;
    const rawIds = { seq };

    notices.push({
      sourceId: seq,
      title,
      status: 'posted',
      region: '서울',
      postedAt,
      sourceUrl,
      metadata: {
        provider: SH_PROVIDER,
        department,
        rawIds,
      },
      listings: [
        {
          title,
          supplyType: department,
          region: '서울',
          status: 'posted',
          metadata: {
            rawIds,
          },
        },
      ],
    });
  }

  return notices;
};

const toAbsoluteShUrl = (value: string): string =>
  decodeHtmlEntities(value).startsWith('http')
    ? decodeHtmlEntities(value)
    : new URL(decodeHtmlEntities(value), 'https://www.i-sh.co.kr').toString();

const isFileLabel = (value: string): boolean =>
  value.length > 0 && !value.startsWith('.') && /\.(pdf|hwp|hwpx|xls|xlsx|doc|docx|zip)$/i.test(value);

const extractAttachments = (html: string): Array<{ title: string; url: string }> => {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)).map(
    ([, href, label]) => ({
      title: stripHtml(label),
      url: toAbsoluteShUrl(href),
    }),
  );
  const attachments: Array<{ title: string; url: string }> = [];

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    if (!anchor || !isFileLabel(anchor.title)) {
      continue;
    }

    const nextPreview = anchors.slice(index + 1).find((candidate) => candidate.title === '미리보기');
    attachments.push({
      title: anchor.title,
      url: anchor.url === 'https://www.i-sh.co.kr/#' && nextPreview ? nextPreview.url : anchor.url,
    });
  }

  return attachments;
};

const extractApplicationPeriod = (html: string): { applicationStartAt?: string; applicationEndAt?: string } => {
  const text = stripHtml(html);
  const match = text.match(
    /(?:신청접수기간|신청기간|접수기간)\s*:?\s*(\d{4}[-.]\d{2}[-.]\d{2})\s*~\s*(\d{4}[-.]\d{2}[-.]\d{2})/,
  );
  if (!match) {
    return {};
  }

  return {
    applicationStartAt: normalizeShDate(match[1] ?? ''),
    applicationEndAt: normalizeShDate(match[2] ?? ''),
  };
};

export const parseShNoticeDetailHtml = (html: string, notice: RawNoticeCandidate): RawNoticeCandidate => {
  const attachments = extractAttachments(html);
  const applicationPeriod = extractApplicationPeriod(html);
  const primaryApplicationAttachment = findPrimaryApplicationAttachment(attachments);
  const bodyPreview = stripHtml(
    html
      .replace(/<a\b[^>]*href=["']#["'][^>]*>\s*\.[a-z0-9]+\s*<\/a>/gi, ' ')
      .replace(/<a\b[^>]*>\s*미리보기\s*<\/a>/gi, ' '),
  ).slice(0, 300);
  const eligibilityRequirements = extractEligibilityRequirementsFromText(stripHtml(html));

  return {
    ...notice,
    ...applicationPeriod,
    metadata: {
      ...(notice.metadata ?? {}),
      attachments,
      ...(primaryApplicationAttachment ? { primaryApplicationAttachment } : {}),
      bodyPreview,
      ...(eligibilityRequirements ? { eligibilityRequirements } : {}),
    },
  };
};

const SH_FIXTURE: RawNoticeCandidate[] = [
  {
    sourceId: 'sh-notice-1',
    title: 'SH Seoul rental housing notice',
    status: 'posted',
    region: '서울',
    targetTags: 'rental',
    postedAt: '2026-05-06',
    applicationStartAt: '2026-05-12',
    applicationEndAt: '2026-05-19',
    sourceUrl: 'https://example.com/sh/notices/1',
    metadata: { provider: SH_PROVIDER, fixture: true },
    listings: [
      {
        title: 'SH Seoul rental housing notice',
        supplyType: 'rental',
        region: '서울',
        targetTags: 'rental',
        deposit: '20,000,000',
        monthlyRent: '180,000',
        floorAreaM2: '49.5',
        status: 'posted',
        metadata: { fixture: true },
      },
    ],
  },
];

export const createShAdapter = (options: CreateShAdapterOptions = {}): SourceAdapter => {
  const fetchImpl = options.fetch ?? fetch;
  const useFixtureFallback = options.useFixtureFallback ?? false;
  const noticesById = new Map<string, RawNoticeCandidate>();

  return {
    source: 'sh',
    async fetchNotices() {
      const response = await fetchImpl(SH_NOTICE_LIST_URL);
      const html = await response.text();
      const notices = parseShNoticeListHtml(html);
      const result = notices.length > 0 || !useFixtureFallback ? notices : SH_FIXTURE;
      noticesById.clear();
      result.forEach((notice) => noticesById.set(notice.sourceId, notice));
      return result;
    },
    async fetchNoticeDetails(id: string) {
      const notice = noticesById.get(id) ?? (useFixtureFallback ? SH_FIXTURE.find((fixture) => fixture.sourceId === id) : undefined);
      if (!notice?.sourceUrl) {
        return notice ?? null;
      }

      const response = await fetchImpl(notice.sourceUrl);
      const html = await response.text();
      return parseShNoticeDetailHtml(html, notice);
    },
  };
};
