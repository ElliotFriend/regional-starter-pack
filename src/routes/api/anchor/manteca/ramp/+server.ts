/**
 * Manteca ramp endpoint (synthetics).
 * POST: create a ramp-on or ramp-off synthetic.
 *   on-ramp  body: { action: 'onramp', userAnyId, asset, against, stellarAddress, assetAmount?|againstAmount?, priceCode?, externalId? }
 *   off-ramp body: { action: 'offramp', userAnyId, asset, against, destinationAddress, assetAmount?|againstAmount?, network?, bankCode?, accountType?, priceCode?, externalId? }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const manteca = getManteca();

        if (body.action === 'onramp') {
            if (!body.userAnyId || !body.asset || !body.against || !body.stellarAddress) {
                throw error(400, {
                    message: 'userAnyId, asset, against and stellarAddress are required',
                });
            }
            const synthetic = await manteca.createRampOn({
                userAnyId: body.userAnyId,
                asset: body.asset,
                against: body.against,
                stellarAddress: body.stellarAddress,
                assetAmount: body.assetAmount,
                againstAmount: body.againstAmount,
                priceCode: body.priceCode,
                externalId: body.externalId,
                sessionId: body.sessionId,
            });
            return json(synthetic, { status: 201 });
        }

        if (body.action === 'offramp') {
            if (!body.userAnyId || !body.asset || !body.against || !body.destinationAddress) {
                throw error(400, {
                    message: 'userAnyId, asset, against and destinationAddress are required',
                });
            }
            const synthetic = await manteca.createRampOff({
                userAnyId: body.userAnyId,
                asset: body.asset,
                against: body.against,
                destinationAddress: body.destinationAddress,
                assetAmount: body.assetAmount,
                againstAmount: body.againstAmount,
                network: body.network,
                bankCode: body.bankCode,
                accountType: body.accountType,
                priceCode: body.priceCode,
                externalId: body.externalId,
                sessionId: body.sessionId,
            });
            return json(synthetic, { status: 201 });
        }

        throw error(400, { message: "action must be 'onramp' or 'offramp'" });
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
