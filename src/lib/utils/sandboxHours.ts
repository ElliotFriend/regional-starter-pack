/**
 * Sandbox operating hours.
 *
 * Some anchors only run their staging environment during local business hours.
 * `SandboxHours` describes that recurring window so the UI can show whether the
 * sandbox is open or closed right now.
 *
 * `days` follows JavaScript convention: 0=Sun, 1=Mon, ..., 6=Sat.
 * `startHour` is inclusive; `endHour` is exclusive. Both are 0-23 in `timezone`.
 * `note` is a human-readable caveat (e.g. "excluding Philippine holidays") that
 * the open/closed computation does not try to enforce.
 */
export interface SandboxHours {
    timezone: string;
    days: number[];
    startHour: number;
    endHour: number;
    note?: string;
}

const DAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

export function isSandboxOpen(hours: SandboxHours, now: Date = new Date()): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: hours.timezone,
        weekday: 'short',
        hour: 'numeric',
        hour12: false,
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '0';

    const day = DAY_INDEX[weekday];
    if (day === undefined) return false;

    // Some runtimes return "24" for midnight; normalize to 0.
    const hour = parseInt(hourRaw, 10) % 24;

    if (!hours.days.includes(day)) return false;
    return hour >= hours.startHour && hour < hours.endHour;
}
