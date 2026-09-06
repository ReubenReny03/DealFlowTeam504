/**
 * Hybrid billing (screens 9, 10, 12, 13).
 *
 * ORD-1041 is the proof that ONE order produces TWO different billing artefacts:
 *   - INV-1042, a one-time invoice for the shipped hardware and services
 *   - two Subscriptions with their own generated billing schedules, invoiced at
 *     the beginning of each period, whose first occurrence is INV-1043
 * The one-time invoice never contains a recurring line, and vice versa.
 */
import {
  BillingCycle,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  ProrationRule,
  SubscriptionStatus,
  addDays,
  buildBillingSchedule,
  invoiceableOneTimeLines,
  money,
  sumMoney,
} from '@dealflow/shared';
import { Invoice, Order, Subscription } from '../../db/models.js';
import { G, IDS, fid } from '../ids.js';
import type { SeedContext } from '../context.js';

/** Filler subscriptions so the subscriptions screen carries real Active/Paused/Cancelled volume. */
const FILLER_CUSTOMERS = [
  ['beta', 'Beta Industries'], ['delta', 'Delta LLC'], ['novus', 'Novus Retail'],
  ['zenith', 'Zenith Co'], ['orion', 'Orion Ltd'], ['acme', 'Acme Corp'],
] as const;

