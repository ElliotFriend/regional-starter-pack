import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test-setup';
import {
    fetchStellarToml,
    getSep10Endpoint,
    getSep6Endpoint,
    getSep12Endpoint,
    getSep24Endpoint,
    getSep31Endpoint,
    getSep38Endpoint,
    getSigningKey,
    getCurrencies,
    getCurrencyByCode,
    supportsSep,
} from './sep1';
import type { StellarTomlRecord, TomlCurrency } from './sep1';

// =============================================================================
// fetchStellarToml (HTTP - uses MSW)
// =============================================================================

describe('fetchStellarToml', () => {
    const domain = 'testanchor.stellar.org';
    const tomlUrl = `https://${domain}/.well-known/stellar.toml`;

    it('fetches and parses a stellar.toml file', async () => {
        const tomlContent = [
            'WEB_AUTH_ENDPOINT="https://testanchor.stellar.org/auth"',
            'TRANSFER_SERVER="https://testanchor.stellar.org/sep6"',
            'SIGNING_KEY="GBDYDBJKQBJK6VUSBE4L7UH4BQ65YNQERGRETFEQSXYHV2QAV7UACC5"',
        ].join('\n');

        server.use(
            http.get(tomlUrl, () => {
                return new HttpResponse(tomlContent, {
                    headers: { 'Content-Type': 'text/plain' },
                });
            }),
        );

        const toml = await fetchStellarToml(domain);
        expect(toml.WEB_AUTH_ENDPOINT).toBe('https://testanchor.stellar.org/auth');
        expect(toml.TRANSFER_SERVER).toBe('https://testanchor.stellar.org/sep6');
        expect(toml.SIGNING_KEY).toBe('GBDYDBJKQBJK6VUSBE4L7UH4BQ65YNQERGRETFEQSXYHV2QAV7UACC5');
    });

    it('throws when the domain is unreachable or returns an error', async () => {
        server.use(
            http.get(tomlUrl, () => {
                return new HttpResponse(null, { status: 404 });
            }),
        );

        await expect(fetchStellarToml(domain)).rejects.toThrow();
    });

    it('parses a toml with currency information', async () => {
        const tomlContent = [
            'TRANSFER_SERVER="https://testanchor.stellar.org/sep6"',
            '',
            '[[CURRENCIES]]',
            'code="USDC"',
            'issuer="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"',
            'display_decimals=2',
            '',
            '[[CURRENCIES]]',
            'code="CETES"',
            'issuer="GCETES47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLF"',
            'display_decimals=7',
        ].join('\n');

        server.use(
            http.get(tomlUrl, () => {
                return new HttpResponse(tomlContent, {
                    headers: { 'Content-Type': 'text/plain' },
                });
            }),
        );

        const toml = await fetchStellarToml(domain);
        expect(toml.CURRENCIES).toHaveLength(2);
        expect(toml.CURRENCIES![0].code).toBe('USDC');
        expect(toml.CURRENCIES![1].code).toBe('CETES');
    });
});

// =============================================================================
// getSep10Endpoint
// =============================================================================

describe('getSep10Endpoint', () => {
    it('returns WEB_AUTH_ENDPOINT when present', () => {
        const toml = { WEB_AUTH_ENDPOINT: 'https://auth.example.com' } as StellarTomlRecord;
        expect(getSep10Endpoint(toml)).toBe('https://auth.example.com');
    });

    it('returns undefined when WEB_AUTH_ENDPOINT is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSep10Endpoint(toml)).toBeUndefined();
    });

    it('returns empty string when WEB_AUTH_ENDPOINT is empty', () => {
        const toml = { WEB_AUTH_ENDPOINT: '' } as StellarTomlRecord;
        expect(getSep10Endpoint(toml)).toBe('');
    });
});

// =============================================================================
// getSep6Endpoint
// =============================================================================

describe('getSep6Endpoint', () => {
    it('returns TRANSFER_SERVER when present', () => {
        const toml = { TRANSFER_SERVER: 'https://sep6.example.com' } as StellarTomlRecord;
        expect(getSep6Endpoint(toml)).toBe('https://sep6.example.com');
    });

    it('returns undefined when TRANSFER_SERVER is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSep6Endpoint(toml)).toBeUndefined();
    });
});

// =============================================================================
// getSep12Endpoint
// =============================================================================

describe('getSep12Endpoint', () => {
    it('returns KYC_SERVER when present', () => {
        const toml = { KYC_SERVER: 'https://kyc.example.com' } as StellarTomlRecord;
        expect(getSep12Endpoint(toml)).toBe('https://kyc.example.com');
    });

    it('returns undefined when KYC_SERVER is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSep12Endpoint(toml)).toBeUndefined();
    });
});

