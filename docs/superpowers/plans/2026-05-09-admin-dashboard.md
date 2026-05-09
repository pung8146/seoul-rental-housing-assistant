# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local admin dashboard that shows actionable rental-housing notices, notice details, excluded notices, and collection status using the same data rules as the Telegram assistant.

**Architecture:** Add a small Node HTTP server that renders server-side HTML from repository data. Keep dashboard data assembly in a view-model module so Telegram, tests, and future user-facing UI can share the same actionable-notice boundary without coupling to HTML.

**Tech Stack:** TypeScript, Node built-in `http`, existing SQLite repository, Vitest, no new runtime dependencies.

---

## File Structure

- Create `src/app/dashboard-view.ts`: Builds dashboard view data from the repository. Owns actionable vs excluded notice lists, summary stats, selected notice details, and latest source runs.
- Create `src/app/dashboard-server.ts`: Starts a local HTTP server, parses query parameters, calls `buildDashboardView`, and renders HTML.
- Create `src/app/dashboard-render.ts`: Escapes text and renders dashboard HTML/CSS from the view model. Keep UI markup separate from repository access.
- Create `tests/dashboard-view.test.ts`: Unit tests for actionable/excluded notices, listing details, and source run ordering.
- Create `tests/dashboard-server.test.ts`: Integration tests for server HTML responses and selected notice URLs.
- Modify `src/domain/actionable.ts`: Add an exclusion reason helper so the dashboard can explain why a notice is hidden from the main list.
- Modify `src/domain/actionable.js`: Generated JavaScript equivalent because this repo commits built JS.
- Modify `src/app/run-query.ts`: Keep using `isActionableNotice`; no behavior change expected beyond import compatibility if the helper signature changes.
- Modify `package.json`: Add `dashboard` script.
- Modify generated `.js` siblings for each new/changed `.ts` file by running `npm run build`.

## Task 1: Explain Actionability

**Files:**
- Modify: `src/domain/actionable.ts`
- Modify: `src/domain/actionable.js`
- Test: `tests/query-flow.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these assertions to the existing `hides non-application announcements from list results` test in `tests/query-flow.test.ts`, after the current `expect(result.text).not.toContain(...)` assertions:

```ts
const { getNoticeExclusionReason } = await import('../src/domain/actionable.js');

expect(getNoticeExclusionReason({ title: '전산작업에 따른 서비스(신한인증서) 이용 안내' })).toBe(
  'service_notice',
);
expect(
  getNoticeExclusionReason({
    title: '2025년 전세형 매입임대주택 입주자 모집공고(2025.12.26.) 예비1차 당첨자 명단 및 계약안내',
  }),
).toBe('application_result');
expect(getNoticeExclusionReason({ title: '[서울지역본부] 집주인 임대주택 예비입주자 모집공고(건설개량형)' })).toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/query-flow.test.ts --run
```

Expected: FAIL because `getNoticeExclusionReason` is not exported.

- [ ] **Step 3: Implement the helper**

Replace `src/domain/actionable.ts` with:

```ts
import type { Notice } from '../types.js';

export type NoticeExclusionReason = 'not_recruitment' | 'service_notice' | 'application_result';

const normalizeTitle = (title: string): string => title.replace(/\s+/g, ' ').trim();

const ACTIONABLE_TITLE_PATTERNS = [/모집\s*공고/, /입주자\s*모집/, /예비입주자\s*모집/, /추가\s*모집/];

const SERVICE_NOTICE_PATTERNS = [/전산\s*작업/, /서비스.*안내/];

const APPLICATION_RESULT_PATTERNS = [
  /청약\s*접수\s*결과/,
  /최종\s*청약\s*접수\s*결과/,
  /접수\s*결과/,
  /당첨자/,
  /예비\s*당첨자/,
  /계약\s*안내/,
  /명단/,
];

