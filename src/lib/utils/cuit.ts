/**
 * Argentine CUIT/CUIL helpers.
 *
 * A CUIT is 11 digits — `XX-XXXXXXXX-Y`: a 2-digit type prefix (20/23/24 male,
 * 27 female for individuals; 30/33/34 for companies), an 8-digit number
 * (typically the DNI), and a modulo-11 check digit `Y`.
 *
 * Check digit (AFIP): multiply the first 10 digits by the weights
 * `[5,4,3,2,7,6,5,4,3,2]`, sum, then `11 - (sum % 11)`; `11 → 0`, and `10`
 * means the combination is not issued (invalid for that prefix).
 */

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Individual CUIT/CUIL type prefixes. */
export type CuitPrefix = 20 | 23 | 24 | 27;
const INDIVIDUAL_PREFIXES: CuitPrefix[] = [20, 23, 24, 27];

/**
 * Compute the CUIT check digit for the first 10 digits. Returns `0–9`, or `10`
 * to signal an unissued combination (the caller should reject/retry).
 */
export function cuitCheckDigit(first10: string): number {
    const sum = WEIGHTS.reduce((acc, w, i) => acc + Number(first10[i]) * w, 0);
    const v = 11 - (sum % 11);
    if (v === 11) return 0;
    return v; // may be 10 (invalid) — left to the caller
}

/** `true` if `value` (with or without `-`/`.` separators) is a valid CUIT. */
export function isValidCuit(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    if (!/^\d{11}$/.test(digits)) return false;
    const cd = cuitCheckDigit(digits.slice(0, 10));
    if (cd === 10) return false;
    return cd === Number(digits[10]);
}

/**
 * Generate a random but checksum-valid 11-digit CUIT (no separators). Defaults
 * to a random individual prefix; pass one to fix it. Retries the rare
 * unissued (check-digit 10) combinations.
 */
export function generateCuit(prefix?: CuitPrefix): string {
    for (;;) {
        const p =
            prefix ?? INDIVIDUAL_PREFIXES[Math.floor(Math.random() * INDIVIDUAL_PREFIXES.length)];
        const middle = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0');
        const first10 = `${p}${middle}`;
        const cd = cuitCheckDigit(first10);
        if (cd === 10) continue;
        return first10 + cd;
    }
}
