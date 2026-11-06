import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme.ts';

describe('resolveTheme', () => {
    it('follows the system when there is no saved preference', () => {
        expect(resolveTheme(null, true)).toBe('dark');
        expect(resolveTheme(null, false)).toBe('light');
    });

    it('keeps a manual light or dark choice across system changes', () => {
        expect(resolveTheme('light', true)).toBe('light');
        expect(resolveTheme('dark', false)).toBe('dark');
    });

    it('ignores invalid stored values', () => {
        expect(resolveTheme('unexpected', true)).toBe('dark');
        expect(resolveTheme('unexpected', false)).toBe('light');
    });
});
