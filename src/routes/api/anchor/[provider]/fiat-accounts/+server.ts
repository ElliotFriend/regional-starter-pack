/**
 * Fiat Accounts API endpoint
 * GET: List saved fiat accounts for a customer
 * POST: Register a new fiat account (bank account) for a customer
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
        const { customerId, publicKey, type } = body;

        if (!customerId) {
            throw error(400, { message: 'customerId is required' });
        }

        const anchor = getAnchor(provider);
        let account;

        if (type === 'pix') {
            const { pixKey, pixKeyType, taxId, accountHolderName } = body;
            if (!pixKey || !taxId || !accountHolderName) {
                throw error(400, {
                    message: 'pixKey, taxId, and accountHolderName are required for PIX accounts',
                });
            }
            account = {
                type: 'pix' as const,
                pixKey,
                pixKeyType: pixKeyType || undefined,
                taxId,
                accountHolderName,
            };
        } else if (type === 'instapay' || type === 'pesonet') {
            const { bank_code, account_name, account_number } = body;
            if (!bank_code || !account_name || !account_number) {
                throw error(400, {
                    message:
                        'bank_code, account_name, and account_number are required for InstaPay/PESONet accounts',
                });
            }
            account = {
                type: type as 'instapay' | 'pesonet',
                bank_code,
                account_name,
                account_number,
            };
        } else {
            const { clabe, bankName, beneficiary } = body;
            if (!clabe || !beneficiary) {
                throw error(400, {
                    message: 'clabe and beneficiary are required for SPEI accounts',
                });
            }
            account = {
                type: 'spei' as const,
                clabe,
                bankName: bankName || undefined,
                beneficiary,
            };
        }

        if (!anchor.registerFiatAccount) {
            throw error(400, {
                message: `${provider} does not support inline fiat-account registration; register accounts via the anchor's hosted onboarding UI instead`,
            });
        }

        const result = await anchor.registerFiatAccount({
            customerId,
            publicKey: publicKey || undefined,
            account,
        });

        return json(result, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const customerId = url.searchParams.get('customerId');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    if (!customerId) {
        throw error(400, { message: 'customerId query parameter is required' });
    }

    try {
        const anchor = getAnchor(provider);
        const accounts = await anchor.getFiatAccounts(customerId);
        return json(accounts);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
