import type { DashboardNoticeTypeFilter, DashboardView, ExcludedDashboardNotice } from './dashboard-view.js';
import { getPrimaryApplicationAttachment } from '../domain/attachments.js';
import type { Listing, Notice, PersonalProfile, SourceRun } from '../types.js';

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

const formatDday = (value: string | null): string => {
  if (!value) {
    return '확인필요';
  }

  const today = new Date(`${getKoreaToday()}T00:00:00+09:00`);
  const target = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(target.getTime())) {
    return '확인필요';
  }

  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  const diff = Math.ceil((target.getTime() - today.getTime()) / dayInMilliseconds);
  if (diff < 0) {
    return '마감됨';
  }
  if (diff === 0) {
    return 'D-day';
  }
  return `D-${diff}`;
};

const formatKoreaDateTime = (value: string | null): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';

  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const getCollectionFreshness = (value: string | null): { className: 'fresh' | 'stale' | 'unknown'; label: string } => {
  if (!value) {
    return { className: 'unknown', label: '기록 없음' };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { className: 'unknown', label: '확인필요' };
  }

  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  if (Date.now() - date.getTime() > dayInMilliseconds) {
    return { className: 'stale', label: '오래됨' };
  }

  return { className: 'fresh', label: '최신' };
};

const formatInputValue = (value: string | number | null): string => (value === null ? '' : String(value));

const getKoreaToday = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
};

const cleanRelativeAge = (title: string): string => title.replace(/\s*\d+일전/g, '').replace(/\s+/g, ' ').trim();

const NOTICE_TYPE_FILTERS: Array<{ value: DashboardNoticeTypeFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'sale', label: '분양' },
  { value: 'rent', label: '임대' },
  { value: 'newlywed', label: '신혼부부' },
  { value: 'youth', label: '청년' },
];

const NOTICE_TYPE_LABELS: Record<DashboardNoticeTypeFilter, string> = {
  all: '전체',
  sale: '분양',
  rent: '임대',
  newlywed: '신혼부부',
  youth: '청년',
};

const noticeTypeHref = (filter: DashboardNoticeTypeFilter): string =>
  filter === 'all' ? '/' : `/?type=${encodeURIComponent(filter)}`;

const noticeHref = (noticeKey: string, filter: DashboardNoticeTypeFilter): string => {
  const params = new URLSearchParams({ notice: noticeKey });
  if (filter !== 'all') {
    params.set('type', filter);
  }
  return `/?${params.toString()}`;
};

const inferNoticeTypeLabels = (notice: Pick<Notice, 'title' | 'targetTags'>): string[] => {
  const text = [notice.title, ...notice.targetTags].join(' ');
  const labels: string[] = [];
  if (/분양|공공분양|분양주택|사전청약/.test(text)) {
    labels.push('분양');
  } else if (/임대|행복주택|장기전세|전세임대|매입임대|국민임대|공공임대|도시형생활주택|두레주택/.test(text)) {
    labels.push('임대');
  }
  if (/신혼/.test(text)) {
    labels.push('신혼부부');
  }
  if (/청년|대학생/.test(text)) {
    labels.push('청년');
  }
  return labels.length > 0 ? labels : ['유형확인'];
};

const isSaleNotice = (notice: Pick<Notice, 'title' | 'targetTags'>): boolean =>
  inferNoticeTypeLabels(notice).includes('분양');

type ApplicationStatus = {
  className: 'available' | 'upcoming' | 'posted' | 'closed' | 'unknown';
  label: '신청가능' | '접수예정' | '공고중' | '마감' | '확인필요';
};

const getApplicationStatus = (
  notice: Pick<Notice, 'applicationStartAt' | 'applicationEndAt' | 'status'>,
): ApplicationStatus => {
  if (notice.status && /(마감|종료|접수완료)/.test(notice.status)) {
    return { className: 'closed', label: '마감' };
  }

  const today = getKoreaToday();

  if (notice.applicationEndAt && notice.applicationEndAt < today) {
    return { className: 'closed', label: '마감' };
  }

  if (notice.applicationStartAt && notice.applicationStartAt > today) {
    return { className: 'upcoming', label: '접수예정' };
  }

  if (
    notice.applicationStartAt &&
    notice.applicationStartAt <= today &&
    notice.applicationEndAt &&
    notice.applicationEndAt >= today
  ) {
    return { className: 'available', label: '신청가능' };
  }

  if (notice.status && /(공고중|정정공고중|게시|posted)/i.test(notice.status)) {
    return { className: 'posted', label: '공고중' };
  }

  return { className: 'unknown', label: '확인필요' };
};

