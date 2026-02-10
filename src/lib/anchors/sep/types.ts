/**
 * Shared types for SEP (Stellar Ecosystem Proposal) implementations
 *
 * Note: SEP-1 types (StellarToml, TomlCurrency, etc.) are re-exported from
 * @stellar/stellar-sdk via sep1.ts
 */

// =============================================================================
// SEP-10: Web Authentication
// =============================================================================

export interface Sep10ChallengeRequest {
	account: string;
	memo?: string;
	home_domain?: string;
	client_domain?: string;
}

export interface Sep10ChallengeResponse {
	transaction: string; // XDR encoded transaction envelope
	network_passphrase: string;
}

export interface Sep10TokenRequest {
	transaction: string; // Signed XDR transaction envelope
}

export interface Sep10TokenResponse {
	token: string; // JWT token
}

export interface Sep10JwtPayload {
	iss: string; // Issuer (anchor domain)
	sub: string; // Subject (user's Stellar account)
	iat: number; // Issued at
	exp: number; // Expiration
	jti: string; // JWT ID
	client_domain?: string;
	home_domain?: string;
}

// =============================================================================
// SEP-6: Deposit/Withdrawal API
// =============================================================================

export interface Sep6Info {
	deposit: Record<string, Sep6AssetInfo>;
	withdraw: Record<string, Sep6AssetInfo>;
	fee?: {
		enabled: boolean;
		description?: string;
	};
	transactions?: {
		enabled: boolean;
		authentication_required?: boolean;
	};
	transaction?: {
		enabled: boolean;
		authentication_required?: boolean;
	};
	features?: {
		account_creation: boolean;
		claimable_balances: boolean;
	};
}

export interface Sep6AssetInfo {
	enabled: boolean;
	authentication_required?: boolean;
	min_amount?: number;
	max_amount?: number;
	fee_fixed?: number;
	fee_percent?: number;
	fee_minimum?: number;
	fields?: Record<
		string,
		{
			description: string;
			optional?: boolean;
			choices?: string[];
		}
	>;
}

export interface Sep6DepositRequest {
	asset_code: string;
	account: string;
	memo_type?: 'text' | 'id' | 'hash';
	memo?: string;
	email_address?: string;
	type?: string;
	wallet_name?: string;
	wallet_url?: string;
	lang?: string;
	on_change_callback?: string;
	amount?: string;
	country_code?: string;
	claimable_balance_supported?: boolean;
	customer_id?: string;
	[key: string]: string | boolean | undefined;
}

export interface Sep6DepositResponse {
	how?: string;
	instructions?: Record<
		string,
		{
			value: string;
			description: string;
		}
	>;
	id?: string;
	eta?: number;
	min_amount?: number;
	max_amount?: number;
	fee_fixed?: number;
	fee_percent?: number;
	extra_info?: Record<string, string>;
}

export interface Sep6WithdrawRequest {
	asset_code: string;
	type: string;
	dest?: string;
	dest_extra?: string;
	account?: string;
	memo?: string;
	memo_type?: 'text' | 'id' | 'hash';
	wallet_name?: string;
	wallet_url?: string;
	lang?: string;
	on_change_callback?: string;
	amount?: string;
	country_code?: string;
	refund_memo?: string;
	refund_memo_type?: string;
	customer_id?: string;
	[key: string]: string | undefined;
}

export interface Sep6WithdrawResponse {
	account_id: string;
	memo_type?: 'text' | 'id' | 'hash';
	memo?: string;
	id?: string;
	eta?: number;
	min_amount?: number;
	max_amount?: number;
	fee_fixed?: number;
	fee_percent?: number;
	extra_info?: Record<string, string>;
}

// =============================================================================
// SEP-12: KYC API
// =============================================================================

export type Sep12Status = 'ACCEPTED' | 'PROCESSING' | 'NEEDS_INFO' | 'REJECTED';

export interface Sep12CustomerRequest {
	id?: string;
	account?: string;
	memo?: string;
	memo_type?: 'text' | 'id' | 'hash';
	type?: string;
	lang?: string;
}

export interface Sep12CustomerResponse {
	id?: string;
	status: Sep12Status;
	fields?: Record<string, Sep12Field>;
	provided_fields?: Record<string, Sep12ProvidedField>;
	message?: string;
}

export interface Sep12Field {
	type: 'string' | 'binary' | 'number' | 'date';
	description: string;
	choices?: string[];
	optional?: boolean;
}

export interface Sep12ProvidedField {
	type: 'string' | 'binary' | 'number' | 'date';
	description: string;
	choices?: string[];
	optional?: boolean;
	status?: 'ACCEPTED' | 'PROCESSING' | 'REJECTED' | 'VERIFICATION_REQUIRED';
	error?: string;
}

export interface Sep12PutCustomerRequest {
	id?: string;
	account?: string;
	memo?: string;
	memo_type?: 'text' | 'id' | 'hash';
	type?: string;
	[key: string]: string | Blob | undefined; // SEP-9 fields
}

export interface Sep12PutCustomerResponse {
	id: string;
}

export interface Sep12DeleteCustomerRequest {
	account?: string;
	memo?: string;
	memo_type?: 'text' | 'id' | 'hash';
}

// =============================================================================
// SEP-24: Interactive Deposit/Withdrawal
// =============================================================================

export interface Sep24Info {
	deposit: Record<string, Sep24AssetInfo>;
	withdraw: Record<string, Sep24AssetInfo>;
	fee?: {
		enabled: boolean;
		description?: string;
	};
	features?: {
		account_creation: boolean;
		claimable_balances: boolean;
	};
}

export interface Sep24AssetInfo {
	enabled: boolean;
	authentication_required?: boolean;
	min_amount?: number;
	max_amount?: number;
	fee_fixed?: number;
	fee_percent?: number;
	fee_minimum?: number;
}

