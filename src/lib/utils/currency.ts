/**
 * Currency display utilities
 *
 * Shared helpers for formatting currency codes and amounts across
 * on-ramp, off-ramp, and quote display components.
 */

/** Common ISO 4217 fiat currency codes. */
const FIAT_CURRENCIES = new Set([
    'MXN',
    'USD',
    'EUR',
    'BRL',
    'ARS',
    'COP',
    'CLP',
    'PEN',
    'PHP',
    'GBP',
    'JPY',
    'CAD',
    'AUD',
]);

/** Strip the issuer from a `CODE:ISSUER` asset string. */
export function displayCurrency(currency: string | undefined): string {
    if (!currency) return '';
    return currency.split(':')[0];
}

/** Format a numeric string to at most 7 decimal places, trimming trailing zeros. */
export function formatAmount(value: string): string {
    return parseFloat(parseFloat(value).toFixed(7)).toString();
}

/** Format a currency with crypto-aware precision and currency code. */
export function formatCurrency(amount: string, currency: string): string {
    const code = displayCurrency(currency);
    // For fiat currencies, use locale formatting with 2 decimal places
    if (FIAT_CURRENCIES.has(code)) {
        const num = parseFloat(amount);
        return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
    }
    // For digital assets, show up to 7 decimal places (only as many as needed)
    return `${formatAmount(amount)} ${code}`;
}
