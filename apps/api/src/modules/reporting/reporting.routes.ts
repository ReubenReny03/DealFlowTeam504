/**
 * Screen 15 — Admin / Reporting Dashboard.
 * Every KPI is aggregated from real documents. "146 quotes this month" is a
 * count, not a constant; "6.4 hours" is the mean of real approval cycle times.
 */
import { Router } from 'express';
import {
  APPROVAL_SLA_HOURS,
  QuoteStage,
  Role,
  formatDurationHours,
  formatMoney,
  toMajor,
  type ReportingDashboardDto,
  type ReportingQuery,
} from '@dealflow/shared';
import { Approval, Quotation } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { toCsv } from '../../utils/csv.js';
import { buildSimplePdf } from '../../utils/simplePdf.js';
import { buildSimpleXlsx, type XlsxRow } from '../../utils/simpleXlsx.js';
import { mountModuleHealth } from '../module.health.js';

export const reportingRouter = Router();

mountModuleHealth(reportingRouter, {
  module: 'reporting',
  domain: 'analytics',
  screens: [15],
  implemented: [
    'GET / — KPIs with all four filters (Period, Rep, Approval Status, Product)',
    'GET /export.csv',
    'GET /export.pdf',
    'GET /export.xlsx',
  ],
  todo: [],
});

function periodRange(query: ReportingQuery): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  if (query.from) return { from: new Date(query.from), to };
  const from = new Date(to);
  switch (query.period) {
    case 'today':
      from.setUTCHours(0, 0, 0, 0);
      break;
    case 'week':
      from.setUTCDate(from.getUTCDate() - 7);
      break;
    case 'month':
    default:
      from.setUTCDate(from.getUTCDate() - 30);
      break;
  }
  return { from, to };
}

