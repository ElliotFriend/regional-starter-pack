import { describe, it, expect } from 'vitest';
import {
    MANTECA_REGIONS,
    getMantecaFlowRegion,
    CO_BANKS,
    CO_ACCOUNT_TYPES,
} from '$lib/config/manteca-regions';

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

describe('destination kind + Colombia bank list', () => {
    it('marks BR/AR as key destinations and CO as a bank destination', () => {
        expect(MANTECA_REGIONS.brazil.destinationKind).toBe('key');
        expect(MANTECA_REGIONS.argentina.destinationKind).toBe('key');
        expect(MANTECA_REGIONS.colombia.destinationKind).toBe('bank');
    });

    it('exposes the Colombian bank codes (incl. Bancolombia 1007) + account types', () => {
        const codes = CO_BANKS.map((b) => b.code);
        expect(codes).toContain('1007');
        expect(CO_BANKS.find((b) => b.code === '1007')?.name).toBe('Bancolombia');
        expect(CO_BANKS.length).toBe(16);
        expect(CO_ACCOUNT_TYPES).toEqual(['SAVINGS', 'CHECKING']);
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
