import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>공공주택 공고 대시보드</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f8fa; color: #1b2430; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #d9dee7; background: #fff; }
    h1, h2, h3 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 20px; }
    main { display: grid; grid-template-columns: minmax(280px, 420px) minmax(0, 1fr); gap: 14px; padding: 14px; max-width: 1440px; margin: 0 auto; }
    .panel { border: 1px solid #d9dee7; border-radius: 8px; background: #fff; min-width: 0; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px; }
    button { border: 1px solid #cfd6e3; background: #fff; color: #1b2430; border-radius: 6px; padding: 8px 10px; cursor: pointer; }
    button.active { border-color: #2563eb; background: #eaf1ff; color: #1d4ed8; font-weight: 700; }
    .notice-list { display: grid; max-height: calc(100vh - 150px); overflow: auto; border-top: 1px solid #e5e9f0; }
    .notice-row { display: grid; gap: 6px; padding: 12px; border: 0; border-bottom: 1px solid #e5e9f0; text-align: left; border-radius: 0; }
    .notice-row strong { line-height: 1.35; }
    .meta, .muted { color: #637083; font-size: 13px; }
    .badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .badge { border-radius: 999px; background: #eef2f7; padding: 2px 8px; font-size: 12px; font-weight: 700; }
    .detail { padding: 18px; display: grid; gap: 16px; }
    .detail h2 { font-size: 22px; line-height: 1.3; }
    .detail-grid, .listing-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .field, .listing { border: 1px solid #e1e6ef; border-radius: 8px; padding: 10px; background: #fbfcfe; }
    .field span, .listing span { display: block; color: #637083; font-size: 12px; margin-bottom: 4px; }
    a { color: #1d4ed8; overflow-wrap: anywhere; }
    @media (max-width: 840px) { main { grid-template-columns: 1fr; } .notice-list { max-height: none; } .detail-grid, .listing-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>공공주택 공고 대시보드</h1>
    <div id="summary" class="muted">불러오는 중</div>
  </header>
  <main>
    <section class="panel">
      <div id="sourceFilters" class="filters"></div>
      <div id="noticeList" class="notice-list"></div>
    </section>
    <section id="detail" class="panel detail"></section>
  </main>
  <script>
    const state = { feed: null, source: 'all', selectedId: null };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const noticeKey = (notice) => notice.source + ':' + notice.sourceId;
    const formatDate = (value) => value || '-';
    const getAttachments = (notice) => Array.isArray(notice.metadata?.attachments) ? notice.metadata.attachments : [];
    const filteredNotices = () => state.feed.notices.filter((notice) => state.source === 'all' || notice.source === state.source);
    const setSource = (source) => { state.source = source; state.selectedId = filteredNotices()[0] ? noticeKey(filteredNotices()[0]) : null; render(); };
    const selectNotice = (id) => { state.selectedId = id; render(); };
    const renderFilters = () => {
      const sources = ['all', ...Array.from(new Set(state.feed.notices.map((notice) => notice.source))).sort()];
      document.getElementById('sourceFilters').innerHTML = sources.map((source) => '<button data-source="' + escapeHtml(source) + '" class="' + (state.source === source ? 'active' : '') + '">' + escapeHtml(source === 'all' ? '전체' : source.toUpperCase()) + '</button>').join('');
    };
    const renderList = () => {
      const notices = filteredNotices();
      document.getElementById('noticeList').innerHTML = notices.map((notice) => '<button data-notice-key="' + escapeHtml(noticeKey(notice)) + '" class="notice-row ' + (state.selectedId === noticeKey(notice) ? 'active' : '') + '"><strong>' + escapeHtml(notice.title) + '</strong><span class="meta">' + escapeHtml(notice.source.toUpperCase()) + ' · ' + escapeHtml(notice.region) + ' · ' + escapeHtml(notice.status) + ' · 게시 ' + escapeHtml(formatDate(notice.postedAt)) + '</span><span class="badges">' + notice.typeLabels.map((label) => '<span class="badge">' + escapeHtml(label) + '</span>').join('') + '</span></button>').join('');
      document.getElementById('summary').textContent = '전체 ' + state.feed.notices.length + '건 · 현재 ' + notices.length + '건';
    };
    const renderDetail = () => {
      const notice = state.feed.notices.find((item) => noticeKey(item) === state.selectedId) || filteredNotices()[0];
      if (!notice) {
        document.getElementById('detail').innerHTML = '<p class="muted">표시할 공고가 없습니다.</p>';
        return;
      }
      const attachments = getAttachments(notice);
      document.getElementById('detail').innerHTML = '<div><h2>' + escapeHtml(notice.title) + '</h2><p class="meta">' + escapeHtml(notice.source.toUpperCase()) + ' · ' + escapeHtml(notice.region) + '</p></div><div class="detail-grid"><div class="field"><span>상태</span><strong>' + escapeHtml(notice.status) + '</strong></div><div class="field"><span>게시일</span><strong>' + escapeHtml(formatDate(notice.postedAt)) + '</strong></div><div class="field"><span>신청시작</span><strong>' + escapeHtml(formatDate(notice.applicationStartAt)) + '</strong></div><div class="field"><span>신청마감</span><strong>' + escapeHtml(formatDate(notice.applicationEndAt)) + '</strong></div></div><div class="field"><span>원문</span>' + (notice.sourceUrl ? '<a href="' + escapeHtml(notice.sourceUrl) + '">' + escapeHtml(notice.sourceUrl) + '</a>' : '-') + '</div><div><h3>첨부</h3>' + (attachments.length ? attachments.map((item) => '<div><a href="' + escapeHtml(item.url) + '">' + escapeHtml(item.title) + '</a></div>').join('') : '<p class="muted">첨부 없음</p>') + '</div><div><h3>매물</h3><div class="listing-grid">' + notice.listings.map((listing) => '<div class="listing"><span>' + escapeHtml(listing.supplyType || '유형') + '</span><strong>' + escapeHtml(listing.title) + '</strong><p class="meta">' + escapeHtml(listing.region) + ' · ' + escapeHtml(listing.status) + '</p></div>').join('') + '</div></div>';
    };
    const render = () => { renderFilters(); renderList(); renderDetail(); };
    document.getElementById('sourceFilters').addEventListener('click', (event) => {
      const source = event.target.closest('button')?.dataset?.source;
      if (source) setSource(source);
    });
    document.getElementById('noticeList').addEventListener('click', (event) => {
      const key = event.target.closest('button')?.dataset?.noticeKey;
      if (key) selectNotice(key);
    });
    fetch('/public-feed.json').then((response) => response.json()).then((feed) => {
      state.feed = feed;
      state.selectedId = feed.notices[0] ? noticeKey(feed.notices[0]) : null;
      render();
    }).catch((error) => {
      document.getElementById('summary').textContent = 'public-feed.json 로드 실패';
      document.getElementById('detail').innerHTML = '<p class="muted">' + escapeHtml(error.message) + '</p>';
    });
  </script>
</body>
</html>
`;
const main = async () => {
    const publicDir = resolve('public');
    await mkdir(publicDir, { recursive: true });
    await writeFile(resolve(publicDir, 'index.html'), `${html}\n`, 'utf8');
    console.log(`public dashboard built: ${resolve(publicDir, 'index.html')}`);
};
if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
