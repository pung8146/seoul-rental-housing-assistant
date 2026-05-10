import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadTelegramNotifyConfig, sendTelegramMessage } from '../src/notifier/telegram.js';
import { buildNotificationPayloadHash } from '../src/app/run-collect-and-notify.js';

describe('loadTelegramNotifyConfig', () => {
  it('prefers explicit environment variables', () => {
    const config = loadTelegramNotifyConfig({
      env: {
        TELEGRAM_BOT_TOKEN: 'token-from-env',
        TELEGRAM_CHAT_IDS: 'telegram:123,456',
      },
      openClawConfigPath: '/missing/openclaw.json',
    });

    expect(config).toEqual({
      botToken: 'token-from-env',
      chatIds: ['123', '456'],
    });
  });

  it('falls back to OpenClaw telegram config without exposing secrets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'openclaw-config-'));
    const configPath = join(directory, 'openclaw.json');

    try {
      writeFileSync(
        configPath,
        JSON.stringify({
          channels: {
            telegram: {
              botToken: 'token-from-openclaw',
              allowFrom: ['telegram:123'],
              groupAllowFrom: ['telegram:456', 'telegram:123'],
            },
          },
        }),
      );

      expect(loadTelegramNotifyConfig({ env: {}, openClawConfigPath: configPath })).toEqual({
        botToken: 'token-from-openclaw',
        chatIds: ['123', '456'],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('sendTelegramMessage', () => {
  it('sends text through Telegram sendMessage API', async () => {
    const calls: unknown[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([url.toString(), init]);
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await sendTelegramMessage({
      botToken: 'token',
      chatId: '123',
      text: '새 공고',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      'https://api.telegram.org/bottoken/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: '123',
          disable_web_page_preview: true,
          text: '새 공고',
        }),
      }),
    ]);
  });
});

describe('buildNotificationPayloadHash', () => {
  it('builds stable hashes for duplicate notification suppression', () => {
    expect(buildNotificationPayloadHash('새 공고')).toBe(buildNotificationPayloadHash('새 공고'));
    expect(buildNotificationPayloadHash('새 공고')).not.toBe(buildNotificationPayloadHash('다른 공고'));
  });
});
