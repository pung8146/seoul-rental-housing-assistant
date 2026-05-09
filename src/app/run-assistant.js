import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRepository } from '../db/repository.js';
import { createDefaultAdapters, formatCollectResult, runCollect } from './run-collect.js';
import { runQueryText } from './run-query.js';
const isCollectRequest = (input) => /(최신|새로고침|수집|업데이트|갱신)/.test(input);
export const loadAssistantContext = (path) => {
    if (!existsSync(path)) {
        return { notices: [] };
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return {
        notices: Array.isArray(parsed.notices) ? parsed.notices : [],
    };
};
export const saveAssistantContext = (path, context) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`);
};
export const runAssistantText = async ({ repository, adapters, input, context, }) => {
    if (isCollectRequest(input)) {
        const result = await runCollect({ repository, adapters });
        return {
            mode: 'collect',
            text: formatCollectResult(result),
        };
    }
    const result = runQueryText({ repository, input, previousNotices: context?.notices });
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
    }
    finally {
        repository.close();
    }
}
