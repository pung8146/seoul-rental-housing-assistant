import { describe, expect, it } from 'vitest';

import { createGhAdapter, parseGhNoticeDetailHtml, parseGhNoticeListHtml } from '../src/adapters/gh.js';

const ghListHtml = `
  <table class="board-list-table">
    <tbody>
      <tr>
        <td class="number">557</td>
        <td class="category">주택</td>
        <td class="title">
          <div class="b-title-box">
            <a href="?mode=view&amp;articleNo=64847&amp;article.offset=0&amp;articleLimit=10&amp;srCategoryId=12"
              title="다산 센트럴파크6단지 영구임대주택 예비입주자 모집 공고 자세히 보기">
              다산 센트럴파크6단지 영구임대주택 예비입주자 모집 공고
            </a>
          </div>
        </td>
        <td class="department">건설임대공급2부</td>
        <td class="date">26.05.14</td>
        <td class="hit">924</td>
        <td class="attach">
          <a href="?mode=download&amp;articleNo=64847&amp;attachNo=82481">
            <img alt="공고문.pdf - 다운로드">
          </a>
        </td>
      </tr>
      <tr>
        <td class="number">556</td>
        <td class="category">주택</td>
        <td class="title">
          <a href="?mode=view&amp;articleNo=64811&amp;article.offset=0&amp;articleLimit=10&amp;srCategoryId=12"
            title="다산메트로 3단지 영구임대주택 입주자 발표 자세히 보기">
            다산메트로 3단지 영구임대주택 입주자 발표
          </a>
        </td>
        <td class="department">건설임대공급2부</td>
        <td class="date">26.05.13</td>
        <td class="hit">110</td>
        <td class="attach"></td>
      </tr>
    </tbody>
  </table>
`;

const ghDetailHtml = `
  <main>
    <div class="fr-view">
      <p>다산 센트럴파크6단지 영구임대주택 예비입주자 모집 공고를 붙임과 같이 게시합니다.</p>
      <p>□ 모집공고일 : 2026.05.14</p>
      <p>□ 신청접수기간 : 2026.05.27.(수) ~ 2026.05.29.(금)</p>
      <p>무주택 세대구성원, 청년 만 19세 이상 만 39세 이하</p>
    </div>
    <ul class="download-file-list-wrap">
      <li>
        <div class="fileNm">다산센트럴파크6단지_영구임대주택_예비입주자_모집공고문.hwp</div>
        <a href="?mode=download&amp;articleNo=64847&amp;attachNo=82480" class="attach-down-btn" title="다운로드">다운로드</a>
      </li>
      <li>
        <div class="fileNm">다산센트럴파크6단지_영구임대주택_예비입주자_모집공고문.pdf</div>
        <a href="?mode=download&amp;articleNo=64847&amp;attachNo=82481" class="attach-down-btn" title="다운로드">다운로드</a>
      </li>
    </ul>
  </main>
`;

describe('GH adapter', () => {
  it('parses actionable GH housing notices and excludes result announcements', () => {
    const notices = parseGhNoticeListHtml(ghListHtml);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      sourceId: '64847',
      title: '다산 센트럴파크6단지 영구임대주택 예비입주자 모집 공고',
      status: 'posted',
      region: '경기',
      postedAt: '2026-05-14',
      sourceUrl:
        'https://gh.or.kr/gh/announcement-of-salerental001.do?mode=view&articleNo=64847&article.offset=0&articleLimit=10&srCategoryId=12',
    });
    expect(notices[0]?.metadata).toMatchObject({
      provider: 'GH',
      category: '주택',
      department: '건설임대공급2부',
      rawIds: { articleNo: '64847' },
    });
    expect(notices[0]?.listings[0]).toMatchObject({
      title: '다산 센트럴파크6단지 영구임대주택 예비입주자 모집 공고',
      supplyType: '주택',
      region: '경기',
      status: 'posted',
    });
  });

  it('collects live GH adapter notices without missing downstream-required fields', async () => {
    const requestedUrls: string[] = [];
    const adapter = createGhAdapter({
      fetch: (async (url: string | URL | Request) => {
        requestedUrls.push(String(url));
        return {
          async text() {
            return requestedUrls.length === 1 ? ghListHtml : ghDetailHtml;
          },
        } as Response;
      }) as typeof fetch,
    });

    const notices = await adapter.fetchNotices();
    const detailedNotice = await adapter.fetchNoticeDetails?.(notices[0]!.sourceId);

    expect(detailedNotice).not.toBeNull();
    expect(detailedNotice).toBeDefined();
    const metadata = detailedNotice!.metadata ?? {};

    expect(requestedUrls[0]).toBe('https://gh.or.kr/gh/announcement-of-salerental001.do?srCategoryId=12');
    expect(requestedUrls[1]).toBe(notices[0]!.sourceUrl);
    expect(detailedNotice).toMatchObject({
      sourceId: '64847',
      title: '다산 센트럴파크6단지 영구임대주택 예비입주자 모집 공고',
      status: 'posted',
      region: '경기',
      postedAt: '2026-05-14',
      applicationStartAt: '2026-05-27',
      applicationEndAt: '2026-05-29',
    });
    expect(metadata.attachments).toEqual([
      {
        title: '다산센트럴파크6단지_영구임대주택_예비입주자_모집공고문.pdf',
        url: 'https://gh.or.kr/gh/announcement-of-salerental001.do?mode=download&articleNo=64847&attachNo=82481',
      },
      {
        title: '다산센트럴파크6단지_영구임대주택_예비입주자_모집공고문.hwp',
        url: 'https://gh.or.kr/gh/announcement-of-salerental001.do?mode=download&articleNo=64847&attachNo=82480',
      },
    ]);
    expect(metadata.primaryApplicationAttachment).toEqual({
      title: '다산센트럴파크6단지_영구임대주택_예비입주자_모집공고문.pdf',
      url: 'https://gh.or.kr/gh/announcement-of-salerental001.do?mode=download&articleNo=64847&attachNo=82481',
    });
    expect(metadata.eligibilityRequirements).toMatchObject({
      minAge: 19,
      maxAge: 39,
      requiresHomeless: true,
    });
    expect(metadata.bodyPreview).toContain('신청접수기간');
  });

  it('keeps GH detail parsing safe when optional fields are absent', () => {
    const notice = parseGhNoticeListHtml(ghListHtml)[0]!;
    const detailedNotice = parseGhNoticeDetailHtml('<main>공고문 별도 게시 예정</main>', notice);
    const metadata = detailedNotice.metadata ?? {};

    expect(detailedNotice.applicationStartAt).toBeUndefined();
    expect(detailedNotice.applicationEndAt).toBeUndefined();
    expect(metadata.attachments).toEqual([]);
    expect(metadata.primaryApplicationAttachment).toBeUndefined();
    expect(metadata.bodyPreview).toContain('공고문 별도 게시 예정');
  });
});
