import { readFileSync } from 'node:fs';

export type TelegramNotifyConfig = {
  botToken: string;
  chatIds: string[];
  messageThreadId?: number;
};

type FetchLike = typeof fetch;

type SendTelegramMessageInput = {
  botToken: string;
  chatId: string;
  messageThreadId?: number;
  text: string;
  fetchImpl?: FetchLike;
};

const normalizeChatId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith('telegram:') ? trimmed.slice('telegram:'.length) : trimmed;
};

const unique = (values: string[]): string[] => Array.from(new Set(values));

const parseCsv = (value: string | undefined): string[] =>
  unique(
    (value ?? '')
      .split(',')
      .map(normalizeChatId)
      .filter((item): item is string => Boolean(item)),
  );

const parseMessageThreadId = (value: unknown): number | undefined => {
  const rawValue = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const readOpenClawConfig = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const getOpenClawTelegramConfig = (config: unknown): TelegramNotifyConfig | null => {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const channels = (config as { channels?: unknown }).channels;
  const telegram = channels && typeof channels === 'object'
    ? (channels as { telegram?: unknown }).telegram
    : null;
  if (!telegram || typeof telegram !== 'object') {
    return null;
  }

  const botToken = (telegram as { botToken?: unknown }).botToken;
  const messageThreadId = parseMessageThreadId(
    (telegram as { messageThreadId?: unknown; topicId?: unknown }).messageThreadId ??
      (telegram as { messageThreadId?: unknown; topicId?: unknown }).topicId,
  );
  const allowFrom = (telegram as { allowFrom?: unknown }).allowFrom;
  const groupAllowFrom = (telegram as { groupAllowFrom?: unknown }).groupAllowFrom;
  const chatIds = [
    ...(Array.isArray(allowFrom) ? allowFrom : []),
    ...(Array.isArray(groupAllowFrom) ? groupAllowFrom : []),
  ]
    .map(normalizeChatId)
    .filter((item): item is string => Boolean(item));

  if (typeof botToken !== 'string' || botToken.trim().length === 0 || chatIds.length === 0) {
    return null;
  }

  return {
    botToken: botToken.trim(),
    chatIds: unique(chatIds),
    ...(messageThreadId ? { messageThreadId } : {}),
  };
};

export const loadTelegramNotifyConfig = ({
  env = process.env,
  openClawConfigPath,
}: {
  env?: NodeJS.ProcessEnv;
  openClawConfigPath?: string;
} = {}): TelegramNotifyConfig | null => {
  const envToken = env.TELEGRAM_BOT_TOKEN ?? env.OPENCLAW_TELEGRAM_BOT_TOKEN;
  const envChatIds = parseCsv(env.TELEGRAM_CHAT_ID ?? env.TELEGRAM_CHAT_IDS);
  const messageThreadId = parseMessageThreadId(env.TELEGRAM_MESSAGE_THREAD_ID ?? env.TELEGRAM_TOPIC_ID);
  const configPath = openClawConfigPath ?? env.OPENCLAW_CONFIG_PATH ?? '/home/pung8146/.openclaw/openclaw.json';
  let openClawConfig: TelegramNotifyConfig | null = null;

  try {
    openClawConfig = getOpenClawTelegramConfig(readOpenClawConfig(configPath));
  } catch {
    openClawConfig = null;
  }

  if ((envToken || openClawConfig?.botToken) && envChatIds.length > 0) {
    return {
      botToken: envToken ?? openClawConfig!.botToken,
      chatIds: envChatIds,
      ...(messageThreadId ? { messageThreadId } : {}),
    };
  }

  return openClawConfig;
};

export const sendTelegramMessage = async ({
  botToken,
  chatId,
  messageThreadId,
  text,
  fetchImpl = fetch,
}: SendTelegramMessageInput): Promise<void> => {
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
