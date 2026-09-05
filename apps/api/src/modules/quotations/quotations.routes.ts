/**
 * Screens 2, 3 and 4.
 * The read side (board, dashboard, list, detail) and the whole write side —
 * line management with optimistic concurrency, the live preview, and
 * `POST /:id/submit`, which computes the blended risk and either
 * auto-approves the quotation or opens the approval chain.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  AuditEntity,
  KANBAN_STAGES,
  QuoteStage,
  Role,
  STAGE_LABEL,
  TERMINAL_STAGES,
  addDays,
  calculateBlendedRisk,
  computeLinePricing,
  computeQuoteTotals,
  type ActivityItemDto,
  type CreateQuotationRequest,
  type KanbanBoardDto,
  type LinePricingInput,
  type PricedLine,
  type QuotationDto,
  type QuotationLineInput,
  type QuotationPreviewDto,
  type QuotationSummaryDto,
  type ReissuePortalLinkResponse,
  type SalesDashboardDto,
  type SubmitQuotationResponse,
  type UpdateQuotationRequest,
} from '@dealflow/shared';
import {
  Approval,
  AuditLog,
  Customer,
  DealAlert,
  PortalToken,
  Quotation,
  User,
  nextSeq,
} from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { invalidState, notFound, staleVersion } from '../../utils/apiError.js';
import { listParams, pageMeta, searchFilter, stableSort } from '../../utils/listQuery.js';
import { created, ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { loadRiskConfig } from '../config/config.service.js';
import { priceLinesForCustomer } from '../pricing/pricing.service.js';

export const quotationsRouter = Router();

const WRITE_ROLES: Role[] = [Role.SALES_REP, Role.SALES_MANAGER, Role.ADMIN];

mountModuleHealth(quotationsRouter, {
  module: 'quotations',
  owner: 'B',
  screens: [2, 3, 4],
  implemented: [
    'GET /',
    'GET /:id',
    'GET /board',
    'GET /dashboard',
    'GET /:id/audit',
    'POST /',
    'PATCH /:id',
    'POST /preview',
    'POST /:id/submit',
    'POST /:id/portal-link',
  ],
  todo: [],
});

const PORTAL_LINK_TTL_DAYS = 14;

function summarise(q: any): QuotationSummaryDto {
  return {
    id: String(q._id),
    number: q.number,
    customerName: q.customerName,
    tier: q.tier,
    ownerName: q.ownerName,
    stage: q.stage,
    grandTotal: q.totals?.grandTotal ?? 0,
    currency: q.currency,
    riskLevel: q.risk?.riskLevel ?? 'NONE',
    riskScore: q.risk?.riskScore ?? 0,
    lastActivityAt: q.lastActivityAt?.toISOString?.() ?? new Date(q.lastActivityAt).toISOString(),
    updatedAt: q.updatedAt?.toISOString?.() ?? new Date(q.updatedAt).toISOString(),
    lineCount: q.lines?.length ?? 0,
  };
}

/**
 * The embedded line's own identity field is `lineId` in Mongoose (it sits
 * next to `productId`, and "id" would have read as a typo for `_id`), but
 * every wire DTO — and the Angular builder — addresses a line by `.id`. This
 * is the one seam where that gets translated back.
 */
function toQuotationDto(doc: unknown): QuotationDto {
  const dto = toDto<any>(doc);
  if (Array.isArray(dto.lines)) {
    dto.lines = dto.lines.map((l: any) => {
      const { lineId, ...rest } = l;
      return { id: lineId, ...rest };
    });
  }
  return dto as QuotationDto;
}

/** The embedded schema's own field, kept out of the public helper above. */
function toLineDoc(l: PricedLine) {
  return {
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
    selectedVariants: l.selectedVariants,
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
  };
}

