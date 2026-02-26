import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test-setup';
import {
    isKycComplete,
    needsMoreInfo,
    isProcessing,
    isRejected,
    getCustomer,
    putCustomer,
    deleteCustomer,
} from './sep12';
import { SepApiError } from './types';
import type { Sep12Status } from './types';

describe('isKycComplete', () => {
    it('returns true for ACCEPTED', () => {
        expect(isKycComplete('ACCEPTED')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isKycComplete('PROCESSING')).toBe(false);
        expect(isKycComplete('NEEDS_INFO')).toBe(false);
        expect(isKycComplete('REJECTED')).toBe(false);
    });
});

describe('needsMoreInfo', () => {
    it('returns true for NEEDS_INFO', () => {
        expect(needsMoreInfo('NEEDS_INFO')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(needsMoreInfo('ACCEPTED')).toBe(false);
        expect(needsMoreInfo('PROCESSING')).toBe(false);
        expect(needsMoreInfo('REJECTED')).toBe(false);
    });
});

describe('isProcessing', () => {
    it('returns true for PROCESSING', () => {
        expect(isProcessing('PROCESSING')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isProcessing('ACCEPTED')).toBe(false);
        expect(isProcessing('NEEDS_INFO')).toBe(false);
        expect(isProcessing('REJECTED')).toBe(false);
    });
});

describe('isRejected', () => {
    it('returns true for REJECTED', () => {
        expect(isRejected('REJECTED')).toBe(true);
    });

    it('returns false for other statuses', () => {
        const others: Sep12Status[] = ['ACCEPTED', 'PROCESSING', 'NEEDS_INFO'];
        others.forEach((status) => {
            expect(isRejected(status)).toBe(false);
        });
    });
});

// =============================================================================
// HTTP Functions (MSW-based tests)
// =============================================================================

const KYC_SERVER = 'https://testanchor.stellar.org/kyc';
const TOKEN = 'test-jwt-token';

describe('getCustomer', () => {
    it('returns customer data on success with query params', async () => {
        const mockResponse = {
            id: 'cust-123',
            status: 'ACCEPTED' as const,
            fields: {},
            provided_fields: {},
        };

        server.use(
            http.get(`${KYC_SERVER}/customer`, ({ request }) => {
                const url = new URL(request.url);
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(url.searchParams.get('id')).toBe('cust-123');
                expect(url.searchParams.get('type')).toBe('sep6-deposit');
                return HttpResponse.json(mockResponse);
            }),
        );

        const result = await getCustomer(KYC_SERVER, TOKEN, {
            id: 'cust-123',
            type: 'sep6-deposit',
        });
        expect(result).toEqual(mockResponse);
        expect(result.status).toBe('ACCEPTED');
    });

    it('works with no optional params', async () => {
        const mockResponse = {
            status: 'NEEDS_INFO' as const,
            fields: {
                first_name: { type: 'string' as const, description: 'First name' },
            },
        };

        server.use(
            http.get(`${KYC_SERVER}/customer`, ({ request }) => {
                const url = new URL(request.url);
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                // No query params should be set
                expect(url.searchParams.has('id')).toBe(false);
                expect(url.searchParams.has('account')).toBe(false);
                expect(url.searchParams.has('type')).toBe(false);
                return HttpResponse.json(mockResponse);
            }),
        );

        const result = await getCustomer(KYC_SERVER, TOKEN);
        expect(result.status).toBe('NEEDS_INFO');
    });

    it('throws SepApiError on error', async () => {
        server.use(
            http.get(`${KYC_SERVER}/customer`, () => {
                return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }),
        );

        const err = await getCustomer(KYC_SERVER, TOKEN).catch((e) => e);
        expect(err).toBeInstanceOf(SepApiError);
        expect(err.status).toBe(401);
        expect(err.message).toBe('Unauthorized');
    });
});

describe('putCustomer', () => {
    it('sends JSON body for text-only fields', async () => {
        const mockResponse = { id: 'cust-456' };

        server.use(
            http.put(`${KYC_SERVER}/customer`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(request.headers.get('Content-Type')).toBe('application/json');
                const body = (await request.json()) as Record<string, string>;
                expect(body.first_name).toBe('John');
                expect(body.last_name).toBe('Doe');
                expect(body.email_address).toBe('john@example.com');
                return HttpResponse.json(mockResponse);
            }),
        );

        const result = await putCustomer(KYC_SERVER, TOKEN, {
            first_name: 'John',
            last_name: 'Doe',
            email_address: 'john@example.com',
        });
        expect(result).toEqual(mockResponse);
        expect(result.id).toBe('cust-456');
    });

    it('sends FormData when Blob fields are present', async () => {
        const mockResponse = { id: 'cust-789' };
        const fakeFile = new Blob(['fake-image-data'], { type: 'image/png' });

        server.use(
            http.put(`${KYC_SERVER}/customer`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                // Content-Type should be multipart/form-data (set automatically by fetch)
                const contentType = request.headers.get('Content-Type');
                expect(contentType).toContain('multipart/form-data');

                const formData = await request.formData();
                expect(formData.get('first_name')).toBe('Jane');
                expect(formData.get('photo_id_front')).toBeInstanceOf(Blob);
                return HttpResponse.json(mockResponse);
            }),
        );

        const result = await putCustomer(KYC_SERVER, TOKEN, {
            first_name: 'Jane',
            photo_id_front: fakeFile,
        });
        expect(result.id).toBe('cust-789');
    });

    it('throws SepApiError on error', async () => {
        server.use(
            http.put(`${KYC_SERVER}/customer`, () => {
                return HttpResponse.json({ error: 'Validation failed' }, { status: 400 });
            }),
        );

        await expect(
            putCustomer(KYC_SERVER, TOKEN, { first_name: '' }),
        ).rejects.toThrow('Validation failed');
    });
});

describe('deleteCustomer', () => {
    it('sends DELETE request with JSON body', async () => {
        server.use(
            http.delete(`${KYC_SERVER}/customer`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(request.headers.get('Content-Type')).toBe('application/json');
                const body = (await request.json()) as Record<string, string>;
                expect(body.account).toBe('GABC123');
                return new HttpResponse(null, { status: 200 });
            }),
        );

        await expect(
            deleteCustomer(KYC_SERVER, TOKEN, { account: 'GABC123' }),
        ).resolves.toBeUndefined();
    });

    it('sends DELETE with empty body when no request params', async () => {
        server.use(
            http.delete(`${KYC_SERVER}/customer`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                const body = (await request.json()) as Record<string, string>;
                expect(Object.keys(body)).toHaveLength(0);
                return new HttpResponse(null, { status: 200 });
            }),
        );

        await expect(deleteCustomer(KYC_SERVER, TOKEN)).resolves.toBeUndefined();
    });

    it('throws SepApiError on error', async () => {
        server.use(
            http.delete(`${KYC_SERVER}/customer`, () => {
                return HttpResponse.json({ error: 'Customer not found' }, { status: 404 });
            }),
        );

        const err = await deleteCustomer(KYC_SERVER, TOKEN, { account: 'GABC123' }).catch(
            (e) => e,
        );
        expect(err).toBeInstanceOf(SepApiError);
        expect(err.status).toBe(404);
        expect(err.message).toBe('Customer not found');
    });
});
