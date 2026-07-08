/**
 * Mexican identity/account number helpers: CURP, RFC, and CLABE.
 *
 * - CURP  — 18-char RENAPO population-registry key for an individual.
 * - RFC   — tax ID; the 13-char *persona física* (individual) form here.
 * - CLABE — 18-digit interbank account number (bank + branch + account + check).
 *
 * Each type gets `…CheckDigit`/`…CheckChar`, `isValid…`, and `generate…`, mirroring
 * `cpf.ts` / `cuit.ts`. Generators produce structurally- and checksum-valid values
 * for sandbox testing; validators accept real ones (case-insensitive, spacing/
 * separators tolerated).
 *
 * Koywe note: for Mexican INDIVIDUALS Koywe wants `documentType: "CURP"` (RFC is
 * for companies). CLABE is the MXN payout account number for off-ramps.
 */

// =============================================================================
// CURP — 18-char individual registry key
// =============================================================================

/*
 * `AAAA######SEE CCC H D`: 4 name letters (1st + 1st internal vowel of the
 * paternal surname, 1st letter of the maternal surname, 1st letter of the given
 * name), 6-digit birthdate `YYMMDD`, sex `H`/`M`, a 2-letter state code, 3 more
 * internal consonants, a homoclave char (`0-9` born <2000, `A-Z` born ≥2000),
 * and a mod-10 check digit.
 *
 * Check digit (RENAPO): map each of the first 17 chars to its index in
 * `0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ`, multiply by the weight `18 - i`
 * (`i` 0-based), sum, then `(10 - sum % 10) % 10`.
 */

const CURP_DICT = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

/** The 32 Mexican state codes plus `NE` (born abroad) used in CURP positions 12–13. */
export const CURP_STATES = [
    'AS',
    'BC',
    'BS',
    'CC',
    'CL',
    'CM',
    'CS',
    'CH',
    'DF',
    'DG',
    'GT',
    'GR',
    'HG',
    'JC',
    'MC',
    'MN',
    'MS',
    'NT',
    'NL',
    'OC',
    'PL',
    'QT',
    'QR',
    'SP',
    'SL',
    'SR',
    'TC',
    'TS',
    'TL',
    'VZ',
    'YN',
    'ZS',
    'NE',
] as const;

const CURP_RE = new RegExp(
    '^[A-Z][AEIOUX][A-Z]{2}' + // name letters (2nd is a vowel, or X)
        '\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])' + // YYMMDD
        '[HM]' + // sex
        `(?:${CURP_STATES.join('|')})` + // state
        '[B-DF-HJ-NP-TV-Z]{3}' + // internal consonants
        '[0-9A-Z]\\d$', // homoclave + check digit
);

/** Compute the RENAPO mod-10 check digit for the first 17 CURP chars (`0–9`). */
export function curpCheckDigit(first17: string): number {
    let sum = 0;
    for (let i = 0; i < 17; i++) {
        sum += CURP_DICT.indexOf(first17[i]) * (18 - i);
    }
    return (10 - (sum % 10)) % 10;
}

/** `true` if `value` (case-insensitive, surrounding space ok) is a valid CURP. */
export function isValidCurp(value: string): boolean {
    const curp = value.trim().toUpperCase();
    if (!CURP_RE.test(curp)) return false;
    return curpCheckDigit(curp.slice(0, 17)) === Number(curp[17]);
}

/** Male (`H`) or female (`M`) marker in CURP position 11. */
export type CurpSex = 'H' | 'M';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const VOWELS = 'AEIOU';
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'; // matches [B-DF-HJ-NP-TV-Z]
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
const digits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
/** Random `YYMMDD` with day ≤28 (valid in every month). */
const randomYyMmDd = () =>
    digits(2) +
    String(1 + Math.floor(Math.random() * 12)).padStart(2, '0') +
    String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');

/**
 * Generate a random but structurally- and checksum-valid 18-char CURP. Defaults
 * to a random sex; pass one to fix it. State code, birthdate, name letters, and
 * homoclave are randomized within the valid character sets.
 */
