/**
 * Token Configuration
 *
 * Defines the digital asset tokens supported across the application.
 */

export interface Token {
    symbol: string;
    name: string;
    issuer?: string; // Stellar asset issuer, undefined for native XLM
    description: string;
}

export const TOKENS: Record<string, Token> = {
    USDC: {
        symbol: 'USDC',
        name: 'USD Coin',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', // Circle USDC issuer on Testnet
        description: 'A fully-reserved stablecoin pegged 1:1 to the US Dollar',
    },
    XLM: {
        symbol: 'XLM',
        name: 'Stellar Lumens',
        description: 'The native token of the Stellar network',
    },
    CETES: {
        symbol: 'CETES',
        name: 'Etherfuse CETES',
        issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4', // Etherfuse issuer on Testnet
        description:
            "Etherfuse CETES, officially known as Mexican Federal Treasury Certificates, are Mexico's oldest short-term debt securities issued by the Ministry of Finance.",
    },
    USDB: {
        symbol: 'USDB',
        name: 'BlindPay USD',
        issuer: 'GBWXJPZL5ADAH7T5BP3DBW2V2DFT3URN2VXN2MG26OM4CTOJSDDSPYAN', // BlindPay issuer on Testnet
        description:
            'USDB is a fake ERC20 stablecoin powered by BlindPay to simulate payouts on development instances.',
    },
};

export function getToken(symbol: string): Token | undefined {
    return TOKENS[symbol];
}

export function getAllTokenSymbols(): string[] {
    return Object.values(TOKENS).map((token) => token.symbol);
}
