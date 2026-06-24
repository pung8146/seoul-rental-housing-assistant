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
const ghApplyListHtml = `
  <table>
    <tbody>
      <tr>
        <td>1</td>
        <td>통합공공임대</td>
        <td>
          <a href="#a" class="text_cut"
            data-previewYn="N"
            data-pbancNo="793"
            data-pbancKndCd="01"
            data-bizTyNm="통합공공임대"
          >
            (최초) 다산지금A3 통합공공임대주택 입주자 모집 공고
          </a>
        </td>
        <td>남양주시</td>
        <td><img src="/images/sub/hwp.png" alt="hwp파일"><img src="/images/sub/pdf.png" alt="pdf파일"></td>
        <td>2026-05-28</td>
        <td>2026-06-19</td>
        <td>접수중</td>
        <td><button type="button" class="btn_normal" data-pbancNo="793" data-bizTyCd="08">확인</button></td>
        <td>153794</td>
      </tr>
      <tr>
        <td>2</td>
        <td>국민임대</td>
        <td><a href="#a" data-pbancNo="790" data-bizTyNm="국민임대">다산메트로 국민임대주택 예비입주자 발표</a></td>
        <td>남양주시</td>
        <td></td>
        <td>2026-05-27</td>
        <td>2026-06-20</td>
        <td>접수중</td>
        <td></td>
        <td>100</td>
      </tr>
    </tbody>
  </table>
`;
const ghApplyDetailHtml = `
  <main>
    <table>
      <tr><th scope="row">공고명</th><td colspan="3" class="txt_l"><b>(최초) 다산지금A3 통합공공임대주택 입주자 모집 공고</b></td></tr>
      <tr><th scope="row">공고상태</th><td class="txt_l">접수중</td></tr>
      <tr><th scope="row">공고일</th><td>2026-05-28</td></tr>
      <tr>
        <th scope="row">공고문</th>
        <td>
          <a href="/sr/sr7150/selectFileDown.do?pbancNo=793&amp;atchFileSn=1585316&amp;atchFileDtlSn=36&amp;mode=1">
            [공고]다산지금A3 통합공공임대주택 입주자 모집공고_28.05.28 공고.hwp (641024 Byte)
          </a>
          <a href="/sr/sr7150/selectFileDown.do?pbancNo=793&amp;atchFileSn=1585316&amp;atchFileDtlSn=37&amp;mode=1">
            [공고]다산지금A3 통합공공임대주택 입주자 모집공고_28.05.28 공고.pdf (1164034 Byte)
          </a>
        </td>
      </tr>
    </table>
    <ul>
      <li><span><b>온라인접수기간 : </b>2026.06.16 10:00 ~ 2026.06.19 17:00</span></li>
      <li>신청자격: 무주택 세대구성원</li>
    </ul>
  </main>
`;
const ghApplyPurchaseListHtml = `
  <table>
    <tbody>
      <tr>
        <td>1</td>
        <td>매입임대</td>
        <td>
          <a href="#a" class="text_cut"
            data-previewYn="0"
            data-pbancNo="795"
            data-pbancKndCd="01"
            data-bizTyNm="매입임대"
          >
            26년 매입임대주택 입주자 모집공고(자격완화)
          </a>
        </td>
        <td>경기도</td>
        <td><img src="/images/sub/pdf.png" alt="pdf파일"></td>
        <td>2026-06-15</td>
        <td>2026-07-03</td>
        <td>공고중</td>
        <td><button type="button" class="btn_normal" data-pbancNo="795" data-molTyCd="02" data-bizTyCd="06">확인</button></td>
        <td>54078</td>
      </tr>
    </tbody>
  </table>
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
            sourceUrl: 'https://gh.or.kr/gh/announcement-of-salerental001.do?mode=view&articleNo=64847&article.offset=0&articleLimit=10&srCategoryId=12',
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
        const requestedUrls = [];
        const adapter = createGhAdapter({
            fetch: (async (url) => {
                const requestUrl = String(url);
                requestedUrls.push(requestUrl);
                return {
                    async text() {
                        if (requestUrl.includes('sr7150/selectPbancRentHouseList.do')) {
                            return ghApplyListHtml;
                        }
                        if (requestUrl.includes('sr7155/selectPbancRentHouseList.do')) {
                            return ghApplyPurchaseListHtml;
                        }
                        if (requestUrl.includes('announcement-of-salerental001.do?srCategoryId=12')) {
                            return ghListHtml;
                        }
                        return ghDetailHtml;
                    },
                };
            }),
        });
        const notices = await adapter.fetchNotices();
        const detailedNotice = await adapter.fetchNoticeDetails?.(notices[0].sourceId);
        expect(detailedNotice).not.toBeNull();
        expect(detailedNotice).toBeDefined();
        const metadata = detailedNotice.metadata ?? {};
        expect(requestedUrls[0]).toBe('https://gh.or.kr/gh/announcement-of-salerental001.do?srCategoryId=12');
        expect(requestedUrls[1]).toBe('https://apply.gh.or.kr/sb/sr/sr7150/selectPbancRentHouseList.do');
        expect(requestedUrls[2]).toBe('https://apply.gh.or.kr/sb/sr/sr7155/selectPbancRentHouseList.do');
        expect(requestedUrls[3]).toBe(notices[0].sourceUrl);
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
    it('collects GH apply center rental notices with pbanc detail URLs', async () => {
        const requestedUrls = [];
        const adapter = createGhAdapter({
            fetchApplyDetails: true,
            fetch: (async (url) => {
                const requestUrl = String(url);
                requestedUrls.push(requestUrl);
                return {
                    async text() {
                        if (requestUrl.includes('sr7150/selectPbancRentHouseList.do')) {
                            return ghApplyListHtml;
                        }
                        if (requestUrl.includes('sr7155/selectPbancRentHouseList.do')) {
                            return '<table></table>';
                        }
                        if (requestUrl.includes('selectPbancDetailView.do')) {
                            return ghApplyDetailHtml;
                        }
                        return '<table></table>';
                    },
                };
            }),
        });
        const notices = await adapter.fetchNotices();
        const notice = notices.find((item) => item.sourceId === 'apply-rent-793');
        const detailedNotice = await adapter.fetchNoticeDetails?.('apply-rent-793');
        const metadata = detailedNotice?.metadata ?? {};
        expect(notice).toMatchObject({
            sourceId: 'apply-rent-793',
            title: '(최초) 다산지금A3 통합공공임대주택 입주자 모집 공고',
            status: '신청가능',
            region: '경기',
            postedAt: '2026-05-28',
            applicationEndAt: '2026-06-19',
            sourceUrl: 'https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793',
        });
        expect(detailedNotice).toMatchObject({
            applicationStartAt: '2026-06-16',
            applicationEndAt: '2026-06-19',
        });
        expect(metadata.attachments).toEqual([
            {
                title: '[공고]다산지금A3 통합공공임대주택 입주자 모집공고_28.05.28 공고.pdf',
                url: 'https://apply.gh.or.kr/sr/sr7150/selectFileDown.do?pbancNo=793&atchFileSn=1585316&atchFileDtlSn=37&mode=1',
            },
            {
                title: '[공고]다산지금A3 통합공공임대주택 입주자 모집공고_28.05.28 공고.hwp',
                url: 'https://apply.gh.or.kr/sr/sr7150/selectFileDown.do?pbancNo=793&atchFileSn=1585316&atchFileDtlSn=36&mode=1',
            },
        ]);
        expect(metadata.primaryApplicationAttachment).toEqual({
            title: '[공고]다산지금A3 통합공공임대주택 입주자 모집공고_28.05.28 공고.pdf',
            url: 'https://apply.gh.or.kr/sr/sr7150/selectFileDown.do?pbancNo=793&atchFileSn=1585316&atchFileDtlSn=37&mode=1',
        });
        expect(metadata.locality).toBe('남양주시');
        expect(metadata.rawIds).toEqual({ pbancNo: '793' });
    });
    it('collects GH apply center purchase rental notices separately from rental notices', async () => {
        const requestedUrls = [];
        const adapter = createGhAdapter({
            fetch: (async (url) => {
                const requestUrl = String(url);
                requestedUrls.push(requestUrl);
                return {
                    async text() {
                        return requestUrl.includes('sr7155/selectPbancRentHouseList.do') ? ghApplyPurchaseListHtml : '<table></table>';
                    },
                };
            }),
        });
        const notices = await adapter.fetchNotices();
        expect(notices[0]).toMatchObject({
            sourceId: 'apply-purchase-795',
            title: '26년 매입임대주택 입주자 모집공고(자격완화)',
            status: '공고중',
            region: '경기',
            postedAt: '2026-06-15',
            applicationEndAt: '2026-07-03',
            sourceUrl: 'https://apply.gh.or.kr/sb/sr/sr7155/selectPbancDetailView.do?pbancNo=795',
            metadata: {
                category: '매입임대',
                locality: '경기도',
                rawIds: { pbancNo: '795' },
            },
        });
        expect(notices[0]?.listings[0]).toMatchObject({
            supplyType: '매입임대',
            region: '경기',
            status: '공고중',
        });
    });
    it('keeps GH detail parsing safe when optional fields are absent', () => {
        const notice = parseGhNoticeListHtml(ghListHtml)[0];
        const detailedNotice = parseGhNoticeDetailHtml('<main>공고문 별도 게시 예정</main>', notice);
        const metadata = detailedNotice.metadata ?? {};
        expect(detailedNotice.applicationStartAt).toBeUndefined();
        expect(detailedNotice.applicationEndAt).toBeUndefined();
        expect(metadata.attachments).toEqual([]);
        expect(metadata.primaryApplicationAttachment).toBeUndefined();
        expect(metadata.bodyPreview).toContain('공고문 별도 게시 예정');
    });
});
