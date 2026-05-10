import type { Notice, PersonalProfile } from '../types.js';

export type EligibilityStatus = 'likely' | 'review' | 'not_target' | 'financial_review' | 'missing_profile';

export type EligibilityAssessment = {
  status: EligibilityStatus;
  label: '지원가능성 높음' | '조건 확인 필요' | '대상 아님' | '소득/자산 확인 필요' | '프로필 필요';
  reasons: string[];
};

type EligibilityRequirements = {
  minAge?: number;
  maxAge?: number;
  requiresHomeless?: boolean;
  maxMonthlyIncome?: number;
  maxTotalAssets?: number;
  maxVehicleValue?: number;
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

const getRequirementNumber = (requirements: Record<string, unknown>, key: keyof EligibilityRequirements): number | undefined => {
  const value = requirements[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const getEligibilityRequirements = (notice: Notice): EligibilityRequirements => {
  const raw = notice.metadata.eligibilityRequirements;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const requirements = raw as Record<string, unknown>;
  return {
    minAge: getRequirementNumber(requirements, 'minAge'),
    maxAge: getRequirementNumber(requirements, 'maxAge'),
    requiresHomeless: requirements.requiresHomeless === true ? true : undefined,
    maxMonthlyIncome: getRequirementNumber(requirements, 'maxMonthlyIncome'),
    maxTotalAssets: getRequirementNumber(requirements, 'maxTotalAssets'),
    maxVehicleValue: getRequirementNumber(requirements, 'maxVehicleValue'),
  };
};

const getReferenceYear = (notice: Notice): number => {
  const year = Number((notice.postedAt ?? '').slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : new Date().getFullYear();
};

const hasEligibilityRequirements = (requirements: EligibilityRequirements): boolean =>
  Object.values(requirements).some((value) => value != null);

const assessParsedRequirements = (
  profile: PersonalProfile,
  notice: Notice,
): EligibilityAssessment | null => {
  const requirements = getEligibilityRequirements(notice);
  const notTargetReasons: string[] = [];
  const financialReviewReasons: string[] = [];

  if (profile.birthYear != null && (requirements.minAge != null || requirements.maxAge != null)) {
    const age = getReferenceYear(notice) - profile.birthYear;
    if (requirements.minAge != null && age < requirements.minAge) {
      notTargetReasons.push('나이 조건 미달');
    }
    if (requirements.maxAge != null && age > requirements.maxAge) {
      notTargetReasons.push('나이 조건 초과');
    }
  }

  if (requirements.requiresHomeless && profile.isHomeless !== true) {
    notTargetReasons.push('무주택 조건 미충족');
  }

  if (requirements.maxMonthlyIncome != null) {
    if (profile.monthlyIncome == null) {
      financialReviewReasons.push('소득 입력 필요');
    } else if (profile.monthlyIncome > requirements.maxMonthlyIncome) {
      notTargetReasons.push('소득 기준 초과');
    }
  }
  if (requirements.maxTotalAssets != null) {
    if (profile.totalAssets == null) {
      financialReviewReasons.push('총자산 입력 필요');
    } else if (profile.totalAssets > requirements.maxTotalAssets) {
      notTargetReasons.push('총자산 기준 초과');
    }
  }
  if (requirements.maxVehicleValue != null) {
    if (profile.vehicleValue == null) {
      financialReviewReasons.push('자동차가액 입력 필요');
    } else if (profile.vehicleValue > requirements.maxVehicleValue) {
      notTargetReasons.push('자동차가액 기준 초과');
    }
  }

  if (notTargetReasons.length > 0) {
    return { status: 'not_target', label: '대상 아님', reasons: notTargetReasons };
  }
  if (financialReviewReasons.length > 0) {
    return { status: 'financial_review', label: '소득/자산 확인 필요', reasons: financialReviewReasons };
  }

  return null;
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

  const parsedRequirementAssessment = assessParsedRequirements(profile, notice);
  if (parsedRequirementAssessment) {
    return parsedRequirementAssessment;
  }

  const requirements = getEligibilityRequirements(notice);
  if (!hasEligibilityRequirements(requirements)) {
    return {
      status: 'review',
      label: '조건 확인 필요',
      reasons: ['공고문에서 신청 조건을 찾지 못함', '첨부 PDF 확인 필요'],
    };
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
  if (hasEligibilityRequirements(requirements)) {
    reasons.push('추출 조건 통과');
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
