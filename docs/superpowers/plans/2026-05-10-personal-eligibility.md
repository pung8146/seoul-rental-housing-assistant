# Personal Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one local personal profile and show conservative eligibility labels for each actionable notice on the admin dashboard.

**Architecture:** Store a single profile row in SQLite, expose repository read/write helpers, evaluate notices with a small domain module, and render a local dashboard form plus eligibility badges. The first version avoids public accounts and avoids claiming exact legal eligibility when the notice requirements are not fully parsed.

**Tech Stack:** TypeScript, SQLite via `better-sqlite3`, Node built-in HTTP server, server-rendered HTML, Vitest.

---

## File Structure

- Modify `src/types.ts`: Add `PersonalProfileSchema`, `PersonalProfile`, and `EligibilityAssessment` types.
- Modify `src/db/schema.ts`: Add a `personal_profile` table with one row keyed by `id = 1`.
- Modify `src/db/repository.ts`: Add `getPersonalProfile()` and `savePersonalProfile(profile)`.
- Create `src/domain/eligibility.ts`: Conservative eligibility assessment from a profile and notice.
- Modify `src/app/dashboard-view.ts`: Include profile and notice eligibility assessments in `DashboardView`.
- Modify `src/app/dashboard-render.ts`: Render profile form and eligibility labels.
- Modify `src/app/dashboard-server.ts`: Handle `POST /profile` form submission and redirect back to `/`.
- Add tests:
  - `tests/profile-repository.test.ts`
  - `tests/eligibility.test.ts`
  - update `tests/dashboard-view.test.ts`
  - update `tests/dashboard-render.test.ts`
  - update `tests/dashboard-server.test.ts`
- Run `npm run build` after implementation to refresh committed `.js` files.

## Task 1: Store One Personal Profile

**Files:**
- Modify: `src/types.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/repository.ts`
- Test: `tests/profile-repository.test.ts`

- [ ] **Step 1: Write failing repository test**

Create `tests/profile-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createRepository } from '../src/db/repository.js';
import type { PersonalProfile } from '../src/types.js';

const profile: PersonalProfile = {
  birthYear: 1995,
  isHomeless: true,
  residenceRegion: '서울',
  householdSize: 1,
  monthlyIncome: 2500000,
  totalAssets: 50000000,
  vehicleValue: 0,
  interestTags: ['청년', '행복주택'],
};

describe('personal profile repository', () => {
  it('saves and loads the single local personal profile', () => {
    const repository = createRepository(':memory:');

    expect(repository.getPersonalProfile()).toBeNull();

    repository.savePersonalProfile(profile);

    expect(repository.getPersonalProfile()).toEqual(profile);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/profile-repository.test.ts --run
```

Expected: FAIL because `PersonalProfile` and repository methods do not exist.

- [ ] **Step 3: Add profile type**

Add to `src/types.ts`:

```ts
export const PersonalProfileSchema = z.object({
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  isHomeless: z.boolean().nullable(),
  residenceRegion: NullableString,
  householdSize: z.number().int().positive().nullable(),
  monthlyIncome: NullableNumber,
  totalAssets: NullableNumber,
  vehicleValue: NullableNumber,
  interestTags: z.array(z.string()),
});

export type PersonalProfile = z.infer<typeof PersonalProfileSchema>;
```

- [ ] **Step 4: Add SQLite table**

Add to `src/db/schema.ts` before indexes:

```sql
CREATE TABLE IF NOT EXISTS personal_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  birth_year INTEGER,
  is_homeless INTEGER,
  residence_region TEXT,
  household_size INTEGER,
  monthly_income REAL,
  total_assets REAL,
  vehicle_value REAL,
  interest_tags TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 5: Add repository methods**

In `src/db/repository.ts`, import `PersonalProfile` and add row mapping:

```ts
type PersonalProfileRow = {
  birth_year: number | null;
  is_homeless: number | null;
  residence_region: string | null;
  household_size: number | null;
  monthly_income: number | null;
  total_assets: number | null;
  vehicle_value: number | null;
  interest_tags: string;
};

