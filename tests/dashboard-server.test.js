import { describe, expect, it } from 'vitest';
import { createDashboardServer } from '../src/app/dashboard-server.js';
import { createRepository } from '../src/db/repository.js';
const makeNotice = (index) => ({
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
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
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
        }
        finally {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
    it('applies dashboard type filters from query parameters', async () => {
        const repository = createRepository(':memory:');
        repository.upsertNotice(makeNotice(1));
        repository.upsertNotice({
            ...makeNotice(2),
            title: '남양주왕숙2 A-3BL 공공분양주택 입주자모집공고',
            targetTags: ['분양', '신혼부부'],
        });
        const server = createDashboardServer({ repository });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('missing server address');
        }
        try {
            const response = await fetch(`http://127.0.0.1:${address.port}/?type=sale`);
            const html = await response.text();
            expect(response.status).toBe(200);
            expect(html).toContain('공공분양주택 입주자모집공고');
            expect(html).not.toContain('서울 청년 임대주택 1 입주자 모집공고');
            expect(html).toContain('<a class="active" href="/?type=sale">');
        }
        finally {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
    it('saves a personal profile from the dashboard form', async () => {
        const repository = createRepository(':memory:');
        const server = createDashboardServer({ repository });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('missing server address');
        }
        try {
            const response = await fetch(`http://127.0.0.1:${address.port}/profile`, {
                method: 'POST',
                body: new URLSearchParams({
                    birthYear: '1995',
                    isHomeless: 'true',
                    residenceRegion: '서울',
                    householdSize: '1',
                    monthlyIncome: '2500000',
                    totalAssets: '50000000',
                    vehicleValue: '0',
                    subscriptionAccountMonths: '36',
                    subscriptionPaymentCount: '24',
                    interestTags: '청년, 행복주택',
                    returnTo: '/?type=sale',
                }),
                redirect: 'manual',
            });
            expect(response.status).toBe(303);
            expect(response.headers.get('location')).toBe('/?type=sale');
            expect(repository.getPersonalProfile()).toEqual({
                birthYear: 1995,
                isHomeless: true,
                residenceRegion: '서울',
                householdSize: 1,
                monthlyIncome: 2500000,
                totalAssets: 50000000,
                vehicleValue: 0,
                subscriptionAccountMonths: 36,
                subscriptionPaymentCount: 24,
                interestTags: ['청년', '행복주택'],
            });
        }
        finally {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
    it('falls back to home after profile save when return path is unsafe', async () => {
        const repository = createRepository(':memory:');
        const server = createDashboardServer({ repository });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('missing server address');
        }
        try {
            const response = await fetch(`http://127.0.0.1:${address.port}/profile`, {
                method: 'POST',
                body: new URLSearchParams({
                    interestTags: '청년',
                    returnTo: '//example.com/steal',
                }),
                redirect: 'manual',
            });
            expect(response.status).toBe(303);
            expect(response.headers.get('location')).toBe('/');
        }
        finally {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
