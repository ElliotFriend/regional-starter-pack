import { describe, it, expect } from 'vitest';
import { isAuthorizedCron } from '$lib/server/cron';

describe('isAuthorizedCron', () => {
    const SECRET = 's3cr3t';

    it('accepts a matching Bearer token (what Vercel sends)', () => {
        expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    });

    it('rejects a mismatched token', () => {
        expect(isAuthorizedCron('Bearer nope', SECRET)).toBe(false);
    });

    it('rejects a missing Authorization header', () => {
        expect(isAuthorizedCron(null, SECRET)).toBe(false);
    });

    it('fails closed when no secret is configured', () => {
        expect(isAuthorizedCron(`Bearer ${SECRET}`, undefined)).toBe(false);
        expect(isAuthorizedCron(null, undefined)).toBe(false);
        expect(isAuthorizedCron(`Bearer `, '')).toBe(false);
    });

    it('rejects a raw token without the Bearer scheme', () => {
        expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
    });
});
