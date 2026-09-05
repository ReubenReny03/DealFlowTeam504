import { Router } from 'express';
import { z } from 'zod';
import { AuditEntity, CustomerTier, Currency, Role, type CustomerDto } from '@dealflow/shared';
import { Customer, PriceList, User } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/apiError.js';
import { created, ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { diff, writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const customersRouter = Router();

mountModuleHealth(customersRouter, {
  module: 'customers', owner: 'A', screens: [3, 11],
  implemented: ['GET /', 'GET /:id', 'POST /', 'PATCH /:id'],
  todo: [],
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  tier: z.nativeEnum(CustomerTier),
  currency: z.nativeEnum(Currency).default(Currency.USD),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  ownerId: z.string().min(1),
  active: z.boolean().default(true),
});

const updateSchema = createSchema.partial();

customersRouter.post(
  '/',
  requireAuth([Role.ADMIN, Role.SALES_MANAGER]),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    if (await Customer.exists({ name: body.name })) {
      throw conflict(`A customer named "${body.name}" already exists.`);
    }
    const owner = await User.findById(body.ownerId).lean();
    if (!owner) throw notFound(`No user with id ${body.ownerId}`);

    // Every tier resolves to exactly one price list — the customer never picks one directly.
    const priceList = await PriceList.findOne({ tier: body.tier }).lean();
    if (!priceList) throw badRequest(`No price list is configured for tier ${body.tier} yet.`);

    const doc = await Customer.create({
      name: body.name,
      tier: body.tier,
      currency: body.currency,
      priceListId: (priceList as any)._id,
      contactName: body.contactName ?? '',
      contactEmail: body.contactEmail ?? '',
      ownerId: body.ownerId,
      active: body.active,
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'CUSTOMER_CREATED',
      entity: AuditEntity.CUSTOMER,
      entityId: String(doc._id),
      entityLabel: doc.name,
      after: { tier: doc.tier, ownerId: String(doc.ownerId) },
      reason: `New ${body.tier} customer added`,
    });

    created(res, toDto<CustomerDto>(doc));
  }),
);

customersRouter.patch(
  '/:id',
  requireAuth([Role.ADMIN, Role.SALES_MANAGER]),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const doc = await Customer.findById(req.params.id);
    if (!doc) throw notFound(`No customer with id ${req.params.id}`);

    const body = req.body as Partial<z.infer<typeof createSchema>>;
    if (body.name && body.name !== doc.name && (await Customer.exists({ name: body.name }))) {
      throw conflict(`A customer named "${body.name}" already exists.`);
    }
    if (body.ownerId && !(await User.exists({ _id: body.ownerId }))) {
      throw notFound(`No user with id ${body.ownerId}`);
    }

    const before = toDto<CustomerDto>(doc);

    if (body.name !== undefined) doc.name = body.name;
    if (body.currency !== undefined) doc.currency = body.currency;
    if (body.contactName !== undefined) doc.contactName = body.contactName;
    if (body.contactEmail !== undefined) doc.contactEmail = body.contactEmail;
    if (body.ownerId !== undefined) doc.ownerId = body.ownerId as any;
    if (body.active !== undefined) doc.active = body.active;
    // Changing tier re-resolves the price list too — the two are never allowed to drift apart.
    if (body.tier !== undefined && body.tier !== doc.tier) {
      const priceList = await PriceList.findOne({ tier: body.tier }).lean();
      if (!priceList) throw badRequest(`No price list is configured for tier ${body.tier} yet.`);
      doc.tier = body.tier;
      doc.priceListId = (priceList as any)._id;
    }
    await doc.save();
    const after = toDto<CustomerDto>(doc);

    const changed = diff(before as any, after as any, ['name', 'tier', 'currency', 'contactName', 'contactEmail', 'ownerId', 'active']);
    if (changed.changed) {
      await writeAudit({
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        action: 'CUSTOMER_UPDATED',
        entity: AuditEntity.CUSTOMER,
        entityId: String(doc._id),
        entityLabel: doc.name,
        before: changed.before,
        after: changed.after,
        reason: 'Customer details changed',
      });
    }

    ok(res, after);
  }),
);

mountReadonly(customersRouter, {
  model: Customer,
  sort: { name: 1 } as any,
  searchFields: ['name','contactEmail'],
  filterFields: ['tier','ownerId'],
});
