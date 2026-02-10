/**
 * SEP-1: Stellar Info File (stellar.toml)
 *
 * Discovers anchor capabilities and endpoints from the stellar.toml file.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md
 *
 * Uses the @stellar/stellar-sdk StellarToml module for fetching and parsing.
 */

import { StellarToml } from '@stellar/stellar-sdk';

// Re-export types from the SDK for convenience
export type StellarTomlRecord = StellarToml.Api.StellarToml;
export type TomlCurrency = StellarToml.Api.Currency;
export type TomlDocumentation = StellarToml.Api.Documentation;
export type TomlPrincipal = StellarToml.Api.Principal;
export type TomlValidator = StellarToml.Api.Validator;

/**
 * Fetches and parses the stellar.toml file for a given domain.
 *
 * @param domain - The anchor's domain (e.g., "testanchor.stellar.org")
 * @param options - Optional settings (timeout, allowHttp)
 * @returns Parsed stellar.toml contents
 */
export async function fetchStellarToml(
	domain: string,
	options?: StellarToml.Api.StellarTomlResolveOptions
): Promise<StellarTomlRecord> {
	return StellarToml.Resolver.resolve(domain, options);
}

/**
 * Helper to get the SEP-10 auth endpoint from a stellar.toml
 */
export function getSep10Endpoint(toml: StellarTomlRecord): string | undefined {
	return toml.WEB_AUTH_ENDPOINT;
}

/**
 * Helper to get the SEP-6 transfer server from a stellar.toml
 */
export function getSep6Endpoint(toml: StellarTomlRecord): string | undefined {
	return toml.TRANSFER_SERVER;
}

/**
 * Helper to get the SEP-12 KYC server from a stellar.toml
 */
export function getSep12Endpoint(toml: StellarTomlRecord): string | undefined {
	return toml.KYC_SERVER;
}

/**
 * Helper to get the SEP-24 transfer server from a stellar.toml
 */
export function getSep24Endpoint(toml: StellarTomlRecord): string | undefined {
	return toml.TRANSFER_SERVER_SEP0024;
}

/**
 * Helper to get the SEP-31 direct payment server from a stellar.toml
 */
export function getSep31Endpoint(toml: StellarTomlRecord): string | undefined {
	return toml.DIRECT_PAYMENT_SERVER;
}

/**
 * Helper to get the SEP-38 quote server from a stellar.toml
 */
export function getSep38Endpoint(toml: StellarTomlRecord): string | undefined {
	return toml.ANCHOR_QUOTE_SERVER;
}

/**
 * Helper to get the signing key from a stellar.toml
 */
export function getSigningKey(toml: StellarTomlRecord): string | undefined {
	return toml.SIGNING_KEY;
}

/**
 * Helper to get currencies/assets from a stellar.toml
 */
export function getCurrencies(toml: StellarTomlRecord): TomlCurrency[] {
	return toml.CURRENCIES || [];
}

/**
 * Helper to find a specific currency by code
 */
export function getCurrencyByCode(toml: StellarTomlRecord, code: string): TomlCurrency | undefined {
	return toml.CURRENCIES?.find((c) => c.code === code);
}

/**
 * Checks if the anchor supports a specific SEP based on endpoint presence
 */
export function supportsSep(toml: StellarTomlRecord, sep: 6 | 10 | 12 | 24 | 31 | 38): boolean {
	switch (sep) {
		case 6:
			return !!toml.TRANSFER_SERVER;
		case 10:
			return !!toml.WEB_AUTH_ENDPOINT;
		case 12:
			return !!toml.KYC_SERVER;
		case 24:
			return !!toml.TRANSFER_SERVER_SEP0024;
		case 31:
			return !!toml.DIRECT_PAYMENT_SERVER;
		case 38:
			return !!toml.ANCHOR_QUOTE_SERVER;
		default:
			return false;
	}
}