export const getNoticeExclusionReason = (
  notice: Pick<Notice, 'title'>,
): NoticeExclusionReason | null => {
  const normalized = normalizeTitle(notice.title);
  if (!normalized) {
    return 'not_recruitment';
  }

  if (SERVICE_NOTICE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'service_notice';
  }

  if (APPLICATION_RESULT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'application_result';
  }

  if (!ACTIONABLE_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'not_recruitment';
  }

  return null;
};

export const isActionableNoticeTitle = (title: string): boolean =>
  getNoticeExclusionReason({ title }) === null;

export const isActionableNotice = (notice: Pick<Notice, 'title'>): boolean =>
  getNoticeExclusionReason(notice) === null;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/query-flow.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Build generated JS**

Run:

```bash
npm run build
```

Expected: PASS and `src/domain/actionable.js` updates.

- [ ] **Step 6: Commit**

```bash
git add src/domain/actionable.ts src/domain/actionable.js tests/query-flow.test.ts tests/query-flow.test.js
git commit -m "feat: explain notice actionability"
```

## Task 2: Dashboard View Model

**Files:**
- Create: `src/app/dashboard-view.ts`
- Create: `src/app/dashboard-view.js` after build
- Test: `tests/dashboard-view.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/dashboard-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildDashboardView } from '../src/app/dashboard-view.js';
import { createRepository } from '../src/db/repository.js';
import type { Listing, Notice } from '../src/types.js';

const makeNotice = (index: number, overrides: Partial<Notice> = {}): Notice => ({
  source: 'lh',
  sourceId: `notice-${index}`,
  title: `서울 청년 임대주택 ${index} 입주자 모집공고`,
  stableKey: `notice:${index}`,
  changeHash: `notice-hash-${index}`,
  status: '공고중',
  region: '서울',
  targetTags: ['청년'],
  postedAt: `2026-05-0${index}`,
  applicationStartAt: null,
  applicationEndAt: null,
  sourceUrl: `https://example.com/notices/${index}`,
  metadata: {},
  ...overrides,
});

const makeListing = (notice: Notice, index: number, overrides: Partial<Listing> = {}): Listing => ({
  source: notice.source,
  noticeSourceId: notice.sourceId,
  title: `${notice.title} ${index}호`,
  stableKey: `listing:${notice.sourceId}:${index}`,
  changeHash: `listing-hash:${notice.sourceId}:${index}`,
  supplyType: '행복주택',
  region: notice.region,
  targetTags: notice.targetTags,
  deposit: 10000000,
  monthlyRent: 250000,
  floorAreaM2: 29.5,
  status: '공급중',
  metadata: {},
  ...overrides,
});

