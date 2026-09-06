/**
 * `createOrderFromQuotation` — called the moment a customer confirms a quotation in the portal.
 *
 * Snapshots the quotation's lines onto a new Order (qtyShipped/qtyInvoiced at
 * 0), opens a placeholder Fulfillment for the stockable lines (the real split
 * is planned separately via `POST /fulfillment/plan/:orderId`), and — because
 * a recurring line's service starts today, not when a warehouse ships
 * anything — creates a Subscription with a generated schedule for every
 * recurring line and raises its first period's invoice immediately.
 *
 * The one-time lines are deliberately NOT invoiced here: nothing is billed
 * before it ships (see `invoices.service.ts`), so that invoice is raised by
 * `POST /invoices/generate/:orderId` once the warehouse split ships.
 */
import {
  AuditEntity,
  BillingCycle,
  FulfillmentStatus,
  InvoiceStatus,
  InvoiceType,
  NotificationType,
  OrderStatus,
  ProrationRule,
  QuoteStage,
  Role,
  SubscriptionStatus,
  buildBillingSchedule,
} from '@dealflow/shared';
import {
  Fulfillment,
  Invoice,
  Order,
  Quotation,
  Subscription,
  SubscriptionPlan,
  nextSeq,
} from '../../db/models.js';
import { invalidState, notFound } from '../../utils/apiError.js';
import { writeAudit } from '../../utils/audit.js';
import {
  emitFulfillmentUpdated,
  emitOrderUpdated,
  emitQuotationUpdated,
} from '../../realtime/emit.js';
import {
  fulfillmentLink,
  notifyRoles,
  notifyUsers,
} from '../notifications/notifications.service.js';
import { loadConfig } from '../config/config.service.js';
import { planAndApply } from '../fulfillment/fulfillment.service.js';

export interface OrderActor {
  id: string;
  name: string;
  role: Role;
}

export interface CreateOrderResult {
  order: any;
  fulfillment: any;
}

const CONVERTIBLE_STAGES: string[] = [QuoteStage.APPROVED, QuoteStage.NEGOTIATION];

