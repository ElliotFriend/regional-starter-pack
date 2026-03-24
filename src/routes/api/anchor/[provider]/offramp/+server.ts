/**
 * Off-Ramp API endpoint
 * POST: Create an off-ramp transaction (Digital Asset -> Local Currency)
 * GET: Get off-ramp transaction status
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const {
            customerId,
            quoteId,
            stellarAddress,
            fromCurrency,
            toCurrency,
            amount,
            bankAccount,
            fiatAccountId: existingFiatAccountId,
            memo,
        } = body;

        if (!customerId || !quoteId || !stellarAddress || !fromCurrency || !toCurrency || !amount) {
            throw error(400, {
                message:
                    'customerId, quoteId, stellarAddress, fromCurrency, toCurrency, and amount are required',
            });
        }

        // Either need existing fiatAccountId or bankAccount to register new one
        if (!existingFiatAccountId && !bankAccount) {
            throw error(400, {
                message: 'Either fiatAccountId or bankAccount is required',
            });
        }

        const anchor = getAnchor(provider);
        let fiatAccountId: string;

        if (existingFiatAccountId) {
            // Use existing fiat account
            fiatAccountId = existingFiatAccountId;
        } else {
            // Register new fiat account
            let account;

            if (bankAccount.type === 'pix') {
                const { pixKey, pixKeyType, taxId, accountHolderName } = bankAccount;
                if (!pixKey || !taxId || !accountHolderName) {
                    throw error(400, {
                        message:
                            'bankAccount must include pixKey, taxId, and accountHolderName for PIX',
                    });
                }
                account = {
                    type: 'pix' as const,
                    pixKey,
                    pixKeyType: pixKeyType || undefined,
                    taxId,
                    accountHolderName,
                };
            } else {
                const { bankName, clabe, beneficiary } = bankAccount;
                if (!clabe || !beneficiary) {
                    throw error(400, {
                        message: 'bankAccount must include clabe and beneficiary',
                    });
                }
                account = {
                    type: 'spei' as const,
                    clabe,
                    bankName: bankName || undefined,
                    beneficiary,
                };
            }

            const fiatAccount = await anchor.registerFiatAccount({
                customerId,
                account,
            });
            fiatAccountId = fiatAccount.id;
        }

        // Create the offramp transaction
        const transaction = await anchor.createOffRamp({
            customerId,
            quoteId,
            stellarAddress,
            fromCurrency,
            toCurrency,
            amount,
            fiatAccountId,
            memo,
        });

        return json(transaction, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const transactionId = url.searchParams.get('transactionId');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    if (!transactionId) {
        throw error(400, { message: 'transactionId query parameter is required' });
    }

    try {
        const anchor = getAnchor(provider);
        const transaction = await anchor.getOffRampTransaction(transactionId);

        if (!transaction) {
            throw error(404, { message: 'Transaction not found' });
        }

        return json(transaction);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