export interface Sep24DepositRequest {
	asset_code: string;
	asset_issuer?: string;
	amount?: string;
	account?: string;
	memo_type?: 'text' | 'id' | 'hash';
	memo?: string;
	wallet_name?: string;
	wallet_url?: string;
	lang?: string;
	claimable_balance_supported?: boolean;
	customer_id?: string;
}

export interface Sep24WithdrawRequest {
	asset_code: string;
	asset_issuer?: string;
	amount?: string;
	account?: string;
	memo?: string;
	memo_type?: 'text' | 'id' | 'hash';
	wallet_name?: string;
	wallet_url?: string;
	lang?: string;
	refund_memo?: string;
	refund_memo_type?: string;
	customer_id?: string;
}

export interface Sep24InteractiveResponse {
	type: 'interactive_customer_info_needed';
	url: string;
	id: string;
}

// =============================================================================
// SEP-31: Cross-Border Payments
// =============================================================================

export interface Sep31Info {
	receive: Record<string, Sep31AssetInfo>;
}

export interface Sep31AssetInfo {
	enabled: boolean;
	quotes_supported: boolean;
	quotes_required: boolean;
	fee_fixed?: number;
	fee_percent?: number;
	min_amount?: number;
	max_amount?: number;
	sep12?: {
		sender: {
			types: Record<string, { description: string }>;
		};
		receiver: {
			types: Record<string, { description: string }>;
		};
	};
	fields?: Record<
		string,
		{
			description: string;
			choices?: string[];
			optional?: boolean;
		}
	>;
}

export interface Sep31PostTransactionRequest {
	amount: string;
	asset_code: string;
	asset_issuer?: string;
	destination_asset?: string;
	quote_id?: string;
	sender_id: string;
	receiver_id: string;
	fields?: Record<string, string>;
	lang?: string;
}

export interface Sep31PostTransactionResponse {
	id: string;
	stellar_account_id: string;
	stellar_memo_type: 'text' | 'id' | 'hash';
	stellar_memo: string;
}

// =============================================================================
// SEP-38: Anchor RFQ (Quotes)
// =============================================================================

export interface Sep38Info {
	assets: Sep38Asset[];
}

export interface Sep38Asset {
	asset: string; // stellar:<code>:<issuer> or iso4217:<code>
	country_codes?: string[];
	sell_delivery_methods?: Sep38DeliveryMethod[];
	buy_delivery_methods?: Sep38DeliveryMethod[];
}

export interface Sep38DeliveryMethod {
	name: string;
	description: string;
}

export interface Sep38PriceRequest {
	sell_asset: string;
	buy_asset: string;
	sell_amount?: string;
	buy_amount?: string;
	sell_delivery_method?: string;
	buy_delivery_method?: string;
	country_code?: string;
	context: 'sep6' | 'sep31';
}

export interface Sep38PriceResponse {
	total_price: string;
	price: string;
	sell_amount: string;
	buy_amount: string;
	fee: {
		total: string;
		asset: string;
		details?: Array<{
			name: string;
			description?: string;
			amount: string;
		}>;
	};
}

export interface Sep38QuoteRequest extends Sep38PriceRequest {
	expire_after?: string;
}

export interface Sep38QuoteResponse extends Sep38PriceResponse {
	id: string;
	expires_at: string;
}

// =============================================================================
// Shared Transaction Types
// =============================================================================

export type TransactionStatus =
	| 'incomplete'
	| 'pending_user_transfer_start'
	| 'pending_user_transfer_complete'
	| 'pending_external'
	| 'pending_anchor'
	| 'pending_stellar'
	| 'pending_trust'
	| 'pending_user'
	| 'pending_customer_info_update'
	| 'pending_transaction_info_update'
	| 'pending_sender' // SEP-31 specific
	| 'pending_receiver' // SEP-31 specific
	| 'completed'
	| 'refunded'
	| 'expired'
	| 'error'
	| 'no_market';

export interface Sep6Transaction {
	id: string;
	kind: 'deposit' | 'withdrawal';
	status: TransactionStatus;
	status_eta?: number;
	more_info_url?: string;
	amount_in?: string;
	amount_in_asset?: string;
	amount_out?: string;
	amount_out_asset?: string;
	amount_fee?: string;
	amount_fee_asset?: string;
	started_at?: string;
	completed_at?: string;
	stellar_transaction_id?: string;
	external_transaction_id?: string;
	message?: string;
	refunded?: boolean;
	from?: string;
	to?: string;
	deposit_memo?: string;
	deposit_memo_type?: 'text' | 'id' | 'hash';
	withdraw_anchor_account?: string;
	withdraw_memo?: string;
	withdraw_memo_type?: 'text' | 'id' | 'hash';
}

export interface Sep24Transaction extends Sep6Transaction {
	// Sep24 uses the same transaction format as Sep6
}

export interface Sep31Transaction {
	id: string;
	status: TransactionStatus;
	status_eta?: number;
	amount_in?: string;
	amount_in_asset?: string;
	amount_out?: string;
	amount_out_asset?: string;
	amount_fee?: string;
	amount_fee_asset?: string;
	stellar_account_id: string;
	stellar_memo_type: 'text' | 'id' | 'hash';
	stellar_memo: string;
	started_at?: string;
	completed_at?: string;
	stellar_transaction_id?: string;
	external_transaction_id?: string;
	refunded?: boolean;
	message?: string;
	required_info_message?: string;
	required_info_updates?: Record<string, { description: string }>;
}

// =============================================================================
// Error Types
// =============================================================================

export interface SepError {
	error: string;
	message?: string;
}

export class SepApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public response?: SepError
	) {
		super(message);
		this.name = 'SepApiError';
	}
}
