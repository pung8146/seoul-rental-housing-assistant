import type { RawNoticeCandidate, SourceAdapter } from './base.js';
import { findPrimaryApplicationAttachment } from '../domain/attachments.js';
import { extractEligibilityRequirementsFromText } from '../domain/requirements.js';

const LH_PROVIDER = 'LH';
const LH_NOTICE_LIST_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026';
const LH_NOTICE_DETAIL_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do';
const LH_ORIGIN = 'https://apply.lh.or.kr';

type LhFetch = typeof fetch;

export type CreateLhAdapterOptions = {
  fetch?: LhFetch;
  useFixtureFallback?: boolean;
};

const extractCells = (rowHtml: string): string[] => {
  const matches = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
  return matches.map((match) => stripHtml(match[1]));
};

const extractHeaderCells = (rowHtml: string): string[] => {
  const matches = Array.from(rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi));
  return matches.map((match) => stripHtml(match[1]));
};

const stripHtml = (html: string): string => {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return withoutScripts.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const toAbsoluteLhUrl = (url: string): string => {
  const decodedUrl = decodeHtmlEntities(url);

  try {
    return new URL(decodedUrl, LH_ORIGIN).toString();
  } catch {
    return decodedUrl;
  }
};

const extractAttribute = (html: string, name: string): string | null => {
  const match = html.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
  return match ? decodeHtmlEntities(match[1] ?? '') : null;
};

const extractAnchorText = (rowHtml: string): string => {
  const anchorMatch = rowHtml.match(/<([a-z]+)\b[^>]*class=["'][^"']*wrtancInfoBtn[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
  return anchorMatch?.[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
};

const normalizeNoticeTitle = (value: string): string =>
  value
    .replace(/\s*\d+일전\s*/g, ' ')
    .replace(/\s*오늘\s*/g, ' ')
    .replace(/\bNEW\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const isDateCell = (value: string): boolean => /^\d{4}[-.]\d{2}[-.]\d{2}$/.test(value);

const normalizeLhDate = (value: string): string => value.replace(/\./g, '-');

const extractApplicationPeriod = (html: string): { applicationStartAt?: string; applicationEndAt?: string } => {
  const text = stripHtml(html);
  const match = text.match(/접수기간\s*:?\s*(\d{4}[-.]\d{2}[-.]\d{2})[\s\S]{0,40}?~[\s\S]{0,40}?(\d{4}[-.]\d{2}[-.]\d{2})/);
  if (!match) {
    return {};
  }

  return {
    applicationStartAt: normalizeLhDate(match[1] ?? ''),
    applicationEndAt: normalizeLhDate(match[2] ?? ''),
  };
};

const extractEligibilityRequirements = (html: string): Record<string, unknown> | undefined => {
  const text = stripHtml(html);
  return extractEligibilityRequirementsFromText(text);
};

const isAttachmentLink = (title: string, url: string): boolean => {
  const lowerUrl = url.toLowerCase();
  return (
    /\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)(\?|#|$)/i.test(lowerUrl) ||
    lowerUrl.includes('filedownload') ||
    lowerUrl.includes('download') ||
    title.includes('공고문') ||
    title.includes('첨부') ||
    title.includes('공급대상')
  );
};

const extractAttachments = (html: string): Array<{ title: string; url: string }> =>
  Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) => {
      const url = toAbsoluteLhUrl(match[1] ?? '');
      const title = decodeHtmlEntities(stripHtml(match[2] ?? ''));

      return { title, url };
    })
    .filter((attachment) => attachment.title.length > 0 && attachment.url.length > 0)
    .filter((attachment) => isAttachmentLink(attachment.title, attachment.url));

const compactRawIds = (ids: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(ids).filter(([, value]) => value.length > 0));

const buildLhNoticeDetailUrl = (rawIds: Record<string, string>): string | undefined => {
  const panId = rawIds.dataId1;
  const ccrCnntSysDsCd = rawIds.dataId2;
  const uppAisTpCd = rawIds.dataId3;
  const aisTpCd = rawIds.dataId4;

  if (!panId || !ccrCnntSysDsCd || !uppAisTpCd || !aisTpCd) {
    return undefined;
  }

  const params = new URLSearchParams({
    ccrCnntSysDsCd,
    panId,
    aisTpCd,
    uppAisTpCd,
    mi: '1026',
    panKdCd: '',
    otxtPanId: '',
  });

  return `${LH_NOTICE_DETAIL_URL}?${params.toString()}`;
};

export const parseLhNoticeListHtml = (html: string): RawNoticeCandidate[] => {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const notices: RawNoticeCandidate[] = [];

  for (const [, rowHtml] of rows) {
    const buttonMatch = rowHtml.match(/<[^>]*class=["'][^"']*wrtancInfoBtn[^"']*["'][^>]*>/i);
    if (!buttonMatch) {
      continue;
    }

    const dataId1 = extractAttribute(buttonMatch[0], 'data-id1');
    if (!dataId1) {
      continue;
    }

    const dataId2 = extractAttribute(buttonMatch[0], 'data-id2') ?? '';
    const dataId3 = extractAttribute(buttonMatch[0], 'data-id3') ?? '';
    const dataId4 = extractAttribute(buttonMatch[0], 'data-id4') ?? '';
    const cells = extractCells(rowHtml);
    let title = extractAnchorText(rowHtml);
    let titleCellIndex = cells.findIndex((cell) => title.length > 0 && cell.includes(title));
    if (titleCellIndex === 0 || titleCellIndex < 0) {
      titleCellIndex = cells.findIndex((cell, index) => index > 0 && !isDateCell(cell) && isDateCell(cells[index + 3] ?? ''));
      title = cells[titleCellIndex] ?? title;
    }
    title = normalizeNoticeTitle(title);
    const postedAtIndex = cells.findIndex((cell, index) => index > titleCellIndex && isDateCell(cell));
    const supplyType = titleCellIndex > 1 ? cells[titleCellIndex - 1] : cells[titleCellIndex + 1] ?? '';
    const regionStartIndex = titleCellIndex > 1 ? titleCellIndex + 1 : titleCellIndex + 2;
    const regionCandidates = postedAtIndex > titleCellIndex ? cells.slice(regionStartIndex, postedAtIndex).filter(Boolean) : [];
    const region = regionCandidates.find((cell) => !cell.includes('첨부')) ?? regionCandidates.at(-1) ?? '';
    const postedAt = normalizeLhDate(cells[postedAtIndex] ?? '');
    const applicationEndAt = normalizeLhDate(cells.find((cell, index) => index > postedAtIndex && isDateCell(cell)) ?? '');
    const status = cells[postedAtIndex + 2] ?? cells[postedAtIndex + 1] ?? '';
    const rawIds = compactRawIds({ dataId1, dataId2, dataId3, dataId4 });

    notices.push({
      sourceId: dataId1,
      title,
      status,
      region,
      postedAt,
      applicationEndAt,
      sourceUrl: buildLhNoticeDetailUrl(rawIds),
      metadata: {
        provider: LH_PROVIDER,
        rawIds,
      },
      listings: [
        {
          title,
          supplyType,
          region,
          status,
          metadata: {
            rawIds,
          },
        },
      ],
    });
  }

  return notices;
};

const findHeaderIndex = (headers: string[], candidates: string[]): number =>
  headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));

const extractDetailBuildings = (html: string): string[] =>
  Array.from(html.matchAll(/contentString_\d+\s*=\s*['"]([^'"]+)['"]/gi))
    .map((match) => stripHtml(match[1]))
    .filter((value) => !value.startsWith('<') && !value.includes('\\'))
    .filter(Boolean);

export const parseLhNoticeDetailHtml = (html: string, notice: RawNoticeCandidate): RawNoticeCandidate => {
  const tables = Array.from(html.matchAll(/<table\b[\s\S]*?<\/table>/gi));
  const buildings = extractDetailBuildings(html);
  const applicationPeriod = extractApplicationPeriod(html);
  const eligibilityRequirements = extractEligibilityRequirements(html);
  const attachments = extractAttachments(html);
  const primaryApplicationAttachment = findPrimaryApplicationAttachment(attachments);
  const listings = tables.flatMap((tableMatch, tableIndex) => {
    const tableHtml = tableMatch[0];
    const headers = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
      .flatMap(([, rowHtml]) => extractHeaderCells(rowHtml))
      .filter(Boolean);

    if (!headers.some((header) => header.includes('주택형'))) {
      return [];
    }

    const typeIndex = findHeaderIndex(headers, ['주택형']);
    const areaIndex = findHeaderIndex(headers, ['전용면적']);
    const depositIndex = findHeaderIndex(headers, ['임대보증금']);
    const rentIndex = findHeaderIndex(headers, ['월임대료']);
    const supplyCountIndex = findHeaderIndex(headers, ['금회공급']);
    const rows = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));

    return rows
      .map(([, rowHtml]) => [...extractHeaderCells(rowHtml), ...extractCells(rowHtml)])
      .filter((cells) => cells.length > 0)
      .filter((cells) => cells.some((cell) => !headers.includes(cell)))
      .map((cells) => {
        const housingType = cells[typeIndex] ?? '';
        const building = buildings[tableIndex];

        return {
          title: [notice.title, housingType].filter(Boolean).join(' '),
          supplyType: housingType,
          region: notice.region,
          targetTags: notice.targetTags,
          deposit: cells[depositIndex],
          monthlyRent: cells[rentIndex],
          floorAreaM2: cells[areaIndex],
          status: notice.status,
          metadata: {
            ...(notice.metadata ?? {}),
            building,
            supplyCount: supplyCountIndex >= 0 ? cells[supplyCountIndex] : undefined,
          },
        };
      });
  });

  return {
    ...notice,
    ...applicationPeriod,
    metadata: {
      ...(notice.metadata ?? {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(primaryApplicationAttachment ? { primaryApplicationAttachment } : {}),
      ...(eligibilityRequirements ? { eligibilityRequirements } : {}),
    },
    listings: listings.length > 0 ? listings : notice.listings,
  };
};

const LH_FIXTURE: RawNoticeCandidate[] = [
  {
    sourceId: 'lh-notice-1',
    title: 'LH 서울 청년 매입임대주택 모집',
    status: '모집중',
    region: '서울특별시',
    targetTags: ['청년', '신혼부부'],
    postedAt: '2026-05-07',
    applicationStartAt: '2026-05-10',
    applicationEndAt: '2026-05-20',
    sourceUrl: 'https://example.com/lh/notices/1',
    metadata: { provider: LH_PROVIDER, fixture: true },
    listings: [
      {
        title: '101동 201호',
        supplyType: '매입임대',
        region: '서울특별시',
        targetTags: ['청년'],
        deposit: '10,000,000',
        monthlyRent: '250,000',
        floorAreaM2: '39.8',
        status: '공급중',
        metadata: { building: '101동', unit: '201호' },
      },
    ],
  },
];

export const createLhAdapter = (options: CreateLhAdapterOptions = {}): SourceAdapter => {
  const fetchImpl = options.fetch ?? fetch;
  const useFixtureFallback = options.useFixtureFallback ?? false;
  const noticesById = new Map<string, RawNoticeCandidate>();

  return {
    source: 'lh',
    async fetchNotices() {
      const response = await fetchImpl(LH_NOTICE_LIST_URL);
      const html = await response.text();
      const notices = parseLhNoticeListHtml(html);
      const result = notices.length > 0 || !useFixtureFallback ? notices : LH_FIXTURE;
      noticesById.clear();
      result.forEach((notice) => noticesById.set(notice.sourceId, notice));
      return result;
    },
    async fetchNoticeDetails(id: string) {
      const notice = noticesById.get(id) ?? (useFixtureFallback ? LH_FIXTURE.find((fixture) => fixture.sourceId === id) : undefined);
      if (!notice?.sourceUrl) {
        return notice ?? null;
      }

      const response = await fetchImpl(notice.sourceUrl);
      const html = await response.text();
      return parseLhNoticeDetailHtml(html, notice);
    },
  };
};