/** Keeps new line ids monotonic and collision-free even after lines are removed. */
function nextLineNumber(existingLineIds: string[], number: string): number {
  const re = new RegExp(`^${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-L(\\d+)$`);
  let max = 0;
  for (const id of existingLineIds) {
    const match = re.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** Who a step lands on. Screen 5/6's "Assigned To" column. */
async function resolveAssignee(role: Role): Promise<string | undefined> {
  const user = await User.findOne({ role, active: true }).lean();
  return (user as any)?.name;
}

/** The fields `?q=` matches on both the board and the flat list. */
const QUOTATION_SEARCH_FIELDS = ['number', 'customerName', 'ownerName'];

/**
 * Screen 3's Kanban board. It takes the SAME `?q=` as the flat list, so
 * toggling between Kanban and Table view keeps whatever the user searched for
 * instead of silently dropping it.
 *
 * A column shows at most `cardsPerColumn` cards and reports its own `total`, so
 * a 60-card Draft column stays a scannable column rather than an endless one.
 */
quotationsRouter.get(
  '/board',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { q } = listParams(req.query);
    const cardsPerColumn = Math.min(100, Math.max(5, Number(req.query.cardsPerColumn ?? 25) || 25));
    const filter: Record<string, unknown> = {};
    if (req.query.ownerId) filter.ownerId = req.query.ownerId;
    Object.assign(filter, searchFilter(q, QUOTATION_SEARCH_FIELDS) ?? {});

    const quotes: any[] = await Quotation.find(filter).sort({ updatedAt: -1 }).lean();
    const board: KanbanBoardDto = {
      columns: KANBAN_STAGES.map((stage) => {
        const inStage = quotes.filter((qt) => qt.stage === stage);
        const cards = inStage.map(summarise);
        return {
          stage,
          label: STAGE_LABEL[stage],
          total: cards.reduce((a, c) => a + c.grandTotal, 0),
          cards: cards.slice(0, cardsPerColumn),
          cardCount: inStage.length,
        };
      }),
    };
    ok(res, board, { totalQuotations: quotes.length, cardsPerColumn, q });
  }),
);

/** Screen 2's KPI tiles and recent-activity feed. */
quotationsRouter.get(
  '/dashboard',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const [pendingApprovals, openQuotations, atRiskDeals, activity, mine] = await Promise.all([
      Approval.countDocuments({ status: 'PENDING' }),
      Quotation.countDocuments({ stage: { $nin: TERMINAL_STAGES } }),
      DealAlert.countDocuments({ status: { $in: ['OPEN', 'NUDGED', 'ESCALATED'] } }),
      AuditLog.find().sort({ timestamp: -1 }).limit(8).lean(),
      Quotation.find({ ownerId: req.user!.id, stage: { $nin: [QuoteStage.REJECTED] } })
        .sort({ lastActivityAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const recentActivity: ActivityItemDto[] = (activity as any[]).map((a) => ({
      id: String(a._id),
      title: a.action
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^./, (c: string) => c.toUpperCase()),
      detail: a.reason || `${a.entityLabel ?? a.entity} updated`,
      actorName: a.actor,
      entity: a.entity,
      entityId: String(a.entityId),
      entityLabel: a.entityLabel ?? '',
      at: new Date(a.timestamp).toISOString(),
    }));

    const dashboard: SalesDashboardDto = {
      pendingApprovals,
      openQuotations,
      atRiskDeals,
      recentActivity,
      myQuotations: (mine as any[]).map(summarise),
    };
    ok(res, dashboard);
  }),
);

/** Screen 4's line-level audit history. */
quotationsRouter.get(
  '/:id/audit',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const entries = await AuditLog.find({ entityId: req.params.id }).sort({ timestamp: 1 }).lean();
    ok(res, toDtoList(entries));
  }),
);

/* ------------------------------------------------------------------ writes */

const lineInputSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  qty: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  selectedVariants: z.record(z.string()).optional(),
  addedFromUpsell: z.boolean().optional(),
});

const createSchema = z.object({
  customerId: z.string().min(1),
  promisedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  lines: z.array(lineInputSchema).optional(),
  promisedDeliveryDate: z.string().nullable().optional(),
  notes: z.string().optional(),
  version: z.number().int(),
});

const previewSchema = z.object({
  customerId: z.string().min(1),
  lines: z.array(lineInputSchema).default([]),
});

const submitSchema = z.object({ reason: z.string().optional() }).default({});

const reissueLinkSchema = z.object({ reason: z.string().trim().optional() }).default({});

