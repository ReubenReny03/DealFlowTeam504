/**
 * Screen 11 — the customer portal.
 *
 * This is a genuinely separate, restricted surface: its own guard
 * (`requirePortalToken`), its own scope check (`assertPortalScope`), and no
 * access to any internal endpoint. An internal JWT does not open it, and a
 * portal token opens exactly ONE quotation — the one it was minted for.
 *
 * The negative-auth demo lives here: R. Das signs in and cannot reach Acme
 * Corp's quotation, by link or by URL.
 */
import { Router } from 'express';
import { QuoteStage, type PortalResolveResponse } from '@dealflow/shared';
import { Customer, NegotiationEvent, Quotation } from '../../db/models.js';
import { assertPortalScope, requirePortalToken } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { forbidden, notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const portalRouter = Router();

mountModuleHealth(portalRouter, {
  module: 'portal', owner: 'C', screens: [11],
  implemented: ['GET /q/:number (token or customer login, scope-enforced)', 'GET /q/:number/messages'],
  todo: [
    'POST /q/:number/comment — line-level question, no counter (Agent C)',
    'POST /q/:number/counter — counter discount / qty / delivery date, then recompute risk and, if it breaches, force PENDING_APPROVAL with reason RE_ENTERED_FROM_NEGOTIATION (Agent C) [the demo money shot]',
    'POST /q/:number/confirm — confirm terms, then call orders.createOrderFromQuotation (Agent C -> Agent D)',
  ],
});

const NEGOTIATION_NOTICE =
  'You can comment on any line or propose a different discount. If the final terms go beyond what your account manager can approve on their own, the quotation goes back for internal approval automatically — you will see the status change here.';

async function resolveQuotation(req: any, numberOrId: string) {
  const quotation = await Quotation.findOne({
    $or: [{ number: numberOrId }, ...(numberOrId.match(/^[0-9a-f]{24}$/i) ? [{ _id: numberOrId }] : [])],
  }).lean();
  if (!quotation) throw notFound('That quotation could not be found.');
  // Throws 403 for R. Das, whether he uses Priya's link or just guesses the URL.
  assertPortalScope(req, quotation as any);
  if ((quotation as any).stage === QuoteStage.DRAFT) {
    throw forbidden('This quotation has not been sent to you yet.');
  }
  return quotation as any;
}

portalRouter.get(
  '/q/:number',
  requirePortalToken,
  asyncHandler(async (req, res) => {
    const quotation = await resolveQuotation(req, req.params.number);
    const [customer, events] = await Promise.all([
      Customer.findById(quotation.customerId).lean(),
      NegotiationEvent.find({ quotationId: quotation._id }).sort({ createdAt: 1 }).lean(),
    ]);
    const payload: PortalResolveResponse = {
      quotation: toDto(quotation),
      customer: toDto(customer),
      events: toDtoList(events),
      canConfirm: [QuoteStage.APPROVED, QuoteStage.NEGOTIATION].includes(quotation.stage),
      negotiationNotice: NEGOTIATION_NOTICE,
    };
    ok(res, payload);
  }),
);

portalRouter.get(
  '/q/:number/messages',
  requirePortalToken,
  asyncHandler(async (req, res) => {
    const quotation = await resolveQuotation(req, req.params.number);
    const events = await NegotiationEvent.find({ quotationId: quotation._id }).sort({ createdAt: 1 }).lean();
    ok(res, toDtoList(events));
  }),
);
