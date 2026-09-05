/**
 * Hybrid billing: proration, billing schedules and invoice reconciliation.
 * Pure — the API supplies the dates and the persistence.
 */
import { BillingCycle, CYCLE_DAYS, ProrationRule } from '../enums/index.js';
import { type Money, mulMoney } from '../util/money.js';
import { addDays, addMonths, daysBetween, type IsoDate, toIso } from '../util/dates.js';

/* ------------------------------------------------------------------ schedules */

export interface BillingScheduleEntry {
  seq: number;
  dueDate: IsoDate;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amount: Money;
  invoiced: boolean;
}

/** Advance one cycle from `from`. Calendar-correct for months/quarters/years. */
export function advanceCycle(from: Date | string, cycle: BillingCycle): Date {
  switch (cycle) {
    case BillingCycle.WEEKLY:
      return addDays(from, 7);
    case BillingCycle.MONTHLY:
      return addMonths(from, 1);
    case BillingCycle.QUARTERLY:
      return addMonths(from, 3);
    case BillingCycle.YEARLY:
      return addMonths(from, 12);
    default:
      return addMonths(from, 1);
  }
}

/**
 * The next `count` billing dates from `startDate`.
 * Recurring lines are invoiced at the BEGINNING of the period (per screen 17),
 * so `dueDate === periodStart` for every occurrence.
 */
export function nextBillingDates(
  startDate: Date | string,
  cycle: BillingCycle,
  count: number,
): IsoDate[] {
  const out: IsoDate[] = [];
  let cursor = new Date(startDate);
  for (let i = 0; i < Math.max(0, count); i++) {
    out.push(toIso(cursor));
    cursor = advanceCycle(cursor, cycle);
  }
  return out;
}

export function buildBillingSchedule(
  startDate: Date | string,
  cycle: BillingCycle,
  amountPerCycle: Money,
  horizon: number,
): BillingScheduleEntry[] {
  const starts = nextBillingDates(startDate, cycle, horizon);
  return starts.map((periodStart, i) => {
    const periodEnd = toIso(addDays(advanceCycle(periodStart, cycle), -1));
    return {
      seq: i + 1,
      dueDate: periodStart, // invoiced at the beginning of the period
      periodStart,
      periodEnd,
      amount: amountPerCycle,
      invoiced: false,
    };
  });
}

/* ------------------------------------------------------------------ proration */

export interface ProrationInput {
  oldAmount: Money;
  newAmount: Money;
  /** Days left in the current cycle at the moment of the change. */
  remainingDays: number;
  /** Nominal length of the cycle in days. */
  cycleDays: number;
  rule?: ProrationRule;
}

export interface ProrationResult {
  /** Refunded portion of the amount the customer already paid for this cycle. */
  credit: Money;
  /** Charge for the new amount over the remaining part of the cycle. */
  charge: Money;
  /** charge - credit. Negative => a credit note is issued. */
  net: Money;
  /** 0..1 — the fraction of the cycle still unused. */
  fraction: number;
  rule: ProrationRule;
  explanation: string;
}

/**
 * Mid-cycle change proration.
 *   credit = oldAmount * (remainingDays / cycleDays)
 *   charge = newAmount * (remainingDays / cycleDays)
 *   net    = charge - credit
 * A negative `net` becomes a CreditNote; a positive `net` lands on the next invoice.
 */
export function prorate(input: ProrationInput): ProrationResult {
  const rule = input.rule ?? ProrationRule.PRORATED;
  const cycleDays = Math.max(1, input.cycleDays);
  const remainingDays = Math.min(cycleDays, Math.max(0, input.remainingDays));
  const fraction = remainingDays / cycleDays;

  if (rule === ProrationRule.NONE) {
    return {
      credit: 0,
      charge: 0,
      net: 0,
      fraction,
      rule,
      explanation:
        'Proration rule is NONE: the change takes effect at the start of the next cycle and nothing is adjusted now.',
    };
  }

  if (rule === ProrationRule.FULL_PERIOD) {
    return {
      credit: 0,
      charge: input.newAmount,
      net: input.newAmount,
      fraction: 1,
      rule,
      explanation:
        'Proration rule is FULL_PERIOD: the new amount is charged in full for the current cycle with no credit for the unused part of the old plan.',
    };
  }

  const credit = mulMoney(input.oldAmount, fraction);
  const charge = mulMoney(input.newAmount, fraction);
  const net = charge - credit;
  return {
    credit,
    charge,
    net,
    fraction,
    rule,
    explanation:
      `${remainingDays} of ${cycleDays} days remain in the cycle (${(fraction * 100).toFixed(1)}%). ` +
      `Credit ${credit} for the unused old plan, charge ${charge} for the new plan, net ${net}.`,
  };
}

