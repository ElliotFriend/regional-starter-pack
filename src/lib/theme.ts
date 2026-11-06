export type Theme = 'light' | 'dark';

/** Only explicit light/dark preferences override the operating-system setting. */
export function resolveTheme(preference: string | null, systemPrefersDark: boolean): Theme {
    if (preference === 'light' || preference === 'dark') {
        return preference;
    }
    return systemPrefersDark ? 'dark' : 'light';
}
