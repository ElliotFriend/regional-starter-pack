import { describe, it, expect } from 'vitest';
import { ANCHORS, HONORABLE_MENTIONS } from '$lib/config/anchors';
import { REGIONS } from '$lib/config/regions';
import { PAYMENT_RAILS } from '$lib/config/rails';

/**
 * Region and rail ids referenced by honorable mentions that do not exist in
 * REGIONS / PAYMENT_RAILS. These are BD pipeline entries for markets the app
 * has not built out (Philippines, Kenya, Ghana). The dangling ids are latent
 * rather than user-visible: `getHonorableMentionsForRegion` simply never
 * matches a region that does not exist.
 *
 * The baseline exists so this check catches NEW dangling ids without failing
 * on pre-existing debt. It is set-equality, so a new bad id on an entry that
 * is already listed still fails. Resolving a market means deleting its line
 * here — the test fails if the baseline drifts in either direction, so it
 * cannot rot silently.
 */
const KNOWN_DANGLING: Record<string, { regions: string[]; rails: string[] }> = {
    pdax: { regions: ['philippines'], rails: ['instapay', 'pesonet'] },
    coinsph: { regions: ['philippines'], rails: ['instapay', 'pesonet'] },
    yellowcard: { regions: ['kenya', 'ghana'], rails: ['mpesa', 'mobile-money'] },
    fonbnk: { regions: ['kenya', 'ghana'], rails: ['mpesa', 'mobile-money', 'airtime'] },
    onafriq: { regions: ['kenya', 'ghana'], rails: ['mpesa', 'mobile-money'] },
    flutterwave: { regions: ['kenya', 'ghana'], rails: ['mpesa', 'mobile-money'] },
    chipper: {
        regions: ['ghana', 'kenya', 'nigeria', 'uganda', 'rwanda', 'tanzania', 'zambia'],
        rails: ['mpesa', 'mobile-money'],
    },
};

describe('honorable mention references resolve', () => {
    it('every baselined entry still exists', () => {
        // A deleted entry must not leave a stale baseline behind.
        for (const id of Object.keys(KNOWN_DANGLING)) {
            expect(HONORABLE_MENTIONS[id], `stale baseline entry "${id}"`).toBeDefined();
        }
    });

    for (const [id, mention] of Object.entries(HONORABLE_MENTIONS)) {
        it(`${id} has no dangling region or rail ids beyond its baseline`, () => {
            const baseline = KNOWN_DANGLING[id] ?? { regions: [], rails: [] };
            const actual = {
                regions: mention.regions.filter((r) => !REGIONS[r]).sort(),
                rails: mention.rails.filter((r) => !PAYMENT_RAILS[r]).sort(),
            };
            expect(actual).toEqual({
                regions: [...baseline.regions].sort(),
                rails: [...baseline.rails].sort(),
            });
        });
    }
});

describe('anchor references resolve', () => {
    for (const [id, anchor] of Object.entries(ANCHORS)) {
        it(`${id} references only real regions and rails`, () => {
            for (const [regionId, capability] of Object.entries(anchor.regions)) {
                expect(REGIONS[regionId], `${id} → region "${regionId}"`).toBeDefined();
                for (const railId of capability.paymentRails) {
                    expect(PAYMENT_RAILS[railId], `${id} → rail "${railId}"`).toBeDefined();
                }
            }
        });
    }
});

describe('region anchor lists resolve', () => {
    for (const [id, region] of Object.entries(REGIONS)) {
        it(`${id} lists only real anchors`, () => {
            for (const anchorId of region.anchors) {
                expect(ANCHORS[anchorId], `${id} → anchor "${anchorId}"`).toBeDefined();
            }
        });
    }
});
