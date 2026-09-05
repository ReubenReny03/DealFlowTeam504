/** Screen 9. */
import { Router } from 'express';
import { z } from 'zod';
import {
  AuditEntity,
  SubscriptionStatus,
  Role,
  cancellationSettlement,
  prorateFromDates,
  type CancelSubscriptionRequest,
  type CancelSubscriptionResponse,
  type ModifySubscriptionRequest,
  type ModifySubscriptionResponse,
  type SubscriptionListDto,
} from '@dealflow/shared';
import { CreditNote, Subscription, SubscriptionPlan, nextSeq } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { invalidState, notFound } from '../../utils/apiError.js';
import { ok, paginate } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';

export const subscriptionsRouter = Router();

mountModuleHealth(subscriptionsRouter, {
  module: 'subscriptions',
  owner: 'D',
  screens: [9, 10],
  implemented: [
    'GET / (with active/paused/cancelled chips)',
    'GET /:id',
    'POST /:id/modify',
    'POST /:id/cancel',
    'POST /:id/pause',
    'POST /:id/resume',
  ],
  todo: [],
});

const FINANCE_VIEW: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER, Role.SALES_REP];

subscriptionsRouter.get(
  '/',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    const [items, total, active, paused, cancelled] = await Promise.all([
      Subscription.find(filter)
        .sort({ nextBillDate: 1, customerName: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Subscription.countDocuments(filter),
      Subscription.countDocuments({ status: SubscriptionStatus.ACTIVE }),
      Subscription.countDocuments({ status: SubscriptionStatus.PAUSED }),
      Subscription.countDocuments({ status: SubscriptionStatus.CANCELLED }),
    ]);
    const payload: SubscriptionListDto = {
      counts: { active, paused, cancelled },
      items: toDtoList(items),
    };
    ok(res, payload, paginate([], page, pageSize, total));
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

/* ------------------------------------------------------------------ writes */

const WRITE: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER];

/** The schedule entry for the period currently in progress (its start has passed, not yet invoiced-and-closed). */
function currentPeriod(schedule: any[], now: Date) {
  const past = schedule.filter((s) => new Date(s.periodStart) <= now);
  return past.length > 0 ? past[past.length - 1] : schedule[0];
}

function nextUnbilledPeriod(schedule: any[], now: Date) {
  return (
    schedule.find((s) => !s.invoiced && new Date(s.periodStart) >= now) ??
    schedule.find((s) => !s.invoiced)
  );
}

const modifySchema = z.object({
  qty: z.number().int().min(1).optional(),
  planId: z.string().optional(),
  effectiveDate: z.string().optional(),
  reason: z.string().trim().min(1, 'A reason is required.'),
});

subscriptionsRouter.post(
  '/:id/modify',
  requireAuth(WRITE),
  validate(modifySchema),
  asyncHandler(async (req, res) => {
    const sub: any = await Subscription.findById(req.params.id);
    if (!sub) throw notFound(`No subscription ${req.params.id}`);
    if (sub.status === SubscriptionStatus.CANCELLED)
      throw invalidState('A cancelled subscription cannot be modified.');

    const body = req.body as ModifySubscriptionRequest;
    const now = body.effectiveDate ? new Date(body.effectiveDate) : new Date();
    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };

    let newUnitAmount = sub.unitAmount;
    let planId = sub.planId;
    let planName = sub.planName;
    if (body.planId) {
      const plan: any = await SubscriptionPlan.findById(body.planId).lean();
      if (!plan) throw notFound(`No subscription plan ${body.planId}`);
      newUnitAmount = plan.amount;
      planId = plan._id;
      planName = plan.name;
    }
    const newQty = body.qty ?? sub.qty;
    const newAmount = newUnitAmount * newQty;
    const oldAmount = sub.amount;

    const period = currentPeriod(sub.schedule, now);
    const proration = prorateFromDates(
      oldAmount,
      newAmount,
      now,
      period.periodStart,
      sub.cycle,
      sub.prorationRule,
    );

    let creditNote: any = null;
    if (proration.net < 0) {
      creditNote = await CreditNote.create({
        number: `CN-${await nextSeq('creditnote', 2000)}`,
        customerId: sub.customerId,
        customerName: sub.customerName,
        subscriptionId: sub._id,
        amount: -proration.net,
        currency: sub.currency,
        reason: `Proration credit from modifying ${sub.number}: ${body.reason}`,
      });
    }

    for (const entry of sub.schedule as any[]) {
      if (!entry.invoiced) entry.amount = newAmount;
    }
    if (proration.net > 0) {
      const next = nextUnbilledPeriod(sub.schedule, now);
      if (next) next.amount += proration.net;
    }

    sub.qty = newQty;
    sub.unitAmount = newUnitAmount;
    sub.amount = newAmount;
    sub.planId = planId;
    sub.planName = planName;
    await sub.save();

    await writeAudit({
      actor,
      action: 'SUBSCRIPTION_MODIFIED',
      entity: AuditEntity.SUBSCRIPTION,
      entityId: String(sub._id),
      entityLabel: sub.number,
      before: { qty: oldAmount === newAmount ? undefined : sub.qty, amount: oldAmount },
      after: { qty: newQty, amount: newAmount },
      reason: body.reason,
    });

    const payload: ModifySubscriptionResponse = {
      subscription: toDto(sub),
      proration: {
        credit: proration.credit,
        charge: proration.charge,
        net: proration.net,
        explanation: proration.explanation,
      },
      creditNote: creditNote ? toDto(creditNote) : null,
    };
    ok(res, payload);
  }),
);

const cancelSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required.'),
  effectiveDate: z.string().optional(),
});

