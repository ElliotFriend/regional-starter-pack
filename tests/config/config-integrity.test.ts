import { describe, it, expect } from 'vitest';
import { ANCHORS, HONORABLE_MENTIONS } from '$lib/config/anchors';
import { REGIONS } from '$lib/config/regions';
import { PAYMENT_RAILS } from '$lib/config/rails';

describe('honorable mention references resolve', () => {
    for (const [id, mention] of Object.entries(HONORABLE_MENTIONS)) {
        it(`${id} references only real regions`, () => {
            for (const regionId of mention.regions) {
                expect(REGIONS[regionId], `${id} → region "${regionId}"`).toBeDefined();
            }
        });

        it(`${id} references only real payment rails`, () => {
            for (const railId of mention.rails) {
                expect(PAYMENT_RAILS[railId], `${id} → rail "${railId}"`).toBeDefined();
            }
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