async function buildReportingDashboard(query: ReportingQuery): Promise<ReportingDashboardDto> {
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
    })
      .select('quotationId')
      .lean();
    const ids = new Set(approvals.map((a: any) => String(a.quotationId)));
    scoped = quotes.filter((q) => ids.has(String(q._id)));
  }

  const decided: any[] = await Approval.find({
    submittedAt: { $gte: from, $lte: to },
    cycleTimeMs: { $gt: 0 },
  })
    .select('cycleTimeMs')
    .lean();
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

  const byRepMap = new Map<
    string,
    { repName: string; quotes: number; value: number; discountWeighted: number; gross: number }
  >();
  const byProductMap = new Map<
    string,
    { name: string; qty: number; value: number; discountWeighted: number; gross: number }
  >();

  for (const q of scoped) {
    const rep = byRepMap.get(String(q.ownerId)) ?? {
      repName: q.ownerName,
      quotes: 0,
      value: 0,
      discountWeighted: 0,
      gross: 0,
    };
    rep.quotes += 1;
    rep.value += q.totals?.grandTotal ?? 0;
    for (const l of q.lines) {
      rep.discountWeighted += l.lineGross * l.discountPct;
      rep.gross += l.lineGross;
      const p = byProductMap.get(String(l.productId)) ?? {
        name: l.productName,
        qty: 0,
        value: 0,
        discountWeighted: 0,
        gross: 0,
      };
      p.qty += l.qty;
      p.value += l.lineTotal;
      p.discountWeighted += l.lineGross * l.discountPct;
      p.gross += l.lineGross;
      byProductMap.set(String(l.productId), p);
    }
    byRepMap.set(String(q.ownerId), rep);
  }

  const confirmed = scoped.filter((q) => q.stage === QuoteStage.CONFIRMED);

  return {
    quotesCreated: scoped.length,
    avgApprovalTimeMs,
    avgApprovalTimeLabel: formatDurationHours(avgApprovalTimeMs),
    avgApprovalSlaHours: APPROVAL_SLA_HOURS,
    avgApprovalWithinSla:
      avgApprovalTimeMs > 0 && avgApprovalTimeMs <= APPROVAL_SLA_HOURS * 3600_000,
    topUpsellProduct: topUpsell
      ? { productId: topUpsell[0], name: topUpsell[1].name, timesAdded: topUpsell[1].n }
      : null,
    totalQuotedValue: scoped.reduce((a, q) => a + (q.totals?.grandTotal ?? 0), 0),
    totalConfirmedValue: confirmed.reduce((a, q) => a + (q.totals?.grandTotal ?? 0), 0),
    conversionRatePct: scoped.length
      ? Math.round((confirmed.length / scoped.length) * 1000) / 10
      : 0,
    byStage: Object.values(QuoteStage).map((stage) => ({
      stage,
      count: scoped.filter((q) => q.stage === stage).length,
      value: scoped
        .filter((q) => q.stage === stage)
        .reduce((a, q) => a + (q.totals?.grandTotal ?? 0), 0),
    })),
    byRep: [...byRepMap.entries()].map(([repId, r]) => ({
      repId,
      repName: r.repName,
      quotes: r.quotes,
      value: r.value,
      avgDiscountPct: r.gross ? Math.round((r.discountWeighted / r.gross) * 100) / 100 : 0,
    })),
    byProduct: [...byProductMap.entries()]
      .map(([productId, p]) => ({
        productId,
        name: p.name,
        qty: p.qty,
        value: p.value,
        avgDiscountPct: p.gross ? Math.round((p.discountWeighted / p.gross) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.value - a.value),
    filtersApplied: { ...query, from: from.toISOString(), to: to.toISOString() },
  };
}

const VIEW: Role[] = [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE];

reportingRouter.get(
  '/',
  requireAuth(VIEW),
  asyncHandler(async (req, res) => {
    const dashboard = await buildReportingDashboard(req.query as ReportingQuery);
    ok(res, dashboard);
  }),
);

reportingRouter.get(
  '/export.csv',
  requireAuth(VIEW),
  asyncHandler(async (req, res) => {
    const d = await buildReportingDashboard(req.query as ReportingQuery);
    const rows: unknown[][] = [
      ['Summary'],
      ['Quotes Created', d.quotesCreated],
      ['Avg Approval Time', d.avgApprovalTimeLabel],
      [
        `Approval SLA (target ${d.avgApprovalSlaHours}h)`,
        d.avgApprovalWithinSla ? 'Within SLA' : 'Over SLA',
      ],
      ['Top Upsell Product', d.topUpsellProduct?.name ?? '—', d.topUpsellProduct?.timesAdded ?? ''],
      ['Total Quoted Value', formatMoney(d.totalQuotedValue)],
      ['Total Confirmed Value', formatMoney(d.totalConfirmedValue)],
      ['Conversion Rate %', d.conversionRatePct],
      [],
      ['By stage'],
      ['Stage', 'Count', 'Value'],
      ...d.byStage.map((s) => [s.stage, s.count, formatMoney(s.value)]),
      [],
      ['By rep'],
      ['Rep', 'Quotes', 'Value', 'Avg Discount %'],
      ...d.byRep.map((r) => [r.repName, r.quotes, formatMoney(r.value), r.avgDiscountPct]),
      [],
      ['By product'],
      ['Product', 'Qty', 'Value', 'Avg Discount %'],
      ...d.byProduct.map((p) => [p.name, p.qty, formatMoney(p.value), p.avgDiscountPct]),
    ];
    const csv = toCsv(['Reporting export'], rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dealflow360-reporting-${Date.now()}.csv"`,
    );
    res.send(csv);
  }),
);

reportingRouter.get(
  '/export.pdf',
  requireAuth(VIEW),
  asyncHandler(async (req, res) => {
    const d = await buildReportingDashboard(req.query as ReportingQuery);
    const pdf = buildSimplePdf({
      title: 'DealFlow360 — Reporting',
      summary: [
        ['Quotes Created', String(d.quotesCreated)],
        ['Avg Approval Time', d.avgApprovalTimeLabel],
        [
          `Approval SLA (target ${d.avgApprovalSlaHours}h)`,
          d.avgApprovalWithinSla ? 'Within SLA' : 'Over SLA',
        ],
        [
          'Top Upsell Product',
          d.topUpsellProduct
            ? `${d.topUpsellProduct.name} (${d.topUpsellProduct.timesAdded}x)`
            : '—',
        ],
        ['Total Quoted Value', formatMoney(d.totalQuotedValue)],
        ['Total Confirmed Value', formatMoney(d.totalConfirmedValue)],
        ['Conversion Rate', `${d.conversionRatePct}%`],
      ],
      sections: [
        {
          heading: 'By stage',
          columns: [
            { header: 'Stage', width: 20 },
            { header: 'Count', width: 8, align: 'right' },
            { header: 'Value', width: 16, align: 'right' },
          ],
          rows: d.byStage.map((s) => [s.stage, s.count, formatMoney(s.value)]),
        },
        {
          heading: 'By rep',
          columns: [
            { header: 'Rep', width: 22 },
            { header: 'Quotes', width: 8, align: 'right' },
            { header: 'Value', width: 14, align: 'right' },
            { header: 'Avg Disc %', width: 11, align: 'right' },
          ],
          rows: d.byRep.map((r) => [r.repName, r.quotes, formatMoney(r.value), r.avgDiscountPct]),
        },
        {
          heading: 'By product (top 15)',
          columns: [
            { header: 'Product', width: 24 },
            { header: 'Qty', width: 6, align: 'right' },
            { header: 'Value', width: 14, align: 'right' },
            { header: 'Avg Disc %', width: 11, align: 'right' },
          ],
          rows: d.byProduct
            .slice(0, 15)
            .map((p) => [p.name, p.qty, formatMoney(p.value), p.avgDiscountPct]),
        },
      ],
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dealflow360-reporting-${Date.now()}.pdf"`,
    );
    res.send(pdf);
  }),
);

reportingRouter.get(
  '/export.xlsx',
  requireAuth(VIEW),
  asyncHandler(async (req, res) => {
    const d = await buildReportingDashboard(req.query as ReportingQuery);
    const money = (m: number) => toMajor(m);

    const rows: XlsxRow[] = [
      [{ value: 'DealFlow360 — Reporting', style: 'title', colSpan: 4 }],
      [],
      [{ value: 'Summary', style: 'label', colSpan: 4 }],
      [
        { value: 'Quotes Created', style: 'text' },
        { value: d.quotesCreated, style: 'int' },
      ],
      [
        { value: 'Avg Approval Time', style: 'text' },
        { value: d.avgApprovalTimeLabel, style: 'text' },
      ],
      [
        { value: `Approval SLA (target ${d.avgApprovalSlaHours}h)`, style: 'text' },
        { value: d.avgApprovalWithinSla ? 'Within SLA' : 'Over SLA', style: 'text' },
      ],
      [
        { value: 'Top Upsell Product', style: 'text' },
        { value: d.topUpsellProduct?.name ?? '—', style: 'text' },
        { value: d.topUpsellProduct?.timesAdded ?? '', style: 'int' },
      ],
      [
        { value: 'Total Quoted Value', style: 'text' },
        { value: money(d.totalQuotedValue), style: 'currency' },
      ],
      [
        { value: 'Total Confirmed Value', style: 'text' },
        { value: money(d.totalConfirmedValue), style: 'currency' },
      ],
      [
        { value: 'Conversion Rate', style: 'text' },
        { value: d.conversionRatePct, style: 'percent' },
      ],
      [],
      [{ value: 'By stage', style: 'label', colSpan: 4 }],
      [
        { value: 'Stage', style: 'header' },
        { value: 'Count', style: 'header' },
        { value: 'Value', style: 'header' },
      ],
      ...d.byStage.map((s): XlsxRow => [
        { value: s.stage, style: 'text' },
        { value: s.count, style: 'int' },
        { value: money(s.value), style: 'currency' },
      ]),
      [],
      [{ value: 'By rep', style: 'label', colSpan: 4 }],
      [
        { value: 'Rep', style: 'header' },
        { value: 'Quotes', style: 'header' },
        { value: 'Value', style: 'header' },
        { value: 'Avg Discount %', style: 'header' },
      ],
      ...d.byRep.map((r): XlsxRow => [
        { value: r.repName, style: 'text' },
        { value: r.quotes, style: 'int' },
        { value: money(r.value), style: 'currency' },
        { value: r.avgDiscountPct, style: 'percent' },
      ]),
      [],
      [{ value: 'By product', style: 'label', colSpan: 4 }],
      [
        { value: 'Product', style: 'header' },
        { value: 'Qty', style: 'header' },
        { value: 'Value', style: 'header' },
        { value: 'Avg Discount %', style: 'header' },
      ],
      ...d.byProduct.map((p): XlsxRow => [
        { value: p.name, style: 'text' },
        { value: p.qty, style: 'int' },
        { value: money(p.value), style: 'currency' },
        { value: p.avgDiscountPct, style: 'percent' },
      ]),
    ];

    const xlsx = buildSimpleXlsx({ name: 'Reporting', rows, columnWidths: [30, 14, 16, 16] });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dealflow360-reporting-${Date.now()}.xlsx"`,
    );
    res.send(xlsx);
  }),
);
