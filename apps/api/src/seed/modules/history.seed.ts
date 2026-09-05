/**
 * Historical volume, so the reporting KPIs on screen 15 ("146 quotes this month",
 * "avg approval time 6.4 hours", "top upsell product") are computed from real
 * documents rather than hardcoded. Also seeds four extra idle open quotations so
 * screen 14's Stalled Deals tile reads 5, exactly as the mockup does.
 */
import {
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  CustomerTier,
  QuoteStage,
  Role,
} from '@dealflow/shared';
import { Approval, Quotation } from '../../db/models.js';
import { G, IDS, fid } from '../ids.js';
import { P, PRICE_LISTS } from '../catalog.js';
import { buildQuotation } from '../build.js';
import type { SeedContext } from '../context.js';

const CUSTOMERS = [
  { id: IDS.customers.acme, name: 'Acme Corp', tier: CustomerTier.GOLD, pl: IDS.priceLists.gold, rule: PRICE_LISTS.GOLD },
  { id: IDS.customers.beta, name: 'Beta Industries', tier: CustomerTier.SILVER, pl: IDS.priceLists.silver, rule: PRICE_LISTS.SILVER },
  { id: IDS.customers.delta, name: 'Delta LLC', tier: CustomerTier.BRONZE, pl: IDS.priceLists.bronze, rule: PRICE_LISTS.BRONZE },
  { id: IDS.customers.novus, name: 'Novus Retail', tier: CustomerTier.SILVER, pl: IDS.priceLists.silver, rule: PRICE_LISTS.SILVER },
  { id: IDS.customers.zenith, name: 'Zenith Co', tier: CustomerTier.GOLD, pl: IDS.priceLists.gold, rule: PRICE_LISTS.GOLD },
  { id: IDS.customers.orion, name: 'Orion Ltd', tier: CustomerTier.GOLD, pl: IDS.priceLists.gold, rule: PRICE_LISTS.GOLD },
];

const REPS = [
  { id: IDS.users.rao, name: 'J. Rao' },
  { id: IDS.users.nair, name: 'S. Nair' },
];

const PRODUCTS = [P.laptop, P.dock, P.mouse, P.warranty, P.setup];

/**
 * Quotes already created in the named seeds; the history tops the month up to 146.
 * Kept in step with the named set (13 quotations) so the seeded volume stays 149.
 */
const HISTORY_COUNT = 133;
/** Approval cycle times in hours. Mean is 6.4 -> screen 15's "Avg Approval Time". */
const CYCLE_HOURS = [2.1, 3.5, 4.0, 5.2, 6.0, 6.4, 7.1, 8.3, 9.0, 10.2, 11.0, 4.0];

