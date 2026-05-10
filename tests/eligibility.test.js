import { describe, expect, it } from 'vitest';
import { assessEligibility } from '../src/domain/eligibility.js';
const profile = {
    birthYear: 1995,
    isHomeless: true,
    residenceRegion: '서울',
    householdSize: 1,
    monthlyIncome: 2500000,
    totalAssets: 50000000,
    vehicleValue: 0,
    interestTags: ['청년', '행복주택'],
};
const makeNotice = (overrides = {}) => ({
    source: 'lh',
    sourceId: 'notice-1',
    title: '서울 청년 행복주택 입주자 모집공고',
    stableKey: 'notice:1',
    changeHash: 'hash',
    status: '공고중',
    region: '서울',
    targetTags: ['청년'],
    postedAt: '2026-05-09',
    applicationStartAt: '2026-05-10',
    applicationEndAt: '2026-05-20',
    sourceUrl: 'https://example.com',
    metadata: {},
    ...overrides,
});
describe('assessEligibility', () => {
    it('marks likely eligible notices when profile tags and region match', () => {
        expect(assessEligibility(profile, makeNotice())).toEqual({
            status: 'likely',
            label: '지원가능성 높음',
            reasons: ['관심 유형 일치', '지역 일치', '무주택 조건 입력됨'],
        });
    });
    it('marks notices as not target when tags clearly differ', () => {
        expect(assessEligibility(profile, makeNotice({ title: '고령자 국민임대 입주자 모집공고', targetTags: ['고령자'] }))).toMatchObject({
            status: 'not_target',
            label: '대상 아님',
        });
    });
    it('asks for review when parsed requirements are not enough', () => {
        expect(assessEligibility(profile, makeNotice({ title: '국민임대 입주자 모집공고', targetTags: [] }))).toMatchObject({
            status: 'review',
            label: '조건 확인 필요',
        });
    });
    it('asks for income asset review when financial inputs are missing', () => {
        expect(assessEligibility({ ...profile, monthlyIncome: null, totalAssets: null }, makeNotice())).toMatchObject({
            status: 'financial_review',
            label: '소득/자산 확인 필요',
        });
    });
});
