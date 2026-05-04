import { describe, expect, it } from 'vitest';
import { isSandboxOpen, type SandboxHours } from '$lib/utils/sandboxHours';

// PDAX-style hours: Mon-Fri, 6am-10pm Philippine Standard Time (UTC+8).
const PDAX_HOURS: SandboxHours = {
    timezone: 'Asia/Manila',
    days: [1, 2, 3, 4, 5],
    startHour: 6,
    endHour: 22,
};

// Reference dates (2024-01-01 is a Monday in UTC and PHT):
//   Mon 2024-01-01, Tue 2024-01-02, ..., Sun 2024-01-07, Mon 2024-01-08

describe('isSandboxOpen', () => {
    it('is open at 9am PHT on a Tuesday', () => {
        // 9am PHT = 1am UTC same day
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-02T01:00:00Z'))).toBe(true);
    });

    it('is closed at 11pm PHT on a Tuesday (after end hour)', () => {
        // 11pm PHT = 3pm UTC same day
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-02T15:00:00Z'))).toBe(false);
    });

    it('is closed at noon PHT on a Sunday (weekend)', () => {
        // noon PHT Sunday = 4am UTC Sunday
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-07T04:00:00Z'))).toBe(false);
    });

    it('is closed at 9am PHT on a Saturday (weekend)', () => {
        // 9am PHT Saturday = 1am UTC Saturday
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-06T01:00:00Z'))).toBe(false);
    });

    it('is open at exactly 6:00am PHT on Friday (start of window)', () => {
        // 6am Fri PHT = 10pm Thu UTC
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-04T22:00:00Z'))).toBe(true);
    });

    it('is closed at 5:59am PHT on Monday (before start)', () => {
        // 5:59am Mon PHT = 9:59pm Sun UTC
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-07T21:59:00Z'))).toBe(false);
    });

    it('is open at 9:59pm PHT on Friday (last minute of window)', () => {
        // 9:59pm Fri PHT = 1:59pm Fri UTC
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-05T13:59:00Z'))).toBe(true);
    });

    it('is closed at exactly 10:00pm PHT on Friday (end hour is exclusive)', () => {
        // 10pm Fri PHT = 2pm Fri UTC
        expect(isSandboxOpen(PDAX_HOURS, new Date('2024-01-05T14:00:00Z'))).toBe(false);
    });

    it('respects timezone: same UTC instant is open in Asia/Manila but closed in America/New_York', () => {
        // 2024-01-02T22:00:00Z = 6am Wed PHT (open) and 5pm Tue NYC.
        const instant = new Date('2024-01-02T22:00:00Z');
        const nycHours: SandboxHours = { ...PDAX_HOURS, timezone: 'America/New_York' };
        // 5pm Tue NYC is within Mon-Fri 6-22, so it's open in NYC.
        expect(isSandboxOpen(PDAX_HOURS, instant)).toBe(true);
        expect(isSandboxOpen(nycHours, instant)).toBe(true);

        // Now pick an instant where the two diverge: 4am UTC Wed.
        // Asia/Manila: noon Wed (open). America/New_York: 11pm Tue (closed, past 22).
        const divergent = new Date('2024-01-03T04:00:00Z');
        expect(isSandboxOpen(PDAX_HOURS, divergent)).toBe(true);
        expect(isSandboxOpen(nycHours, divergent)).toBe(false);
    });
});