const renderStatusBadge = (notice: Pick<Notice, 'applicationStartAt' | 'applicationEndAt' | 'status'>): string => {
  const status = getApplicationStatus(notice);
  return `<span class="status-badge ${status.className}">${status.label}</span>`;
};

const renderEligibilityBadge = (notice: Pick<DashboardView['actionableNotices'][number], 'eligibility'>): string =>
  `<span class="eligibility-badge ${notice.eligibility.status}">${escapeHtml(notice.eligibility.label)}</span>`;

const renderEligibilityReasons = (notice: Pick<DashboardView['actionableNotices'][number], 'eligibility'>): string =>
  notice.eligibility.reasons.length > 0
    ? `<div class="eligibility-reasons">${notice.eligibility.reasons.map(escapeHtml).join(' · ')}</div>`
    : '';

const renderTypeBadges = (notice: Pick<Notice, 'title' | 'targetTags'>): string =>
  inferNoticeTypeLabels(notice)
    .map((label) => `<span class="type-badge">${escapeHtml(label)}</span>`)
    .join('');

const renderNoticeTypeFilters = (view: DashboardView): string => `
  <nav class="type-filters" aria-label="공고 유형 필터">
    ${NOTICE_TYPE_FILTERS.map(
      (filter) => `
        <a class="${view.filters.noticeType === filter.value ? 'active' : ''}" href="${noticeTypeHref(filter.value)}">
          ${escapeHtml(filter.label)}
        </a>
      `,
    ).join('')}
  </nav>
`;

const renderProfileForm = (view: DashboardView): string => {
  const profile = view.profile;
  const interestTags = profile?.interestTags.join(', ') ?? '';
  const openAttribute = profile ? '' : ' open';
  const returnTo = view.selectedNotice
    ? noticeHref(view.selectedNotice.notice.noticeKey, view.filters.noticeType)
    : noticeTypeHref(view.filters.noticeType);

  return `
    <section>
      <details class="profile-panel"${openAttribute}>
        <summary class="profile-summary">
          <span>내 조건</span>
          <span class="summary-meta">
            <span class="muted">${profile ? '저장됨' : '미입력'}</span>
            <span class="summary-chevron" aria-hidden="true"></span>
          </span>
        </summary>
        <form class="profile-form" method="post" action="/profile">
          <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
          <label>
            <span>출생연도</span>
            <input name="birthYear" inputmode="numeric" value="${escapeHtml(formatInputValue(profile?.birthYear ?? null))}" />
          </label>
          <label>
            <span>거주지역</span>
            <input name="residenceRegion" value="${escapeHtml(formatInputValue(profile?.residenceRegion ?? null))}" placeholder="서울" />
          </label>
          <label>
            <span>가구원수</span>
            <input name="householdSize" inputmode="numeric" value="${escapeHtml(formatInputValue(profile?.householdSize ?? null))}" />
          </label>
          <label>
            <span>월소득</span>
            <input name="monthlyIncome" inputmode="numeric" value="${escapeHtml(formatInputValue(profile?.monthlyIncome ?? null))}" />
          </label>
          <label>
            <span>총자산</span>
            <input name="totalAssets" inputmode="numeric" value="${escapeHtml(formatInputValue(profile?.totalAssets ?? null))}" />
          </label>
          <label>
            <span>자동차가액</span>
            <input name="vehicleValue" inputmode="numeric" value="${escapeHtml(formatInputValue(profile?.vehicleValue ?? null))}" />
          </label>
          <label>
            <span>청약통장 가입기간(개월)</span>
            <input name="subscriptionAccountMonths" inputmode="numeric" value="${escapeHtml(formatInputValue(profile?.subscriptionAccountMonths ?? null))}" />
          </label>
          <label>
            <span>청약통장 납입횟수</span>
            <input name="subscriptionPaymentCount" inputmode="numeric" value="${escapeHtml(formatInputValue(profile?.subscriptionPaymentCount ?? null))}" />
          </label>
          <label>
            <span>관심유형</span>
            <input name="interestTags" value="${escapeHtml(interestTags)}" placeholder="청년, 행복주택" />
          </label>
          <label class="checkbox-field">
            <input type="checkbox" name="isHomeless" value="true" ${profile?.isHomeless ? 'checked' : ''} />
            <span>무주택</span>
          </label>
          <button type="submit">저장</button>
        </form>
      </details>
    </section>
  `;
};

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

