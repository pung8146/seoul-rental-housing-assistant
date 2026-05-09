import type { Notice } from '../types.js';

const normalizeTitle = (title: string): string => title.replace(/\s+/g, ' ').trim();

const ACTIONABLE_TITLE_PATTERNS = [/모집\s*공고/, /입주자\s*모집/, /예비입주자\s*모집/, /추가\s*모집/];

const NON_ACTIONABLE_TITLE_PATTERNS = [
  /전산\s*작업/,
  /서비스.*안내/,
  /청약\s*접수\s*결과/,
  /최종\s*청약\s*접수\s*결과/,
  /접수\s*결과/,
  /당첨자/,
  /예비\s*당첨자/,
  /계약\s*안내/,
  /명단/,
];

export const isActionableNoticeTitle = (title: string): boolean => {
  const normalized = normalizeTitle(title);
  if (!normalized) {
    return false;
  }

  if (NON_ACTIONABLE_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return ACTIONABLE_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isActionableNotice = (notice: Pick<Notice, 'title'>): boolean =>
  isActionableNoticeTitle(notice.title);
