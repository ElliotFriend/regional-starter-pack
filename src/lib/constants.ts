/**
 * Application constants
 *
 * Configure these values based on your target region and anchor provider.
 */

// Default currency codes used by UI components for quote requests.
export const CURRENCY = {
    FIAT: 'MXN',
    USDC: 'USDC',
} as const;

// Countries available in KYC and customer registration forms.
// Each entry maps a country code to its currency and payment rail.
export const SUPPORTED_COUNTRIES = [
    { code: 'MX', name: 'Mexico', currency: 'MXN', paymentMethod: 'SPEI' },
    { code: 'AR', name: 'Argentina', currency: 'ARS', paymentMethod: 'COELSA' },
    { code: 'BR', name: 'Brazil', currency: 'BRL', paymentMethod: 'PIX' },
    { code: 'CO', name: 'Colombia', currency: 'COP', paymentMethod: 'ACH' },
    { code: 'CL', name: 'Chile', currency: 'CLP', paymentMethod: 'ACH_CHL' },
    { code: 'BO', name: 'Bolivia', currency: 'BOB', paymentMethod: 'ACH_BOL' },
    { code: 'DO', name: 'Dominican Republic', currency: 'DOP', paymentMethod: 'ACH_DOM' },
    { code: 'US', name: 'United States', currency: 'USD', paymentMethod: 'BANK_USA' },
] as const;

// Default country code
export const DEFAULT_COUNTRY = 'MX';

// Provider names
export const PROVIDER = {
    ETHERFUSE: 'etherfuse',
    ALFREDPAY: 'alfredpay',
    BLINDPAY: 'blindpay',
} as const;

// KYC statuses (internal)
export const KYC_STATUS = {
    NOT_STARTED: 'not_started',
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    UPDATE_REQUIRED: 'update_required',
} as const;

// Transaction statuses
export const TX_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
} as const;

// AlfredPay KYC submission statuses (from API)
export const ALFREDPAY_KYC_STATUS = {
    CREATED: 'CREATED',
    IN_REVIEW: 'IN_REVIEW',
    UPDATE_REQUIRED: 'UPDATE_REQUIRED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
} as const;
