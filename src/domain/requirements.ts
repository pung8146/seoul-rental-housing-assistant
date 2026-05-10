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

  return Object.keys(requirements).length > 0 ? requirements : undefined;
};