export async function seedReportingHistory(ctx: SeedContext): Promise<void> {
  const quotations: any[] = [];
  const approvals: any[] = [];

  for (let i = 0; i < HISTORY_COUNT; i++) {
    const cust = CUSTOMERS[i % CUSTOMERS.length];
    const rep = REPS[i % REPS.length];
    const daysBack = (i % 27) + 1; // spread across the current month
    // Deterministic pseudo-variation, so the seed stays reproducible.
    const qty = 1 + (i % 6);
    const discount = i % 5 === 0 ? 3 : i % 7 === 0 ? 12 : (i % 9);
    const stage =
      i % 11 === 0 ? QuoteStage.REJECTED
      : i % 4 === 0 ? QuoteStage.CONFIRMED
      : i % 3 === 0 ? QuoteStage.APPROVED
      : QuoteStage.DRAFT;

    const primary = PRODUCTS[i % PRODUCTS.length];
    const attach = PRODUCTS[(i + 2) % PRODUCTS.length];

    const built = buildQuotation({
      _id: fid(G.HISTORY, i + 1),
      number: `Q-${800 + i}`,
      customerId: cust.id, customerName: cust.name, tier: cust.tier,
      priceListId: cust.pl, priceList: cust.rule,
      ownerId: rep.id, ownerName: rep.name,
      stage,
      lines:
        i % 3 === 0
          ? [
              { product: primary, qty, discountPct: discount },
              // Care Plan 2yr is deliberately the most-added upsell, so screen 15's
              // "Top Upsell Product" KPI is a real count, not a constant.
              { product: P.carePlan2yr, qty: 1, discountPct: 0, addedFromUpsell: true },
            ]
          : [
              { product: primary, qty, discountPct: discount },
              { product: attach, qty: 1, discountPct: 0, addedFromUpsell: i % 5 === 0 },
            ],
      createdAt: ctx.daysAgo(daysBack),
      submittedAt: ctx.daysAgo(daysBack),
      // Kept recent on purpose: only the deliberate idle quotes below should be stalled.
      lastActivityAt: ctx.daysAgo(Math.min(5, Math.max(0, daysBack - 1))),
      validUntil: ctx.daysAhead(30 - daysBack),
    });
    quotations.push(built.doc);

    // 12 of them carry a completed approval, giving the Avg Approval Time KPI real data.
    if (i < CYCLE_HOURS.length) {
      const submittedAt = ctx.daysAgo(daysBack);
      const decidedAt = new Date(submittedAt.getTime() + CYCLE_HOURS[i] * 3_600_000);
      approvals.push({
        _id: fid(G.HISTORY, 500 + i),
        quotationId: built.doc._id, quotationNumber: built.doc.number,
        customerId: cust.id, customerName: cust.name, tier: cust.tier,
        ownerId: rep.id, ownerName: rep.name,
        amount: built.totals.grandTotal, currency: 'USD',
        status: ApprovalStatus.APPROVED,
        risk: built.risk,
        steps: [{
          role: Role.SALES_MANAGER, status: ApprovalStepStatus.APPROVED,
          actorId: IDS.users.shah, actorName: 'M. Shah', action: ApprovalAction.APPROVED,
          reason: 'Within policy', actedAt: decidedAt, activatedAt: submittedAt,
        }],
        currentStepIndex: -1,
        trail: [
          { actorId: rep.id, actorName: rep.name, role: Role.SALES_REP, action: ApprovalAction.SUBMITTED, reason: 'Submitted for review', at: submittedAt },
          { actorId: IDS.users.shah, actorName: 'M. Shah', role: Role.SALES_MANAGER, action: ApprovalAction.APPROVED, reason: 'Within policy', at: decidedAt },
        ],
        submittedAt, decidedAt,
        cycleTimeMs: decidedAt.getTime() - submittedAt.getTime(),
        reEnteredFromNegotiation: false,
        createdAt: submittedAt, updatedAt: decidedAt,
      });
    }
  }

  /* ---- Two extra idle open quotations. With Q-1030, Q-1035 and Q-1043 that
         makes Stalled Deals read 5, exactly as screen 14 does.              ---- */
  const idleSpecs = [
    { n: 'Q-1021', cust: CUSTOMERS[1], rep: REPS[1], idle: 12 },
    { n: 'Q-1024', cust: CUSTOMERS[3], rep: REPS[0], idle: 15 },
  ];
  idleSpecs.forEach((spec, i) => {
    quotations.push(
      buildQuotation({
        _id: fid(G.HISTORY, 900 + i),
        number: spec.n,
        customerId: spec.cust.id, customerName: spec.cust.name, tier: spec.cust.tier,
        priceListId: spec.cust.pl, priceList: spec.cust.rule,
        ownerId: spec.rep.id, ownerName: spec.rep.name,
        stage: QuoteStage.DRAFT,
        lines: [{ product: P.laptop, qty: 4 + i, discountPct: 4 }],
        createdAt: ctx.daysAgo(spec.idle + 4),
        lastActivityAt: ctx.daysAgo(spec.idle),
        validUntil: ctx.daysAhead(10),
      }).doc,
    );
  });

  /* ---- A second discount anomaly, owned by S. Nair, so screen 14's Discount
         Anomalies tile reads 2 and the rule is shown comparing against each
         rep's OWN trailing average rather than a global one.               ---- */
  quotations.push(
    buildQuotation({
      _id: fid(G.HISTORY, 950),
      number: 'Q-1026',
      customerId: CUSTOMERS[1].id, customerName: CUSTOMERS[1].name, tier: CUSTOMERS[1].tier,
      priceListId: CUSTOMERS[1].pl, priceList: CUSTOMERS[1].rule,
      ownerId: REPS[1].id, ownerName: REPS[1].name,
      stage: QuoteStage.DRAFT,
      lines: [{ product: P.laptop, qty: 3, discountPct: 29 }],
      createdAt: ctx.daysAgo(4),
      lastActivityAt: ctx.daysAgo(2),
      validUntil: ctx.daysAhead(26),
    }).doc,
  );

  await Quotation.insertMany(quotations);
  await Approval.insertMany(approvals);
}
