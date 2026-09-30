/**
 * Chipper Platform API client (https://docs.platform.chipper.ai).
 *
 * Standalone and framework-agnostic: depends only on `@stellar/stellar-sdk`.
 * **Server-side only**: authenticates with a secret Bearer key.
 *
 * Chipper is partner-level: there is no end-user customer or KYC object. An
 * order collects on one rail and pays out on another in one call, which is how
 * both ramps work here (mobile money or bank ⇄ `usdc_stellar`).
 */

import { StrKey } from '@stellar/stellar-sdk';
import {
    ChipperError,
    type ChipperConfig,
    type ChipperErrorDetail,
    type ChipperErrorResponse,
    type ChipperOrganization,
    type ChipperCapabilitiesResponse,
    type ChipperCapabilityGroup,
    type ChipperCountryCapabilities,
    type ChipperValidation,
    type ChipperOrder,
    type ChipperOrderResponse,
    type ChipperOrderStatus,
    type ChipperSandboxOutcome,
    type CreateOnRampOrderArgs,
    type CreateOffRampOrderArgs,
    type ChipperVirtualAccount,
    type SimulateBankDepositArgs,
} from './types';

/** Method types this app ramps with; wallets and crypto codes are dropped. */
const PAYOUT_TYPES = ['mobile_money', 'bank_transfer'];

/** API version pinned for every request (echoed back by Chipper). */
export const CHIPPER_API_VERSION = '2026-02-20';

export class ChipperClient {
    readonly name = 'chipper';
    readonly displayName = 'Chipper';
    private readonly config: ChipperConfig;

    constructor(config: ChipperConfig) {
        this.config = config;
    }

    /** Console-log when `config.debug` is set. Never passed credentials. */
    private debugLog(...args: unknown[]): void {
        if (this.config.debug) console.log(...args);
    }

    /** Console-error when `config.debug` is set. */
    private debugError(...args: unknown[]): void {
        if (this.config.debug) console.error(...args);
    }

    /** The organization this key belongs to; a connectivity check. */
    async getOrganization(): Promise<ChipperOrganization> {
        const res = await this.request<{ organization: ChipperOrganization }>(
            'GET',
            '/v1/organization',
        );
        return res.organization;
    }

    /**
     * Mobile money collections, and mobile money + bank payouts, for a country
     * (`GET /v1/capabilities/{country}`). Read at runtime: the catalog differs
     * between sandbox and production.
     */
    async getCapabilities(country: string): Promise<ChipperCountryCapabilities> {
        assertParam(country, COUNTRY, 'country');
        const res = await this.request<ChipperCapabilitiesResponse>(
            'GET',
            `/v1/capabilities/${encodeURIComponent(country)}`,
        );
        // Only the country's own groups (the catalog also carries GLOBAL crypto
        // groups), deduped by code so keyed pickers never see a repeat.
        const methods = (groups: ChipperCapabilityGroup[] = [], types: string[]) => {
            const seen = new Set<string>();
            return groups
                .filter((g) => g.country.code === country)
                .flatMap((g) => g.methods)
                .filter((m) => types.includes(m.type) && !seen.has(m.code) && seen.add(m.code));
        };
        return {
            collections: methods(res.capabilities.collections, ['mobile_money']),
            payouts: methods(res.capabilities.payouts, PAYOUT_TYPES),
        };
    }

    /** All-in rate, destination units per origin unit (`GET /v1/rates/{origin}/{destination}`). */
    async getRate(origin: string, destination: string): Promise<string> {
        assertParam(origin, CURRENCY, 'origin');
        assertParam(destination, CURRENCY, 'destination');
        const res = await this.request<{ rate: { from: string; to: string; rate: string } }>(
            'GET',
            `/v1/rates/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`,
        );
        return res.rate.rate;
    }

