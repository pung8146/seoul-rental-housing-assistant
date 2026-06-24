import { describe, expect, it } from 'vitest';
import { createSeoulHousingAdapter, parseSeoulHousingPublicLeaseHtml } from '../src/adapters/seoul-housing.js';
const publicLeaseHtml = `
  <table>
    <tbody>
      <tr>
        <td class="td1">75</td>
        <td class="td3">도시형생활주택</td>
        <td class="txl td-m">2026년 가양동 육아 협동조합주택(이음채) 잔여세대 입주자 모집공고(2026. 6. 23.)</td>
        <td class="td4">2026-06-23</td>
        <td class="td-mdisn">2026-10-14</td>
        <td class="td-mdisn">모집중</td>
        <td class="td-mdisn">맞춤주택공급부</td>
        <td class="td5"><a href="https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/view.do?seq=306011">바로가기</a></td>
      </tr>
      <tr>
        <td class="td1">74</td>
        <td class="td3">매입임대주택</td>
        <td class="txl td-m">서류심사대상자 발표 및 서류제출 안내</td>
        <td class="td4">2026-06-05</td>
        <td class="td-mdisn">2026-09-30</td>
        <td class="td-mdisn">모집중</td>
        <td class="td-mdisn">매입주택공급부</td>
        <td class="td5"><a href="https://www.i-sh.co.kr/main/example">바로가기</a></td>
      </tr>
    </tbody>
  </table>
`;
describe('Seoul Housing public lease adapter', () => {
    it('parses actionable public lease notices from Seoul Housing portal', () => {
        const notices = parseSeoulHousingPublicLeaseHtml(publicLeaseHtml);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            sourceId: '306011',
            title: '2026년 가양동 육아 협동조합주택(이음채) 잔여세대 입주자 모집공고(2026. 6. 23.)',
            status: '공고중',
            region: '서울',
            targetTags: ['도시형생활주택'],
            postedAt: '2026-06-23',
            sourceUrl: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/view.do?seq=306011',
            metadata: {
                provider: '서울주거포털',
                category: '도시형생활주택',
                department: '맞춤주택공급부',
                announcedAt: '2026-10-14',
                rawIds: { seq: '306011' },
            },
        });
        expect(notices[0]?.listings[0]).toMatchObject({
            supplyType: '도시형생활주택',
            region: '서울',
            status: '공고중',
        });
    });
    it('collects live Seoul Housing public lease notices without missing required fields', async () => {
        const adapter = createSeoulHousingAdapter({
            fetch: (async () => ({
                async text() {
                    return publicLeaseHtml;
                },
            })),
        });
        const notices = await adapter.fetchNotices();
        expect(notices[0]).toMatchObject({
            sourceId: '306011',
            title: expect.stringContaining('입주자 모집공고'),
            region: '서울',
            postedAt: '2026-06-23',
            sourceUrl: expect.stringContaining('i-sh.co.kr'),
            listings: [expect.objectContaining({ region: '서울' })],
        });
    });
});
