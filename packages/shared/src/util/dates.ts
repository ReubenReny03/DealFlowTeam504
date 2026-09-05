/** All dates crossing a boundary are ISO-8601 UTC strings. */
export type IsoDate = string;

export const MS_PER_DAY = 86_400_000;

export function toIso(d: Date | string | number): IsoDate {
  return new Date(d).toISOString();
}

export function addDays(d: Date | string, days: number): Date {
  return new Date(new Date(d).getTime() + days * MS_PER_DAY);
}

/** Calendar-correct month addition, clamping to the last valid day (Jan 31 + 1mo -> Feb 28/29). */
export function addMonths(d: Date | string, months: number): Date {
  const src = new Date(d);
  const day = src.getUTCDate();
  const target = new Date(
    Date.UTC(
      src.getUTCFullYear(),
      src.getUTCMonth() + months,
      1,
      src.getUTCHours(),
      src.getUTCMinutes(),
      src.getUTCSeconds(),
      src.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/** Whole days between two instants (b - a), truncated toward zero. */
export function daysBetween(a: Date | string, b: Date | string): number {
  return Math.trunc((new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY);
}

/** Midnight-UTC start of the given day. */
export function startOfDay(d: Date | string): Date {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

/** "Sep 15" — the compact date format used on every list screen. */
export function formatShortDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Aug 20, 2026" — used in the audit trail. */
export function formatLongDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Milliseconds -> "6.4 hours", the Avg Approval Time KPI on screen 15. */
export function formatDurationHours(ms: number, decimals = 1): string {
  return `${(ms / 3_600_000).toFixed(decimals)} hours`;
}
