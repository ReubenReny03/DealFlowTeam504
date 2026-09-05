import { Router } from 'express';
import { z } from 'zod';
import {
  AuditEntity,
  BillingCycle,
  ProductCategory,
  ProductStatus,
  Role,
  isStockedCategory,
  type ProductDashboardDto,
  type ProductDto,
  type ProductStockDto,
  type ProductWarehouseStockDto,
} from '@dealflow/shared';
import { PriceList, Product, Stock, Warehouse } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/apiError.js';
import { listParams, pageMeta, searchFilter, stableSort } from '../../utils/listQuery.js';
import { created, ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { diff, writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const productsRouter = Router();

mountModuleHealth(productsRouter, {
  module: 'products', owner: 'A', screens: [16, 17],
  implemented: ['GET /', 'GET /:id', 'GET /:id/stock', 'GET /dashboard', 'POST /', 'PUT /:id'],
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

/**
 * Screen 17's Warehouse Stock card.
 *
 * Only a stocked category holds warehouse stock, so SERVICES and SUBSCRIPTION
 * answer with `stocked: false` and an empty list rather than a 404 — the caller
 * asks the same question for every product and lets the answer decide.
 *
 * Every ACTIVE warehouse is returned even when it has no `Stock` row, so a new
 * hardware product reads as "Main 0 / East 0" instead of an empty table. An
 * INACTIVE warehouse appears only while it still holds something, because stock
 * stranded in a decommissioned depot is exactly what an admin needs to see.
 */
productsRouter.get(
  '/:id/stock',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const product: any = await Product.findById(req.params.id).lean();
    if (!product) throw notFound(`No product with id ${req.params.id}`);

    const stocked = isStockedCategory(product.category);
    const [warehouses, rows] = await Promise.all([
      stocked ? Warehouse.find().sort({ name: 1 }).lean() : Promise.resolve([]),
      stocked ? Stock.find({ productId: product._id }).lean() : Promise.resolve([]),
    ]);
    const byWarehouse = new Map((rows as any[]).map((r) => [String(r.warehouseId), r]));

    const list: ProductWarehouseStockDto[] = (warehouses as any[])
      .filter((w) => w.active !== false || (byWarehouse.get(String(w._id))?.inStock ?? 0) > 0)
      .map((w) => {
        const row = byWarehouse.get(String(w._id));
        const inStock = row?.inStock ?? 0;
        const reserved = row?.reserved ?? 0;
        return {
          warehouseId: String(w._id),
          warehouseCode: w.code,
          warehouseName: w.name,
          warehouseActive: w.active !== false,
          inStock,
          reserved,
          available: Math.max(0, inStock - reserved),
          incomingEta: row?.incomingEta ? new Date(row.incomingEta).toISOString() : undefined,
        };
      });

    const payload: ProductStockDto = {
      productId: String(product._id),
      productName: product.name,
      category: product.category,
      stocked,
      warehouses: list,
      totalInStock: list.reduce((n, w) => n + w.inStock, 0),
      totalReserved: list.reduce((n, w) => n + w.reserved, 0),
      totalAvailable: list.reduce((n, w) => n + w.available, 0),
      quantityOnHand: product.quantityOnHand ?? 0,
    };
    ok(res, payload);
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
  warehouseStock: z
    .array(
      z.object({
        warehouseId: z.string().min(1),
        inStock: z.number().int().min(0),
      }),
    )
    .optional(),
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
    // Opening stock only means something for a category that sits in a warehouse.
    if (value.warehouseStock?.length) {
      if (value.category !== undefined && !isStockedCategory(value.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['warehouseStock'],
          message: `A ${String(value.category).toLowerCase()} product is not stocked in a warehouse.`,
        });
      }
      const ids = value.warehouseStock.map((w: any) => String(w.warehouseId));
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['warehouseStock'],
          message: 'Each warehouse may only be allocated once.',
        });
      }
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

    // A hardware product is created WITH its opening stock: the warehouses are
    // resolved before the product is written, so a typo in a warehouse id fails
    // the whole request instead of leaving a stockless product behind.
    const allocations = (body.warehouseStock ?? []).filter((a) => a.inStock > 0);
    if (allocations.length) {
      const found = await Warehouse.find({ _id: { $in: allocations.map((a) => a.warehouseId) } })
        .select('name active')
        .lean();
      const byId = new Map((found as any[]).map((w) => [String(w._id), w]));
      for (const a of allocations) {
        const warehouse = byId.get(String(a.warehouseId));
        if (!warehouse) throw notFound(`No warehouse with id ${a.warehouseId}`);
        if (warehouse.active === false) {
          throw conflict(`${warehouse.name} is not active and cannot take opening stock.`);
        }
      }
    }

    const openingStock = allocations.reduce((n, a) => n + a.inStock, 0);
    const { warehouseStock: _ignored, ...productFields } = body;
    const doc = await Product.create({
      ...productFields,
      sku,
      // A non-subscription product must not carry a stale cycle.
      recurringCycle: body.isSubscription ? body.recurringCycle : undefined,
      // The catalogue figure is the sum of the warehouses whenever they were given,
      // so the two numbers cannot disagree the moment the product exists.
      quantityOnHand: body.warehouseStock ? openingStock : body.quantityOnHand,
    });

    if (allocations.length) {
      await Stock.insertMany(
        allocations.map((a) => ({
          warehouseId: a.warehouseId,
          productId: doc._id,
          inStock: a.inStock,
          reserved: 0,
          available: a.inStock,
        })),
      );
    }

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'PRODUCT_CREATED',
      entity: AuditEntity.PRODUCT,
      entityId: String(doc._id),
      entityLabel: `${doc.name} (${doc.sku})`,
      after: {
        name: doc.name, category: doc.category, unitPrice: doc.unitPrice, costPrice: doc.costPrice,
        ...(allocations.length
          ? { openingStock, warehouses: allocations.length }
          : {}),
      },
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
    // Opening stock is a create-time fact. Every later movement goes through
    // POST /stock/adjust, which is the one path that audits a quantity change.
    if (body.warehouseStock) {
      throw badRequest('Stock is adjusted through POST /stock/adjust, not by editing the product.');
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
