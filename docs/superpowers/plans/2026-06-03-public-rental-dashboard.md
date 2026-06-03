# Public Rental Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-friendly, read-only public dashboard from the existing rental housing SQLite data through a sanitized JSON feed.

**Architecture:** Keep local collection and SQLite as the private source of truth. Add a public feed export layer that writes `public/public-feed.json`, then add a static no-framework web dashboard under `web/public-dashboard` that reads that feed and supports list/detail/filter browsing. The design keeps Supabase as a later sync target by using a versioned feed schema close to future relational tables.

**Tech Stack:** Node.js, TypeScript, Vitest, Zod, better-sqlite3, static HTML/CSS/vanilla JavaScript, Vercel static deployment.

---

## File Structure

- Create `src/public-feed/schema.ts`: Zod schema and TypeScript types for the public feed.
- Create `src/public-feed/notice-type.ts`: shared notice type inference for export and tests.
- Create `src/public-feed/build-public-feed.ts`: pure builder from repository data to sanitized feed.
- Create `src/app/run-export-public-feed.ts`: CLI entry point that writes the feed JSON.
- Modify `package.json`: add `export:public-feed`, `build:public-web`, and `build:public-dashboard` scripts.
- Create `tests/public-feed.test.ts`: feed schema, privacy, sorting, and type inference tests.
- Create `web/public-dashboard/index.html`: static dashboard shell.
- Create `web/public-dashboard/styles.css`: responsive dashboard styling.
- Create `web/public-dashboard/app.js`: feed loading, filtering, list rendering, and detail rendering.
- Create `web/public-dashboard/build.mjs`: copies static files and `public/public-feed.json` into `web/public-dashboard/dist`.
- Create `tests/public-dashboard-static.test.js`: validates static app files contain required hooks and no private endpoints.
- Create `vercel.json`: static build configuration for Vercel.
- Modify `README.md`: document export, local preview, and Vercel deployment/update flow.

## Task 1: Public Feed Schema

**Files:**
- Create: `src/public-feed/schema.ts`
- Test: `tests/public-feed.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `tests/public-feed.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import { PublicFeedSchema } from '../src/public-feed/schema.js';

describe('public feed schema', () => {
  it('accepts a minimal public feed', () => {
    const parsed = PublicFeedSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-06-03T00:00:00.000Z',
      sourceStatus: [
        {
          source: 'lh',
          lastFinishedAt: '2026-06-03T00:00:00.000Z',
          status: 'success',
          message: null,
        },
      ],
      notices: [
        {
          key: 'lh:notice-1',
          source: 'lh',
          sourceId: 'notice-1',
          title: '서울 청년 임대주택 모집',
          noticeType: 'youth',
          region: '서울',
          status: '공고중',
          targetTags: ['청년'],
          postedAt: '2026-06-01',
          applicationStartAt: null,
          applicationEndAt: null,
          sourceUrl: 'https://example.com/notices/1',
          attachments: [
            {
              name: '공고문.pdf',
              url: 'https://example.com/notice.pdf',
            },
          ],
          eligibilitySummary: ['만 19세 이상 39세 이하'],
          listings: [
            {
              stableKey: 'listing-1',
              title: '행복주택 29A',
              region: '서울',
              supplyType: '행복주택',
              areaSquareMeters: 29.5,
              deposit: 10000000,
              monthlyRent: 250000,
              status: '공급중',
              targetTags: ['청년'],
            },
          ],
        },
      ],
    });

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.notices[0]?.listings[0]?.areaSquareMeters).toBe(29.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/public-feed.test.ts
```

Expected: fail because `src/public-feed/schema.ts` does not exist.

- [ ] **Step 3: Add public feed schema**

Create `src/public-feed/schema.ts` with:

```ts
import { z } from 'zod';

const NullableString = z.string().min(1).nullable();
const NullableNumber = z.number().finite().nullable();

export const PublicNoticeTypeSchema = z.enum(['rent', 'sale', 'newlywed', 'youth', 'other']);

export const PublicAttachmentSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
});

export const PublicListingSchema = z.object({
  stableKey: z.string().min(1),
  title: z.string().min(1),
  region: NullableString,
  supplyType: NullableString,
  areaSquareMeters: NullableNumber,
  deposit: NullableNumber,
  monthlyRent: NullableNumber,
  status: NullableString,
  targetTags: z.array(z.string()),
});

