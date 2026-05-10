const normalizeTitle = (title) => title.replace(/\s+/g, ' ').trim();
const ACTIONABLE_TITLE_PATTERNS = [/모집\s*공고/, /입주자\s*모집/, /예비입주자\s*모집/, /추가\s*모집/];
const SERVICE_NOTICE_PATTERNS = [/전산\s*작업/, /서비스.*안내/];
const APPLICATION_RESULT_PATTERNS = [
    /청약\s*접수\s*결과/,
    /최종\s*청약\s*접수\s*결과/,
    /접수\s*결과/,
    /당첨자/,
    /예비\s*당첨자/,
    /계약\s*안내/,
    /명단/,
];
export const getNoticeExclusionReason = (notice) => {
    const normalized = normalizeTitle(notice.title);
    if (!normalized) {
        return 'not_recruitment';
    }
    if (SERVICE_NOTICE_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return 'service_notice';
    }
    if (APPLICATION_RESULT_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return 'application_result';
    }
    if (!ACTIONABLE_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return 'not_recruitment';
    }
    return null;
};
export const isActionableNoticeTitle = (title) => getNoticeExclusionReason({ title }) === null;
export const isActionableNotice = (notice) => getNoticeExclusionReason(notice) === null;
