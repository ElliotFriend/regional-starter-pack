/**
 * AlfredPay API Client
 * Server-side only - uses API keys that should never be exposed to the client
 */

import type {
    Anchor,
    Customer,
    Quote,
    OnRampTransaction,
    OffRampTransaction,
    CreateCustomerInput,
    GetQuoteInput,
    CreateOnRampInput,
    CreateOffRampInput,
    RegisterFiatAccountInput,
    RegisteredFiatAccount,
    SavedFiatAccount,
    KycStatus,
    PaymentInstructions,
    BankAccount,
} from '../types';
import { AnchorError } from '../types';
import type {
    AlfredPayConfig,
    AlfredPayCreateCustomerResponse,
    AlfredPayCustomerResponse,
    AlfredPayQuoteResponse,
    AlfredPayOnRampResponse,
    AlfredPayOnRampFlatResponse,
    AlfredPayOffRampResponse,
    AlfredPayErrorResponse,
    AlfredPayKycRequirementsResponse,
    AlfredPayKycSubmissionRequest,
    AlfredPayKycSubmissionResponse,
    AlfredPayKycFileType,
    AlfredPayKycFileResponse,
    AlfredPayKycSubmissionStatusResponse,
    AlfredPayFiatAccountResponse,
    AlfredPayFiatAccountListItem,
    AlfredPaySandboxWebhookRequest,
} from './types';

export class AlfredPayClient implements Anchor {
    readonly name = 'alfredpay';
    private readonly config: AlfredPayConfig;

    constructor(config: AlfredPayConfig) {
        this.config = config;
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: unknown,
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;

        console.log(`[AlfredPay] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.config.apiKey,
                'api-secret': this.config.apiSecret,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AlfredPay] Error ${response.status}:`, errorText);

            let errorData: AlfredPayErrorResponse = {
                error: { code: 'UNKNOWN_ERROR', message: '' },
            };
            try {
                errorData = JSON.parse(errorText) as AlfredPayErrorResponse;
            } catch {
                // Not JSON
            }

            throw new AnchorError(
                errorData.error?.message || errorText || `AlfredPay API error: ${response.status}`,
                errorData.error?.code || 'UNKNOWN_ERROR',
                response.status,
            );
        }

