import { describe, expect, it } from 'vitest';

import { assessEligibility } from '../src/domain/eligibility.js';
import type { Notice, PersonalProfile } from '../src/types.js';

const profile: PersonalProfile = {
  birthYear: 1995,
  isHomeless: true,
  residenceRegion: '서울',
  householdSize: 1,
  monthlyIncome: 2500000,
  totalAssets: 50000000,
  vehicleValue: 0,
  subscriptionAccountMonths: 36,
  subscriptionPaymentCount: 24,
  interestTags: ['청년', '행복주택'],
};

const makeNotice = (overrides: Partial<Notice> = {}): Notice => ({
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
  it('asks for review when no parsed requirements are available', () => {
    expect(assessEligibility(profile, makeNotice())).toEqual({
      status: 'review',
      label: '조건 확인 필요',
      reasons: ['공고문에서 신청 조건을 찾지 못함', '첨부 PDF 확인 필요'],
    });
  });

  it('points to the primary application attachment when parsed requirements are missing', () => {
    expect(
      assessEligibility(
        profile,
        makeNotice({
          metadata: {
            primaryApplicationAttachment: {
              title: '청년안심주택 입주자 모집공고문.pdf',
              url: 'https://example.com/notice.pdf',
            },
          },
        }),
      ),
    ).toEqual({
      status: 'review',
      label: '조건 확인 필요',
      reasons: ['공고문에서 신청 조건을 찾지 못함', '첨부 확인 필요: 청년안심주택 입주자 모집공고문.pdf'],
    });
  });

  it('marks likely eligible notices only when parsed requirements pass and profile tags match', () => {
    expect(
      assessEligibility(
        profile,
        makeNotice({
          metadata: {
            eligibilityRequirements: {
              minAge: 19,
              maxAge: 39,
              requiresHomeless: true,
              maxMonthlyIncome: 3589957,
              maxTotalAssets: 345000000,
              maxVehicleValue: 37080000,
            },
          },
        }),
      ),
    ).toEqual({
      status: 'likely',
      label: '지원가능성 높음',
      reasons: ['관심 유형 일치', '지역 일치', '추출 조건 통과'],
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
    expect(
      assessEligibility(
        { ...profile, monthlyIncome: null, totalAssets: null },
        makeNotice({
          metadata: {
            eligibilityRequirements: {
              maxMonthlyIncome: 3589957,
              maxTotalAssets: 345000000,
            },
          },
        }),
      ),
    ).toMatchObject({
      status: 'financial_review',
      label: '소득/자산 확인 필요',
    });
  });

  it('marks notices as not target when parsed age requirements exclude the profile', () => {
    expect(
      assessEligibility(
        { ...profile, birthYear: 1980 },
        makeNotice({
          postedAt: '2026-05-09',
          metadata: {
            eligibilityRequirements: {
              minAge: 19,
              maxAge: 39,
            },
          },
        }),
      ),
    ).toMatchObject({
      status: 'not_target',
      label: '대상 아님',
      reasons: ['나이 조건 초과'],
    });
  });

  it('marks notices as not target when parsed financial limits are exceeded', () => {
    expect(
      assessEligibility(
        { ...profile, monthlyIncome: 4000000 },
        makeNotice({
          metadata: {
            eligibilityRequirements: {
              maxMonthlyIncome: 3589957,
            },
          },
        }),
      ),
    ).toMatchObject({
      status: 'not_target',
      label: '대상 아님',
      reasons: ['소득 기준 초과'],
    });
  });

  it('asks for financial review when parsed financial limits exist but profile values are missing', () => {
    expect(
      assessEligibility(
        { ...profile, totalAssets: null },
        makeNotice({
          metadata: {
            eligibilityRequirements: {
              maxTotalAssets: 345000000,
            },
          },
        }),
      ),
    ).toMatchObject({
      status: 'financial_review',
      label: '소득/자산 확인 필요',
      reasons: ['총자산 입력 필요'],
    });
  });

  it('marks notices as not target when household size exceeds parsed limits', () => {
    expect(
      assessEligibility(
        { ...profile, householdSize: 3 },
        makeNotice({
          metadata: {
            eligibilityRequirements: {
              minHouseholdSize: 1,
              maxHouseholdSize: 1,
            },
          },
        }),
      ),
    ).toMatchObject({
      status: 'not_target',
      label: '대상 아님',
      reasons: ['가구원수 조건 초과'],
    });
  });

  it('marks notices as not target when required residence region differs', () => {
    expect(
      assessEligibility(
        { ...profile, residenceRegion: '경기' },
        makeNotice({
          metadata: {
            eligibilityRequirements: {
              residenceRegions: ['서울'],
            },
          },
        }),
      ),
    ).toMatchObject({
      status: 'not_target',
      label: '대상 아님',
      reasons: ['거주지역 조건 불일치'],
    });
  });

  it('asks for review when required residence region exists but profile region is missing', () => {
    expect(
      assessEligibility(
        { ...profile, residenceRegion: null },
        makeNotice({
          metadata: {
            eligibilityRequirements: {
              residenceRegions: ['서울'],
            },
          },
        }),
      ),
    ).toMatchObject({
      status: 'financial_review',
      label: '소득/자산 확인 필요',
      reasons: ['거주지역 입력 필요'],
    });
  });
});
