import { Pipe, type PipeTransform } from '@angular/core';
import { formatLongDate, formatShortDate } from '@dealflow/shared';

/** "Sep 15" — every list screen. */
@Pipe({ name: 'shortDate', standalone: true })
export class ShortDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return value ? formatShortDate(value) : '—';
  }
}

/** "Aug 20, 2026" — the audit trail. */
@Pipe({ name: 'longDate', standalone: true })
export class LongDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return value ? formatLongDate(value) : '—';
  }
}

/** "9 days ago" — the stalled-deal columns. */
@Pipe({ name: 'ago', standalone: true })
export class AgoPipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const ms = Date.now() - new Date(value).getTime();
    const days = Math.floor(ms / 86_400_000);
    if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ago`;
    const hours = Math.floor(ms / 3_600_000);
    if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const mins = Math.max(1, Math.floor(ms / 60_000));
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
}