const renderPrimaryApplicationAttachment = (notice: Notice): string => {
  const attachment = getPrimaryApplicationAttachment(notice.metadata);
  if (!attachment) {
    return '';
  }

  return `
    <div class="primary-attachment">
      <span>확인할 공고문</span>
      <a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.title)}</a>
    </div>
  `;
};

type DetailQualityStatus = 'ok' | 'review' | 'missing';

type DetailQualityItem = {
  label: string;
  status: DetailQualityStatus;
  value: string;
};

const hasEligibilityRequirements = (notice: Notice): boolean => {
  const requirements = notice.metadata.eligibilityRequirements;
  return Boolean(
    requirements &&
      typeof requirements === 'object' &&
      !Array.isArray(requirements) &&
      Object.keys(requirements).length > 0,
  );
};

const applicationPeriodQuality = (notice: Notice): DetailQualityItem => {
  if (notice.applicationStartAt && notice.applicationEndAt) {
    return { label: '신청기간', status: 'ok', value: '확인됨' };
  }
  if (notice.applicationStartAt || notice.applicationEndAt) {
    return { label: '신청기간', status: 'review', value: '일부 확인' };
  }
  return { label: '신청기간', status: 'missing', value: '확인필요' };
};

const applicationAttachmentQuality = (notice: Notice, attachments: Attachment[]): DetailQualityItem => {
  if (getPrimaryApplicationAttachment(notice.metadata)) {
    return { label: '공고문', status: 'ok', value: '확인됨' };
  }
  if (attachments.length > 0) {
    return { label: '공고문', status: 'review', value: '첨부 있음' };
  }
  return { label: '공고문', status: 'missing', value: '확인필요' };
};

const renderDetailQuality = (
  notice: Notice,
  listings: Listing[],
  attachments: Attachment[],
): string => {
  const items: DetailQualityItem[] = [
    applicationPeriodQuality(notice),
    applicationAttachmentQuality(notice, attachments),
    hasEligibilityRequirements(notice)
      ? { label: '신청조건', status: 'ok', value: '추출됨' }
      : { label: '신청조건', status: 'missing', value: '확인필요' },
    listings.length > 0
      ? { label: '매물정보', status: 'ok', value: `${listings.length}건` }
      : { label: '매물정보', status: 'missing', value: '확인필요' },
  ];

  return `
    <div class="detail-quality">
      ${items
        .map(
          (item) => `
            <div class="detail-quality-item ${item.status}">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
};

type PreparationStatus = 'ready' | 'review' | 'missing';

type PreparationItem = {
  label: string;
  status: PreparationStatus;
  value: string;
};

const preparationStatusLabel = (status: PreparationStatus): string => {
  if (status === 'ready') {
    return '준비됨';
  }
  if (status === 'review') {
    return '확인필요';
  }
  return '부족';
};

const renderPreparationChecklist = (
  notice: Notice,
  listings: Listing[],
  attachments: Attachment[],
): string => {
  const items: PreparationItem[] = [
    {
      label: '신청 링크',
      status: notice.sourceUrl ? 'ready' : 'missing',
      value: notice.sourceUrl ? '원문 연결됨' : '링크 없음',
    },
    {
      label: '신청기간',
      status: notice.applicationStartAt && notice.applicationEndAt ? 'ready' : 'review',
      value: notice.applicationStartAt && notice.applicationEndAt ? '확인됨' : '확인필요',
    },
    {
      label: '신청조건',
      status: hasEligibilityRequirements(notice) ? 'ready' : 'review',
      value: hasEligibilityRequirements(notice) ? '추출됨' : '확인필요',
    },
    {
      label: '공고문',
      status: getPrimaryApplicationAttachment(notice.metadata) ? 'ready' : attachments.length > 0 ? 'review' : 'missing',
      value: getPrimaryApplicationAttachment(notice.metadata) ? '대표 첨부 있음' : attachments.length > 0 ? '첨부 확인' : '첨부 없음',
    },
    {
      label: '매물정보',
      status: listings.length > 0 ? 'ready' : 'review',
      value: listings.length > 0 ? `${listings.length}건` : '확인필요',
    },
  ];

  return `
    <div class="preparation-checklist">
      ${items
        .map(
          (item) => `
            <div class="preparation-item ${item.status}">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
              <em>${escapeHtml(preparationStatusLabel(item.status))}</em>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
};

