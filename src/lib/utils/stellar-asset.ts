/**
 * Stellar asset resolution utility
 *
 * Resolves a token symbol (e.g. "USDC", "CETES") to a Stellar SDK Asset
 * instance using the provided issuer.
 */

import { Asset } from '@stellar/stellar-sdk';
import { getStellarAsset, getUsdcAsset } from '$lib/wallet/stellar';

/**
 * Resolve a currency symbol to a Stellar `Asset`.
 *
 * @param currencySymbol - Token symbol (e.g. "USDC", "CETES").
 * @param issuer - Stellar issuer public key for this token. If undefined, falls back to USDC.
 * @param usdcIssuer - Fallback USDC issuer public key.
 */
export function resolveStellarAsset(
    currencySymbol: string,
    issuer: string | undefined,
    usdcIssuer: string,
): Asset {
    return issuer ? getStellarAsset(currencySymbol, issuer) : getUsdcAsset(usdcIssuer);
}
