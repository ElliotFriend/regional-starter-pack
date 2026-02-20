/**
 * Wallet-related type definitions
 */

export type StellarNetwork = 'testnet' | 'public';

export interface WalletInfo {
    publicKey: string;
    network: StellarNetwork;
}

export class WalletError extends Error {
    code: WalletErrorCode;

    constructor(message: string, code: WalletErrorCode) {
        super(message);
        this.name = 'WalletError';
        this.code = code;
    }
}

export type WalletErrorCode =
    | 'NOT_INSTALLED'
    | 'CONNECTION_REJECTED'
    | 'NO_ACCOUNT'
    | 'SIGNING_REJECTED'
    | 'NETWORK_MISMATCH'
    | 'UNKNOWN';

export interface SignedTransaction {
    signedXdr: string;
    networkPassphrase: string;
}
