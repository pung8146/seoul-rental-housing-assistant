import { createRepository } from '../db/repository.js';
import { parseCommand } from '../commands/parse.js';
import { isActionableNotice } from '../domain/actionable.js';
import { formatNoticeDetails, formatNoticeSummaryLine } from '../notifier/formatter.js';
const MAX_SUMMARY_COUNT = 5;
const selectNotices = (repository, index, previousNotices) => {
    const notices = previousNotices ?? repository.queryNotices({}).filter(isActionableNotice);
    if (typeof index === 'number') {
        return { notices, selected: notices[index - 1] ?? null };
    }
    return { notices, selected: null };
};
export const runQuery = ({ repository, command, previousNotices }) => {
    if (command.intent === 'list') {
        const notices = repository.queryNotices(command.filters).filter(isActionableNotice).slice(0, MAX_SUMMARY_COUNT);
        const lines = notices.map((notice, index) => formatNoticeSummaryLine(notice, index + 1));
        if (lines.length === 0) {
            return {
                text: '조건에 맞는 공고 없음',
                lines: ['조건에 맞는 공고 없음'],
                notices,
            };
        }
        return {
            text: lines.join('\n'),
            lines,
            notices,
        };
    }
    const { notices, selected } = selectNotices(repository, command.index, previousNotices);
    if (!selected) {
        return {
            text: '',
            lines: [],
            notices,
        };
    }
    if (command.intent === 'linkOnly') {
        return {
            text: selected.sourceUrl ?? '',
            lines: selected.sourceUrl ? [selected.sourceUrl] : [],
            notices,
        };
    }
    const listings = repository.queryListingsByNotice(selected.source, selected.sourceId);
    const text = formatNoticeDetails(selected, listings);
    return {
        text,
        lines: text ? text.split('\n') : [],
        notices,
    };
};
export const runQueryText = ({ repository, input, previousNotices }) => runQuery({ repository, command: parseCommand(input), previousNotices });
if (import.meta.url === `file://${process.argv[1]}`) {
    const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
    try {
        const input = process.argv.slice(2).join(' ') || '공고 조회';
        const result = runQueryText({
            repository,
            input,
        });
        console.log(result.text);
    }
    finally {
        repository.close();
    }
}
