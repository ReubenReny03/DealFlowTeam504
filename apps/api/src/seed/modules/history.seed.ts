/**
 * Historical volume, so the reporting KPIs on screen 15 ("N quotes this month",
 * "avg approval time 6.4 hours", "top upsell product") are computed from real
 * documents rather than hardcoded, and every quotation/reporting/deal-health
 * screen reads like a busy, live tenant rather than a handful of rows. Also
 * seeds four extra idle open quotations so screen 14's Stalled Deals tile
 * reads 5, exactly as the mockup does.
 */
import {
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  QuoteStage,
  Role,
} from '@dealflow/shared';
import { Approval, Quotation } from '../../db/models.js';
import { G, IDS, fid } from '../ids.js';
import { CUSTOMERS, P, REPS } from '../catalog.js';
import { buildQuotation } from '../build.js';
import type { SeedContext } from '../context.js';

const PRODUCTS = [P.laptop, P.dock, P.mouse, P.warranty, P.setup];

/**
 * Bulk filler on top of the 13 named/hero quotations. Numbered from 9000 up
 * (not 800, as originally) so raising this count can never collide with the
 * named quotations (1029-1046), the idle/anomaly specials below
 * (1021/1024/1026), OR the live app's own quotation numbering — `nextSeq`
 * (`apps/api/src/db/models.ts`) hands out real, user-created quotations
 * starting at Q-2000.
 */
const HISTORY_COUNT = 300;
/** Approval cycle times in hours. Mean is 6.4 -> screen 15's "Avg Approval Time". */
const CYCLE_HOURS = [2.1, 3.5, 4.0, 5.2, 6.0, 6.4, 7.1, 8.3, 9.0, 10.2, 11.0, 4.0];
/** How many history quotes carry a completed Approval — cycles through CYCLE_HOURS. */
const APPROVAL_SAMPLE_COUNT = 40;

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
      number: `Q-${9000 + i}`,
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
      // Floor of 1 (not 0): the seed anchor is normalised to midday UTC, so
      // "0 days ago" is a fixed instant that reads as a future timestamp for
      // anyone viewing the app before noon UTC on seed day.
      lastActivityAt: ctx.daysAgo(Math.min(5, Math.max(1, daysBack - 1))),
      validUntil: ctx.daysAhead(30 - daysBack),
    });
    quotations.push(built.doc);

    // The first APPROVAL_SAMPLE_COUNT of them carry a completed approval, giving
    // the Avg Approval Time KPI real data. Cycles through CYCLE_HOURS so the
    // documented 6.4h mean holds regardless of how many samples are taken.
    if (i < APPROVAL_SAMPLE_COUNT) {
      const submittedAt = ctx.daysAgo(daysBack);
      const decidedAt = new Date(submittedAt.getTime() + CYCLE_HOURS[i % CYCLE_HOURS.length] * 3_600_000);
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
