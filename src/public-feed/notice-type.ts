import type { Notice } from '../types.js';

export type PublicNoticeTypeLabel = '분양' | '임대' | '신혼부부' | '청년';

const noticeText = (notice: Pick<Notice, 'title' | 'targetTags'>): string =>
  [notice.title, ...notice.targetTags].join(' ');

export const detectPublicNoticeTypes = (notice: Pick<Notice, 'title' | 'targetTags'>): PublicNoticeTypeLabel[] => {
  const text = noticeText(notice);
  const labels: PublicNoticeTypeLabel[] = [];

  if (/분양|공공분양|분양주택|사전청약/.test(text)) {
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
