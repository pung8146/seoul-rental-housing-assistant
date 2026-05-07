import { describe, expect, it } from 'vitest';

import { diffNoticeAndListings } from '../src/domain/diff';
import type { Listing, Notice } from '../src/types';

const makeNotice = (overrides: Partial<Notice> = {}): Notice => ({
  source: 'lh',
  sourceId: 'notice-1',
  title: '서울 청년 임대주택 모집',
  stableKey: 'notice:lh:notice-1',
  changeHash: 'notice-hash-1',
  status: 'open',
  region: '서울',
  targetTags: ['청년'],
  postedAt: '2026-05-07',
  applicationStartAt: null,
  applicationEndAt: null,
  sourceUrl: 'https://example.com/notices/1',
  metadata: {},
  ...overrides,
});

const makeListing = (overrides: Partial<Listing> = {}): Listing => ({
  source: 'lh',
  noticeSourceId: 'notice-1',
  title: '101동 201호',
  stableKey: 'listing:lh:notice-1:101-201',
  changeHash: 'listing-hash-1',
  supplyType: '행복주택',
  region: '서울',
  targetTags: ['청년'],
  deposit: 10000000,
  monthlyRent: 250000,
  floorAreaM2: 39.8,
  status: 'available',
  metadata: {},
  ...overrides,
});

describe('diffNoticeAndListings', () => {
  it('emits new_notice for an unknown notice', () => {
    const incomingNotice = makeNotice();
    const incomingListings = [makeListing()];

    const events = diffNoticeAndListings({
      incomingNotice,
      incomingListings,
      existingNotice: null,
      existingListings: [],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'new_notice',
      notice: incomingNotice,
      listing: null,
    });
    expect(events[0]?.occurredAt).toBeTruthy();
  });

  it('emits listing_added when a known notice gets a new listing', () => {
    const incomingNotice = makeNotice();
    const existingListing = makeListing();
    const addedListing = makeListing({
      title: '101동 202호',
      stableKey: 'listing:lh:notice-1:101-202',
      changeHash: 'listing-hash-2',
      metadata: { unit: '202호' },
    });

    const events = diffNoticeAndListings({
      incomingNotice,
      incomingListings: [existingListing, addedListing],
      existingNotice: makeNotice(),
      existingListings: [existingListing],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'listing_added',
      notice: incomingNotice,
      listing: addedListing,
    });
  });

  it('emits listing_changed when a stable listing changes content', () => {
    const incomingNotice = makeNotice();
    const previousListing = makeListing();
    const changedListing = makeListing({
      changeHash: 'listing-hash-2',
      monthlyRent: 270000,
    });

    const events = diffNoticeAndListings({
      incomingNotice,
      incomingListings: [changedListing],
      existingNotice: makeNotice(),
      existingListings: [previousListing],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'listing_changed',
      notice: incomingNotice,
      listing: changedListing,
    });
  });

  it('returns no events when notice and listings are unchanged', () => {
    const incomingNotice = makeNotice();
    const listing = makeListing();

    const events = diffNoticeAndListings({
      incomingNotice,
      incomingListings: [listing],
      existingNotice: makeNotice(),
      existingListings: [listing],
    });

    expect(events).toEqual([]);
  });
});
