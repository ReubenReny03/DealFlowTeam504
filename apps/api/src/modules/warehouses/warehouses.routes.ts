import { Router } from 'express';
import { z } from 'zod';
import { AuditEntity, Role, type WarehouseDto } from '@dealflow/shared';
import { Warehouse } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { conflict, notFound } from '../../utils/apiError.js';
import { created, ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { diff, writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const warehousesRouter = Router();

mountModuleHealth(warehousesRouter, {
  module: 'warehouses', domain: 'inventory', screens: [7],
  implemented: ['GET /', 'GET /:id', 'POST /', 'PUT /:id'],
  todo: [],
});

/**
 * `shippingCostWeight` ranks warehouses for the split planner (lower wins);
 * `baseShipmentCost` and `perUnitShippingCost` only estimate what a shipment
 * costs. Two separate numbers on purpose — docs/DECISIONS.md D-019 — so a new
 * warehouse created here participates in the planner immediately.
 */
const warehouseSchema = z.object({
  code: z.string().trim().min(1).max(16).toUpperCase().optional(),
  name: z.string().trim().min(1),
  shippingCostWeight: z.number().min(0.1).max(100),
  baseShipmentCost: z.number().int().min(0),
  perUnitShippingCost: z.number().int().min(0),
  replenishmentRule: z
    .object({
      leadTimeDays: z.number().int().min(0).max(365).default(7),
      reorderPoint: z.number().int().min(0).default(10),
      reorderQty: z.number().int().min(0).default(50),
    })
    .default({ leadTimeDays: 7, reorderPoint: 10, reorderQty: 50 }),
  active: z.boolean().default(true),
});

const updateWarehouseSchema = warehouseSchema.partial();

/** "East Depot" -> "EAST", matching the seeded codes. Short, because tables show them. */
async function generateCode(name: string): Promise<string> {
  const firstWord = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)[0] ?? '';
  const base = firstWord.slice(0, 5) || 'WH';
  if (!(await Warehouse.exists({ code: base }))) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}${n}`;
    if (!(await Warehouse.exists({ code: candidate }))) return candidate;
  }
  return `${base}${Date.now() % 1000}`;
}

warehousesRouter.post(
  '/',
  requireAuth([Role.ADMIN]),
  validate(warehouseSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof warehouseSchema>;
    const code = body.code ?? (await generateCode(body.name));
    if (await Warehouse.exists({ code })) throw conflict(`Warehouse code ${code} is already in use.`);

    const doc = await Warehouse.create({ ...body, code });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'WAREHOUSE_CREATED',
      entity: AuditEntity.WAREHOUSE,
      entityId: String(doc._id),
      entityLabel: `${doc.name} (${doc.code})`,
      after: {
        shippingCostWeight: doc.shippingCostWeight,
        baseShipmentCost: doc.baseShipmentCost,
        perUnitShippingCost: doc.perUnitShippingCost,
      },
      reason: 'New warehouse added to the split planner',
    });

    created(res, toDto<WarehouseDto>(doc));
  }),
);

warehousesRouter.put(
  '/:id',
  requireAuth([Role.ADMIN]),
  validate(updateWarehouseSchema),
  asyncHandler(async (req, res) => {
    const doc = await Warehouse.findById(req.params.id);
    if (!doc) throw notFound(`No warehouse with id ${req.params.id}`);

    const body = req.body as Partial<z.infer<typeof warehouseSchema>>;
    if (body.code && body.code !== doc.code && (await Warehouse.exists({ code: body.code }))) {
      throw conflict(`Warehouse code ${body.code} is already in use.`);
    }

    const before = toDto<WarehouseDto>(doc);
    Object.assign(doc, body);
    if (body.replenishmentRule) Object.assign(doc.replenishmentRule, body.replenishmentRule);
    await doc.save();
    const after = toDto<WarehouseDto>(doc);

    const changed = diff(before as any, after as any, [
      'code', 'name', 'shippingCostWeight', 'baseShipmentCost', 'perUnitShippingCost', 'replenishmentRule', 'active',
    ]);

    if (changed.changed) {
      await writeAudit({
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        action: 'WAREHOUSE_UPDATED',
        entity: AuditEntity.WAREHOUSE,
        entityId: String(doc._id),
        entityLabel: `${doc.name} (${doc.code})`,
        before: changed.before,
        after: changed.after,
        reason: 'Warehouse or replenishment rule changed',
      });
    }

    ok(res, after);
  }),
);

mountReadonly(warehousesRouter, {
  model: Warehouse,
  sort: { name: 1 } as any,
  searchFields: ['name', 'code'],
});
