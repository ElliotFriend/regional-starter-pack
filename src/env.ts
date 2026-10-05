import { defineEnvVars } from '@sveltejs/kit/env';

// `static: true` vars are inlined at build time (and must be set to build). The
// rest are read at runtime and fall back to '' when unset; their consumers treat
// '' as missing (`isAuthorizedCron` rejects it, `getBlendConfig` throws).
export const variables = defineEnvVars({
    CRON_SECRET: { schema: (input) => input ?? '' },
    PUBLIC_TRMOCK_HOME_DOMAIN: { public: true, static: true },
    PUBLIC_USDC_ISSUER: { public: true, static: true },
    PUBLIC_STELLAR_NETWORK: { public: true, static: true },
    SEP1_SIGNING_KEY_SECRET: { static: true },
    CHIPPER_API_URL: { static: true },
    CHIPPER_SECRET_KEY: { static: true },
    ETHERFUSE_API_KEY: { static: true },
    ETHERFUSE_BASE_URL: { static: true },
    KOYWE_CLIENT_ID: { static: true },
    KOYWE_SECRET: { static: true },
    KOYWE_BASE_URL: { static: true },
    MANTECA_API_KEY: { static: true },
    MANTECA_BASE_URL: { static: true },
    BLEND_EMITTER_ADDRESS: { schema: (input) => input ?? '' },
    BLEND_BACKSTOP_ADDRESS: { schema: (input) => input ?? '' },
    BLEND_POOL_ADDRESS: { schema: (input) => input ?? '' },
    BLEND_ORACLE_ADDRESS: { schema: (input) => input ?? '' },
    BLEND_ADMIN_SECRET: { schema: (input) => input ?? '' },
});
