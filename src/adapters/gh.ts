import type { RawNoticeCandidate, SourceAdapter } from './base.js';
import { isActionableNoticeTitle } from '../domain/actionable.js';
import { findPrimaryApplicationAttachment } from '../domain/attachments.js';
import { extractEligibilityRequirementsFromText } from '../domain/requirements.js';

const GH_PROVIDER = 'GH';
const GH_ORIGIN = 'https://gh.or.kr';
const GH_HOUSING_NOTICE_LIST_URL = 'https://gh.or.kr/gh/announcement-of-salerental001.do?srCategoryId=12';

type GhFetch = typeof fetch;

export type CreateGhAdapterOptions = {
  fetch?: GhFetch;
  useFixtureFallback?: boolean;
};

const stripHtml = (html: string): string =>
  decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&e;/gi, 'e');

const toAbsoluteGhUrl = (url: string): string => {
  const decodedUrl = decodeHtmlEntities(url);

  try {
    return new URL(decodedUrl, GH_HOUSING_NOTICE_LIST_URL).toString();
  } catch {
    return decodedUrl;
  }
};

const extractCells = (rowHtml: string): string[] => {
  const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
  return matches.map((match) => stripHtml(match[1] ?? ''));
};

const extractAttribute = (html: string, name: string): string | null => {
  const match = html.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
  return match ? decodeHtmlEntities(match[1] ?? '') : null;
};