const renderSalePreparationChecklist = (
  notice: Pick<Notice, 'title' | 'targetTags'>,
  profile: PersonalProfile | null,
): string => {
  if (!isSaleNotice(notice)) {
    return '';
  }

  const hasNewlywedTarget = [notice.title, ...notice.targetTags].join(' ').includes('신혼');
  const items: PreparationItem[] = [
    {
      label: '청약통장 가입기간',
      status: profile?.subscriptionAccountMonths != null ? 'ready' : 'review',
      value: profile?.subscriptionAccountMonths != null ? `${profile.subscriptionAccountMonths}개월` : '입력 필요',
    },
    {
      label: '청약통장 납입횟수',
      status: profile?.subscriptionPaymentCount != null ? 'ready' : 'review',
      value: profile?.subscriptionPaymentCount != null ? `${profile.subscriptionPaymentCount}회` : '입력 필요',
    },
    {
      label: '무주택세대',
      status: profile?.isHomeless === true ? 'ready' : 'review',
      value: profile?.isHomeless === true ? '무주택 입력됨' : '세대구성원 기준 확인',
    },
    {
      label: '거주지역',
      status: profile?.residenceRegion ? 'ready' : 'review',
      value: profile?.residenceRegion ?? '해당지역/기타지역 확인',
    },
    {
      label: '특별공급',
      status: hasNewlywedTarget ? 'review' : 'missing',
      value: hasNewlywedTarget ? '신혼부부 조건 확인' : '대상 여부 확인',
    },
  ];

  return `
    <div class="sale-prep">
      <div class="sale-prep-header">
        <h3>분양 확인 항목</h3>
        <p>분양 공고는 청약 자격을 공고문 기준으로 최종 확인해야 합니다.</p>
      </div>
      <div class="preparation-checklist sale-checklist">
        ${items
          .map(
            (item) => `
              <div class="preparation-item ${item.status}">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
                <em>${escapeHtml(preparationStatusLabel(item.status))}</em>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
};

const renderApplicationPreparation = (
  notice: Notice,
  listings: Listing[],
  attachments: Attachment[],
  profile: PersonalProfile | null,
): string => {
  const primaryAttachment = getPrimaryApplicationAttachment(notice.metadata);

  return `
    <section class="application-prep">
      <div class="application-prep-header">
        <div>
          <h3>신청 준비</h3>
          <p>자동 신청 전에 직접 확인해야 할 항목입니다.</p>
        </div>
        <div class="dday">${escapeHtml(formatDday(notice.applicationEndAt))}</div>
      </div>
      <div class="application-prep-actions">
        ${notice.sourceUrl ? `<a class="source-link" href="${escapeHtml(notice.sourceUrl)}">신청 링크</a>` : '<span class="muted">신청 링크 없음</span>'}
        ${primaryAttachment ? `<a class="source-link" href="${escapeHtml(primaryAttachment.url)}">공고문 확인</a>` : '<span class="muted">대표 공고문 없음</span>'}
      </div>
      <div class="application-prep-status">
        <div><span>신청상태</span>${renderStatusBadge(notice)}</div>
        <div><span>마감</span><strong>${escapeHtml(formatDate(notice.applicationEndAt))}</strong></div>
      </div>
      <div>
        <h3>필요 확인 항목</h3>
        ${renderPreparationChecklist(notice, listings, attachments)}
      </div>
      ${renderSalePreparationChecklist(notice, profile)}
    </section>
  `;
};

