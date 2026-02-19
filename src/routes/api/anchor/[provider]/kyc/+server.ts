/**
 * KYC API endpoint
 * GET: Get KYC iframe URL, status, or requirements
 * POST: Submit KYC data or files
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider, AnchorError } from '$lib/anchors';
import { AlfredPayClient } from '$lib/anchors/alfredpay/client';
import type { AlfredPayKycFileType } from '$lib/anchors/alfredpay/types';
import { BlindPayClient } from '$lib/anchors/blindpay/client';

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const customerId = url.searchParams.get('customerId');
    const type = url.searchParams.get('type') || 'status';
    const country = url.searchParams.get('country') || 'MX';
    const publicKey = url.searchParams.get('publicKey') || undefined;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const anchor = getAnchor(provider);

        if (type === 'tos') {
            if (anchor instanceof BlindPayClient) {
                const redirectUrl = url.searchParams.get('redirectUrl') || undefined;
                const tosUrl = await anchor.generateTosUrl(redirectUrl);
                return json({ url: tosUrl });
            }
            throw error(400, { message: 'Provider does not support ToS URL generation' });
        }

        if (type === 'requirements') {
            if (anchor instanceof AlfredPayClient) {
                const requirements = await anchor.getKycRequirements(country);
                return json(requirements);
            }
            throw error(400, { message: 'Provider does not support KYC requirements' });
        }

        if (type === 'submission') {
            if (!customerId) {
                throw error(400, { message: 'customerId query parameter is required' });
            }
            if (anchor instanceof AlfredPayClient) {
                const submission = await anchor.getKycSubmission(customerId);
                return json({ submission });
            }
            throw error(400, { message: 'Provider does not support KYC submission lookup' });
        }

        if (type === 'submission-status') {
            const submissionId = url.searchParams.get('submissionId');
            if (!customerId || !submissionId) {
                throw error(400, {
                    message: 'customerId and submissionId query parameters are required',
                });
            }
            if (anchor instanceof AlfredPayClient) {
                const status = await anchor.getKycSubmissionStatus(customerId, submissionId);
                return json(status);
            }
            throw error(400, { message: 'Provider does not support KYC submission status' });
        }

        if (type === 'iframe') {
            const bankAccountId = url.searchParams.get('bankAccountId') || undefined;
            const iframeUrl = await anchor.getKycIframeUrl(customerId!, publicKey, bankAccountId);
            return json({ url: iframeUrl });
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

        // BlindPay receiver creation (combined customer + KYC)
        if (type === 'receiver') {
            if (!(anchor instanceof BlindPayClient)) {
                throw error(400, { message: 'Provider does not support receiver creation' });
            }

            const body = await request.json();
            const receiver = await anchor.createReceiver(body);
            return json(receiver);
        }

        if (!(anchor instanceof AlfredPayClient)) {
            throw error(400, { message: 'Provider does not support KYC submission' });
        }

        if (type === 'data') {
            const body = await request.json();
            const { customerId, kycData } = body;

            if (!customerId || !kycData) {
                throw error(400, { message: 'customerId and kycData are required' });
            }

            const result = await anchor.submitKycData(customerId, kycData);
            return json(result);
        }

        if (type === 'file') {
            const formData = await request.formData();
            const customerId = formData.get('customerId') as string;
            const submissionId = formData.get('submissionId') as string;
            const fileType = formData.get('fileType') as AlfredPayKycFileType;
            const file = formData.get('file') as File;

            if (!customerId || !submissionId || !fileType || !file) {
                throw error(400, {
                    message: 'customerId, submissionId, fileType, and file are required',
                });
            }

            const result = await anchor.submitKycFile(
                customerId,
                submissionId,
                fileType,
                file,
                file.name,
            );
            return json(result);
        }

        if (type === 'submit') {
            const body = await request.json();
            const { customerId, submissionId } = body;

            if (!customerId || !submissionId) {
                throw error(400, { message: 'customerId and submissionId are required' });
            }

            await anchor.finalizeKycSubmission(customerId, submissionId);
            return json({ success: true, message: 'KYC submission finalized' });
        }

        throw error(400, { message: 'type query parameter must be "data", "file", or "submit"' });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
