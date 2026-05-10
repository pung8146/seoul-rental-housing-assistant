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
    };
};
export const loadTelegramNotifyConfig = ({ env = process.env, openClawConfigPath, } = {}) => {
    const envToken = env.TELEGRAM_BOT_TOKEN ?? env.OPENCLAW_TELEGRAM_BOT_TOKEN;
    const envChatIds = parseCsv(env.TELEGRAM_CHAT_ID ?? env.TELEGRAM_CHAT_IDS);
    if (envToken && envChatIds.length > 0) {
        return {
            botToken: envToken,
            chatIds: envChatIds,
        };
    }
    const configPath = openClawConfigPath ?? env.OPENCLAW_CONFIG_PATH ?? '/home/pung8146/.openclaw/openclaw.json';
    try {
        return getOpenClawTelegramConfig(readOpenClawConfig(configPath));
    }
    catch {
        return null;
    }
};
export const sendTelegramMessage = async ({ botToken, chatId, text, fetchImpl = fetch, }) => {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        body: JSON.stringify({
            chat_id: chatId,
            disable_web_page_preview: true,
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
