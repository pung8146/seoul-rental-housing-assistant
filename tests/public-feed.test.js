import { describe, expect, it } from 'vitest';
import { buildPublicFeed } from '../src/public-feed/export-public-feed.js';
import { detectPublicNoticeTypes } from '../src/public-feed/notice-type.js';
const ghNotice = {
    source: 'gh',
    sourceId: 'apply-rent-793',
    title: '(최초) 다산지금A3 통합공공임대주택 입주자 모집 공고',
    stableKey: 'notice:gh:apply-rent-793',
    changeHash: 'notice-hash',
    status: '신청가능',
    region: '경기',
    targetTags: ['공공임대'],
    postedAt: '2026-05-28',
    applicationStartAt: '2026-06-16',
    applicationEndAt: '2026-06-19',
    sourceUrl: 'https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793',
    metadata: {
        provider: 'GH',
        attachments: [
            {
                title: '공고문.pdf',
                url: 'https://apply.gh.or.kr/sr/sr7150/selectFileDown.do?pbancNo=793&atchFileDtlSn=37',
            },
        ],
    },
};
const ghListing = {
    source: 'gh',
    noticeSourceId: 'apply-rent-793',
    title: '(최초) 다산지금A3 통합공공임대주택 입주자 모집 공고',
    stableKey: 'listing:gh:apply-rent-793',
    changeHash: 'listing-hash',
    supplyType: '통합공공임대',
    region: '경기',
    targetTags: ['공공임대'],
    deposit: null,
    monthlyRent: null,
    floorAreaM2: null,
    status: '신청가능',
    metadata: {},
};
const shNotice = {
    source: 'sh',
    sourceId: '306011',
    title: '2026년 가양동 육아 협동조합주택(이음채) 잔여세대 입주자 모집공고(2026. 6. 23.)',
    stableKey: 'notice:sh:306011',
    changeHash: 'sh-hash',
    status: 'posted',
    region: '서울',
    targetTags: ['도시형생활주택'],
    postedAt: '2026-06-23',
    applicationStartAt: null,
    applicationEndAt: null,
    sourceUrl: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2&seq=306011',
    metadata: {
        provider: 'SH',
        attachments: [{ title: '공고문.pdf', url: 'https://example.com/sh.pdf' }],
    },
};
const seoulHousingDuplicateNotice = {
    ...shNotice,
    source: 'seoul-housing',
    stableKey: 'notice:seoul-housing:306011',
    changeHash: 'seoul-housing-hash',
    sourceUrl: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/view.do?seq=306011',
    metadata: {
        provider: '서울주거포털',
        attachments: [],
    },
};
describe('public feed export', () => {
    it('exports GH notices in the public dashboard schema', () => {
        const feed = buildPublicFeed({
            generatedAt: '2026-06-24T10:00:00.000Z',
            notices: [ghNotice],
            getListings: () => [ghListing],
        });
        expect(feed.notices).toEqual([
            {
                source: 'gh',
                sourceId: 'apply-rent-793',
                title: '(최초) 다산지금A3 통합공공임대주택 입주자 모집 공고',
                region: '경기',
                status: '신청가능',
                postedAt: '2026-05-28',
                applicationStartAt: '2026-06-16',
                applicationEndAt: '2026-06-19',
                sourceUrl: 'https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793',
                targetTags: ['공공임대'],
                typeLabels: ['임대'],
                metadata: {
                    provider: 'GH',
                    attachments: [
                        {
                            title: '공고문.pdf',
                            url: 'https://apply.gh.or.kr/sr/sr7150/selectFileDown.do?pbancNo=793&atchFileDtlSn=37',
                        },
                    ],
                },
                listings: [
                    {
                        title: '(최초) 다산지금A3 통합공공임대주택 입주자 모집 공고',
                        supplyType: '통합공공임대',
                        region: '경기',
                        status: '신청가능',
                        targetTags: ['공공임대'],
                        deposit: null,
                        monthlyRent: null,
                        floorAreaM2: null,
                        metadata: {},
                    },
                ],
            },
        ]);
    });
    it('keeps GH public feed attachments as an array even when details were skipped', () => {
        const feed = buildPublicFeed({
            generatedAt: '2026-06-24T10:00:00.000Z',
            notices: [
                {
                    ...ghNotice,
                    metadata: {
                        provider: 'GH',
                        detailSkipped: 'apply-center-default',
                    },
                },
            ],
            getListings: () => [ghListing],
        });
        expect(feed.notices[0]?.metadata.attachments).toEqual([]);
    });
    it('deduplicates Seoul Housing portal notices when SH has the same notice seq', () => {
        const feed = buildPublicFeed({
            generatedAt: '2026-06-24T10:00:00.000Z',
            notices: [seoulHousingDuplicateNotice, shNotice],
            getListings: () => [],
        });
        expect(feed.notices).toHaveLength(1);
        expect(feed.notices[0]).toMatchObject({
            source: 'sh',
            sourceId: '306011',
            metadata: {
                provider: 'SH',
                attachments: [{ title: '공고문.pdf', url: 'https://example.com/sh.pdf' }],
            },
        });
    });
    it('keeps Korean notice type labels readable', () => {
        expect(detectPublicNoticeTypes({ title: '경기행복주택 청년 입주자 모집공고', targetTags: ['행복주택', '청년'] })).toEqual([
            '임대',
            '청년',
        ]);
    });
    it('classifies Seoul Housing special public lease types as rent', () => {
        expect(detectPublicNoticeTypes({ title: '협동조합주택 잔여세대 입주자 모집공고', targetTags: ['도시형생활주택'] })).toEqual([
            '임대',
        ]);
    });
});
