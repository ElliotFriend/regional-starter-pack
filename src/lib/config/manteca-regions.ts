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
    /** Sandbox test legal ID for "Fill test data" (empty where unknown). */
    testLegalId: string;
}

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
        destinationLabel: 'Bre-B key',
        destinationPlaceholder: 'Bre-B key / account',
        testLegalId: '',
    },
};

/** Resolve a `?region=` value to a Manteca flow region (defaults to Brazil). */
export function getMantecaFlowRegion(region: string | null | undefined): MantecaFlowRegion {
    return (region && MANTECA_REGIONS[region]) || MANTECA_REGIONS.brazil;
}
