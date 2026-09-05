/**
 * Shared seed context.
 *
 * Every date in the seed is an OFFSET from a single anchor (`SEED_NOW`), so
 * "idle 9 days" is always exactly 9 days no matter when the seed runs, and the
 * demo never shows a stale calendar.
 */
import { addDays, addMonths } from '@dealflow/shared';
import { env } from '../config/env.js';

export interface SeedContext {
  /** The anchor. Everything else is relative to this instant. */
  now: Date;
  /** now - n days */
  daysAgo: (n: number) => Date;
  /** now + n days */
  daysAhead: (n: number) => Date;
  monthsAhead: (n: number) => Date;
  /** now - n hours */
  hoursAgo: (n: number) => Date;
}

export function createSeedContext(): SeedContext {
  const now = env.seedNow ? new Date(env.seedNow) : new Date();
  // Normalise to midday UTC so day-boundary arithmetic never flips a date.
  const anchor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0),
  );
  return {
    now: anchor,
    daysAgo: (n) => addDays(anchor, -n),
    daysAhead: (n) => addDays(anchor, n),
    monthsAhead: (n) => addMonths(anchor, n),
    hoursAgo: (n) => new Date(anchor.getTime() - n * 3_600_000),
  };
}
