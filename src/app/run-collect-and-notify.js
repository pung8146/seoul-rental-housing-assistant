import { createRepository } from '../db/repository.js';
import { loadTelegramNotifyConfig, sendTelegramMessage } from '../notifier/telegram.js';
import { createDefaultAdapters, formatCollectResult, runCollect } from './run-collect.js';
const NO_CHANGE_MESSAGE = '새 공고/변경 없음';
const shouldNotify = (message, alwaysNotify) => alwaysNotify || message.trim() !== NO_CHANGE_MESSAGE;
const main = async () => {
    const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
    const dryRun = process.argv.includes('--dry-run');
    const alwaysNotify = process.argv.includes('--always-notify');
    try {
        const result = await runCollect({ adapters: createDefaultAdapters(), repository });
        const message = formatCollectResult(result);
        console.log(message);
        if (!shouldNotify(message, alwaysNotify)) {
            return;
        }
        const config = loadTelegramNotifyConfig();
        if (!config) {
            console.error('텔레그램 알림 설정을 찾지 못했습니다. TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 또는 OpenClaw 설정을 확인하세요.');
            process.exitCode = 1;
            return;
        }
        if (dryRun) {
            console.log(`텔레그램 알림 dry-run: ${config.chatIds.length}개 대상`);
            return;
        }
        for (const chatId of config.chatIds) {
            await sendTelegramMessage({
                botToken: config.botToken,
                chatId,
                text: message,
            });
        }
        console.log(`텔레그램 알림 발송 완료: ${config.chatIds.length}개 대상`);
    }
    finally {
        repository.close();
    }
};
if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
