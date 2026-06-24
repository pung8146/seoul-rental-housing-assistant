import { describe, expect, it } from 'vitest';
import { createSocoAdapter, parseSocoNoticeListHtml, parseSocoNoticeListJson } from '../src/adapters/soco.js';
const socoListHtml = `
  <table>
    <tbody>
      <tr>
        <td>12</td>
        <td>민간</td>
        <td><a href="/youth/bbs/BMSR00015/view.do?nttId=1234&menuNo=400008">강동구 청년안심주택 입주자 모집공고</a></td>
        <td>2026-06-24</td>
        <td>2026-07-01 ~ 2026-07-05</td>
        <td>사업자</td>
      </tr>
      <tr>
        <td>11</td>
        <td>공지</td>
        <td><a href="/youth/bbs/BMSR00015/view.do?nttId=1233&menuNo=400008">시스템 점검 안내</a></td>
        <td>2026-06-20</td>
        <td>-</td>
        <td>서울시</td>
      </tr>
    </tbody>
  </table>
`;
describe('SOCO youth housing adapter', () => {
    it('parses actionable youth safe housing notices from the list', () => {
        const notices = parseSocoNoticeListHtml(socoListHtml);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            sourceId: '1234',
            title: '강동구 청년안심주택 입주자 모집공고',
            status: 'posted',
            region: '서울',
            targetTags: ['청년', '청년안심주택', '민간'],
            postedAt: '2026-06-24',
            applicationStartAt: '2026-07-01',
            applicationEndAt: '2026-07-05',
            sourceUrl: 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?nttId=1234&menuNo=400008',
        });
        expect(notices[0]?.metadata).toMatchObject({
            provider: '서울시 청년안심주택',
            category: '민간',
            rawIds: { boardId: '1234' },
        });
        expect(notices[0]?.listings[0]).toMatchObject({
            title: '강동구 청년안심주택 입주자 모집공고',
            supplyType: '청년안심주택',
            region: '서울',
            targetTags: ['청년', '청년안심주택', '민간'],
            status: 'posted',
        });
    });
    it('parses actionable youth safe housing notices from the JSON endpoint', () => {
        const notices = parseSocoNoticeListJson({
            resultList: [
                {
                    boardId: 6577,
                    nttSj: '[민간임대] 동묘앞역 청계로벤하임 추가모집공고',
                    optn1: '2026-06-18',
                    optn2: '2',
                    optn3: '사업자',
                    optn4: '2026-06-22',
                    optn5: '2',
                },
            ],
        });
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            sourceId: '6577',
            title: '[민간임대] 동묘앞역 청계로벤하임 추가모집공고',
            region: '서울',
            targetTags: ['청년', '청년안심주택', '민간', '추가'],
            postedAt: '2026-06-18',
            applicationStartAt: '2026-06-22',
            applicationEndAt: '2026-06-22',
            sourceUrl: 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?optn1=2026-06-18&boardId=6577&menuNo=400008&pageIndex=1',
        });
    });
    it('collects live SOCO adapter notices without missing downstream-required fields', async () => {
        const requestedUrls = [];
        const adapter = createSocoAdapter({
            fetch: (async (url) => {
                requestedUrls.push(String(url));
                return {
                    async json() {
                        return {
                            resultList: [
                                {
                                    boardId: 1234,
                                    nttSj: '강동구 청년안심주택 입주자 모집공고',
                                    optn1: '2026-06-24',
                                    optn2: '2',
                                    optn3: '사업자',
                                    optn4: '2026-07-01 ~ 2026-07-05',
                                    optn5: '1',
                                },
                            ],
                        };
                    },
                };
            }),
        });
        const notices = await adapter.fetchNotices();
        expect(requestedUrls[0]).toBe('https://soco.seoul.go.kr/youth/pgm/home/yohome/bbsListJson.json');
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            sourceId: '1234',
            title: '강동구 청년안심주택 입주자 모집공고',
            region: '서울',
            postedAt: '2026-06-24',
            applicationStartAt: '2026-07-01',
            applicationEndAt: '2026-07-05',
        });
    });
});