/** A blank draft against a customer — screen 3's "+ New Quotation". */
quotationsRouter.post(
  '/',
  requireAuth(WRITE_ROLES),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateQuotationRequest;
    const customer = await Customer.findById(body.customerId).lean();
    if (!customer) throw notFound(`No customer with id ${body.customerId}`);

    const riskConfig = await loadRiskConfig();
    const totals = computeQuoteTotals([]);
    const risk = calculateBlendedRisk([], (customer as any).tier, riskConfig);
    const now = new Date();

    const doc = await Quotation.create({
      number: `Q-${await nextSeq('quotation', 2000)}`,
      customerId: (customer as any)._id,
      customerName: (customer as any).name,
      tier: (customer as any).tier,
      priceListId: (customer as any).priceListId,
      currency: (customer as any).currency,
      ownerId: req.user!.id,
      ownerName: req.user!.name,
      stage: QuoteStage.DRAFT,
      lines: [],
      totals,
      risk,
      validUntil: addDays(now, 30),
      promisedDeliveryDate: body.promisedDeliveryDate
        ? new Date(body.promisedDeliveryDate)
        : undefined,
      lastActivityAt: now,
      version: 1,
      notes: body.notes,
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'QUOTATION_CREATED',
      entity: AuditEntity.QUOTATION,
      entityId: String(doc._id),
      entityLabel: doc.number,
      reason: `New quotation for ${doc.customerName}`,
    });

    created(res, toQuotationDto(doc));
  }),
);

/**
 * Line add / remove / qty / discount, guarded by optimistic concurrency.
 * A line with no `id` is added; an omitted line is removed. Only a DRAFT
 * quotation is editable — once it is out for approval, in negotiation or
 * confirmed, this is a 409, not a silent no-op.
 */
quotationsRouter.patch(
  '/:id',
  requireAuth(WRITE_ROLES),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const doc = await Quotation.findById(req.params.id);
    if (!doc) throw notFound(`No quotation with id ${req.params.id}`);

    const body = req.body as UpdateQuotationRequest;
    if (body.version !== doc.version) throw staleVersion();
    if (doc.stage !== QuoteStage.DRAFT) {
      throw invalidState(
        `Only a draft quotation can be edited. This one is ${STAGE_LABEL[doc.stage as QuoteStage]}.`,
      );
    }

    const before = { lineCount: doc.lines.length, grandTotal: doc.totals?.grandTotal ?? 0 };

    if (body.lines) {
      const existingIds = (doc.lines as any[]).map((l) => l.lineId);
      let nextSuffix = nextLineNumber(existingIds, doc.number);
      const inputLines: QuotationLineInput[] = body.lines.map((line) =>
        line.id ? line : { ...line, id: `${doc.number}-L${nextSuffix++}` },
      );

      const riskConfig = await loadRiskConfig();
      const { tier, priced } = await priceLinesForCustomer(
        String(doc.customerId),
        inputLines,
        riskConfig,
      );
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
        tier,
        riskConfig,
      );

      doc.lines = priced.map(toLineDoc) as any;
      doc.totals = totals as any;
      doc.risk = risk as any;
    }

    if (body.promisedDeliveryDate !== undefined) {
      doc.promisedDeliveryDate = body.promisedDeliveryDate
        ? new Date(body.promisedDeliveryDate)
        : undefined;
    }
    if (body.notes !== undefined) doc.notes = body.notes;

    doc.version += 1;
    doc.lastActivityAt = new Date();
    await doc.save();

    const after = { lineCount: doc.lines.length, grandTotal: doc.totals?.grandTotal ?? 0 };
    if (before.lineCount !== after.lineCount || before.grandTotal !== after.grandTotal) {
      await writeAudit({
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        action: 'QUOTATION_UPDATED',
        entity: AuditEntity.QUOTATION,
        entityId: String(doc._id),
        entityLabel: doc.number,
        before,
        after,
        reason: 'Draft edited',
      });
    }

    ok(res, toQuotationDto(doc));
  }),
);

/**
 * The server-side echo of the client's optimistic preview. It exists to
 * CONFIRM the numbers the builder already computed locally, not to produce
 * them — the Angular store calls the same pure functions on every keystroke.
 */
quotationsRouter.post(
  '/preview',
  requireAuth(WRITE_ROLES),
  validate(previewSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { customerId: string; lines: QuotationLineInput[] };
    const riskConfig = await loadRiskConfig();
    const { tier, priced } = await priceLinesForCustomer(body.customerId, body.lines, riskConfig);

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
      tier,
      riskConfig,
    );

    const payload: QuotationPreviewDto = {
      lines: priced as any,
      totals: computeQuoteTotals(priced),
      risk,
    };
    ok(res, payload);
  }),
);

