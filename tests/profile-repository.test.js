import { describe, expect, it } from 'vitest';
import { createRepository } from '../src/db/repository.js';
const profile = {
    birthYear: 1995,
    isHomeless: true,
    residenceRegion: '서울',
    householdSize: 1,
    monthlyIncome: 2500000,
    totalAssets: 50000000,
    vehicleValue: 0,
    interestTags: ['청년', '행복주택'],
};
describe('personal profile repository', () => {
    it('saves and loads the single local personal profile', () => {
        const repository = createRepository(':memory:');
        expect(repository.getPersonalProfile()).toBeNull();
        repository.savePersonalProfile(profile);
        expect(repository.getPersonalProfile()).toEqual(profile);
    });
});
