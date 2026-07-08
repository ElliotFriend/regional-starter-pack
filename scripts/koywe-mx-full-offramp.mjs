// Koywe sandbox Mexico off-ramp — FULL FLOW from scratch (USDC Stellar -> MXN).
//
// Drives the whole path with a freshly generated, checksum-valid CURP:
//   1. validate the CURP locally (src/lib/utils/curp.ts)
//   2. POST /accounts            -> create the individual (documentType: CURP)
//   3. GET  /check               -> require canOperate
//   4. bank account              -> reuse if present; POST otherwise, and if the
//                                   POST 500s, re-GET (Koywe persists the record
//                                   despite the 500) and reuse it
//   5. POST /quotes + /orders    -> executable quote then order, retried on 5xx
//                                   (re-quotes each attempt; quotes live ~120s)
//   6. (opt-in) send USDC on-chain to the order's deposit address + submit txHash
//   7. poll the order to a terminal status
//
// Per Koywe's compliance docs, Mexican INDIVIDUALS use documentType "CURP"
// (RFC is for companies) — even though the bundled OpenAPI enum is stale and
// omits CURP. That is the hypothesis this script tests.
//
// The on-chain send (step 6) is OFF unless SOURCE_STELLAR_SECRET is set (a
// testnet account holding canonical USDC). Without it, the script stops after
// order creation — enough to learn whether the CURP identity clears account
// creation and order acceptance.
//
// Requires Node >= 23.6 (imports the .ts util via native type stripping).
// Run: node --env-file=.env scripts/koywe-mx-full-offramp.mjs
// Full completion: SOURCE_STELLAR_SECRET=S... node --env-file=.env scripts/koywe-mx-full-offramp.mjs

import {
    Keypair,
    Horizon,
    TransactionBuilder,
    Operation,
    Asset,
    Networks,
    BASE_FEE,
} from '@stellar/stellar-sdk';
import { generateCurp, isValidCurp } from '../src/lib/utils/mexico.ts';

// =============================================================================
// CONFIG — edit these
// =============================================================================

const EMAIL = 'elliot+koywemx-curp1@stellar.org';

// A generated, valid CURP for a fresh individual. Hardcode a specific string
// here instead to reuse an identity across runs.
const CURP = generateCurp('H');

const AMOUNT_USDC = 5; // USDC to off-ramp
const CLABE = '113650933505043468'; // MXN payout account (CLABE)

// KYC identity. Surnames feed the CURP's name letters conceptually, but Koywe
// does not recompute the CURP from them — any plausible values work in sandbox.
const NAMES = 'Juan';
const FIRST_LASTNAME = 'Pérez'; // paternal
const SECOND_LASTNAME = 'López'; // maternal (optional per Koywe, included here)
const ACTIVITY = 'Software Engineer';
const PHONE = '+525555551234';
const ADDRESS = {
    zipCode: '06600',
    state: 'CDMX',
    city: 'Ciudad de México',
    street: 'Av. Reforma 100',
    neighborhood: 'Juárez',
};

// On-chain send (step 6). Empty -> stop after order creation.
const SOURCE_STELLAR_SECRET = process.env.SOURCE_STELLAR_SECRET ?? '';

// Order-creation retry (the wallet-service 500 seen previously).
const ORDER_ATTEMPTS = 6;
const RETRY_DELAY_MS = 60_000;

// =============================================================================
// Derived / constants
// =============================================================================

const BASE = process.env.KOYWE_BASE_URL;
const clientId = process.env.KOYWE_CLIENT_ID;
const secret = process.env.KOYWE_SECRET;
const USDC_ISSUER = process.env.PUBLIC_USDC_ISSUER;

const HORIZON = 'https://horizon-testnet.stellar.org';
const FIAT = 'MXN';
const COUNTRY = 'MEX';
const CRYPTO_SYMBOL = 'USDC Stellar';
const TERMINAL = ['DELIVERED', 'REJECTED', 'INVALID_WITHDRAWALS_DETAILS'];

if (!BASE || !clientId || !secret) {
    throw new Error(
        'Missing KOYWE_BASE_URL / KOYWE_CLIENT_ID / KOYWE_SECRET (use --env-file=.env).',
    );
}

