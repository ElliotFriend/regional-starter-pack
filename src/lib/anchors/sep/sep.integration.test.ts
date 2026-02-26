/**
 * SEP Integration Tests
 *
 * Tests the full SEP flow against the live Stellar test anchor at testanchor.stellar.org.
 * These tests require network access and are run in the integration project.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
    fetchStellarToml,
    getSep10Endpoint,
    getSep6Endpoint,
    getSep24Endpoint,
    getSep38Endpoint,
    supportsSep,
    getSigningKey,
} from './sep1';
import type { StellarTomlRecord } from './sep1';
import { getChallenge, validateChallenge, submitChallenge, signChallenge } from './sep10';
import * as sep6 from './sep6';
import * as sep12 from './sep12';
import * as sep24 from './sep24';
import * as sep38 from './sep38';

const TEST_ANCHOR_DOMAIN = 'testanchor.stellar.org';

describe('SEP Integration — testanchor.stellar.org', () => {
    const keypair = StellarSdk.Keypair.random();
    let toml: StellarTomlRecord;
    let sep10Endpoint: string;
    let signingKey: string;
    let sep6Endpoint: string;
    let sep24Endpoint: string;
    let sep38Endpoint: string;
    let jwtToken: string;

    // =========================================================================
    // SEP-1: Discovery
    // =========================================================================
    describe('SEP-1: stellar.toml discovery', () => {
        it('fetches stellar.toml from the test anchor', async () => {
            toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            expect(toml).toBeDefined();
            expect(toml.SIGNING_KEY).toBeTruthy();
        });

        it('extracts SEP-10 endpoint', () => {
            sep10Endpoint = getSep10Endpoint(toml)!;
            expect(sep10Endpoint).toBeTruthy();
            expect(sep10Endpoint).toContain('http');
        });

        it('extracts signing key', () => {
            signingKey = getSigningKey(toml)!;
            expect(signingKey).toBeTruthy();
            expect(signingKey).toHaveLength(56); // Stellar public key length
        });

        it('extracts SEP-6 endpoint', () => {
            sep6Endpoint = getSep6Endpoint(toml)!;
            expect(sep6Endpoint).toBeTruthy();
        });

        it('extracts SEP-24 endpoint', () => {
            sep24Endpoint = getSep24Endpoint(toml)!;
            expect(sep24Endpoint).toBeTruthy();
        });

        it('extracts SEP-38 endpoint', () => {
            sep38Endpoint = getSep38Endpoint(toml)!;
            expect(sep38Endpoint).toBeTruthy();
        });

        it('reports support for expected SEPs', () => {
            expect(supportsSep(toml, 6)).toBe(true);
            expect(supportsSep(toml, 10)).toBe(true);
            expect(supportsSep(toml, 24)).toBe(true);
            expect(supportsSep(toml, 38)).toBe(true);
        });
    });

    // =========================================================================
    // SEP-10: Authentication
    // =========================================================================
    describe('SEP-10: Web Authentication', () => {
        it('requests a challenge', async () => {
            // Ensure toml is loaded
            if (!toml) toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            if (!sep10Endpoint) sep10Endpoint = getSep10Endpoint(toml)!;
            if (!signingKey) signingKey = getSigningKey(toml)!;

            const challenge = await getChallenge(
                {
                    authEndpoint: sep10Endpoint,
                    serverSigningKey: signingKey,
                    networkPassphrase: StellarSdk.Networks.TESTNET,
                    homeDomain: TEST_ANCHOR_DOMAIN,
                },
                keypair.publicKey(),
            );

            expect(challenge.transaction).toBeTruthy();
            expect(challenge.network_passphrase).toBeTruthy();
        });

        it('validates the challenge', async () => {
            if (!toml) toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            if (!sep10Endpoint) sep10Endpoint = getSep10Endpoint(toml)!;
            if (!signingKey) signingKey = getSigningKey(toml)!;

            const challenge = await getChallenge(
                {
                    authEndpoint: sep10Endpoint,
                    serverSigningKey: signingKey,
                    networkPassphrase: StellarSdk.Networks.TESTNET,
                    homeDomain: TEST_ANCHOR_DOMAIN,
                },
                keypair.publicKey(),
            );

            const validation = validateChallenge(
                challenge.transaction,
                signingKey,
                challenge.network_passphrase,
                TEST_ANCHOR_DOMAIN,
                keypair.publicKey(),
            );

            expect(validation.valid).toBe(true);
        });

        it('authenticates and receives a JWT', async () => {
            if (!toml) toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            if (!sep10Endpoint) sep10Endpoint = getSep10Endpoint(toml)!;
            if (!signingKey) signingKey = getSigningKey(toml)!;

            const config = {
                authEndpoint: sep10Endpoint,
                serverSigningKey: signingKey,
                networkPassphrase: StellarSdk.Networks.TESTNET,
                homeDomain: TEST_ANCHOR_DOMAIN,
            };

            // Get challenge
            const challenge = await getChallenge(config, keypair.publicKey());

            // Sign with our keypair
            const signedXdr = await signChallenge(
                challenge.transaction,
                challenge.network_passphrase,
                async (xdr, passphrase) => {
                    const tx = new StellarSdk.Transaction(xdr, passphrase);
                    tx.sign(keypair);
                    return tx.toXDR();
                },
            );

            // Submit for JWT
            const tokenResponse = await submitChallenge(sep10Endpoint, signedXdr);
            jwtToken = tokenResponse.token;

            expect(jwtToken).toBeTruthy();
            expect(jwtToken.split('.')).toHaveLength(3);
        });
    });

    // =========================================================================
    // SEP-6: Programmatic Deposit/Withdrawal
    // =========================================================================
    describe('SEP-6: Deposit and Withdrawal', () => {
        beforeAll(async () => {
            // Ensure we have prerequisites
            if (!toml) toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            if (!sep6Endpoint) sep6Endpoint = getSep6Endpoint(toml)!;
        });

        it('gets SEP-6 info', async () => {
            const info = await sep6.getInfo(sep6Endpoint);
            expect(info).toBeDefined();
            expect(info.deposit).toBeDefined();
            expect(info.withdraw).toBeDefined();
        });
    });

    // =========================================================================
    // SEP-12: KYC
    // =========================================================================
    describe('SEP-12: KYC', () => {
        let kycServer: string;

        beforeAll(async () => {
            if (!toml) toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            kycServer = toml.KYC_SERVER!;
            // Authenticate if needed
            if (!jwtToken) {
                const sep10Ep = getSep10Endpoint(toml)!;
                const sk = getSigningKey(toml)!;
                const challenge = await getChallenge(
                    {
                        authEndpoint: sep10Ep,
                        serverSigningKey: sk,
                        networkPassphrase: StellarSdk.Networks.TESTNET,
                        homeDomain: TEST_ANCHOR_DOMAIN,
                    },
                    keypair.publicKey(),
                );
                const signedXdr = await signChallenge(
                    challenge.transaction,
                    challenge.network_passphrase,
                    async (xdr, passphrase) => {
                        const tx = new StellarSdk.Transaction(xdr, passphrase);
                        tx.sign(keypair);
                        return tx.toXDR();
                    },
                );
                const tokenResponse = await submitChallenge(sep10Ep, signedXdr);
                jwtToken = tokenResponse.token;
            }
        });

        it('gets customer status', async () => {
            if (!kycServer) return;
            const customer = await sep12.getCustomer(kycServer, jwtToken);
            expect(customer).toBeDefined();
            expect(customer.status).toBeDefined();
        });

        it('puts customer data', async () => {
            if (!kycServer) return;
            const result = await sep12.putCustomer(kycServer, jwtToken, {
                first_name: 'Test',
                last_name: 'User',
                email_address: `test-${Date.now()}@example.com`,
            });
            expect(result.id).toBeTruthy();
        });
    });

    // =========================================================================
    // SEP-24: Interactive Deposit/Withdrawal
    // =========================================================================
    describe('SEP-24: Interactive', () => {
        beforeAll(async () => {
            if (!toml) toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            if (!sep24Endpoint) sep24Endpoint = getSep24Endpoint(toml)!;
            // Authenticate if needed
            if (!jwtToken) {
                const sep10Ep = getSep10Endpoint(toml)!;
                const sk = getSigningKey(toml)!;
                const challenge = await getChallenge(
                    {
                        authEndpoint: sep10Ep,
                        serverSigningKey: sk,
                        networkPassphrase: StellarSdk.Networks.TESTNET,
                        homeDomain: TEST_ANCHOR_DOMAIN,
                    },
                    keypair.publicKey(),
                );
                const signedXdr = await signChallenge(
                    challenge.transaction,
                    challenge.network_passphrase,
                    async (xdr, passphrase) => {
                        const tx = new StellarSdk.Transaction(xdr, passphrase);
                        tx.sign(keypair);
                        return tx.toXDR();
                    },
                );
                const tokenResponse = await submitChallenge(sep10Ep, signedXdr);
                jwtToken = tokenResponse.token;
            }
        });

        it('gets SEP-24 info', async () => {
            const info = await sep24.getInfo(sep24Endpoint);
            expect(info).toBeDefined();
            expect(info.deposit).toBeDefined();
            expect(info.withdraw).toBeDefined();
        });

        it('initiates an interactive deposit', async () => {
            const response = await sep24.deposit(sep24Endpoint, jwtToken, {
                asset_code: 'SRT',
                account: keypair.publicKey(),
            });
            expect(response.type).toBe('interactive_customer_info_needed');
            expect(response.url).toBeTruthy();
            expect(response.id).toBeTruthy();
        });

        it('initiates an interactive withdrawal', async () => {
            const response = await sep24.withdraw(sep24Endpoint, jwtToken, {
                asset_code: 'SRT',
                account: keypair.publicKey(),
            });
            expect(response.type).toBe('interactive_customer_info_needed');
            expect(response.url).toBeTruthy();
            expect(response.id).toBeTruthy();
        });
    });

    // =========================================================================
    // SEP-38: Anchor Quotes
    // =========================================================================
    describe('SEP-38: Quotes', () => {
        beforeAll(async () => {
            if (!toml) toml = await fetchStellarToml(TEST_ANCHOR_DOMAIN);
            if (!sep38Endpoint) sep38Endpoint = getSep38Endpoint(toml)!;
        });

        it('gets SEP-38 info', async () => {
            const info = await sep38.getInfo(sep38Endpoint);
            expect(info).toBeDefined();
            expect(info.assets).toBeDefined();
            expect(info.assets.length).toBeGreaterThan(0);
        });

        it('gets indicative price', async () => {
            const info = await sep38.getInfo(sep38Endpoint);
            // Find two assets to get a price between
            if (info.assets.length < 2) return;

            // Find an off-chain asset to sell and an on-chain asset to buy
            const sellAsset = info.assets.find((v) => v.asset.startsWith('iso4217'))?.asset;
            const buyAsset = info.assets.find((v) => v.asset.startsWith('stellar'))?.asset;

            expect(sellAsset).toBeDefined();
            expect(buyAsset).toBeDefined();

            const price = await sep38.getPrice(sep38Endpoint, {
                sell_asset: sellAsset!,
                buy_asset: buyAsset!,
                sell_amount: '100',
                context: 'sep31',
            });

            expect(price.total_price).toBeTruthy();
            expect(price.price).toBeTruthy();
            expect(price.sell_amount).toBeTruthy();
            expect(price.buy_amount).toBeTruthy();
        });
    });
});
