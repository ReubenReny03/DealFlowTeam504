/**
 * Money is ALWAYS an integer number of minor units (cents). Never a float.
 * Every arithmetic helper rounds half-away-from-zero at the point of truncation
 * so that totals recomputed on the client and the server are bit-identical.
 */
export type Money = number;

/** Round half away from zero (JS `Math.round` rounds half *up*, which is asymmetric for negatives). */
export function roundHalfAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Dollars (or euros) -> integer cents. `money(1200)` === 120000. */
export function money(major: number): Money {
  return roundHalfAway(major * 100);
}

/** Integer cents -> major-unit float. Presentation only; never feed this back into arithmetic. */
export function toMajor(minor: Money): number {
  return minor / 100;
}

/** Multiply money by a unitless factor, rounding to whole cents. */
export function mulMoney(amount: Money, factor: number): Money {
  return roundHalfAway(amount * factor);
}

/** `pct` is a percentage *number* (12 means 12%), not a fraction. */
export function pctOf(amount: Money, pct: number): Money {
  return roundHalfAway((amount * pct) / 100);
}

export function sumMoney(values: Money[]): Money {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Format for display. Kept here so the Angular pipe and seed console output agree. */
export function formatMoney(minor: Money, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMajor(minor));
}

/** Percent display used by margin/discount chips: 12.345 -> "12.3%". */
export function formatPct(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}

/** Clamp a percentage into [0, 100]. */
export function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

/**
 * Distribute `total` across `weights` so the parts sum EXACTLY to `total`
 * (largest-remainder method). Used when splitting an invoice across shipments.
 */
export function allocateMoney(total: Money, weights: number[]): Money[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}