// The CURP embeds YYMMDD (4-9) and sex (10); derive dob + gender so the KYC body
// is internally consistent with the identity number. Homoclave (16) disambiguates
// century: a digit => born <2000, a letter => >=2000.
function decodeCurp(curp) {
    const yy = curp.slice(4, 6);
    const mm = curp.slice(6, 8);
    const dd = curp.slice(8, 10);
    const century = /\d/.test(curp[16]) ? '19' : '20';
    return { dob: `${century}${yy}-${mm}-${dd}`, gender: curp[10] }; // gender 'H' | 'M'
}

const { dob: DOB, gender: GENDER } = decodeCurp(CURP);

// =============================================================================
// Helpers
// =============================================================================

function log(title, data) {
    console.log(`\n=== ${title} ===`);
    if (data !== undefined)
        console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tokens = new Map();
async function authToken(email) {
    const key = email ?? '';
    if (tokens.has(key)) return tokens.get(key);
    const r = await fetch(`${BASE}/rest/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, secret, ...(email ? { email } : {}) }),
    });
    if (!r.ok) throw new Error(`auth ${r.status}: ${await r.text()}`);
    const t = (await r.json()).token;
    tokens.set(key, t);
    return t;
}

async function api(method, path, body, email) {
    const token = await authToken(email);
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text}`);
    return text ? JSON.parse(text) : undefined;
}

function isServerError(message) {
    return /-> 5\d\d:/.test(message) || /KoyweServerError|wallet service/i.test(message);
}

// =============================================================================
// 1. Local CURP sanity check
// =============================================================================

if (!isValidCurp(CURP)) throw new Error(`Generated CURP failed local validation: ${CURP}`);
log('Identity', { email: EMAIL, curp: CURP, dob: DOB, gender: GENDER });

// =============================================================================
// 2. Create the account (documentType: CURP)
// =============================================================================

const kycBody = {
    email: EMAIL,
    document: { documentNumber: CURP, documentType: 'CURP', country: COUNTRY, isCompany: false },
    address: {
        addressCountry: COUNTRY,
        addressZipCode: ADDRESS.zipCode,
        addressState: ADDRESS.state,
        addressCity: ADDRESS.city,
        addressStreet: ADDRESS.street,
        addressNeighborhood: ADDRESS.neighborhood,
    },
    personalInfo: {
        names: NAMES,
        firstLastname: FIRST_LASTNAME,
        secondLastname: SECOND_LASTNAME,
        dob: DOB,
        phoneNumber: PHONE,
        activity: ACTIVITY,
        nationality: COUNTRY,
        gender: GENDER,
    },
};

try {
    const created = await api('POST', '/rest/accounts', kycBody, EMAIL);
    log('Account created', created);
} catch (e) {
    if (String(e.message).includes('already exists')) {
        log('Account already exists — continuing', { email: EMAIL });
    } else {
        throw e;
    }
}

// =============================================================================
// 3. Operability
// =============================================================================

const check = await api(
    'GET',
    `/rest/accounts/${encodeURIComponent(EMAIL)}/check`,
    undefined,
    EMAIL,
);
log('Account check', check);
if (!check?.canOperate) {
    throw new Error(`Account cannot operate yet: ${JSON.stringify(check)}`);
}

// =============================================================================
// 4. Payout bank account (reuse; POST + 500-persist recovery)
// =============================================================================

async function listBankAccounts() {
    const q = `countryCode=${COUNTRY}&currencySymbol=${FIAT}&email=${encodeURIComponent(EMAIL)}`;
    return (await api('GET', `/rest/bank-accounts?${q}`, undefined, EMAIL)) ?? [];
}

let bankAccountId;
const existing = await listBankAccounts();
const found = existing.find((b) => b.accountNumber === CLABE);
if (found) {
    bankAccountId = found._id;
    log('Bank account already registered', { id: bankAccountId });
} else {
    try {
        const created = await api(
            'POST',
            '/rest/bank-accounts',
            {
                accountNumber: CLABE,
                countryCode: COUNTRY,
                currencySymbol: FIAT,
                email: EMAIL,
                documentNumber: CURP,
            },
            EMAIL,
        );
        bankAccountId = created._id;
        log('Bank account registered', created);
    } catch (e) {
        // Koywe persists the record even when the POST 500s — re-list and reuse.
        log('Bank account POST failed — checking whether it persisted anyway', String(e.message));
        const after = await listBankAccounts();
        const recovered = after.find((b) => b.accountNumber === CLABE);
        if (!recovered) throw e;
        bankAccountId = recovered._id;
        log('Recovered persisted bank account', { id: bankAccountId });
    }
}

// =============================================================================
// 5. Executable quote -> order (retry on 5xx, re-quote each attempt)
// =============================================================================

async function executableQuote() {
    const q = await api(
        'POST',
        '/rest/quotes',
        { amountIn: AMOUNT_USDC, symbolIn: CRYPTO_SYMBOL, symbolOut: FIAT, executable: true },
        EMAIL,
    );
    if (!q?.quoteId) throw new Error('No quoteId — cannot create order.');
    return q;
}

let order;
for (let attempt = 1; attempt <= ORDER_ATTEMPTS; attempt++) {
    const quote = await executableQuote();
    log(`Quote (attempt ${attempt}/${ORDER_ATTEMPTS})`, quote);
    try {
        order = await api(
            'POST',
            '/rest/orders',
            { quoteId: quote.quoteId, destinationAddress: bankAccountId, email: EMAIL },
            EMAIL,
        );
        log('Order created', order);
        break;
    } catch (e) {
        const message = String(e.message);
        if (!isServerError(message)) {
            log('Order creation FAILED (non-retryable — real verdict)', message);
            throw e;
        }
        log(`Order attempt ${attempt} hit a retryable server error`, message);
        if (attempt === ORDER_ATTEMPTS) {
            console.log(`\nExhausted ${ORDER_ATTEMPTS} attempts — server 500 looks persistent.`);
            throw e;
        }
        console.log(`Waiting ${RETRY_DELAY_MS / 1000}s before re-quoting and retrying...`);
        await sleep(RETRY_DELAY_MS);
    }
}

const orderId = order.orderId;
const depositAddress = order.providedAddress;
log('Order ready', { orderId, depositAddress: depositAddress ?? null, status: order.status });

// =============================================================================
// 6. On-chain USDC send (opt-in) + txHash
// =============================================================================

if (!SOURCE_STELLAR_SECRET) {
    console.log('\nSOURCE_STELLAR_SECRET not set — stopping before the on-chain send.');
    console.log(`Account creation with documentType CURP: ${check?.canOperate ? 'OK' : 'FAILED'}.`);
    console.log(`Order acceptance: ${order ? 'OK' : 'FAILED'}.`);
    process.exit(0);
}

if (!depositAddress) throw new Error('No providedAddress (deposit address) on the order.');
if (!USDC_ISSUER) throw new Error('Missing PUBLIC_USDC_ISSUER for the on-chain send.');

const server = new Horizon.Server(HORIZON);
const usdc = new Asset('USDC', USDC_ISSUER);
const kp = Keypair.fromSecret(SOURCE_STELLAR_SECRET);
const account = await server.loadAccount(kp.publicKey());
const bal = account.balances.find((b) => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER);
log('Source USDC balance before send', bal?.balance ?? '0');
if (!bal || Number(bal.balance) < AMOUNT_USDC) {
    throw new Error(`Source has insufficient USDC (${bal?.balance ?? 0} < ${AMOUNT_USDC}).`);
}

const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(
        Operation.payment({
            destination: depositAddress,
            asset: usdc,
            amount: String(AMOUNT_USDC),
        }),
    )
    .setTimeout(60)
    .build();
tx.sign(kp);
const sent = await server.submitTransaction(tx);
log('USDC sent on-chain', { txHash: sent.hash, to: depositAddress });

await api(
    'POST',
    `/rest/orders/${encodeURIComponent(orderId)}/txHash`,
    { txHash: sent.hash },
    EMAIL,
);
log('txHash submitted', sent.hash);

// =============================================================================
// 7. Poll to terminal
// =============================================================================

let last = '';
let final;
for (let i = 0; i < 60; i++) {
    const o = await api('GET', `/rest/orders/${encodeURIComponent(orderId)}`, undefined, EMAIL);
    final = o;
    if (o.status !== last) {
        log(`Order status -> ${o.status}`, { status: o.status, statusDetails: o.statusDetails });
        last = o.status;
    } else process.stdout.write('.');
    if (TERMINAL.includes(o.status)) break;
    await sleep(5000);
}

console.log(`\n\nFinal off-ramp status: ${final?.status}`);
console.log(`On-chain deposit tx: ${HORIZON}/transactions/${sent.hash}`);
