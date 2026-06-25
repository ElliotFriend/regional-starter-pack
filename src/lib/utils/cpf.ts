/**
 * Brazilian CPF helpers.
 *
 * A CPF is 11 digits — `XXX.XXX.XXX-DD`: 9 base digits plus two modulo-11 check
 * digits. The first check digit is computed from the 9 base digits (weights
 * `10..2`); the second from the 9 base digits + the first check digit (weights
 * `11..2`). For each: `r = sum % 11`, digit = `r < 2 ? 0 : 11 - r`.
 *
 * All-same-digit CPFs (e.g. `111.111.111-11`) pass the checksum but are invalid
 * and must be rejected.
 */

/** One modulo-11 check digit over `digits` with weights `startWeight..2`. */
function checkDigit(digits: number[], startWeight: number): number {
    const sum = digits.reduce((acc, d, i) => acc + d * (startWeight - i), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
}

/** Compute the two CPF check digits for the 9 base digits, as a 2-char string. */
export function cpfCheckDigits(first9: string): string {
    const base = [...first9].map(Number);
    const d1 = checkDigit(base, 10);
    const d2 = checkDigit([...base, d1], 11);
    return `${d1}${d2}`;
}

/** `true` if `value` (with or without `.`/`-` separators) is a valid CPF. */
export function isValidCpf(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    if (!/^\d{11}$/.test(digits)) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false; // all-same digits — invalid
    return cpfCheckDigits(digits.slice(0, 9)) === digits.slice(9);
}

/** Generate a random but checksum-valid 11-digit CPF (no separators). */
export function generateCpf(): string {
    for (;;) {
        const base = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
        if (/^(\d)\1{8}$/.test(base)) continue; // all-same base → all-same CPF, skip
        const cpf = base + cpfCheckDigits(base);
        if (isValidCpf(cpf)) return cpf;
    }
}
