/**
 * Per-market UI configuration for the Koywe anchor.
 *
 * Koywe's crypto API is currency-agnostic; this table is what makes the shared
 * on/off-ramp flow pages render the right currency, country code, document
 * type, payout-account field, and "Fill test data" values per region. Keyed by
 * the region id in `regions.ts`. The flow pages select a market from the
 * `?region=` query param (default `argentina`), mirroring the Etherfuse
 * multi-country pages.
 *
 * `countryCode` is Koywe's ISO-3166 alpha-3 code used by `POST /rest/accounts`
 * and `POST /rest/bank-accounts`. `documentType` defaults to a value present in
 * the documented `documentType` enum (the field stays user-editable in the UI).
 * `offRamp` is true for the markets wired here; Argentina retains its
 * pre-existing ARS off-ramp path (handled separately), which is why ARS is
 * `true` even though it is not in Koywe's bank-account `currencySymbol` enum
 * ([CLP, COP, MXN, PEN]) that gates Mexico/Colombia.
 */

import { generateClabe, generateCurp } from '$lib/utils/mexico';

export interface KoyweKycTestData {
    documentNumber: string;
    documentType: string;
    documentCountry: string;
    names: string;
    firstLastname: string;
    dob: string;
    phoneNumber: string;
    activity: string;
    nationality: string;
    gender: '' | 'H' | 'M' | 'O';
    street: string;
    city: string;
    state: string;
    zipCode: string;
    neighborhood: string;
}

export interface KoyweMarket {
    /** Region id in `regions.ts`. */
    region: string;
    /** Display name. */
    name: string;
    /** ISO 4217 fiat currency symbol Koywe quotes against. */
    currency: string;
    /** Koywe ISO-3 country code for accounts / bank-accounts. */
    countryCode: string;
    /** Default KYC document type (must be in the documented enum). */
    documentType: string;
    /** Whether the off-ramp bank-account path is supported for this currency. */
    offRamp: boolean;
    /** Label for the off-ramp payout-account field. */
    accountLabel: string;
    /** Placeholder for the off-ramp payout-account field. */
    accountPlaceholder: string;
    /** Bank-account type, where the country requires it (Colombia). */
    accountType?: 'checking' | 'savings';
    /** "Fill test data" KYC values. */
    testData: KoyweKycTestData;
    /** "Fill test data" payout account number (off-ramp). */
    testAccountNumber?: string;
}

export const DEFAULT_KOYWE_REGION = 'argentina';

export const KOYWE_MARKETS: Record<string, KoyweMarket> = {
    argentina: {
        region: 'argentina',
        name: 'Argentina',
        currency: 'ARS',
        countryCode: 'ARG',
        documentType: 'DNI',
        offRamp: true,
        accountLabel: 'CVU / account number',
        accountPlaceholder: '0000242600000000009120',
        // Sandbox: bank-account registration is ownership-validated against a
        // whitelisted DNI↔CVU pair (and is currently Koywe-side broken).
        testAccountNumber: '0000242600000000009120',
        testData: {
            documentNumber: '34770518',
            documentType: 'DNI',
            documentCountry: 'ARG',
            names: 'Test',
            firstLastname: 'User',
            dob: '1990-01-01',
            phoneNumber: '+5491155551234',
            activity: 'Software Engineer',
            nationality: 'ARG',
            gender: 'O',
            street: 'Av. 9 de Julio 1000',
            city: 'Buenos Aires',
            state: 'CABA',
            zipCode: 'C1043',
            neighborhood: 'Centro',
        },
    },
    mexico: {
        region: 'mexico',
        name: 'Mexico',
        currency: 'MXN',
        countryCode: 'MEX',
        // Koywe keys Mexican individuals by CURP (RFC is for companies), despite
        // the bundled OpenAPI enum omitting it. The offramp UI lets the user pick
        // CURP/RFC and regenerates a matching number.
        documentType: 'CURP',
        offRamp: true,
        accountLabel: 'CLABE',
        accountPlaceholder: '646180157000000004',
        // Generated fresh per module load so "Fill test data" yields a unique,
        // checksum-valid CLABE (the old hard-coded placeholder was neither).
        testAccountNumber: generateClabe('646'),
        testData: {
            documentNumber: generateCurp(),
            documentType: 'CURP',
            documentCountry: 'MEX',
            names: 'Test',
            firstLastname: 'User',
            dob: '1990-01-01',
            phoneNumber: '+525555551234',
            activity: 'Software Engineer',
            nationality: 'MEX',
            gender: 'O',
            street: 'Av. Reforma 100',
            city: 'Ciudad de México',
            state: 'CDMX',
            zipCode: '06600',
            neighborhood: 'Juárez',
        },
    },
    colombia: {
        region: 'colombia',
        name: 'Colombia',
        currency: 'COP',
        countryCode: 'COL',
        documentType: 'CED_CIU',
        offRamp: true,
        accountLabel: 'Account number',
        accountPlaceholder: '000000000000',
        accountType: 'savings',
        testAccountNumber: '000000000000',
        testData: {
            documentNumber: '1010101010',
            documentType: 'CED_CIU',
            documentCountry: 'COL',
            names: 'Test',
            firstLastname: 'User',
            dob: '1990-01-01',
            phoneNumber: '+573001234567',
            activity: 'Software Engineer',
            nationality: 'COL',
            gender: 'O',
            street: 'Calle 100 # 10-20',
            city: 'Bogotá',
            state: 'Cundinamarca',
            zipCode: '110111',
            neighborhood: 'Chapinero',
        },
    },
};

export function getKoyweMarket(region: string): KoyweMarket | undefined {
    return KOYWE_MARKETS[region];
}

export function koyweMarketRegionIds(): string[] {
    return Object.keys(KOYWE_MARKETS);
}