const normalizeGhDate = (value: string): string => {
  const match = value.match(/^(\d{2,4})[.-](\d{1,2})[.-](\d{1,2})$/);
  if (!match) {
    return value;
  }

  const rawYear = match[1] ?? '';
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const month = (match[2] ?? '').padStart(2, '0');
  const day = (match[3] ?? '').padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DATE_TEXT_PATTERN = /(\d{4})\s*(?:년|[-.])\s*(\d{1,2})\s*(?:월|[-.])\s*(\d{1,2})\s*일?/g;

const normalizeDateMatch = (match: RegExpMatchArray): string =>
  `${match[1]}-${(match[2] ?? '').padStart(2, '0')}-${(match[3] ?? '').padStart(2, '0')}`;

const extractDates = (text: string): string[] =>
  Array.from(text.matchAll(DATE_TEXT_PATTERN)).map((match) => normalizeDateMatch(match));

const extractApplicationPeriod = (html: string): { applicationStartAt?: string; applicationEndAt?: string } => {
  const text = stripHtml(html);
  const scopedText = text.match(/(?:신청접수기간|신청기간|접수기간|청약접수)[\s\S]{0,140}/)?.[0] ?? text;
  const dates = extractDates(scopedText);
  if (dates.length < 2) {
    return {};
  }

  return {
    applicationStartAt: dates[0],
    applicationEndAt: dates[1],
  };
};

const extractTitle = (rowHtml: string): string => {
  const linkMatch = rowHtml.match(/<a\b[^>]*href=["'][^"']*articleNo=\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  return stripHtml(linkMatch?.[1] ?? '');
};

const preferPdfAttachments = <T extends { title: string; url: string }>(attachments: T[]): T[] =>
  [...attachments].sort((left: T, right: T) => {
    const leftIsPdf = /\.pdf(?:$|[?#])/i.test(left.title) || /\.pdf(?:$|[?#])/i.test(left.url);
    const rightIsPdf = /\.pdf(?:$|[?#])/i.test(right.title) || /\.pdf(?:$|[?#])/i.test(right.url);
    return Number(rightIsPdf) - Number(leftIsPdf);
  });

const extractAttachments = (html: string): Array<{ title: string; url: string }> => {
  const items = Array.from(html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi));
  const attachments = items
    .map(([, itemHtml]) => {
      const title = stripHtml(itemHtml?.match(/<div\b[^>]*class=["'][^"']*fileNm[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '');
      const href = itemHtml?.match(/<a\b[^>]*href=["']([^"']*mode=download[^"']*)["'][^>]*>/i)?.[1] ?? '';
      return {
        title,
        url: href ? toAbsoluteGhUrl(href) : '',
      };
    })
    .filter((attachment) => attachment.title.length > 0 && attachment.url.length > 0);

  if (attachments.length > 0) {
    return preferPdfAttachments(attachments);
  }

  const fallbackAttachments = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']*mode=download[^"']*)["'][^>]*title=["']([^"']*)["'][^>]*>/gi))
    .map(([, href, title]) => ({
      title: stripHtml(decodeHtmlEntities(title ?? '').replace(/\s*다운로드\s*$/g, '')),
      url: toAbsoluteGhUrl(href ?? ''),
    }))
    .filter((attachment) => attachment.title.length > 0 && attachment.url.length > 0);

  return preferPdfAttachments(fallbackAttachments);
};

const extractBodyPreview = (html: string): string =>
  stripHtml(html.match(/<div\b[^>]*class=["'][^"']*fr-view[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? html).slice(0, 300);

export const parseGhNoticeListHtml = (html: string): RawNoticeCandidate[] => {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const notices: RawNoticeCandidate[] = [];

  for (const [, rowHtml] of rows) {
    const linkMatch = rowHtml.match(/<a\b[^>]*href=["']([^"']*articleNo=(\d+)[^"']*)["'][^>]*>/i);
    if (!linkMatch) {
      continue;
    }

    const href = linkMatch[1] ?? '';
    const articleNo = linkMatch[2] ?? '';
    const title = extractTitle(rowHtml);
    if (!articleNo || !title || !isActionableNoticeTitle(title)) {
      continue;
    }

    const cells = extractCells(rowHtml);
    const category = cells[1] ?? '주택';
    const department = cells[3] ?? '';
    const postedAt = normalizeGhDate(cells.find((cell) => /^\d{2,4}[.-]\d{1,2}[.-]\d{1,2}$/.test(cell)) ?? '');
    const sourceUrl = toAbsoluteGhUrl(href);
    const rawIds = { articleNo };

    notices.push({
      sourceId: articleNo,
      title,
      status: 'posted',
      region: '경기',
      postedAt,
      sourceUrl,
      metadata: {
        provider: GH_PROVIDER,
        category,
        department,
        rawIds,
      },
      listings: [
        {
          title,
          supplyType: category,
          region: '경기',
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

export const parseGhNoticeDetailHtml = (html: string, notice: RawNoticeCandidate): RawNoticeCandidate => {
  const attachments = extractAttachments(html);
  const primaryApplicationAttachment = findPrimaryApplicationAttachment(attachments);
  const bodyPreview = extractBodyPreview(html);
  const eligibilityRequirements = extractEligibilityRequirementsFromText(stripHtml(html));

  return {
    ...notice,
    ...extractApplicationPeriod(html),
    metadata: {
      ...(notice.metadata ?? {}),
      attachments,
      ...(primaryApplicationAttachment ? { primaryApplicationAttachment } : {}),
      bodyPreview,
      ...(eligibilityRequirements ? { eligibilityRequirements } : {}),
    },
  };
};

const GH_FIXTURE: RawNoticeCandidate[] = [
  {
    sourceId: 'gh-notice-1',
    title: 'GH 경기행복주택 입주자 모집공고',
    status: 'posted',
    region: '경기',
    targetTags: ['행복주택', '청년'],
    postedAt: '2026-05-07',
    sourceUrl: 'https://example.com/gh/notices/1',
    metadata: { provider: GH_PROVIDER, fixture: true },
    listings: [
      {
        title: 'GH 경기행복주택 입주자 모집공고',
        supplyType: '주택',
        region: '경기',
        targetTags: ['행복주택', '청년'],
        status: 'posted',
        metadata: { fixture: true },
      },
    ],
  },
];

export const createGhAdapter = (options: CreateGhAdapterOptions = {}): SourceAdapter => {
  const fetchImpl = options.fetch ?? fetch;
  const useFixtureFallback = options.useFixtureFallback ?? false;
  const noticesById = new Map<string, RawNoticeCandidate>();

  return {
    source: 'gh',
    async fetchNotices() {
      const response = await fetchImpl(GH_HOUSING_NOTICE_LIST_URL);
      const html = await response.text();
      const notices = parseGhNoticeListHtml(html);
      const result = notices.length > 0 || !useFixtureFallback ? notices : GH_FIXTURE;
      noticesById.clear();
      result.forEach((notice) => noticesById.set(notice.sourceId, notice));
      return result;
    },
    async fetchNoticeDetails(id: string) {
      const notice = noticesById.get(id) ?? (useFixtureFallback ? GH_FIXTURE.find((fixture) => fixture.sourceId === id) : undefined);
      if (!notice?.sourceUrl) {
        return notice ?? null;
      }

      const response = await fetchImpl(notice.sourceUrl);
      const html = await response.text();
      return parseGhNoticeDetailHtml(html, notice);
    },
  };
};
