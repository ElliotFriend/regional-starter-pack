import { spawn } from 'node:child_process';
import { Keypair } from '@stellar/stellar-sdk';

// Deliberately unconfigured providers: UI checks never need real credentials.
const env = {
    ...process.env,
    PUBLIC_TRMOCK_HOME_DOMAIN: 'anchor.invalid',
    PUBLIC_USDC_ISSUER: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    PUBLIC_STELLAR_NETWORK: 'testnet',
    // Route analysis needs a valid signing key; generate a disposable, unfunded one.
    SEP1_SIGNING_KEY_SECRET: Keypair.random().secret(),
    CHIPPER_API_URL: 'https://chipper.invalid',
    CHIPPER_SECRET_KEY: '',
    ETHERFUSE_API_KEY: '',
    ETHERFUSE_BASE_URL: 'https://etherfuse.invalid',
    KOYWE_CLIENT_ID: '',
    KOYWE_SECRET: '',
    KOYWE_BASE_URL: 'https://koywe.invalid',
    MANTECA_API_KEY: '',
    MANTECA_BASE_URL: 'https://manteca.invalid',
    CRON_SECRET: '',
    BLEND_ADMIN_SECRET: '',
};

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Usage: node scripts/with-test-env.mjs <command> [args...]');
const child = spawn(command, args, { env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
});
child.on('exit', (code) => {
    process.exitCode = code ?? 1;
});
