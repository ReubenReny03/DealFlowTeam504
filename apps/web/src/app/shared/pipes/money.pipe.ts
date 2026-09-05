import { Pipe, type PipeTransform } from '@angular/core';
import { formatMoney, formatPct } from '@dealflow/shared';

/** Renders integer minor units as currency. `120000 | money` -> "$1,200.00". */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, currency = 'USD'): string {
    if (value === null || value === undefined) return '—';
    return formatMoney(value, currency);
  }
}

/** `12.345 | pct` -> "12.3%". */
@Pipe({ name: 'pct', standalone: true })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 1): string {
    if (value === null || value === undefined) return '—';
    return formatPct(value, decimals);
  }
}