const renderNoticeRow = (
  notice: DashboardView['actionableNotices'][number],
  selectedKey: string | undefined,
  filter: DashboardNoticeTypeFilter,
): string => `
  <a class="notice-row ${notice.noticeKey === selectedKey ? 'selected' : ''}" href="${escapeHtml(noticeHref(notice.noticeKey, filter))}">
    <span class="notice-title">${escapeHtml(cleanRelativeAge(notice.title))}</span>
    <span class="notice-meta">${escapeHtml(notice.source.toUpperCase())} · ${escapeHtml(notice.region)} · ${escapeHtml(
      notice.status,
    )} · 등록일 ${escapeHtml(formatDate(notice.postedAt))}</span>
    <span class="badge-row">${renderTypeBadges(notice)} ${renderStatusBadge(notice)} ${renderEligibilityBadge(notice)}</span>
    ${renderEligibilityReasons(notice)}
  </a>
`;

const NOTICE_GROUP_LABELS: Record<keyof DashboardView['noticeGroups'], string> = {
  high: '바로 볼 공고',
  review: '확인 필요한 공고',
  low: '낮은 우선순위',
};

const renderNoticeGroup = (
  key: keyof DashboardView['noticeGroups'],
  notices: DashboardView['noticeGroups'][keyof DashboardView['noticeGroups']],
  selectedKey?: string,
  filter: DashboardNoticeTypeFilter = 'all',
): string => {
  if (notices.length === 0) {
    return '';
  }

  return `
    <div class="notice-group ${key}">
      <div class="notice-group-header">
        <strong>${NOTICE_GROUP_LABELS[key]}</strong>
        <span>${notices.length}건</span>
      </div>
      <div class="notice-list">
        ${notices.map((notice) => renderNoticeRow(notice, selectedKey, filter)).join('')}
      </div>
    </div>
  `;
};

const renderListing = (listing: Listing): string => `
  <tr>
    <td>${escapeHtml(cleanRelativeAge(listing.title))}</td>
    <td>${escapeHtml(listing.supplyType)}</td>
    <td>${escapeHtml(listing.floorAreaM2 ?? '-')}</td>
    <td>${formatMoney(listing.deposit)}</td>
    <td>${formatMoney(listing.monthlyRent)}</td>
    <td>${escapeHtml(listing.status)}</td>
  </tr>
`;

const sourceRunStatusLabel = (status: SourceRun['status']): string => {
  if (status === 'success') {
    return '성공';
  }
  if (status === 'partial') {
    return '일부 실패';
  }
  return '실패';
};

const renderSourceRun = (run: SourceRun): string => `
  <tr>
    <td>${escapeHtml(run.source.toUpperCase())}</td>
    <td><span class="collect-badge ${escapeHtml(run.status)}">${escapeHtml(sourceRunStatusLabel(run.status))}</span></td>
    <td>${escapeHtml(formatKoreaDateTime(run.finishedAt))}</td>
    <td>${escapeHtml(run.message ?? '-')}</td>
  </tr>
`;

const renderSourceStatusBadge = (status: DashboardView['sourceStatuses'][number]): string =>
  `<span class="collect-badge ${status.runStatus}">${escapeHtml(status.statusLabel)}</span>`;

const renderSourceStatus = (status: DashboardView['sourceStatuses'][number]): string => `
  <article class="source-status ${escapeHtml(status.runStatus)}">
    <div class="source-status-main">
      <strong>${escapeHtml(status.source.toUpperCase())}</strong>
      ${renderSourceStatusBadge(status)}
    </div>
    <div class="source-status-time">${escapeHtml(
      status.lastFinishedAt ? formatKoreaDateTime(status.lastFinishedAt) : '수집 기록 없음',
    )}</div>
    <div class="source-metrics">
      <span>전체 ${status.totalNotices}건</span>
      <span>지원 후보 ${status.actionableNotices}건</span>
      <span>제외 ${status.excludedNotices}건</span>
      <span>상세매물 ${status.detailListings}건</span>
      <span>조건 ${status.parsedConditionNotices}건</span>
      <span>첨부 ${status.attachmentNotices}건</span>
    </div>
    ${status.message ? `<div class="source-message">${escapeHtml(status.message)}</div>` : ''}
  </article>
`;

const renderSourceIssueSummary = (view: DashboardView): string => {
  const issueStatuses = view.sourceStatuses.filter((status) => status.runStatus !== 'success');
  if (issueStatuses.length === 0) {
    return '';
  }

  const summary = issueStatuses
    .map((status) => `${status.source.toUpperCase()} ${status.statusLabel}`)
    .join(' · ');

  return `<div class="source-issue-summary">수집 확인 필요: ${escapeHtml(summary)}</div>`;
};

