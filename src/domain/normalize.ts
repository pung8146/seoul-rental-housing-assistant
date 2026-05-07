import { buildChangeHash, buildNoticeChangeHash, buildNoticeStableKey, buildStableKey } from './keys';
import type { Listing, Notice } from '../types';

type RawListing = {
  title?: unknown;
  supplyType?: unknown;
  region?: unknown;
  targetTags?: unknown;
  deposit?: unknown;
  monthlyRent?: unknown;
  floorAreaM2?: unknown;
  status?: unknown;
  metadata?: Record<string, unknown>;
};

type RawNotice = {
  sourceId?: unknown;
  title?: unknown;
  status?: unknown;
  region?: unknown;
  targetTags?: unknown;
  postedAt?: unknown;
  applicationStartAt?: unknown;
  applicationEndAt?: unknown;
  sourceUrl?: unknown;
  metadata?: Record<string, unknown>;
  listings?: RawListing[];
};

type RawAdapterOutput = {
  source: string;
  notices: RawNotice[];
};

const REGION_ALIASES: Record<string, string> = {
  서울특별시: '서울',
  서울시: '서울',
  경기도: '경기',
};

export const cleanupText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : null;
};

export const normalizeRegion = (value: unknown): string | null => {
  const cleaned = cleanupText(value);
  if (!cleaned) {
    return null;
  }

  return REGION_ALIASES[cleaned] ?? cleaned;
};

export const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const cleaned = cleanupText(value);
  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanupText(item))
      .filter((item): item is string => item != null);
  }

  const cleaned = cleanupText(value);
  if (!cleaned) {
    return [];
  }

  return cleaned
    .split(/[\/,]/)
    .map((item) => cleanupText(item))
    .filter((item): item is string => item != null);
};

const nullableText = (value: unknown): string | null => cleanupText(value);

export const normalizeAdapterOutput = ({ source, notices }: RawAdapterOutput): { notices: Notice[]; listings: Listing[] } => {
  const normalizedNotices: Notice[] = [];
  const normalizedListings: Listing[] = [];

  for (const rawNotice of notices) {
    const sourceId = cleanupText(rawNotice.sourceId) ?? '';
    const title = cleanupText(rawNotice.title) ?? '';

    const notice: Notice = {
      source,
      sourceId,
      title,
      stableKey: '',
      changeHash: '',
      status: nullableText(rawNotice.status),
      region: normalizeRegion(rawNotice.region),
      targetTags: parseTags(rawNotice.targetTags),
      postedAt: nullableText(rawNotice.postedAt),
      applicationStartAt: nullableText(rawNotice.applicationStartAt),
      applicationEndAt: nullableText(rawNotice.applicationEndAt),
      sourceUrl: nullableText(rawNotice.sourceUrl),
      metadata: rawNotice.metadata ?? {},
    };

    notice.stableKey = buildNoticeStableKey(notice);
    notice.changeHash = buildNoticeChangeHash(notice);

    normalizedNotices.push(notice);

    for (const rawListing of rawNotice.listings ?? []) {
      const listingBase: Listing = {
        source,
        noticeSourceId: sourceId,
        title: cleanupText(rawListing.title) ?? '',
        stableKey: '',
        changeHash: '',
        supplyType: nullableText(rawListing.supplyType),
        region: normalizeRegion(rawListing.region),
        targetTags: parseTags(rawListing.targetTags),
        deposit: parseNumber(rawListing.deposit),
        monthlyRent: parseNumber(rawListing.monthlyRent),
        floorAreaM2: parseNumber(rawListing.floorAreaM2),
        status: nullableText(rawListing.status),
        metadata: rawListing.metadata ?? {},
      };

      listingBase.stableKey = buildStableKey(listingBase);
      listingBase.changeHash = buildChangeHash(listingBase);
      normalizedListings.push(listingBase);
    }
  }

  return { notices: normalizedNotices, listings: normalizedListings };
};