/** Convenience wrapper: prorate from a change date within a known period. */
export function prorateFromDates(
  oldAmount: Money,
  newAmount: Money,
  changeDate: Date | string,
  periodStart: Date | string,
  cycle: BillingCycle,
  rule?: ProrationRule,
): ProrationResult {
  const cycleDays = CYCLE_DAYS[cycle];
  const periodEnd = advanceCycle(periodStart, cycle);
  const remainingDays = Math.max(0, daysBetween(changeDate, periodEnd));
  return prorate({ oldAmount, newAmount, remainingDays, cycleDays, rule });
}

/**
 * Cancellation: stop the schedule and settle the current cycle.
 * PRORATED  -> credit the unused remainder
 * FULL_PERIOD -> keep the money, service runs to the end of the paid period
 * NONE      -> no credit at all
 */
export function cancellationSettlement(
  amount: Money,
  cancelDate: Date | string,
  periodStart: Date | string,
  cycle: BillingCycle,
  rule: ProrationRule,
): { creditAmount: Money; serviceEndsAt: IsoDate; explanation: string } {
  const periodEnd = advanceCycle(periodStart, cycle);
  const cycleDays = CYCLE_DAYS[cycle];
  const remainingDays = Math.max(0, daysBetween(cancelDate, periodEnd));
  switch (rule) {
    case ProrationRule.PRORATED: {
      const creditAmount = mulMoney(amount, remainingDays / cycleDays);
      return {
        creditAmount,
        serviceEndsAt: toIso(cancelDate),
        explanation: `Cancelled with ${remainingDays} of ${cycleDays} days unused; a credit note for ${creditAmount} is issued and service stops immediately.`,
      };
    }
    case ProrationRule.FULL_PERIOD:
      return {
        creditAmount: 0,
        serviceEndsAt: toIso(periodEnd),
        explanation: `Cancelled, but the current period is already paid for: no credit, service continues until ${toIso(periodEnd).slice(0, 10)}.`,
      };
    case ProrationRule.NONE:
    default:
      return {
        creditAmount: 0,
        serviceEndsAt: toIso(cancelDate),
        explanation: 'Cancelled with no refund under the NONE cancellation rule.',
      };
  }
}

/* ------------------------------------------------------------------ invoicing */

export interface InvoiceableLine {
  lineId: string;
  productId: string;
  description: string;
  qty: number;
  qtyShipped: number;
  qtyInvoiced: number;
  unitPrice: Money;
  discountPct: number;
  taxPct: number;
  isSubscription: boolean;
}

export interface InvoiceableResult {
  lineId: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: Money;
  discountPct: number;
  net: Money;
  tax: Money;
  total: Money;
}

/**
 * Nothing is billed before it ships (screen 13).
 * Returns only the not-yet-invoiced SHIPPED quantity of the one-time lines —
 * partial delivery therefore produces a partial invoice, automatically.
 * Subscription lines are excluded here; they are billed by their own schedule.
 */
export function invoiceableOneTimeLines(lines: InvoiceableLine[]): InvoiceableResult[] {
  return lines
    .filter((l) => !l.isSubscription)
    .map((l) => {
      const qty = Math.max(0, Math.min(l.qtyShipped, l.qty) - l.qtyInvoiced);
      const gross = l.unitPrice * qty;
      const net = gross - Math.round((gross * l.discountPct) / 100);
      const tax = Math.round((net * l.taxPct) / 100);
      return {
        lineId: l.lineId,
        productId: l.productId,
        description: l.description,
        qty,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        net,
        tax,
        total: net + tax,
      };
    })
    .filter((l) => l.qty > 0);
}
