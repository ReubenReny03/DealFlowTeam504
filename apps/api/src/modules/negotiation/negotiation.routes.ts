import { Router } from 'express';
import { z } from 'zod';
import { AuditEntity, NegotiationEventType, Role } from '@dealflow/shared';
import { NegotiationEvent, Quotation } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const negotiationRouter = Router();

mountModuleHealth(negotiationRouter, {
  module: 'negotiation', domain: 'portal', screens: [11],
  implemented: ['GET /', 'GET /:id', 'POST /:quotationId/comment', 'POST /:quotationId/counter'],
  todo: [],
});

mountReadonly(negotiationRouter, {
  model: NegotiationEvent,
  sort: { createdAt: 1 } as any,
  searchFields: ['comment'],
  filterFields: ['quotationId'],
});

const REP_ROLES: Role[] = [Role.ADMIN, Role.SALES_REP, Role.SALES_MANAGER];
const replySchema = z.object({
  lineId: z.string().optional(),
  comment: z.string().trim().min(1, 'A reply is required.'),
  counterDiscountPct: z.number().min(0).max(100).optional(),
});

/** The rep's internal-side reply on a negotiation thread — the customer sees this in the portal's Messages tab. */
async function reply(req: any, res: any): Promise<void> {
  const quotation: any = await Quotation.findById(req.params.quotationId).lean();
  if (!quotation) throw notFound(`No quotation with id ${req.params.quotationId}`);
  const body = req.body as { lineId?: string; comment: string; counterDiscountPct?: number };
  const line = body.lineId ? (quotation.lines as any[]).find((l) => l.lineId === body.lineId) : undefined;
  const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };

  const event = await NegotiationEvent.create({
    quotationId: quotation._id, lineId: body.lineId, lineName: line?.productName,
    type: NegotiationEventType.REP_REPLY, authorId: actor.id, authorName: actor.name,
    fromCustomer: false, comment: body.comment, counterDiscountPct: body.counterDiscountPct,
  });

  await Quotation.updateOne({ _id: quotation._id }, { $set: { lastActivityAt: new Date() } });

  await writeAudit({
    actor, action: 'REP_REPLIED', entity: AuditEntity.NEGOTIATION,
    entityId: String(quotation._id), entityLabel: quotation.number, reason: body.comment,
  });

  ok(res, toDto(event));
}

negotiationRouter.post('/:quotationId/comment', requireAuth(REP_ROLES), validate(replySchema), asyncHandler(reply));
negotiationRouter.post('/:quotationId/counter', requireAuth(REP_ROLES), validate(replySchema), asyncHandler(reply));
