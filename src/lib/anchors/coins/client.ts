/**
 * Coins.ph ramp client — {@link Anchor} adapter (interactive facet).
 *
 * Coins.ph is a Philippines on/off-ramp whose entire customer-facing flow is
 * hosted in a widget reached via a signed URL ("link integration"). That maps
 * onto the {@link Anchor} `interactive` (SEP-24-style) facet: we build the signed
 * URL server-side and the app opens it; Coins handles login, KYC/MFA, payment,
 * and settlement.
 *
 * Server-side only — the HMAC `secretKey` must never reach the browser. Only the
 * finished signed URL (with the resulting `signature`, never the secret) is
 * returned to the client.
 *
 * Scope of this cut (see README for the full rationale):
 *   - on-ramp only (`type=buy`); off-ramp throws `NOT_IMPLEMENTED`.
 *   - launch-only: the widget creates the order *after* the user logs in, so no
 *     order id is available at launch. `startOnRamp` returns an empty
 *     `transactionId` and `getOnRampTransaction` returns `null` until the
 *     deferred callback/order-detail path is built.
 *   - no `auth` facet: Coins authenticates the end user itself (phone/email +
 *     MFA), so there is no SEP-10 wallet handshake. The connected wallet's public
 *     key is used only as the USDC destination address.
 */

import type {
    Anchor,
    AnchorCapabilities,
    InteractiveOps,
    TokenInfo,
    StartInteractiveInput,
    InteractiveSession,
} from '../types';
import { AnchorError } from '../types';
import type { CoinsRampConfig } from './types';
import { signParams } from './signing';

const DEFAULT_COUNTRY = 'PH';
const DEFAULT_NETWORK = 'STELLAR';
const WIDGET_PATH = '/ramp/widget';

const offRampUnsupported = (): never => {
    throw new AnchorError('Coins.ph off-ramp is not yet supported', 'NOT_IMPLEMENTED', 501);
};

/** {@link Anchor} adapter for the Coins.ph hosted ramp widget. */
export class CoinsRampClient implements Anchor {
    readonly name = 'coins';
    readonly displayName = 'Coins.ph';
    readonly capabilities: AnchorCapabilities = {
        flowStyles: ['interactive'],
    };
    readonly supportedTokens: readonly TokenInfo[];
    readonly supportedCurrencies: readonly string[] = ['PHP'];
    readonly supportedRails: readonly string[] = ['instapay', 'pesonet', 'gcash', 'maya'];

    private readonly config: CoinsRampConfig;
    private readonly country: string;
    private readonly network: string;
    private readonly now: () => number;
    private readonly nonceFn: () => string;

    constructor(config: CoinsRampConfig) {
        this.config = config;
        this.country = config.country ?? DEFAULT_COUNTRY;
        this.network = config.network ?? DEFAULT_NETWORK;
        this.now = config.now ?? (() => Date.now());
        this.nonceFn = config.nonceFn ?? (() => crypto.randomUUID());
        this.supportedTokens = [
            {
                symbol: 'USDC',
                name: 'USD Coin',
                issuer: config.usdcIssuer,
                description:
                    'A fully-reserved stablecoin pegged 1:1 to the US Dollar, issued on Stellar.',
            },
        ];
    }

    /**
     * Interactive (SEP-24-style) facet. See the class doc for why `transactionId`
     * is empty, why `getOnRampTransaction` returns null, and why off-ramp throws.
     */
    readonly interactive: InteractiveOps = {
        startOnRamp: (input) => this.startOnRamp(input),
        getOnRampTransaction: async () => null,
        startOffRamp: async () => offRampUnsupported(),
        getOffRampTransaction: async () => offRampUnsupported(),
    };

    private async startOnRamp(input: StartInteractiveInput): Promise<InteractiveSession> {
        if (!input.account) {
            throw new AnchorError(
                'A destination Stellar account is required',
                'MISSING_ACCOUNT',
                400,
            );
        }

        // Business params folded into both the signature and the widget URL.
        // `type=buy` is Coins.ph's on-ramp (fiat -> crypto) widget mode.
        const business: Record<string, string> = {
            type: 'buy',
            apiKey: this.config.apiKey,
            merchantId: this.config.merchantId,
            country: this.country,
            token: input.assetCode,
            network: this.network,
            address: input.account,
        };
        if (input.amount) business.amount = input.amount;

        const { signature, timestamp, nonce } = await signParams({
            secretKey: this.config.secretKey,
            params: business,
            timestamp: String(this.now()),
            nonce: this.nonceFn(),
        });

        const query = new URLSearchParams({ ...business, timestamp, nonce, signature });
        return {
            interactiveUrl: `${this.config.widgetBaseUrl}${WIDGET_PATH}?${query.toString()}`,
            transactionId: '',
        };
    }
}