export const PublicNoticeSchema = z.object({
  key: z.string().min(1),
  source: z.string().min(1),
  sourceId: z.string().min(1),
  title: z.string().min(1),
  noticeType: PublicNoticeTypeSchema,
  region: NullableString,
  status: NullableString,
  targetTags: z.array(z.string()),
  postedAt: NullableString,
  applicationStartAt: NullableString,
  applicationEndAt: NullableString,
  sourceUrl: NullableString,
  attachments: z.array(PublicAttachmentSchema),
  eligibilitySummary: z.array(z.string()),
  listings: z.array(PublicListingSchema),
});

export const PublicSourceStatusSchema = z.object({
  source: z.string().min(1),
  lastFinishedAt: NullableString,
  status: z.enum(['success', 'partial', 'failure', 'unknown']),
  message: NullableString,
});

export const PublicFeedSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  sourceStatus: z.array(PublicSourceStatusSchema),
  notices: z.array(PublicNoticeSchema),
});

export type PublicNoticeType = z.infer<typeof PublicNoticeTypeSchema>;
export type PublicAttachment = z.infer<typeof PublicAttachmentSchema>;
export type PublicListing = z.infer<typeof PublicListingSchema>;
export type PublicNotice = z.infer<typeof PublicNoticeSchema>;
export type PublicSourceStatus = z.infer<typeof PublicSourceStatusSchema>;
export type PublicFeed = z.infer<typeof PublicFeedSchema>;
```

- [ ] **Step 4: Run schema test**

Run:

```bash
npm test -- tests/public-feed.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/public-feed/schema.ts tests/public-feed.test.ts
git commit -m "공개 피드 스키마 추가"
```

## Task 2: Notice Type Inference

**Files:**
- Create: `src/public-feed/notice-type.ts`
- Modify: `tests/public-feed.test.ts`

- [ ] **Step 1: Add failing notice type tests**

Append to `tests/public-feed.test.ts`:

```ts
import { inferPublicNoticeType } from '../src/public-feed/notice-type.js';