/**
 * THE HANDOFF. Recomputes the blended risk server-side and either auto-approves
 * the quotation or opens the approval chain from `risk.requiredChain` — the rep
 * never chooses. A quotation returned for revision reopens its EXISTING
 * approval record on resubmit rather than creating a second one, so the audit
 * trail reads Submitted / Returned / Resubmitted in one continuous story.
 */
quotationsRouter.post(
  '/:id/submit',
  requireAuth(WRITE_ROLES),
  validate(submitSchema),
  asyncHandler(async (req, res) => {
    const doc = await Quotation.findById(req.params.id);
    if (!doc) throw notFound(`No quotation with id ${req.params.id}`);
    if (doc.stage !== QuoteStage.DRAFT) {
      throw invalidState(
        `Only a draft quotation can be submitted. This one is ${STAGE_LABEL[doc.stage as QuoteStage]}.`,
      );
    }
    if (doc.lines.length === 0) throw invalidState('Add at least one line before submitting.');

    const riskConfig = await loadRiskConfig();
    // Re-price every line against the CURRENT configuration — ceilings may
    // have moved since the draft was last saved, and the rep's own preview is
    // only ever a preview.
    const linesInput: LinePricingInput[] = (doc.lines as any[]).map((l) => ({
      id: l.lineId,
      productId: String(l.productId),
      productName: l.productName,
      sku: l.sku,
      category: l.category,
      qty: l.qty,
      unitPrice: l.unitPrice,
      costPrice: l.costPrice,
      discountPct: l.discountPct,
      taxPct: l.taxPct,
      isSubscription: l.isSubscription,
      recurringCycle: l.recurringCycle,
      selectedVariants: l.selectedVariants,
      addedFromUpsell: l.addedFromUpsell,
    }));
    const priced: PricedLine[] = linesInput.map((line) =>
      computeLinePricing(line, doc.tier, riskConfig),
    );
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
      doc.tier,
      riskConfig,
    );
    doc.lines = priced.map(toLineDoc) as any;
    doc.totals = computeQuoteTotals(priced) as any;
    doc.risk = risk as any;

    const now = new Date();
    const autoApproved = risk.requiredChain.length === 0;
    const body = req.body as { reason?: string };
    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };

    const existing = doc.approvalId ? await Approval.findById(doc.approvalId) : null;
    const isResubmit = !!existing && existing.status === ApprovalStatus.RETURNED;
    const approval = isResubmit
      ? existing!
      : new Approval({
          quotationId: doc._id,
          quotationNumber: doc.number,
          customerId: doc.customerId,
          customerName: doc.customerName,
          tier: doc.tier,
          ownerId: doc.ownerId,
          ownerName: doc.ownerName,
          currency: doc.currency,
          trail: [],
        });

    approval.amount = doc.totals.grandTotal;
    approval.risk = risk as any;

    const action: ApprovalAction = autoApproved
      ? ApprovalAction.AUTO_APPROVED
      : isResubmit
        ? ApprovalAction.RESUBMITTED
        : ApprovalAction.SUBMITTED;
    const defaultReason = autoApproved
      ? 'Blended risk score 0 — no approval required'
      : isResubmit
        ? 'Resubmitted for approval'
        : 'Submitted for approval';
    const reason = body.reason?.trim() || defaultReason;

    if (autoApproved) {
      approval.status = ApprovalStatus.NOT_REQUIRED;
      approval.steps = [];
      approval.currentStepIndex = -1;
      approval.currentStage = undefined;
      approval.assignedToName = undefined;
      approval.decidedAt = now;
      approval.cycleTimeMs = approval.submittedAt
        ? now.getTime() - approval.submittedAt.getTime()
        : 0;
    } else {
      approval.status = ApprovalStatus.PENDING;
      approval.steps = risk.requiredChain.map((role, i) => ({
        role,
        status: i === 0 ? ApprovalStepStatus.ACTIVE : ApprovalStepStatus.PENDING,
        activatedAt: i === 0 ? now : undefined,
      })) as any;
      approval.currentStepIndex = 0;
      approval.currentStage = risk.requiredChain[0];
      approval.assignedToName = await resolveAssignee(risk.requiredChain[0]);
      approval.decidedAt = undefined;
      approval.reEnteredFromNegotiation = false;
    }
    approval.submittedAt = approval.submittedAt ?? now;
    approval.trail.push({
      actorId: actor.id as any,
      actorName: actor.name,
      role: actor.role,
      action,
      reason,
      at: now,
    } as any);
    await approval.save();

    doc.approvalId = approval._id;
    doc.stage = autoApproved ? QuoteStage.APPROVED : QuoteStage.PENDING_APPROVAL;
    doc.submittedAt = doc.submittedAt ?? now;
    doc.version += 1;
    doc.lastActivityAt = now;
    await doc.save();

    await writeAudit({
      actor,
      action,
      entity: AuditEntity.APPROVAL,
      entityId: String(doc._id),
      entityLabel: doc.number,
      after: { riskScore: risk.riskScore, riskLevel: risk.riskLevel, chain: risk.requiredChain },
      reason,
    });

    const payload: SubmitQuotationResponse = {
      quotation: toQuotationDto(doc),
      approval: autoApproved ? null : toDto(approval),
      autoApproved,
      risk,
    };
    ok(res, payload);
  }),
);

