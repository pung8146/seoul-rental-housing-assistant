import { readFileSync } from 'node:fs';
const normalizeChatId = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.startsWith('telegram:') ? trimmed.slice('telegram:'.length) : trimmed;
};
const unique = (values) => Array.from(new Set(values));
const parseCsv = (value) => unique((value ?? '')
    .split(',')
    .map(normalizeChatId)
    .filter((item) => Boolean(item)));
const parseMessageThreadId = (value) => {
    const rawValue = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
    if (!rawValue) {
        return undefined;
    }
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};
const readOpenClawConfig = (path) => JSON.parse(readFileSync(path, 'utf8'));
const getOpenClawTelegramConfig = (config) => {
    if (!config || typeof config !== 'object') {
        return null;
    }
    const channels = config.channels;
    const telegram = channels && typeof channels === 'object'
        ? channels.telegram
        : null;
    if (!telegram || typeof telegram !== 'object') {
        return null;
    }
    const botToken = telegram.botToken;
    const messageThreadId = parseMessageThreadId(telegram.messageThreadId ??
        telegram.topicId);
    const allowFrom = telegram.allowFrom;
    const groupAllowFrom = telegram.groupAllowFrom;
    const chatIds = [
        ...(Array.isArray(allowFrom) ? allowFrom : []),
        ...(Array.isArray(groupAllowFrom) ? groupAllowFrom : []),
    ]
        .map(normalizeChatId)
        .filter((item) => Boolean(item));
    if (typeof botToken !== 'string' || botToken.trim().length === 0 || chatIds.length === 0) {
        return null;
    }
    return {
        botToken: botToken.trim(),
        chatIds: unique(chatIds),
        ...(messageThreadId ? { messageThreadId } : {}),
    };
};
export const loadTelegramNotifyConfig = ({ env = process.env, openClawConfigPath, } = {}) => {
    const envToken = env.TELEGRAM_BOT_TOKEN ?? env.OPENCLAW_TELEGRAM_BOT_TOKEN;
    const envChatIds = parseCsv(env.TELEGRAM_CHAT_ID ?? env.TELEGRAM_CHAT_IDS);
    const messageThreadId = parseMessageThreadId(env.TELEGRAM_MESSAGE_THREAD_ID ?? env.TELEGRAM_TOPIC_ID);
    const configPath = openClawConfigPath ?? env.OPENCLAW_CONFIG_PATH ?? '/home/pung8146/.openclaw/openclaw.json';
    let openClawConfig = null;
    try {
        openClawConfig = getOpenClawTelegramConfig(readOpenClawConfig(configPath));
    }
    catch {
        openClawConfig = null;
    }
    if ((envToken || openClawConfig?.botToken) && envChatIds.length > 0) {
        return {
            botToken: envToken ?? openClawConfig.botToken,
            chatIds: envChatIds,
            ...(messageThreadId ? { messageThreadId } : {}),
        };
    }
    return openClawConfig;
};
export const sendTelegramMessage = async ({ botToken, chatId, messageThreadId, text, fetchImpl = fetch, }) => {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        body: JSON.stringify({
            chat_id: chatId,
            disable_web_page_preview: true,
            ...(messageThreadId ? { message_thread_id: messageThreadId } : {}),
            text,
        }),
        headers: {
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`텔레그램 발송 실패: HTTP ${response.status}`);
    }
};
