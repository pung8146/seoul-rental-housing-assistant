# Dashboard Direction Design

## Decision

Start with a personal admin dashboard, but keep the data and UI boundaries clean enough to evolve into a user-facing dashboard later.

The first version should support one operator: collecting notices, checking which notices are actionable, reviewing recommendation quality, and preparing for future application automation. It should not introduce public accounts, multi-user permissions, or automatic submission workflows yet.

## Goals

- Show the same actionable notice set that Telegram uses, so the web UI does not reintroduce service notices, result posts, or expired-looking follow-up announcements.
- Make review easier than Telegram by showing details, attachments, listing rows, filter state, and collection status in one place.
- Add a place for future scoring and "best candidate" recommendations without coupling that logic to Telegram replies.
- Preserve an upgrade path to a user-facing dashboard by separating domain data, recommendation state, and presentation concerns.

## Non-Goals

- No public user registration in the first version.
- No storage of other users' private eligibility data.
- No fully automatic application submission.
- No browser automation for LH/SH application forms in this dashboard milestone.

## Product Shape

The first screen is an admin dashboard with dense, operational information:

- Actionable notices list
- Source, region, status, posted date, and application deadline when available
- Recommendation score placeholder
- A single local personal eligibility profile
- Eligibility labels that separate clear matches from unknown requirements
- Detail view with source URL, listing rows, attachments, and parsed metadata
- Excluded notice review list with exclusion reason
- Collection status, last run time, and error summary

The UI should feel like a work dashboard, not a marketing page. It should optimize for scanning, comparing, and deciding what to inspect next.

## Architecture

Keep the existing collector, query, and Telegram assistant flows. Add a web layer that reads from the same repository and uses the same actionable-notice filter.

The dashboard should be structured around these boundaries:

- Domain filters decide whether a notice is actionable.
- Repository queries return notices, listings, metadata, and collection status.
- The repository stores one local personal profile for eligibility checks.
- Recommendation logic scores notices later, without depending on Telegram or UI code.
- Eligibility logic should be conservative: only call a notice likely eligible when the profile and parsed notice data support it; otherwise label it as needing review.
- Web routes/components render dashboard views from repository data.
- Future application automation lives behind a separate module boundary and requires explicit user approval before any submission-like action.

## Personal Eligibility

The first eligibility version stores one profile in the local SQLite database. It is a personal admin tool, not a multi-user account system.

The profile should include:

- Birth date or age
- Homeless status
- Residence region
- Household size
- Monthly income
- Total assets
- Vehicle value
- Interest tags such as youth, newlywed, college student, senior, or general

The dashboard should use this profile to add conservative labels:

- `지원가능성 높음` when available parsed data matches the profile
- `조건 확인 필요` when the notice is relevant but the parser lacks enough requirements
- `대상 아님` when the notice clearly targets a different group
- `소득/자산 확인 필요` when financial thresholds are not parsed

This feature does not guarantee legal eligibility. It narrows the list so the operator can focus on the most plausible notices.

## Future Automation Path

Automatic application should be staged:

1. Recommend the best notice and explain why.
2. Prepare an application checklist from parsed details.
3. Open the official site and prefill or navigate where possible.
4. Stop before final submission and ask for confirmation.
5. Only consider full submission automation after repeated manual verification.

This keeps the current project useful now while reducing risk around accounts, authentication, personal information, and irreversible actions.

## Testing

- Unit-test domain filters so excluded notices stay out of actionable lists.
- Add query tests for dashboard endpoints or view models.
- Add an integration check that the dashboard and Telegram use the same actionable notice set.
- When UI exists, verify with a local browser screenshot across desktop and mobile widths.

## Open Questions

- Which framework should host the dashboard: a tiny built-in server, Vite app, or a full app framework?
- Should the first dashboard be read-only, or include manual controls like "mark as ignored" and "pin candidate"?
- Which notice requirement fields should be parsed next beyond title tags and application periods?