const mapPersonalProfileRow = (row: PersonalProfileRow): PersonalProfile => ({
  birthYear: row.birth_year,
  isHomeless: row.is_homeless == null ? null : row.is_homeless === 1,
  residenceRegion: row.residence_region,
  householdSize: row.household_size,
  monthlyIncome: row.monthly_income,
  totalAssets: row.total_assets,
  vehicleValue: row.vehicle_value,
  interestTags: parseArray(row.interest_tags),
});
```

Add repository methods:

```ts
getPersonalProfile() {
  const row = database.prepare('SELECT * FROM personal_profile WHERE id = 1').get() as
    | PersonalProfileRow
    | undefined;
  return row ? mapPersonalProfileRow(row) : null;
},
savePersonalProfile(profile: PersonalProfile) {
  database
    .prepare(
      `INSERT INTO personal_profile (
        id, birth_year, is_homeless, residence_region, household_size,
        monthly_income, total_assets, vehicle_value, interest_tags
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        birth_year = excluded.birth_year,
        is_homeless = excluded.is_homeless,
        residence_region = excluded.residence_region,
        household_size = excluded.household_size,
        monthly_income = excluded.monthly_income,
        total_assets = excluded.total_assets,
        vehicle_value = excluded.vehicle_value,
        interest_tags = excluded.interest_tags,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .run(
      profile.birthYear,
      profile.isHomeless == null ? null : profile.isHomeless ? 1 : 0,
      profile.residenceRegion,
      profile.householdSize,
      profile.monthlyIncome,
      profile.totalAssets,
      profile.vehicleValue,
      serializeArray(profile.interestTags),
    );
},
```

- [ ] **Step 6: Run test and build**

Run:

```bash
npm test -- tests/profile-repository.test.ts --run
npm run build
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/types.js src/db/schema.ts src/db/schema.js src/db/repository.ts src/db/repository.js tests/profile-repository.test.ts tests/profile-repository.test.js
git commit -m "feat: store personal eligibility profile"
```

## Task 2: Conservative Eligibility Assessment

**Files:**
- Create: `src/domain/eligibility.ts`
- Test: `tests/eligibility.test.ts`

- [ ] **Step 1: Write failing domain test**

Create `tests/eligibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { assessEligibility } from '../src/domain/eligibility.js';
import type { Notice, PersonalProfile } from '../src/types.js';

const profile: PersonalProfile = {
  birthYear: 1995,
  isHomeless: true,
  residenceRegion: '서울',
  householdSize: 1,
  monthlyIncome: 2500000,
  totalAssets: 50000000,
  vehicleValue: 0,
  interestTags: ['청년', '행복주택'],
};

const makeNotice = (overrides: Partial<Notice> = {}): Notice => ({
  source: 'lh',
  sourceId: 'notice-1',
  title: '서울 청년 행복주택 입주자 모집공고',
  stableKey: 'notice:1',
  changeHash: 'hash',
  status: '공고중',
  region: '서울',
  targetTags: ['청년'],
  postedAt: '2026-05-09',
  applicationStartAt: '2026-05-10',
  applicationEndAt: '2026-05-20',
  sourceUrl: 'https://example.com',
  metadata: {},
  ...overrides,
});

describe('assessEligibility', () => {
  it('marks likely eligible notices when profile tags and region match', () => {
    expect(assessEligibility(profile, makeNotice())).toEqual({
      status: 'likely',
      label: '지원가능성 높음',
      reasons: ['관심 유형 일치', '지역 일치', '무주택 조건 입력됨'],
    });
  });

  it('marks notices as not target when tags clearly differ', () => {
    expect(assessEligibility(profile, makeNotice({ title: '고령자 국민임대 입주자 모집공고', targetTags: ['고령자'] }))).toMatchObject({
      status: 'not_target',
      label: '대상 아님',
    });
  });

  it('asks for review when parsed requirements are not enough', () => {
    expect(assessEligibility(profile, makeNotice({ title: '국민임대 입주자 모집공고', targetTags: [] }))).toMatchObject({
      status: 'review',
      label: '조건 확인 필요',
    });
  });

  it('asks for income asset review when financial inputs are missing', () => {
    expect(assessEligibility({ ...profile, monthlyIncome: null, totalAssets: null }, makeNotice())).toMatchObject({
      status: 'financial_review',
      label: '소득/자산 확인 필요',
    });
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/eligibility.test.ts --run
```

Expected: FAIL because `src/domain/eligibility.ts` does not exist.

- [ ] **Step 3: Implement conservative assessment**

Create `src/domain/eligibility.ts`:

```ts
import type { Notice, PersonalProfile } from '../types.js';

export type EligibilityStatus = 'likely' | 'review' | 'not_target' | 'financial_review' | 'missing_profile';

export type EligibilityAssessment = {
  status: EligibilityStatus;
  label: '지원가능성 높음' | '조건 확인 필요' | '대상 아님' | '소득/자산 확인 필요' | '프로필 필요';
  reasons: string[];
};

const TARGET_KEYWORDS = ['청년', '대학생', '신혼', '고령자', '일반'];

const noticeText = (notice: Notice): string => [notice.title, ...notice.targetTags].join(' ');

const hasTargetKeyword = (notice: Notice, keyword: string): boolean => noticeText(notice).includes(keyword);

const matchingInterestTags = (profile: PersonalProfile, notice: Notice): string[] =>
  profile.interestTags.filter((tag) => noticeText(notice).includes(tag));

const hasDifferentExplicitTarget = (profile: PersonalProfile, notice: Notice): boolean => {
  const text = noticeText(notice);
  const explicitTargets = TARGET_KEYWORDS.filter((keyword) => text.includes(keyword));
  if (explicitTargets.length === 0) {
    return false;
  }
  return !explicitTargets.some((target) => profile.interestTags.some((tag) => target.includes(tag) || tag.includes(target)));
};

export const assessEligibility = (
  profile: PersonalProfile | null,
  notice: Notice,
): EligibilityAssessment => {
  if (!profile) {
    return { status: 'missing_profile', label: '프로필 필요', reasons: ['내 정보가 아직 저장되지 않음'] };
  }

  if (hasDifferentExplicitTarget(profile, notice)) {
    return { status: 'not_target', label: '대상 아님', reasons: ['공고 대상 유형이 관심 유형과 다름'] };
  }

  if (profile.monthlyIncome == null || profile.totalAssets == null || profile.vehicleValue == null) {
    return { status: 'financial_review', label: '소득/자산 확인 필요', reasons: ['소득/자산/자동차가액 입력 필요'] };
  }

  const reasons: string[] = [];
  if (matchingInterestTags(profile, notice).length > 0) {
    reasons.push('관심 유형 일치');
  }
  if (profile.residenceRegion && notice.region === profile.residenceRegion) {
    reasons.push('지역 일치');
  }
  if (profile.isHomeless === true) {
    reasons.push('무주택 조건 입력됨');
  }

  if (reasons.length >= 2 && matchingInterestTags(profile, notice).length > 0) {
    return { status: 'likely', label: '지원가능성 높음', reasons };
  }

  return {
    status: 'review',
    label: '조건 확인 필요',
    reasons: reasons.length > 0 ? reasons : ['자동 판정에 필요한 공고 조건 부족'],
  };
};
```

- [ ] **Step 4: Run test and build**

Run:

```bash
npm test -- tests/eligibility.test.ts --run
npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/eligibility.ts src/domain/eligibility.js tests/eligibility.test.ts tests/eligibility.test.js
git commit -m "feat: assess notice eligibility"
```

## Task 3: Add Profile and Eligibility to Dashboard View

**Files:**
- Modify: `src/app/dashboard-view.ts`
- Modify: `tests/dashboard-view.test.ts`

- [ ] **Step 1: Write failing dashboard view test**

Extend `tests/dashboard-view.test.ts` by saving a profile before `buildDashboardView`:

```ts
repository.savePersonalProfile({
  birthYear: 1995,
  isHomeless: true,
  residenceRegion: '서울',
  householdSize: 1,
  monthlyIncome: 2500000,
  totalAssets: 50000000,
  vehicleValue: 0,
  interestTags: ['청년'],
});
```

Add assertions:

```ts
expect(view.profile?.birthYear).toBe(1995);
expect(view.actionableNotices[0]?.eligibility.label).toBe('지원가능성 높음');
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/dashboard-view.test.ts --run
```

Expected: FAIL because `DashboardView.profile` and notice eligibility do not exist.

- [ ] **Step 3: Implement view-model integration**

Modify `src/app/dashboard-view.ts`:

```ts
import { assessEligibility, type EligibilityAssessment } from '../domain/eligibility.js';
import type { Listing, Notice, PersonalProfile, SourceRun } from '../types.js';
```

Change `DashboardNoticeSummary`:

```ts
export type DashboardNoticeSummary = Notice & {
  noticeKey: string;
  eligibility: EligibilityAssessment;
};
```

Add `profile` to `DashboardView`:

```ts
profile: PersonalProfile | null;
```

Include `getPersonalProfile` in repository pick:

```ts
repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice' | 'listSourceRuns' | 'getPersonalProfile'>;
```

Build keyed notices with profile:

```ts
const withNoticeKey = (notice: Notice, profile: PersonalProfile | null): DashboardNoticeSummary => ({
  ...notice,
  noticeKey: toNoticeKey(notice),
  eligibility: assessEligibility(profile, notice),
});
```

Inside `buildDashboardView`:

```ts
const profile = repository.getPersonalProfile();
...
const keyedNotice = withNoticeKey(notice, profile);
...
profile,
```

- [ ] **Step 4: Run test and build**

Run:

```bash
npm test -- tests/dashboard-view.test.ts --run
npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard-view.ts src/app/dashboard-view.js tests/dashboard-view.test.ts tests/dashboard-view.test.js
git commit -m "feat: add eligibility to dashboard view"
```

## Task 4: Render Profile Form and Eligibility Badges

**Files:**
- Modify: `src/app/dashboard-render.ts`
- Modify: `tests/dashboard-render.test.ts`

- [ ] **Step 1: Write failing renderer test**

Update `tests/dashboard-render.test.ts` fixture notices to include:

```ts
eligibility: {
  status: 'likely',
  label: '지원가능성 높음',
  reasons: ['관심 유형 일치'],
},
```

Add `profile` to the fixture:

```ts
profile: {
  birthYear: 1995,
  isHomeless: true,
  residenceRegion: '서울',
  householdSize: 1,
  monthlyIncome: 2500000,
  totalAssets: 50000000,
  vehicleValue: 0,
  interestTags: ['청년'],
},
```

Add assertions:

```ts
expect(html).toContain('내 조건');
expect(html).toContain('name="birthYear"');
expect(html).toContain('value="1995"');
expect(html).toContain('지원가능성 높음');
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/dashboard-render.test.ts --run
```

Expected: FAIL because the renderer does not include profile form or eligibility badges.

- [ ] **Step 3: Implement renderer changes**

In `src/app/dashboard-render.ts`:

Add a helper:

```ts
const formatInputValue = (value: unknown): string => escapeHtml(value ?? '');
```

Add eligibility badge styling:

```css
.eligibility-badge { ... }
.eligibility-badge.likely { ... }
.eligibility-badge.review { ... }
.eligibility-badge.not_target { ... }
.eligibility-badge.financial_review { ... }
.eligibility-badge.missing_profile { ... }
.profile-form { display: grid; gap: 10px; padding: 16px; }
.profile-form label { display: grid; gap: 4px; color: var(--muted); }
.profile-form input { width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; }
```

In notice rows, render:

```ts
<span class="eligibility-badge ${notice.eligibility.status}">${escapeHtml(notice.eligibility.label)}</span>
```

In detail area, render eligibility reasons:

```ts
<div class="field"><span>지원 가능성</span><span class="eligibility-badge ${selectedNotice.eligibility.status}">${escapeHtml(selectedNotice.eligibility.label)}</span></div>
```

Add a new sidebar section:

```html
<section>
  <div class="section-header"><h2>내 조건</h2></div>
  <form class="profile-form" method="post" action="/profile">
    <label>출생연도 <input name="birthYear" inputmode="numeric" value="${formatInputValue(view.profile?.birthYear)}" /></label>
    <label>거주지역 <input name="residenceRegion" value="${formatInputValue(view.profile?.residenceRegion)}" /></label>
    <label>세대원 수 <input name="householdSize" inputmode="numeric" value="${formatInputValue(view.profile?.householdSize)}" /></label>
    <label>월소득 <input name="monthlyIncome" inputmode="numeric" value="${formatInputValue(view.profile?.monthlyIncome)}" /></label>
    <label>총자산 <input name="totalAssets" inputmode="numeric" value="${formatInputValue(view.profile?.totalAssets)}" /></label>
    <label>자동차가액 <input name="vehicleValue" inputmode="numeric" value="${formatInputValue(view.profile?.vehicleValue)}" /></label>
    <label>관심 유형 <input name="interestTags" value="${formatInputValue(view.profile?.interestTags.join(', '))}" /></label>
    <label><input type="checkbox" name="isHomeless" value="true" ${view.profile?.isHomeless ? 'checked' : ''} /> 무주택</label>
    <button type="submit">저장</button>
  </form>
</section>
```

- [ ] **Step 4: Run test and build**

Run:

```bash
npm test -- tests/dashboard-render.test.ts --run
npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard-render.ts src/app/dashboard-render.js tests/dashboard-render.test.ts tests/dashboard-render.test.js
git commit -m "feat: render profile eligibility controls"
```

## Task 5: Handle Profile Form Submission

**Files:**
- Modify: `src/app/dashboard-server.ts`
- Modify: `tests/dashboard-server.test.ts`

- [ ] **Step 1: Write failing server test**

Add a test to `tests/dashboard-server.test.ts`:

```ts
it('saves profile form submissions', async () => {
  const repository = createRepository(':memory:');
  repository.upsertNotice(makeNotice(1));
  const server = createDashboardServer({ repository });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        birthYear: '1995',
        isHomeless: 'true',
        residenceRegion: '서울',
        householdSize: '1',
        monthlyIncome: '2500000',
        totalAssets: '50000000',
        vehicleValue: '0',
        interestTags: '청년, 행복주택',
      }),
      redirect: 'manual',
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(repository.getPersonalProfile()).toMatchObject({
      birthYear: 1995,
      isHomeless: true,
      residenceRegion: '서울',
      interestTags: ['청년', '행복주택'],
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/dashboard-server.test.ts --run
```

Expected: FAIL because `POST /profile` returns 404.

- [ ] **Step 3: Implement form parsing**

In `src/app/dashboard-server.ts`, add:

```ts
import type { PersonalProfile } from '../types.js';
```

Add helpers:

```ts
const parseNullableNumber = (value: FormDataEntryValue | null): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullableText = (value: FormDataEntryValue | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseTags = (value: FormDataEntryValue | null): string[] =>
  typeof value === 'string'
    ? value.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];

const readBody = async (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

const parseProfileForm = (body: string): PersonalProfile => {
  const params = new URLSearchParams(body);
  return {
    birthYear: parseNullableNumber(params.get('birthYear')),
    isHomeless: params.get('isHomeless') === 'true',
    residenceRegion: parseNullableText(params.get('residenceRegion')),
    householdSize: parseNullableNumber(params.get('householdSize')),
    monthlyIncome: parseNullableNumber(params.get('monthlyIncome')),
    totalAssets: parseNullableNumber(params.get('totalAssets')),
    vehicleValue: parseNullableNumber(params.get('vehicleValue')),
    interestTags: parseTags(params.get('interestTags')),
  };
};

const redirectHome = (response: ServerResponse): void => {
  response.writeHead(303, { location: '/' });
  response.end();
};
```

Change server callback to async and handle:

```ts
if (request.method === 'POST' && url.pathname === '/profile') {
  const body = await readBody(request);
  repository.savePersonalProfile(parseProfileForm(body));
  redirectHome(response);
  return;
}
```

- [ ] **Step 4: Run test and build**

Run:

```bash
npm test -- tests/dashboard-server.test.ts --run
npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard-server.ts src/app/dashboard-server.js tests/dashboard-server.test.ts tests/dashboard-server.test.js
git commit -m "feat: save profile from dashboard"
```

## Task 6: Full Verification

**Files:**
- Modify only if verification exposes defects.

- [ ] **Step 1: Run all tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: TypeScript build passes.

- [ ] **Step 3: Start dashboard with the OpenClaw DB**

```bash
RENTAL_HOUSING_DB_PATH=/home/pung8146/.openclaw/rental-housing-assistant/rental-housing.db npm run dashboard
```

Expected: `Dashboard running at http://127.0.0.1:4173`.

- [ ] **Step 4: Browser verification**

Open `http://127.0.0.1:4173/` and confirm:

- `내 조건` form appears.
- Saving a sample profile persists after reload.
- Notices show eligibility labels.
- Date/status labels from prior work still render.
- Mobile layout remains one column without overlap.

- [ ] **Step 5: Commit fixes if needed**

If browser verification needs fixes:

```bash
git add <changed-files>
git commit -m "fix: polish personal eligibility dashboard"
```

If no fixes are needed, do not create an empty commit.

## Self-Review

- Spec coverage: The plan stores one local personal profile, renders it in the admin dashboard, and adds conservative eligibility labels without public accounts or automatic application submission.
- Placeholder scan: Every task has concrete file paths, test code, implementation snippets, commands, and expected outcomes.
- Type consistency: `PersonalProfile`, `EligibilityAssessment`, and repository method names are introduced before later tasks use them.
