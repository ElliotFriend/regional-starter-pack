# Koywe Multi-Country Expansion (Mexico + Colombia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Koywe anchor (currently Argentina-only) into Mexico (MXN) and Colombia (COP) — both on-ramp and off-ramp — by parameterizing the single existing flow off a per-market config selected via a `?region=` query param, matching the Etherfuse multi-country pattern.

**Architecture:** The `KoyweClient` is already currency-agnostic (`getQuote`/`getPaymentProviders` take a `fiatCurrency`). Argentina-specific assumptions live in (a) rail label/mapping helpers in `client.ts`, (b) the `KoyweRail` union, and (c) the flow pages + landing page that hard-code `fiatCurrency='ARS'`/`fiatCountry='ARG'`. We introduce a `KOYWE_MARKETS` config keyed by region id and follow the **Etherfuse precedent**: the flat `/anchors/koywe/onramp` + `/offramp` routes stay put and read the region from `page.url.searchParams.get('region')` (default `argentina`), deriving currency/country/document-type/account-field/test-data from the market config reactively. The landing page links to `…/onramp?region={id}`. Config (`regions.ts`, `anchors.ts`, `constants.ts`, `rails.ts`) gains Mexico + Colombia entries.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, Tailwind, Vitest + MSW. Package manager **pnpm** (never npx).

## Global Constraints

- Format with `pnpm format`; lint with `pnpm lint`; tests via `pnpm test:run`; type/svelte check via `pnpm check`. Never `npx prettier`.
- TDD: write failing tests first for all pure/config/client logic (Vitest + MSW), per the project's RED→GREEN→VERIFY rule.
- `.svelte` / `.svelte.ts` edits: validate with the Svelte MCP `svelte-autofixer` tool (or the `svelte:svelte-file-editor` agent) until it returns no issues, before considering the step done.
- `{#each}` blocks require a key: `{#each items as item (item.id)}`.
- Unused params prefixed `_`.
- Never log credentials; the `debug` flag already gates client logging — don't change that.
- **Region selection = `?region=` query param**, mirroring `src/routes/anchors/etherfuse/onramp/+page.svelte` (`page.url.searchParams.get('region') ?? 'mexico'` via `$derived`). No `[region]` route segment, no `+layout.ts` loader.
- **Verification ceiling (known, do not fight it):** Koywe's sandbox never settles the `USDC Stellar` delivery leg (confirmed Koywe-side), and off-ramp `POST /rest/bank-accounts` runs an ownership check that rejects accounts in sandbox. So for every market the realistic manual-verification bar is: KYC submit accepted → payment methods load → executable quote returns → on-ramp order created with deposit instructions (off-ramp: bank-account registration attempted). No market reaches `DELIVERED` on Stellar in sandbox — same ceiling Argentina ships at today. Unit tests (mocked) still exercise the full happy path.

### Spec facts this plan relies on (researched 2026-06-26, live docs + live sandbox)

- `USDC Stellar` pairs with ARS, CLP, MXN, COP, PEN, BRL (live `GET /rest/token-currencies`).
- On-ramp payment providers (live `GET /rest/payment-providers?symbol=`): **MXN** → `WIREMX` (=SPEI), `STP`; **COP** → `PSE`, `BANCOLOMBIA`, `NEQUI`, `PALOMMA`, `WIRECO`.
- Off-ramp `POST /rest/bank-accounts`: `currencySymbol` enum = `[CLP, COP, MXN, PEN]`, `countryCode` enum = `[MEX, CHL, COL, PER]` — **MEX and COL are in it** (ARS/BRL are not, which is why Brazil is out of scope here). `accountType` ∈ `{checking, savings}`. The local identifier (CLABE for MX, account number for CO) goes in `accountNumber`.
- KYC `documentType` enum (from `koywe.openapi.yaml`): `[RUT, DNI, RFC, CE, CED_CIU, CED_EXT, NIT, TI, NUIP, TE, PPT, PASS, PEP]`. The live compliance page mentions CURP (MX individuals) / RC / RUC / CUIT but those are **absent from the wire enum** → default to enum-safe values (`RFC` for MX, `CED_CIU` for CO) and treat the document-type-vs-individual question as `unverified` (the field stays user-editable).
- No documented sandbox test identities exist for MX/CO (only the AR DNI↔CVU whitelist). So MX/CO off-ramp registration is code-complete + unit-tested but not sandbox-verifiable end-to-end.

---

### Task 1: Add the `pse` payment rail + wire Koywe rails into Mexico & Colombia regions

**Files:**

- Modify: `src/lib/config/rails.ts` (add `pse` rail)
- Modify: `src/lib/config/regions.ts:26-73` (Mexico + Colombia `anchors` and `paymentRails`, descriptions)
- Test: `tests/config/rails.test.ts`, `tests/config/regions.test.ts`

**Interfaces:**

- Produces: `PAYMENT_RAILS.pse` (id `'pse'`); `REGIONS.mexico.anchors` includes `'koywe'`; `REGIONS.colombia.anchors` includes `'koywe'` and `REGIONS.colombia.paymentRails` includes `PAYMENT_RAILS.pse`.

- [ ] **Step 1: Write failing tests**

In `tests/config/rails.test.ts` add:

