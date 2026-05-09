import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { type SourceAdapter } from '../adapters/base.js';
import { createRepository, type Repository } from '../db/repository.js';
import { createDefaultAdapters, formatCollectResult, runCollect } from './run-collect.js';
import { runQueryText } from './run-query.js';
import type { Notice } from '../types.js';

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
  mode: 'collect' | 'query';
  text: string;
};

const isCollectRequest = (input: string): boolean =>
  /(최신|새로고침|수집|업데이트|갱신)/.test(input);

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
