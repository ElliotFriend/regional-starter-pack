import { describe, it, expect } from 'vitest';
import { CoinsRampClient } from '$lib/anchors/coins/client';
import { signParams } from '$lib/anchors/coins/signing';
import { AnchorError, type Anchor } from '$lib/anchors/types';

const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const ACCOUNT = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';
const TS = 1700000000000;
const NONCE = 'fixed-nonce-uuid';

function createClient(): Anchor {
    return new CoinsRampClient({
        apiKey: 'pk_test',
        secretKey: 'sk_test',
        merchantId: 'merchant-1',
        widgetBaseUrl: 'https://coins.test',
        apiBaseUrl: 'https://api.coins.test',
        country: 'PH',
        usdcIssuer: USDC_ISSUER,
        now: () => TS,
        nonceFn: () => NONCE,
    });
}

describe('CoinsRampClient identity & facets', () => {
    it('exposes the interactive facet only (no auth, no programmatic)', () => {
        const c = createClient();
        expect(c.interactive).toBeDefined();
        expect(c.auth).toBeUndefined();
        expect(c.programmatic).toBeUndefined();
    });

    it('declares interactive as its only flow style and no wallet auth', () => {
        const c = createClient();
        expect(c.capabilities.flowStyles).toEqual(['interactive']);
    });

    it('reports identity, currency, rails, and the configured USDC token', () => {
        const c = createClient();
        expect(c.name).toBe('coins');
        expect(c.displayName).toBe('Coins.ph');
        expect(c.supportedCurrencies).toEqual(['PHP']);
        expect(c.supportedRails).toContain('gcash');
        expect(c.supportedTokens[0]).toMatchObject({ symbol: 'USDC', issuer: USDC_ISSUER });
    });
});

describe('interactive.startOnRamp', () => {
    it('builds a signed widget URL and returns no transaction id', async () => {
        const c = createClient();
        const session = await c.interactive!.startOnRamp({
            assetCode: 'USDC',
            account: ACCOUNT,
            amount: '100',
        });

        expect(session.transactionId).toBe('');
        expect(session.interactiveUrl.startsWith('https://coins.test/ramp/widget?')).toBe(true);

        const params = new URL(session.interactiveUrl).searchParams;
        expect(params.get('type')).toBe('buy');
        expect(params.get('apiKey')).toBe('pk_test');
        expect(params.get('merchantId')).toBe('merchant-1');
        expect(params.get('country')).toBe('PH');
        expect(params.get('token')).toBe('USDC');
        expect(params.get('network')).toBe('STELLAR');
        expect(params.get('address')).toBe(ACCOUNT);
        expect(params.get('amount')).toBe('100');
        expect(params.get('timestamp')).toBe(String(TS));
        expect(params.get('nonce')).toBe(NONCE);
        expect(params.get('signature')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('signs exactly the business params plus timestamp and nonce', async () => {
        const c = createClient();
        const session = await c.interactive!.startOnRamp({
            assetCode: 'USDC',
            account: ACCOUNT,
            amount: '100',
        });
        const params = new URL(session.interactiveUrl).searchParams;

        const { signature } = await signParams({
            secretKey: 'sk_test',
            params: {
                type: 'buy',
                apiKey: 'pk_test',
                merchantId: 'merchant-1',
                country: 'PH',
                token: 'USDC',
                network: 'STELLAR',
                address: ACCOUNT,
                amount: '100',
            },
            timestamp: String(TS),
            nonce: NONCE,
        });
        expect(params.get('signature')).toBe(signature);
    });

    it('omits the amount param when no amount is given', async () => {
        const c = createClient();
        const session = await c.interactive!.startOnRamp({ assetCode: 'USDC', account: ACCOUNT });
        const params = new URL(session.interactiveUrl).searchParams;
        expect(params.has('amount')).toBe(false);
    });
});

describe('interactive status & off-ramp (launch-only, on-ramp-only)', () => {
    it('getOnRampTransaction returns null (no server-side polling yet)', async () => {
        const c = createClient();
        await expect(c.interactive!.getOnRampTransaction('anything')).resolves.toBeNull();
    });

    it('startOffRamp throws NOT_IMPLEMENTED', async () => {
        const c = createClient();
        await expect(
            c.interactive!.startOffRamp({ assetCode: 'USDC', account: ACCOUNT }),
        ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED', statusCode: 501 });
    });

    it('getOffRampTransaction throws NOT_IMPLEMENTED', async () => {
        const c = createClient();
        await expect(c.interactive!.getOffRampTransaction('x')).rejects.toBeInstanceOf(AnchorError);
    });
});
