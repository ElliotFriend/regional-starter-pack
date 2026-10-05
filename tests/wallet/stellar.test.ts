import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
    Account,
    Asset,
    Keypair,
    Memo,
    Networks,
    Operation,
    TransactionBuilder,
} from '@stellar/stellar-sdk';
import { server } from '../test-setup';
import { submitTransaction } from '$lib/wallet/stellar';

const HORIZON = 'https://horizon-testnet.stellar.org';

function signedPaymentXdr(): { xdr: string; destination: string } {
    const source = Keypair.random();
    const destination = Keypair.random().publicKey();
    const tx = new TransactionBuilder(new Account(source.publicKey(), '1'), {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
    })
        .addOperation(
            Operation.payment({
                destination,
                asset: new Asset('SRT', 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B'),
                amount: '5',
            }),
        )
        .addMemo(Memo.text('memo'))
        .setTimeout(180)
        .build();
    tx.sign(source);
    return { xdr: tx.toXDR(), destination };
}

function mockHorizonRejection(resultCodes: Record<string, unknown>): void {
    server.use(
        // The SDK checks SEP-29 memo-required on each destination first.
        http.get(`${HORIZON}/accounts/:id`, () =>
            HttpResponse.json({ status: 404 }, { status: 404 }),
        ),
        http.post(`${HORIZON}/transactions`, () =>
            HttpResponse.json(
                {
                    type: 'https://stellar.org/horizon-errors/transaction_failed',
                    title: 'Transaction Failed',
                    status: 400,
                    extras: { result_codes: resultCodes },
                },
                { status: 400 },
            ),
        ),
    );
}

describe('submitTransaction', () => {
    it("surfaces Horizon's transaction result code", async () => {
        mockHorizonRejection({ transaction: 'tx_too_late' });
        const { xdr } = signedPaymentXdr();
        await expect(submitTransaction(xdr, 'testnet')).rejects.toThrow(/tx_too_late/);
    });

    it("surfaces Horizon's operation result codes", async () => {
        mockHorizonRejection({ transaction: 'tx_failed', operations: ['op_underfunded'] });
        const { xdr } = signedPaymentXdr();
        await expect(submitTransaction(xdr, 'testnet')).rejects.toThrow(
            /tx_failed.*op_underfunded/,
        );
    });

    it('returns the Horizon response on success', async () => {
        server.use(
            http.get(`${HORIZON}/accounts/:id`, () =>
                HttpResponse.json({ status: 404 }, { status: 404 }),
            ),
            http.post(`${HORIZON}/transactions`, () =>
                HttpResponse.json({ hash: 'abc123', successful: true, ledger: 1 }),
            ),
        );
        const { xdr } = signedPaymentXdr();
        await expect(submitTransaction(xdr, 'testnet')).resolves.toMatchObject({
            hash: 'abc123',
        });
    });
});
