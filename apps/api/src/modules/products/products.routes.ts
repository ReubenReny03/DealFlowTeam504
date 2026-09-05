import { Router } from 'express';
import { ProductStatus, type ProductDashboardDto } from '@dealflow/shared';
import { PriceList, Product } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const productsRouter = Router();

mountModuleHealth(productsRouter, {
  module: 'products', owner: 'A', screens: [16, 17],
  implemented: ['GET /', 'GET /:id', 'GET /dashboard'],
  todo: [
    'POST / and PUT /:id — + New Product and the screen 17 editor (Agent A)',
    'PUT /:id/variants — variant attribute/value/extra-price grid (Agent A)',
  ],
});

/** Screen 16's three tiles. Counts are real, never constants. */
productsRouter.get(
  '/dashboard',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const [products, priceLists] = await Promise.all([
      Product.find().sort({ name: 1 }).lean(),
      PriceList.find().lean(),
    ]);
    const currencies = new Set<string>();
    for (const pl of priceLists as any[]) for (const c of pl.currencies ?? []) currencies.add(c);
    const dashboard: ProductDashboardDto = {
      totalActive: (products as any[]).filter((p) => p.status === ProductStatus.ACTIVE).length,
      totalArchived: (products as any[]).filter((p) => p.status === ProductStatus.ARCHIVED).length,
      priceListTiers: priceLists.length,
      priceListCurrencies: currencies.size,
      // Every variant value is a distinct SKU; a product with no variants is one SKU.
      variantSkuCount: (products as any[]).reduce(
        (acc, p) =>
          acc +
          (p.variants?.length
            ? p.variants.reduce((n: number, v: any) => n * Math.max(1, v.values.length), 1)
            : 1),
        0,
      ),
      products: toDtoList(products),
    };
    ok(res, dashboard);
  }),
);

mountReadonly(productsRouter, {
  model: Product,
  sort: { name: 1 },
  searchFields: ['name', 'sku', 'description'],
  filterFields: ['category', 'status'],
});
