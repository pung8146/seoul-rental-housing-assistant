import { describe, expect, it } from 'vitest';
import { buildChangeHash, buildStableKey } from '../src/domain/keys.js';
const makeListing = (overrides = {}) => ({
    source: 'lh',
    noticeSourceId: 'notice-1',
    title: '  행복주택 101동 201호  ',
    stableKey: 'unused-stable-key',
    changeHash: 'unused-change-hash',
    supplyType: '행복주택',
    region: '서울',
    targetTags: ['청년', '신혼부부'],
    deposit: 10000000,
    monthlyRent: 250000,
    floorAreaM2: 39.8,
    status: 'available',
    metadata: {
        building: '101동',
        unit: '201호',
    },
    ...overrides,
});
describe('listing key builders', () => {
    it('returns the same stable key for the same listing identity', () => {
        const first = makeListing();
        const second = makeListing({
            stableKey: 'different-placeholder',
            changeHash: 'different-placeholder',
        });
        expect(buildStableKey(first)).toBe(buildStableKey(second));
    });
    it('keeps stable key but changes change hash when rent, deposit, or status change', () => {
        const base = makeListing();
        const changed = makeListing({
            deposit: 12000000,
            monthlyRent: 270000,
            status: 'closed',
        });
        expect(buildStableKey(base)).toBe(buildStableKey(changed));
        expect(buildChangeHash(base)).not.toBe(buildChangeHash(changed));
    });
    it('uses floor area to distinguish repeated housing types in one notice', () => {
        const smallUnit = makeListing({
            title: '국민임대 29A',
            supplyType: '29A',
            floorAreaM2: 29.5,
            metadata: {},
        });
        const largeUnit = makeListing({
            title: '국민임대 29A',
            supplyType: '29A',
            floorAreaM2: 29.85,
            metadata: {},
        });
        expect(buildStableKey(smallUnit)).not.toBe(buildStableKey(largeUnit));
    });
    it('ignores whitespace-only label changes when building the stable key', () => {
        const first = makeListing({
            title: '행복주택   101동   201호',
            supplyType: ' 행복주택 ',
            region: '  서울 ',
            metadata: {
                building: ' 101동 ',
                unit: '201호',
            },
        });
        const second = makeListing({
            title: '  행복주택 101동 201호  ',
            supplyType: '행복주택',
            region: '서울',
            metadata: {
                building: '101동',
                unit: '  201호  ',
            },
        });
        expect(buildStableKey(first)).toBe(buildStableKey(second));
    });
});
