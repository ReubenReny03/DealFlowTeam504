/**
 * Seed builders.
 *
 * Seeded quotations are COMPUTED with the same shared pure functions the running
 * app uses — `computeLinePricing`, `computeQuoteTotals`, `calculateBlendedRisk`.
 * Nothing in the seed is a hand-typed total or a hand-typed risk score, so seed
 * data can never disagree with what the app would calculate for the same input.
 */
import {
  calculateBlendedRisk,
  computeLinePricing,
  computeQuoteTotals,
  CustomerTier,
  PriceRuleType,
  ProductCategory,
  QuoteStage,
  resolvePriceListPrice,
  type BillingCycle,
  type LinePricingInput,
  type Money,
  type RiskConfig,
} from '@dealflow/shared';
import { Types } from 'mongoose';

/** Screen 18's seeded ceilings, mirrored here so builders need no DB round-trip. */
export const SEED_CEILINGS: RiskConfig = {
  tierCeilings: { BRONZE: 5, SILVER: 10, GOLD: 15 },
  categoryCeilings: { HARDWARE: 15, SERVICES: 10, SUBSCRIPTION: 5 },
};

export interface SeedProductRef {
  id: Types.ObjectId;
  sku: string;
  name: string;
  category: ProductCategory;
  basePrice: Money;
  costPrice: Money;
  taxPct: number;
  isSubscription?: boolean;
  recurringCycle?: BillingCycle;
}

export interface SeedPriceListRef {
  ruleType: PriceRuleType;
  ruleValue: number;
}

export interface SeedLineSpec {
  product: SeedProductRef;
  qty: number;
  discountPct: number;
  addedFromUpsell?: boolean;
}

export interface BuildQuotationInput {
  _id: Types.ObjectId;
  number: string;
  customerId: Types.ObjectId;
  customerName: string;
  tier: CustomerTier;
  priceListId: Types.ObjectId;
  priceList: SeedPriceListRef;
  ownerId: Types.ObjectId;
  ownerName: string;
  stage: QuoteStage;
  lines: SeedLineSpec[];
  createdAt: Date;
  lastActivityAt: Date;
  submittedAt?: Date;
  validUntil: Date;
  promisedDeliveryDate?: Date;
  notes?: string;
  approvalId?: Types.ObjectId;
  orderId?: Types.ObjectId;
}

export function buildQuotation(input: BuildQuotationInput) {
  const priced = input.lines.map((spec, i) => {
    // Tier price list resolves the unit price the customer actually sees.
    const unitPrice = resolvePriceListPrice(
      spec.product.basePrice,
      { ruleType: input.priceList.ruleType, ruleValue: input.priceList.ruleValue },
      String(spec.product.id),
    );
    const line: LinePricingInput = {
      id: `${input.number}-L${i + 1}`,
      productId: String(spec.product.id),
      productName: spec.product.name,
      sku: spec.product.sku,
      category: spec.product.category,
      qty: spec.qty,
      unitPrice,
      costPrice: spec.product.costPrice,
      discountPct: spec.discountPct,
      taxPct: spec.product.taxPct,
      isSubscription: spec.product.isSubscription ?? false,
      recurringCycle: spec.product.recurringCycle,
      addedFromUpsell: spec.addedFromUpsell ?? false,
    };
    return computeLinePricing(line, input.tier, SEED_CEILINGS);
  });

  const totals = computeQuoteTotals(priced);
  const risk = calculateBlendedRisk(
    priced.map((l) => ({
      id: l.id,
      productName: l.productName,
      category: l.category,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      allowedDiscountPct: l.allowedDiscountPct,
    })),
    input.tier,
    SEED_CEILINGS,
  );

  return {
    doc: {
      _id: input._id,
      number: input.number,
      customerId: input.customerId,
      customerName: input.customerName,
      tier: input.tier,
      priceListId: input.priceListId,
      currency: 'USD',
      ownerId: input.ownerId,
      ownerName: input.ownerName,
      stage: input.stage,
      lines: priced.map((l) => ({
        lineId: l.id,
        productId: new Types.ObjectId(l.productId),
        productName: l.productName,
        sku: l.sku,
        category: l.category,
        qty: l.qty,
        unitPrice: l.unitPrice,
        costPrice: l.costPrice,
        discountPct: l.discountPct,
        allowedDiscountPct: l.allowedDiscountPct,
        taxPct: l.taxPct,
        isSubscription: l.isSubscription,
        recurringCycle: l.recurringCycle,
        addedFromUpsell: l.addedFromUpsell,
        lineGross: l.lineGross,
        lineDiscount: l.lineDiscount,
        lineNet: l.lineNet,
        lineTax: l.lineTax,
        lineTotal: l.lineTotal,
        lineCost: l.lineCost,
        lineMargin: l.lineMargin,
        marginPct: l.marginPct,
        discountStatus: l.discountStatus,
        overByPts: l.overByPts,
      })),
      totals,
      risk: { ...risk, ceilingsUsed: { ...risk.ceilingsUsed } },
      approvalId: input.approvalId,
      orderId: input.orderId,
      validUntil: input.validUntil,
      promisedDeliveryDate: input.promisedDeliveryDate,
      lastActivityAt: input.lastActivityAt,
      submittedAt: input.submittedAt,
      version: 1,
      notes: input.notes,
      createdAt: input.createdAt,
      updatedAt: input.lastActivityAt,
    },
    priced,
    totals,
    risk,
  };
}
