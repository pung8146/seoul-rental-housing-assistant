import { createRepository, type Repository } from '../db/repository';
import type { ParsedCommand } from '../commands/parse';
import { formatNoticeDetails, formatNoticeSummaryLine } from '../notifier/formatter';
import type { Notice } from '../types';

type RunQueryInput = {
  repository: Pick<Repository, 'queryNotices' | 'queryListingsByNotice'>;
  command: ParsedCommand;
};

type RunQueryResult = {
  text: string;
  lines: string[];
  notices: Notice[];
};

const MAX_SUMMARY_COUNT = 5;

const selectNotices = (repository: Pick<Repository, 'queryNotices'>, index?: number) => {
  const notices = repository.queryNotices({});
  if (typeof index === 'number') {
    return { notices, selected: notices[index - 1] ?? null };
  }

  return { notices, selected: null };
};

export const runQuery = ({ repository, command }: RunQueryInput): RunQueryResult => {
  if (command.intent === 'list') {
    const notices = repository.queryNotices(command.filters).slice(0, MAX_SUMMARY_COUNT);
    const lines = notices.map((notice, index) => formatNoticeSummaryLine(notice, index + 1));

    return {
      text: lines.join('\n'),
      lines,
      notices,
    };
  }

  const { notices, selected } = selectNotices(repository, command.index);

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

if (require.main === module) {
  const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');

  try {
    const result = runQuery({
      repository,
      command: {
        intent: 'list',
        filters: {},
      },
    });
    console.log(result.text);
  } finally {
    repository.close();
  }
}

export type { RunQueryInput, RunQueryResult };