/**
 * Reissue the customer's magic link. USER_FLOWS §E11: an expired link tells the
 * customer to "ask your account manager for a new one" — this is that. Every
 * live token for the quotation is revoked and a single fresh one is minted, so
 * an old link cannot keep working alongside the new one.
 */
quotationsRouter.post(
  '/:id/portal-link',
  requireAuth(WRITE_ROLES),
  validate(reissueLinkSchema),
  asyncHandler(async (req, res) => {
    const doc = await Quotation.findById(req.params.id);
    if (!doc) throw notFound(`No quotation with id ${req.params.id}`);
    if (
      ([QuoteStage.DRAFT, QuoteStage.REJECTED] as QuoteStage[]).includes(doc.stage as QuoteStage)
    ) {
      throw invalidState(
        `A customer link only makes sense once a quotation has been sent. This one is ${STAGE_LABEL[doc.stage as QuoteStage]}.`,
      );
    }

    const portalUser = await User.findOne({
      customerId: doc.customerId,
      role: Role.CUSTOMER,
      active: true,
    }).lean();
    if (!portalUser) {
      throw invalidState(
        `${doc.customerName} has no portal contact configured, so a link cannot be issued.`,
      );
    }

    const now = new Date();
    const revoked = await PortalToken.updateMany(
      { quotationId: doc._id, revoked: false },
      { $set: { revoked: true } },
    );

    const token = `link-${randomUUID().replace(/-/g, '')}`;
    const expiresAt = addDays(now, PORTAL_LINK_TTL_DAYS);
    await PortalToken.create({
      token,
      quotationId: doc._id,
      customerId: doc.customerId,
      userId: (portalUser as any)._id,
      expiresAt,
    });

    const { reason } = req.body as { reason?: string };
    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'PORTAL_LINK_REISSUED',
      entity: AuditEntity.QUOTATION,
      entityId: String(doc._id),
      entityLabel: doc.number,
      after: { revokedCount: revoked.modifiedCount ?? 0, expiresAt: expiresAt.toISOString() },
      reason: reason?.trim() || 'Customer portal link reissued',
    });

    const payload: ReissuePortalLinkResponse = {
      token,
      url: `/portal/q/${doc.number}?token=${token}`,
      expiresAt: expiresAt.toISOString(),
      revokedCount: revoked.modifiedCount ?? 0,
    };
    ok(res, payload);
  }),
);

/* ------------------------------------------------------------------ reads */

quotationsRouter.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const doc = await Quotation.findById(req.params.id).lean();
    if (!doc) throw notFound(`No quotation with id ${req.params.id}`);
    ok(res, toQuotationDto(doc));
  }),
);

quotationsRouter.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const params = listParams(req.query, { maxPageSize: 500 });
    const filter: Record<string, unknown> = {};
    for (const field of ['stage', 'ownerId', 'customerId']) {
      const value = (req.query as Record<string, unknown>)[field];
      if (value !== undefined && value !== '') filter[field] = value;
    }
    Object.assign(filter, searchFilter(params.q, QUOTATION_SEARCH_FIELDS) ?? {});

    const [items, total] = await Promise.all([
      Quotation.find(filter)
        .sort(stableSort({ lastActivityAt: -1 }))
        .skip(params.skip)
        .limit(params.pageSize)
        .lean(),
      Quotation.countDocuments(filter),
    ]);
    ok(res, items.map(toQuotationDto), pageMeta(params, total));
  }),
);
