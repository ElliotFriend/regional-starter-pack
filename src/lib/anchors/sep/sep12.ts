/**
 * SEP-12: KYC API
 *
 * Implements the customer KYC registration and management protocol.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0012.md
 */

import type {
    Sep12CustomerRequest,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    Sep12PutCustomerResponse,
    Sep12DeleteCustomerRequest,
    Sep12Status,
    SepError,
} from './types';
import { SepApiError } from './types';
import { createAuthHeaders } from './sep10';

/**
 * Get customer information and KYC status.
 *
 * @param kycServer - The SEP-12 KYC server URL
 * @param token - SEP-10 JWT token
 * @param request - Customer request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getCustomer(
    kycServer: string,
    token: string,
    request: Sep12CustomerRequest = {},
    fetchFn: typeof fetch = fetch,
): Promise<Sep12CustomerResponse> {
    const url = new URL(`${kycServer}/customer`);

    // Add query parameters
    if (request.id) url.searchParams.set('id', request.id);
    if (request.account) url.searchParams.set('account', request.account);
    if (request.memo) url.searchParams.set('memo', request.memo);
    if (request.memo_type) url.searchParams.set('memo_type', request.memo_type);
    if (request.type) url.searchParams.set('type', request.type);
    if (request.lang) url.searchParams.set('lang', request.lang);

    const response = await fetchFn(url.toString(), {
        headers: createAuthHeaders(token),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to get customer: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Create or update customer information.
 * Can submit KYC fields using SEP-9 field names.
 *
 * @param kycServer - The SEP-12 KYC server URL
 * @param token - SEP-10 JWT token
 * @param request - Customer data to submit
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function putCustomer(
    kycServer: string,
    token: string,
    request: Sep12PutCustomerRequest,
    fetchFn: typeof fetch = fetch,
): Promise<Sep12PutCustomerResponse> {
    const url = `${kycServer}/customer`;

    // Check if we have any binary fields (files)
    const hasBinaryFields = Object.values(request).some((v) => v instanceof Blob);

    let body: FormData | string;
    let contentType: string | undefined;

    if (hasBinaryFields) {
        // Use multipart/form-data for file uploads
        const formData = new FormData();
        Object.entries(request).forEach(([key, value]) => {
            if (value !== undefined) {
                if (value instanceof Blob) {
                    formData.append(key, value);
                } else {
                    formData.append(key, String(value));
                }
            }
        });
        body = formData;
        // Let fetch set the content-type with boundary
        contentType = undefined;
    } else {
        // Use JSON for simple fields
        const jsonBody: Record<string, string> = {};
        Object.entries(request).forEach(([key, value]) => {
            if (value !== undefined && typeof value === 'string') {
                jsonBody[key] = value;
            }
        });
        body = JSON.stringify(jsonBody);
        contentType = 'application/json';
    }

    const headers: Record<string, string> = {
        ...createAuthHeaders(token),
    };
    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    const response = await fetchFn(url, {
        method: 'PUT',
        headers,
        body,
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to update customer: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Delete customer data.
 *
 * @param kycServer - The SEP-12 KYC server URL
 * @param token - SEP-10 JWT token
 * @param request - Customer identification
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function deleteCustomer(
    kycServer: string,
    token: string,
    request: Sep12DeleteCustomerRequest = {},
    fetchFn: typeof fetch = fetch,
): Promise<void> {
    const url = `${kycServer}/customer`;

    // Build delete request body
    const body: Record<string, string> = {};
    if (request.account) body.account = request.account;
    if (request.memo) body.memo = request.memo;
    if (request.memo_type) body.memo_type = request.memo_type;

    const response = await fetchFn(url, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            ...createAuthHeaders(token),
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to delete customer: ${response.status}`,
            response.status,
            errorBody,
        );
    }
}

/**
 * Get customer verification status for a specific transaction type.
 *
 * @param kycServer - The SEP-12 KYC server URL
 * @param token - SEP-10 JWT token
 * @param type - The transaction type (e.g., 'sep6-deposit', 'sep31-sender')
 * @param account - Optional account to check
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getCustomerStatus(
    kycServer: string,
    token: string,
    type: string,
    account?: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep12Status> {
    const customer = await getCustomer(kycServer, token, { type, account }, fetchFn);
    return customer.status;
}

/**
 * Check if customer KYC is complete for a given transaction type.
 */
