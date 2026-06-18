import { buildReadiness } from '$lib/config/scorecard';
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({ entries: buildReadiness() });
