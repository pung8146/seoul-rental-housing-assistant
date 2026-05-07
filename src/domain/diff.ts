import type { Listing, NotificationEvent, Notice } from '../types.js';

export type DiffNoticeAndListingsInput = {
  incomingNotice: Notice;
  incomingListings: Listing[];
  existingNotice: Notice | null;
  existingListings: Listing[];
};

const createEvent = (
  type: NotificationEvent['type'],
  notice: Notice,
  listing: Listing | null,
  previousNotice?: Notice | null,
  previousListing?: Listing | null,
): NotificationEvent => ({
  type,
  notice,
  listing,
  previousNotice,
  previousListing,
  occurredAt: new Date().toISOString(),
});

export const diffNoticeAndListings = ({
  incomingNotice,
  incomingListings,
  existingNotice,
  existingListings,
}: DiffNoticeAndListingsInput): NotificationEvent[] => {
  if (!existingNotice) {
    return [createEvent('new_notice', incomingNotice, null)];
  }

  const existingListingsByStableKey = new Map(
    existingListings.map((listing) => [listing.stableKey, listing]),
  );

  const events: NotificationEvent[] = [];

  for (const incomingListing of incomingListings) {
    const existingListing = existingListingsByStableKey.get(incomingListing.stableKey);

    if (!existingListing) {
      events.push(createEvent('listing_added', incomingNotice, incomingListing));
      continue;
    }

    if (existingListing.changeHash !== incomingListing.changeHash) {
      events.push(
        createEvent(
          'listing_changed',
          incomingNotice,
          incomingListing,
          existingNotice,
          existingListing,
        ),
      );
    }
  }

  return events;
};

export const shouldSnapshotListingEvent = (event: NotificationEvent): boolean =>
  event.type === 'listing_added' || event.type === 'listing_changed';