```ts
import { describe, it, expect } from 'vitest';
import { PAYMENT_RAILS, getPaymentRail } from '$lib/config/rails';

describe('pse rail', () => {
    it('defines the Colombian PSE rail', () => {
        expect(PAYMENT_RAILS.pse).toBeDefined();
        expect(PAYMENT_RAILS.pse.id).toBe('pse');
        expect(PAYMENT_RAILS.pse.type).toBe('bank_transfer');
        expect(getPaymentRail('pse')?.name).toBe('PSE');
    });
});
```

In `tests/config/regions.test.ts` add:

```ts
import { REGIONS } from '$lib/config/regions';

describe('Koywe regional coverage', () => {
    it('lists Koywe in Mexico and Colombia', () => {
        expect(REGIONS.mexico.anchors).toContain('koywe');
        expect(REGIONS.colombia.anchors).toContain('koywe');
    });
    it('adds the PSE rail to Colombia', () => {
        expect(REGIONS.colombia.paymentRails.map((r) => r.id)).toContain('pse');
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test:run tests/config/rails.test.ts tests/config/regions.test.ts`
Expected: FAIL (`PAYMENT_RAILS.pse` undefined; `anchors` lacks `'koywe'`).

- [ ] **Step 3: Add the `pse` rail**

In `src/lib/config/rails.ts`, inside `PAYMENT_RAILS`, after the `breb` entry add:

```ts
    pse: {
        id: 'pse',
        name: 'PSE',
        description:
            'Pagos Seguros en Línea — Colombia’s bank-debit rail for real-time COP transfers from a bank account.',
        type: 'bank_transfer',
    },
```

- [ ] **Step 4: Wire Koywe into Mexico & Colombia regions**

In `src/lib/config/regions.ts`:

Mexico (`mexico` entry) — change `anchors` and append Koywe to the description:

```ts
        description:
            'Mexico has a growing crypto ecosystem with SPEI providing fast, reliable bank transfers. Etherfuse ramps to CETES stablebonds and Koywe ramps Mexican pesos to USDC on Stellar over SPEI.',
        paymentRails: [PAYMENT_RAILS.spei],
        anchors: ['etherfuse', 'koywe'],
```

Colombia (`colombia` entry) — add the PSE rail, add Koywe, update description:

```ts
        description:
            'Colombia is rolling out Bre-B, the central bank’s instant payment system. Manteca ramps Colombian pesos to USDC on Stellar over BRE-B, and Koywe ramps COP to USDC over PSE — both with competitive FX.',
        paymentRails: [PAYMENT_RAILS.breb, PAYMENT_RAILS.pse],
        anchors: ['manteca', 'koywe'],
```

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm test:run tests/config/rails.test.ts tests/config/regions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config/rails.ts src/lib/config/regions.ts tests/config/rails.test.ts tests/config/regions.test.ts
git commit -m "feat(koywe): add PSE rail and wire Koywe into Mexico & Colombia regions"
```

---

### Task 2: Expand `KoyweRail` and teach the client MX/CO rail labels

**Files:**

- Modify: `src/lib/anchors/koywe/types.ts` (the `KoyweRail` union)
- Modify: `src/lib/anchors/koywe/client.ts:91-93` (`supportedRails`), `:647-671` (`labelForProvider`, `railForProvider`)
- Test: `tests/anchors/koywe/client.test.ts`

**Interfaces:**

- Consumes: `KoywePaymentMethod` (unchanged shape `{ id, name, label, rail, fee }`).
- Produces: `KoyweRail = 'wirear' | 'qri' | 'spei' | 'pse'`; `getPaymentProviders('MXN')` returns a method labelled `'Bank transfer (SPEI)'` with `rail: 'spei'` for provider `WIREMX`; `getPaymentProviders('COP')` returns `'PSE'` with `rail: 'pse'` for provider `PSE`.

- [ ] **Step 1: Write failing tests**

In `tests/anchors/koywe/client.test.ts`, add to the payment-providers describe block (follow the existing MSW mock pattern in that file — mock `GET /rest/payment-providers` keyed on the `symbol` query param):

```ts
it('labels and maps Mexican SPEI (WIREMX) providers', async () => {
    // MSW: respond to ?symbol=MXN with [{ _id: 'm1', name: 'WIREMX', fee: 0 }, { _id: 'm2', name: 'STP', fee: 0 }]
    const methods = await client.getPaymentProviders('MXN');
    const spei = methods.find((m) => m.name === 'WIREMX');
    expect(spei?.label).toBe('Bank transfer (SPEI)');
    expect(spei?.rail).toBe('spei');
});

it('labels and maps Colombian PSE providers', async () => {
    // MSW: respond to ?symbol=COP with [{ _id: 'c1', name: 'PSE', fee: 0 }, { _id: 'c2', name: 'NEQUI', fee: 0 }]
    const methods = await client.getPaymentProviders('COP');
    const pse = methods.find((m) => m.name === 'PSE');
    expect(pse?.label).toBe('PSE');
    expect(pse?.rail).toBe('pse');
    const nequi = methods.find((m) => m.name === 'NEQUI');
    expect(nequi?.label).toBe('Nequi');
    expect(nequi?.rail).toBeUndefined();
});
```

(Extend the existing MSW handler for `/rest/payment-providers` to branch on `url.searchParams.get('symbol')` and return the per-currency arrays above; keep the existing ARS case.)

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test:run tests/anchors/koywe/client.test.ts`
Expected: FAIL (labels fall through to the raw provider name; rails undefined).

- [ ] **Step 3: Expand the rail union**

In `src/lib/anchors/koywe/types.ts`, replace:

```ts
export type KoyweRail = 'wirear' | 'qri';
```