        const data = await response.json();
        console.log(`[AlfredPay] Response:`, JSON.stringify(data));
        return data as T;
    }

    private mapCustomer(response: AlfredPayCustomerResponse): Customer {
        return {
            id: response.id,
            email: response.email,
            kycStatus: response.kyc_status as KycStatus,
            createdAt: response.created_at,
            updatedAt: response.updated_at,
        };
    }

    private mapQuote(response: AlfredPayQuoteResponse): Quote {
        // Calculate total fee from fees array
        const totalFee = response.fees
            .reduce((sum, fee) => sum + parseFloat(fee.amount), 0)
            .toFixed(2);

        return {
            id: response.quoteId,
            fromCurrency: response.fromCurrency,
            toCurrency: response.toCurrency,
            fromAmount: response.fromAmount,
            toAmount: response.toAmount,
            exchangeRate: response.rate,
            fee: totalFee,
            expiresAt: response.expiration,
            createdAt: new Date().toISOString(),
        };
    }

    private mapPaymentInstructions(
        instructions: AlfredPayOnRampResponse['fiatPaymentInstructions'],
        amount: string,
        currency: string,
    ): PaymentInstructions {
        return {
            type: 'spei',
            bankName: instructions.bankName,
            accountNumber: '',
            clabe: instructions.clabe,
            beneficiary: instructions.accountHolderName,
            reference: instructions.reference,
            amount: amount,
            currency: currency,
        };
    }

    private mapOnRampTransaction(response: AlfredPayOnRampResponse): OnRampTransaction {
        const tx = response.transaction;
        const statusMap: Record<string, OnRampTransaction['status']> = {
            CREATED: 'pending',
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed',
            EXPIRED: 'expired',
            CANCELLED: 'cancelled',
        };

        return {
            id: tx.transactionId,
            customerId: tx.customerId,
            quoteId: tx.quoteId,
            status: statusMap[tx.status] || 'pending',
            fromAmount: tx.fromAmount,
            fromCurrency: tx.fromCurrency,
            toAmount: tx.toAmount,
            toCurrency: tx.toCurrency,
            stellarAddress: tx.depositAddress,
            paymentInstructions: this.mapPaymentInstructions(
                response.fiatPaymentInstructions,
                tx.fromAmount,
                tx.fromCurrency,
            ),
            stellarTxHash: tx.txHash || undefined,
            createdAt: tx.createdAt,
            updatedAt: tx.updatedAt,
        };
    }

    private mapOnRampFlatTransaction(response: AlfredPayOnRampFlatResponse): OnRampTransaction {
        const statusMap: Record<string, OnRampTransaction['status']> = {
            CREATED: 'pending',
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed',
            EXPIRED: 'expired',
            CANCELLED: 'cancelled',
        };

        return {
            id: response.transactionId,
            customerId: response.customerId,
            quoteId: response.quoteId,
            status: statusMap[response.status] || 'pending',
            fromAmount: response.fromAmount,
            fromCurrency: response.fromCurrency,
            toAmount: response.toAmount,
            toCurrency: response.toCurrency,
            stellarAddress: response.depositAddress,
            paymentInstructions: this.mapPaymentInstructions(
                response.fiatPaymentInstructions,
                response.fromAmount,
                response.fromCurrency,
            ),
            stellarTxHash: response.txHash || undefined,
            createdAt: response.createdAt,
            updatedAt: response.updatedAt,
        };
    }

    private mapOffRampTransaction(
        response: AlfredPayOffRampResponse,
        bankAccountInfo?: Omit<BankAccount, 'id'>,
    ): OffRampTransaction {
        const statusMap: Record<string, OffRampTransaction['status']> = {
            CREATED: 'pending',
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed',
            EXPIRED: 'expired',
            CANCELLED: 'cancelled',
        };

        return {
            id: response.transactionId,
            customerId: response.customerId,
            quoteId: response.quote?.quoteId || '',
            status: statusMap[response.status] || 'pending',
            fromAmount: response.fromAmount,
            fromCurrency: response.fromCurrency,
            toAmount: response.toAmount,
            toCurrency: response.toCurrency,
            stellarAddress: response.depositAddress,
            bankAccount: {
                id: response.fiatAccountId,
                bankName: bankAccountInfo?.bankName || '',
                accountNumber: bankAccountInfo?.accountNumber || '',
                clabe: bankAccountInfo?.clabe || '',
                beneficiary: bankAccountInfo?.beneficiary || '',
            },
            memo: response.memo,
            stellarTxHash: response.txHash,
            createdAt: response.createdAt,
            updatedAt: response.updatedAt,
        };
    }

    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const response = await this.request<AlfredPayCreateCustomerResponse>(
            'POST',
            '/customers/create',
            {
                email: input.email,
                type: 'INDIVIDUAL',
                country: input.country || 'MX',
            },
        );

        // The create response only returns customerId and createdAt
        // We construct a minimal Customer object
        return {
            id: response.customerId,
            email: input.email,
            kycStatus: 'not_started',
            createdAt: response.createdAt,
            updatedAt: response.createdAt,
        };
    }

    async getCustomer(customerId: string): Promise<Customer | null> {
        try {
            const response = await this.request<AlfredPayCustomerResponse>(
                'GET',
                `/customers/${customerId}`,
            );
            return this.mapCustomer(response);
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    async getCustomerByEmail(email: string, country: string = 'MX'): Promise<Customer | null> {
        try {
            const response = await this.request<{ customerId: string }>(
                'GET',
                `/customers/find/${encodeURIComponent(email)}/${country}`,
            );

            // The endpoint only returns customerId, construct a minimal Customer object
            return {
                id: response.customerId,
                email: email,
                kycStatus: 'not_started',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const body: Record<string, string> = {
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            chain: 'XLM',
            paymentMethodType: 'SPEI',
        };

        // Ensure amounts are strings
        if (input.fromAmount) {
            body.fromAmount = String(input.fromAmount);
        }
        if (input.toAmount) {
            body.toAmount = String(input.toAmount);
        }

        const response = await this.request<AlfredPayQuoteResponse>('POST', '/quotes', body);
        return this.mapQuote(response);
    }

    async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
        const response = await this.request<AlfredPayOnRampResponse>('POST', '/onramp', {
            customerId: input.customerId,
            quoteId: input.quoteId,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            chain: 'XLM',
            paymentMethodType: 'SPEI',
            depositAddress: input.stellarAddress,
            memo: input.memo || '',
            onrampTransactionRequiredFieldsJson: {},
        });
        return this.mapOnRampTransaction(response);
    }

    async getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null> {
        try {
            // GET returns flat response (not wrapped in {transaction, fiatPaymentInstructions})
            const response = await this.request<AlfredPayOnRampFlatResponse>(
                'GET',
                `/onramp/${transactionId}`,
            );
            return this.mapOnRampFlatTransaction(response);
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        const response = await this.request<AlfredPayFiatAccountResponse>('POST', '/fiatAccounts', {
            customerId: input.customerId,
            type: 'SPEI',
            fiatAccountFields: {
                accountNumber: input.bankAccount.accountNumber,
                accountType: 'CHECKING',
                accountName: input.bankAccount.beneficiary,
                accountBankCode: input.bankAccount.bankName,
                accountAlias: input.bankAccount.beneficiary,
                networkIdentifier: input.bankAccount.clabe,
                metadata: {
                    accountHolderName: input.bankAccount.beneficiary,
                },
            },
            isExternal: true,
        });

        return {
            id: response.fiatAccountId,
            customerId: response.customerId,
            type: response.type,
            status: response.status,
            createdAt: response.createdAt,
        };
    }

    async getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]> {
        try {
            const response = await this.request<AlfredPayFiatAccountListItem[]>(
                'GET',
                `/fiatAccounts?customerId=${customerId}`,
            );

            return response.map((account) => ({
                id: account.fiatAccountId,
                type: account.type,
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountHolderName:
                    account.metadata?.accountHolderName ||
                    account.accountAlias ||
                    account.accountName,
                createdAt: account.createdAt,
            }));
        } catch (error) {
            // Return empty array if no accounts found
            if (error instanceof AnchorError && error.statusCode === 404) {
                return [];
            }
            throw error;
        }
    }

    async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
        const response = await this.request<AlfredPayOffRampResponse>('POST', '/offramp', {
            customerId: input.customerId,
            quoteId: input.quoteId,
            fiatAccountId: input.fiatAccountId,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            chain: 'XLM',
            memo: input.memo || '',
            originAddress: input.stellarAddress,
        });
        return this.mapOffRampTransaction(response, input.bankAccountInfo);
    }

    async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
        try {
            const response = await this.request<AlfredPayOffRampResponse>(
                'GET',
                `/offramp/${transactionId}`,
            );
            return this.mapOffRampTransaction(response);
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    async getKycIframeUrl(customerId: string, country: string = 'MX'): Promise<string> {
        const response = await this.request<{ verification_url: string; submissionId: string }>(
            'GET',
            `/customers/${customerId}/kyc/${country}/url`,
        );
        return response.verification_url;
    }

    async getKycStatus(customerId: string): Promise<KycStatus> {
        const customer = await this.getCustomer(customerId);
        if (!customer) {
            throw new AnchorError('Customer not found', 'CUSTOMER_NOT_FOUND', 404);
        }
        return customer.kycStatus;
    }

    async getKycSubmission(customerId: string): Promise<AlfredPayKycSubmissionResponse | null> {
        try {
            const response = await this.request<AlfredPayKycSubmissionResponse>(
                'GET',
                `/customers/kyc/${customerId}`,
            );
            return response;
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    async getKycSubmissionStatus(
        customerId: string,
        submissionId: string,
    ): Promise<AlfredPayKycSubmissionStatusResponse> {
        const response = await this.request<AlfredPayKycSubmissionStatusResponse>(
            'GET',
            `/customers/${customerId}/kyc/${submissionId}/status`,
        );
        return response;
    }

    async getKycRequirements(country: string = 'MX'): Promise<AlfredPayKycRequirementsResponse> {
        const response = await this.request<AlfredPayKycRequirementsResponse>(
            'GET',
            `/kycRequirements?country=${country}`,
        );
        return response;
    }

    async submitKycData(
        customerId: string,
        data: AlfredPayKycSubmissionRequest['kycSubmission'],
    ): Promise<AlfredPayKycSubmissionResponse> {
        const response = await this.request<AlfredPayKycSubmissionResponse>(
            'POST',
            `/customers/${customerId}/kyc`,
            { kycSubmission: data },
        );
        return response;
    }

    async finalizeKycSubmission(customerId: string, submissionId: string): Promise<void> {
        await this.request<{ message: string }>(
            'POST',
            `/customers/${customerId}/kyc/${submissionId}/submit`,
        );
    }

    async submitKycFile(
        customerId: string,
        submissionId: string,
        fileType: AlfredPayKycFileType,
        file: Blob,
        filename: string,
    ): Promise<AlfredPayKycFileResponse> {
        const url = `${this.config.baseUrl}/customers/${customerId}/kyc/${submissionId}/files`;

        console.log(`[AlfredPay] POST ${url} (file upload: ${fileType})`);

        const formData = new FormData();
        formData.append('fileBody', file, filename);
        formData.append('fileType', fileType);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'api-key': this.config.apiKey,
                'api-secret': this.config.apiSecret,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AlfredPay] Error ${response.status}:`, errorText);

            let errorData: AlfredPayErrorResponse = {
                error: { code: 'UNKNOWN_ERROR', message: '' },
            };
            try {
                errorData = JSON.parse(errorText) as AlfredPayErrorResponse;
            } catch {
                // Not JSON
            }

            throw new AnchorError(
                errorData.error?.message || errorText || `AlfredPay API error: ${response.status}`,
                errorData.error?.code || 'UNKNOWN_ERROR',
                response.status,
            );
        }

        const data = await response.json();
        console.log(`[AlfredPay] Response:`, JSON.stringify(data));
        return data as AlfredPayKycFileResponse;
    }

    // ========== Sandbox-only methods ==========
    // These methods are for testing in sandbox environments only

    /**
     * Send a webhook event to AlfredPay (sandbox only)
     * Used to simulate status changes for testing
     */
    async sendSandboxWebhook(webhook: AlfredPaySandboxWebhookRequest): Promise<void> {
        await this.request<{ message: string }>('POST', '/webhooks', webhook);
    }

    /**
     * Complete KYC verification in sandbox (sandbox only)
     * Marks a KYC submission as COMPLETED for testing purposes
     */
    async completeKycSandbox(submissionId: string): Promise<void> {
        await this.sendSandboxWebhook({
            referenceId: submissionId,
            eventType: 'KYC',
            status: 'COMPLETED',
            metadata: null,
        });
    }
}
