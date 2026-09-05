/**
 * Screen 10 — Billing Detail.
 * The screen that proves ONE order produced TWO billing artefacts: the one-time
 * lines from the originating order, and the recurring lines with their own
 * schedule. They never overlap.
 */
import { Router } from 'express';
import { Role, type BillingDetailDto } from '@dealflow/shared';
import { Customer, Invoice, Order, Subscription } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const billingRouter = Router();

mountModuleHealth(billingRouter, {
  module: 'billing', owner: 'D', screens: [10],
  implemented: ['GET /subscription/:id — one-time lines + recurring lines + invoices'],
  todo: [
    'POST /run-schedule — issue the recurring invoices whose period has started (Agent D)',
    'GET /credit-notes (Agent D)',
  ],
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
