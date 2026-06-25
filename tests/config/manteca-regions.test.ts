import { describe, it, expect } from 'vitest';
import { MANTECA_REGIONS, getMantecaFlowRegion } from '$lib/config/manteca-regions';

describe('MANTECA_REGIONS', () => {
    it('covers brazil, argentina, colombia with the right exchange + currency', () => {
        expect(Object.keys(MANTECA_REGIONS).sort()).toEqual(['argentina', 'brazil', 'colombia']);
        expect(MANTECA_REGIONS.brazil.exchange).toBe('BRAZIL');
        expect(MANTECA_REGIONS.brazil.currency).toBe('BRL');
        expect(MANTECA_REGIONS.argentina.exchange).toBe('ARGENTINA');
        expect(MANTECA_REGIONS.argentina.currency).toBe('ARS');
        expect(MANTECA_REGIONS.colombia.exchange).toBe('COLOMBIA');
        expect(MANTECA_REGIONS.colombia.currency).toBe('COP');
    });

    it('every region has the presentation fields the flow pages need', () => {
        for (const r of Object.values(MANTECA_REGIONS)) {
            expect(r.railLabel).toBeTruthy();
            expect(r.legalIdLabel).toBeTruthy();
            expect(r.currencySymbol).toBeTruthy();
            expect(r.destinationLabel).toBeTruthy();
        }
    });
});

describe('getMantecaFlowRegion', () => {
    it('defaults to brazil for null/unknown', () => {
        expect(getMantecaFlowRegion(null).id).toBe('brazil');
        expect(getMantecaFlowRegion('nope').id).toBe('brazil');
    });

    it('resolves argentina + colombia', () => {
        expect(getMantecaFlowRegion('argentina').id).toBe('argentina');
        expect(getMantecaFlowRegion('colombia').id).toBe('colombia');
    });
});
