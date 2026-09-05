/**
 * Screen 10 — Billing Detail.
 * The screen that proves ONE order produced TWO billing artefacts: the one-time
 * lines from the originating order, and the recurring lines with their own
 * schedule. They never overlap.
 */
import { Router } from 'express';
import { AuditEntity, InvoiceStatus, InvoiceType, Role, SubscriptionStatus, type BillingDetailDto } from '@dealflow/shared';
import { CreditNote, Customer, Invoice, Order, Subscription, nextSeq } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok, paginate } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';

export const billingRouter = Router();

mountModuleHealth(billingRouter, {
  module: 'billing', owner: 'D', screens: [10],
  implemented: [
    'GET /subscription/:id — one-time lines + recurring lines + invoices',
    'POST /run-schedule', 'GET /credit-notes',
  ],
  todo: [],
});

billingRouter.get(
  '/subscription/:id',
  requireAuth([Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER, Role.SALES_REP]),
  asyncHandler(async (req, res) => {
    const subscription: any = await Subscription.findById(req.params.id).lean();
    if (!subscription) throw notFound(`No subscription ${req.params.id}`);

    const [customer, order, siblings, invoices] = await Promise.all([
      Customer.findById(subscription.customerId).lean(),
      subscription.orderId ? Order.findById(subscription.orderId).lean() : null,
      Subscription.find({ customerId: subscription.customerId, orderId: subscription.orderId ?? null }).lean(),
      Invoice.find({ customerId: subscription.customerId }).sort({ issueDate: -1 }).limit(20).lean(),
    ]);

    const payload: BillingDetailDto = {
      customer: toDto(customer),
      order: order ? toDto(order) : undefined,
      // Only the non-subscription lines of the originating order.
      oneTimeLines: order
        ? (order as any).lines
            .filter((l: any) => !l.isSubscription)
            .map((l: any) => ({ description: `${l.productName} x${l.qty}`, qty: l.qty, total: l.lineTotal }))
        : [],
      recurringLines: (siblings as any[]).map((s) => ({
        subscriptionId: String(s._id),
        planName: s.planName,
        cycle: s.cycle,
        nextBillDate: s.nextBillDate ? new Date(s.nextBillDate).toISOString() : undefined,
        amount: s.amount,
        status: s.status,
      })),
      invoices: toDtoList(invoices),
    };
    ok(res, payload);
  }),
);

const FINANCE_VIEW: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER];

billingRouter.get(
  '/credit-notes',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const filter: Record<string, unknown> = {};
    if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.subscriptionId) filter.subscriptionId = req.query.subscriptionId;

    const [items, total] = await Promise.all([
      CreditNote.find(filter).sort({ issuedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      CreditNote.countDocuments(filter),
    ]);
    ok(res, toDtoList(items), paginate([], page, pageSize, total));
  }),
);

/**
 * Issues every recurring invoice whose period has started and has not
 * already been raised — the batch equivalent of the single first-period
 * invoice `createOrderFromQuotation` raises immediately at confirm time.
 * Paused and cancelled subscriptions are never billed.
 */
billingRouter.post(
  '/run-schedule',
  requireAuth([Role.ADMIN, Role.FINANCE]),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const subs = await Subscription.find({ status: SubscriptionStatus.ACTIVE });
    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };
    const issued: any[] = [];

    for (const sub of subs) {
      let dirty = false;
      for (const entry of sub.schedule as any[]) {
        if (entry.invoiced || new Date(entry.periodStart) > now) continue;

        const invoice = await Invoice.create({
          number: `INV-${await nextSeq('invoice', 2000)}`,
          type: InvoiceType.RECURRING,
          customerId: sub.customerId, customerName: sub.customerName,
          orderId: sub.orderId, orderNumber: sub.orderNumber, subscriptionId: sub._id,
          currency: sub.currency, status: InvoiceStatus.ISSUED,
          lines: [{
            lineId: `${sub.number}-${entry.seq}`, productId: sub.productId,
            description: `${sub.planName} — ${String(sub.cycle).toLowerCase()} period`,
            qty: 1, unitPrice: entry.amount, discountPct: 0,
            net: entry.amount, tax: 0, total: entry.amount,
          }],
          subtotal: entry.amount, taxTotal: 0, total: entry.amount,
          amountPaid: 0, amountDue: entry.amount,
          issueDate: entry.periodStart, dueDate: entry.dueDate,
          periodStart: entry.periodStart, periodEnd: entry.periodEnd,
          payments: [],
        });
        entry.invoiced = true;
        entry.invoiceId = invoice._id;
        dirty = true;
        issued.push(invoice);

        await writeAudit({
          actor, action: 'RECURRING_INVOICE_ISSUED', entity: AuditEntity.INVOICE,
          entityId: String(invoice._id), entityLabel: invoice.number,
          after: { subscriptionNumber: sub.number, periodStart: entry.periodStart, amount: entry.amount },
          reason: `Billing run: ${sub.number}'s period starting ${new Date(entry.periodStart).toISOString().slice(0, 10)} is due`,
        });
      }
      if (dirty) {
        const next = (sub.schedule as any[]).find((e) => !e.invoiced);
        sub.nextBillDate = next?.dueDate;
        await sub.save();
      }
    }

    ok(res, { issued: issued.length, invoices: toDtoList(issued) });
  }),
);