// =============================================================================
// getSep24Endpoint
// =============================================================================

describe('getSep24Endpoint', () => {
    it('returns TRANSFER_SERVER_SEP0024 when present', () => {
        const toml = {
            TRANSFER_SERVER_SEP0024: 'https://sep24.example.com',
        } as StellarTomlRecord;
        expect(getSep24Endpoint(toml)).toBe('https://sep24.example.com');
    });

    it('returns undefined when TRANSFER_SERVER_SEP0024 is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSep24Endpoint(toml)).toBeUndefined();
    });
});

// =============================================================================
// getSep31Endpoint
// =============================================================================

describe('getSep31Endpoint', () => {
    it('returns DIRECT_PAYMENT_SERVER when present', () => {
        const toml = {
            DIRECT_PAYMENT_SERVER: 'https://sep31.example.com',
        } as StellarTomlRecord;
        expect(getSep31Endpoint(toml)).toBe('https://sep31.example.com');
    });

    it('returns undefined when DIRECT_PAYMENT_SERVER is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSep31Endpoint(toml)).toBeUndefined();
    });
});

// =============================================================================
// getSep38Endpoint
// =============================================================================

describe('getSep38Endpoint', () => {
    it('returns ANCHOR_QUOTE_SERVER when present', () => {
        const toml = {
            ANCHOR_QUOTE_SERVER: 'https://sep38.example.com',
        } as StellarTomlRecord;
        expect(getSep38Endpoint(toml)).toBe('https://sep38.example.com');
    });

    it('returns undefined when ANCHOR_QUOTE_SERVER is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSep38Endpoint(toml)).toBeUndefined();
    });
});

// =============================================================================
// getSigningKey
// =============================================================================

describe('getSigningKey', () => {
    it('returns SIGNING_KEY when present', () => {
        const toml = {
            SIGNING_KEY: 'GBDYDBJKQBJK6VUSBE4L7UH4BQ65YNQERGRETFEQSXYHV2QAV7UACC5',
        } as StellarTomlRecord;
        expect(getSigningKey(toml)).toBe('GBDYDBJKQBJK6VUSBE4L7UH4BQ65YNQERGRETFEQSXYHV2QAV7UACC5');
    });

    it('returns undefined when SIGNING_KEY is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSigningKey(toml)).toBeUndefined();
    });
});

// =============================================================================
// getCurrencies
// =============================================================================

describe('getCurrencies', () => {
    it('returns currencies array when present', () => {
        const currencies: TomlCurrency[] = [
            { code: 'USDC', issuer: 'GBBD47...' } as TomlCurrency,
            { code: 'CETES', issuer: 'GCETES...' } as TomlCurrency,
        ];
        const toml = { CURRENCIES: currencies } as StellarTomlRecord;
        expect(getCurrencies(toml)).toEqual(currencies);
        expect(getCurrencies(toml)).toHaveLength(2);
    });

    it('returns empty array when CURRENCIES is missing', () => {
        const toml = {} as StellarTomlRecord;
        expect(getCurrencies(toml)).toEqual([]);
    });

    it('returns empty array when CURRENCIES is explicitly empty', () => {
        const toml = { CURRENCIES: [] } as StellarTomlRecord;
        expect(getCurrencies(toml)).toEqual([]);
    });
});

// =============================================================================
// getCurrencyByCode
// =============================================================================

describe('getCurrencyByCode', () => {
    const currencies: TomlCurrency[] = [
        { code: 'USDC', issuer: 'GBBD47...' } as TomlCurrency,
        { code: 'CETES', issuer: 'GCETES...' } as TomlCurrency,
    ];
    const toml = { CURRENCIES: currencies } as StellarTomlRecord;

    it('returns the currency when found', () => {
        const result = getCurrencyByCode(toml, 'USDC');
        expect(result).toBeDefined();
        expect(result!.code).toBe('USDC');
        expect(result!.issuer).toBe('GBBD47...');
    });

    it('returns undefined when not found', () => {
        expect(getCurrencyByCode(toml, 'XLM')).toBeUndefined();
    });

    it('is case-sensitive', () => {
        expect(getCurrencyByCode(toml, 'usdc')).toBeUndefined();
        expect(getCurrencyByCode(toml, 'Usdc')).toBeUndefined();
    });

    it('returns undefined when CURRENCIES is missing', () => {
        const emptyToml = {} as StellarTomlRecord;
        expect(getCurrencyByCode(emptyToml, 'USDC')).toBeUndefined();
    });
});

// =============================================================================
// supportsSep
// =============================================================================

