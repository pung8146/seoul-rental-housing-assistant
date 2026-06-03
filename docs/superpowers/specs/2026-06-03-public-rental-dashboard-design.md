# Public Rental Dashboard Design

Date: 2026-06-03
Project: rental-housing-assistant

## Goal

Build a shareable, read-only web dashboard for rental housing notices.

The MVP must reuse the existing collection database and normalization logic, let other people browse notice lists and details without login, and keep a clean path toward personal filters and alert subscriptions later.

## Current Context

The existing app is a Node.js TypeScript project using SQLite through `better-sqlite3`.

Relevant existing pieces:

- `src/app/run-collect.ts`: live notice collection entry point.
- `src/app/run-collect-and-notify.ts`: collection plus Telegram notification flow.
- `src/app/dashboard-server.ts`: local `node:http` dashboard server.
- `src/app/dashboard-view.ts`: dashboard view model builder.
- `src/app/dashboard-render.ts`: server-rendered HTML for the current local dashboard.
- `src/db/repository.ts`: repository around notices, listings, source runs, notification history, and personal profile.
- `rental-housing.db`: default SQLite database.

The current dashboard is useful, but it includes a writable `/profile` POST endpoint and reads `personal_profile`. That makes it a poor public surface as-is. Public sharing needs a separate read-only boundary.

## Chosen Approach

Use a public feed export first:

1. Local collection continues to run on the existing PC/WSL/OpenClaw setup.
2. After collection, a new export command reads SQLite and writes a public feed file.
3. A new Vercel-friendly web dashboard reads only that public feed.
4. Supabase remains an expansion option, not a dependency for the MVP.

This keeps the MVP small and avoids making Vercel depend on a persistent SQLite file. It also prevents accidental exposure of local-only data.

## Alternatives Considered

### Existing Node Dashboard Publicly Hosted

This gives the most direct code reuse, but it is risky for the MVP. The current server includes profile writes and assumes direct SQLite access. Vercel serverless storage is not a good fit for a mutable SQLite database, and exposing the local dashboard would mix private and public concerns.

### Supabase/Postgres Sync First

This is the best long-term architecture for accounts, saved conditions, subscriptions, and richer querying. It is heavier for the first milestone because it requires schema migration, sync logic, and operational setup before a public dashboard exists.

### Public JSON Feed

This is the recommended MVP. It has the smallest migration cost, works well with Vercel, and creates a clear public/private data boundary. The feed schema should be shaped so it can later map cleanly to Supabase tables.

## Architecture

### Local Collector

The existing collector remains authoritative for scraping and normalization.

Collection still writes to SQLite:

- `notices`
- `listings`
- `source_runs`
- existing notification tables
- existing personal profile table

No public user traffic reaches the local collector or SQLite file.

### Public Feed Export

Add a read-only export path that produces a versioned JSON payload.

Recommended command:

```bash
npm run export:public-feed
```

Recommended output path for the Vercel app:

```text
public/public-feed.json
```

The export command should be deterministic and safe:

- Read from `RENTAL_HOUSING_DB_PATH` or `rental-housing.db`.
- Query notices and listings through repository methods or a dedicated read model.
- Include only public fields.
- Exclude personal profile, notification history, local paths, secrets, and private metadata.
- Sort notices by newest application or posted date.
- Emit a `generatedAt` timestamp.
- Emit a `schemaVersion`.

### Public Web Dashboard

The web dashboard reads `public-feed.json` and renders a read-only browsing experience.

MVP views:

- Notice list
- Notice detail
- Source/update status

MVP controls:

- Text search
- Source filter
- Notice type filter
- Region/status filter if data quality supports it
- URL query persistence for shareable filtered views

Example URLs:

```text
/?q=청년&type=rent&source=lh
/?notice=lh:12345
```

### Automatic Update Flow

When collection finishes, public data should update automatically.

Recommended phase 1:

1. Run existing collection.
2. Run public feed export.
3. Commit and push the changed feed file to the web repo.
4. Let Vercel deploy from GitHub.

Recommended phase 2:

