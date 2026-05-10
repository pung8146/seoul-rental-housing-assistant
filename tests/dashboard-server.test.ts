import { describe, expect, it } from 'vitest';

import { createDashboardServer } from '../src/app/dashboard-server.js';
import { createRepository } from '../src/db/repository.js';
import type { Notice } from '../src/types.js';

const makeNotice = (index: number): Notice => ({
  source: 'lh',
  sourceId: `notice-${index}`,
  title: `서울 청년 임대주택 ${index} 입주자 모집공고`,
  stableKey: `notice:${index}`,
  changeHash: `notice-hash-${index}`,
  status: '공고중',
  region: '서울',
  targetTags: ['청년'],
  postedAt: `2026-05-0${index}`,
  applicationStartAt: null,
  applicationEndAt: null,
  sourceUrl: `https://example.com/notices/${index}`,
  metadata: {},
});

describe('createDashboardServer', () => {
  it('serves dashboard html', async () => {
    const repository = createRepository(':memory:');
    repository.upsertNotice(makeNotice(1));
    const server = createDashboardServer({ repository });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('missing server address');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('임대주택 관리 대시보드');
      expect(html).toContain('서울 청년 임대주택 1 입주자 모집공고');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
