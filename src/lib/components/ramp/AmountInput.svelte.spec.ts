import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AmountInput from './AmountInput.svelte';

/**
 * Renders with an accessor-backed `amount` prop so the spec can observe what
 * the component writes back through the binding.
 */
function renderWithBinding(initial = '') {
    let amount: unknown = initial;
    render(AmountInput, {
        get amount() {
            return amount as string;
        },
        set amount(value: string) {
            amount = value;
        },
        label: 'Amount (USDC)',
        isWalletConnected: true,
        hasTrustline: true,
        isGettingQuote: false,
        onSubmit: () => {},
    });
    return () => amount;
}

describe('AmountInput', () => {
    it('writes the typed amount back as a string', async () => {
        const amount = renderWithBinding();

        await page.getByLabelText('Amount (USDC)').fill('11');

        expect(amount()).toBe('11');
        expect(typeof amount()).toBe('string');
    });

    it('keeps decimal amounts intact', async () => {
        const amount = renderWithBinding();

        await page.getByLabelText('Amount (USDC)').fill('10.5');

        expect(amount()).toBe('10.5');
    });
});
