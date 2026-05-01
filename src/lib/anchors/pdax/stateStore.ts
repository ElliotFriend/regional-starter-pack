/**
 * PDAX state-store adapter.
 *
 * PDAX has no per-transaction memory of its own (no order id, no customer
 * record). The orchestration state for an in-flight on-ramp / off-ramp
 * (stage, identity blob, quote id, expected amounts, etc.) has to live
 * somewhere on our side. This module defines the seam so the rest of the
 * client doesn't care where that "somewhere" is — drop in the store that
 * fits your deployment.
 *
 * - Single-process Node / dev / tests → {@link InMemoryPdaxStateStore}.
 * - Vercel / Lambda / multi-instance serverless → write a small adapter
 *   for Vercel KV, Upstash Redis, Postgres, DynamoDB, etc. The interface
 *   is six methods.
 */

import type { PdaxOffRampState, PdaxOnRampState } from './types';

export interface PdaxStateStore {
    /** Fetch the on-ramp state record for `id`, or `null` if it doesn't exist. */
    getOnRamp(id: string): Promise<PdaxOnRampState | null>;
    /** Persist or overwrite the on-ramp state. Keyed by `state.id`. */
    putOnRamp(state: PdaxOnRampState): Promise<void>;
    /** Remove the on-ramp state record. No-op if it doesn't exist. */
    deleteOnRamp(id: string): Promise<void>;

    getOffRamp(id: string): Promise<PdaxOffRampState | null>;
    putOffRamp(state: PdaxOffRampState): Promise<void>;
    deleteOffRamp(id: string): Promise<void>;
}

/**
 * Default {@link PdaxStateStore}: holds records in a `Map` on the instance.
 *
 * Suitable for tests, local development, and single-process Node servers.
 * **Not** suitable for serverless deployments (Vercel, Lambda) where each
 * function invocation can land on a fresh isolate — supply a persistent
 * store there instead.
 */
export class InMemoryPdaxStateStore implements PdaxStateStore {
    private readonly onRamps = new Map<string, PdaxOnRampState>();
    private readonly offRamps = new Map<string, PdaxOffRampState>();

    async getOnRamp(id: string): Promise<PdaxOnRampState | null> {
        return this.onRamps.get(id) ?? null;
    }

    async putOnRamp(state: PdaxOnRampState): Promise<void> {
        this.onRamps.set(state.id, state);
    }

    async deleteOnRamp(id: string): Promise<void> {
        this.onRamps.delete(id);
    }

    async getOffRamp(id: string): Promise<PdaxOffRampState | null> {
        return this.offRamps.get(id) ?? null;
    }

    async putOffRamp(state: PdaxOffRampState): Promise<void> {
        this.offRamps.set(state.id, state);
    }

    async deleteOffRamp(id: string): Promise<void> {
        this.offRamps.delete(id);
    }
}
