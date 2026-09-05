import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { rankUpsells, type UpsellCandidate, type UpsellSuggestionDto } from '@dealflow/shared';
import { ApprovalChainConfig, Product, ProductPairing, Quotation } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { mountModuleHealth } from '../module.health.js';

export const upsellRouter = Router();

mountModuleHealth(upsellRouter, {
  module: 'upsell', domain: 'quotations', screens: [4],
  implemented: ['GET /suggestions?quotationId='],
  todo: [],
});

const querySchema = z.object({ quotationId: z.string().min(1) });

/**
 * Ranked upsell panel. Candidates are every product paired against something
 * already in the cart (`ProductPairing.coPurchaseFrequency`) that is not
 * already in the cart itself — `rankUpsells` does the rest.
 */
upsellRouter.get(
  '/suggestions',
  requireAuth(),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { quotationId } = req.query as unknown as z.infer<typeof querySchema>;
    // Accept either the internal id (what screen 4's route param actually is)
    // or the human-readable number (what a rep, or a test, would type).
    const quotation = await (Types.ObjectId.isValid(quotationId)
      ? Quotation.findById(quotationId)
      : Quotation.findOne({ number: quotationId })
    ).lean();
    if (!quotation) throw notFound(`No quotation matching ${quotationId}`);

    const cartProductIds = (quotation as any).lines.map((l: any) => String(l.productId));
    if (cartProductIds.length === 0) return ok<UpsellSuggestionDto[]>(res, []);

    const [pairings, config] = await Promise.all([
      ProductPairing.find({ productId: { $in: cartProductIds } }).lean(),
      ApprovalChainConfig.findOne({ key: 'default' }).lean(),
    ]);

    // The strongest pairing wins when more than one cart line suggests the
    // same product — the panel shows one card per suggestion, not one per pair.
    const bestPairing = new Map<string, { productId: string; coPurchaseFrequency: number; pairedWithId: string }>();
    for (const pairing of pairings as any[]) {
      const suggestedId = String(pairing.suggestedProductId);
      if (cartProductIds.includes(suggestedId)) continue;
      const existing = bestPairing.get(suggestedId);
      if (!existing || pairing.coPurchaseFrequency > existing.coPurchaseFrequency) {
        bestPairing.set(suggestedId, {
          productId: suggestedId,
          coPurchaseFrequency: pairing.coPurchaseFrequency,
          pairedWithId: String(pairing.productId),
        });
      }
    }
    if (bestPairing.size === 0) return ok<UpsellSuggestionDto[]>(res, []);

    const candidateIds = [...bestPairing.keys()];
    const products = await Product.find({ _id: { $in: candidateIds }, status: 'ACTIVE' }).lean();
    const cartProducts = await Product.find({ _id: { $in: cartProductIds } }, { name: 1 }).lean();
    const cartNames = new Map(cartProducts.map((p: any) => [String(p._id), p.name]));

    const candidates: UpsellCandidate[] = (products as any[]).map((p) => {
      const pairing = bestPairing.get(String(p._id))!;
      return {
        productId: String(p._id),
        name: p.name,
        sku: p.sku,
        category: p.category,
        unitPrice: p.unitPrice,
        costPrice: p.costPrice,
        promoted: p.promoted,
        promoTag: p.promoTag,
        coPurchaseFrequency: pairing.coPurchaseFrequency,
        pairedWithName: cartNames.get(pairing.pairedWithId),
      };
    });

    const upsellWeights = (config as any)?.upsell;
    const suggestions = rankUpsells(cartProductIds, candidates, upsellWeights);
    return ok<UpsellSuggestionDto[]>(res, suggestions);
  }),
);
