import { createRepository } from '../db/repository.js';
import { createDefaultAdapters, formatCollectResult, runCollect } from './run-collect.js';
import { runQueryText } from './run-query.js';
const isCollectRequest = (input) => /(최신|새로고침|수집|업데이트|갱신)/.test(input);
export const runAssistantText = async ({ repository, adapters, input, }) => {
    if (isCollectRequest(input)) {
        const result = await runCollect({ repository, adapters });
        return {
            mode: 'collect',
            text: formatCollectResult(result),
        };
    }
    const result = runQueryText({ repository, input });
    return {
        mode: 'query',
        text: result.text,
    };
};
if (import.meta.url === `file://${process.argv[1]}`) {
    const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
    try {
        const input = process.argv.slice(2).join(' ') || '공고 조회';
        const result = await runAssistantText({
            repository,
            adapters: createDefaultAdapters(),
            input,
        });
        console.log(result.text);
    }
    finally {
        repository.close();
    }
}
