import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inflateRawSync, inflateSync } from 'node:zlib';
const execFileAsync = promisify(execFile);
const TEXT_EXTENSIONS = /\.(txt|html|htm|csv)$/i;
const normalizeText = (value) => value.replace(/\s+/g, ' ').trim();
const isUsefulText = (value) => /[가-힣]/.test(value) && value.length >= 20;
const titleExtension = (attachment) => attachment.title.split('.').pop()?.toLowerCase() ?? '';
const decodeXmlEntities = (value) => value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
const stripXml = (value) => decodeXmlEntities(value.replace(/<[^>]+>/g, ' '));
const decodePdfLiteral = (value) => value
    .replace(/\\([nrtbf()\\])/g, (_, escaped) => {
    const replacements = {
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        '(': '(',
        ')': ')',
        '\\': '\\',
    };
    return replacements[escaped] ?? escaped;
})
    .replace(/\\(\d{1,3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
const decodePdfHex = (value) => {
    const cleaned = value.replace(/\s+/g, '');
    if (cleaned.length < 2 || cleaned.length % 2 !== 0) {
        return '';
    }
    const buffer = Buffer.from(cleaned, 'hex');
    const decodeUtf16Be = (input) => {
        const swapped = Buffer.alloc(input.length);
        for (let index = 0; index < input.length; index += 2) {
            swapped[index] = input[index + 1] ?? 0;
            swapped[index + 1] = input[index] ?? 0;
        }
        return swapped.toString('utf16le');
    };
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return decodeUtf16Be(buffer.subarray(2));
    }
    const hasUtf16Pattern = buffer.length > 3 && buffer.filter((byte, index) => index % 2 === 0 && byte === 0).length > buffer.length / 4;
    if (hasUtf16Pattern) {
        return decodeUtf16Be(buffer);
    }
    return buffer.toString('utf8');
};
const extractPdfStrings = (content) => {
    const literals = Array.from(content.matchAll(/\((?:\\.|[^\\)])*\)/g)).map((match) => decodePdfLiteral((match[0] ?? '').slice(1, -1)));
    const hexStrings = Array.from(content.matchAll(/<([0-9a-fA-F\s]{4,})>/g)).map((match) => decodePdfHex(match[1] ?? ''));
    return normalizeText([...literals, ...hexStrings].join(' '));
};
const extractPdfText = (buffer) => {
    const raw = buffer.toString('latin1');
    if (!raw.startsWith('%PDF')) {
        return null;
    }
    const chunks = [];
    const streamPattern = /(<<[\s\S]*?>>)\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
    for (const match of raw.matchAll(streamPattern)) {
        const dictionary = match[1] ?? '';
        const stream = Buffer.from(match[2] ?? '', 'latin1');
        let contentBuffer = stream;
        if (dictionary.includes('/FlateDecode')) {
            try {
                contentBuffer = inflateSync(stream);
            }
            catch {
                continue;
            }
        }
        const contentText = extractPdfStrings(contentBuffer.toString('utf8'));
        if (contentText) {
            chunks.push(contentText);
        }
    }
    const text = normalizeText(chunks.join(' '));
    return isUsefulText(text) ? text : null;
};
const extractZipXmlText = (buffer) => {
    const chunks = [];
    let offset = 0;
    while (offset + 30 <= buffer.length) {
        if (buffer.readUInt32LE(offset) !== 0x04034b50) {
            offset += 1;
            continue;
        }
        const compressionMethod = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        const fileNameStart = offset + 30;
        const dataStart = fileNameStart + fileNameLength + extraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buffer.length) {
            break;
        }
        const fileName = buffer.subarray(fileNameStart, fileNameStart + fileNameLength).toString('utf8');
        const compressedData = buffer.subarray(dataStart, dataEnd);
        offset = dataEnd;
        if (!fileName.endsWith('.xml')) {
            continue;
        }
        try {
            const content = compressionMethod === 0
                ? compressedData
                : compressionMethod === 8
                    ? inflateRawSync(compressedData)
                    : null;
            if (!content) {
                continue;
            }
            chunks.push(stripXml(content.toString('utf8')));
        }
        catch {
            continue;
        }
    }
    const text = normalizeText(chunks.join(' '));
    return isUsefulText(text) ? text : null;
};
const extractWithStrings = async (buffer) => {
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
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
};
const extractText = async (attachment, buffer) => {
    const extension = titleExtension(attachment);
    if (TEXT_EXTENSIONS.test(attachment.title)) {
        const text = normalizeText(buffer.toString('utf8'));
        return isUsefulText(text) ? { attachment, text, method: 'plain' } : null;
    }
    if (extension === 'pdf') {
        const text = extractPdfText(buffer);
        if (text) {
            return { attachment, text, method: 'pdf' };
        }
    }
    if (['hwpx', 'docx'].includes(extension)) {
        const text = extractZipXmlText(buffer);
        if (text) {
            return { attachment, text, method: 'zip-xml' };
        }
    }
    if (['pdf', 'hwp', 'hwpx', 'doc', 'docx'].includes(extension)) {
        const text = await extractWithStrings(buffer);
        return text ? { attachment, text, method: 'strings' } : null;
    }
    return null;
};
export const fetchDocumentTexts = async (attachments, fetchImpl = fetch) => {
    const results = [];
    const failures = [];
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
            }
            else {
                failures.push({ attachment, message: '본문 텍스트를 추출하지 못함' });
            }
        }
        catch (error) {
            failures.push({
                attachment,
                message: error instanceof Error ? error.message : 'unknown error',
            });
        }
    }
    return { results, failures };
};