export function isKycComplete(status: Sep12Status): boolean {
    return status === 'ACCEPTED';
}

/**
 * Check if customer needs to provide more KYC information.
 */
export function needsMoreInfo(status: Sep12Status): boolean {
    return status === 'NEEDS_INFO';
}

/**
 * Check if customer KYC is still being processed.
 */
export function isProcessing(status: Sep12Status): boolean {
    return status === 'PROCESSING';
}

/**
 * Check if customer KYC was rejected.
 */
export function isRejected(status: Sep12Status): boolean {
    return status === 'REJECTED';
}

// =============================================================================
// SEP-9 Standard KYC Field Names
// https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0009.md
// =============================================================================

/**
 * Standard SEP-9 KYC field names for natural persons.
 */
export const SEP9_NATURAL_PERSON_FIELDS = {
    // Name
    first_name: 'First name',
    last_name: 'Last name',
    additional_name: 'Middle name or other additional name',

    // Address
    address_country_code: 'Country code (ISO 3166-1 alpha-2)',
    state_or_province: 'State, province, or region',
    city: 'City',
    postal_code: 'Postal/ZIP code',
    address: 'Street address',

    // Contact
    mobile_number: 'Mobile phone number',
    email_address: 'Email address',

    // Birth
    birth_date: 'Date of birth (YYYY-MM-DD)',
    birth_place: 'Place of birth',
    birth_country_code: 'Country of birth (ISO 3166-1 alpha-2)',

    // Identity
    bank_account_number: 'Bank account number',
    bank_number: 'Bank routing/sort code',
    bank_phone_number: 'Bank phone number',
    bank_branch_number: 'Bank branch number',
    tax_id: 'Tax ID number',
    tax_id_name: 'Type of tax ID',

    // Documents
    id_type: 'Type of ID document',
    id_country_code: 'Country that issued ID (ISO 3166-1 alpha-2)',
    id_issue_date: 'ID issue date (YYYY-MM-DD)',
    id_expiration_date: 'ID expiration date (YYYY-MM-DD)',
    id_number: 'ID number',

    // Binary fields (file uploads)
    photo_id_front: 'Front of ID document (binary)',
    photo_id_back: 'Back of ID document (binary)',
    notary_approval_of_photo_id: 'Notarized ID document (binary)',
    photo_proof_residence: 'Proof of residence document (binary)',

    // Other
    sex: 'Gender (male/female)',
    occupation: 'Occupation',
    employer_name: 'Employer name',
    employer_address: 'Employer address',
    language_code: 'Preferred language (ISO 639-1)',
} as const;

/**
 * Standard SEP-9 KYC field names for organizations.
 */
export const SEP9_ORGANIZATION_FIELDS = {
    organization_name: 'Legal name of organization',
    organization_VAT_number: 'VAT number',
    organization_registration_number: 'Registration number',
    organization_registration_date: 'Registration date (YYYY-MM-DD)',
    organization_registered_address: 'Registered address',
    organization_number_of_shareholders: 'Number of shareholders',
    organization_shareholder_name: 'Name of shareholder',
    organization_photo_incorporation_doc: 'Incorporation document (binary)',
    organization_photo_proof_address: 'Proof of address (binary)',
    organization_address_country_code: 'Country code (ISO 3166-1 alpha-2)',
    organization_state_or_province: 'State, province, or region',
    organization_city: 'City',
    organization_postal_code: 'Postal/ZIP code',
    organization_director_name: 'Director name',
    organization_website: 'Organization website',
    organization_email: 'Organization email',
    organization_phone: 'Organization phone',
} as const;

export type Sep9NaturalPersonField = keyof typeof SEP9_NATURAL_PERSON_FIELDS;
export type Sep9OrganizationField = keyof typeof SEP9_ORGANIZATION_FIELDS;
export type Sep9Field = Sep9NaturalPersonField | Sep9OrganizationField;
