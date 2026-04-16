import { describe, it, expect } from 'vitest';
import { displayCurrency, formatAmount, formatCurrency } from '$lib/utils/currency';

describe('displayCurrency', () => {
    it('strips issuer from CODE:ISSUER format', () => {
        expect(displayCurrency('USDC:GA5ZSE...')).toBe('USDC');
    });

    it('returns plain code as-is', () => {
        expect(displayCurrency('MXN')).toBe('MXN');
    });

    it('returns empty string for undefined', () => {
        expect(displayCurrency(undefined)).toBe('');
    });
});

describe('formatAmount', () => {
    it('trims trailing zeros', () => {
        expect(formatAmount('1.2000000')).toBe('1.2');
    });

    it('caps at 7 decimal places', () => {
        expect(formatAmount('1.123456789')).toBe('1.1234568');
    });

    it('handles whole numbers', () => {
        expect(formatAmount('100')).toBe('100');
    });
});

describe('formatCurrency', () => {
    it('formats fiat with 2 decimal places and code', () => {
        const result = formatCurrency('1234.5', 'MXN');
        expect(result).toContain('MXN');
        expect(result).toMatch(/1.*234\.50/);
    });

    it('formats crypto with trimmed decimals', () => {
        expect(formatCurrency('1.2300000', 'USDC:GA5ZSE...')).toBe('1.23 USDC');
    });

    it('treats unknown currencies as crypto', () => {
        expect(formatCurrency('50', 'XLM')).toBe('50 XLM');
    });
});