    /** Resolve the holder name for a mobile money number or bank account (`POST /v1/validate`). */
    async validateDestination(args: {
        code: string;
        accountNumber: string;
    }): Promise<ChipperValidation> {
        const res = await this.request<{ validation: ChipperValidation }>('POST', '/v1/validate', {
            code: args.code,
            accountNumber: args.accountNumber,
        });
        return res.validation;
    }

    /** Mobile money or bank transfer in, USDC on Stellar out (`POST /v1/orders`). */
    async createOnRampOrder(args: CreateOnRampOrderArgs): Promise<ChipperOrder> {
        assertStellarAddress(args.stellarAddress);
        return this.createOrder({
            from: {
                code: args.collectionCode,
                ...(args.phone ? { accountNumber: args.phone } : {}),
                amount: args.fiatAmount,
                currency: args.fiatCurrency,
                ...(args.kyc ? { kyc: args.kyc } : {}),
            },
            to: { code: 'usdc_stellar', accountNumber: args.stellarAddress, currency: 'USDC' },
            externalReference: args.externalReference,
        });
    }

    /**
     * USDC on Stellar in, mobile money or bank payout out. The returned `instructions` carry the
     * Stellar `address`, the memo-ID `tag`, and the exact `amount` (incl. fee).
     */
    async createOffRampOrder(args: CreateOffRampOrderArgs): Promise<ChipperOrder> {
        return this.createOrder({
            from: {
                code: 'usdc_stellar',
                amount: args.usdcAmount,
                currency: 'USDC',
                ...(args.kyc ? { kyc: args.kyc } : {}),
            },
            to: {
                code: args.payoutCode,
                accountNumber: args.accountNumber,
                currency: args.fiatCurrency,
            },
            externalReference: args.externalReference,
        });
    }

    /** Fetch an order for polling; `null` if unknown. */
    async getOrder(id: string): Promise<ChipperOrder | null> {
        assertParam(id, ORDER_ID, 'id');
        try {
            const res = await this.request<{ order: ChipperOrderResponse }>(
                'GET',
                `/v1/orders/${encodeURIComponent(id)}`,
            );
            return mapOrder(res.order);
        } catch (err) {
            if (err instanceof ChipperError && err.statusCode === 404) return null;
            throw err;
        }
    }

    /**
     * Sandbox only: push a bank transfer into a bank-sourced order's virtual
     * account (`POST /v1/simulations/virtual-account-deposit`). The account is
     * found by the order id, which Chipper sets as its `externalReference`.
     *
     * @throws {ChipperError} `VIRTUAL_ACCOUNT_NOT_FOUND` if the order has none.
     */
    async simulateBankDeposit(args: SimulateBankDepositArgs): Promise<void> {
        assertParam(args.orderId, ORDER_ID, 'orderId');
        const list = await this.request<{ data: ChipperVirtualAccount[] }>(
            'GET',
            `/v1/virtual-accounts?externalReference=${encodeURIComponent(args.orderId)}`,
        );
        const account = list.data[0];
        if (!account) {
            throw new ChipperError(
                `No virtual account for order ${args.orderId}`,
                'VIRTUAL_ACCOUNT_NOT_FOUND',
                404,
            );
        }
        await this.request('POST', '/v1/simulations/virtual-account-deposit', {
            virtualAccountId: account.id,
            amount: args.amount,
            externalReference: args.externalReference,
        });
    }

    /** Idempotent on `externalReference`: a replay returns the original order (200). */
    private async createOrder(body: Record<string, unknown>): Promise<ChipperOrder> {
        const res = await this.request<{ order: ChipperOrderResponse }>('POST', '/v1/orders', body);
        return mapOrder(res.order);
    }