export const renderDashboardHtml = (view: DashboardView): string => {
  const selectedKey = view.selectedNotice?.notice.noticeKey;
  const selectedNotice = view.selectedNotice?.notice;
  const attachments = selectedNotice ? getAttachments(selectedNotice) : [];
  const collectionFreshness = getCollectionFreshness(view.stats.lastCollectedAt);

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
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
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
    .stat.timestamp strong { font-size: 16px; line-height: 1.25; }
    .stat span, .notice-meta, .muted { color: var(--muted); }
    .collection-freshness {
      display: inline-flex;
      width: fit-content;
      margin-top: 6px;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 800;
    }
    .collection-freshness.fresh {
      color: #166534;
      background: #dcfce7;
      border: 1px solid #86efac;
    }
    .collection-freshness.stale {
      color: #991b1b;
      background: #fee2e2;
      border: 1px solid #fecaca;
    }
    .collection-freshness.unknown {
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
    }
    .source-issue-summary {
      margin: 0 16px 16px;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 9px 10px;
      color: #854d0e;
      background: #fffbeb;
      font-size: 13px;
      font-weight: 650;
    }
    .status-badge {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
    }
    .status-badge.available {
      color: #166534;
      background: #dcfce7;
      border: 1px solid #86efac;
    }
    .status-badge.upcoming {
      color: #854d0e;
      background: #fef9c3;
      border: 1px solid #fde047;
    }
    .status-badge.posted {
      color: #1e40af;
      background: #dbeafe;
      border: 1px solid #93c5fd;
    }
    .status-badge.closed {
      color: #991b1b;
      background: #fee2e2;
      border: 1px solid #fecaca;
    }
    .status-badge.unknown {
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
    }
    .badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .type-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfe;
    }
    .type-filters a {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 10px;
      color: var(--muted);
      background: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 750;
    }
    .type-filters a.active {
      color: #1e40af;
      background: #dbeafe;
      border-color: #93c5fd;
    }
    .type-badge {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 2px 8px;
      color: #0f766e;
      background: #ccfbf1;
      border: 1px solid #5eead4;
      font-size: 12px;
      font-weight: 800;
    }
    .eligibility-badge {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
    }
    .eligibility-badge.likely {
      color: #166534;
      background: #dcfce7;
      border-color: #86efac;
    }
    .eligibility-badge.review, .eligibility-badge.financial_review {
      color: #854d0e;
      background: #fef9c3;
      border-color: #fde047;
    }
    .eligibility-badge.not_target {
      color: #991b1b;
      background: #fee2e2;
      border-color: #fecaca;
    }
    .eligibility-reasons {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .profile-panel { display: grid; }
    .profile-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 49px;
      padding: 14px 16px;
      border-bottom: 1px solid transparent;
      cursor: pointer;
      font-size: 16px;
      font-weight: 700;
      list-style: none;
      user-select: none;
    }
    .profile-summary::-webkit-details-marker { display: none; }
    .profile-summary:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
    .profile-panel[open] .profile-summary { border-bottom-color: var(--line); }
    .summary-meta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
    }
    .summary-chevron {
      width: 9px;
      height: 9px;
      border-right: 2px solid var(--muted);
      border-bottom: 2px solid var(--muted);
      transform: rotate(45deg);
      transition: transform 140ms ease;
    }
    .profile-panel[open] .summary-chevron { transform: rotate(225deg); }
    .profile-form {
      display: grid;
      gap: 10px;
      padding: 14px 16px 16px;
    }
    .profile-form label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    .profile-form input {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 7px 9px;
      color: var(--text);
      background: #ffffff;
      font: inherit;
    }
    .profile-form .checkbox-field {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-size: 13px;
    }
    .profile-form .checkbox-field input {
      width: 16px;
      min-height: 16px;
    }
    .profile-form button {
      min-height: 36px;
      border: 1px solid #1d4ed8;
      border-radius: 6px;
      background: var(--accent);
      color: #ffffff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .profile-form button:hover { background: #1d4ed8; }
    .notice-list { display: grid; }
    .notice-groups { display: grid; }
    .notice-group {
      display: grid;
      border-bottom: 1px solid var(--line);
    }
    .notice-group:last-child { border-bottom: 0; }
    .notice-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 16px;
      background: #fbfcfe;
      color: var(--muted);
      font-size: 12px;
    }
    .notice-group-header strong {
      color: var(--text);
      font-size: 13px;
    }
    .notice-group.high .notice-group-header {
      background: #f0fdf4;
    }
    .notice-group.review .notice-group-header {
      background: #fffbeb;
    }
    .notice-group.low .notice-group-header {
      background: #fff1f2;
    }
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
    .detail-quality {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .detail-quality-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fbfcfe;
    }
    .detail-quality-item span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .detail-quality-item strong {
      font-size: 13px;
    }
    .detail-quality-item.ok {
      border-color: #bbf7d0;
      background: #f0fdf4;
    }
    .detail-quality-item.review {
      border-color: #fde68a;
      background: #fffbeb;
    }
    .detail-quality-item.missing {
      border-color: #fecaca;
      background: #fff1f2;
    }
    .application-prep {
      display: grid;
      gap: 12px;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 12px;
      background: #f8fbff;
    }
    .application-prep-header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }
    .application-prep-header p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .dday {
      border: 1px solid #93c5fd;
      border-radius: 999px;
      padding: 4px 10px;
      color: #1e40af;
      background: #dbeafe;
      font-weight: 800;
      white-space: nowrap;
    }
    .application-prep-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .application-prep-status {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .application-prep-status > div {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #ffffff;
    }
    .application-prep-status span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 5px;
    }
    .preparation-checklist {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .sale-prep {
      display: grid;
      gap: 8px;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      padding: 10px;
      background: #fff7ed;
    }
    .sale-prep-header p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .sale-checklist {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 0;
    }
    .preparation-item {
      display: grid;
      gap: 4px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px;
      background: #ffffff;
      min-width: 0;
    }
    .preparation-item span {
      color: var(--muted);
      font-size: 12px;
    }
    .preparation-item strong {
      font-size: 13px;
    }
    .preparation-item em {
      width: fit-content;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 11px;
      font-style: normal;
      font-weight: 800;
    }
    .preparation-item.ready {
      border-color: #bbf7d0;
      background: #f0fdf4;
    }
    .preparation-item.ready em {
      color: #166534;
      background: #dcfce7;
    }
    .preparation-item.review {
      border-color: #fde68a;
      background: #fffbeb;
    }
    .preparation-item.review em {
      color: #854d0e;
      background: #fef9c3;
    }
    .preparation-item.missing {
      border-color: #fecaca;
      background: #fff1f2;
    }
    .preparation-item.missing em {
      color: #991b1b;
      background: #fee2e2;
    }
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
    .table-wrap { overflow-x: auto; }
    .excluded { padding: 0 16px 12px; display: grid; gap: 8px; }
    .excluded-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: var(--warn-soft);
    }
    .attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    .attachments a, .source-link, .primary-attachment a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 650;
    }
    .primary-attachment {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 10px;
      background: #eff6ff;
    }
    .primary-attachment span {
      color: #1e40af;
      font-size: 12px;
      font-weight: 800;
    }
    .source-status-list {
      display: grid;
      gap: 10px;
      padding: 16px;
    }
    .source-status {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfe;
    }
    .source-status.success {
      border-color: #bbf7d0;
      background: #f0fdf4;
    }
    .source-status.partial {
      border-color: #fde68a;
      background: #fffbeb;
    }
    .source-status.failure {
      border-color: #fecaca;
      background: #fff1f2;
    }
    .source-status-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .collect-badge {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
    }
    .collect-badge.success {
      color: #166534;
      background: #dcfce7;
      border-color: #86efac;
    }
    .collect-badge.partial {
      color: #854d0e;
      background: #fef9c3;
      border-color: #fde047;
    }
    .collect-badge.failure {
      color: #991b1b;
      background: #fee2e2;
      border-color: #fecaca;
    }
    .source-status-time, .source-message {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .source-message {
      color: #991b1b;
    }
    .source-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .source-metrics span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--muted);
      background: #ffffff;
      font-size: 12px;
      font-weight: 650;
    }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      .application-prep-status, .detail-grid, .detail-quality, .preparation-checklist, .stats { grid-template-columns: 1fr; }
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
      ${renderProfileForm(view)}
      <section>
        <div class="section-header">
          <h2>지원 가능 공고</h2>
          <span class="muted">${escapeHtml(NOTICE_TYPE_LABELS[view.filters.noticeType])} ${view.actionableNotices.length}건</span>
        </div>
        ${renderNoticeTypeFilters(view)}
        <div class="notice-groups">
          ${
            (['high', 'review', 'low'] as const)
              .map((key) => renderNoticeGroup(key, view.noticeGroups[key], selectedKey, view.filters.noticeType))
              .join('') || `<div class="detail muted">${escapeHtml(NOTICE_TYPE_LABELS[view.filters.noticeType])} 조건에 맞는 공고가 없습니다.</div>`
          }
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
                  <div>${escapeHtml(cleanRelativeAge(notice.title))}</div>
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
          <div class="stat"><strong>${view.stats.sourceIssueCount}</strong><span>수집 주의</span></div>
          <div class="stat timestamp"><strong>${escapeHtml(formatKoreaDateTime(view.stats.lastCollectedAt))}</strong><span>마지막 수집</span><span class="collection-freshness ${collectionFreshness.className}">${collectionFreshness.label}</span></div>
          <div class="stat timestamp"><strong>${escapeHtml(formatKoreaDateTime(view.notificationStatus.lastSentAt))}</strong><span>마지막 알림</span></div>
          <div class="stat"><strong>${view.notificationStatus.totalSent}</strong><span>알림 발송</span></div>
          <div class="stat"><strong>${view.notificationStatus.channelCount}</strong><span>알림 채널</span></div>
        </div>
        ${renderSourceIssueSummary(view)}
      </section>
      <section>
        <div class="section-header">
          <h2>공고 상세</h2>
          ${selectedNotice?.sourceUrl ? `<a class="source-link" href="${escapeHtml(selectedNotice.sourceUrl)}">원문 열기</a>` : ''}
        </div>
        ${
          selectedNotice
            ? `<div class="detail">
                <h3>${escapeHtml(cleanRelativeAge(selectedNotice.title))}</h3>
                <div class="detail-grid">
                  <div class="field"><span>기관</span>${escapeHtml(selectedNotice.source.toUpperCase())}</div>
                  <div class="field"><span>지역</span>${escapeHtml(selectedNotice.region)}</div>
                  <div class="field"><span>상태</span>${renderStatusBadge(selectedNotice)} ${escapeHtml(selectedNotice.status)}</div>
                  <div class="field"><span>유형</span><span class="badge-row">${renderTypeBadges(selectedNotice)}</span></div>
                  <div class="field"><span>등록일</span>${escapeHtml(formatDate(selectedNotice.postedAt))}</div>
                  <div class="field"><span>마감</span>${escapeHtml(formatDate(selectedNotice.applicationEndAt))}</div>
                  <div class="field"><span>지원가능성</span>${renderEligibilityBadge(selectedNotice)}${renderEligibilityReasons(selectedNotice)}</div>
                </div>
                ${renderDetailQuality(selectedNotice, view.selectedNotice?.listings ?? [], attachments)}
                ${renderApplicationPreparation(selectedNotice, view.selectedNotice?.listings ?? [], attachments, view.profile)}
                <div class="attachments">
                  ${attachments.map((attachment) => `<a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.title)}</a>`).join('')}
                </div>
                ${renderPrimaryApplicationAttachment(selectedNotice)}
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr><th>매물</th><th>유형</th><th>면적</th><th>보증금</th><th>월세</th><th>상태</th></tr>
                    </thead>
                    <tbody>
                      ${view.selectedNotice?.listings.map(renderListing).join('') || '<tr><td colspan="6">매물 정보 없음</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>`
            : '<div class="detail muted">선택된 공고가 없습니다.</div>'
        }
      </section>
      <section>
        <div class="section-header"><h2>기관별 수집 상태</h2></div>
        <div class="source-status-list">
          ${view.sourceStatuses.map(renderSourceStatus).join('') || '<div class="muted">수집 상태가 없습니다.</div>'}
        </div>
      </section>
      <section>
        <div class="section-header"><h2>수집 이력</h2></div>
        <div class="detail table-wrap">
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
