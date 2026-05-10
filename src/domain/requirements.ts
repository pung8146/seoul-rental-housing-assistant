const parseKoreanMoney = (value: string, unit: string): number => {
  const amount = Number(value.replace(/,/g, ''));
  return unit === '만원' ? amount * 10000 : amount;
};

export const extractEligibilityRequirementsFromText = (text: string): Record<string, unknown> | undefined => {
  const requirements: Record<string, unknown> = {};
  const ageMatch = text.match(/만\s*(\d{1,2})세\s*이상\s*만\s*(\d{1,2})세\s*이하/);
  const incomeMatch = text.match(/(?:월평균소득|월소득)\s*([0-9,]+)\s*(원|만원)\s*이하/);
  const assetMatch = text.match(/총자산\s*([0-9,]+)\s*(원|만원)\s*이하/);
  const vehicleMatch = text.match(/자동차(?:가액)?\s*([0-9,]+)\s*(원|만원)\s*이하/);
  const householdExactMatch = text.match(/(\d{1,2})\s*인\s*가구/);
  const householdMaxMatch = text.match(/(\d{1,2})\s*인\s*이하/);
  const residenceRegions = ['서울', '경기'].filter((region) =>
    new RegExp(`${region}(?:특별시|시|도)?\\s*(?:거주|주민|소재)`).test(text),
  );

  if (ageMatch) {
    requirements.minAge = Number(ageMatch[1]);
    requirements.maxAge = Number(ageMatch[2]);
  }
  if (/무주택/.test(text)) {
    requirements.requiresHomeless = true;
  }
  if (incomeMatch) {
    requirements.maxMonthlyIncome = parseKoreanMoney(incomeMatch[1] ?? '0', incomeMatch[2] ?? '원');
  }
  if (assetMatch) {
    requirements.maxTotalAssets = parseKoreanMoney(assetMatch[1] ?? '0', assetMatch[2] ?? '원');
  }
  if (vehicleMatch) {
    requirements.maxVehicleValue = parseKoreanMoney(vehicleMatch[1] ?? '0', vehicleMatch[2] ?? '원');
  }
  if (householdExactMatch) {
    requirements.minHouseholdSize = Number(householdExactMatch[1]);
    requirements.maxHouseholdSize = Number(householdExactMatch[1]);
  } else if (householdMaxMatch) {
    requirements.maxHouseholdSize = Number(householdMaxMatch[1]);
  }
  if (residenceRegions.length > 0) {
    requirements.residenceRegions = residenceRegions;
  }

  return Object.keys(requirements).length > 0 ? requirements : undefined;
};
