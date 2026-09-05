/**
 * Screen 15 — Admin / Reporting Dashboard.
 * Every KPI is aggregated from real documents. "146 quotes this month" is a
 * count, not a constant; "6.4 hours" is the mean of real approval cycle times.
 */
import { Router } from 'express';
import {
  QuoteStage,
  Role,
  formatDurationHours,
  type ReportingDashboardDto,
  type ReportingQuery,
} from '@dealflow/shared';
import { Approval, Quotation } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { mountModuleHealth } from '../module.health.js';

export const reportingRouter = Router();

mountModuleHealth(reportingRouter, {
  module: 'reporting', owner: 'D', screens: [15],
  implemented: ['GET / — KPIs with all four filters (Period, Rep, Approval Status, Product)'],
  todo: [
    'GET /export.csv — Export XLS (CSV first, per FEATURE_PRIORITY P2) (Agent D)',
    'GET /export.pdf — Export PDF (Agent D)',
  ],
});

function periodRange(query: ReportingQuery): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  if (query.from) return { from: new Date(query.from), to };
  const from = new Date(to);
  switch (query.period) {
    case 'today': from.setUTCHours(0, 0, 0, 0); break;
    case 'week': from.setUTCDate(from.getUTCDate() - 7); break;
    case 'month':
    default: from.setUTCDate(from.getUTCDate() - 30); break;
  }
  return { from, to };
}

reportingRouter.get(
  '/',
  requireAuth([Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE]),
  asyncHandler(async (req, res) => {
    const query = req.query as ReportingQuery;
    const { from, to } = periodRange(query);

    const filter: Record<string, unknown> = { createdAt: { $gte: from, $lte: to } };
    if (query.repId) filter.ownerId = query.repId;
    if (query.productId) filter['lines.productId'] = query.productId;
    if (query.category) filter['lines.category'] = query.category;

    const quotes: any[] = await Quotation.find(filter).lean();

    // Approval-status filter is applied after the fact, against the approval records.
    let scoped = quotes;
    if (query.approvalStatus) {
      const approvals = await Approval.find({
        quotationId: { $in: quotes.map((q) => q._id) },
        status: query.approvalStatus,
      }).select('quotationId').lean();
      const ids = new Set(approvals.map((a: any) => String(a.quotationId)));
      scoped = quotes.filter((q) => ids.has(String(q._id)));
    }

    const decided: any[] = await Approval.find({
      submittedAt: { $gte: from, $lte: to },
      cycleTimeMs: { $gt: 0 },
    }).select('cycleTimeMs').lean();
    const avgApprovalTimeMs = decided.length
      ? Math.round(decided.reduce((a, x) => a + x.cycleTimeMs, 0) / decided.length)
      : 0;

    /* ---- Top upsell product: how often a line was actually added from the panel ---- */
    const upsellCounts = new Map<string, { name: string; n: number }>();
    for (const q of scoped) {
      for (const l of q.lines) {
        if (!l.addedFromUpsell) continue;
        const key = String(l.productId);
        const entry = upsellCounts.get(key) ?? { name: l.productName, n: 0 };
        entry.n += 1;
        upsellCounts.set(key, entry);
      }
    }
    const topUpsell = [...upsellCounts.entries()].sort((a, b) => b[1].n - a[1].n)[0];

    const byRepMap = new Map<string, { repName: string; quotes: number; value: number; discountWeighted: number; gross: number }>();
    const byProductMap = new Map<string, { name: string; qty: number; value: number; discountWeighted: number; gross: number }>();

    for (const q of scoped) {
      const rep = byRepMap.get(String(q.ownerId)) ?? { repName: q.ownerName, quotes: 0, value: 0, discountWeighted: 0, gross: 0 };
      rep.quotes += 1;
      rep.value += q.totals?.grandTotal ?? 0;
      for (const l of q.lines) {
        rep.discountWeighted += l.lineGross * l.discountPct;
        rep.gross += l.lineGross;
        const p = byProductMap.get(String(l.productId)) ?? { name: l.productName, qty: 0, value: 0, discountWeighted: 0, gross: 0 };
        p.qty += l.qty;
        p.value += l.lineTotal;
        p.discountWeighted += l.lineGross * l.discountPct;
        p.gross += l.lineGross;
        byProductMap.set(String(l.productId), p);
      }
      byRepMap.set(String(q.ownerId), rep);
    }

    const confirmed = scoped.filter((q) => q.stage === QuoteStage.CONFIRMED);

    const payload: ReportingDashboardDto = {
      quotesCreated: scoped.length,
      avgApprovalTimeMs,
      avgApprovalTimeLabel: formatDurationHours(avgApprovalTimeMs),
      topUpsellProduct: topUpsell ? { productId: topUpsell[0], name: topUpsell[1].name, timesAdded: topUpsell[1].n } : null,
      totalQuotedValue: scoped.reduce((a, q) => a + (q.totals?.grandTotal ?? 0), 0),
      totalConfirmedValue: confirmed.reduce((a, q) => a + (q.totals?.grandTotal ?? 0), 0),
      conversionRatePct: scoped.length ? Math.round((confirmed.length / scoped.length) * 1000) / 10 : 0,
      byStage: Object.values(QuoteStage).map((stage) => ({
        stage,
        count: scoped.filter((q) => q.stage === stage).length,
        value: scoped.filter((q) => q.stage === stage).reduce((a, q) => a + (q.totals?.grandTotal ?? 0), 0),
      })),
      byRep: [...byRepMap.entries()].map(([repId, r]) => ({
        repId, repName: r.repName, quotes: r.quotes, value: r.value,
        avgDiscountPct: r.gross ? Math.round((r.discountWeighted / r.gross) * 100) / 100 : 0,
      })),
      byProduct: [...byProductMap.entries()]
        .map(([productId, p]) => ({
          productId, name: p.name, qty: p.qty, value: p.value,
          avgDiscountPct: p.gross ? Math.round((p.discountWeighted / p.gross) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.value - a.value),
      filtersApplied: { ...query, from: from.toISOString(), to: to.toISOString() },
    };
    ok(res, payload);
  }),
);
