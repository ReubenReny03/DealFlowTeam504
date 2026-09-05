/**
 * Upsell / cross-sell ranking (screen 4's suggestion panel).
 *
 *   score = coPurchaseFrequency * w1 + isPromoted * w2 + normalizedMarginDelta * w3
 *
 * Filtered by `marginDelta >= minMarginThreshold` and excluding anything already
 * in the cart. `marginDelta` is what the panel prints as "Margin +$18".
 */
import type { ProductCategory } from '../enums/index.js';
import type { Money } from '../util/money.js';
import { roundToTwo } from './pricing.js';

export interface UpsellCandidate {
  productId: string;
  name: string;
  sku: string;
  category: ProductCategory;
  unitPrice: Money;
  costPrice: Money;
  promoted: boolean;
  /** Optional promo label, e.g. "Promo, 12% off". */
  promoTag?: string;
  /** 0..1, from historical co-purchase data against the current cart. */
  coPurchaseFrequency: number;
  /** Which cart product drove this suggestion — used to write the reason. */
  pairedWithName?: string;
}

export interface UpsellWeights {
  coPurchaseWeight: number;
  promotedWeight: number;
  marginWeight: number;
  minMarginThreshold: Money;
  maxSuggestions: number;
}

export const DEFAULT_UPSELL_WEIGHTS: UpsellWeights = {
  coPurchaseWeight: 0.5,
  promotedWeight: 0.2,
  marginWeight: 0.3,
  minMarginThreshold: 0,
  maxSuggestions: 3,
};

export interface UpsellSuggestion {
  productId: string;
  name: string;
  sku: string;
  category: ProductCategory;
  unitPrice: Money;
  marginDelta: Money;
  promoTag?: string;
  reason: string;
  score: number;
}

export function rankUpsells(
  cartProductIds: string[],
  candidates: UpsellCandidate[],
  weights: Partial<UpsellWeights> = {},
): UpsellSuggestion[] {
  const w = { ...DEFAULT_UPSELL_WEIGHTS, ...weights };
  const inCart = new Set(cartProductIds);

  const eligible = candidates
    .filter((c) => !inCart.has(c.productId))
    .map((c) => ({ ...c, marginDelta: c.unitPrice - c.costPrice }))
    .filter((c) => c.marginDelta >= w.minMarginThreshold);

  if (eligible.length === 0) return [];

  // Normalise margin to 0..1 across the eligible set so it is comparable with
  // the other two 0..1 signals.
  const maxMargin = Math.max(...eligible.map((c) => c.marginDelta), 1);

  return eligible
    .map((c) => {
      const normalizedMargin = c.marginDelta / maxMargin;
      const score =
        c.coPurchaseFrequency * w.coPurchaseWeight +
        (c.promoted ? 1 : 0) * w.promotedWeight +
        normalizedMargin * w.marginWeight;
      return {
        productId: c.productId,
        name: c.name,
        sku: c.sku,
        category: c.category,
        unitPrice: c.unitPrice,
        marginDelta: c.marginDelta,
        promoTag: c.promoTag,
        reason: buildReason(c),
        score: roundToTwo(score),
      };
    })
    .sort((a, b) => b.score - a.score || b.marginDelta - a.marginDelta)
    .slice(0, w.maxSuggestions);
}

function buildReason(c: UpsellCandidate & { marginDelta: Money }): string {
  const parts: string[] = [];
  if (c.pairedWithName && c.coPurchaseFrequency > 0) {
    parts.push(
      `Bought alongside ${c.pairedWithName} in ${Math.round(c.coPurchaseFrequency * 100)}% of past deals`,
    );
  }
  if (c.promoted) parts.push('currently promoted');
  parts.push(`adds ${c.marginDelta} minor units of margin`);
  return parts.join('; ') + '.';
}
