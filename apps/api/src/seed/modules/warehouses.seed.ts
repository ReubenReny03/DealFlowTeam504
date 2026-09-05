/**
 * Warehouses and live stock (screen 7).
 *
 * Laptop Pro 14 stock is set so the split planner GENUINELY produces the
 * mockup's Main 18 / East 6 outcome for a 24-unit order:
 *   Main Warehouse  40 in stock, 22 reserved -> 18 available
 *   East Depot      10 in stock,  4 reserved ->  6 available
 * See docs/DECISIONS.md D-014 for why this differs from the mockup's own
 * (self-inconsistent) reserved/available figures.
 */
import { money } from '@dealflow/shared';
import { Stock, Warehouse } from '../../db/models.js';
import { IDS } from '../ids.js';
import type { SeedContext } from '../context.js';

export async function seedWarehousesAndStock(_ctx: SeedContext): Promise<void> {
  await Warehouse.insertMany([
    {
      _id: IDS.warehouses.main, code: 'MAIN', name: 'Main Warehouse',
      shippingCostWeight: 1.0, baseShipmentCost: money(24), perUnitShippingCost: money(1),
      replenishmentRule: { leadTimeDays: 5, reorderPoint: 15, reorderQty: 60 },
    },
    {
      _id: IDS.warehouses.east, code: 'EAST', name: 'East Depot',
      shippingCostWeight: 1.4, baseShipmentCost: money(20), perUnitShippingCost: money(1),
      replenishmentRule: { leadTimeDays: 9, reorderPoint: 8, reorderQty: 30 },
    },
  ]);

  // The sum of a product's rows here is its catalogue `quantityOnHand` in
  // products.seed.ts — screen 17 reconciles the two, so they must agree.
  const rows = [
    // warehouse,           product,                     inStock, reserved
    [IDS.warehouses.main, IDS.products.laptop,   40, 22],
    [IDS.warehouses.east, IDS.products.laptop,   10, 4],
    [IDS.warehouses.main, IDS.products.dock,     65, 12],
    [IDS.warehouses.east, IDS.products.dock,      0, 0],
    [IDS.warehouses.main, IDS.products.mouse,   400, 20],
    [IDS.warehouses.east, IDS.products.mouse,    60, 0],
    [IDS.warehouses.main, IDS.products.warranty, 999, 0],
    [IDS.warehouses.east, IDS.products.warranty, 999, 0],
  ] as const;

  await Stock.insertMany(
    rows.map(([warehouseId, productId, inStock, reserved], i) => ({
      _id: `a6${String(i + 1).padStart(4, '0')}`.padEnd(24, '0'),
      warehouseId,
      productId,
      inStock,
      reserved,
      available: inStock - reserved,
    })),
  );
}
