import { deflateRawSync, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { fetchDocumentTexts } from '../src/domain/document-text.js';

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const makePdf = (text: string): Buffer => {
  const stream = deflateSync(Buffer.from(`BT (${text}) Tj ET`, 'utf8'));
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n'),
    Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),
    stream,
    Buffer.from('\nendstream\nendobj\n%%EOF'),
  ]);
};

const makeZipXml = (fileName: string, xml: string): Buffer => {
  const name = Buffer.from(fileName, 'utf8');
  const compressed = deflateRawSync(Buffer.from(xml, 'utf8'));
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(Buffer.byteLength(xml), 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);

  return Buffer.concat([header, name, compressed]);
};

describe('fetchDocumentTexts', () => {
  it('extracts text from flate-compressed PDF streams before falling back to strings', async () => {
    const result = await fetchDocumentTexts(
      [{ title: '서울 청년 입주자 모집공고문.pdf', url: 'https://example.com/notice.pdf' }],
      async () =>
        new Response(
          toArrayBuffer(
            makePdf(
              '신청자격 만 19세 이상 만 39세 이하 무주택자 월평균소득 3,589,957원 이하 총자산 34,500만원 이하',
            ),
          ),
        ),
    );

    expect(result.failures).toEqual([]);
    expect(result.results).toMatchObject([
      {
        method: 'pdf',
        text: expect.stringContaining('월평균소득 3,589,957원 이하'),
      },
    ]);
  });

  it('extracts text from HWPX zip XML documents', async () => {
    const result = await fetchDocumentTexts(
      [{ title: '서울 청년 입주자 모집공고문.hwpx', url: 'https://example.com/notice.hwpx' }],
      async () =>
        new Response(
          toArrayBuffer(
            makeZipXml(
              'Contents/section0.xml',
              '<root><p>신청자격 만 19세 이상 만 39세 이하 무주택자 월평균소득 3,589,957원 이하 총자산 34,500만원 이하</p></root>',
            ),
          ),
        ),
    );

    expect(result.failures).toEqual([]);
    expect(result.results).toMatchObject([
      {
        method: 'zip-xml',
        text: expect.stringContaining('신청자격 만 19세 이상'),
      },
    ]);
  });
});
