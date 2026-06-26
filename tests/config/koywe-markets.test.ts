import { describe, it, expect } from 'vitest';
import {
    KOYWE_MARKETS,
    getKoyweMarket,
    koyweMarketRegionIds,
    DEFAULT_KOYWE_REGION,
} from '$lib/config/koyweMarkets';

describe('KOYWE_MARKETS', () => {
    it('covers argentina, mexico, colombia', () => {
        expect(koyweMarketRegionIds().sort()).toEqual(['argentina', 'colombia', 'mexico']);
    });

    it('defaults to argentina', () => {
        expect(DEFAULT_KOYWE_REGION).toBe('argentina');
        expect(getKoyweMarket(DEFAULT_KOYWE_REGION)).toBeDefined();
    });

    it('maps each market to a Koywe ISO-3 country code and fiat currency', () => {
        expect(getKoyweMarket('mexico')).toMatchObject({ currency: 'MXN', countryCode: 'MEX' });
        expect(getKoyweMarket('colombia')).toMatchObject({ currency: 'COP', countryCode: 'COL' });
        expect(getKoyweMarket('argentina')).toMatchObject({ currency: 'ARS', countryCode: 'ARG' });
    });

    it('uses wire-enum-safe document types', () => {
        expect(getKoyweMarket('mexico')?.documentType).toBe('RFC');
        expect(getKoyweMarket('colombia')?.documentType).toBe('CED_CIU');
        expect(getKoyweMarket('argentina')?.documentType).toBe('DNI');
    });

    it('marks all three markets as off-ramp capable (MEX/COL/ARG)', () => {
        expect(getKoyweMarket('mexico')?.offRamp).toBe(true);
        expect(getKoyweMarket('colombia')?.offRamp).toBe(true);
    });

    it('gives Colombia a checking/savings account type and Mexico a CLABE label', () => {
        expect(getKoyweMarket('colombia')?.accountType).toBe('savings');
        expect(getKoyweMarket('mexico')?.accountLabel).toBe('CLABE');
    });

    it('returns undefined for an unknown region', () => {
        expect(getKoyweMarket('chile')).toBeUndefined();
    });
});