with:

```ts
export type KoyweRail = 'wirear' | 'qri' | 'spei' | 'pse';
```

- [ ] **Step 4: Expand `supportedRails` and the provider helpers**

In `src/lib/anchors/koywe/client.ts`, replace lines 92-93:

```ts
    /** Local payment rails this app surfaces for Koywe (Argentina). */
    readonly supportedRails: readonly KoyweRail[] = ['wirear', 'qri'];
```

with:

```ts
    /** Local payment rails this app surfaces for Koywe (per market). */
    readonly supportedRails: readonly KoyweRail[] = ['wirear', 'qri', 'spei', 'pse'];
```

Replace `labelForProvider` (lines 648-659):

```ts
/** Friendly UI label for a Koywe payment-provider name. */
function labelForProvider(name: string): string {
    switch (name.toUpperCase()) {
        case 'WIREAR':
            return 'Bank transfer (CVU)';
        case 'QRI-AR':
            return 'QR transfer';
        case 'KHIPU':
            return 'Khipu';
        case 'WIREMX':
            return 'Bank transfer (SPEI)';
        case 'STP':
            return 'SPEI (STP)';
        case 'PSE':
            return 'PSE';
        case 'BANCOLOMBIA':
            return 'Bancolombia';
        case 'NEQUI':
            return 'Nequi';
        case 'PALOMMA':
            return 'Palomma';
        case 'WIRECO':
            return 'Bank transfer';
        default:
            return name;
    }
}
```

Replace `railForProvider` (lines 662-671):

```ts
/** Map a Koywe provider name to a shared local rail id, if one exists. */
function railForProvider(name: string): KoyweRail | undefined {
    switch (name.toUpperCase()) {
        case 'WIREAR':
            return 'wirear';
        case 'QRI-AR':
            return 'qri';
        case 'WIREMX':
            return 'spei';
        case 'PSE':
            return 'pse';
        default:
            return undefined;
    }
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm test:run tests/anchors/koywe/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/anchors/koywe/types.ts src/lib/anchors/koywe/client.ts tests/anchors/koywe/client.test.ts
git commit -m "feat(koywe): map Mexican SPEI and Colombian PSE payment providers"
```

---

### Task 3: Create the `KOYWE_MARKETS` per-market config

**Files:**

- Create: `src/lib/config/koyweMarkets.ts`
- Test: `tests/config/koywe-markets.test.ts`

**Interfaces:**

- Produces:
    - `interface KoyweKycTestData` (the `kycForm` shape).
    - `interface KoyweMarket { region: string; name: string; currency: string; countryCode: string; documentType: string; offRamp: boolean; accountLabel: string; accountPlaceholder: string; accountType?: 'checking' | 'savings'; testData: KoyweKycTestData; testAccountNumber?: string; }`
    - `const KOYWE_MARKETS: Record<string, KoyweMarket>` keyed by region id (`argentina`, `mexico`, `colombia`).
    - `function getKoyweMarket(region: string): KoyweMarket | undefined`.
    - `function koyweMarketRegionIds(): string[]`.
    - `const DEFAULT_KOYWE_REGION = 'argentina'`.

- [ ] **Step 1: Write failing tests**

Create `tests/config/koywe-markets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    KOYWE_MARKETS,
    getKoyweMarket,
    koyweMarketRegionIds,
    DEFAULT_KOYWE_REGION,
} from '$lib/config/koyweMarkets';

describe('KOYWE_MARKETS', () => {
    it('covers argentina, mexico, colombia', () => {
        expect(koyweMarketRegionIds().sort()).toEqual(['argentina', 'colombia', 'mexico']);
    });

    it('defaults to argentina', () => {
        expect(DEFAULT_KOYWE_REGION).toBe('argentina');
        expect(getKoyweMarket(DEFAULT_KOYWE_REGION)).toBeDefined();
    });

    it('maps each market to a Koywe ISO-3 country code and fiat currency', () => {
        expect(getKoyweMarket('mexico')).toMatchObject({ currency: 'MXN', countryCode: 'MEX' });
        expect(getKoyweMarket('colombia')).toMatchObject({ currency: 'COP', countryCode: 'COL' });
        expect(getKoyweMarket('argentina')).toMatchObject({ currency: 'ARS', countryCode: 'ARG' });
    });

    it('uses wire-enum-safe document types', () => {
        expect(getKoyweMarket('mexico')?.documentType).toBe('RFC');
        expect(getKoyweMarket('colombia')?.documentType).toBe('CED_CIU');
        expect(getKoyweMarket('argentina')?.documentType).toBe('DNI');
    });

    it('marks all three markets as off-ramp capable (MEX/COL/ARG)', () => {
        expect(getKoyweMarket('mexico')?.offRamp).toBe(true);
        expect(getKoyweMarket('colombia')?.offRamp).toBe(true);
    });

    it('gives Colombia a checking/savings account type and Mexico a CLABE label', () => {
        expect(getKoyweMarket('colombia')?.accountType).toBe('savings');
        expect(getKoyweMarket('mexico')?.accountLabel).toBe('CLABE');
    });

    it('returns undefined for an unknown region', () => {
        expect(getKoyweMarket('chile')).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm test:run tests/config/koywe-markets.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the config**

Create `src/lib/config/koyweMarkets.ts`:

```ts
/**
 * Per-market UI configuration for the Koywe anchor.
 *
 * Koywe's crypto API is currency-agnostic; this table is what makes the shared
 * on/off-ramp flow pages render the right currency, country code, document
 * type, payout-account field, and "Fill test data" values per region. Keyed by
 * the region id in `regions.ts`. The flow pages select a market from the
 * `?region=` query param (default `argentina`), mirroring the Etherfuse
 * multi-country pages.
 *
 * `countryCode` is Koywe's ISO-3166 alpha-3 code used by `POST /rest/accounts`
 * and `POST /rest/bank-accounts`. `documentType` defaults to a value present in
 * the documented `documentType` enum (the field stays user-editable in the UI).
 * `offRamp` is true only where Koywe's bank-account `currencySymbol` enum
 * accepts the currency ([CLP, COP, MXN, PEN]) — Brazil/Argentina off-ramp run a
 * different path and are out of scope here (Argentina off-ramp ships with its
 * documented sandbox blocker).
 */

