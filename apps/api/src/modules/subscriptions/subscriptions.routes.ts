/** Screen 9. */
import { Router } from 'express';
import { Role, SubscriptionStatus, type SubscriptionListDto } from '@dealflow/shared';
import { Subscription } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const subscriptionsRouter = Router();

mountModuleHealth(subscriptionsRouter, {
  module: 'subscriptions', owner: 'D', screens: [9, 10],
  implemented: ['GET / (with active/paused/cancelled chips)', 'GET /:id'],
  todo: [
    'POST /:id/modify — qty or plan change, prorate(), net delta onto the next invoice or a CreditNote (Agent D)',
    'POST /:id/cancel — stop the schedule, cancellationSettlement(), issue the credit note (Agent D)',
    'POST /:id/pause and /resume (Agent D)',
  ],
});

const FINANCE_VIEW: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER, Role.SALES_REP];

subscriptionsRouter.get(
  '/',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    const [items, active, paused, cancelled] = await Promise.all([
      Subscription.find(filter).sort({ nextBillDate: 1, customerName: 1 }).limit(200).lean(),
      Subscription.countDocuments({ status: SubscriptionStatus.ACTIVE }),
      Subscription.countDocuments({ status: SubscriptionStatus.PAUSED }),
      Subscription.countDocuments({ status: SubscriptionStatus.CANCELLED }),
    ]);
    const payload: SubscriptionListDto = { counts: { active, paused, cancelled }, items: toDtoList(items) };
    ok(res, payload);
  }),
);

subscriptionsRouter.get(
  '/:id',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const doc = await Subscription.findById(req.params.id).lean();
    if (!doc) throw notFound(`No subscription ${req.params.id}`);
    ok(res, toDto(doc));
  }),
);
