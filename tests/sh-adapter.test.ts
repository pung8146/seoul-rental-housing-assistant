import { describe, expect, it } from 'vitest';

import { createShAdapter, parseShNoticeDetailHtml, parseShNoticeListHtml } from '../src/adapters/sh.js';

const shListHtml = `
  <table>
    <tbody>
      <tr>
        <td>1</td>
        <td>공고</td>
        <td><a href="#" onclick="getDetailView('202605110001')">2026년 행복주택 입주자 모집공고</a></td>
        <td>주거복지처</td>
        <td>2026-05-11</td>
        <td>조회</td>
      </tr>
      <tr>
        <td>2</td>
        <td>안내</td>
        <td><a href="#" onclick="getDetailView('202605110002')">전산작업에 따른 서비스 이용 안내</a></td>
        <td>정보시스템부</td>
        <td>2026-05-10</td>
        <td>조회</td>
      </tr>
    </tbody>
  </table>
`;

const shDetailHtml = `
  <main>
    <p>신청접수기간 : 2026.05.20 ~ 2026.05.24</p>
    <p>무주택 세대구성원, 청년 만 19세 이상 만 39세 이하</p>
    <p>월평균소득 3,589,957원 이하, 총자산 345,000,000원 이하, 자동차 37,080,000원 이하</p>
    <a href="#">공고문.pdf</a>
    <a href="/main/lay2/program/S1T294C297/www/brd/m_247/download.do?seq=202605110001&file=1">미리보기</a>
  </main>
`;

describe('SH adapter', () => {
  it('parses actionable SH notices from the list and excludes service announcements', () => {
    const notices = parseShNoticeListHtml(shListHtml);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      sourceId: '202605110001',
      title: '2026년 행복주택 입주자 모집공고',
      status: 'posted',
      region: '서울',
      postedAt: '2026-05-11',
      sourceUrl:
        'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2&seq=202605110001',
    });
    expect(notices[0]?.metadata).toMatchObject({
      provider: 'SH',
      department: '주거복지처',
      rawIds: { seq: '202605110001' },
    });
    expect(notices[0]?.listings[0]).toMatchObject({
      title: '2026년 행복주택 입주자 모집공고',
      supplyType: '주거복지처',
      region: '서울',
      status: 'posted',
    });
  });

  it('collects live SH adapter notices without missing downstream-required fields', async () => {
    const requestedUrls: string[] = [];
    const adapter = createShAdapter({
      fetch: (async (url: string | URL | Request) => {
        requestedUrls.push(String(url));
        return {
          async text() {
            return requestedUrls.length === 1 ? shListHtml : shDetailHtml;
          },
        } as Response;
      }) as typeof fetch,
    });

    const notices = await adapter.fetchNotices();
    const detailedNotice = await adapter.fetchNoticeDetails?.(notices[0]!.sourceId);

    expect(detailedNotice).not.toBeNull();
    expect(detailedNotice).toBeDefined();
    const metadata = detailedNotice!.metadata ?? {};

    expect(requestedUrls[0]).toContain('/list.do?multi_itm_seq=2');
    expect(requestedUrls[1]).toBe(notices[0]!.sourceUrl);
    expect(detailedNotice).toMatchObject({
      sourceId: '202605110001',
      title: '2026년 행복주택 입주자 모집공고',
      status: 'posted',
      region: '서울',
      postedAt: '2026-05-11',
      applicationStartAt: '2026-05-20',
      applicationEndAt: '2026-05-24',
      sourceUrl:
        'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2&seq=202605110001',
    });
    expect(metadata.attachments).toEqual([
      {
        title: '공고문.pdf',
        url: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/download.do?seq=202605110001&file=1',
      },
    ]);
    expect(metadata.primaryApplicationAttachment).toEqual({
      title: '공고문.pdf',
      url: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/download.do?seq=202605110001&file=1',
    });
    expect(metadata.eligibilityRequirements).toMatchObject({
      minAge: 19,
      maxAge: 39,
      requiresHomeless: true,
      maxMonthlyIncome: 3589957,
      maxTotalAssets: 345000000,
      maxVehicleValue: 37080000,
    });
    expect(metadata.bodyPreview).toContain('신청접수기간');
    expect(detailedNotice?.listings[0]).toMatchObject({
      title: '2026년 행복주택 입주자 모집공고',
      supplyType: '주거복지처',
      region: '서울',
      status: 'posted',
    });
  });

  it('keeps SH detail parsing safe when optional fields are absent', () => {
    const notice = parseShNoticeListHtml(shListHtml)[0]!;
    const detailedNotice = parseShNoticeDetailHtml('<main>공고문 별도 게시 예정</main>', notice);
    const metadata = detailedNotice.metadata ?? {};

    expect(detailedNotice.applicationStartAt).toBeUndefined();
    expect(detailedNotice.applicationEndAt).toBeUndefined();
    expect(metadata.attachments).toEqual([]);
    expect(metadata.primaryApplicationAttachment).toBeUndefined();
    expect(metadata.bodyPreview).toContain('공고문 별도 게시 예정');
  });
});
