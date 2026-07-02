import { describe, expect, it } from 'vitest';

import { createApplyHomeAdapter, parseApplyHomeNoticeResponse } from '../src/adapters/applyhome.js';

const applyHomeApiJson = {
  response: {
    body: {
      items: {
        item: [
          {
            HOUSE_MANAGE_NO: '2026000123',
            PBLANC_NO: '2026000123',
            HOUSE_NM: '래미안 원페를라',
            HOUSE_SECD_NM: '민영',
            HSSPLY_ADRES: '서울특별시 서초구 방배동 818-14번지 일원',
            SUBSCRPT_AREA_CODE_NM: '서울',
            RCRIT_PBLANC_DE: '2026-06-30',
            SPSPLY_RCEPT_BGNDE: '2026-07-10',
            SPSPLY_RCEPT_ENDDE: '2026-07-10',
            GNRL_RCEPT_BGNDE: '2026-07-11',
            GNRL_RCEPT_ENDDE: '2026-07-12',
            HMPG_ADRES: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2026000123&pblancNo=2026000123',
            BSNS_MBY_NM: '한국부동산원',
            MDHS_TELNO: '1644-7445',
          },
        ],
      },
    },
  },
};

describe('applyhome adapter', () => {
  it('parses APT sale notices from ApplyHome API responses', () => {
    const notices = parseApplyHomeNoticeResponse(JSON.stringify(applyHomeApiJson));

    expect(notices).toEqual([
      expect.objectContaining({
        sourceId: 'apt-2026000123-2026000123',
        title: '래미안 원페를라 입주자모집공고',
        region: '서울',
        status: '모집공고',
        targetTags: ['분양'],
        postedAt: '2026-06-30',
        applicationStartAt: '2026-07-10',
        applicationEndAt: '2026-07-12',
        sourceUrl: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2026000123&pblancNo=2026000123',
        metadata: expect.objectContaining({
          provider: '청약홈',
          housingType: '민영',
          address: '서울특별시 서초구 방배동 818-14번지 일원',
        }),
        listings: [],
      }),
    ]);
  });

  it('fetches ApplyHome notices when a service key is configured', async () => {
    const requestedUrls: string[] = [];
    const adapter = createApplyHomeAdapter({
      serviceKey: 'test-key',
      fetch: async (url) => {
        requestedUrls.push(String(url));
        return new Response(JSON.stringify({ data: applyHomeApiJson.response.body.items.item }));
      },
    });

    const notices = await adapter.fetchNotices();

    expect(adapter.source).toBe('applyhome');
    expect(requestedUrls[0]).toContain('serviceKey=test-key');
    expect(notices[0]?.title).toBe('래미안 원페를라 입주자모집공고');
  });

  it('skips ApplyHome fetches when no service key is configured', async () => {
    const adapter = createApplyHomeAdapter({ serviceKey: null });

    await expect(adapter.fetchNotices()).resolves.toEqual([]);
  });
});
