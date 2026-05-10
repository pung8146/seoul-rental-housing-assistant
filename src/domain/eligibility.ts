import type { Notice, PersonalProfile } from '../types.js';

export type EligibilityStatus = 'likely' | 'review' | 'not_target' | 'financial_review' | 'missing_profile';

export type EligibilityAssessment = {
  status: EligibilityStatus;
  label: '지원가능성 높음' | '조건 확인 필요' | '대상 아님' | '소득/자산 확인 필요' | '프로필 필요';
  reasons: string[];
};

const TARGET_KEYWORDS = ['청년', '대학생', '신혼', '고령자', '일반'];

const noticeText = (notice: Notice): string => [notice.title, ...notice.targetTags].join(' ');

const matchingInterestTags = (profile: PersonalProfile, notice: Notice): string[] =>
  profile.interestTags.filter((tag) => noticeText(notice).includes(tag));

const hasDifferentExplicitTarget = (profile: PersonalProfile, notice: Notice): boolean => {
  const text = noticeText(notice);
  const explicitTargets = TARGET_KEYWORDS.filter((keyword) => text.includes(keyword));
  if (explicitTargets.length === 0) {
    return false;
  }

  return !explicitTargets.some((target) => profile.interestTags.some((tag) => target.includes(tag) || tag.includes(target)));
};

export const assessEligibility = (
  profile: PersonalProfile | null,
  notice: Notice,
): EligibilityAssessment => {
  if (!profile) {
    return { status: 'missing_profile', label: '프로필 필요', reasons: ['내 정보가 아직 저장되지 않음'] };
  }

  if (hasDifferentExplicitTarget(profile, notice)) {
    return { status: 'not_target', label: '대상 아님', reasons: ['공고 대상 유형이 관심 유형과 다름'] };
  }

  if (profile.monthlyIncome == null || profile.totalAssets == null || profile.vehicleValue == null) {
    return { status: 'financial_review', label: '소득/자산 확인 필요', reasons: ['소득/자산/자동차가액 입력 필요'] };
  }

  const reasons: string[] = [];
  if (matchingInterestTags(profile, notice).length > 0) {
    reasons.push('관심 유형 일치');
  }
  if (profile.residenceRegion && notice.region === profile.residenceRegion) {
    reasons.push('지역 일치');
  }
  if (profile.isHomeless === true) {
    reasons.push('무주택 조건 입력됨');
  }

  if (reasons.length >= 2 && matchingInterestTags(profile, notice).length > 0) {
    return { status: 'likely', label: '지원가능성 높음', reasons };
  }

  return {
    status: 'review',
    label: '조건 확인 필요',
    reasons: reasons.length > 0 ? reasons : ['자동 판정에 필요한 공고 조건 부족'],
  };
};