export interface KoyweKycTestData {
    documentNumber: string;
    documentType: string;
    documentCountry: string;
    names: string;
    firstLastname: string;
    dob: string;
    phoneNumber: string;
    activity: string;
    nationality: string;
    gender: '' | 'H' | 'M' | 'O';
    street: string;
    city: string;
    state: string;
    zipCode: string;
    neighborhood: string;
}

export interface KoyweMarket {
    /** Region id in `regions.ts`. */
    region: string;
    /** Display name. */
    name: string;
    /** ISO 4217 fiat currency symbol Koywe quotes against. */
    currency: string;
    /** Koywe ISO-3 country code for accounts / bank-accounts. */
    countryCode: string;
    /** Default KYC document type (must be in the documented enum). */
    documentType: string;
    /** Whether the off-ramp bank-account path is supported for this currency. */
    offRamp: boolean;
    /** Label for the off-ramp payout-account field. */
    accountLabel: string;
    /** Placeholder for the off-ramp payout-account field. */
    accountPlaceholder: string;
    /** Bank-account type, where the country requires it (Colombia). */
    accountType?: 'checking' | 'savings';
    /** "Fill test data" KYC values. */
    testData: KoyweKycTestData;
    /** "Fill test data" payout account number (off-ramp). */
    testAccountNumber?: string;
}

export const DEFAULT_KOYWE_REGION = 'argentina';

export const KOYWE_MARKETS: Record<string, KoyweMarket> = {
    argentina: {
        region: 'argentina',
        name: 'Argentina',
        currency: 'ARS',
        countryCode: 'ARG',
        documentType: 'DNI',
        offRamp: true,
        accountLabel: 'CVU / account number',
        accountPlaceholder: '0000242600000000009120',
        // Sandbox: bank-account registration is ownership-validated against a
        // whitelisted DNI↔CVU pair (and is currently Koywe-side broken).
        testAccountNumber: '0000242600000000009120',
        testData: {
            documentNumber: '34770518',
            documentType: 'DNI',
            documentCountry: 'ARG',
            names: 'Test',
            firstLastname: 'User',
            dob: '1990-01-01',
            phoneNumber: '+5491155551234',
            activity: 'Software Engineer',
            nationality: 'ARG',
            gender: 'O',
            street: 'Av. 9 de Julio 1000',
            city: 'Buenos Aires',
            state: 'CABA',
            zipCode: 'C1043',
            neighborhood: 'Centro',
        },
    },
    mexico: {
        region: 'mexico',
        name: 'Mexico',
        currency: 'MXN',
        countryCode: 'MEX',
        documentType: 'RFC',
        offRamp: true,
        accountLabel: 'CLABE',
        accountPlaceholder: '646180374711307483',
        testAccountNumber: '646180374711307483',
        testData: {
            documentNumber: 'TEST920101HDFXXX01',
            documentType: 'RFC',
            documentCountry: 'MEX',
            names: 'Test',
            firstLastname: 'User',
            dob: '1990-01-01',
            phoneNumber: '+525555551234',
            activity: 'Software Engineer',
            nationality: 'MEX',
            gender: 'O',
            street: 'Av. Reforma 100',
            city: 'Ciudad de México',
            state: 'CDMX',
            zipCode: '06600',
            neighborhood: 'Juárez',
        },
    },
    colombia: {
        region: 'colombia',
        name: 'Colombia',
        currency: 'COP',
        countryCode: 'COL',
        documentType: 'CED_CIU',
        offRamp: true,
        accountLabel: 'Account number',
        accountPlaceholder: '000000000000',
        accountType: 'savings',
        testAccountNumber: '000000000000',
        testData: {
            documentNumber: '1010101010',
            documentType: 'CED_CIU',
            documentCountry: 'COL',
            names: 'Test',
            firstLastname: 'User',
            dob: '1990-01-01',
            phoneNumber: '+573001234567',
            activity: 'Software Engineer',
            nationality: 'COL',
            gender: 'O',
            street: 'Calle 100 # 10-20',
            city: 'Bogotá',
            state: 'Cundinamarca',
            zipCode: '110111',
            neighborhood: 'Chapinero',
        },
    },
};

export function getKoyweMarket(region: string): KoyweMarket | undefined {
    return KOYWE_MARKETS[region];
}

