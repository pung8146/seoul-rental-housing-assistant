import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Attachment } from './attachments.js';

const execFileAsync = promisify(execFile);

export type DocumentTextResult = {
  attachment: Attachment;
  text: string;
  method: 'plain' | 'strings';
};

export type DocumentTextFailure = {
  attachment: Attachment;
  message: string;
};

export type FetchDocumentTextResult = {
  results: DocumentTextResult[];
  failures: DocumentTextFailure[];
};

const TEXT_EXTENSIONS = /\.(txt|html|htm|csv)$/i;

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const isUsefulText = (value: string): boolean => /[가-힣]/.test(value) && value.length >= 20;

const titleExtension = (attachment: Attachment): string => attachment.title.split('.').pop()?.toLowerCase() ?? '';

const extractWithStrings = async (buffer: Buffer): Promise<string | null> => {
  const directory = await mkdtemp(join(tmpdir(), 'rha-doc-'));
  const filePath = join(directory, 'attachment.bin');

  try {
    await writeFile(filePath, buffer);
    const { stdout } = await execFileAsync('strings', ['-n', '4', filePath], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 5000,
    });
    const text = normalizeText(stdout);
    return isUsefulText(text) ? text : null;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const extractText = async (attachment: Attachment, buffer: Buffer): Promise<DocumentTextResult | null> => {
  const extension = titleExtension(attachment);

  if (TEXT_EXTENSIONS.test(attachment.title)) {
    const text = normalizeText(buffer.toString('utf8'));
    return isUsefulText(text) ? { attachment, text, method: 'plain' } : null;
  }

  if (['pdf', 'hwp', 'hwpx', 'doc', 'docx'].includes(extension)) {
    const text = await extractWithStrings(buffer);
    return text ? { attachment, text, method: 'strings' } : null;
  }

  return null;
};

export const fetchDocumentTexts = async (
  attachments: Attachment[],
  fetchImpl: typeof fetch = fetch,
): Promise<FetchDocumentTextResult> => {
  const results: DocumentTextResult[] = [];
  const failures: DocumentTextFailure[] = [];

  for (const attachment of attachments) {
    try {
      const response = await fetchImpl(attachment.url);
      if (!response.ok) {
        failures.push({ attachment, message: `HTTP ${response.status}` });
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const result = await extractText(attachment, buffer);
      if (result) {
        results.push(result);
      } else {
        failures.push({ attachment, message: '본문 텍스트를 추출하지 못함' });
      }
    } catch (error) {
      failures.push({
        attachment,
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return { results, failures };
};

