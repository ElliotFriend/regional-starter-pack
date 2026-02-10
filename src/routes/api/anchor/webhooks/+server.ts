/**
 * Webhook handler for anchor callbacks
 * POST: Receive webhook events from anchors
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac } from 'crypto';
import { ALFREDPAY_WEBHOOK_SECRET } from '$env/static/private';

interface WebhookPayload {
    event: string;
    data: {
        id: string;
        status: string;
        [key: string]: unknown;
    };
    timestamp: string;
    signature?: string;
}

/**
 * Verify HMAC signature for webhook payload
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
    if (!secret) {
        // If no secret configured, skip verification (dev mode)
        console.warn('Webhook secret not configured, skipping signature verification');
        return true;
    }

    const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

    return signature === expectedSignature;
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get('x-webhook-signature') || '';

        // Verify signature
        if (!verifySignature(rawBody, signature, ALFREDPAY_WEBHOOK_SECRET)) {
            throw error(401, { message: 'Invalid webhook signature' });
        }

        const payload: WebhookPayload = JSON.parse(rawBody);

        // Log the webhook event (in production, you'd want structured logging)
        console.log('Received webhook event:', {
            event: payload.event,
            dataId: payload.data.id,
            status: payload.data.status,
            timestamp: payload.timestamp,
        });

        // Handle different event types
        switch (payload.event) {
            case 'onramp.completed':
                // On-ramp transaction completed - digital asset sent to user
                console.log(`On-ramp ${payload.data.id} completed`);
                // TODO: Notify user, update database, etc.
                break;

            case 'onramp.failed':
                // On-ramp transaction failed
                console.log(`On-ramp ${payload.data.id} failed`);
                // TODO: Notify user, handle failure
                break;

            case 'offramp.completed':
                // Off-ramp transaction completed - funds sent to user's bank
                console.log(`Off-ramp ${payload.data.id} completed`);
                // TODO: Notify user, update database, etc.
                break;

            case 'offramp.failed':
                // Off-ramp transaction failed
                console.log(`Off-ramp ${payload.data.id} failed`);
                // TODO: Notify user, handle failure
                break;

            case 'kyc.approved':
                // KYC approved for customer
                console.log(`KYC approved for customer ${payload.data.id}`);
                // TODO: Notify user, enable trading
                break;

            case 'kyc.rejected':
                // KYC rejected for customer
                console.log(`KYC rejected for customer ${payload.data.id}`);
                // TODO: Notify user with reason
                break;

            default:
                console.log(`Unknown webhook event: ${payload.event}`);
        }

        // Acknowledge receipt
        return json({ received: true });
    } catch (err) {
        console.error('Webhook processing error:', err);

        if (err instanceof SyntaxError) {
            throw error(400, { message: 'Invalid JSON payload' });
        }

        throw err;
    }
};