export function koyweMarketRegionIds(): string[] {
    return Object.keys(KOYWE_MARKETS);
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test:run tests/config/koywe-markets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config/koyweMarkets.ts tests/config/koywe-markets.test.ts
git commit -m "feat(koywe): add per-market config for Argentina, Mexico, Colombia"
```

---

### Task 4: Add Mexico & Colombia capabilities to `ANCHORS.koywe` and refresh its scorecard/description

**Files:**

- Modify: `src/lib/config/anchors.ts:312-381` (description, scorecard `local-rails` note, knownIssues, `regions`)
- Test: `tests/config/anchors.test.ts`, `tests/config/scorecard.test.ts`

**Interfaces:**

- Consumes: existing `AnchorProfile`/`AnchorCapability` shapes.
- Produces: `ANCHORS.koywe.regions` has keys `argentina`, `mexico`, `colombia`, each `{ onRamp:true, offRamp:true, paymentRails:[...], tokens:['USDC'], kycRequired:true }`.

- [ ] **Step 1: Write failing tests**

In `tests/config/anchors.test.ts` add (match the file's existing style):

```ts
describe('Koywe multi-country', () => {
    it('serves Argentina, Mexico, and Colombia', () => {
        expect(Object.keys(ANCHORS.koywe.regions).sort()).toEqual([
            'argentina',
            'colombia',
            'mexico',
        ]);
    });
    it('uses SPEI in Mexico and PSE in Colombia', () => {
        expect(ANCHORS.koywe.regions.mexico.paymentRails).toContain('spei');
        expect(ANCHORS.koywe.regions.colombia.paymentRails).toContain('pse');
    });
});
```

In `tests/config/scorecard.test.ts` add (the developer-readiness scorecard joins on `regions`):

```ts
it('reports Koywe across its three markets', () => {
    const readiness = buildReadiness();
    const koywe = readiness.find((e) => e.id === 'koywe');
    expect(koywe?.regions.sort()).toEqual(['argentina', 'colombia', 'mexico']);
});
```

(If `buildReadiness` isn't already imported in that test file, import it from `$lib/config/scorecard`.)

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test:run tests/config/anchors.test.ts tests/config/scorecard.test.ts`
Expected: FAIL (only `argentina` present).

- [ ] **Step 3: Update the description**

In `src/lib/config/anchors.ts`, replace the `koywe.description` (lines 315-316):

```ts
        description:
            'Koywe is a Latin American crypto-finance infrastructure provider offering fiat on/off ramps between local currencies and stablecoins. It ramps Argentine pesos (ARS), Mexican pesos (MXN), and Colombian pesos (COP) to USDC on Stellar via local rails — CVU/QR in Argentina, SPEI in Mexico, and PSE in Colombia.',
```

- [ ] **Step 4: Update the `local-rails` scorecard note**

Replace the `local-rails` entry (lines 322-323) in `koywe.scorecard`:

```ts
            'local-rails': { status: 'met', note: 'WIREAR/QRI (AR) + SPEI (MX) + PSE (CO)' },
```

- [ ] **Step 5: Replace the regional-coverage knownIssue**

Replace the first `knownIssues` entry (lines 350-353, the "Regional coverage: Colombia is live (PSE rails)…" item) with:

```ts
            {
                text: 'Regional coverage wired here: Argentina (CVU/QR), Mexico (SPEI), Colombia (PSE) — all to USDC on Stellar. Chile (CLP) and Peru (PEN) are also supported by Koywe but not yet wired into this app. Brazil (BRL) on-ramps via PIX, but its off-ramp is not in Koywe’s bank-account currency enum, so Brazil is intentionally excluded for now.',
            },
            {
                text: 'Off-ramp payout-account registration is only sandbox-verifiable for Argentina (which has documented whitelisted test pairs, and is itself currently Koywe-side broken). Mexico and Colombia off-ramps are wired to spec but have no published sandbox test identities, so they cannot be verified end-to-end in the sandbox.',
            },
```

- [ ] **Step 6: Add the Mexico & Colombia capabilities**

In `src/lib/config/anchors.ts`, replace the `koywe.regions` block (lines 373-381):

```ts
        regions: {
            argentina: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['wirear', 'qri'],
                tokens: ['USDC'],
                kycRequired: true,
            },
            mexico: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['spei'],
                tokens: ['USDC'],
                kycRequired: true,
            },
            colombia: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['pse'],
                tokens: ['USDC'],
                kycRequired: true,
            },
        },
```

- [ ] **Step 7: Run tests, verify pass**

Run: `pnpm test:run tests/config/anchors.test.ts tests/config/scorecard.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/config/anchors.ts tests/config/anchors.test.ts tests/config/scorecard.test.ts
git commit -m "feat(koywe): add Mexico & Colombia capabilities and refresh scorecard"
```

---

### Task 5: Enable Colombia in `SUPPORTED_COUNTRIES`

**Files:**

- Modify: `src/lib/constants.ts:9-19`
- Test: `tests/config/constants.test.ts`

**Interfaces:**

- Produces: `SUPPORTED_COUNTRIES` contains `{ code: 'CO', name: 'Colombia', currency: 'COP', paymentMethod: 'PSE' }`.

- [ ] **Step 1: Write failing test**

In `tests/config/constants.test.ts` add:

```ts
it('includes Colombia (COP/PSE)', () => {
    expect(SUPPORTED_COUNTRIES.find((c) => c.code === 'CO')).toEqual({
        code: 'CO',
        name: 'Colombia',
        currency: 'COP',
        paymentMethod: 'PSE',
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm test:run tests/config/constants.test.ts`
Expected: FAIL.

- [ ] **Step 3: Uncomment/replace the Colombia entry**

In `src/lib/constants.ts`, change the commented Colombia line (14) so the active array reads:

```ts
export const SUPPORTED_COUNTRIES = [
    { code: 'MX', name: 'Mexico', currency: 'MXN', paymentMethod: 'SPEI' },
    { code: 'BR', name: 'Brazil', currency: 'BRL', paymentMethod: 'PIX' },
    { code: 'AR', name: 'Argentina', currency: 'ARS', paymentMethod: 'WIREAR' },
    { code: 'CO', name: 'Colombia', currency: 'COP', paymentMethod: 'PSE' },
    /** TODO: Enable regions as they come online or as activations approach. */
    // { code: 'CL', name: 'Chile', currency: 'CLP', paymentMethod: 'ACH_CHL' },
    // { code: 'BO', name: 'Bolivia', currency: 'BOB', paymentMethod: 'ACH_BOL' },
    // { code: 'DO', name: 'Dominican Republic', currency: 'DOP', paymentMethod: 'ACH_DOM' },
    // { code: 'US', name: 'United States', currency: 'USD', paymentMethod: 'BANK_USA' },
] as const;
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test:run tests/config/constants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.ts tests/config/constants.test.ts
git commit -m "feat(koywe): enable Colombia in SUPPORTED_COUNTRIES"
```

---

### Task 6: Parameterize the on-ramp page off the `?region=` query param

**Files:**

- Modify: `src/routes/anchors/koywe/onramp/+page.svelte`

**Pattern reference:** `src/routes/anchors/etherfuse/onramp/+page.svelte` — `import { page } from '$app/state'`, `const requestedRegion = $derived(page.url.searchParams.get('region') ?? 'mexico')`, then `$derived` currency/token. Mirror it.

- [ ] **Step 1: Add the imports and region/market derivation**

In the `<script>` import block (after the existing imports), add:

```ts
import { page } from '$app/state';
import { getKoyweMarket, KOYWE_MARKETS, DEFAULT_KOYWE_REGION } from '$lib/config/koyweMarkets';
```

Replace the region-derivation block (lines 27-35):

```ts
// ------------------------------------------------------------------
// Region & token derivation (Koywe — region from ?region= query param)
// ------------------------------------------------------------------

const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

const requestedRegion = $derived(page.url.searchParams.get('region') ?? DEFAULT_KOYWE_REGION);
const market = $derived(getKoyweMarket(requestedRegion) ?? KOYWE_MARKETS[DEFAULT_KOYWE_REGION]);
const fiatCurrency = $derived(market.currency);
const tokenSymbol = 'USDC';
// Koywe returns no Stellar issuer; inject the network-correct USDC issuer.
const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);
```

- [ ] **Step 2: Default the KYC form to the initial market**

The `kycForm` is `$state`, initialized once at component setup. Read the initial market non-reactively for its defaults. Add just above the `kycForm` declaration:

```ts
// Initial market for the one-time KYC-form defaults (the reactive `market`
// above drives all display values; users visit one region per page load).
const initialMarket =
    getKoyweMarket(page.url.searchParams.get('region') ?? DEFAULT_KOYWE_REGION) ??
    KOYWE_MARKETS[DEFAULT_KOYWE_REGION];
```

Replace the `kycForm` initializer (lines 55-71) so the document/nationality defaults come from `initialMarket`:

```ts
let kycForm = $state({
    documentNumber: '',
    documentType: initialMarket.documentType,
    documentCountry: initialMarket.countryCode,
    names: '',
    firstLastname: '',
    dob: '',
    phoneNumber: '',
    activity: '',
    nationality: initialMarket.countryCode,
    gender: '' as '' | 'H' | 'M' | 'O',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    neighborhood: '',
});
```

- [ ] **Step 3: Drive `fillTestData` from the market**

Replace the body of `fillTestData` (lines 158-176):

```ts
function fillTestData() {
    kycForm = { ...market.testData };
}
```

- [ ] **Step 4: Validate the component**

Validate the edited `.svelte` file with the Svelte MCP `svelte-autofixer` tool (or via the `svelte:svelte-file-editor` agent) and resolve everything it flags. The markup already renders `{fiatCurrency}`/`{tokenSymbol}` dynamically, so no template changes are needed beyond what the autofixer requests.

Run: `pnpm check && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Manual sanity (optional, to the verification ceiling)**

`pnpm dev`, open `/anchors/koywe/onramp?region=mexico` and `?region=colombia`. Confirm the header reads "On-Ramp (MXN → USDC)" / "(COP → USDC)", "Fill test data" populates the right country's values, and after email + KYC the payment-method step lists SPEI (MX) / PSE (CO). With no `?region=` it falls back to Argentina. (Delivery won't complete — expected.)

- [ ] **Step 6: Commit**

```bash
git add src/routes/anchors/koywe/onramp/+page.svelte
git commit -m "feat(koywe): select on-ramp market via ?region= query param"
```

---

### Task 7: Parameterize the off-ramp page off the `?region=` query param

**Files:**

- Modify: `src/routes/anchors/koywe/offramp/+page.svelte`

- [ ] **Step 1: Add imports and region/market derivation**

In the `<script>` import block add:

```ts
import { page } from '$app/state';
import { getKoyweMarket, KOYWE_MARKETS, DEFAULT_KOYWE_REGION } from '$lib/config/koyweMarkets';
```

Replace the region-derivation block (lines 21-29):

```ts
// ------------------------------------------------------------------
// Region & token derivation (Koywe — region from ?region= query param)
// ------------------------------------------------------------------

const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

const requestedRegion = $derived(page.url.searchParams.get('region') ?? DEFAULT_KOYWE_REGION);
const market = $derived(getKoyweMarket(requestedRegion) ?? KOYWE_MARKETS[DEFAULT_KOYWE_REGION]);
const fiatCurrency = $derived(market.currency);
const fiatCountry = $derived(market.countryCode);
const tokenSymbol = 'USDC';
const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);
```

- [ ] **Step 2: Default the KYC form to the initial market**

Add above the `kycForm` declaration (mirroring Task 6 Step 2):

```ts
const initialMarket =
    getKoyweMarket(page.url.searchParams.get('region') ?? DEFAULT_KOYWE_REGION) ??
    KOYWE_MARKETS[DEFAULT_KOYWE_REGION];
