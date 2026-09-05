import { Router } from 'express';
import { z } from 'zod';
import { computeMargin, computeQuoteTotals } from '@dealflow/shared';
import { loadRiskConfig } from '../config/config.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { mountModuleHealth } from '../module.health.js';
import { priceLinesForCustomer } from './pricing.service.js';

export const pricingRouter = Router();

mountModuleHealth(pricingRouter, {
  module: 'pricing', owner: 'B', screens: [4],
  implemented: ['GET /_health', 'POST /preview'],
  todo: [],
});

const lineSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  qty: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  selectedVariants: z.record(z.string()).optional(),
  addedFromUpsell: z.boolean().optional(),
});

const previewSchema = z.object({
  customerId: z.string().min(1),
  lines: z.array(lineSchema).default([]),
});

/**
 * Prices a cart against a customer's tier and price list — the server-side
 * confirmation of the client's optimistic numbers, never the source of them.
 * The Angular builder computes the same thing locally, on every keystroke,
 * from the SAME pure functions.
 */
pricingRouter.post(
  '/preview',
  requireAuth(),
  validate(previewSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof previewSchema>;
    const riskConfig = await loadRiskConfig();
    const { tier, priced } = await priceLinesForCustomer(body.customerId, body.lines, riskConfig);

    ok(res, {
      tier,
      lines: priced,
      totals: computeQuoteTotals(priced),
      margin: computeMargin(priced),
    });
  }),
);
