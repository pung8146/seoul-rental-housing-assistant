import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { type SourceAdapter } from '../adapters/base.js';
import { createRepository, type Repository } from '../db/repository.js';
import { createDefaultAdapters, formatCollectResult, runCollect } from './run-collect.js';
import { runQueryText } from './run-query.js';
import type { Notice, SourceRun } from '../types.js';

type AssistantContext = {
  notices: Notice[];
};

type RunAssistantTextInput = {
  repository: Repository;
  adapters: SourceAdapter[];
  input: string;
  context?: AssistantContext;
};

type RunAssistantTextResult = {
  mode: 'collect' | 'query' | 'status';
  text: string;
};

const isStatusRequest = (input: string): boolean =>
  /(수집|알림|봇|텔레그램|운영).*(상태|확인)|상태s*확인/.test(input);

const isCollectRequest = (input: string): boolean =>
  /(최신|새로고침|수집|업데이트|갱신)/.test(input);

const statusLabel = (status: SourceRun['status']): string => {
  if (status === 'success') {
    return '성공';
  }
  if (status === 'partial') {
    return '부분성공';
  }
  return '실패';
};

const latestSourceRuns = (runs: SourceRun[]): SourceRun[] =>
  Array.from(
    runs
      .reduce((bySource, run) => {
        const previous = bySource.get(run.source);
        if (!previous || run.finishedAt > previous.finishedAt) {
          bySource.set(run.source, run);
        }
        return bySource;
      }, new Map<string, SourceRun>())
      .values(),
  ).sort((left, right) => left.source.localeCompare(right.source));

const formatOperationStatus = (repository: Pick<Repository, 'listSourceRuns' | 'listNotificationHistory'>): string => {
  const sourceRuns = latestSourceRuns(repository.listSourceRuns());
  const notificationHistory = repository.listNotificationHistory();
  const lastCollectedAt = sourceRuns
    .map((run) => run.finishedAt)
    .sort()
    .at(-1);
  const successCount = sourceRuns.filter((run) => run.status === 'success').length;
  const partialCount = sourceRuns.filter((run) => run.status === 'partial').length;
  const failureCount = sourceRuns.filter((run) => run.status === 'failure').length;
  const summary = [`성공 ${successCount}개`];
  if (partialCount > 0) {
    summary.push(`부분성공 ${partialCount}개`);
  }
  summary.push(`실패 ${failureCount}개`);

  const lines = [
    '수집 상태',
    `마지막 수집: ${lastCollectedAt ?? '기록 없음'}`,
    `기관 상태: ${summary.join(', ')}`,
    ...sourceRuns.map((run) =>
      `${run.source}: ${statusLabel(run.status)}${run.message ? ` - ${run.message}` : ''}`,
    ),
    `마지막 텔레그램 알림: ${notificationHistory[0]?.sentAt ?? '기록 없음'}`,
  ];

  return lines.join('\n');
};

const isEmptyListResult = (text: string): boolean => text === '조건에 맞는 공고 없음';

export const loadAssistantContext = (path: string): AssistantContext => {
  if (!existsSync(path)) {
    return { notices: [] };
  }

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AssistantContext>;
  return {
    notices: Array.isArray(parsed.notices) ? parsed.notices : [],
  };
};

export const saveAssistantContext = (path: string, context: AssistantContext): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`);
};

export const runAssistantText = async ({
  repository,
  adapters,
  input,
  context,
}: RunAssistantTextInput): Promise<RunAssistantTextResult> => {
  if (isStatusRequest(input)) {
    return {
      mode: 'status',
      text: formatOperationStatus(repository),
    };
  }

  if (isCollectRequest(input)) {
    const result = await runCollect({ repository, adapters });

    return {
      mode: 'collect',
      text: formatCollectResult(result),
    };
  }

  let result = runQueryText({ repository, input, previousNotices: context?.notices });
  if (isEmptyListResult(result.text) && repository.queryNotices({}).length === 0 && adapters.length > 0) {
    await runCollect({ repository, adapters });
    result = runQueryText({ repository, input, previousNotices: context?.notices });
  }
  if (context) {
    context.notices = result.notices;
  }

  return {
    mode: 'query',
    text: result.text,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
  const contextPath = process.env.RENTAL_HOUSING_CONTEXT_PATH ?? '.rental-housing-context.json';
  const context = loadAssistantContext(contextPath);

  try {
    const input = process.argv.slice(2).join(' ') || '공고 조회';
    const result = await runAssistantText({
      repository,
      adapters: createDefaultAdapters(),
      input,
      context,
    });

    saveAssistantContext(contextPath, context);
    console.log(result.text);
  } finally {
    repository.close();
  }
}

export type { RunAssistantTextInput, RunAssistantTextResult };
