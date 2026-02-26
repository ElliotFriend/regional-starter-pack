import { describe, it, expect } from 'vitest';
import { getAnchor, getAllAnchors } from './anchors';

describe('getAnchor', () => {
    it('returns Etherfuse profile', () => {
        const anchor = getAnchor('etherfuse');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('etherfuse');
        expect(anchor!.name).toBe('Etherfuse');
    });

    it('returns AlfredPay profile', () => {
        const anchor = getAnchor('alfredpay');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('alfredpay');
    });

    it('returns BlindPay profile', () => {
        const anchor = getAnchor('blindpay');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('blindpay');
    });

    it('returns undefined for nonexistent anchor', () => {
        expect(getAnchor('nonexistent')).toBeUndefined();
    });
});

describe('getAllAnchors', () => {
    it('returns all 3 anchors', () => {
        const anchors = getAllAnchors();
        expect(anchors).toHaveLength(3);
        const ids = anchors.map((a) => a.id);
        expect(ids).toContain('etherfuse');
        expect(ids).toContain('alfredpay');
        expect(ids).toContain('blindpay');
    });
});
