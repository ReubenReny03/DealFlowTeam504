/**
 * Deal-health alerts (screen 14).
 * These are produced by the REAL rule functions against the seeded quotations,
 * not hand-written, so what the dashboard shows is what the rules actually find.
 */
import {
  AlertStatus,
  AlertType,
  averageDiscountPct,
  detectDeliverySlippage,
  detectDiscountAnomalies,
  detectStalledDeals,
  type DealHealthQuote,
} from '@dealflow/shared';
import { DealAlert, Order, Quotation } from '../../db/models.js';
import { G, IDS, fid } from '../ids.js';
import { REP_TRAILING_AVG } from '../users.seed.js';
import type { SeedContext } from '../context.js';

export async function seedAlerts(ctx: SeedContext): Promise<void> {
  const quotes = await Quotation.find().lean();
  const orders = await Order.find().lean();
  const projectedByQuotation = new Map<string, string | undefined>(
    orders.map((o: any) => [String(o.quotationId), o.projectedDeliveryDate?.toISOString()]),
  );

  const inputs: DealHealthQuote[] = quotes.map((q: any) => ({
    quotationId: String(q._id),
    quotationNumber: q.number,
    customerId: String(q.customerId),
    customerName: q.customerName,
    ownerId: String(q.ownerId),
    ownerName: q.ownerName,
    stage: q.stage,
    lastActivityAt: q.lastActivityAt.toISOString(),
    avgDiscountPct: averageDiscountPct(q.lines.map((l: any) => ({ lineGross: l.lineGross, discountPct: l.discountPct }))),
    promisedDeliveryDate: q.promisedDeliveryDate?.toISOString(),
    projectedDeliveryDate: projectedByQuotation.get(String(q._id)),
  }));

  const findings = [
    ...detectStalledDeals(inputs, ctx.now),
    ...detectDiscountAnomalies(inputs, REP_TRAILING_AVG),
    ...detectDeliverySlippage(inputs),
  ];

  // One alert per (quotation, type) — the unique index enforces it too.
  const seen = new Set<string>();
  const docs = findings
    .filter((f) => {
      const key = `${f.quotationId}:${f.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f, i) => ({
      _id: fid(G.ALERT, i + 1),
      type: f.type,
      severity: f.severity,
      // Screen 14 shows Q-1030 already nudged and Delta LLC already escalated.
      status:
        f.quotationNumber === 'Q-1030' && f.type === AlertType.STALLED_DEAL
          ? AlertStatus.NUDGED
          : f.type === AlertType.DISCOUNT_ANOMALY && f.customerName === 'Delta LLC'
            ? AlertStatus.ESCALATED
            : AlertStatus.OPEN,
      quotationId: f.quotationId,
      quotationNumber: f.quotationNumber,
      customerId: f.customerId,
      customerName: f.customerName,
      ownerId: f.ownerId,
      ownerName: f.ownerName,
      entityLabel: f.entityLabel,
      issue: f.issue,
      detail: f.detail,
      flaggedAt: ctx.daysAgo(1),
      actions:
        f.quotationNumber === 'Q-1030' && f.type === AlertType.STALLED_DEAL
          ? [{ action: 'NUDGE' as const, actorId: IDS.users.shah, actorName: 'M. Shah', at: ctx.hoursAgo(6), note: 'Nudge sent to J. Rao' }]
          : f.type === AlertType.DISCOUNT_ANOMALY && f.customerName === 'Delta LLC'
            ? [{ action: 'ESCALATE' as const, actorId: IDS.users.shah, actorName: 'M. Shah', at: ctx.hoursAgo(4), note: 'Escalated to Manager' }]
            : [],
      createdAt: ctx.daysAgo(1),
      updatedAt: ctx.hoursAgo(4),
    }));

  if (docs.length > 0) await DealAlert.insertMany(docs);
}
