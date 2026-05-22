import { createHash } from 'node:crypto';
import { createRepository } from '../db/repository.js';
import { groupNotificationEvents } from '../domain/notification-policy.js';
import { loadTelegramNotifyConfig, sendTelegramMessage } from '../notifier/telegram.js';
import { formatPrioritizedDailySummary } from '../notifier/formatter.js';
import { createDefaultAdapters, runCollect } from './run-collect.js';
const NO_CHANGE_MESSAGE = '새 공고/변경 없음';
const shouldNotify = (message, alwaysNotify) => alwaysNotify || message.trim() !== NO_CHANGE_MESSAGE;
const getNotificationPolicy = () => process.argv.includes('--notify-all') || process.env.RENTAL_HOUSING_NOTIFY_POLICY === 'all' ? 'all' : 'actionable';
export const buildNotificationPayloadHash = (message) => createHash('sha256').update(message).digest('hex');
const main = async () => {
    const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
    const dryRun = process.argv.includes('--dry-run');
    const alwaysNotify = process.argv.includes('--always-notify');
    const forceNotify = process.argv.includes('--force-notify');
    try {
        const result = await runCollect({ adapters: createDefaultAdapters(), repository });
        const policy = getNotificationPolicy();
        const groups = groupNotificationEvents({
            events: result.events,
            failures: result.failures,
            profile: repository.getPersonalProfile(),
            policy,
        });
        const message = formatPrioritizedDailySummary(groups, result.failures) || NO_CHANGE_MESSAGE;
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
        const payloadHash = buildNotificationPayloadHash(message);
        const targetKey = (chatId) => config.messageThreadId ? `telegram:${chatId}:${config.messageThreadId}` : `telegram:${chatId}`;
        const targetChatIds = forceNotify
            ? config.chatIds
            : config.chatIds.filter((chatId) => !repository.hasNotification(targetKey(chatId), payloadHash));
        if (targetChatIds.length === 0) {
            console.log('텔레그램 알림 생략: 이미 발송한 내용입니다.');
            return;
        }
        for (const chatId of targetChatIds) {
            await sendTelegramMessage({
                botToken: config.botToken,
                chatId,
                messageThreadId: config.messageThreadId,
                text: message,
            });
            repository.recordNotification(targetKey(chatId), payloadHash, new Date().toISOString());
        }
        console.log(`텔레그램 알림 발송 완료: ${targetChatIds.length}개 대상`);
    }
    finally {
        repository.close();
    }
};
if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
