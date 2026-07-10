import { buildReadiness } from '$lib/config/scorecard';
import { ANCHORS } from '$lib/config/anchors';
import { regionChip } from '$lib/config/regions';
import type { PageLoad } from './$types';

/**
 * Layer catalogue framing the readiness projection intentionally omits: which
 * markets an anchor is active in (region chips) and whether it's a curated
 * integration (a member of `ANCHORS`, vs an honorable mention).
 */
export const load: PageLoad = () => ({
    entries: buildReadiness().map((e) => ({
        ...e,
        curated: e.id in ANCHORS,
        regionChips: e.regions.map(regionChip),
    })),
});
