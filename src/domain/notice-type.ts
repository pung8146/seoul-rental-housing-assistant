import type { Notice } from '../types.js';

export type NoticeTypeLabel = '분양' | '임대' | '상가' | '신혼부부' | '청년';

const noticeText = (notice: Pick<Notice, 'title' | 'targetTags'>): string =>
  [notice.title, ...notice.targetTags].join(' ');

export const detectNoticeTypes = (notice: Pick<Notice, 'title' | 'targetTags'>): NoticeTypeLabel[] => {
  const text = noticeText(notice);
  const labels: NoticeTypeLabel[] = [];

  if (/상가임대|임대상가/.test(text)) {
    labels.push('상가');
  } else if (/분양|공공분양|분양주택|사전청약/.test(text)) {
    labels.push('분양');
  } else if (/임대|행복주택|장기전세|전세임대|매입임대|국민임대|공공임대|도시형생활주택|두레주택/.test(text)) {
    labels.push('임대');
  }
  if (/신혼|신혼부부/.test(text)) {
    labels.push('신혼부부');
  }
  if (/청년|대학생/.test(text)) {
    labels.push('청년');
  }

  return labels;
};

export const formatNoticeTypeLabels = (notice: Pick<Notice, 'title' | 'targetTags'>): string =>
  detectNoticeTypes(notice).join(", ");

export const hasNoticeType = (notice: Pick<Notice, 'title' | 'targetTags'>, types: NoticeTypeLabel[]): boolean => {
  if (types.length === 0) {
    return true;
  }

  const labels = detectNoticeTypes(notice);
  return types.every((type) => labels.includes(type));
};

export const formatNoticeCategoryLabel = (notice: Pick<Notice, 'title' | 'targetTags'>): string =>
  detectNoticeTypes(notice).find((label) => label === '분양' || label === '임대' || label === '상가') ?? '';
