import { Router } from 'express';
import { z } from 'zod';
import {
  AuditEntity,
  BillingCycle,
  ProrationRule,
  Role,
  type SubscriptionPlanDto,
} from '@dealflow/shared';
import { Product, SubscriptionPlan } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict } from '../../utils/apiError.js';
import { created } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const subscriptionPlansRouter = Router();

mountModuleHealth(subscriptionPlansRouter, {
  module: 'subscriptionPlans', domain: 'catalogue', screens: [9, 17],
  implemented: ['GET /', 'GET /:id', 'POST /'],
  todo: [],
});

/**
 * A plan carries its own proration and cancellation rule, because that is what
 * billing applies on a mid-cycle change — see docs/BUSINESS_RULES.md §4.
 */
const createSchema = z.object({
  name: z.string().trim().min(1),
  productId: z.string().min(1),
  cycle: z.nativeEnum(BillingCycle),
  amount: z.number().int().min(0),
  prorationRule: z.nativeEnum(ProrationRule).default(ProrationRule.PRORATED),
  cancellationRule: z.nativeEnum(ProrationRule).default(ProrationRule.PRORATED),
  active: z.boolean().default(true),
});

subscriptionPlansRouter.post(
  '/',
  requireAuth([Role.ADMIN]),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;

    if (await SubscriptionPlan.exists({ name: body.name })) {
      throw conflict(`A plan called "${body.name}" already exists.`);
    }

    const product = await Product.findById(body.productId).lean();
    if (!product) throw badRequest(`No product with id ${body.productId} — a plan must bill for something.`);
    if (!(product as any).isSubscription) {
      throw badRequest(
        `"${(product as any).name}" is not a subscription product, so it cannot generate a billing schedule. ` +
          'Set Subscription to Yes on the product first.',
      );
    }

    const doc = await SubscriptionPlan.create(body);

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'SUBSCRIPTION_PLAN_CREATED',
      entity: AuditEntity.SUBSCRIPTION_PLAN,
      entityId: String(doc._id),
      entityLabel: doc.name,
      after: { cycle: doc.cycle, amount: doc.amount, prorationRule: doc.prorationRule, cancellationRule: doc.cancellationRule },
      reason: 'New recurring plan',
    });

    created(res, toDto<SubscriptionPlanDto>(doc));
  }),
);

mountReadonly(subscriptionPlansRouter, {
  model: SubscriptionPlan,
  sort: { name: 1 } as any,
  searchFields: ['name'],
  filterFields: ['cycle'],
});