export async function createOrderFromQuotation(quotationId: string, actor: OrderActor): Promise<CreateOrderResult> {
  const quotation: any = await Quotation.findById(quotationId);
  if (!quotation) throw notFound(`No quotation with id ${quotationId}`);

  // Idempotent: a second call (e.g. a retried request) returns what already exists.
  if (quotation.orderId) {
    const existing = await Order.findById(quotation.orderId).lean();
    if (existing) {
      const fulfillment = (existing as any).fulfillmentId
        ? await Fulfillment.findById((existing as any).fulfillmentId).lean()
        : null;
      return { order: existing, fulfillment };
    }
  }

  if (!CONVERTIBLE_STAGES.includes(quotation.stage)) {
    throw invalidState(
      `Only an approved quotation can be converted to an order. This one is ${quotation.stage}.`,
    );
  }
  if (quotation.lines.length === 0) throw invalidState('This quotation has no lines to fulfil.');

  const now = new Date();

  const orderLines = quotation.lines.map((l: any) => ({
    lineId: l.lineId,
    productId: l.productId,
    productName: l.productName,
    category: l.category,
    qty: l.qty,
    qtyShipped: 0,
    qtyInvoiced: 0,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    taxPct: l.taxPct,
    lineNet: l.lineNet,
    lineTax: l.lineTax,
    lineTotal: l.lineTotal,
    isSubscription: l.isSubscription,
    recurringCycle: l.recurringCycle,
  }));

  const order = await Order.create({
    number: `ORD-${await nextSeq('order', 2000)}`,
    quotationId: quotation._id,
    quotationNumber: quotation.number,
    customerId: quotation.customerId,
    customerName: quotation.customerName,
    ownerId: quotation.ownerId,
    currency: quotation.currency,
    status: OrderStatus.CONFIRMED,
    lines: orderLines,
    totals: quotation.totals,
    confirmedAt: now,
    promisedDeliveryDate: quotation.promisedDeliveryDate,
  });

  const stockable = orderLines.filter((l: any) => !l.isSubscription);
  const fulfillment = new Fulfillment({
    orderId: order._id,
    orderNumber: order.number,
    customerId: order.customerId,
    customerName: order.customerName,
    status: FulfillmentStatus.SPLIT_PENDING,
    allocations: [],
    backorders: [],
    totalShipments: 0,
    totalCost: 0,
    reserved: false,
    rationale: ['This order has no stockable lines — nothing to fulfil from a warehouse.'],
    overridden: false,
  });
  if (stockable.length > 0) {
    // The split happens the moment the order is confirmed, with its reasoning
    // already on screen 8 — not gated behind a separate manual "plan" click.
    await planAndApply(fulfillment, stockable);
  }
  await fulfillment.save();
  order.fulfillmentId = fulfillment._id;
  await order.save();

  const config = await loadConfig();
  const horizon: number = config.billing?.scheduleHorizon ?? 12;
  let subscriptionCount = 0;

  for (const line of quotation.lines.filter((l: any) => l.isSubscription)) {
    const plan: any = await SubscriptionPlan.findOne({ productId: line.productId }).lean();
    const cycle: BillingCycle = line.recurringCycle ?? plan?.cycle ?? BillingCycle.MONTHLY;
    const schedule = buildBillingSchedule(now, cycle, line.lineTotal, horizon);

    const sub = await Subscription.create({
      number: `SUB-${await nextSeq('subscription', 2000)}`,
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      orderId: order._id,
      orderNumber: order.number,
      planId: plan?._id,
      planName: plan?.name ?? line.productName,
      productId: line.productId,
      cycle,
      qty: line.qty,
      unitAmount: line.unitPrice,
      amount: line.lineTotal,
      currency: quotation.currency,
      status: SubscriptionStatus.ACTIVE,
      startDate: now,
      nextBillDate: schedule[0]?.dueDate,
      prorationRule: plan?.prorationRule ?? ProrationRule.PRORATED,
      cancellationRule: plan?.cancellationRule ?? ProrationRule.PRORATED,
      schedule,
    });
    subscriptionCount++;

    // The subscription's own first period starts today, so its first invoice
    // is due now too (recurring lines are invoiced at the START of a period).
    const first = sub.schedule[0];
    if (first) {
      const invoice = await Invoice.create({
        number: `INV-${await nextSeq('invoice', 2000)}`,
        type: InvoiceType.RECURRING,
        customerId: quotation.customerId,
        customerName: quotation.customerName,
        orderId: order._id,
        orderNumber: order.number,
        subscriptionId: sub._id,
        currency: quotation.currency,
        status: InvoiceStatus.ISSUED,
        lines: [
          {
            lineId: `${sub.number}-1`,
            productId: line.productId,
            description: `${sub.planName} — ${String(cycle).toLowerCase()} period`,
            qty: 1,
            unitPrice: line.lineTotal,
            discountPct: 0,
            net: line.lineTotal,
            tax: 0,
            total: line.lineTotal,
          },
        ],
        subtotal: line.lineTotal,
        taxTotal: 0,
        total: line.lineTotal,
        amountPaid: 0,
        amountDue: line.lineTotal,
        issueDate: first.periodStart,
        dueDate: first.dueDate,
        periodStart: first.periodStart,
        periodEnd: first.periodEnd,
        payments: [],
      });
      (sub.schedule[0] as any).invoiced = true;
      (sub.schedule[0] as any).invoiceId = invoice._id;
      await sub.save();
    }
  }

  quotation.orderId = order._id;
  quotation.stage = QuoteStage.CONFIRMED;
  quotation.lastActivityAt = now;
  quotation.version += 1;
  await quotation.save();

  await writeAudit({
    actor,
    action: 'ORDER_CREATED',
    entity: AuditEntity.ORDER,
    entityId: String(order._id),
    entityLabel: order.number,
    after: { quotationNumber: quotation.number, lines: orderLines.length, subscriptions: subscriptionCount },
    reason: 'Quotation confirmed',
  });

  // The order exists and its warehouse split is already planned, so the people
  // who have to act on it are told now, not when someone next opens screen 8.
  const backordered = (fulfillment.backorders as any[]).length > 0;
  await notifyUsers(
    [String(quotation.ownerId)],
    {
      type: NotificationType.ORDER_CONFIRMED,
      title: `${order.number} created from ${quotation.number}`,
      body: `${quotation.customerName} confirmed. ${stockable.length} line(s) to fulfil${
        subscriptionCount > 0 ? `, ${subscriptionCount} subscription(s) started` : ''
      }.`,
      link: fulfillmentLink(fulfillment._id),
      entity: AuditEntity.ORDER,
      entityId: String(order._id),
      entityLabel: order.number,
    },
    actor,
  );
  // There is no WAREHOUSE role in this system — fulfillment is worked by the
  // same people who can write it (see fulfillment.routes.ts `WRITE`).
  await notifyRoles(
    [Role.SALES_MANAGER, Role.FINANCE, Role.ADMIN],
    {
      type: backordered ? NotificationType.BACKORDER_RAISED : NotificationType.FULFILLMENT_PLANNED,
      title: backordered
        ? `${order.number} is partly on backorder`
        : `${order.number} is ready to pick`,
      body: backordered
        ? `${(fulfillment.backorders as any[]).length} line(s) could not be covered from stock.`
        : `${fulfillment.totalShipments} shipment(s) planned for ${order.customerName}.`,
      link: fulfillmentLink(fulfillment._id),
      entity: AuditEntity.FULFILLMENT,
      entityId: String(fulfillment._id),
      entityLabel: order.number,
    },
    actor,
  );

  emitOrderUpdated(order, actor);
  emitFulfillmentUpdated(fulfillment, actor);
  emitQuotationUpdated(quotation, 'ORDER_CREATED', actor);

  return { order, fulfillment };
}
