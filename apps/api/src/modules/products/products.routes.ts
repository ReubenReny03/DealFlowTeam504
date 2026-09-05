import { Router } from 'express';
import { z } from 'zod';
import {
  AuditEntity,
  BillingCycle,
  ProductCategory,
  ProductStatus,
  Role,
  type ProductDashboardDto,
  type ProductDto,
} from '@dealflow/shared';
import { PriceList, Product } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { conflict, notFound } from '../../utils/apiError.js';
import { listParams, pageMeta, searchFilter, stableSort } from '../../utils/listQuery.js';
import { created, ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { diff, writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const productsRouter = Router();

mountModuleHealth(productsRouter, {
  module: 'products', owner: 'A', screens: [16, 17],
  implemented: ['GET /', 'GET /:id', 'GET /dashboard', 'POST /', 'PUT /:id'],
  todo: [],
});

/**
 * Screen 16's three tiles plus the catalogue table. Counts are real, never
 * constants — and they count the WHOLE catalogue, while `products` is the
 * searched, paged page of it. A tile that moved every time you typed in the
 * search box would be reporting something nobody asked about.
 */
productsRouter.get(
  '/dashboard',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const params = listParams(req.query);
    const filter: Record<string, unknown> = {};
    for (const field of ['category', 'status']) {
      const value = (req.query as Record<string, unknown>)[field];
      if (value !== undefined && value !== '') filter[field] = value;
    }
    Object.assign(filter, searchFilter(params.q, ['name', 'sku', 'description']) ?? {});

    const [products, total, allProducts, priceLists] = await Promise.all([
      Product.find(filter).sort(stableSort({ name: 1 })).skip(params.skip).limit(params.pageSize).lean(),
      Product.countDocuments(filter),
      Product.find().select('status variants').lean(),
      PriceList.find().lean(),
    ]);
    const currencies = new Set<string>();
    for (const pl of priceLists as any[]) for (const c of pl.currencies ?? []) currencies.add(c);
    const dashboard: ProductDashboardDto = {
      totalActive: (allProducts as any[]).filter((p) => p.status === ProductStatus.ACTIVE).length,
      totalArchived: (allProducts as any[]).filter((p) => p.status === ProductStatus.ARCHIVED).length,
      priceListTiers: priceLists.length,
      priceListCurrencies: currencies.size,
      // Every variant value is a distinct SKU; a product with no variants is one SKU.
      variantSkuCount: (allProducts as any[]).reduce(
        (acc, p) =>
          acc +
          (p.variants?.length
            ? p.variants.reduce((n: number, v: any) => n * Math.max(1, v.values.length), 1)
            : 1),
        0,
      ),
      products: toDtoList(products),
    };
    ok(res, dashboard, pageMeta(params, total));
  }),
);

/* ------------------------------------------------------------------ writes */

const variantSchema = z.object({
  attribute: z.string().min(1),
  values: z
    .array(
      z.object({
        value: z.string().min(1),
        // Money: an integer count of minor units. Never a float.
        extraPrice: z.number().int().min(0).default(0),
      }),
    )
    .min(1, 'A variant attribute needs at least one value.'),
});

const productSchema = z.object({
  sku: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1),
  category: z.nativeEnum(ProductCategory),
  description: z.string().default(''),
  unitPrice: z.number().int().min(0),
  costPrice: z.number().int().min(0),
  unit: z.string().trim().min(1).default('Each'),
  taxPct: z.number().min(0).max(100),
  isSubscription: z.boolean().default(false),
  recurringCycle: z.nativeEnum(BillingCycle).optional(),
  quantityOnHand: z.number().int().min(0).default(0),
  promoted: z.boolean().default(false),
  promoTag: z.string().trim().optional(),
  variants: z.array(variantSchema).default([]),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.ACTIVE),
});

/**
 * A subscription product's whole reason to exist is the recurring cycle it
 * generates a schedule on, so it is not optional once the flag is set.
 */
const withCycleRule = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((value: any, ctx: z.RefinementCtx) => {
    if (value.isSubscription && !value.recurringCycle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurringCycle'],
        message: 'A subscription product must say how often it recurs.',
      });
    }
  });

const createProductSchema = withCycleRule(productSchema);
const updateProductSchema = withCycleRule(productSchema.partial().extend({ name: z.string().trim().min(1).optional() }));

/** Derive a short mnemonic SKU from the name — "Standing Desk" -> "SD-001". */
async function generateSku(name: string): Promise<string> {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join('') : (words[0] ?? 'SKU').slice(0, 4);
  const base = initials || 'SKU';
  const taken = new Set(
    (await Product.find({ sku: { $regex: `^${base}-\\d+$` } }, { sku: 1 }).lean()).map((p: any) => p.sku),
  );
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${base}-${String(n).padStart(3, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

productsRouter.post(
  '/',
  requireAuth([Role.ADMIN]),
  validate(createProductSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof productSchema>;
    const sku = body.sku ?? (await generateSku(body.name));

    if (await Product.exists({ sku })) throw conflict(`SKU ${sku} is already used by another product.`);

    const doc = await Product.create({
      ...body,
      sku,
      // A non-subscription product must not carry a stale cycle.
      recurringCycle: body.isSubscription ? body.recurringCycle : undefined,
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'PRODUCT_CREATED',
      entity: AuditEntity.PRODUCT,
      entityId: String(doc._id),
      entityLabel: `${doc.name} (${doc.sku})`,
      after: { name: doc.name, category: doc.category, unitPrice: doc.unitPrice, costPrice: doc.costPrice },
      reason: 'Catalogue addition',
    });

    created(res, toDto<ProductDto>(doc));
  }),
);

productsRouter.put(
  '/:id',
  requireAuth([Role.ADMIN]),
  validate(updateProductSchema),
  asyncHandler(async (req, res) => {
    const doc = await Product.findById(req.params.id);
    if (!doc) throw notFound(`No product with id ${req.params.id}`);

    const body = req.body as Partial<z.infer<typeof productSchema>>;
    if (body.sku && body.sku !== doc.sku && (await Product.exists({ sku: body.sku }))) {
      throw conflict(`SKU ${body.sku} is already used by another product.`);
    }

    const before = toDto<ProductDto>(doc);
    Object.assign(doc, body);
    // Clearing the subscription flag clears the cycle with it.
    if (body.isSubscription === false) doc.recurringCycle = undefined;
    await doc.save();
    const after = toDto<ProductDto>(doc);

    const changed = diff(before as any, after as any, [
      'sku', 'name', 'category', 'description', 'unitPrice', 'costPrice', 'unit',
      'taxPct', 'isSubscription', 'recurringCycle', 'quantityOnHand', 'promoted', 'status', 'variants',
    ]);

    if (changed.changed) {
      await writeAudit({
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        action: 'PRODUCT_UPDATED',
        entity: AuditEntity.PRODUCT,
        entityId: String(doc._id),
        entityLabel: `${doc.name} (${doc.sku})`,
        before: changed.before,
        after: changed.after,
        reason: 'Catalogue edit',
      });
    }

    ok(res, after);
  }),
);

mountReadonly(productsRouter, {
  model: Product,
  sort: { name: 1 },
  searchFields: ['name', 'sku', 'description'],
  filterFields: ['category', 'status'],
});
