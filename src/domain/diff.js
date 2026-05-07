const createEvent = (type, notice, listing, previousNotice, previousListing) => ({
    type,
    notice,
    listing,
    previousNotice,
    previousListing,
    occurredAt: new Date().toISOString(),
});
export const diffNoticeAndListings = ({ incomingNotice, incomingListings, existingNotice, existingListings, }) => {
    if (!existingNotice) {
        return [createEvent('new_notice', incomingNotice, null)];
    }
    const existingListingsByStableKey = new Map(existingListings.map((listing) => [listing.stableKey, listing]));
    const events = [];
    for (const incomingListing of incomingListings) {
        const existingListing = existingListingsByStableKey.get(incomingListing.stableKey);
        if (!existingListing) {
            events.push(createEvent('listing_added', incomingNotice, incomingListing));
            continue;
        }
        if (existingListing.changeHash !== incomingListing.changeHash) {
            events.push(createEvent('listing_changed', incomingNotice, incomingListing, existingNotice, existingListing));
        }
    }
    return events;
};
export const shouldSnapshotListingEvent = (event) => event.type === 'listing_added' || event.type === 'listing_changed';
