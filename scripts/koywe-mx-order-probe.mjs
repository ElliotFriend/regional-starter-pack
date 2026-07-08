// Koywe sandbox Mexico off-ramp ORDER PROBE (USDC Stellar -> MXN).
//
// Context: `POST /rest/bank-accounts` for MX returns a 500
// ("save::error:Bank account is invalid <objectId> ... belong to <RFC>"), BUT the
// record persists anyway (the hex in the error is its `_id`). So the account is
// registered despite the error. This script does NOT re-create the account or
// re-POST the bank account. It:
//
//   1. auths for the existing email
//   2. GET /check                     -> confirm canOperate
//   3. GET /bank-accounts (MEX/MXN)   -> reuse the persisted account's _id
//   4-5. POST /quotes (executable) + POST /orders, retried: order creation has
//        been throwing a Koywe-side 500 ("Technical issues with wallet service,
//        try again later"). Retry it with a long-ish delay; re-quote each attempt
//        because an executable quote only lives ~120s. Non-5xx errors are NOT
//        retried — they're the real verdict on the flagged account.
//   6. brief status poll              -> catch an early REJECTED / INVALID_WITHDRAWALS_DETAILS
//
// It stops BEFORE any on-chain USDC send. The open question is only whether Koywe
// accepts an order whose payout account it flagged "invalid" — that is answered at
// order-create and the first status transitions, without moving real funds. So a
// DELIVERED outcome is not expected here (no deposit made); we want to see either a
// clean WAITING order (past the 500 wall) or an early rejection.
//
// Run: node --env-file=.env scripts/koywe-mx-order-probe.mjs [email] [usdcAmount]
// Tune retries: ORDER_ATTEMPTS (default 6) and RETRY_DELAY_MS (default 60000) env vars.

const BASE = process.env.KOYWE_BASE_URL;
const clientId = process.env.KOYWE_CLIENT_ID;
const secret = process.env.KOYWE_SECRET;

const EMAIL = process.argv[2] ?? 'elliot+koywemx1@stellar.org';
const OFFRAMP_USDC = Number(process.argv[3] ?? 5);
const FIAT = 'MXN';
const CRYPTO_SYMBOL = 'USDC Stellar';
const COUNTRY = 'MEX';

if (!BASE || !clientId || !secret) {
    throw new Error(
        'Missing KOYWE_BASE_URL / KOYWE_CLIENT_ID / KOYWE_SECRET (use --env-file=.env).',
    );
}

function log(title, data) {
    console.log(`\n=== ${title} ===`);
    if (data !== undefined)
        console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

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

// 1-2. Operability.
const check = await api(
    'GET',
    `/rest/accounts/${encodeURIComponent(EMAIL)}/check`,
    undefined,
    EMAIL,
);
log('Account check', check);
if (!check?.canOperate) {
    console.log('\n⚠️  canOperate is false — order will almost certainly be rejected downstream.');
}

// 3. Reuse the persisted bank account (do NOT re-POST — that is what 500s).
const existing = await api(
    'GET',
    `/rest/bank-accounts?countryCode=${COUNTRY}&currencySymbol=${FIAT}&email=${encodeURIComponent(EMAIL)}`,
    undefined,
    EMAIL,
);
log('Registered bank accounts', existing);
const bank = (existing ?? [])[0];
if (!bank?._id) {
    throw new Error(
        `No registered ${FIAT} bank account for ${EMAIL}. Register one in the UI first ` +
            '(even the 500 persists the record), then re-run.',
    );
}
const bankAccountId = bank._id;
log('Using bankAccountId (destinationAddress)', {
    bankAccountId,
    accountNumber: bank.accountNumber,
});

// 4-5. Executable quote -> off-ramp order, with retry.
//
// The order 500 we hit ("Technical issues with wallet service, try again later")
// is a Koywe-side infra error, plausibly transient. Retry it. BUT an executable
// quote is only `validFor` ~120s, so we re-quote on every attempt — a long sleep
// would otherwise just swap the wallet-service 500 for an expired-quote error.
// Only KoyweServerError / 5xx is retried; anything else (e.g. a validation
// rejection of the destination) throws immediately — that's a real answer, not a blip.
const ORDER_ATTEMPTS = Number(process.env.ORDER_ATTEMPTS ?? 6);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS ?? 60_000);
const napToRetry = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryableOrderError(message) {
    return /-> 5\d\d:/.test(message) || /KoyweServerError|wallet service/i.test(message);
}

async function executableQuote() {
    const q = await api(
        'POST',
        '/rest/quotes',
        { amountIn: OFFRAMP_USDC, symbolIn: CRYPTO_SYMBOL, symbolOut: FIAT, executable: true },
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
        log('Order CREATED (past the 500 wall)', order);
        break;
    } catch (e) {
        const message = String(e.message);
        if (!isRetryableOrderError(message)) {
            log('Order creation FAILED (non-retryable — treating as the real verdict)', message);
            throw e;
        }
        log(`Order attempt ${attempt} hit a retryable server error`, message);
        if (attempt === ORDER_ATTEMPTS) {
            console.log(
                `\nExhausted ${ORDER_ATTEMPTS} attempts — wallet-service 500 looks persistent, not transient.`,
            );
            throw e;
        }
        console.log(`Waiting ${RETRY_DELAY_MS / 1000}s before re-quoting and retrying...`);
        await napToRetry(RETRY_DELAY_MS);
    }
}

const orderId = order.orderId;
log('Deposit address returned (would receive the USDC — NOT sending here)', {
    providedAddress: order.providedAddress ?? null,
    providedAction: order.providedAction ?? null,
    status: order.status,
});

// 6. Brief status poll — surface an early terminal/rejection without depositing.
const TERMINAL = ['DELIVERED', 'REJECTED', 'INVALID_WITHDRAWALS_DETAILS'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = order.status ?? '';
let final = order;
for (let i = 0; i < 6; i++) {
    await sleep(5000);
    const o = await api('GET', `/rest/orders/${encodeURIComponent(orderId)}`, undefined, EMAIL);
    final = o;
    if (o.status !== last) {
        log(`Order status -> ${o.status}`, { status: o.status, statusDetails: o.statusDetails });
        last = o.status;
    } else process.stdout.write('.');
    if (TERMINAL.includes(o.status)) break;
}

console.log(`\n\nFinal order status: ${final?.status}`);
console.log(
    'No on-chain USDC was sent — this probe only tests order acceptance for the flagged MX account.',
);