export async function seedBilling(ctx: SeedContext): Promise<void> {
  const [acmeOrder, novusOrder] = await Promise.all([
    Order.findById(IDS.orders.acmePrior).lean(),
    Order.findById(IDS.orders.novus).lean(),
  ]);

  /* ------------------------------------------------ subscriptions from ORD-1041 */
  // Care Plan 2yr started two cycles ago, so its next bill date is in the future.
  const carePlanStart = ctx.monthsAhead(-2);
  const carePlanLine = (acmeOrder as any).lines.find((l: any) => l.recurringCycle === BillingCycle.MONTHLY);
  const carePlanAmount = carePlanLine ? carePlanLine.lineTotal : money(46);
  const carePlanSchedule = buildBillingSchedule(carePlanStart, BillingCycle.MONTHLY, carePlanAmount, 12);

  const slaStart = ctx.monthsAhead(-1);
  const slaLine = (acmeOrder as any).lines.find((l: any) => l.recurringCycle === BillingCycle.QUARTERLY);
  const slaAmount = slaLine ? slaLine.lineTotal : money(300);
  const slaSchedule = buildBillingSchedule(slaStart, BillingCycle.QUARTERLY, slaAmount, 8);

  const firstFuture = (schedule: { dueDate: string }[]) =>
    schedule.find((s) => new Date(s.dueDate) >= ctx.now)?.dueDate;

  const subs: any[] = [
    {
      _id: fid(G.SUBSCRIPTION, 1), number: 'SUB-1001',
      customerId: IDS.customers.acme, customerName: 'Acme Corp',
      orderId: IDS.orders.acmePrior, orderNumber: 'ORD-1041',
      planId: IDS.plans.carePlan2yr, planName: 'Care Plan 2yr', productId: IDS.products.carePlan2yr,
      cycle: BillingCycle.MONTHLY, qty: 1, unitAmount: carePlanAmount, amount: carePlanAmount,
      currency: 'USD', status: SubscriptionStatus.ACTIVE,
      startDate: carePlanStart, nextBillDate: firstFuture(carePlanSchedule),
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.PRORATED,
      schedule: carePlanSchedule.map((s, i) => ({ ...s, invoiced: i < 2, invoiceId: i === 1 ? fid(G.INVOICE, 2) : undefined })),
      createdAt: carePlanStart, updatedAt: ctx.daysAgo(1),
    },
    {
      _id: fid(G.SUBSCRIPTION, 2), number: 'SUB-1002',
      customerId: IDS.customers.acme, customerName: 'Acme Corp',
      orderId: IDS.orders.acmePrior, orderNumber: 'ORD-1041',
      planId: IDS.plans.supportSla, planName: 'Support SLA', productId: IDS.products.supportSla,
      cycle: BillingCycle.QUARTERLY, qty: 1, unitAmount: slaAmount, amount: slaAmount,
      currency: 'USD', status: SubscriptionStatus.ACTIVE,
      startDate: slaStart, nextBillDate: firstFuture(slaSchedule),
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.FULL_PERIOD,
      schedule: slaSchedule.map((s, i) => ({ ...s, invoiced: i < 1 })),
      createdAt: slaStart, updatedAt: ctx.daysAgo(1),
    },
    {
      // Screen 9's paused row: "Delta LLC / Care Plan 1yr / Monthly / — / Paused"
      _id: fid(G.SUBSCRIPTION, 3), number: 'SUB-1003',
      customerId: IDS.customers.delta, customerName: 'Delta LLC',
      planId: IDS.plans.carePlan1yr, planName: 'Care Plan 1yr', productId: IDS.products.carePlan1yr,
      cycle: BillingCycle.MONTHLY, qty: 1, unitAmount: money(28), amount: money(28),
      currency: 'USD', status: SubscriptionStatus.PAUSED,
      startDate: ctx.monthsAhead(-5), nextBillDate: undefined,
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.PRORATED,
      schedule: buildBillingSchedule(ctx.monthsAhead(-5), BillingCycle.MONTHLY, money(28), 6),
      createdAt: ctx.monthsAhead(-5), updatedAt: ctx.daysAgo(20),
    },
    {
      // Screen 9's Beta row: "Beta Industries / Support SLA / Quarterly / Nov 1 / Active"
      _id: fid(G.SUBSCRIPTION, 4), number: 'SUB-1004',
      customerId: IDS.customers.beta, customerName: 'Beta Industries',
      planId: IDS.plans.supportSla, planName: 'Support SLA', productId: IDS.products.supportSla,
      cycle: BillingCycle.QUARTERLY, qty: 1, unitAmount: money(300), amount: money(300),
      currency: 'USD', status: SubscriptionStatus.ACTIVE,
      startDate: ctx.monthsAhead(-4),
      nextBillDate: firstFuture(buildBillingSchedule(ctx.monthsAhead(-4), BillingCycle.QUARTERLY, money(300), 8)),
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.FULL_PERIOD,
      schedule: buildBillingSchedule(ctx.monthsAhead(-4), BillingCycle.QUARTERLY, money(300), 8),
      createdAt: ctx.monthsAhead(-4), updatedAt: ctx.daysAgo(15),
    },
  ];

  // Filler so the subscriptions screen carries real volume, not just the 4 named rows.
  const plans = [
    [IDS.plans.carePlan2yr, 'Care Plan 2yr', IDS.products.carePlan2yr, BillingCycle.MONTHLY, money(46)],
    [IDS.plans.carePlan1yr, 'Care Plan 1yr', IDS.products.carePlan1yr, BillingCycle.MONTHLY, money(28)],
    [IDS.plans.carePlan3yr, 'Care Plan 3 years', IDS.products.carePlan3yr, BillingCycle.MONTHLY, money(40)],
    [IDS.plans.supportSla, 'Support SLA', IDS.products.supportSla, BillingCycle.QUARTERLY, money(300)],
  ] as const;

  const targets = [
    ...Array<SubscriptionStatus>(50).fill(SubscriptionStatus.ACTIVE),   // 3 named active + 50 = 53
    ...Array<SubscriptionStatus>(5).fill(SubscriptionStatus.PAUSED),    // 1 named paused +  5 =  6
    ...Array<SubscriptionStatus>(12).fill(SubscriptionStatus.CANCELLED),
  ];

  targets.forEach((status, i) => {
    const [planId, planName, productId, cycle, amount] = plans[i % plans.length];
    const [custKey, custName] = FILLER_CUSTOMERS[i % FILLER_CUSTOMERS.length];
    const start = ctx.monthsAhead(-((i % 9) + 1));
    const schedule = buildBillingSchedule(start, cycle, amount, 8);
    subs.push({
      _id: fid(G.SUBSCRIPTION, 10 + i), number: `SUB-${1010 + i}`,
      customerId: (IDS.customers as any)[custKey], customerName: custName,
      planId, planName, productId, cycle, qty: 1, unitAmount: amount, amount,
      currency: 'USD', status,
      startDate: start,
      nextBillDate: status === SubscriptionStatus.ACTIVE ? firstFuture(schedule) : undefined,
      cancelledAt: status === SubscriptionStatus.CANCELLED ? ctx.daysAgo(10 + i) : undefined,
      endDate: status === SubscriptionStatus.CANCELLED ? ctx.daysAgo(10 + i) : undefined,
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.PRORATED,
      schedule,
      createdAt: start, updatedAt: ctx.daysAgo(i + 1),
    });
  });

  await Subscription.insertMany(subs);

  /* ------------------------------------------------ invoices */
  const acmeOneTime = invoiceableOneTimeLines(
    (acmeOrder as any).lines.map((l: any) => ({
      lineId: l.lineId, productId: String(l.productId), description: l.productName,
      qty: l.qty, qtyShipped: l.qtyShipped, qtyInvoiced: 0,
      unitPrice: l.unitPrice, discountPct: l.discountPct, taxPct: l.taxPct,
      isSubscription: l.isSubscription,
    })),
  );
  const acmeSubtotal = sumMoney(acmeOneTime.map((l) => l.net));
  const acmeTax = sumMoney(acmeOneTime.map((l) => l.tax));

  const novusOneTime = invoiceableOneTimeLines(
    (novusOrder as any).lines.map((l: any) => ({
      lineId: l.lineId, productId: String(l.productId), description: l.productName,
      qty: l.qty, qtyShipped: l.qtyShipped, qtyInvoiced: 0,
      unitPrice: l.unitPrice, discountPct: l.discountPct, taxPct: l.taxPct,
      isSubscription: l.isSubscription,
    })),
  );
  const novusSubtotal = sumMoney(novusOneTime.map((l) => l.net));
  const novusTax = sumMoney(novusOneTime.map((l) => l.tax));

  const recurringPeriod = carePlanSchedule[1];

  await Invoice.insertMany([
    {
      // INV-1042 — the one-time invoice. Unpaid.
      _id: fid(G.INVOICE, 1), number: 'INV-1042', type: InvoiceType.ONE_TIME,
      customerId: IDS.customers.acme, customerName: 'Acme Corp',
      orderId: IDS.orders.acmePrior, orderNumber: 'ORD-1041',
      currency: 'USD', status: InvoiceStatus.ISSUED,
      lines: acmeOneTime.map((l) => ({ ...l, productId: l.productId })),
      subtotal: acmeSubtotal, taxTotal: acmeTax, total: acmeSubtotal + acmeTax,
      amountPaid: 0, amountDue: acmeSubtotal + acmeTax,
      issueDate: ctx.daysAgo(22), dueDate: ctx.daysAhead(5),
      payments: [],
      createdAt: ctx.daysAgo(22), updatedAt: ctx.daysAgo(22),
    },
    {
      // INV-1043 — the RECURRING invoice for the same order. Paid.
      // Note it contains ONLY the Care Plan line: no hardware, no services.
      _id: fid(G.INVOICE, 2), number: 'INV-1043', type: InvoiceType.RECURRING,
      customerId: IDS.customers.acme, customerName: 'Acme Corp',
      orderId: IDS.orders.acmePrior, orderNumber: 'ORD-1041',
      subscriptionId: fid(G.SUBSCRIPTION, 1),
      currency: 'USD', status: InvoiceStatus.PAID,
      lines: [{
        lineId: 'SUB-1001-1', productId: IDS.products.carePlan2yr, description: 'Care Plan 2yr — monthly period',
        qty: 1, unitPrice: carePlanAmount, discountPct: 0,
        net: carePlanAmount, tax: 0, total: carePlanAmount,
      }],
      subtotal: carePlanAmount, taxTotal: 0, total: carePlanAmount,
      amountPaid: carePlanAmount, amountDue: 0,
      issueDate: recurringPeriod.periodStart, dueDate: recurringPeriod.dueDate,
      periodStart: recurringPeriod.periodStart, periodEnd: recurringPeriod.periodEnd,
      payments: [{
        amount: carePlanAmount, method: PaymentMethod.CARD, reference: 'CARD-4417',
        receivedAt: addDays(recurringPeriod.dueDate, 1),
        recordedById: IDS.users.iyer, recordedByName: 'K. Iyer',
      }],
      createdAt: new Date(recurringPeriod.periodStart), updatedAt: ctx.daysAgo(2),
    },
    {
      // INV-1039 — Novus Retail, fully paid.
      _id: fid(G.INVOICE, 3), number: 'INV-1039', type: InvoiceType.ONE_TIME,
      customerId: IDS.customers.novus, customerName: 'Novus Retail',
      orderId: IDS.orders.novus, orderNumber: 'ORD-1036',
      currency: 'USD', status: InvoiceStatus.PAID,
      lines: novusOneTime.map((l) => ({ ...l, productId: l.productId })),
      subtotal: novusSubtotal, taxTotal: novusTax, total: novusSubtotal + novusTax,
      amountPaid: novusSubtotal + novusTax, amountDue: 0,
      issueDate: ctx.daysAgo(20), dueDate: ctx.daysAgo(5),
      payments: [{
        amount: novusSubtotal + novusTax, method: PaymentMethod.BANK_TRANSFER, reference: 'NEFT-88213',
        receivedAt: ctx.daysAgo(6), recordedById: IDS.users.iyer, recordedByName: 'K. Iyer',
      }],
      createdAt: ctx.daysAgo(20), updatedAt: ctx.daysAgo(6),
    },
  ]);

  // Mark the invoiced quantities on the order so a second invoice run does not double-bill.
  await Order.updateOne(
    { _id: IDS.orders.acmePrior },
    { $set: { 'lines.$[oneTime].qtyInvoiced': 0 } },
    { arrayFilters: [{ 'oneTime.isSubscription': false }] },
  );
  for (const l of acmeOneTime) {
    await Order.updateOne(
      { _id: IDS.orders.acmePrior, 'lines.lineId': l.lineId },
      { $set: { 'lines.$.qtyInvoiced': l.qty } },
    );
  }
  for (const l of novusOneTime) {
    await Order.updateOne(
      { _id: IDS.orders.novus, 'lines.lineId': l.lineId },
      { $set: { 'lines.$.qtyInvoiced': l.qty } },
    );
  }
}
