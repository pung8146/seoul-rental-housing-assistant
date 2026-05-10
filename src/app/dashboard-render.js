const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const formatMoney = (value) => typeof value === 'number' ? `${value.toLocaleString('ko-KR')}원` : '미정';
const formatDate = (value) => value ?? '-';
const formatInputValue = (value) => (value === null ? '' : String(value));
const getKoreaToday = () => {
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
const cleanRelativeAge = (title) => title.replace(/\s*\d+일전/g, '').replace(/\s+/g, ' ').trim();
const getApplicationStatus = (notice) => {
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
    if (notice.applicationStartAt &&
        notice.applicationStartAt <= today &&
        notice.applicationEndAt &&
        notice.applicationEndAt >= today) {
        return { className: 'available', label: '신청가능' };
    }
    if (notice.status && /(공고중|정정공고중|게시|posted)/i.test(notice.status)) {
        return { className: 'posted', label: '공고중' };
    }
    return { className: 'unknown', label: '확인필요' };
};
const renderStatusBadge = (notice) => {
    const status = getApplicationStatus(notice);
    return `<span class="status-badge ${status.className}">${status.label}</span>`;
};
const renderEligibilityBadge = (notice) => `<span class="eligibility-badge ${notice.eligibility.status}">${escapeHtml(notice.eligibility.label)}</span>`;
const renderEligibilityReasons = (notice) => notice.eligibility.reasons.length > 0
    ? `<div class="eligibility-reasons">${notice.eligibility.reasons.map(escapeHtml).join(' · ')}</div>`
    : '';
const renderProfileForm = (view) => {
    const profile = view.profile;
    const interestTags = profile?.interestTags.join(', ') ?? '';
    return `
    <section>
      <div class="section-header">
        <h2>내 조건</h2>
        <span class="muted">${profile ? '저장됨' : '미입력'}</span>
      </div>
      <form class="profile-form" method="post" action="/profile">
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
          <span>관심유형</span>
          <input name="interestTags" value="${escapeHtml(interestTags)}" placeholder="청년, 행복주택" />
        </label>
        <label class="checkbox-field">
          <input type="checkbox" name="isHomeless" value="true" ${profile?.isHomeless ? 'checked' : ''} />
          <span>무주택</span>
        </label>
        <button type="submit">저장</button>
      </form>
    </section>
  `;
};
const reasonLabel = (notice) => {
    if (notice.exclusionReason === 'service_notice') {
        return '서비스 안내';
    }
    if (notice.exclusionReason === 'application_result') {
        return '결과/당첨 안내';
    }
    return '모집글 아님';
};
const getAttachments = (notice) => {
    const attachments = notice.metadata.attachments;
    if (!Array.isArray(attachments)) {
        return [];
    }
    return attachments.filter((attachment) => typeof attachment === 'object' &&
        attachment !== null &&
        typeof attachment.title === 'string' &&
        typeof attachment.url === 'string');
};
const renderNoticeRow = (notice, selectedKey) => `
  <a class="notice-row ${notice.noticeKey === selectedKey ? 'selected' : ''}" href="/?notice=${encodeURIComponent(notice.noticeKey)}">
    <span class="notice-title">${escapeHtml(cleanRelativeAge(notice.title))}</span>
    <span class="notice-meta">${escapeHtml(notice.source.toUpperCase())} · ${escapeHtml(notice.region)} · ${escapeHtml(notice.status)} · 등록일 ${escapeHtml(formatDate(notice.postedAt))}</span>
    <span class="badge-row">${renderStatusBadge(notice)} ${renderEligibilityBadge(notice)}</span>
    ${renderEligibilityReasons(notice)}
  </a>
`;
const renderListing = (listing) => `
  <tr>
    <td>${escapeHtml(cleanRelativeAge(listing.title))}</td>
    <td>${escapeHtml(listing.supplyType)}</td>
    <td>${escapeHtml(listing.floorAreaM2 ?? '-')}</td>
    <td>${formatMoney(listing.deposit)}</td>
    <td>${formatMoney(listing.monthlyRent)}</td>
    <td>${escapeHtml(listing.status)}</td>
  </tr>
`;
const renderSourceRun = (run) => `
  <tr>
    <td>${escapeHtml(run.source.toUpperCase())}</td>
    <td>${escapeHtml(run.status)}</td>
    <td>${escapeHtml(run.finishedAt)}</td>
    <td>${escapeHtml(run.message ?? '-')}</td>
  </tr>
`;
export const renderDashboardHtml = (view) => {
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
      gap: 12px;
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
    .table-wrap { overflow-x: auto; }
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
      ${renderProfileForm(view)}
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
        .map((notice) => `
                <div class="excluded-item">
                  <strong>${escapeHtml(reasonLabel(notice))}</strong>
                  <div>${escapeHtml(cleanRelativeAge(notice.title))}</div>
                </div>
              `)
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
        ${selectedNotice
        ? `<div class="detail">
                <h3>${escapeHtml(cleanRelativeAge(selectedNotice.title))}</h3>
                <div class="detail-grid">
                  <div class="field"><span>기관</span>${escapeHtml(selectedNotice.source.toUpperCase())}</div>
                  <div class="field"><span>지역</span>${escapeHtml(selectedNotice.region)}</div>
                  <div class="field"><span>상태</span>${renderStatusBadge(selectedNotice)} ${escapeHtml(selectedNotice.status)}</div>
                  <div class="field"><span>등록일</span>${escapeHtml(formatDate(selectedNotice.postedAt))}</div>
                  <div class="field"><span>마감</span>${escapeHtml(formatDate(selectedNotice.applicationEndAt))}</div>
                  <div class="field"><span>지원가능성</span>${renderEligibilityBadge(selectedNotice)}${renderEligibilityReasons(selectedNotice)}</div>
                </div>
                <div class="attachments">
                  ${attachments.map((attachment) => `<a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.title)}</a>`).join('')}
                </div>
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
        : '<div class="detail muted">선택된 공고가 없습니다.</div>'}
      </section>
      <section>
        <div class="section-header"><h2>수집 상태</h2></div>
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
