/**
 * The quotation set behind screens 2, 3, 4, 5, 6, 11 and 14.
 *
 * Everything here is computed by the shared pure functions — see seed/build.ts.
 * The headline record is Q-1042: two lines that produce riskScore 33 -> HIGH ->
 * [SALES_MANAGER, FINANCE], which is the number the whole demo hangs on.
 */
import { CustomerTier, QuoteStage } from '@dealflow/shared';
import { Quotation } from '../../db/models.js';
import { IDS } from '../ids.js';
import { P, PRICE_LISTS } from '../catalog.js';
import { buildQuotation } from '../build.js';
import type { SeedContext } from '../context.js';

export async function seedQuotations(ctx: SeedContext): Promise<void> {
  const docs = [
    /* ---- Q-1042 — THE DEMO QUOTE. Acme Corp, Gold, pending Sales Manager. ----
       Laptop Pro 14 x2 @ 12% (allowed 15 -> OK)
       Onsite Setup  x1 @ 18% (allowed min(15,10)=10 -> OVER by 8)
       => blendedOverPct 1.26, maxSingleOver 8, riskScore 33, HIGH             */
    buildQuotation({
      _id: IDS.quotations.q1042, number: 'Q-1042',
      customerId: IDS.customers.acme, customerName: 'Acme Corp', tier: CustomerTier.GOLD,
      priceListId: IDS.priceLists.gold, priceList: PRICE_LISTS.GOLD,
      ownerId: IDS.users.rao, ownerName: 'J. Rao',
      stage: QuoteStage.PENDING_APPROVAL,
      lines: [
        { product: P.laptop, qty: 2, discountPct: 12 },
        { product: P.setup, qty: 1, discountPct: 18 },
      ],
      createdAt: ctx.daysAgo(3),
      submittedAt: ctx.daysAgo(1),
      lastActivityAt: ctx.daysAgo(1),
      validUntil: ctx.daysAhead(27),
      promisedDeliveryDate: ctx.daysAhead(14),
      approvalId: IDS.quotations.q1042,
      notes: 'Fleet refresh for the Acme engineering floor.',
    }).doc,

    /* ---- Q-1041 — Acme Corp, already confirmed. Feeds screens 9, 10, 12, 13. ---- */
    buildQuotation({
      _id: IDS.quotations.q1041, number: 'Q-1041',
      customerId: IDS.customers.acme, customerName: 'Acme Corp', tier: CustomerTier.GOLD,
      priceListId: IDS.priceLists.gold, priceList: PRICE_LISTS.GOLD,
      ownerId: IDS.users.rao, ownerName: 'J. Rao',
      stage: QuoteStage.CONFIRMED,
      lines: [
        { product: P.laptop, qty: 2, discountPct: 5 },
        { product: P.setup, qty: 1, discountPct: 0 },
        { product: P.carePlan2yr, qty: 1, discountPct: 0, addedFromUpsell: true },
        { product: P.supportSla, qty: 1, discountPct: 0 },
      ],
      createdAt: ctx.daysAgo(40), submittedAt: ctx.daysAgo(38),
      lastActivityAt: ctx.daysAgo(30), validUntil: ctx.daysAhead(10),
      promisedDeliveryDate: ctx.daysAgo(20),
      orderId: IDS.orders.acmePrior,
      notes: 'Previous Acme order. Hybrid: hardware + two recurring plans.',
    }).doc,

    /* ---- Q-1039 — Beta Industries, Silver. MEDIUM risk, awaiting Sales Manager. ---- */
    buildQuotation({
      _id: IDS.quotations.q1039, number: 'Q-1039',
      customerId: IDS.customers.beta, customerName: 'Beta Industries', tier: CustomerTier.SILVER,
      priceListId: IDS.priceLists.silver, priceList: PRICE_LISTS.SILVER,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      stage: QuoteStage.PENDING_APPROVAL,
      lines: [
        { product: P.laptop, qty: 20, discountPct: 12 },  // Silver ceiling 10 -> 2 over
        { product: P.dock, qty: 20, discountPct: 13 },    // 3 over
        { product: P.mouse, qty: 20, discountPct: 12 },   // 2 over
      ],
      createdAt: ctx.daysAgo(6), submittedAt: ctx.daysAgo(2), lastActivityAt: ctx.daysAgo(2),
      validUntil: ctx.daysAhead(24), promisedDeliveryDate: ctx.daysAhead(21),
      approvalId: IDS.quotations.q1039,
      notes: 'Death-by-a-thousand-cuts case: no single line is alarming, the pattern is.',
    }).doc,

    /* ---- Q-1035 — Novus Retail. Every line inside its limit -> auto-approved. ---- */
    buildQuotation({
      _id: IDS.quotations.q1035, number: 'Q-1035',
      customerId: IDS.customers.novus, customerName: 'Novus Retail', tier: CustomerTier.SILVER,
      priceListId: IDS.priceLists.silver, priceList: PRICE_LISTS.SILVER,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      stage: QuoteStage.APPROVED,
      lines: [
        { product: P.laptop, qty: 8, discountPct: 8 },
        { product: P.dock, qty: 8, discountPct: 10 },
      ],
      createdAt: ctx.daysAgo(12), submittedAt: ctx.daysAgo(11), lastActivityAt: ctx.daysAgo(11),
      validUntil: ctx.daysAhead(18), promisedDeliveryDate: ctx.daysAhead(12),
      approvalId: IDS.quotations.q1035,
    }).doc,

    /* ---- Q-1030 — Zenith Co. Idle 9 days in Negotiation -> Stalled Deal (screen 14). ---- */
    buildQuotation({
      _id: IDS.quotations.q1030, number: 'Q-1030',
      customerId: IDS.customers.zenith, customerName: 'Zenith Co', tier: CustomerTier.GOLD,
      priceListId: IDS.priceLists.gold, priceList: PRICE_LISTS.GOLD,
      ownerId: IDS.users.rao, ownerName: 'J. Rao',
      stage: QuoteStage.NEGOTIATION,
      lines: [
        { product: P.laptop, qty: 30, discountPct: 14 },
        { product: P.carePlan2yr, qty: 30, discountPct: 0 },
      ],
      createdAt: ctx.daysAgo(20), submittedAt: ctx.daysAgo(15),
      lastActivityAt: ctx.daysAgo(9), // exactly the "idle 9 days" from screen 14
      validUntil: ctx.daysAhead(10), promisedDeliveryDate: ctx.daysAhead(6),
    }).doc,

    /* ---- Q-1032 — Zenith Co, confirmed. Its order goes on backorder (screen 7/8). ---- */
    buildQuotation({
      _id: IDS.quotations.q1044, number: 'Q-1032',
      customerId: IDS.customers.zenith, customerName: 'Zenith Co', tier: CustomerTier.GOLD,
      priceListId: IDS.priceLists.gold, priceList: PRICE_LISTS.GOLD,
      ownerId: IDS.users.rao, ownerName: 'J. Rao',
      stage: QuoteStage.CONFIRMED,
      lines: [{ product: P.dock, qty: 60, discountPct: 5 }],
      createdAt: ctx.daysAgo(11), submittedAt: ctx.daysAgo(10), lastActivityAt: ctx.daysAgo(8),
      validUntil: ctx.daysAhead(19), promisedDeliveryDate: ctx.daysAhead(3),
      orderId: IDS.orders.zenith,
      notes: 'Backorder showcase: Main can only cover part of it, East Depot has none.',
    }).doc,

    /* ---- Q-1036 — Novus Retail, confirmed and shipped. Feeds INV-1039 (screen 12). ---- */
    buildQuotation({
      _id: IDS.quotations.q1036, number: 'Q-1036',
      customerId: IDS.customers.novus, customerName: 'Novus Retail', tier: CustomerTier.SILVER,
      priceListId: IDS.priceLists.silver, priceList: PRICE_LISTS.SILVER,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      stage: QuoteStage.CONFIRMED,
      lines: [
        { product: P.laptop, qty: 7, discountPct: 6 },
        { product: P.dock, qty: 7, discountPct: 8 },
        { product: P.mouse, qty: 7, discountPct: 0, addedFromUpsell: true },
      ],
      createdAt: ctx.daysAgo(35), submittedAt: ctx.daysAgo(34), lastActivityAt: ctx.daysAgo(28),
      validUntil: ctx.daysAhead(5), promisedDeliveryDate: ctx.daysAgo(18),
      orderId: IDS.orders.novus,
    }).doc,

    /* ---- Q-1043 — Delta LLC. 32% average discount vs J. Rao's 8% -> anomaly (screen 14). ---- */
    buildQuotation({
      _id: IDS.quotations.q1045, number: 'Q-1043',
      customerId: IDS.customers.delta, customerName: 'Delta LLC', tier: CustomerTier.BRONZE,
      priceListId: IDS.priceLists.bronze, priceList: PRICE_LISTS.BRONZE,
      ownerId: IDS.users.rao, ownerName: 'J. Rao',
      stage: QuoteStage.DRAFT,
      lines: [
        { product: P.laptop, qty: 2, discountPct: 32 },
        { product: P.dock, qty: 2, discountPct: 32 },
      ],
      createdAt: ctx.daysAgo(11), lastActivityAt: ctx.daysAgo(11),
      validUntil: ctx.daysAhead(19),
      notes: 'Discount anomaly showcase.',
    }).doc,

    /* ---- Q-1045 — Orion Ltd, returned for revision. Screen 5's "1 Returned" chip. ---- */
    buildQuotation({
      _id: IDS.quotations.q1046, number: 'Q-1045',
      customerId: IDS.customers.orion, customerName: 'Orion Ltd', tier: CustomerTier.GOLD,
      priceListId: IDS.priceLists.gold, priceList: PRICE_LISTS.GOLD,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      stage: QuoteStage.DRAFT,
      lines: [
        { product: P.laptop, qty: 45, discountPct: 19 },
        { product: P.setup, qty: 6, discountPct: 14 },
      ],
      createdAt: ctx.daysAgo(5), submittedAt: ctx.daysAgo(4), lastActivityAt: ctx.daysAgo(3),
      validUntil: ctx.daysAhead(25), promisedDeliveryDate: ctx.daysAhead(30),
      approvalId: IDS.quotations.q1046,
      notes: 'Returned by M. Shah pending a margin justification.',
    }).doc,

    /* ---- Q-1046 — Orion Ltd, HIGH, already past the Manager, sitting in Finance.
           This is what K. Iyer sees the moment they log in.                       ---- */
    buildQuotation({
      _id: IDS.quotations.q1047, number: 'Q-1046',
      customerId: IDS.customers.orion, customerName: 'Orion Ltd', tier: CustomerTier.GOLD,
      priceListId: IDS.priceLists.gold, priceList: PRICE_LISTS.GOLD,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      stage: QuoteStage.PENDING_APPROVAL,
      lines: [
        { product: P.laptop, qty: 50, discountPct: 15 },
        { product: P.setup, qty: 8, discountPct: 22 },
      ],
      createdAt: ctx.daysAgo(4), submittedAt: ctx.daysAgo(2), lastActivityAt: ctx.hoursAgo(20),
      validUntil: ctx.daysAhead(26), promisedDeliveryDate: ctx.daysAhead(35),
    }).doc,
  ];

  await Quotation.insertMany(docs);
}