describe('inferPublicNoticeType', () => {
  it('classifies common public notice types', () => {
    expect(inferPublicNoticeType({ title: '서울 청년 행복주택 입주자 모집', targetTags: [] })).toBe('youth');
    expect(inferPublicNoticeType({ title: '신혼부부 매입임대 입주자 모집', targetTags: [] })).toBe('newlywed');
    expect(inferPublicNoticeType({ title: '공공분양주택 사전청약 공고', targetTags: [] })).toBe('sale');
    expect(inferPublicNoticeType({ title: '국민임대주택 입주자 모집', targetTags: [] })).toBe('rent');
    expect(inferPublicNoticeType({ title: '자료 정비 안내', targetTags: [] })).toBe('other');
  });

  it('uses target tags as search text', () => {
    expect(inferPublicNoticeType({ title: '입주자 모집', targetTags: ['청년'] })).toBe('youth');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/public-feed.test.ts
```

Expected: fail because `src/public-feed/notice-type.ts` does not exist.

- [ ] **Step 3: Add inference helper**

Create `src/public-feed/notice-type.ts` with:

```ts
import type { PublicNoticeType } from './schema.js';

type NoticeTypeInput = {
  title: string;
  targetTags: string[];
};

const searchText = (notice: NoticeTypeInput): string => [notice.title, ...notice.targetTags].join(' ');

export const inferPublicNoticeType = (notice: NoticeTypeInput): PublicNoticeType => {
  const text = searchText(notice);

  if (/청년|대학생/.test(text)) {
    return 'youth';
  }
  if (/신혼|신생아/.test(text)) {
    return 'newlywed';
  }
  if (/분양|공공분양|분양주택|사전청약/.test(text)) {
    return 'sale';
  }
  if (/임대|행복주택|장기전세|전세임대|매입임대|국민임대|공공임대/.test(text)) {
    return 'rent';
  }
  return 'other';
};
```

- [ ] **Step 4: Run test**

Run:

```bash
npm test -- tests/public-feed.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/public-feed/notice-type.ts tests/public-feed.test.ts
git commit -m "공개 공고 유형 추론 추가"
```

## Task 3: Public Feed Builder

**Files:**
- Create: `src/public-feed/build-public-feed.ts`
- Modify: `tests/public-feed.test.ts`

- [ ] **Step 1: Add failing builder/privacy test**

Append to `tests/public-feed.test.ts`:

```ts
import { buildPublicFeed } from '../src/public-feed/build-public-feed.js';
import { createRepository } from '../src/db/repository.js';
import type { Listing, Notice } from '../src/types.js';

const makeNotice = (overrides: Partial<Notice> = {}): Notice => ({
  source: 'lh',
  sourceId: 'notice-1',
  title: '서울 청년 행복주택 입주자 모집',
  stableKey: 'notice:lh:notice-1',
  changeHash: 'private-change-hash',
  status: '공고중',
  region: '서울',
  targetTags: ['청년'],
  postedAt: '2026-06-01',
  applicationStartAt: '2026-06-10',
  applicationEndAt: '2026-06-12',
  sourceUrl: 'https://example.com/notices/1',
  metadata: {
    attachments: [{ name: '공고문.pdf', url: 'https://example.com/notice.pdf' }],
    eligibilityRequirements: {
      minAge: 19,
      maxAge: 39,
      requiresHomeless: true,
    },
    localPath: '/home/private/download.pdf',
  },
  ...overrides,
});

const makeListing = (overrides: Partial<Listing> = {}): Listing => ({
  source: 'lh',
  noticeSourceId: 'notice-1',
  title: '행복주택 29A',
  stableKey: 'listing:lh:notice-1:29a',
  changeHash: 'private-listing-hash',
  supplyType: '행복주택',
  region: '서울',
  targetTags: ['청년'],
  deposit: 10000000,
  monthlyRent: 250000,
  floorAreaM2: 29.5,
  status: '공급중',
  metadata: { internalMemo: 'private' },
  ...overrides,
});

describe('buildPublicFeed', () => {
  it('builds a sanitized feed from repository data', () => {
    const repository = createRepository(':memory:');
    repository.upsertNotice(makeNotice());
    repository.upsertListing(makeListing());
    repository.savePersonalProfile({
      birthYear: 1995,
      isHomeless: true,
      residenceRegion: '서울',
      householdSize: 1,
      monthlyIncome: 2500000,
      totalAssets: 50000000,
      vehicleValue: 0,
      subscriptionAccountMonths: 36,
      subscriptionPaymentCount: 24,
      interestTags: ['청년'],
    });
    repository.recordNotification('telegram:123', 'payload-hash', '2026-06-03T00:01:00.000Z');
    repository.recordSourceRun({
      source: 'lh',
      startedAt: '2026-06-03T00:00:00.000Z',
      finishedAt: '2026-06-03T00:00:02.000Z',
      status: 'success',
      message: null,
    });

    const feed = buildPublicFeed({
      repository,
      generatedAt: '2026-06-03T00:05:00.000Z',
    });

    expect(PublicFeedSchema.parse(feed)).toEqual(feed);
    expect(feed.notices).toHaveLength(1);
    expect(feed.notices[0]).toMatchObject({
      key: 'lh:notice-1',
      noticeType: 'youth',
      title: '서울 청년 행복주택 입주자 모집',
      attachments: [{ name: '공고문.pdf', url: 'https://example.com/notice.pdf' }],
      eligibilitySummary: ['만 19세 이상', '만 39세 이하', '무주택 요건 확인 필요'],
      listings: [
        {
          stableKey: 'listing:lh:notice-1:29a',
          title: '행복주택 29A',
          areaSquareMeters: 29.5,
        },
      ],
    });
    expect(feed.sourceStatus).toEqual([
      {
        source: 'lh',
        lastFinishedAt: '2026-06-03T00:00:02.000Z',
        status: 'success',
        message: null,
      },
    ]);
    expect(JSON.stringify(feed)).not.toContain('birthYear');
    expect(JSON.stringify(feed)).not.toContain('telegram');
    expect(JSON.stringify(feed)).not.toContain('private-change-hash');
    expect(JSON.stringify(feed)).not.toContain('/home/private');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/public-feed.test.ts
```

Expected: fail because `build-public-feed.ts` does not exist.

- [ ] **Step 3: Add public feed builder**

Create `src/public-feed/build-public-feed.ts` with:

```ts
import type { Repository } from '../db/repository.js';
import type { Listing, Notice, SourceRun } from '../types.js';
import { inferPublicNoticeType } from './notice-type.js';
import type { PublicAttachment, PublicFeed, PublicListing, PublicSourceStatus } from './schema.js';

type BuildPublicFeedInput = {
  repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice' | 'listSourceRuns'>;
  generatedAt?: string;
};

type RawAttachment = {
  name?: unknown;
  url?: unknown;
};

const toNoticeKey = (notice: Pick<Notice, 'source' | 'sourceId'>): string => `${notice.source}:${notice.sourceId}`;

const toPublicAttachments = (notice: Notice): PublicAttachment[] => {
  const attachments = notice.metadata.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((attachment: RawAttachment) => ({
      name: typeof attachment.name === 'string' ? attachment.name.trim() : '',
      url: typeof attachment.url === 'string' ? attachment.url.trim() : '',
    }))
    .filter((attachment) => attachment.name.length > 0 && attachment.url.length > 0);
};

const toEligibilitySummary = (notice: Notice): string[] => {
  const requirements = notice.metadata.eligibilityRequirements;
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) {
    return [];
  }

  const values = requirements as Record<string, unknown>;
  const summary: string[] = [];

  if (typeof values.minAge === 'number') {
    summary.push(`만 ${values.minAge}세 이상`);
  }
  if (typeof values.maxAge === 'number') {
    summary.push(`만 ${values.maxAge}세 이하`);
  }
  if (values.requiresHomeless === true) {
    summary.push('무주택 요건 확인 필요');
  }
  if (typeof values.maxMonthlyIncome === 'number') {
    summary.push(`월소득 ${values.maxMonthlyIncome.toLocaleString('ko-KR')}원 이하`);
  }
  if (typeof values.maxTotalAssets === 'number') {
    summary.push(`총자산 ${values.maxTotalAssets.toLocaleString('ko-KR')}원 이하`);
  }
  if (typeof values.maxVehicleValue === 'number') {
    summary.push(`자동차 ${values.maxVehicleValue.toLocaleString('ko-KR')}원 이하`);
  }

  return summary;
};

const toPublicListing = (listing: Listing): PublicListing => ({
  stableKey: listing.stableKey,
  title: listing.title,
  region: listing.region,
  supplyType: listing.supplyType,
  areaSquareMeters: listing.floorAreaM2,
  deposit: listing.deposit,
  monthlyRent: listing.monthlyRent,
  status: listing.status,
  targetTags: listing.targetTags,
});

const latestRunBySource = (runs: SourceRun[]): PublicSourceStatus[] => {
  const latest = new Map<string, SourceRun>();

  for (const run of runs) {
    const previous = latest.get(run.source);
    if (!previous || run.finishedAt > previous.finishedAt) {
      latest.set(run.source, run);
    }
  }

  return [...latest.values()]
    .sort((left, right) => left.source.localeCompare(right.source))
    .map((run) => ({
      source: run.source,
      lastFinishedAt: run.finishedAt,
      status: run.status,
      message: run.message,
    }));
};

export const buildPublicFeed = ({
  repository,
  generatedAt = new Date().toISOString(),
}: BuildPublicFeedInput): PublicFeed => {
  const notices = repository
    .queryNotices({})
    .map((notice) => ({
      key: toNoticeKey(notice),
      source: notice.source,
      sourceId: notice.sourceId,
      title: notice.title,
      noticeType: inferPublicNoticeType(notice),
      region: notice.region,
      status: notice.status,
      targetTags: notice.targetTags,
      postedAt: notice.postedAt,
      applicationStartAt: notice.applicationStartAt,
      applicationEndAt: notice.applicationEndAt,
      sourceUrl: notice.sourceUrl,
      attachments: toPublicAttachments(notice),
      eligibilitySummary: toEligibilitySummary(notice),
      listings: repository.queryListingsByNotice(notice.source, notice.sourceId).map(toPublicListing),
    }))
    .sort((left, right) => {
      const leftDate = left.applicationStartAt ?? left.postedAt ?? '';
      const rightDate = right.applicationStartAt ?? right.postedAt ?? '';
      return rightDate.localeCompare(leftDate) || right.key.localeCompare(left.key);
    });

  return {
    schemaVersion: 1,
    generatedAt,
    sourceStatus: latestRunBySource(repository.listSourceRuns()),
    notices,
  };
};
```

- [ ] **Step 4: Run builder test**

Run:

```bash
npm test -- tests/public-feed.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/public-feed/build-public-feed.ts tests/public-feed.test.ts
git commit -m "공개 피드 빌더 추가"
```

## Task 4: Export CLI

**Files:**
- Create: `src/app/run-export-public-feed.ts`
- Modify: `package.json`
- Modify: `tests/public-feed.test.ts`

- [ ] **Step 1: Add failing script expectation**

Append to `tests/public-feed.test.ts`:

```ts
import { readFileSync } from 'node:fs';

describe('package public feed script', () => {
  it('exposes an export command', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['export:public-feed']).toBe('tsx src/app/run-export-public-feed.ts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/public-feed.test.ts
```

Expected: fail because `export:public-feed` is not in `package.json`.

- [ ] **Step 3: Add CLI entry point**

Create `src/app/run-export-public-feed.ts` with:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createRepository } from '../db/repository.js';
import { buildPublicFeed } from '../public-feed/build-public-feed.js';
import { PublicFeedSchema } from '../public-feed/schema.js';

const outputPath = resolve(process.env.PUBLIC_FEED_OUTPUT_PATH ?? 'public/public-feed.json');
const dbPath = process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db';

const repository = createRepository(dbPath);

try {
  const feed = PublicFeedSchema.parse(buildPublicFeed({ repository }));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
  console.log(`Public feed written to ${outputPath}`);
} finally {
  repository.close();
}
```

- [ ] **Step 4: Add npm script**

Modify `package.json` scripts to include:

```json
"export:public-feed": "tsx src/app/run-export-public-feed.ts"
```

Keep the existing scripts unchanged.

- [ ] **Step 5: Run tests and export once**

Run:

```bash
npm test -- tests/public-feed.test.ts
npm run export:public-feed
```

Expected:

- test passes
- command prints `Public feed written to`
- `public/public-feed.json` exists

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json src/app/run-export-public-feed.ts tests/public-feed.test.ts public/public-feed.json
git commit -m "공개 피드 내보내기 명령 추가"
```

## Task 5: Static Dashboard Shell

**Files:**
- Create: `web/public-dashboard/index.html`
- Create: `web/public-dashboard/styles.css`
- Create: `web/public-dashboard/app.js`
- Create: `tests/public-dashboard-static.test.js`

- [ ] **Step 1: Write failing static file tests**

Create `tests/public-dashboard-static.test.js` with:

```js
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('public dashboard static app', () => {
  it('contains the required static hooks', () => {
    const html = readFileSync('web/public-dashboard/index.html', 'utf8');

    expect(html).toContain('id="notice-list"');
    expect(html).toContain('id="notice-detail"');
    expect(html).toContain('id="search-input"');
    expect(html).toContain('app.js');
    expect(html).toContain('styles.css');
  });

  it('does not expose private dashboard endpoints', () => {
    const html = readFileSync('web/public-dashboard/index.html', 'utf8');
    const app = readFileSync('web/public-dashboard/app.js', 'utf8');

    expect(`${html}\n${app}`).not.toContain('/profile');
    expect(`${html}\n${app}`).not.toContain('personal_profile');
    expect(`${html}\n${app}`).not.toContain('telegram');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/public-dashboard-static.test.js
```

Expected: fail because static files do not exist.

- [ ] **Step 3: Add HTML shell**

Create `web/public-dashboard/index.html` with:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>임대주택 공고 대시보드</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="topbar">
      <div>
        <h1>임대주택 공고</h1>
        <p id="last-updated">업데이트 확인 중</p>
      </div>
      <div id="source-status" class="source-status"></div>
    </header>

    <main class="layout">
      <section class="pane list-pane" aria-label="공고 목록">
        <div class="filters">
          <input id="search-input" type="search" placeholder="지역, 유형, 키워드 검색" />
          <select id="source-filter" aria-label="기관">
            <option value="all">전체 기관</option>
          </select>
          <select id="type-filter" aria-label="공고 유형">
            <option value="all">전체 유형</option>
            <option value="rent">임대</option>
            <option value="sale">분양</option>
            <option value="newlywed">신혼</option>
            <option value="youth">청년</option>
            <option value="other">기타</option>
          </select>
        </div>
        <div id="result-count" class="result-count"></div>
        <div id="notice-list" class="notice-list"></div>
      </section>

      <section id="notice-detail" class="pane detail-pane" aria-label="공고 상세">
        <p class="empty">공고를 선택하세요.</p>
      </section>
    </main>

    <script src="./app.js" type="module"></script>
  </body>
</html>
```

- [ ] **Step 4: Add CSS**

Create `web/public-dashboard/styles.css` with:

```css
:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --panel: #ffffff;
  --text: #1f2933;
  --muted: #667085;
  --line: #d9dee7;
  --accent: #0f766e;
  --accent-soft: #e6f4f1;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Arial, "Noto Sans KR", sans-serif;
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

.topbar p {
  margin: 0;
  color: var(--muted);
}

.source-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  align-content: center;
}

.status-pill,
.tag {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--panel);
  font-size: 12px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(320px, 520px) minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
}

.pane {
  min-height: calc(100vh - 112px);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 120px;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

input,
select {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 10px;
  font: inherit;
}

.result-count {
  padding: 10px 12px;
  color: var(--muted);
  font-size: 13px;
}

.notice-list {
  display: grid;
}

.notice-item {
  display: grid;
  gap: 8px;
  width: 100%;
  border: 0;
  border-top: 1px solid var(--line);
  padding: 14px 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.notice-item:hover,
.notice-item.active {
  background: var(--accent-soft);
}

.notice-title {
  font-weight: 700;
  line-height: 1.35;
}

.notice-meta,
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.detail-pane {
  padding: 20px;
}

.detail-pane h2 {
  margin: 0 0 12px;
  font-size: 22px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 8px 16px;
  margin: 16px 0;
}

.detail-grid dt {
  color: var(--muted);
}

.detail-grid dd {
  margin: 0;
}

.listing-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

.listing-table th,
.listing-table td {
  border-top: 1px solid var(--line);
  padding: 8px;
  text-align: left;
}

.empty {
  color: var(--muted);
}

@media (max-width: 860px) {
  .topbar,
  .layout {
    display: block;
  }

  .source-status {
    justify-content: flex-start;
    margin-top: 12px;
  }

  .layout {
    padding: 8px;
  }

  .pane {
    min-height: auto;
    margin-bottom: 12px;
  }

  .filters {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Add minimal app loader**

Create `web/public-dashboard/app.js` with:

```js
const state = {
  feed: null,
  selectedKey: new URLSearchParams(window.location.search).get('notice'),
};

const formatDate = (value) => value || '미정';

const typeLabels = {
  rent: '임대',
  sale: '분양',
  newlywed: '신혼',
  youth: '청년',
  other: '기타',
};

const getFilters = () => ({
  q: document.querySelector('#search-input').value.trim().toLowerCase(),
  source: document.querySelector('#source-filter').value,
  type: document.querySelector('#type-filter').value,
});

const matchesFilters = (notice, filters) => {
  const text = [notice.title, notice.region, notice.status, ...notice.targetTags].filter(Boolean).join(' ').toLowerCase();
  return (
    (!filters.q || text.includes(filters.q)) &&
    (filters.source === 'all' || notice.source === filters.source) &&
    (filters.type === 'all' || notice.noticeType === filters.type)
  );
};

const syncUrl = () => {
  const filters = getFilters();
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.source !== 'all') params.set('source', filters.source);
  if (filters.type !== 'all') params.set('type', filters.type);
  if (state.selectedKey) params.set('notice', state.selectedKey);
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
};

const renderSourceStatus = () => {
  const container = document.querySelector('#source-status');
  container.innerHTML = state.feed.sourceStatus
    .map((source) => `<span class="status-pill">${source.source.toUpperCase()} ${source.status}</span>`)
    .join('');
};

const renderList = () => {
  const filters = getFilters();
  const notices = state.feed.notices.filter((notice) => matchesFilters(notice, filters));
  const list = document.querySelector('#notice-list');
  document.querySelector('#result-count').textContent = `${notices.length.toLocaleString('ko-KR')}개 공고`;

  list.innerHTML = notices
    .map(
      (notice) => `
        <button class="notice-item ${notice.key === state.selectedKey ? 'active' : ''}" data-key="${notice.key}">
          <span class="notice-title">${notice.title}</span>
          <span class="notice-meta">
            <span>${notice.source.toUpperCase()}</span>
            <span>${typeLabels[notice.noticeType]}</span>
            <span>${notice.region || '지역 미정'}</span>
            <span>${formatDate(notice.applicationStartAt)} - ${formatDate(notice.applicationEndAt)}</span>
          </span>
          <span class="tag-row">${notice.targetTags.slice(0, 4).map((tag) => `<span class="tag">${tag}</span>`).join('')}</span>
        </button>
      `,
    )
    .join('');

  for (const item of list.querySelectorAll('.notice-item')) {
    item.addEventListener('click', () => {
      state.selectedKey = item.dataset.key;
      syncUrl();
      renderList();
      renderDetail();
    });
  }
};

const renderDetail = () => {
  const detail = document.querySelector('#notice-detail');
  const notice = state.feed.notices.find((item) => item.key === state.selectedKey) ?? state.feed.notices[0];
  if (!notice) {
    detail.innerHTML = '<p class="empty">표시할 공고가 없습니다.</p>';
    return;
  }
  state.selectedKey = notice.key;

  detail.innerHTML = `
    <h2>${notice.title}</h2>
    <div class="tag-row">
      <span class="tag">${notice.source.toUpperCase()}</span>
      <span class="tag">${typeLabels[notice.noticeType]}</span>
      ${notice.targetTags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
    </div>
    <dl class="detail-grid">
      <dt>지역</dt><dd>${notice.region || '미정'}</dd>
      <dt>상태</dt><dd>${notice.status || '미정'}</dd>
      <dt>게시일</dt><dd>${formatDate(notice.postedAt)}</dd>
      <dt>신청 기간</dt><dd>${formatDate(notice.applicationStartAt)} - ${formatDate(notice.applicationEndAt)}</dd>
      <dt>원문</dt><dd>${notice.sourceUrl ? `<a href="${notice.sourceUrl}" target="_blank" rel="noreferrer">공고 원문 열기</a>` : '미정'}</dd>
    </dl>
    <h3>자격 요약</h3>
    <ul>${notice.eligibilitySummary.map((item) => `<li>${item}</li>`).join('') || '<li>요약 없음</li>'}</ul>
    <h3>첨부파일</h3>
    <ul>${notice.attachments.map((item) => `<li><a href="${item.url}" target="_blank" rel="noreferrer">${item.name}</a></li>`).join('') || '<li>첨부파일 없음</li>'}</ul>
    <h3>주택형</h3>
    <table class="listing-table">
      <thead><tr><th>이름</th><th>면적</th><th>보증금</th><th>월세</th><th>상태</th></tr></thead>
      <tbody>
        ${notice.listings
          .map(
            (listing) => `
              <tr>
                <td>${listing.title}</td>
                <td>${listing.areaSquareMeters ?? '미정'}</td>
                <td>${listing.deposit?.toLocaleString('ko-KR') ?? '미정'}</td>
                <td>${listing.monthlyRent?.toLocaleString('ko-KR') ?? '미정'}</td>
                <td>${listing.status || '미정'}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;
};

const restoreFiltersFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  document.querySelector('#search-input').value = params.get('q') ?? '';
  document.querySelector('#type-filter').value = params.get('type') ?? 'all';
};

const renderSourceOptions = () => {
  const sourceFilter = document.querySelector('#source-filter');
  const sources = [...new Set(state.feed.notices.map((notice) => notice.source))].sort();
  sourceFilter.innerHTML = '<option value="all">전체 기관</option>';
  for (const source of sources) {
    sourceFilter.insertAdjacentHTML('beforeend', `<option value="${source}">${source.toUpperCase()}</option>`);
  }
  sourceFilter.value = new URLSearchParams(window.location.search).get('source') ?? 'all';
};

const start = async () => {
  const response = await fetch('./public-feed.json');
  state.feed = await response.json();
  document.querySelector('#last-updated').textContent = `마지막 업데이트 ${new Date(state.feed.generatedAt).toLocaleString('ko-KR')}`;
  restoreFiltersFromUrl();
  renderSourceOptions();
  renderSourceStatus();
  renderList();
  renderDetail();

  for (const control of document.querySelectorAll('#search-input, #source-filter, #type-filter')) {
    control.addEventListener('input', () => {
      syncUrl();
      renderList();
    });
  }
};

start().catch((error) => {
  document.querySelector('#notice-list').innerHTML = `<p class="empty">공개 피드를 불러오지 못했습니다: ${error.message}</p>`;
});
```

- [ ] **Step 6: Run static tests**

Run:

```bash
npm test -- tests/public-dashboard-static.test.js
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add web/public-dashboard/index.html web/public-dashboard/styles.css web/public-dashboard/app.js tests/public-dashboard-static.test.js
git commit -m "정적 공개 대시보드 셸 추가"
```

## Task 6: Static Build and Vercel Config

**Files:**
- Create: `web/public-dashboard/build.mjs`
- Create: `vercel.json`
- Modify: `package.json`
- Modify: `tests/public-dashboard-static.test.js`

- [ ] **Step 1: Add failing build config test**

Append to `tests/public-dashboard-static.test.js`:

```js
describe('public dashboard build config', () => {
  it('defines build scripts and Vercel output', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const vercelJson = JSON.parse(readFileSync('vercel.json', 'utf8'));

    expect(packageJson.scripts['build:public-web']).toBe('node web/public-dashboard/build.mjs');
    expect(packageJson.scripts['build:public-dashboard']).toBe('npm run export:public-feed && npm run build:public-web');
    expect(vercelJson.outputDirectory).toBe('web/public-dashboard/dist');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/public-dashboard-static.test.js
```

Expected: fail because scripts and `vercel.json` do not exist.

- [ ] **Step 3: Add static build script**

Create `web/public-dashboard/build.mjs` with:

```js
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceDir = join(root, 'web', 'public-dashboard');
const distDir = join(sourceDir, 'dist');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(join(sourceDir, file), join(distDir, file));
}

await copyFile(join(root, 'public', 'public-feed.json'), join(distDir, 'public-feed.json'));

console.log(`Public dashboard built at ${distDir}`);
```

- [ ] **Step 4: Add Vercel config**

Create `vercel.json` with:

```json
{
  "buildCommand": "npm run build:public-dashboard",
  "outputDirectory": "web/public-dashboard/dist",
  "installCommand": "npm install"
}
```

- [ ] **Step 5: Add build scripts**

Modify `package.json` scripts to include:

```json
"build:public-web": "node web/public-dashboard/build.mjs",
"build:public-dashboard": "npm run export:public-feed && npm run build:public-web"
```

Keep existing scripts unchanged.

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test -- tests/public-dashboard-static.test.js
npm run build:public-dashboard
```

Expected:

- test passes
- command prints `Public dashboard built at`
- `web/public-dashboard/dist/index.html` exists
- `web/public-dashboard/dist/public-feed.json` exists

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json vercel.json web/public-dashboard/build.mjs tests/public-dashboard-static.test.js web/public-dashboard/dist
git commit -m "공개 대시보드 빌드 설정 추가"
```

## Task 7: Documentation and Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add README section**

Add this section to `README.md` after the quick check section:

````md
## 공개 웹 대시보드 MVP

공개 대시보드는 로컬 SQLite DB를 직접 노출하지 않고, 공개 가능한 필드만 담은 JSON feed를 만들어 정적 웹에서 읽습니다.

```bash
npm run export:public-feed
npm run build:public-web
```

전체 공개 대시보드 빌드:

```bash
npm run build:public-dashboard
```

기본 feed 경로는 `public/public-feed.json`입니다. 다른 위치에 쓰려면:

```bash
PUBLIC_FEED_OUTPUT_PATH=/path/to/public-feed.json npm run export:public-feed
```

Vercel 배포는 `vercel.json`의 `buildCommand`와 `outputDirectory`를 사용합니다.

자동 갱신 1차 운영 방식:

1. 기존 로컬 수집을 실행합니다.
2. `npm run export:public-feed`로 공개 feed를 갱신합니다.
3. 변경된 `public/public-feed.json`을 GitHub에 push합니다.
4. Vercel이 새 정적 대시보드를 배포합니다.

공개 feed에는 개인 조건, 텔레그램 설정, 알림 히스토리, 로컬 파일 경로를 넣지 않습니다.
````

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run build
npm test
npm run build:public-dashboard
```

Expected:

- TypeScript build passes.
- Vitest suite passes.
- Public dashboard build passes.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intended README and generated feed/build output changes are present.

- [ ] **Step 4: Commit**

Run:

```bash
git add README.md public/public-feed.json web/public-dashboard/dist
git commit -m "공개 대시보드 사용법 문서화"
```

## Manual QA

After Task 7, run:

```bash
cd web/public-dashboard/dist
python3 -m http.server 4174
```

Open:

```text
http://127.0.0.1:4174
```

Check:

- Notice list renders.
- Search filters the list.
- Source/type filters work.
- Selecting a notice updates detail.
- URL contains query params for current state.
- Detail has source link, attachment list, eligibility summary, and listing table.
- No profile form or writable endpoint appears.

## Self-Review Notes

- Spec coverage: local collection remains unchanged, public feed export exists, Vercel static dashboard exists, automatic update path is documented, Supabase remains future optional.
- Privacy coverage: feed builder test checks profile, Telegram, change hash, and local path are excluded.
- Type consistency: `floorAreaM2` maps to public `areaSquareMeters`; notice keys use `source:sourceId`; feed schema version is `1`.