export function generateCurp(sex?: CurpSex): string {
    const s = sex ?? (Math.random() < 0.5 ? 'H' : 'M');
    const state = CURP_STATES[Math.floor(Math.random() * CURP_STATES.length)];
    const first17 =
        pick(LETTERS) +
        pick(VOWELS) +
        pick(LETTERS) +
        pick(LETTERS) +
        randomYyMmDd() +
        s +
        state +
        pick(CONSONANTS) +
        pick(CONSONANTS) +
        pick(CONSONANTS) +
        pick(ALNUM);
    return first17 + curpCheckDigit(first17);
}

// =============================================================================
// RFC — 13-char persona física (individual) tax ID
// =============================================================================

/*
 * `AAAA######XXD`: 4 name letters, 6-digit birthdate `YYMMDD`, a 2-char
 * homoclave, and 1 check character. Check char (SAT): map each of the first 12
 * chars to its index in `0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ`, multiply by
 * the weight `13 - i` (`i` 0-based), sum, `n = (11 - sum % 11) % 11`; `10 → 'A'`.
 */

const RFC_DICT = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';
const RFC_RE = /^[A-ZÑ&]{4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z\d]{2}[A-Z\d]$/;

/** Compute the SAT check character for the first 12 RFC chars (`'0'`–`'9'` or `'A'`). */
export function rfcCheckChar(first12: string): string {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += RFC_DICT.indexOf(first12[i]) * (13 - i);
    }
    const n = (11 - (sum % 11)) % 11;
    return n === 10 ? 'A' : String(n);
}

/** `true` if `value` (case-insensitive, surrounding space ok) is a valid 13-char RFC. */
export function isValidRfc(value: string): boolean {
    const rfc = value.trim().toUpperCase();
    if (!RFC_RE.test(rfc)) return false;
    return rfcCheckChar(rfc.slice(0, 12)) === rfc[12];
}

/** Generate a random but structurally- and checksum-valid 13-char persona-física RFC. */
export function generateRfc(): string {
    const first12 =
        pick(LETTERS) +
        pick(LETTERS) +
        pick(LETTERS) +
        pick(LETTERS) +
        randomYyMmDd() +
        pick(ALNUM) +
        pick(ALNUM);
    return first12 + rfcCheckChar(first12);
}

// =============================================================================
// CLABE — 18-digit interbank account number
// =============================================================================

/*
 * 3-digit bank code + 3-digit branch (plaza) + 11-digit account + 1 check digit.
 * Check digit: for each of the first 17 digits, `(digit * weight) % 10` with the
 * weights `[3, 7, 1]` cycled, sum, then `(10 - sum % 10) % 10`.
 */

const CLABE_WEIGHTS = [3, 7, 1] as const;

/** Compute the CLABE check digit for the first 17 digits (`0–9`). */
export function clabeCheckDigit(first17: string): number {
    let sum = 0;
    for (let i = 0; i < 17; i++) {
        sum += (Number(first17[i]) * CLABE_WEIGHTS[i % 3]) % 10;
    }
    return (10 - (sum % 10)) % 10;
}

/** `true` if `value` (with or without spaces/`-`) is a checksum-valid 18-digit CLABE. */
export function isValidClabe(value: string): boolean {
    const clabe = value.replace(/[\s-]/g, '');
    if (!/^\d{18}$/.test(clabe)) return false;
    return clabeCheckDigit(clabe.slice(0, 17)) === Number(clabe[17]);
}

/**
 * Generate a random but checksum-valid 18-digit CLABE (no separators). Pass a
 * 3-digit `bankCode` to fix the issuing bank; the branch and account are random.
 */
export function generateClabe(bankCode?: string): string {
    const bank = bankCode ?? digits(3);
    if (!/^\d{3}$/.test(bank)) throw new Error(`bankCode must be 3 digits, got: ${bankCode}`);
    const first17 = bank + digits(3) + digits(11);
    return first17 + clabeCheckDigit(first17);
}
