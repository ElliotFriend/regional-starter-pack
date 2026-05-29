/**
 * Reactive polling helper.
 *
 * Wraps the `setInterval` + tick-count + timeout-detection pattern duplicated
 * across every flow page. Each page used to hand-roll `pollTimer`,
 * `pollCount`, `MAX_POLL_COUNT`, `pollingTimedOut`, `startXxxPolling()`,
 * `stopXxxPolling()`. This helper does it once.
 *
 * @example
 * ```ts
 * const poller = createPoller({
 *     intervalMs: 5000,
 *     maxAttempts: 60,
 *     onTick: async ({ stop }) => {
 *         const updated = await ef.getOnRampOrder(fetch, order.id);
 *         if (!updated) return;
 *         order = updated;
 *         if (updated.status === 'completed') {
 *             step = 'complete';
 *             stop();
 *         }
 *     },
 * });
 *
 * // start it
 * poller.start();
 *
 * // template can read reactive count + timedOut state
 * {#if poller.timedOut}<TimeoutNotice />{/if}
 * ```
 */

/** Context passed to each tick callback. */
export interface PollerTickContext {
    /** Halts further polling. Idempotent. */
    stop: () => void;
    /** Current tick count, 1-indexed (the tick currently running). */
    count: number;
}

export interface PollerOptions {
    /** Polling interval in milliseconds. Default: `5000` (5s). */
    intervalMs?: number;
    /**
     * Maximum tick count before the poller stops itself and sets
     * `timedOut = true`. Default: `60` (~5 min at 5s).
     */
    maxAttempts?: number;
    /**
     * Called once per interval. Use `ctx.stop()` to halt early when a
     * terminal state is reached. Exceptions thrown here are caught and
     * logged via `console.warn` — they do not stop the poller.
     */
    onTick: (ctx: PollerTickContext) => void | Promise<void>;
}

export interface Poller {
    /** Number of ticks elapsed since the last `start()`. */
    readonly count: number;
    /** `true` once `count` reaches `maxAttempts` without an explicit stop. */
    readonly timedOut: boolean;
    /** `true` between a `start()` call and the next `stop()`. */
    readonly running: boolean;
    /** Start (or restart) polling. Resets `count` to `0`. */
    start: () => void;
    /** Halt polling. Safe to call multiple times. */
    stop: () => void;
}

/** Create a self-contained polling state machine. */
export function createPoller(options: PollerOptions): Poller {
    const intervalMs = options.intervalMs ?? 5000;
    const maxAttempts = options.maxAttempts ?? 60;

    let count = $state(0);
    let isRunning = $state(false);
    let timer: ReturnType<typeof setInterval> | null = null;

    const timedOut = $derived(count >= maxAttempts);

    function stop() {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
        isRunning = false;
    }

    function start() {
        stop();
        count = 0;
        isRunning = true;
        timer = setInterval(async () => {
            count += 1;
            if (count >= maxAttempts) {
                stop();
                return;
            }
            try {
                await options.onTick({ stop, count });
            } catch (err) {
                console.warn('[poll] tick threw:', err);
            }
        }, intervalMs);
    }

    return {
        get count() {
            return count;
        },
        get timedOut() {
            return timedOut;
        },
        get running() {
            return isRunning;
        },
        start,
        stop,
    };
}
