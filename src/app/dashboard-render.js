const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const formatMoney = (value) => typeof value === 'number' ? `${value.toLocaleString('ko-KR')}원` : '미정';
const formatDate = (value) => value ?? '-';
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
const isClosedNotice = (notice) => {
    if (notice.status && /(마감|종료|접수완료)/.test(notice.status)) {
        return true;
    }
    return Boolean(notice.applicationEndAt && notice.applicationEndAt < getKoreaToday());
};
const renderStatusBadge = (notice) => isClosedNotice(notice)
    ? '<span class="status-badge closed">마감</span>'
    : '<span class="status-badge open">진행</span>';
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
    ${renderStatusBadge(notice)}
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
    .status-badge.open {
      color: #166534;
      background: #dcfce7;
      border: 1px solid #86efac;
    }
    .status-badge.closed {
      color: #991b1b;
      background: #fee2e2;
      border: 1px solid #fecaca;
    }
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
