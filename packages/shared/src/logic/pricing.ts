/**
 * Pure pricing engine. Used by:
 *   - the API, when it saves a quotation (authoritative)
 *   - the Angular QuotationBuilderStore, to recompute totals synchronously on
 *     every keystroke without a server round-trip (optimistic preview)
 * Both call the SAME function, so the preview can never disagree with the save.
 */
import { LineDiscountStatus, ProductCategory, CustomerTier, PriceRuleType } from '../enums/index.js';
import type { BillingCycle } from '../enums/index.js';
import { type Money, pctOf, roundHalfAway, sumMoney } from '../util/money.js';

export interface DiscountCeilings {
  tierCeilings: Record<CustomerTier, number>;
  categoryCeilings: Record<ProductCategory, number>;
}

/** The minimum a caller must supply to price a line. */
export interface LinePricingInput {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  category: ProductCategory;
  qty: number;
  unitPrice: Money;
  costPrice: Money;
  discountPct: number;
  taxPct: number;
  isSubscription?: boolean;
  recurringCycle?: BillingCycle;
  selectedVariants?: Record<string, string>;
  addedFromUpsell?: boolean;
}

export interface PricedLine extends LinePricingInput {
  allowedDiscountPct: number;
  lineGross: Money;
  lineDiscount: Money;
  lineNet: Money;
  lineTax: Money;
  lineTotal: Money;
  lineCost: Money;
  lineMargin: Money;
  marginPct: number;
  discountStatus: LineDiscountStatus;
  overByPts: number;
}

/**
 * The stricter of the two ceilings always wins.
 * A Gold customer (15%) buying a Service (10%) is allowed 10%, not 15%.
 * This single line is the reason the mockup's Setup Service is 8 points over.
 */
export function resolveAllowedDiscount(
  tier: CustomerTier,
  category: ProductCategory,
  ceilings: DiscountCeilings,
): number {
  const tierCeiling = ceilings.tierCeilings[tier] ?? 0;
  const categoryCeiling = ceilings.categoryCeilings[category] ?? 0;
  return Math.min(tierCeiling, categoryCeiling);
}

/**
 * Price a single quotation line.
 * Order of operations: gross -> discount -> net -> tax -> total.
 * Tax is charged on the DISCOUNTED amount (net), which is what every B2B system does.
 */
export function computeLinePricing(
  line: LinePricingInput,
  tier: CustomerTier,
  ceilings: DiscountCeilings,
): PricedLine {
  const qty = Math.max(0, Math.trunc(line.qty));
  const discountPct = Math.min(100, Math.max(0, line.discountPct));
  const allowedDiscountPct = resolveAllowedDiscount(tier, line.category, ceilings);

  const lineGross = line.unitPrice * qty;
  const lineDiscount = pctOf(lineGross, discountPct);
  const lineNet = lineGross - lineDiscount;
  const lineTax = pctOf(lineNet, line.taxPct);
  const lineTotal = lineNet + lineTax;
  const lineCost = line.costPrice * qty;
  const lineMargin = lineNet - lineCost;
  const marginPct = lineNet === 0 ? 0 : (lineMargin / lineNet) * 100;

  const overByPts = Math.max(0, roundToTwo(discountPct - allowedDiscountPct));

  return {
    ...line,
    qty,
    discountPct,
    allowedDiscountPct,
    lineGross,
    lineDiscount,
    lineNet,
    lineTax,
    lineTotal,
    lineCost,
    lineMargin,
    marginPct: roundToTwo(marginPct),
    discountStatus: overByPts > 0 ? LineDiscountStatus.OVER : LineDiscountStatus.OK,
    overByPts,
  };
}

export interface QuoteTotals {
  subtotal: Money;
  discountTotal: Money;
  netTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  costTotal: Money;
  marginTotal: Money;
  marginPct: number;
  oneTimeTotal: Money;
  recurringTotal: Money;
}

export function computeQuoteTotals(lines: PricedLine[]): QuoteTotals {
  const subtotal = sumMoney(lines.map((l) => l.lineGross));
  const discountTotal = sumMoney(lines.map((l) => l.lineDiscount));
  const netTotal = sumMoney(lines.map((l) => l.lineNet));
  const taxTotal = sumMoney(lines.map((l) => l.lineTax));
  const costTotal = sumMoney(lines.map((l) => l.lineCost));
  const grandTotal = netTotal + taxTotal;
  const marginTotal = netTotal - costTotal;
  return {
    subtotal,
    discountTotal,
    netTotal,
    taxTotal,
    grandTotal,
    costTotal,
    marginTotal,
    marginPct: netTotal === 0 ? 0 : roundToTwo((marginTotal / netTotal) * 100),
    oneTimeTotal: sumMoney(lines.filter((l) => !l.isSubscription).map((l) => l.lineTotal)),
    recurringTotal: sumMoney(lines.filter((l) => l.isSubscription).map((l) => l.lineTotal)),
  };
}

export interface MarginResult {
  marginAmount: Money;
  marginPct: number;
}

/** The live margin indicator on screen 4. */
export function computeMargin(lines: PricedLine[]): MarginResult {
  const net = sumMoney(lines.map((l) => l.lineNet));
  const cost = sumMoney(lines.map((l) => l.lineCost));
  const marginAmount = net - cost;
  return { marginAmount, marginPct: net === 0 ? 0 : roundToTwo((marginAmount / net) * 100) };
}

/**
 * Resolve the unit price for a product under a customer's price list.
 * Per-product overrides beat the list-wide rule.
 */
export function resolvePriceListPrice(
  basePrice: Money,
  rule: { ruleType: PriceRuleType; ruleValue: number; entries?: { productId: string; price: Money }[] },
  productId: string,
): Money {
  const override = rule.entries?.find((e) => e.productId === productId);
  if (override) return override.price;
  switch (rule.ruleType) {
    case PriceRuleType.PERCENT_OFF_BASE:
      return basePrice - pctOf(basePrice, rule.ruleValue);
    case PriceRuleType.FIXED_PRICE:
      return roundHalfAway(rule.ruleValue);
    case PriceRuleType.NONE:
    default:
      return basePrice;
  }
}

export function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
