/**
 * Per-region presentation + onboarding metadata for the Manteca flow pages.
 *
 * The flow pages read `?region=` and derive everything (currency, rail labels,
 * legal-ID field, payout destination label, and the Manteca `exchange`/`country`
 * to pass through) from this one table — mirroring the Etherfuse region pattern.
 *
 * NOTE: Argentina + Colombia values are wired from docs; the deposit-instruction
 * and destination wire shapes are not yet sandbox-verified (see
 * docs/manteca-multiregion-plan.md, Phase 4). Brazil is the verified default.
 */

import type { MantecaExchange } from '$lib/anchors/manteca';

export interface MantecaFlowRegion {
    id: string;
    /** Manteca exchange/country passed to onboarding + withdraw-destination. */
    exchange: MantecaExchange;
    /** Fiat currency code used as the ramp `against`. */
    currency: string;
    currencySymbol: string;
    /** Human label for the local rail (on-ramp deposit + copy). */
    railLabel: string;
    /** Legal-ID field label + placeholder for the KYC form. */
    legalIdLabel: string;
    legalIdPlaceholder: string;
    /** Default nationality prefilled by "Fill test data". */
    nationalityDefault: string;
    /** Off-ramp payout destination label + placeholder. */
    destinationLabel: string;
    destinationPlaceholder: string;
    /**
     * Off-ramp destination shape: `'key'` = a single string (PIX key / CVU /
     * alias, resolved via withdraw-destination); `'bank'` = a structured bank
     * account (Colombia: account number + bankCode + accountType).
     */
    destinationKind: 'key' | 'bank';
    /** Sandbox test legal ID for "Fill test data" (empty where unknown). */
    testLegalId: string;
}

/** Colombian banks accepted by Manteca's off-ramp (ACH `1000+`-style codes). */
export const CO_BANKS: { code: string; name?: string }[] = [
    { code: '1007', name: 'Bancolombia' },
    { code: '1001', name: 'Banco de Bogotá' },
    { code: '1002', name: 'Banco Popular' },
    { code: '1013', name: 'BBVA Colombia' },
    { code: '1019', name: 'Scotiabank Colpatria' },
    { code: '1032', name: 'Banco Caja Social' },
    { code: '1051', name: 'Davivienda' },
    { code: '1052', name: 'Banco AV Villas' },
    { code: '1062', name: 'Banco Falabella' },
    { code: '1507', name: 'Nequi' },
    { code: '1551', name: 'Daviplata' },
    // Codes Manteca accepts but whose names aren't confidently mapped yet.
    { code: '1070' },
    { code: '1292' },
    { code: '1801' },
    { code: '1804' },
    { code: '1809' },
];

/** Colombian account types accepted by the off-ramp. */
export const CO_ACCOUNT_TYPES = ['SAVINGS', 'CHECKING'] as const;

export const MANTECA_REGIONS: Record<string, MantecaFlowRegion> = {
    brazil: {
        id: 'brazil',
        exchange: 'BRAZIL',
        currency: 'BRL',
        currencySymbol: 'R$',
        railLabel: 'PIX',
        legalIdLabel: 'CPF',
        legalIdPlaceholder: '000.000.000-00',
        nationalityDefault: 'Brasil',
        destinationLabel: 'PIX key',
        destinationPlaceholder: 'email, phone, CPF, or random key',
        destinationKind: 'key',
        testLegalId: '12345678909',
    },
    argentina: {
        id: 'argentina',
        exchange: 'ARGENTINA',
        currency: 'ARS',
        currencySymbol: '$',
        railLabel: 'CVU/CBU/alias',
        legalIdLabel: 'CUIT / DNI',
        legalIdPlaceholder: '20-00000000-0',
        nationalityDefault: 'Argentina',
        destinationLabel: 'CVU / CBU / alias',
        destinationPlaceholder: 'CVU, CBU, or alias',
        destinationKind: 'key',
        testLegalId: '',
    },
    colombia: {
        id: 'colombia',
        exchange: 'COLOMBIA',
        currency: 'COP',
        currencySymbol: '$',
        railLabel: 'BRE-B',
        legalIdLabel: 'Cédula (CC)',
        legalIdPlaceholder: '0.000.000.000',
        nationalityDefault: 'Colombia',
        destinationLabel: 'bank account',
        destinationPlaceholder: 'account number',
        destinationKind: 'bank',
        testLegalId: '',
    },
};

/** Resolve a `?region=` value to a Manteca flow region (defaults to Brazil). */
export function getMantecaFlowRegion(region: string | null | undefined): MantecaFlowRegion {
    return (region && MANTECA_REGIONS[region]) || MANTECA_REGIONS.brazil;
}
