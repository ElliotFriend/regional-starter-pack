/**
 * PDAX (Philippine Digital Asset Exchange) anchor integration.
 *
 * Public surface for use from server-side anchor factory and SvelteKit
 * route handlers. The internal `reference.ts` and `types.ts` modules are
 * also re-exported for tests and admin tooling that may need them.
 */

export { PdaxClient, type PdaxClientOptions } from './client';
export { PdaxAuth, API_PREFIX, type PdaxAuthOptions } from './auth';
export { InMemoryPdaxStateStore, type PdaxStateStore } from './stateStore';
export type {
    IdentityFieldKind,
    IdentityFieldEnum,
    IdentityFieldSpec,
    BankInfo,
    CryptoToken,
    Country,
    FeeType,
    FiatInMethod,
    FiatOutMethod,
    Purpose,
    RelationshipOfSenderToBeneficiary,
    Sex,
    SourceOfFunds,
    ErrorInfo,
    FiatInMethodInfo,
} from './reference';
export {
    BANK_CODES,
    COUNTRIES,
    ERROR_CODES,
    FEE_TYPES,
    FIAT_DEPOSIT_IDENTITY_FIELDS,
    FIAT_IN_METHODS,
    FIAT_IN_METHODS_INFO,
    FIAT_OUT_METHODS,
    FIAT_WITHDRAW_IDENTITY_FIELDS,
    PURPOSES,
    RELATIONSHIPS,
    SEX_VALUES,
    SOURCES_OF_FUNDS,
    STELLAR_TOKENS,
} from './reference';