describe('buildDashboardView', () => {
  it('separates actionable and excluded notices with selected details', () => {
    const repository = createRepository(':memory:');
    const actionable = makeNotice(1);
    const excluded = makeNotice(2, {
      title: '전산작업에 따른 서비스(신한인증서) 이용 안내',
      source: 'sh',
    });

    repository.upsertNotice(actionable);
    repository.upsertNotice(excluded);
    repository.upsertListing(makeListing(actionable, 1));
    repository.recordSourceRun({
      source: 'lh',
      startedAt: '2026-05-09T10:00:00.000Z',
      finishedAt: '2026-05-09T10:00:02.000Z',
      status: 'success',
      message: null,
    });

    const view = buildDashboardView({
      repository,
      selectedNoticeKey: 'lh:notice-1',
    });

    expect(view.stats.actionableCount).toBe(1);
    expect(view.stats.excludedCount).toBe(1);
    expect(view.actionableNotices[0]?.title).toBe(actionable.title);
    expect(view.excludedNotices[0]).toMatchObject({
      title: excluded.title,
      exclusionReason: 'service_notice',
    });
    expect(view.selectedNotice?.notice.title).toBe(actionable.title);
    expect(view.selectedNotice?.listings).toHaveLength(1);
    expect(view.sourceRuns[0]).toMatchObject({
      source: 'lh',
      status: 'success',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/dashboard-view.test.ts --run
```

Expected: FAIL because `src/app/dashboard-view.ts` does not exist.

- [ ] **Step 3: Implement the view model**

Create `src/app/dashboard-view.ts`:

```ts
import { getNoticeExclusionReason, type NoticeExclusionReason } from '../domain/actionable.js';
import type { Listing, Notice, SourceRun } from '../types.js';
import type { Repository } from '../db/repository.js';

export type DashboardNoticeSummary = Notice & {
  noticeKey: string;
};

export type ExcludedDashboardNotice = DashboardNoticeSummary & {
  exclusionReason: NoticeExclusionReason;
};

export type SelectedDashboardNotice = {
  notice: DashboardNoticeSummary;
  listings: Listing[];
};

export type DashboardView = {
  stats: {
    actionableCount: number;
    excludedCount: number;
    sourceRunCount: number;
  };
  actionableNotices: DashboardNoticeSummary[];
  excludedNotices: ExcludedDashboardNotice[];
  selectedNotice: SelectedDashboardNotice | null;
  sourceRuns: SourceRun[];
};

type BuildDashboardViewInput = {
  repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice' | 'listSourceRuns'>;
  selectedNoticeKey?: string | null;
};

const toNoticeKey = (notice: Pick<Notice, 'source' | 'sourceId'>): string =>
  `${notice.source}:${notice.sourceId}`;

const withNoticeKey = (notice: Notice): DashboardNoticeSummary => ({
  ...notice,
  noticeKey: toNoticeKey(notice),
});

const latestFirst = (runs: SourceRun[]): SourceRun[] =>
  [...runs].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));

export const buildDashboardView = ({
  repository,
  selectedNoticeKey,
}: BuildDashboardViewInput): DashboardView => {
  const notices = repository.queryNotices({});
  const actionableNotices: DashboardNoticeSummary[] = [];
  const excludedNotices: ExcludedDashboardNotice[] = [];

  for (const notice of notices) {
    const keyedNotice = withNoticeKey(notice);
    const exclusionReason = getNoticeExclusionReason(notice);
    if (exclusionReason) {
      excludedNotices.push({
        ...keyedNotice,
        exclusionReason,
      });
    } else {
      actionableNotices.push(keyedNotice);
    }
  }

  const selectedNotice =
    actionableNotices.find((notice) => notice.noticeKey === selectedNoticeKey) ?? actionableNotices[0] ?? null;

  return {
    stats: {
      actionableCount: actionableNotices.length,
      excludedCount: excludedNotices.length,
      sourceRunCount: repository.listSourceRuns().length,
    },
    actionableNotices,
    excludedNotices,
    selectedNotice: selectedNotice
      ? {
          notice: selectedNotice,
          listings: repository.queryListingsByNotice(selectedNotice.source, selectedNotice.sourceId),
        }
      : null,
    sourceRuns: latestFirst(repository.listSourceRuns()).slice(0, 10),
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/dashboard-view.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Build generated JS**

Run:

```bash
npm run build
```

Expected: PASS and `src/app/dashboard-view.js` is created.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard-view.ts src/app/dashboard-view.js tests/dashboard-view.test.ts tests/dashboard-view.test.js
git commit -m "feat: build dashboard view model"
```

## Task 3: Dashboard HTML Renderer

**Files:**
- Create: `src/app/dashboard-render.ts`
- Create: `src/app/dashboard-render.js` after build
- Test: `tests/dashboard-render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/dashboard-render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { renderDashboardHtml } from '../src/app/dashboard-render.js';
import type { DashboardView } from '../src/app/dashboard-view.js';

const view: DashboardView = {
  stats: {
    actionableCount: 1,
    excludedCount: 1,
    sourceRunCount: 1,
  },
  actionableNotices: [
    {
      source: 'lh',
      sourceId: 'notice-1',
      noticeKey: 'lh:notice-1',
      title: '서울 청년 임대주택 입주자 모집공고',
      stableKey: 'notice:1',
      changeHash: 'hash',
      status: '공고중',
      region: '서울',
      targetTags: ['청년'],
      postedAt: '2026-05-09',
      applicationStartAt: null,
      applicationEndAt: '2026-05-20',
      sourceUrl: 'https://example.com/notice',
      metadata: {},
    },
  ],
  excludedNotices: [
    {
      source: 'sh',
      sourceId: 'notice-2',
      noticeKey: 'sh:notice-2',
      title: '전산작업에 따른 서비스 이용 안내',
      stableKey: 'notice:2',
      changeHash: 'hash',
      status: 'posted',
      region: '서울',
      targetTags: [],
      postedAt: '2026-05-09',
      applicationStartAt: null,
      applicationEndAt: null,
      sourceUrl: 'https://example.com/excluded',
      metadata: {},
      exclusionReason: 'service_notice',
    },
  ],
  selectedNotice: {
    notice: {
      source: 'lh',
      sourceId: 'notice-1',
      noticeKey: 'lh:notice-1',
      title: '서울 청년 임대주택 입주자 모집공고',
      stableKey: 'notice:1',
      changeHash: 'hash',
      status: '공고중',
      region: '서울',
      targetTags: ['청년'],
      postedAt: '2026-05-09',
      applicationStartAt: null,
      applicationEndAt: '2026-05-20',
      sourceUrl: 'https://example.com/notice',
      metadata: { attachments: [{ title: '공고문.pdf', url: 'https://example.com/file.pdf' }] },
    },
    listings: [
      {
        source: 'lh',
        noticeSourceId: 'notice-1',
        title: '16형 대학생',
        stableKey: 'listing:1',
        changeHash: 'hash',
        supplyType: '행복주택',
        region: '서울',
        targetTags: ['청년'],
        deposit: 10000000,
        monthlyRent: 250000,
        floorAreaM2: 29.5,
        status: '공급중',
        metadata: {},
      },
    ],
  },
  sourceRuns: [
    {
      source: 'lh',
      startedAt: '2026-05-09T10:00:00.000Z',
      finishedAt: '2026-05-09T10:00:02.000Z',
      status: 'success',
      message: null,
    },
  ],
};

describe('renderDashboardHtml', () => {
  it('renders dashboard sections and escapes HTML', () => {
    const html = renderDashboardHtml({
      ...view,
      actionableNotices: [
        {
          ...view.actionableNotices[0],
          title: '<script>alert(1)</script> 입주자 모집공고',
        },
      ],
    });

    expect(html).toContain('관리 대시보드');
    expect(html).toContain('지원 가능 공고');
    expect(html).toContain('제외된 글');
    expect(html).toContain('수집 상태');
    expect(html).toContain('16형 대학생');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/dashboard-render.test.ts --run
```

Expected: FAIL because `renderDashboardHtml` does not exist.

- [ ] **Step 3: Implement renderer**

Create `src/app/dashboard-render.ts` with a complete server-rendered page. Use this exact structure, then refine only if tests require it:

```ts
import type { DashboardView, ExcludedDashboardNotice } from './dashboard-view.js';
import type { Listing, Notice, SourceRun } from '../types.js';

type Attachment = {
  title: string;
  url: string;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMoney = (value: number | null): string =>
  typeof value === 'number' ? `${value.toLocaleString('ko-KR')}원` : '미정';

const formatDate = (value: string | null): string => value ?? '-';

const reasonLabel = (notice: ExcludedDashboardNotice): string => {
  if (notice.exclusionReason === 'service_notice') {
    return '서비스 안내';
  }
  if (notice.exclusionReason === 'application_result') {
    return '결과/당첨 안내';
  }
  return '모집글 아님';
};

const getAttachments = (notice: Notice): Attachment[] => {
  const attachments = notice.metadata.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.filter(
    (attachment): attachment is Attachment =>
      typeof attachment === 'object' &&
      attachment !== null &&
      typeof (attachment as Attachment).title === 'string' &&
      typeof (attachment as Attachment).url === 'string',
  );
};

const renderNoticeRow = (notice: DashboardView['actionableNotices'][number], selectedKey?: string): string => `
  <a class="notice-row ${notice.noticeKey === selectedKey ? 'selected' : ''}" href="/?notice=${encodeURIComponent(
    notice.noticeKey,
  )}">
    <span class="notice-title">${escapeHtml(notice.title)}</span>
    <span class="notice-meta">${escapeHtml(notice.source.toUpperCase())} · ${escapeHtml(notice.region)} · ${escapeHtml(
      notice.status,
    )}</span>
  </a>
`;

const renderListing = (listing: Listing): string => `
  <tr>
    <td>${escapeHtml(listing.title)}</td>
    <td>${escapeHtml(listing.supplyType)}</td>
    <td>${escapeHtml(listing.floorAreaM2 ?? '-')}</td>
    <td>${formatMoney(listing.deposit)}</td>
    <td>${formatMoney(listing.monthlyRent)}</td>
    <td>${escapeHtml(listing.status)}</td>
  </tr>
`;

const renderSourceRun = (run: SourceRun): string => `
  <tr>
    <td>${escapeHtml(run.source.toUpperCase())}</td>
    <td>${escapeHtml(run.status)}</td>
    <td>${escapeHtml(run.finishedAt)}</td>
    <td>${escapeHtml(run.message ?? '-')}</td>
  </tr>
`;

export const renderDashboardHtml = (view: DashboardView): string => {
  const selectedKey = view.selectedNotice?.notice.noticeKey;
  const selectedNotice = view.selectedNotice?.notice;
  const attachments = selectedNotice ? getAttachments(selectedNotice) : [];

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>임대주택 관리 대시보드</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --line: #d9dee7;
      --text: #1b2430;
      --muted: #637083;
      --accent: #2563eb;
      --accent-soft: #eaf1ff;
      --warn-soft: #fff4df;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      padding: 18px 24px;
    }
    h1, h2, h3 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; }
    h3 { font-size: 14px; }
    main {
      display: grid;
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
      max-width: 1440px;
      margin: 0 auto;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .sidebar, .content { display: grid; gap: 16px; align-content: start; }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 16px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfe;
    }
    .stat strong { display: block; font-size: 24px; margin-bottom: 4px; }
    .stat span, .notice-meta, .muted { color: var(--muted); }
    .notice-list { display: grid; }
    .notice-row {
      display: grid;
      gap: 5px;
      padding: 12px 16px;
      color: inherit;
      text-decoration: none;
      border-bottom: 1px solid var(--line);
    }
    .notice-row:last-child { border-bottom: 0; }
    .notice-row:hover, .notice-row.selected { background: var(--accent-soft); }
    .notice-title { font-weight: 650; line-height: 1.35; }
    .detail { padding: 16px; display: grid; gap: 14px; }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .field {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      min-width: 0;
    }
    .field span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      border-bottom: 1px solid var(--line);
      padding: 9px 8px;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 650; }
    .excluded { padding: 0 16px 12px; display: grid; gap: 8px; }
    .excluded-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: var(--warn-soft);
    }
    .attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    .attachments a, .source-link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 650;
    }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      .detail-grid, .stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>임대주택 관리 대시보드</h1>
    <p class="muted">텔레그램과 같은 기준으로 지원 가능 공고를 보여줍니다.</p>
  </header>
  <main>
    <div class="sidebar">
      <section>
        <div class="section-header">
          <h2>지원 가능 공고</h2>
          <span class="muted">${view.stats.actionableCount}건</span>
        </div>
        <div class="notice-list">
          ${view.actionableNotices.map((notice) => renderNoticeRow(notice, selectedKey)).join('') || '<div class="detail muted">표시할 공고가 없습니다.</div>'}
        </div>
      </section>
      <section>
        <div class="section-header">
          <h2>제외된 글</h2>
          <span class="muted">${view.stats.excludedCount}건</span>
        </div>
        <div class="excluded">
          ${view.excludedNotices
            .slice(0, 10)
            .map(
              (notice) => `
                <div class="excluded-item">
                  <strong>${escapeHtml(reasonLabel(notice))}</strong>
                  <div>${escapeHtml(notice.title)}</div>
                </div>
              `,
            )
            .join('') || '<div class="muted">제외된 글이 없습니다.</div>'}
        </div>
      </section>
    </div>
    <div class="content">
      <section>
        <div class="stats">
          <div class="stat"><strong>${view.stats.actionableCount}</strong><span>지원 가능</span></div>
          <div class="stat"><strong>${view.stats.excludedCount}</strong><span>제외됨</span></div>
          <div class="stat"><strong>${view.stats.sourceRunCount}</strong><span>수집 기록</span></div>
        </div>
      </section>
      <section>
        <div class="section-header">
          <h2>공고 상세</h2>
          ${selectedNotice?.sourceUrl ? `<a class="source-link" href="${escapeHtml(selectedNotice.sourceUrl)}">원문 열기</a>` : ''}
        </div>
        ${
          selectedNotice
            ? `<div class="detail">
                <h3>${escapeHtml(selectedNotice.title)}</h3>
                <div class="detail-grid">
                  <div class="field"><span>기관</span>${escapeHtml(selectedNotice.source.toUpperCase())}</div>
                  <div class="field"><span>지역</span>${escapeHtml(selectedNotice.region)}</div>
                  <div class="field"><span>상태</span>${escapeHtml(selectedNotice.status)}</div>
                  <div class="field"><span>마감</span>${escapeHtml(formatDate(selectedNotice.applicationEndAt))}</div>
                </div>
                <div class="attachments">
                  ${attachments.map((attachment) => `<a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.title)}</a>`).join('')}
                </div>
                <table>
                  <thead>
                    <tr><th>매물</th><th>유형</th><th>면적</th><th>보증금</th><th>월세</th><th>상태</th></tr>
                  </thead>
                  <tbody>
                    ${view.selectedNotice?.listings.map(renderListing).join('') || '<tr><td colspan="6">매물 정보 없음</td></tr>'}
                  </tbody>
                </table>
              </div>`
            : '<div class="detail muted">선택된 공고가 없습니다.</div>'
        }
      </section>
      <section>
        <div class="section-header"><h2>수집 상태</h2></div>
        <div class="detail">
          <table>
            <thead><tr><th>기관</th><th>상태</th><th>완료 시각</th><th>메시지</th></tr></thead>
            <tbody>${view.sourceRuns.map(renderSourceRun).join('') || '<tr><td colspan="4">수집 기록 없음</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
</body>
</html>`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/dashboard-render.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Build generated JS**

Run:

```bash
npm run build
```

Expected: PASS and `src/app/dashboard-render.js` is created.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard-render.ts src/app/dashboard-render.js tests/dashboard-render.test.ts tests/dashboard-render.test.js
git commit -m "feat: render admin dashboard html"
```

## Task 4: Local Dashboard Server

**Files:**
- Create: `src/app/dashboard-server.ts`
- Create: `src/app/dashboard-server.js` after build
- Create: `tests/dashboard-server.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/dashboard-server.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createDashboardServer } from '../src/app/dashboard-server.js';
import { createRepository } from '../src/db/repository.js';
import type { Notice } from '../src/types.js';

const makeNotice = (index: number): Notice => ({
  source: 'lh',
  sourceId: `notice-${index}`,
  title: `서울 청년 임대주택 ${index} 입주자 모집공고`,
  stableKey: `notice:${index}`,
  changeHash: `notice-hash-${index}`,
  status: '공고중',
  region: '서울',
  targetTags: ['청년'],
  postedAt: `2026-05-0${index}`,
  applicationStartAt: null,
  applicationEndAt: null,
  sourceUrl: `https://example.com/notices/${index}`,
  metadata: {},
});

describe('createDashboardServer', () => {
  it('serves dashboard html', async () => {
    const repository = createRepository(':memory:');
    repository.upsertNotice(makeNotice(1));
    const server = createDashboardServer({ repository });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('missing server address');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('임대주택 관리 대시보드');
      expect(html).toContain('서울 청년 임대주택 1 입주자 모집공고');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/dashboard-server.test.ts --run
```

Expected: FAIL because `src/app/dashboard-server.ts` does not exist.

- [ ] **Step 3: Implement server**

Create `src/app/dashboard-server.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createRepository, type Repository } from '../db/repository.js';
import { buildDashboardView } from './dashboard-view.js';
import { renderDashboardHtml } from './dashboard-render.js';

type CreateDashboardServerInput = {
  repository: Repository;
};

const sendHtml = (response: ServerResponse, html: string): void => {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
};

const sendNotFound = (response: ServerResponse): void => {
  response.writeHead(404, {
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end('Not found');
};

const toUrl = (request: IncomingMessage): URL =>
  new URL(request.url ?? '/', 'http://127.0.0.1');

export const createDashboardServer = ({ repository }: CreateDashboardServerInput) =>
  createServer((request, response) => {
    const url = toUrl(request);
    if (url.pathname !== '/') {
      sendNotFound(response);
      return;
    }

    const view = buildDashboardView({
      repository,
      selectedNoticeKey: url.searchParams.get('notice'),
    });
    sendHtml(response, renderDashboardHtml(view));
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? '127.0.0.1';
  const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
  const server = createDashboardServer({ repository });

  server.listen(port, host, () => {
    console.log(`Dashboard running at http://${host}:${port}`);
  });

  const close = () => {
    server.close(() => {
      repository.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
```

- [ ] **Step 4: Add npm script**

Modify `package.json` scripts:

```json
"dashboard": "tsx src/app/dashboard-server.ts"
```

Keep existing scripts unchanged.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/dashboard-server.test.ts --run
```

Expected: PASS.

- [ ] **Step 6: Build generated JS**

Run:

```bash
npm run build
```

Expected: PASS and `src/app/dashboard-server.js` is created.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard-server.ts src/app/dashboard-server.js tests/dashboard-server.test.ts tests/dashboard-server.test.js package.json
git commit -m "feat: serve local admin dashboard"
```

## Task 5: End-to-End Verification

**Files:**
- Modify only if verification exposes a bug.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: TypeScript build passes.

- [ ] **Step 3: Start the dashboard against OpenClaw state DB**

Run:

```bash
RENTAL_HOUSING_DB_PATH=/home/pung8146/.openclaw/rental-housing-assistant/rental-housing.db npm run dashboard
```

Expected output:

```text
Dashboard running at http://127.0.0.1:4173
```

- [ ] **Step 4: Verify HTML with curl**

In another shell:

```bash
curl -s http://127.0.0.1:4173/ | grep -E '임대주택 관리 대시보드|지원 가능 공고|제외된 글|수집 상태'
```

Expected: all four Korean labels appear.

- [ ] **Step 5: Verify with browser screenshot**

Open `http://127.0.0.1:4173/` in the in-app browser. Confirm:

- Actionable notices are visible.
- Service/result notices appear only in the excluded section.
- The selected notice detail panel is visible.
- No text overlaps at desktop width.
- At mobile width, the page stacks into one column.

- [ ] **Step 6: Commit verification fixes if needed**

If any bug was fixed:

```bash
git add <changed-files>
git commit -m "fix: polish admin dashboard"
```

If no bug was fixed, do not create an empty commit.

## Self-Review

- Spec coverage: The plan implements actionable notices, detail view, excluded notices, collection status, and a local admin dashboard. It avoids login, public user accounts, and automatic application submission.
- Placeholder scan: The plan contains no placeholder markers; each implementation task includes concrete files, tests, commands, and expected outcomes.
- Type consistency: `DashboardView`, `DashboardNoticeSummary`, `ExcludedDashboardNotice`, and `SelectedDashboardNotice` are defined before renderer/server tasks use them.
