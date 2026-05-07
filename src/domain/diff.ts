import type { Listing, NotificationEvent, Notice } from '../types';

type DiffNoticeAndListingsInput = {
  incomingNotice: Notice;
  incomingListings: Listing[];
  existingNotice: Notice | null;
  existingListings: Listing[];
};

const createEvent = (
  type: NotificationEvent['type'],
  notice: Notice,
  listing: Listing | null,
): NotificationEvent => ({
  type,
  notice,
  listing,
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
      events.push(createEvent('listing_changed', incomingNotice, incomingListing));
    }
  }

  return events;
};
