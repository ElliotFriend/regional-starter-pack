/**
 * Off-Ramp API endpoint
 * POST: Create an off-ramp transaction (Digital Asset -> Local Currency)
 * GET: Get off-ramp transaction status
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider, AnchorError } from '$lib/anchors';

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
            bankAccountInfo,
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
        let bankInfo: {
            bankName: string;
            accountNumber: string;
            clabe: string;
            beneficiary: string;
        };

        if (existingFiatAccountId) {
            // Use existing fiat account
            fiatAccountId = existingFiatAccountId;
            bankInfo = bankAccountInfo || {
                bankName: '',
                accountNumber: '',
                clabe: '',
                beneficiary: '',
            };
        } else {
            // Register new fiat account
            const { bankName, accountNumber, clabe, beneficiary } = bankAccount;
            if (!bankName || !accountNumber || !clabe || !beneficiary) {
                throw error(400, {
                    message:
                        'bankAccount must include bankName, accountNumber, clabe, and beneficiary',
                });
            }

            const fiatAccount = await anchor.registerFiatAccount({
                customerId,
                bankAccount: { bankName, accountNumber, clabe, beneficiary },
            });
            fiatAccountId = fiatAccount.id;
            bankInfo = { bankName, accountNumber, clabe, beneficiary };
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
            bankAccountInfo: bankInfo,
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
