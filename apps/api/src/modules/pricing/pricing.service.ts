/**
 * Resolves a customer's tier and price list, then prices a cart against them.
 *
 * This is the one place a cart becomes `PricedLine[]` on the server, so
 * `POST /quotations`, `PATCH /quotations/:id`, `POST /quotations/:id/submit`,
 * `POST /quotations/preview`, `POST /pricing/preview` and `POST /risk/preview`
 * all price a line identically — and identically to what the Angular builder
 * computed a moment earlier from the same pure functions.
 */
import { Types } from 'mongoose';
import {
  computeLinePricing,
  resolvePriceListPrice,
  type CustomerTier,
  type LinePricingInput,
  type PricedLine,
  type QuotationLineInput,
  type RiskConfig,
} from '@dealflow/shared';
import { Customer, PriceList, Product } from '../../db/models.js';
import { badRequest, notFound } from '../../utils/apiError.js';

export interface PricedCart {
  customer: any;
  tier: CustomerTier;
  priceList: any;
  priced: PricedLine[];
}

/** Sum of a variant selection's per-attribute extra prices. */
function variantSurcharge(product: any, selected?: Record<string, string>): number {
  if (!selected) return 0;
  let extra = 0;
  for (const variant of product.variants ?? []) {
    const chosen = selected[variant.attribute];
    if (!chosen) continue;
    const value = variant.values.find((v: any) => v.value === chosen);
    if (value) extra += value.extraPrice ?? 0;
  }
  return extra;
}

export async function priceLinesForCustomer(
  customerId: string,
  lines: QuotationLineInput[],
  riskConfig: RiskConfig,
): Promise<PricedCart> {
  const customer = await Customer.findById(customerId).lean();
  if (!customer) throw notFound(`No customer with id ${customerId}`);

  const priceList = await PriceList.findById((customer as any).priceListId).lean();
  if (!priceList) throw notFound(`Customer ${(customer as any).name} has no price list configured.`);

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const byId = new Map(products.map((p: any) => [String(p._id), p]));

  const tier = (customer as any).tier as CustomerTier;

  const priced = lines.map((line, i) => {
    const product = byId.get(line.productId);
    if (!product) throw badRequest(`No product with id ${line.productId}`);

    const basePrice = resolvePriceListPrice(
      product.unitPrice,
      { ruleType: (priceList as any).ruleType, ruleValue: (priceList as any).ruleValue, entries: (priceList as any).entries },
      String(product._id),
    );
    const unitPrice = basePrice + variantSurcharge(product, line.selectedVariants);

    const input: LinePricingInput = {
      id: line.id ?? `tmp-${i}-${new Types.ObjectId().toHexString()}`,
      productId: String(product._id),
      productName: product.name,
      sku: product.sku,
      category: product.category,
      qty: line.qty,
      unitPrice,
      costPrice: product.costPrice,
      discountPct: line.discountPct,
      taxPct: product.taxPct,
      isSubscription: product.isSubscription,
      recurringCycle: product.recurringCycle,
      selectedVariants: line.selectedVariants,
      addedFromUpsell: line.addedFromUpsell,
    };
    return computeLinePricing(input, tier, riskConfig);
  });

  return { customer, tier, priceList, priced };
}
