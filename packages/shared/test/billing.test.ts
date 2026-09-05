import { describe, expect, it } from 'vitest';
import {
  advanceCycle,
  BillingCycle,
  buildBillingSchedule,
  cancellationSettlement,
  invoiceableOneTimeLines,
  money,
  nextBillingDates,
  prorate,
  prorateFromDates,
  ProrationRule,
  type InvoiceableLine,
} from '../src/index.js';

describe('nextBillingDates — invoiced at the beginning of the period', () => {
  it('walks monthly cycles calendar-correctly', () => {
    const dates = nextBillingDates('2026-09-15T00:00:00.000Z', BillingCycle.MONTHLY, 4);
    expect(dates.map((d) => d.slice(0, 10))).toEqual([
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ]);
  });

  it('clamps to the last valid day of a short month', () => {
    expect(advanceCycle('2026-01-31T00:00:00.000Z', BillingCycle.MONTHLY).toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('walks quarterly cycles (Support SLA: Nov 1 next)', () => {
    const dates = nextBillingDates('2026-11-01T00:00:00.000Z', BillingCycle.QUARTERLY, 3);
    expect(dates.map((d) => d.slice(0, 10))).toEqual(['2026-11-01', '2027-02-01', '2027-05-01']);
  });

  it('walks weekly and yearly cycles', () => {
    expect(nextBillingDates('2026-09-01T00:00:00.000Z', BillingCycle.WEEKLY, 2)[1].slice(0, 10)).toBe('2026-09-08');
    expect(nextBillingDates('2026-09-01T00:00:00.000Z', BillingCycle.YEARLY, 2)[1].slice(0, 10)).toBe('2027-09-01');
  });

  it('returns nothing for a zero horizon', () => {
    expect(nextBillingDates('2026-09-15T00:00:00.000Z', BillingCycle.MONTHLY, 0)).toEqual([]);
  });
});

describe('buildBillingSchedule — the Care Plan 2yr schedule', () => {
  const schedule = buildBillingSchedule('2026-09-15T00:00:00.000Z', BillingCycle.MONTHLY, money(46), 3);

  it('generates one entry per occurrence, each due at the period start', () => {
    expect(schedule).toHaveLength(3);
    expect(schedule[0].dueDate).toBe(schedule[0].periodStart);
    expect(schedule[0].amount).toBe(4600);
    expect(schedule.every((s) => !s.invoiced)).toBe(true);
  });

  it('closes each period the day before the next one opens', () => {
    expect(schedule[0].periodStart.slice(0, 10)).toBe('2026-09-15');
    expect(schedule[0].periodEnd.slice(0, 10)).toBe('2026-10-14');
    expect(schedule[1].periodStart.slice(0, 10)).toBe('2026-10-15');
  });
});

describe('prorate — mid-cycle change', () => {
  it('credits the unused old plan and charges the new one over the same remainder', () => {
    // Half a 30-day month left, $46 -> $92.
    const r = prorate({ oldAmount: money(46), newAmount: money(92), remainingDays: 15, cycleDays: 30 });
    expect(r.fraction).toBe(0.5);
    expect(r.credit).toBe(2300);
    expect(r.charge).toBe(4600);
    expect(r.net).toBe(2300); // charged on the next invoice
    expect(r.explanation).toContain('15 of 30 days');
  });

  it('produces a NEGATIVE net (a credit note) on a downgrade', () => {
    const r = prorate({ oldAmount: money(92), newAmount: money(46), remainingDays: 15, cycleDays: 30 });
    expect(r.net).toBe(-2300);
  });

  it('rule NONE adjusts nothing now', () => {
    const r = prorate({ oldAmount: money(46), newAmount: money(92), remainingDays: 15, cycleDays: 30, rule: ProrationRule.NONE });
    expect(r.net).toBe(0);
    expect(r.explanation).toContain('next cycle');
  });

  it('rule FULL_PERIOD charges the whole new amount with no credit', () => {
    const r = prorate({ oldAmount: money(46), newAmount: money(92), remainingDays: 15, cycleDays: 30, rule: ProrationRule.FULL_PERIOD });
    expect(r.credit).toBe(0);
    expect(r.charge).toBe(money(92));
  });

  it('clamps a remainder longer than the cycle, and a negative one', () => {
    expect(prorate({ oldAmount: 100, newAmount: 200, remainingDays: 99, cycleDays: 30 }).fraction).toBe(1);
    expect(prorate({ oldAmount: 100, newAmount: 200, remainingDays: -5, cycleDays: 30 }).fraction).toBe(0);
  });

  it('prorateFromDates derives the remainder from the calendar', () => {
    const r = prorateFromDates(money(46), money(92), '2026-09-30T00:00:00.000Z', '2026-09-15T00:00:00.000Z', BillingCycle.MONTHLY);
    expect(r.credit).toBeGreaterThan(0);
    expect(r.net).toBeGreaterThan(0);
  });
});

describe('cancellationSettlement', () => {
  it('PRORATED issues a credit note for the unused remainder and stops service now', () => {
    const r = cancellationSettlement(money(46), '2026-09-30T00:00:00.000Z', '2026-09-15T00:00:00.000Z', BillingCycle.MONTHLY, ProrationRule.PRORATED);
    expect(r.creditAmount).toBeGreaterThan(0);
    expect(r.serviceEndsAt.slice(0, 10)).toBe('2026-09-30');
    expect(r.explanation).toContain('credit note');
  });

  it('FULL_PERIOD gives no credit but runs service to the end of the paid period', () => {
    const r = cancellationSettlement(money(46), '2026-09-30T00:00:00.000Z', '2026-09-15T00:00:00.000Z', BillingCycle.MONTHLY, ProrationRule.FULL_PERIOD);
    expect(r.creditAmount).toBe(0);
    expect(r.serviceEndsAt.slice(0, 10)).toBe('2026-10-15');
  });

  it('NONE gives no credit and stops immediately', () => {
    const r = cancellationSettlement(money(46), '2026-09-30T00:00:00.000Z', '2026-09-15T00:00:00.000Z', BillingCycle.MONTHLY, ProrationRule.NONE);
    expect(r.creditAmount).toBe(0);
    expect(r.explanation).toContain('no refund');
  });
});

describe('invoiceableOneTimeLines — nothing is billed before it ships', () => {
  const lines: InvoiceableLine[] = [
    { lineId: 'L1', productId: 'p-laptop', description: 'Laptop Pro 14', qty: 24, qtyShipped: 18, qtyInvoiced: 0, unitPrice: money(1200), discountPct: 12, taxPct: 15, isSubscription: false },
    { lineId: 'L2', productId: 'p-setup', description: 'Onsite Setup Service', qty: 1, qtyShipped: 0, qtyInvoiced: 0, unitPrice: money(450), discountPct: 18, taxPct: 15, isSubscription: false },
    { lineId: 'L3', productId: 'p-care', description: 'Care Plan 2yr', qty: 1, qtyShipped: 1, qtyInvoiced: 0, unitPrice: money(46), discountPct: 0, taxPct: 5, isSubscription: true },
  ];

  it('bills only the shipped part of a partially delivered line', () => {
    const result = invoiceableOneTimeLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0].lineId).toBe('L1');
    expect(result[0].qty).toBe(18);
  });

  it('never puts a subscription line on the one-time invoice', () => {
    expect(invoiceableOneTimeLines(lines).some((l) => l.productId === 'p-care')).toBe(false);
  });

  it('does not double-bill an already-invoiced quantity', () => {
    const second = invoiceableOneTimeLines(
      lines.map((l) => (l.lineId === 'L1' ? { ...l, qtyInvoiced: 18 } : l)),
    );
    expect(second).toHaveLength(0);
  });

  it('bills the remainder once the rest ships', () => {
    const rest = invoiceableOneTimeLines(
      lines.map((l) => (l.lineId === 'L1' ? { ...l, qtyShipped: 24, qtyInvoiced: 18 } : l)),
    );
    expect(rest[0].qty).toBe(6);
  });

  it('never bills more than was ordered, even if over-shipped', () => {
    const over = invoiceableOneTimeLines(
      lines.map((l) => (l.lineId === 'L1' ? { ...l, qtyShipped: 99 } : l)),
    );
    expect(over[0].qty).toBe(24);
  });
});
