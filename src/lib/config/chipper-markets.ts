/**
 * Per-market presentation for the Chipper flow pages (`?region=ghana|kenya`).
 * Method codes are read at runtime from capabilities; this table holds only
 * what the API does not: labels, dial codes, and sandbox test phones.
 */

export interface ChipperMarket {
    id: 'ghana' | 'kenya';
    /** ISO 3166-1 alpha-2, as Chipper's capabilities path expects. */
    country: 'GH' | 'KE';
    currency: 'GHS' | 'KES';
    currencySymbol: string;
    dialCode: '+233' | '+254';
    phonePlaceholder: string;
    /** Rail label for copy (e.g. "mobile money", "M-Pesa"). */
    railLabel: string;
    /** Sandbox phone that completes collections and payouts. */
    testPhone: string;
}

export const CHIPPER_MARKETS: Record<ChipperMarket['id'], ChipperMarket> = {
    ghana: {
        id: 'ghana',
        country: 'GH',
        currency: 'GHS',
        currencySymbol: 'GH₵',
        dialCode: '+233',
        phonePlaceholder: '+233 54 890 9027',
        railLabel: 'mobile money',
        testPhone: '+233548909027',
    },
    kenya: {
        id: 'kenya',
        country: 'KE',
        currency: 'KES',
        currencySymbol: 'KSh',
        dialCode: '+254',
        phonePlaceholder: '+254 712 345 678',
        railLabel: 'M-Pesa',
        testPhone: '+254712345678',
    },
};

/** Resolve a `?region=` value to a Chipper market (defaults to Ghana). */
export function getChipperMarket(region: string | null | undefined): ChipperMarket {
    return (region && CHIPPER_MARKETS[region as ChipperMarket['id']]) || CHIPPER_MARKETS.ghana;
}

/**
 * Normalize a local or international phone entry to E.164 for `dialCode`.
 * Accepts `+233…`, `233…`, a trunk `0…`, or the bare subscriber number, with
 * spaces or dashes. Returns `null` when no 9-digit subscriber number remains.
 */
export function normalizePhone(input: string, dialCode: string): string | null {
    const digits = input.replace(/[^\d]/g, '');
    const cc = dialCode.replace('+', '');
    let subscriber = digits;
    if (subscriber.startsWith(cc)) subscriber = subscriber.slice(cc.length);
    else if (subscriber.startsWith('0')) subscriber = subscriber.slice(1);
    return /^\d{9}$/.test(subscriber) ? `${dialCode}${subscriber}` : null;
}
