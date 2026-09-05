/**
 * Screen 11 — the customer portal.
 *
 * This is a genuinely separate, restricted surface: its own guard
 * (`requirePortalToken`), its own scope check (`assertPortalScope`), and no
 * access to any internal endpoint. An internal JWT does not open it, and a
 * portal token opens exactly ONE quotation — the one it was minted for.
 *
 * A customer COMPANY, however, has many quotations over time. A portal user who
 * signs in with a password sees every quotation their company has been sent
 * (`GET /portal/quotations`) and can open any of them; a magic-link session is
 * still narrowed to the single quotation the link was minted for.
 *
 * The negative-auth demo lives here: R. Das signs in and cannot reach Acme
 * Corp's quotation, by link or by URL.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  AuditEntity,
  NegotiationEventType,
  QuoteStage,
  Role,
  calculateBlendedRisk,
  computeLinePricing,
  computeQuoteTotals,
  isAutoApproved,
  type LinePricingInput,
  type PortalCommentRequest,
  type PortalCounterRequest,
  type PortalCounterResponse,
  type PortalConfirmResponse,
  type PortalQuotationListResponse,
  type PortalQuotationSummaryDto,
  type PortalResolveResponse,
  type PricedLine,
} from '@dealflow/shared';
import { Approval, Customer, NegotiationEvent, Quotation, User } from '../../db/models.js';
import { assertPortalScope, requirePortalToken } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { forbidden, invalidState, notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { loadRiskConfig } from '../config/config.service.js';
import { createOrderFromQuotation } from '../orders/orders.service.js';

export const portalRouter = Router();

mountModuleHealth(portalRouter, {
  module: 'portal', owner: 'C', screens: [11],
  implemented: [
    'GET /quotations (every quotation for the signed-in company)',
    'GET /q/:number (token or customer login, scope-enforced)', 'GET /q/:number/messages',
    'POST /q/:number/comment', 'POST /q/:number/counter', 'POST /q/:number/confirm',
  ],
  todo: [],
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

/** Everything the customer is allowed to see: every stage except DRAFT. */
const VISIBLE_TO_CUSTOMER = { $ne: QuoteStage.DRAFT };

/**
 * The filter for "this company's quotations". A password login gets the whole
 * company; a magic-link session is narrowed to the single quotation the link was
 * minted for, so the link's promise ("this opens one quotation") still holds.
 */
function portalQuotationFilter(req: any): Record<string, unknown> {
  const portal = req.portal;
  const filter: Record<string, unknown> = {
    customerId: portal.customerId,
    stage: VISIBLE_TO_CUSTOMER,
  };
  if (portal.quotationId) filter._id = portal.quotationId;
  return filter;
}

async function countCompanyQuotations(req: any): Promise<number> {
  return Quotation.countDocuments(portalQuotationFilter(req));
}

/**
 * The customer's own quotation list. One company has many quotations over its
 * lifetime — this is the screen that admits it, instead of pinning the portal to
 * whichever one happened to be linked last.
 */
portalRouter.get(
  '/quotations',
  requirePortalToken,
  asyncHandler(async (req, res) => {
    const filter = portalQuotationFilter(req);
    const [customer, quotations] = await Promise.all([
      Customer.findById(req.portal!.customerId).lean(),
      Quotation.find(filter).sort({ lastActivityAt: -1, createdAt: -1 }).lean(),
    ]);
    if (!customer) throw notFound('That company could not be found.');

    // One aggregate for the whole list rather than a count query per row.
    const messageCounts = new Map<string, number>();
    if (quotations.length > 0) {
      const grouped = await NegotiationEvent.aggregate([
        { $match: { quotationId: { $in: quotations.map((q: any) => q._id) } } },
        { $group: { _id: '$quotationId', n: { $sum: 1 } } },
      ]);
      for (const row of grouped) messageCounts.set(String(row._id), row.n as number);
    }

    const items: PortalQuotationSummaryDto[] = quotations.map((q: any) => ({
      id: String(q._id),
      number: q.number,
      stage: q.stage,
      currency: q.currency,
      grandTotal: q.totals?.grandTotal ?? 0,
      lineCount: q.lines?.length ?? 0,
      createdAt: (q.createdAt as Date).toISOString(),
      lastActivityAt: (q.lastActivityAt ?? q.createdAt as Date).toISOString(),
      validUntil: q.validUntil ? (q.validUntil as Date).toISOString() : undefined,
      promisedDeliveryDate: q.promisedDeliveryDate ? (q.promisedDeliveryDate as Date).toISOString() : undefined,
      canConfirm: [QuoteStage.APPROVED, QuoteStage.NEGOTIATION].includes(q.stage),
      awaitingApproval: q.stage === QuoteStage.PENDING_APPROVAL,
      messageCount: messageCounts.get(String(q._id)) ?? 0,
    }));

    const payload: PortalQuotationListResponse = {
      customer: toDto(customer),
      items,
      scopedToSingleQuotation: Boolean(req.portal!.quotationId),
    };
    ok(res, payload);
  }),
);

