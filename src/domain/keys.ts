import { createHash } from 'node:crypto';

import type { Listing } from '../types';

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').toLowerCase();
};

const normalizeNumber = (value: number | null): string => (value == null ? '' : String(value));

const readMetadataText = (metadata: Listing['metadata'], key: string): string => {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
};

const hashParts = (parts: string[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex');

export const buildStableKey = (listing: Listing): string =>
  hashParts([
    normalizeText(listing.source),
    normalizeText(listing.noticeSourceId),
    normalizeText(listing.title),
    normalizeText(listing.supplyType),
    normalizeText(listing.region),
    normalizeText(readMetadataText(listing.metadata, 'building')),
    normalizeText(readMetadataText(listing.metadata, 'unit')),
  ]);

export const buildChangeHash = (listing: Listing): string =>
  hashParts([
    buildStableKey(listing),
    normalizeNumber(listing.deposit),
    normalizeNumber(listing.monthlyRent),
    normalizeNumber(listing.floorAreaM2),
    normalizeText(listing.status),
    normalizeText(listing.title),
    normalizeText(listing.region),
    normalizeText(listing.supplyType),
    normalizeText(listing.targetTags.join('|')),
  ]);