```

Replace the `kycForm` initializer (lines 50-66) so `documentType: initialMarket.documentType`, `documentCountry: initialMarket.countryCode`, `nationality: initialMarket.countryCode`, all other fields `''`/empty as before.

- [ ] **Step 3: Remove the stale Argentina-only `TODO(koywe)` comment**

Delete the comment block at lines 72-77 (the `TODO(koywe): off-ramp is BLOCKED here…` paragraph). Leave the `accountNumber`/`bankAccountId` state declarations.

- [ ] **Step 4: Drive `fillTestData` from the market**

Replace the body of `fillTestData` (lines 130-153):

```ts
function fillTestData() {
    kycForm = { ...market.testData };
    accountNumber = market.testAccountNumber ?? '';
}
```

- [ ] **Step 5: Pass `accountType` when the market requires it**

In `registerBankAccount`, extend the `createBankAccount` call (lines 212-220):

```ts
const account =
    match ??
    (await koywe.createBankAccount(fetch, {
        email,
        accountNumber: number,
        countryCode: fiatCountry,
        currencySymbol: fiatCurrency,
        documentNumber: kycForm.documentNumber || undefined,
        accountType: market.accountType,
    }));
```

(`CreateBankAccountArgs` already carries optional `accountType` — `client.ts:285`. The `src/lib/api/koywe.ts` `createBankAccount` wrapper forwards the whole args object, so no wrapper change is needed; verify by reading `src/lib/api/koywe.ts:95-103`.)

- [ ] **Step 6: Make the payout-account field + hint market-driven**

Replace the static "CVU / account number" label + placeholder + Argentina-only amber hint (lines 609-631):

```svelte
<h2 class="text-lg font-semibold text-gray-900">Payout account</h2>
<p class="mt-1 text-sm text-gray-500">
    Enter the {market.accountLabel} that will receive your {fiatCurrency}. We'll register it with
    Koywe as your payout account.
