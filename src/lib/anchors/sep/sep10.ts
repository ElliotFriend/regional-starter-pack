/**
 * SEP-10: Web Authentication
 *
 * Implements the Stellar web authentication protocol for obtaining JWT tokens.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import type {
    Sep10ChallengeResponse,
    Sep10TokenResponse,
    Sep10JwtPayload,
    SepError,
} from './types';
import { SepApiError } from './types';

export interface Sep10Config {
    authEndpoint: string;
    serverSigningKey: string;
    networkPassphrase: string;
    homeDomain?: string;
}

export interface Sep10SignerFn {
    (transactionXdr: string, networkPassphrase: string): Promise<string>;
}

/**
 * Request a challenge transaction from the anchor's auth server.
 *
 * @param config - SEP-10 configuration
 * @param account - The user's Stellar public key
 * @param options - Optional parameters (memo, client_domain)
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getChallenge(
    config: Sep10Config,
    account: string,
    options?: {
        memo?: string;
        clientDomain?: string;
    },
    fetchFn: typeof fetch = fetch,
): Promise<Sep10ChallengeResponse> {
    const url = new URL(config.authEndpoint);
    url.searchParams.set('account', account);

    if (options?.memo) {
        url.searchParams.set('memo', options.memo);
    }
    if (config.homeDomain) {
        url.searchParams.set('home_domain', config.homeDomain);
    }
    if (options?.clientDomain) {
        url.searchParams.set('client_domain', options.clientDomain);
    }

    const response = await fetchFn(url.toString());

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to get challenge: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Validates a challenge transaction received from the anchor.
 * This ensures the transaction is properly formed and from the expected server.
 *
 * @param challengeXdr - The challenge transaction XDR
 * @param serverSigningKey - The anchor's signing key
 * @param networkPassphrase - The Stellar network passphrase
 * @param homeDomain - The anchor's home domain
 * @param userAccount - The user's Stellar public key
 */
export function validateChallenge(
    challengeXdr: string,
    serverSigningKey: string,
    networkPassphrase: string,
    homeDomain: string,
    userAccount: string,
): {
    valid: boolean;
    transaction: StellarSdk.Transaction;
    error?: string;
} {
    try {
        const transaction = new StellarSdk.Transaction(challengeXdr, networkPassphrase);

        // Check that the transaction source is the server's signing key
        if (transaction.source !== serverSigningKey) {
            return {
                valid: false,
                transaction,
                error: `Transaction source ${transaction.source} does not match server signing key ${serverSigningKey}`,
            };
        }

        // Check that the transaction has a sequence number of 0
        if (transaction.sequence !== '0') {
            return {
                valid: false,
                transaction,
                error: 'Challenge transaction sequence number must be 0',
            };
        }

        // Check that the first operation is a manage_data operation
        if (transaction.operations.length === 0) {
            return {
                valid: false,
                transaction,
                error: 'Challenge transaction must have at least one operation',
            };
        }

        const firstOp = transaction.operations[0];
        if (firstOp.type !== 'manageData') {
            return {
                valid: false,
                transaction,
                error: 'First operation must be manage_data',
            };
        }

        // Check that the manage_data operation's name matches the home domain
        const expectedName = `${homeDomain} auth`;
        if (firstOp.name !== expectedName) {
            return {
                valid: false,
                transaction,
                error: `Manage data operation name ${firstOp.name} does not match expected ${expectedName}`,
            };
        }

        // Check that the manage_data operation's source is the user's account
        const opSource = firstOp.source || transaction.source;
        if (opSource !== userAccount) {
            return {
                valid: false,
                transaction,
                error: `Operation source ${opSource} does not match user account ${userAccount}`,
            };
        }

        // Check that the transaction is not expired
        const now = Math.floor(Date.now() / 1000);
        const maxTime = transaction.timeBounds?.maxTime;
        if (maxTime && parseInt(maxTime, 10) < now) {
            return {
                valid: false,
                transaction,
                error: 'Challenge transaction has expired',
            };
        }

        return { valid: true, transaction };
    } catch (error) {
        return {
            valid: false,
            transaction: null as unknown as StellarSdk.Transaction,
            error: `Failed to parse challenge transaction: ${error}`,
        };
    }
}

/**
 * Signs a challenge transaction using the provided signer function.
 * The signer function should handle the actual signing (e.g., via Freighter).
 *
 * @param challengeXdr - The challenge transaction XDR
 * @param networkPassphrase - The Stellar network passphrase
 * @param signer - A function that signs the transaction XDR
 */
export async function signChallenge(
    challengeXdr: string,
    networkPassphrase: string,
    signer: Sep10SignerFn,
): Promise<string> {
    return signer(challengeXdr, networkPassphrase);
}

/**
 * Submits a signed challenge transaction to get a JWT token.
 *
 * @param authEndpoint - The anchor's auth endpoint
 * @param signedTransactionXdr - The signed challenge transaction XDR
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function submitChallenge(
    authEndpoint: string,
    signedTransactionXdr: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep10TokenResponse> {
    const response = await fetchFn(authEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction: signedTransactionXdr }),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to submit challenge: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Performs the full SEP-10 authentication flow:
 * 1. Get challenge from server
 * 2. Validate challenge
 * 3. Sign challenge
 * 4. Submit signed challenge
 * 5. Return JWT token
 *
 * @param config - SEP-10 configuration
 * @param account - The user's Stellar public key
 * @param signer - A function that signs the transaction XDR
 * @param options - Optional parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function authenticate(
    config: Sep10Config,
    account: string,
    signer: Sep10SignerFn,
    options?: {
        memo?: string;
        clientDomain?: string;
        validateChallenge?: boolean;
    },
    fetchFn: typeof fetch = fetch,
): Promise<string> {
    // 1. Get challenge
    const challenge = await getChallenge(config, account, options, fetchFn);

    // 2. Validate challenge (optional but recommended)
    if (options?.validateChallenge !== false && config.homeDomain) {
        const validation = validateChallenge(
            challenge.transaction,
            config.serverSigningKey,
            challenge.network_passphrase || config.networkPassphrase,
            config.homeDomain,
            account,
        );
        if (!validation.valid) {
            throw new Error(`Invalid challenge: ${validation.error}`);
        }
    }

    // 3. Sign challenge
    const signedXdr = await signChallenge(
        challenge.transaction,
        challenge.network_passphrase || config.networkPassphrase,
        signer,
    );

    // 4. Submit and get token
    const tokenResponse = await submitChallenge(config.authEndpoint, signedXdr, fetchFn);

    return tokenResponse.token;
}

/**
 * Decodes a JWT token to extract the payload.
 * Note: This does NOT verify the signature - that should be done server-side.
 *
 * @param token - The JWT token
 */
export function decodeToken(token: string): Sep10JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT token format');
    }

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
}

/**
 * Checks if a JWT token is expired.
 *
 * @param token - The JWT token
 * @param bufferSeconds - Optional buffer time in seconds (default: 60)
 */
export function isTokenExpired(token: string, bufferSeconds: number = 60): boolean {
    try {
        const payload = decodeToken(token);
        const now = Math.floor(Date.now() / 1000);
        return payload.exp < now + bufferSeconds;
    } catch {
        return true;
    }
}

/**
 * Creates authorization headers for SEP API requests.
 *
 * @param token - The JWT token
 */
export function createAuthHeaders(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
}