portalRouter.get(
  '/q/:number',
  requirePortalToken,
  asyncHandler(async (req, res) => {
    const quotation = await resolveQuotation(req, req.params.number);
    const [customer, events, siblingCount] = await Promise.all([
      Customer.findById(quotation.customerId).lean(),
      NegotiationEvent.find({ quotationId: quotation._id }).sort({ createdAt: 1 }).lean(),
      countCompanyQuotations(req),
    ]);
    const payload: PortalResolveResponse = {
      quotation: toDto(quotation),
      customer: toDto(customer),
      events: toDtoList(events),
      canConfirm: [QuoteStage.APPROVED, QuoteStage.NEGOTIATION].includes(quotation.stage),
      negotiationNotice: NEGOTIATION_NOTICE,
      siblingCount,
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

/* ------------------------------------------------------------------ writes */

/** Same scope rules as the GET, but returns a mutable document for the write handlers below. */
async function resolveMutableQuotation(req: any, numberOrId: string) {
  const quotation = await Quotation.findOne({
    $or: [{ number: numberOrId }, ...(numberOrId.match(/^[0-9a-f]{24}$/i) ? [{ _id: numberOrId }] : [])],
  });
  if (!quotation) throw notFound('That quotation could not be found.');
  assertPortalScope(req, quotation as any);
  if (quotation.stage === QuoteStage.DRAFT) throw forbidden('This quotation has not been sent to you yet.');
  return quotation;
}

async function resolvePortalActor(req: any): Promise<{ id: string; name: string }> {
  const user: any = await User.findById(req.portal.userId).lean();
  return { id: req.portal.userId, name: user?.name ?? 'Customer' };
}

/** Mirrors `toLineDoc` in quotations.routes.ts — the embedded schema's own `lineId` field. */
function toLineDoc(l: PricedLine) {
  return {
    lineId: l.id, productId: l.productId, productName: l.productName, sku: l.sku,
    category: l.category, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice,
    discountPct: l.discountPct, allowedDiscountPct: l.allowedDiscountPct, taxPct: l.taxPct,
    isSubscription: l.isSubscription, recurringCycle: l.recurringCycle,
    selectedVariants: l.selectedVariants, addedFromUpsell: l.addedFromUpsell,
    lineGross: l.lineGross, lineDiscount: l.lineDiscount, lineNet: l.lineNet, lineTax: l.lineTax,
    lineTotal: l.lineTotal, lineCost: l.lineCost, lineMargin: l.lineMargin, marginPct: l.marginPct,
    discountStatus: l.discountStatus, overByPts: l.overByPts,
  };
}

async function resolveAssignee(role: Role): Promise<string | undefined> {
  const user = await User.findOne({ role, active: true }).lean();
  return (user as any)?.name;
}

const commentSchema = z.object({ lineId: z.string().optional(), comment: z.string().trim().min(1, 'A comment is required.') });

/** A question with no counter attached — never re-enters approval. */
portalRouter.post(
  '/q/:number/comment',
  requirePortalToken,
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const quotation = await resolveMutableQuotation(req, req.params.number);
    const body = req.body as PortalCommentRequest;
    const actor = await resolvePortalActor(req);
    const line = body.lineId ? (quotation.lines as any[]).find((l) => l.lineId === body.lineId) : undefined;

    const event = await NegotiationEvent.create({
      quotationId: quotation._id, lineId: body.lineId, lineName: line?.productName,
      type: NegotiationEventType.COMMENT, authorId: actor.id, authorName: actor.name,
      fromCustomer: true, comment: body.comment,
    });

    quotation.lastActivityAt = new Date();
    await quotation.save();

    await writeAudit({
      actor: { id: actor.id, name: actor.name, role: Role.CUSTOMER },
      action: 'CUSTOMER_COMMENT',
      entity: AuditEntity.NEGOTIATION,
      entityId: String(quotation._id),
      entityLabel: quotation.number,
      reason: body.comment,
    });

    ok(res, toDto(event));
  }),
);

const counterSchema = z.object({
  lines: z.array(z.object({
    lineId: z.string().min(1),
    counterDiscountPct: z.number().min(0).max(100).optional(),
    requestedQty: z.number().int().min(0).optional(),
    comment: z.string().trim().optional(),
  })).default([]),
  requestedDeliveryDate: z.string().optional(),
  note: z.string().trim().optional(),
});

/**
 * THE RE-APPROVAL LOOP. Applies the customer's proposed terms to the actual
 * quotation lines, recomputes the blended risk against the CURRENT config —
 * exactly like a rep's submit — and if that now breaches the thresholds,
 * forces the quotation back to PENDING_APPROVAL and reopens its approval with
 * `reEnteredFromNegotiation: true`. Nobody requested that review.
 */
portalRouter.post(
  '/q/:number/counter',
  requirePortalToken,
  validate(counterSchema),
  asyncHandler(async (req, res) => {
    const quotation = await resolveMutableQuotation(req, req.params.number);
    if ([QuoteStage.DRAFT, QuoteStage.CONFIRMED, QuoteStage.REJECTED].includes(quotation.stage)) {
      throw invalidState(`This quotation is ${quotation.stage} and its terms can no longer be changed.`);
    }
    const body = req.body as PortalCounterRequest;
    const actor = await resolvePortalActor(req);
    const now = new Date();

    const byLineId = new Map(body.lines.map((l) => [l.lineId, l]));
    for (const line of quotation.lines as any[]) {
      const proposal = byLineId.get(line.lineId);
      if (!proposal) continue;
      if (proposal.counterDiscountPct != null) line.discountPct = proposal.counterDiscountPct;
      if (proposal.requestedQty != null) line.qty = Math.max(0, proposal.requestedQty);
    }
    if (body.requestedDeliveryDate) quotation.promisedDeliveryDate = new Date(body.requestedDeliveryDate);

    // Log one negotiation event per line that actually proposed something, plus the free-text note.
    const events = [];
    for (const line of quotation.lines as any[]) {
      const proposal = byLineId.get(line.lineId);
      if (!proposal) continue;
      const type =
        proposal.counterDiscountPct != null ? NegotiationEventType.COUNTER_DISCOUNT
        : proposal.requestedQty != null ? NegotiationEventType.QTY_CHANGE_REQUEST
        : NegotiationEventType.COMMENT;
      events.push({
        quotationId: quotation._id, lineId: line.lineId, lineName: line.productName, type,
        authorId: actor.id, authorName: actor.name, fromCustomer: true,
        comment: proposal.comment, counterDiscountPct: proposal.counterDiscountPct, requestedQty: proposal.requestedQty,
      });
    }
    if (body.requestedDeliveryDate) {
      events.push({
        quotationId: quotation._id, type: NegotiationEventType.DELIVERY_DATE_REQUEST,
        authorId: actor.id, authorName: actor.name, fromCustomer: true,
        comment: body.note, requestedDeliveryDate: new Date(body.requestedDeliveryDate),
      });
    } else if (body.note) {
      events.push({
        quotationId: quotation._id, type: NegotiationEventType.COMMENT,
        authorId: actor.id, authorName: actor.name, fromCustomer: true, comment: body.note,
      });
    }
    if (events.length > 0) await NegotiationEvent.insertMany(events);

    // Re-price and re-score exactly as a rep's submit would, against the CURRENT config.
    const riskConfig = await loadRiskConfig();
    const linesInput: LinePricingInput[] = (quotation.lines as any[]).map((l) => ({
      id: l.lineId, productId: String(l.productId), productName: l.productName, sku: l.sku,
      category: l.category, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice,
      discountPct: l.discountPct, taxPct: l.taxPct, isSubscription: l.isSubscription,
      recurringCycle: l.recurringCycle, selectedVariants: l.selectedVariants, addedFromUpsell: l.addedFromUpsell,
    }));
    const priced: PricedLine[] = linesInput.map((line) => computeLinePricing(line, quotation.tier as any, riskConfig));
    const risk = calculateBlendedRisk(
      priced.map((l) => ({ id: l.id, productName: l.productName, category: l.category, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, allowedDiscountPct: l.allowedDiscountPct })),
      quotation.tier as any,
      riskConfig,
    );
    quotation.lines = priced.map(toLineDoc) as any;
    quotation.totals = computeQuoteTotals(priced) as any;
    quotation.risk = risk as any;

    const reEnteredApproval = !isAutoApproved(risk);
    let approvalDto: any = null;

    if (reEnteredApproval) {
      quotation.stage = QuoteStage.PENDING_APPROVAL;
      let approval: any = quotation.approvalId ? await Approval.findById(quotation.approvalId) : null;
      if (!approval) {
        approval = new Approval({
          quotationId: quotation._id, quotationNumber: quotation.number,
          customerId: quotation.customerId, customerName: quotation.customerName, tier: quotation.tier,
          ownerId: quotation.ownerId, ownerName: quotation.ownerName, currency: quotation.currency,
          trail: [],
        });
      }
      approval.amount = quotation.totals.grandTotal;
      approval.risk = risk as any;
      approval.status = ApprovalStatus.PENDING;
      approval.steps = risk.requiredChain.map((role, i) => ({
        role, status: i === 0 ? ApprovalStepStatus.ACTIVE : ApprovalStepStatus.PENDING,
        activatedAt: i === 0 ? now : undefined,
      })) as any;
      approval.currentStepIndex = 0;
      approval.currentStage = risk.requiredChain[0];
      approval.assignedToName = await resolveAssignee(risk.requiredChain[0]);
      approval.decidedAt = undefined;
      approval.submittedAt = approval.submittedAt ?? now;
      approval.reEnteredFromNegotiation = true;
      approval.trail.push({
        actorId: actor.id, actorName: actor.name, role: Role.CUSTOMER,
        action: ApprovalAction.RE_ENTERED_FROM_NEGOTIATION,
        reason: body.note?.trim() || 'Customer counter-offer breached the approval threshold',
        at: now,
      });
      await approval.save();
      quotation.approvalId = approval._id;
      approvalDto = toDto(approval);

      await writeAudit({
        actor: { id: actor.id, name: actor.name, role: Role.CUSTOMER },
        action: 'RE_ENTERED_FROM_NEGOTIATION',
        entity: AuditEntity.APPROVAL,
        entityId: String(quotation._id),
        entityLabel: quotation.number,
        after: { riskScore: risk.riskScore, riskLevel: risk.riskLevel, chain: risk.requiredChain },
        reason: body.note?.trim() || 'Customer counter-offer breached the approval threshold',
      });
    } else {
      quotation.stage = QuoteStage.NEGOTIATION;
    }

    quotation.version += 1;
    quotation.lastActivityAt = now;
    await quotation.save();

    await writeAudit({
      actor: { id: actor.id, name: actor.name, role: Role.CUSTOMER },
      action: 'COUNTER_OFFER_APPLIED',
      entity: AuditEntity.NEGOTIATION,
      entityId: String(quotation._id),
      entityLabel: quotation.number,
      after: { riskScore: risk.riskScore, riskLevel: risk.riskLevel },
      reason: body.note?.trim() || 'Customer proposed new terms',
    });

    const payload: PortalCounterResponse = {
      quotation: toDto(quotation),
      risk,
      reEnteredApproval,
      approval: approvalDto,
      message: reEnteredApproval
        ? 'These terms go beyond what your account manager can approve alone, so the quotation has gone back for internal approval automatically.'
        : 'Your account manager can approve these terms directly.',
    };
    ok(res, payload);
  }),
);

/** Confirms the quotation as-is, then creates the order and plans its warehouse split. */
portalRouter.post(
  '/q/:number/confirm',
  requirePortalToken,
  asyncHandler(async (req, res) => {
    const quotation = await resolveMutableQuotation(req, req.params.number);
    if (![QuoteStage.APPROVED, QuoteStage.NEGOTIATION].includes(quotation.stage)) {
      throw invalidState(`This quotation is ${quotation.stage} and is not ready to confirm.`);
    }
    const actor = await resolvePortalActor(req);
    const now = new Date();

    quotation.stage = QuoteStage.CONFIRMED;
    quotation.version += 1;
    quotation.lastActivityAt = now;
    await quotation.save();

    await NegotiationEvent.create({
      quotationId: quotation._id, type: NegotiationEventType.CONFIRMED,
      authorId: actor.id, authorName: actor.name, fromCustomer: true,
      comment: 'Confirmed the quotation as presented.',
    });

    await writeAudit({
      actor: { id: actor.id, name: actor.name, role: Role.CUSTOMER },
      action: 'CUSTOMER_CONFIRMED',
      entity: AuditEntity.QUOTATION,
      entityId: String(quotation._id),
      entityLabel: quotation.number,
      reason: 'Customer confirmed the quotation via the portal',
    });

    const { order, fulfillment } = await createOrderFromQuotation(String(quotation._id), {
      id: actor.id, name: actor.name, role: Role.CUSTOMER,
    });

    const payload: PortalConfirmResponse = {
      quotation: toDto(quotation),
      order: order ? toDto(order) : null,
      fulfillment: fulfillment ? toDto(fulfillment) : null,
      reEnteredApproval: false,
      approval: null,
      message: 'Your order is confirmed and is being prepared for fulfillment.',
    };
    ok(res, payload);
  }),
);
