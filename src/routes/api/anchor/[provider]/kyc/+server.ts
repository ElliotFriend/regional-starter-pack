/**
 * KYC API endpoint
 * GET: Get KYC URL, status, or requirements
 * POST: Submit KYC data
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const customerId = url.searchParams.get('customerId');
    const type = url.searchParams.get('type') || 'status';
    const country = url.searchParams.get('country') ?? undefined;
    const publicKey = url.searchParams.get('publicKey') || undefined;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const anchor = getAnchor(provider);

        if (type === 'requirements') {
            if (!anchor.getKycRequirements) {
                throw error(400, { message: 'Provider does not support KYC requirements' });
            }
            const requirements = await anchor.getKycRequirements(country);
            return json(requirements);
        }

        if (type === 'iframe') {
            if (!anchor.getKycUrl) {
                throw error(501, { message: 'Provider does not support KYC URL generation' });
            }
            const bankAccountId = url.searchParams.get('bankAccountId') || undefined;
            const kycUrl = await anchor.getKycUrl(customerId!, publicKey, bankAccountId);
            return json({ url: kycUrl });
        }

        // Default: return status
        if (!customerId) {
            throw error(400, { message: 'customerId query parameter is required' });
        }
        const status = await anchor.getKycStatus(customerId, publicKey);
        return json({ status });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const POST: RequestHandler = async ({ params, url, request }) => {
    const { provider } = params;
    const type = url.searchParams.get('type');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const anchor = getAnchor(provider);

        // Unified KYC submission via shared Anchor interface
        if (type === 'submit-kyc') {
            if (!anchor.submitKyc) {
                throw error(400, { message: 'Provider does not support KYC submission' });
            }

            const contentType = request.headers.get('content-type') || '';

            if (contentType.includes('multipart/form-data')) {
                // FormData body: fields as JSON string + document File objects
                const formData = await request.formData();
                const customerId = formData.get('customerId') as string;
                const fields = JSON.parse(formData.get('fields') as string);
                const metadata = formData.has('metadata')
                    ? JSON.parse(formData.get('metadata') as string)
                    : undefined;

                const documents: Record<string, File | string> = {};
                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('doc_')) {
                        const docKey = key.slice(4);
                        documents[docKey] = value as File | string;
                    }
                }

                const result = await anchor.submitKyc(customerId, {
                    fields,
                    documents,
                    metadata,
                });
                return json(result);
            } else {
                // JSON body
                const body = await request.json();
                const { customerId, data } = body;
                const result = await anchor.submitKyc(customerId, data);
                return json(result);
            }
        }

        throw error(400, { message: 'type query parameter must be "submit-kyc"' });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
