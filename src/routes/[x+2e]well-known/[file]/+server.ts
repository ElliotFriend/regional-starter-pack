import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { SEP1_SIGNING_KEY_SECRET } from '$app/env/private';
import { Keypair } from '@stellar/stellar-sdk';

const signingKeyPublicKey = Keypair.fromSecret(SEP1_SIGNING_KEY_SECRET).publicKey();

const TOML_CONTENTS: string = `VERSION="2.7.0"

NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

SIGNING_KEY="${signingKeyPublicKey}"

[DOCUMENTATION]
ORG_NAME="Regional Starter Pack"
ORG_URL="https://www.regionalstarterpack.com"
ORG_DESCRIPTION="An anchor library and demo for the Stellar network."
ORG_KEYBASE="elliotfriend"
ORG_TWITTER="elliotfriend"
ORG_GITHUB="elliotfriend"

[[PRINCIPALS]]
name="Elliot Voris"
email="elliot@stellar.org"
twitter="elliotfriend"
github="elliotfriend"
keybase="elliotfriend"
telegram="ElliotVoris"
`;

export const GET: RequestHandler = async ({ params, setHeaders }) => {
    if (params.file !== 'stellar.toml') {
        error(404, 'well known file not found');
    }

    setHeaders({
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
    });

    return new Response(TOML_CONTENTS);
};