    /** Send an authenticated JSON request, mapping the error envelope to {@link ChipperError}. */
    private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
        const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
        this.debugLog(`[Chipper] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
                'chipper-version': CHIPPER_API_VERSION,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const text = await response.text();
        if (!response.ok) {
            this.debugError(`[Chipper] Error ${response.status}:`, text);
            let parsed: ChipperErrorResponse | undefined;
            try {
                parsed = JSON.parse(text) as ChipperErrorResponse;
            } catch {
                // Not JSON.
            }
            throw new ChipperError(
                errorMessage(parsed, text, response.status),
                parsed?.error ?? 'CHIPPER_ERROR',
                response.status,
                parsed?.requestId ?? response.headers.get('x-request-id') ?? undefined,
                parsed?.details,
            );
        }
        this.debugLog('[Chipper] Response:', text || '(empty)');
        return (text ? JSON.parse(text) : undefined) as T;
    }
}

/** Human message for an error envelope; validation details are appended. */
function errorMessage(
    parsed: ChipperErrorResponse | undefined,
    text: string,
    status: number,
): string {
    const base = parsed?.message || text || `Chipper API error: ${status}`;
    if (Array.isArray(parsed?.details) && parsed.details.length > 0) {
        const fields = (parsed.details as ChipperErrorDetail[])
            .map((d) => `${d.field} ${d.message}`)
            .join('; ');
        return `${base}: ${fields}`;
    }
    return base;
}

const TERMINAL: readonly ChipperOrderStatus[] = ['completed', 'failed', 'expired'];

/** Normalize a raw order. */
export function mapOrder(raw: ChipperOrderResponse): ChipperOrder {
    return {
        ...raw,
        isTerminal: TERMINAL.includes(raw.status),
        failed: raw.status === 'failed' || raw.status === 'expired',
    };
}

const SANDBOX_COLLECTION_CENTS: Record<string, ChipperSandboxOutcome> = {
    '50': 'delayed_completion',
    '51': 'failed',
    '52': 'customer_timeout',
    '99': 'transient_error_then_reconciled',
};

/**
 * Sandbox only: the outcome a mobile money collection of `amount` will take,
 * chosen by its cents (`GET /v1/simulations`). `null` means it completes
 * normally. Orders collect amount + fee, so check `order.expectedAmount`.
 */
export function sandboxCollectionOutcome(amount: string): ChipperSandboxOutcome | null {
    const cents = (amount.split('.')[1] ?? '').padEnd(2, '0').slice(0, 2);
    return SANDBOX_COLLECTION_CENTS[cents] ?? null;
}

/** ISO 3166-1 alpha-2 country, as the capabilities path expects. */
const COUNTRY = /^[A-Z]{2}$/;
/** Fiat or asset code, e.g. `GHS`, `USDC`, `PYUSD`. */
const CURRENCY = /^[A-Z]{3,6}$/;
/** Chipper order id, e.g. `ord_dx2lgo5sgalpeqbrmmn5`. */
const ORDER_ID = /^ord_[a-z0-9]+$/;

/**
 * Throw a {@link ChipperError} unless a path parameter matches its pattern.
 * `encodeURIComponent` leaves `..` intact, so an unchecked value could reach a
 * different authenticated endpoint.
 */
function assertParam(value: string, pattern: RegExp, name: string): void {
    if (!pattern.test(value)) {
        throw new ChipperError(`Invalid ${name}: ${value}`, 'INVALID_PARAMETER', 400);
    }
}

/**
 * Refuse anything but a sandbox key (`sk_test_…`). This app's proxy routes are
 * unauthenticated, so a live key would let any visitor move real money.
 */
export function assertSandboxKey(apiKey: string): void {
    if (!apiKey?.startsWith('sk_test_')) {
        throw new ChipperError(
            'Chipper is configured for sandbox only: CHIPPER_SECRET_KEY must be an sk_test_ key',
            'LIVE_KEY_REFUSED',
            500,
        );
    }
}

/** Throw a {@link ChipperError} unless `address` is a valid Stellar public key. */
function assertStellarAddress(address: string): void {
    if (!StrKey.isValidEd25519PublicKey(address)) {
        throw new ChipperError(
            `Invalid Stellar public key: ${address}`,
            'INVALID_STELLAR_ADDRESS',
            400,
        );
    }
}
