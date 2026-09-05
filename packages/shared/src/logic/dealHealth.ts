/**
 * Deal-health rule evaluation (screen 14). Pure: the caller supplies "now".
 */
import { AlertSeverity, AlertType, QuoteStage, TERMINAL_STAGES } from '../enums/index.js';
import { daysBetween, type IsoDate } from '../util/dates.js';
import { roundToTwo } from './pricing.js';

export interface DealHealthConfig {
  stalledDays: number;
  anomalyMultiplier: number;
  anomalyAbsoluteCapPct: number;
  trailingWindow: number;
}

export const DEFAULT_DEAL_HEALTH: DealHealthConfig = {
  stalledDays: 7,
  anomalyMultiplier: 2.0,
  anomalyAbsoluteCapPct: 25,
  trailingWindow: 20,
};

export interface DealHealthQuote {
  quotationId: string;
  quotationNumber: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string;
  stage: QuoteStage;
  lastActivityAt: IsoDate;
  /** Revenue-weighted average discount % across the quotation's lines. */
  avgDiscountPct: number;
  promisedDeliveryDate?: IsoDate;
  projectedDeliveryDate?: IsoDate;
}

export interface DealHealthFinding {
  type: AlertType;
  severity: AlertSeverity;
  quotationId: string;
  quotationNumber: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string;
  entityLabel: string;
  /** Short form for screen 14's "Issue" column, e.g. "idle 9 days". */
  issue: string;
  detail: string;
}

/** Idle for longer than the configured window, and not already finished. */
export function detectStalledDeals(
  quotes: DealHealthQuote[],
  now: Date | string,
  config: DealHealthConfig = DEFAULT_DEAL_HEALTH,
): DealHealthFinding[] {
  return quotes
    .filter((q) => !TERMINAL_STAGES.includes(q.stage))
    .map((q) => ({ q, idleDays: daysBetween(q.lastActivityAt, now) }))
    .filter(({ idleDays }) => idleDays > config.stalledDays)
    .map(({ q, idleDays }) => ({
      type: AlertType.STALLED_DEAL,
      severity: idleDays > config.stalledDays * 2 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      quotationId: q.quotationId,
      quotationNumber: q.quotationNumber,
      customerId: q.customerId,
      customerName: q.customerName,
      ownerId: q.ownerId,
      ownerName: q.ownerName,
      entityLabel: q.quotationNumber,
      issue: `idle ${idleDays} days`,
      detail: `${q.quotationNumber} (${q.customerName}) has had no activity for ${idleDays} days, past the ${config.stalledDays}-day threshold, and is still at stage ${q.stage}.`,
    }));
}

/**
 * A discount well above the rep's own trailing average, or above the absolute cap.
 * Comparing against the REP's average (not a global one) is what makes this an
 * anomaly rather than just "a big discount".
 */
export function detectDiscountAnomalies(
  quotes: DealHealthQuote[],
  repTrailingAverages: Record<string, number>,
  config: DealHealthConfig = DEFAULT_DEAL_HEALTH,
): DealHealthFinding[] {
  const findings: DealHealthFinding[] = [];
  for (const q of quotes) {
    if (TERMINAL_STAGES.includes(q.stage)) continue;
    const repAvg = repTrailingAverages[q.ownerId] ?? 0;
    const overMultiplier = repAvg > 0 && q.avgDiscountPct > repAvg * config.anomalyMultiplier;
    const overCap = q.avgDiscountPct > config.anomalyAbsoluteCapPct;
    if (!overMultiplier && !overCap) continue;
    findings.push({
      type: AlertType.DISCOUNT_ANOMALY,
      severity: overCap ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      quotationId: q.quotationId,
      quotationNumber: q.quotationNumber,
      customerId: q.customerId,
      customerName: q.customerName,
      ownerId: q.ownerId,
      ownerName: q.ownerName,
      entityLabel: q.customerName,
      issue: `discount ${roundToTwo(q.avgDiscountPct)}% vs avg ${roundToTwo(repAvg)}%`,
      detail:
        `${q.quotationNumber} for ${q.customerName} averages ${roundToTwo(q.avgDiscountPct)}% discount. ` +
        `${q.ownerName}'s trailing average is ${roundToTwo(repAvg)}%` +
        (overCap ? `, and the quote is above the absolute cap of ${config.anomalyAbsoluteCapPct}%.` : `, more than ${config.anomalyMultiplier}x above it.`),
    });
  }
  return findings;
}

/** Promised earlier than we can actually deliver. */
export function detectDeliverySlippage(quotes: DealHealthQuote[]): DealHealthFinding[] {
  return quotes
    .filter((q) => q.promisedDeliveryDate && q.projectedDeliveryDate)
    .filter((q) => new Date(q.projectedDeliveryDate!) > new Date(q.promisedDeliveryDate!))
    .map((q) => {
      const slipDays = daysBetween(q.promisedDeliveryDate!, q.projectedDeliveryDate!);
      return {
        type: AlertType.DELIVERY_SLIPPAGE,
        severity: slipDays > 7 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
        quotationId: q.quotationId,
        quotationNumber: q.quotationNumber,
        customerId: q.customerId,
        customerName: q.customerName,
        ownerId: q.ownerId,
        ownerName: q.ownerName,
        entityLabel: q.quotationNumber,
        issue: `delivery ${slipDays} day(s) late`,
        detail: `${q.quotationNumber} was promised for ${q.promisedDeliveryDate!.slice(0, 10)} but backorder ETA projects ${q.projectedDeliveryDate!.slice(0, 10)}, a slip of ${slipDays} day(s).`,
      };
    });
}

export function evaluateDealHealth(
  quotes: DealHealthQuote[],
  repTrailingAverages: Record<string, number>,
  now: Date | string,
  config: DealHealthConfig = DEFAULT_DEAL_HEALTH,
): DealHealthFinding[] {
  return [
    ...detectStalledDeals(quotes, now, config),
    ...detectDiscountAnomalies(quotes, repTrailingAverages, config),
    ...detectDeliverySlippage(quotes),
  ];
}

/** Revenue-weighted average discount across a quotation's lines. */
export function averageDiscountPct(
  lines: { lineGross: number; discountPct: number }[],
): number {
  const gross = lines.reduce((a, l) => a + l.lineGross, 0);
  if (gross === 0) return 0;
  return roundToTwo(lines.reduce((a, l) => a + l.lineGross * l.discountPct, 0) / gross);
}
