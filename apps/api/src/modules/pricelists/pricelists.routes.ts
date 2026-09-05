import { Router } from 'express';
import { z } from 'zod';
import { AuditEntity, Currency, PriceRuleType, Role, type PriceListDto } from '@dealflow/shared';
import { PriceList } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { diff, writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const priceListsRouter = Router();

mountModuleHealth(priceListsRouter, {
  module: 'pricelists', owner: 'A', screens: [17],
  implemented: ['GET /', 'GET /:id', 'PUT /:id'],
  todo: [],
});

/**
 * A tier's price *rule* is what that tier pays. It is a different concern from
 * the tier's discount *ceiling*, which is governance and lives on screen 18 —
 * see docs/DECISIONS.md D-015. Changing Gold to -15% moves every Gold
 * customer's line prices the next time a quotation prices a line.
 */
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  currencies: z.array(z.nativeEnum(Currency)).min(1).optional(),
  ruleType: z.nativeEnum(PriceRuleType).optional(),
  ruleValue: z.number().min(0).optional(),
  entries: z
    .array(z.object({ productId: z.string().min(1), price: z.number().int().min(0) }))
    .optional(),
  active: z.boolean().optional(),
  reason: z.string().trim().min(1, 'Every price-rule change must record a reason.'),
});

priceListsRouter.put(
  '/:id',
  requireAuth([Role.ADMIN]),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const doc = await PriceList.findById(req.params.id);
    if (!doc) throw notFound(`No price list with id ${req.params.id}`);

    const { reason, ...changes } = req.body as z.infer<typeof updateSchema>;
    const before = toDto<PriceListDto>(doc);

    Object.assign(doc, changes);
    // A percentage only means anything for PERCENT_OFF_BASE; keeping a stale one
    // around would leave the screen showing a number nothing reads.
    if (doc.ruleType === PriceRuleType.NONE) doc.ruleValue = 0;
    await doc.save();

    const after = toDto<PriceListDto>(doc);
    const changed = diff(before as any, after as any, ['name', 'currencies', 'ruleType', 'ruleValue', 'entries', 'active']);

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'PRICELIST_UPDATED',
      entity: AuditEntity.PRICELIST,
      entityId: String(doc._id),
      entityLabel: `${doc.name} price list`,
      before: changed.before,
      after: changed.after,
      reason,
    });

    ok(res, after);
  }),
);

mountReadonly(priceListsRouter, {
  model: PriceList,
  sort: { tier: 1 } as any,
  searchFields: ['name'],
  filterFields: ['tier'],
});
