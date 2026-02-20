/**
 * Stellar asset resolution utility
 *
 * Resolves a token symbol (e.g. "USDC", "CETES") to a Stellar SDK Asset
 * instance using the token config registry.
 */

import { Asset } from '@stellar/stellar-sdk';
import { getToken } from '$lib/config/tokens';
import { getStellarAsset, getUsdcAsset } from '$lib/wallet/stellar';

/**
 * Resolve a currency symbol to a Stellar `Asset`.
 * Falls back to the USDC asset if the token has no configured issuer.
 */
export function resolveStellarAsset(currencySymbol: string, usdcIssuer: string): Asset {
    const tokenConfig = getToken(currencySymbol);
    return tokenConfig?.issuer
        ? getStellarAsset(tokenConfig.symbol, tokenConfig.issuer)
        : getUsdcAsset(usdcIssuer);
}
