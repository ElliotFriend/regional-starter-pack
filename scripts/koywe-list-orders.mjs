// Koywe — list ALL orders across the org, and the identities attached to them.
//
// There is no "list customers" endpoint. The org-wide view is GET /orders,
// authed with an ORG token (i.e. /auth WITHOUT an email). Each order carries the
// account email + bankAccountId + destinationAddress used, so paging through them
// reconstructs which identities you've attached — useful before shuffling document
// numbers with PUT /accounts (updateEmail / updateDocumentNumber / updateDocumentType).
//
// Run: node --env-file=.env scripts/koywe-list-orders.mjs

// =============================================================================
// CONFIG — edit these
// =============================================================================

const PAGE_SIZE = 50; // Koywe max is 50
const INIT_DATE = ''; // 'YYYY-MM-DD' or '' for no lower bound
const END_DATE = ''; // 'YYYY-MM-DD' or '' for up-to-now
const MAX_PAGES = 100; // safety cap

// =============================================================================

const BASE = process.env.KOYWE_BASE_URL;
const clientId = process.env.KOYWE_CLIENT_ID;
const secret = process.env.KOYWE_SECRET;

if (!BASE || !clientId || !secret) {
    throw new Error(
        'Missing KOYWE_BASE_URL / KOYWE_CLIENT_ID / KOYWE_SECRET (use --env-file=.env).',
    );
}

// Org-level token: authenticate WITHOUT an email.
let orgToken;
async function authOrg() {
    if (orgToken) return orgToken;
    const r = await fetch(`${BASE}/rest/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, secret }),
    });
    if (!r.ok) throw new Error(`auth ${r.status}: ${await r.text()}`);
    orgToken = (await r.json()).token;
    return orgToken;
}

async function api(path) {
    const token = await authOrg();
    const r = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}: ${text}`);
    return text ? JSON.parse(text) : undefined;
}

function ordersPath(pageNumber) {
    const p = new URLSearchParams({ pageSize: String(PAGE_SIZE), pageNumber: String(pageNumber) });
    if (INIT_DATE) p.set('initDate', INIT_DATE);
    if (END_DATE) p.set('endDate', END_DATE);
    return `/rest/orders?${p}`;
}

// Page through until we've seen totalcount (or run dry / hit the cap).
const orders = [];
let totalcount = Infinity;
for (let page = 1; page <= MAX_PAGES && orders.length < totalcount; page++) {
    const res = await api(ordersPath(page));
    const batch = res?.data ?? [];
    totalcount = res?.pagination?.totalcount ?? orders.length + batch.length;
    orders.push(...batch);
    console.log(`page ${page}: +${batch.length} (have ${orders.length}/${totalcount})`);
    if (batch.length === 0) break;
}

console.log(`\n=== ${orders.length} orders ===`);
for (const o of orders) {
    const when = o.dates?.confirmationDate ?? '';
    console.log(
        [
            (o.email ?? '—').padEnd(34),
            (o.orderType ?? '—').padEnd(16),
            `${o.symbolIn ?? '?'}->${o.symbolOut ?? '?'}`.padEnd(22),
            (o.status ?? '—').padEnd(26),
            `bank:${o.bankAccountId ?? '—'}`,
            `dest:${o.destinationAddress ?? '—'}`,
            when,
        ].join('  '),
    );
}

// Aggregate: which identities (emails) are attached, and to what payout targets.
const byEmail = new Map();
for (const o of orders) {
    const email = o.email ?? '(no email)';
    const entry = byEmail.get(email) ?? { orders: 0, banks: new Set(), dests: new Set() };
    entry.orders += 1;
    if (o.bankAccountId) entry.banks.add(o.bankAccountId);
    if (o.destinationAddress) entry.dests.add(o.destinationAddress);
    byEmail.set(email, entry);
}

console.log(`\n=== ${byEmail.size} distinct identities (email) ===`);
for (const [email, e] of byEmail) {
    console.log(
        `${email.padEnd(34)}  orders:${e.orders}  banks:[${[...e.banks].join(', ') || '—'}]  dests:[${[...e.dests].join(', ') || '—'}]`,
    );
}

console.log(
    '\nTo rebind/free an identity: PUT /rest/accounts with updateEmail / updateDocumentNumber / updateDocumentType.',
);