1. Run existing collection.
2. Run public feed export.
3. Upload feed to object storage or Supabase Storage.
4. Let Vercel fetch the latest feed at runtime or during revalidation.

Phase 1 is simpler. Phase 2 reduces noisy commits and is better when update frequency grows.

## Public Feed Schema

Use a compact schema that can later map to tables.

Top-level shape:

```ts
type PublicFeed = {
  schemaVersion: 1;
  generatedAt: string;
  sourceStatus: PublicSourceStatus[];
  notices: PublicNotice[];
};
```

Notice shape:

```ts
type PublicNotice = {
  key: string;
  source: string;
  sourceId: string;
  title: string;
  noticeType: 'rent' | 'sale' | 'newlywed' | 'youth' | 'other';
  region: string | null;
  status: string | null;
  targetTags: string[];
  postedAt: string | null;
  applicationStartAt: string | null;
  applicationEndAt: string | null;
  sourceUrl: string | null;
  attachments: PublicAttachment[];
  eligibilitySummary: string[];
  listings: PublicListing[];
};
```

Listing shape:

```ts
type PublicListing = {
  stableKey: string;
  region: string | null;
  district: string | null;
  address: string | null;
  housingType: string | null;
  supplyType: string | null;
  areaSquareMeters: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  units: number | null;
};
```

The exact field names should follow existing `Notice` and `Listing` types where possible.

## Data Privacy Boundary

Public export must not include:

- `personal_profile`
- Telegram bot tokens, chat IDs, topic IDs, or channel config
- `notification_history`
- local file paths
- raw HTML or downloaded document text unless explicitly sanitized
- internal errors that reveal local environment details
- opaque metadata fields that have not been reviewed

The public feed may include:

- notice title
- source
- source notice ID
- public notice URL
- public attachment URL
- target tags
- public application dates
- public listing fields
- parsed eligibility summaries
- collection status summary

## Web UX

The first screen is the product, not a landing page.

Layout:

- Header with service name, last updated time, and source health.
- Filter/search bar.
- Dense notice list optimized for scanning.
- Detail panel or detail route for selected notice.

List cards should show:

- source
- notice type
- title
- region/status
- application period
- important tags
- whether listings or attachments are available

Detail view should show:

- application period
- source link
- attachment links
- eligibility summary
- listing table
- collected/updated timestamp

## Future Extension Path

### Supabase Sync

Keep the feed schema close to a future relational shape:

- `public_notices`
- `public_listings`
- `public_attachments`
- `source_runs`

Later, the exporter can write to Supabase instead of or in addition to JSON.

### User Accounts

Supabase Auth can be added later for:

- saved profiles
- saved filters
- subscription preferences
- alert destinations

No login is needed for the MVP.

### Alert Subscriptions

Future subscription matching should compare new or changed notices against saved filters.

The subscription layer should depend on the public notice model, not on the local collector internals. This keeps alerts usable whether the storage backend is JSON, Supabase, or another database.

## Testing Plan

Add focused tests for:

- Public feed export includes expected notice and listing fields.
- Public feed export excludes private fields.
- Public feed schema validation.
- Notice type inference.
- Dashboard list rendering from feed.
- Dashboard detail rendering from feed.
- URL query filters.

Existing tests around collection, repository, and current dashboard should remain unchanged unless shared helpers are extracted.

## Implementation Boundaries

MVP should not include:

- login
- user profile editing
- subscription setup
- live server-side SQLite reads from Vercel
- admin write endpoints
- scraping changes unrelated to public display

MVP should include:

- read-only public feed export
- Vercel-compatible web dashboard
- automatic post-collection update path
- tests for privacy and rendering
- clear docs for deploy/update commands

## Open Decisions

The current approved defaults are:

- Start without Supabase.
- Keep local collection.
- Use Vercel for the public web dashboard.
- Use public JSON feed for MVP.
- Automatically update the public dashboard after collection.

The implementation plan should still choose:

- whether the Vercel app lives inside this repo or a separate repo,
- whether phase 1 deployment uses GitHub push or a deploy hook,
- the exact public feed file path,
- the frontend framework, if any.