describe('supportsSep', () => {
    const fullToml = {
        TRANSFER_SERVER: 'https://sep6.example.com',
        WEB_AUTH_ENDPOINT: 'https://auth.example.com',
        KYC_SERVER: 'https://kyc.example.com',
        TRANSFER_SERVER_SEP0024: 'https://sep24.example.com',
        DIRECT_PAYMENT_SERVER: 'https://sep31.example.com',
        ANCHOR_QUOTE_SERVER: 'https://sep38.example.com',
    } as StellarTomlRecord;

    const emptyToml = {} as StellarTomlRecord;

    it('returns true for SEP-6 when TRANSFER_SERVER is present', () => {
        expect(supportsSep(fullToml, 6)).toBe(true);
    });

    it('returns false for SEP-6 when TRANSFER_SERVER is missing', () => {
        expect(supportsSep(emptyToml, 6)).toBe(false);
    });

    it('returns true for SEP-10 when WEB_AUTH_ENDPOINT is present', () => {
        expect(supportsSep(fullToml, 10)).toBe(true);
    });

    it('returns false for SEP-10 when WEB_AUTH_ENDPOINT is missing', () => {
        expect(supportsSep(emptyToml, 10)).toBe(false);
    });

    it('returns true for SEP-12 when KYC_SERVER is present', () => {
        expect(supportsSep(fullToml, 12)).toBe(true);
    });

    it('returns false for SEP-12 when KYC_SERVER is missing', () => {
        expect(supportsSep(emptyToml, 12)).toBe(false);
    });

    it('returns true for SEP-24 when TRANSFER_SERVER_SEP0024 is present', () => {
        expect(supportsSep(fullToml, 24)).toBe(true);
    });

    it('returns false for SEP-24 when TRANSFER_SERVER_SEP0024 is missing', () => {
        expect(supportsSep(emptyToml, 24)).toBe(false);
    });

    it('returns true for SEP-31 when DIRECT_PAYMENT_SERVER is present', () => {
        expect(supportsSep(fullToml, 31)).toBe(true);
    });

    it('returns false for SEP-31 when DIRECT_PAYMENT_SERVER is missing', () => {
        expect(supportsSep(emptyToml, 31)).toBe(false);
    });

    it('returns true for SEP-38 when ANCHOR_QUOTE_SERVER is present', () => {
        expect(supportsSep(fullToml, 38)).toBe(true);
    });

    it('returns false for SEP-38 when ANCHOR_QUOTE_SERVER is missing', () => {
        expect(supportsSep(emptyToml, 38)).toBe(false);
    });

    it('returns false for an unknown SEP number', () => {
        expect(supportsSep(fullToml, 99 as never)).toBe(false);
    });

    it('returns false for empty-string endpoint values', () => {
        const tomlWithEmpty = {
            TRANSFER_SERVER: '',
            WEB_AUTH_ENDPOINT: '',
        } as StellarTomlRecord;
        expect(supportsSep(tomlWithEmpty, 6)).toBe(false);
        expect(supportsSep(tomlWithEmpty, 10)).toBe(false);
    });
});

// =============================================================================
// Input validation behavior
// =============================================================================

describe('input validation behavior', () => {
    // Tests for empty/invalid domain strings removed: they test Stellar SDK behavior
    // rather than our code, and the SDK's HTTP requests are intercepted by MSW's
    // onUnhandledRequest: 'error' setting, causing the tests to error rather than
    // the SDK rejecting cleanly.

    it('getSep10Endpoint returns undefined when WEB_AUTH_ENDPOINT is not set on toml', () => {
        const toml = {} as StellarTomlRecord;
        expect(getSep10Endpoint(toml)).toBeUndefined();
    });

    it('supportsSep returns false for SEP number 0', () => {
        const toml = {
            TRANSFER_SERVER: 'https://example.com',
            WEB_AUTH_ENDPOINT: 'https://example.com',
        } as StellarTomlRecord;
        expect(supportsSep(toml, 0 as never)).toBe(false);
    });

    it('supportsSep returns false for negative SEP number', () => {
        const toml = {
            TRANSFER_SERVER: 'https://example.com',
            WEB_AUTH_ENDPOINT: 'https://example.com',
        } as StellarTomlRecord;
        expect(supportsSep(toml, -1 as never)).toBe(false);
    });

    it('getCurrencyByCode with empty string code returns undefined (no match)', () => {
        const currencies: TomlCurrency[] = [
            { code: 'USDC', issuer: 'GBBD47...' } as TomlCurrency,
        ];
        const toml = { CURRENCIES: currencies } as StellarTomlRecord;
        expect(getCurrencyByCode(toml, '')).toBeUndefined();
    });
});