subscriptionsRouter.post(
  '/:id/cancel',
  requireAuth(WRITE),
  validate(cancelSchema),
  asyncHandler(async (req, res) => {
    const sub: any = await Subscription.findById(req.params.id);
    if (!sub) throw notFound(`No subscription ${req.params.id}`);
    if (sub.status === SubscriptionStatus.CANCELLED)
      throw invalidState('This subscription is already cancelled.');

    const body = req.body as CancelSubscriptionRequest;
    const now = body.effectiveDate ? new Date(body.effectiveDate) : new Date();
    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };

    const period = currentPeriod(sub.schedule, now);
    const settlement = cancellationSettlement(
      sub.amount,
      now,
      period.periodStart,
      sub.cycle,
      sub.cancellationRule,
    );

    let creditNote: any = null;
    if (settlement.creditAmount > 0) {
      creditNote = await CreditNote.create({
        number: `CN-${await nextSeq('creditnote', 2000)}`,
        customerId: sub.customerId,
        customerName: sub.customerName,
        subscriptionId: sub._id,
        amount: settlement.creditAmount,
        currency: sub.currency,
        reason: `Cancellation credit for ${sub.number}: ${body.reason}`,
      });
    }

    sub.status = SubscriptionStatus.CANCELLED;
    sub.cancelledAt = now;
    sub.endDate = new Date(settlement.serviceEndsAt);
    sub.nextBillDate = undefined;
    await sub.save();

    await writeAudit({
      actor,
      action: 'SUBSCRIPTION_CANCELLED',
      entity: AuditEntity.SUBSCRIPTION,
      entityId: String(sub._id),
      entityLabel: sub.number,
      after: { creditAmount: settlement.creditAmount, serviceEndsAt: settlement.serviceEndsAt },
      reason: body.reason,
    });

    const payload: CancelSubscriptionResponse = {
      subscription: toDto(sub),
      creditNote: creditNote ? toDto(creditNote) : null,
      explanation: settlement.explanation,
    };
    ok(res, payload);
  }),
);

const pauseSchema = z.object({ reason: z.string().trim().optional() });

subscriptionsRouter.post(
  '/:id/pause',
  requireAuth(WRITE),
  validate(pauseSchema),
  asyncHandler(async (req, res) => {
    const sub: any = await Subscription.findById(req.params.id);
    if (!sub) throw notFound(`No subscription ${req.params.id}`);
    if (sub.status !== SubscriptionStatus.ACTIVE)
      throw invalidState(`Only an active subscription can be paused. This one is ${sub.status}.`);

    sub.status = SubscriptionStatus.PAUSED;
    const heldBillDate = sub.nextBillDate;
    sub.nextBillDate = undefined;
    await sub.save();

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'SUBSCRIPTION_PAUSED',
      entity: AuditEntity.SUBSCRIPTION,
      entityId: String(sub._id),
      entityLabel: sub.number,
      before: { nextBillDate: heldBillDate },
      reason: (req.body as { reason?: string }).reason || 'Subscription paused',
    });

    ok(res, toDto(sub));
  }),
);

subscriptionsRouter.post(
  '/:id/resume',
  requireAuth(WRITE),
  validate(pauseSchema),
  asyncHandler(async (req, res) => {
    const sub: any = await Subscription.findById(req.params.id);
    if (!sub) throw notFound(`No subscription ${req.params.id}`);
    if (sub.status !== SubscriptionStatus.PAUSED)
      throw invalidState(`Only a paused subscription can be resumed. This one is ${sub.status}.`);

    const now = new Date();
    const next = nextUnbilledPeriod(sub.schedule, now);
    sub.status = SubscriptionStatus.ACTIVE;
    sub.nextBillDate = next?.dueDate;
    await sub.save();

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'SUBSCRIPTION_RESUMED',
      entity: AuditEntity.SUBSCRIPTION,
      entityId: String(sub._id),
      entityLabel: sub.number,
      after: { nextBillDate: sub.nextBillDate },
      reason: (req.body as { reason?: string }).reason || 'Subscription resumed',
    });

    ok(res, toDto(sub));
  }),
);