</p>
<label class="mt-4 block text-sm font-medium text-gray-700" for="accountNumber">
    {market.accountLabel}
</label>
<input
    id="accountNumber"
    type="text"
    bind:value={accountNumber}
    placeholder={market.accountPlaceholder}
    class="mt-1 block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
/>
{#if market.region === 'argentina'}
    <p class="mt-2 text-xs text-amber-700">
        Heads up: Koywe's sandbox currently rejects bank-account registration with a validation
        error even for its own documented DNI↔CVU test pairs (e.g. DNI
        <span class="font-mono">34770518</span> ↔ CVU
        <span class="font-mono">0000242600000000009120</span>, which "Fill test data" uses). This is
        a known Koywe-side limitation — the off-ramp can't complete past this step until it's
        resolved.
    </p>
{:else}
    <p class="mt-2 text-xs text-amber-700">
        Heads up: Koywe's sandbox has no published test identities for {market.name}, and its
        bank-account ownership validation can't be satisfied without them, so the off-ramp may not
        complete past this step in the sandbox.
    </p>
{/if}
```

- [ ] **Step 7: Validate the component**

Validate with the `svelte-autofixer` tool (or `svelte:svelte-file-editor` agent) until clean.

Run: `pnpm check && pnpm lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/routes/anchors/koywe/offramp/+page.svelte
git commit -m "feat(koywe): select off-ramp market via ?region= query param"
```

---

### Task 8: Make the Koywe landing page multi-region

**Files:**

- Modify: `src/routes/anchors/koywe/+page.svelte`

**Interfaces:**

- Consumes: `getRegionsForAnchor('koywe')` (now Argentina, Mexico, Colombia), `ANCHORS.koywe.regions`. Links carry the region as a `?region=` query param.

- [ ] **Step 1: Replace the single-region script block**

Replace lines 10-13:

```ts
// Koywe serves multiple regions; each links to its own ?region= flow.
const koyweRegions = regions.filter((r) => profile.regions[r.id]);
```

- [ ] **Step 2: Replace the Region `<section>` with a per-region list**

Replace lines 27-77:

```svelte
<section class="mt-8 space-y-4">
    <h2 class="text-lg font-semibold text-gray-900">Regions</h2>
    {#each koyweRegions as r (r.id)}
        {@const cap = profile.regions[r.id]}
        <div class="rounded-lg border border-gray-200 bg-white p-6">
            <div class="flex items-center gap-2">
                <span class="text-xl">{r.flag}</span>
                <h3 class="text-base font-semibold text-gray-900">{r.name}</h3>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="text-gray-500">Currency</span>
                    <p class="font-medium">{r.currency}</p>
                </div>
                <div>
                    <span class="text-gray-500">Rails</span>
                    <p class="font-medium uppercase">{cap.paymentRails.join(', ')}</p>
                </div>
                <div>
                    <span class="text-gray-500">Token</span>
                    <p class="font-medium">{cap.tokens.join(', ')}</p>
                </div>
                <div>
                    <span class="text-gray-500">KYC</span>
                    <p class="font-medium">{cap.kycRequired ? 'Required' : 'Not required'}</p>
                </div>
            </div>
            <div class="mt-6 flex gap-3">
                {#if cap.onRamp}
                    <a
                        href="{resolve('/anchors/koywe/onramp')}?region={r.id}"
                        class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        On-Ramp ({r.currency} → {cap.tokens[0]})
                    </a>
                {/if}
                {#if cap.offRamp}
                    <a
                        href="{resolve('/anchors/koywe/offramp')}?region={r.id}"
                        class="flex-1 rounded-md border border-indigo-600 px-4 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                        Off-Ramp ({cap.tokens[0]} → {r.currency})
                    </a>
                {/if}
            </div>
        </div>
    {/each}
</section>
```

(`resolve('/anchors/koywe/onramp')` returns the base path; the `?region=` suffix is appended in the template. `svelte/no-navigation-without-resolve` is disabled project-wide, so the concatenated href is fine — this matches how bespoke pages build dynamic hrefs.)

- [ ] **Step 3: Validate the component**

Validate with the `svelte-autofixer` tool (or `svelte:svelte-file-editor` agent) until clean.

Run: `pnpm check && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Manual sanity**

`pnpm dev` → `/anchors/koywe` lists Argentina, Mexico, Colombia cards; each on/off-ramp link opens the flow with the correct `?region=` and currency.

- [ ] **Step 5: Commit**

```bash
git add src/routes/anchors/koywe/+page.svelte
git commit -m "feat(koywe): list all served regions on the landing page"
```

---

### Task 9: Update docs (README) and run the full verification sweep

**Files:**

- Modify: `src/lib/anchors/koywe/README.md`

- [ ] **Step 1: Update the README coverage statement**

In `src/lib/anchors/koywe/README.md`, replace the "Handles fiat on/off ramps in Argentina:" line (5) and its bullet (7) with:

```markdown
Handles fiat on/off ramps across three Latin American markets:

- **Argentina** — ARS ↔ USDC on Stellar via WIREAR (CVU bank transfer), QRI-AR (QR), or Khipu.
- **Mexico** — MXN ↔ USDC on Stellar via SPEI (WIREMX / STP).
- **Colombia** — COP ↔ USDC on Stellar via PSE (plus Bancolombia / Nequi / Palomma on-ramp providers).

The client is currency-agnostic; per-market UI defaults (currency, country code,
document type, payout-account field, test data) live in `src/lib/config/koyweMarkets.ts`,
and the on/off-ramp pages select a market from the `?region=` query param (default
`argentina`), mirroring the Etherfuse multi-country pages.
```

Append a sentence to the "Sandbox quirks" section noting MX/CO have no published whitelisted test identities, so their off-ramp registration can't be sandbox-verified.

- [ ] **Step 2: Full sweep**

```bash
pnpm format
pnpm test:run
pnpm check
pnpm lint
pnpm build
```

Expected: all green. Investigate any regression in `tests/config/*` or `tests/anchors/koywe/*` before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/lib/anchors/koywe/README.md
git commit -m "docs(koywe): document Mexico & Colombia coverage"
```

---

## Post-plan: memory update (not a code task)

After the work lands, update `~/.claude/memory/project_koywe_integration.md`: Koywe expanded to MX + CO (on+off-ramp, `?region=` query-param flow like Etherfuse), the off-ramp `currencySymbol` enum `[CLP,COP,MXN,PEN]` finding (ARS not in it — relevant to the existing AR off-ramp 400), and that MX/CO off-ramp is unverifiable in sandbox (no test identities). Link `[[project_koywe_openapi_spec]]`.

## Open questions to carry to the Koywe team (not blockers)

1. MX-individual document type — `RFC` is the wire-enum value but `CURP` is what their compliance page names for individuals. Which passes `POST /rest/accounts` for an individual?
2. Sandbox test identities (document↔account pairs) for MX and CO, equivalent to the AR DNI↔CVU whitelist? Without them MX/CO off-ramp can't be exercised.
3. Colombia `payoutMethodId` (deprecated) — is `PSE` via `POST /bank-accounts` sufficient, or is a provider selector still required for Nequi/Bancolombia payouts?

## Self-Review

- **Spec coverage:** markets MX+CO on+off-ramp → Tasks 1,3,4,5 (config) + 6,7 (flows); `?region=` query-param single flow (Etherfuse pattern) → Tasks 3,6,7,8; rails → Tasks 1,2. Brazil/Chile/Peru out of scope (Task 4 knownIssue). ✔
- **Placeholder scan:** every code step has concrete code; Svelte edits are line-anchored against the current files. ✔
- **Type consistency:** `KoyweMarket`/`getKoyweMarket`/`DEFAULT_KOYWE_REGION` defined in Task 3, consumed in Tasks 6-8; `KoyweRail` union (Task 2) matches `pse`/`spei` rail ids (Task 1); `accountType` already on `CreateBankAccountArgs` (Task 7 Step 5 verifies). ✔
- **Pattern fidelity:** region selection via `page.url.searchParams.get('region')` + `$derived`, flat routes retained — matches `etherfuse/onramp/+page.svelte`; no `[region]` segment or loader. ✔
