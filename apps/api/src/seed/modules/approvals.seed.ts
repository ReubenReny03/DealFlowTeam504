/**
 * Live approvals (screens 5 and 6), the audit trail, Priya's portal token and
 * the negotiation history on Q-1030.
 *
 * The risk snapshot on each approval is copied from the quotation the previous
 * seed module computed — it is never re-typed by hand.
 */
import {
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  AuditEntity,
  NegotiationEventType,
  RiskLevel,
  Role,
} from '@dealflow/shared';
import { addDays } from '@dealflow/shared';
import { Approval, AuditLog, NegotiationEvent, PortalToken, Quotation } from '../../db/models.js';
import { IDS, fid, G } from '../ids.js';
import type { SeedContext } from '../context.js';
import { env } from '../../config/env.js';

/** Deterministic magic-link token for Priya against Q-1042. Printed by every seed run. */
export const PRIYA_PORTAL_TOKEN = 'demo-acme-q1042-2f7a91c4b8e04d16';

export async function seedApprovalsAndAudit(ctx: SeedContext): Promise<void> {
  const quotes = await Quotation.find({
    number: { $in: ['Q-1042', 'Q-1039', 'Q-1035', 'Q-1045', 'Q-1046'] },
  }).lean();
  const byNumber = Object.fromEntries(quotes.map((q: any) => [q.number, q]));

  const q1042 = byNumber['Q-1042'];
  const q1039 = byNumber['Q-1039'];
  const q1035 = byNumber['Q-1035'];
  const q1045 = byNumber['Q-1045'];
  const q1046 = byNumber['Q-1046'];

  const submittedAt = ctx.daysAgo(3);
  const returnedAt = ctx.daysAgo(2);
  const resubmittedAt = ctx.daysAgo(1);

  const approvals = [
    /* ---- Q-1042: HIGH. Manager step ACTIVE, Finance step still PENDING.
            Trail is exactly the three entries screen 6 renders.            ---- */
    {
      _id: IDS.quotations.q1042,
      quotationId: q1042._id, quotationNumber: 'Q-1042',
      customerId: q1042.customerId, customerName: 'Acme Corp', tier: q1042.tier,
      ownerId: IDS.users.rao, ownerName: 'J. Rao',
      amount: q1042.totals.grandTotal, currency: 'USD',
      status: ApprovalStatus.PENDING,
      risk: q1042.risk,
      steps: [
        { role: Role.SALES_MANAGER, status: ApprovalStepStatus.ACTIVE, activatedAt: resubmittedAt },
        { role: Role.FINANCE, status: ApprovalStepStatus.PENDING },
      ],
      currentStepIndex: 0,
      currentStage: Role.SALES_MANAGER,
      assignedToName: 'M. Shah',
      trail: [
        { actorId: IDS.users.rao, actorName: 'J. Rao', role: Role.SALES_REP, action: ApprovalAction.SUBMITTED, reason: 'Initial 12% discount', at: submittedAt },
        { actorId: IDS.users.shah, actorName: 'M. Shah', role: Role.SALES_MANAGER, action: ApprovalAction.RETURNED, reason: 'Requested justification', at: returnedAt },
        { actorId: IDS.users.rao, actorName: 'J. Rao', role: Role.SALES_REP, action: ApprovalAction.RESUBMITTED, reason: 'Added margin note', at: resubmittedAt },
      ],
      submittedAt,
      reEnteredFromNegotiation: false,
      createdAt: submittedAt, updatedAt: resubmittedAt,
    },

    /* ---- Q-1039: MEDIUM -> one approver only. ---- */
    {
      _id: IDS.quotations.q1039,
      quotationId: q1039._id, quotationNumber: 'Q-1039',
      customerId: q1039.customerId, customerName: 'Beta Industries', tier: q1039.tier,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      amount: q1039.totals.grandTotal, currency: 'USD',
      status: ApprovalStatus.PENDING,
      risk: q1039.risk,
      steps: [{ role: Role.SALES_MANAGER, status: ApprovalStepStatus.ACTIVE, activatedAt: ctx.daysAgo(2) }],
      currentStepIndex: 0, currentStage: Role.SALES_MANAGER, assignedToName: 'M. Shah',
      trail: [{ actorId: IDS.users.nair, actorName: 'S. Nair', role: Role.SALES_REP, action: ApprovalAction.SUBMITTED, reason: 'Volume deal, three lines slightly over ceiling', at: ctx.daysAgo(2) }],
      submittedAt: ctx.daysAgo(2),
      reEnteredFromNegotiation: false,
      createdAt: ctx.daysAgo(2), updatedAt: ctx.daysAgo(2),
    },

    /* ---- Q-1046: HIGH, Manager already approved, now sitting with Finance.
            This is what K. Iyer sees on login.                              ---- */
    {
      _id: IDS.quotations.q1047,
      quotationId: q1046._id, quotationNumber: 'Q-1046',
      customerId: q1046.customerId, customerName: 'Orion Ltd', tier: q1046.tier,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      amount: q1046.totals.grandTotal, currency: 'USD',
      status: ApprovalStatus.PENDING,
      risk: q1046.risk,
      steps: [
        { role: Role.SALES_MANAGER, status: ApprovalStepStatus.APPROVED, actorId: IDS.users.shah, actorName: 'M. Shah', action: ApprovalAction.APPROVED, reason: 'Strategic account, margin still acceptable', actedAt: ctx.hoursAgo(20), activatedAt: ctx.daysAgo(2) },
        { role: Role.FINANCE, status: ApprovalStepStatus.ACTIVE, activatedAt: ctx.hoursAgo(20) },
      ],
      currentStepIndex: 1, currentStage: Role.FINANCE, assignedToName: 'K. Iyer',
      trail: [
        { actorId: IDS.users.nair, actorName: 'S. Nair', role: Role.SALES_REP, action: ApprovalAction.SUBMITTED, reason: '50-unit rollout, service line stretched to win it', at: ctx.daysAgo(2) },
        { actorId: IDS.users.shah, actorName: 'M. Shah', role: Role.SALES_MANAGER, action: ApprovalAction.APPROVED, reason: 'Strategic account, margin still acceptable', at: ctx.hoursAgo(20) },
      ],
      submittedAt: ctx.daysAgo(2),
      reEnteredFromNegotiation: false,
      createdAt: ctx.daysAgo(2), updatedAt: ctx.hoursAgo(20),
    },

    /* ---- Q-1045: returned for revision. Screen 5's "1 Returned" chip. ---- */
    {
      _id: IDS.quotations.q1046,
      quotationId: q1045._id, quotationNumber: 'Q-1045',
      customerId: q1045.customerId, customerName: 'Orion Ltd', tier: q1045.tier,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      amount: q1045.totals.grandTotal, currency: 'USD',
      status: ApprovalStatus.RETURNED,
      risk: q1045.risk,
      steps: [{ role: Role.SALES_MANAGER, status: ApprovalStepStatus.RETURNED, actorId: IDS.users.shah, actorName: 'M. Shah', action: ApprovalAction.RETURNED, reason: 'Justify the 19% on hardware before I take this to Finance', actedAt: ctx.daysAgo(3), activatedAt: ctx.daysAgo(4) }],
      currentStepIndex: -1,
      trail: [
        { actorId: IDS.users.nair, actorName: 'S. Nair', role: Role.SALES_REP, action: ApprovalAction.SUBMITTED, reason: 'Competitive bid', at: ctx.daysAgo(4) },
        { actorId: IDS.users.shah, actorName: 'M. Shah', role: Role.SALES_MANAGER, action: ApprovalAction.RETURNED, reason: 'Justify the 19% on hardware before I take this to Finance', at: ctx.daysAgo(3) },
      ],
      submittedAt: ctx.daysAgo(4), decidedAt: ctx.daysAgo(3),
      cycleTimeMs: ctx.daysAgo(3).getTime() - ctx.daysAgo(4).getTime(),
      reEnteredFromNegotiation: false,
      createdAt: ctx.daysAgo(4), updatedAt: ctx.daysAgo(3),
    },

    /* ---- Q-1035: risk 0, so no human ever touched it. ---- */
    {
      _id: IDS.quotations.q1035,
      quotationId: q1035._id, quotationNumber: 'Q-1035',
      customerId: q1035.customerId, customerName: 'Novus Retail', tier: q1035.tier,
      ownerId: IDS.users.nair, ownerName: 'S. Nair',
      amount: q1035.totals.grandTotal, currency: 'USD',
      status: ApprovalStatus.NOT_REQUIRED,
      risk: q1035.risk,
      steps: [], currentStepIndex: -1,
      trail: [{ actorId: IDS.users.nair, actorName: 'S. Nair', role: Role.SALES_REP, action: ApprovalAction.AUTO_APPROVED, reason: 'Every line inside its own discount limit; blended risk score 0', at: ctx.daysAgo(11) }],
      submittedAt: ctx.daysAgo(11), decidedAt: ctx.daysAgo(11), cycleTimeMs: 0,
      reEnteredFromNegotiation: false,
      createdAt: ctx.daysAgo(11), updatedAt: ctx.daysAgo(11),
    },
  ];

  await Approval.insertMany(approvals);

  /* ---- Audit trail. Every approval action above has a matching entry. ---- */
  let auditSeq = 0;
  const audit = (o: Record<string, unknown>) => ({ _id: fid(G.AUDIT, ++auditSeq), ...o });

  await AuditLog.insertMany([
    audit({ actor: 'A. Verma', actorId: IDS.users.admin, role: Role.ADMIN, action: 'CONFIG_SAVED', entity: AuditEntity.CONFIG, entityId: IDS.config, entityLabel: 'Discount tiers & approval chain', reason: 'Initial governance configuration: Bronze 5 / Silver 10 / Gold 15, Hardware 15 / Services 10 / Subscription 5', timestamp: ctx.daysAgo(45) }),
    audit({ actor: 'J. Rao', actorId: IDS.users.rao, role: Role.SALES_REP, action: 'QUOTATION_CREATED', entity: AuditEntity.QUOTATION, entityId: q1042._id, entityLabel: 'Q-1042', reason: 'New quotation for Acme Corp', timestamp: ctx.daysAgo(3) }),
    audit({ actor: 'J. Rao', actorId: IDS.users.rao, role: Role.SALES_REP, action: 'DISCOUNT_CHANGED', entity: AuditEntity.QUOTATION, entityId: q1042._id, entityLabel: 'Q-1042', before: { line: 'Onsite Setup Service', discountPct: 0 }, after: { line: 'Onsite Setup Service', discountPct: 18 }, reason: 'Customer pushed back on the service fee', timestamp: ctx.daysAgo(3) }),
    audit({ actor: 'J. Rao', actorId: IDS.users.rao, role: Role.SALES_REP, action: 'SUBMITTED_FOR_APPROVAL', entity: AuditEntity.APPROVAL, entityId: IDS.quotations.q1042, entityLabel: 'Q-1042', after: { riskScore: q1042.risk.riskScore, riskLevel: q1042.risk.riskLevel, chain: q1042.risk.requiredChain }, reason: 'Initial 12% discount', timestamp: submittedAt }),
    audit({ actor: 'M. Shah', actorId: IDS.users.shah, role: Role.SALES_MANAGER, action: 'RETURNED_FOR_REVISION', entity: AuditEntity.APPROVAL, entityId: IDS.quotations.q1042, entityLabel: 'Q-1042', reason: 'Requested justification', timestamp: returnedAt }),
    audit({ actor: 'J. Rao', actorId: IDS.users.rao, role: Role.SALES_REP, action: 'RESUBMITTED', entity: AuditEntity.APPROVAL, entityId: IDS.quotations.q1042, entityLabel: 'Q-1042', reason: 'Added margin note', timestamp: resubmittedAt }),
    audit({ actor: 'S. Nair', actorId: IDS.users.nair, role: Role.SALES_REP, action: 'SUBMITTED_FOR_APPROVAL', entity: AuditEntity.APPROVAL, entityId: IDS.quotations.q1039, entityLabel: 'Q-1039', reason: 'Volume deal, three lines slightly over ceiling', timestamp: ctx.daysAgo(2) }),
    audit({ actor: 'M. Shah', actorId: IDS.users.shah, role: Role.SALES_MANAGER, action: 'APPROVED', entity: AuditEntity.APPROVAL, entityId: IDS.quotations.q1047, entityLabel: 'Q-1046', reason: 'Strategic account, margin still acceptable', timestamp: ctx.hoursAgo(20) }),
    audit({ actor: 'M. Shah', actorId: IDS.users.shah, role: Role.SALES_MANAGER, action: 'RETURNED_FOR_REVISION', entity: AuditEntity.APPROVAL, entityId: IDS.quotations.q1046, entityLabel: 'Q-1045', reason: 'Justify the 19% on hardware before I take this to Finance', timestamp: ctx.daysAgo(3) }),
    audit({ actor: 'S. Nair', actorId: IDS.users.nair, role: Role.SALES_REP, action: 'AUTO_APPROVED', entity: AuditEntity.APPROVAL, entityId: IDS.quotations.q1035, entityLabel: 'Q-1035', after: { riskScore: 0, riskLevel: RiskLevel.NONE }, reason: 'Blended risk score 0 — no approval required', timestamp: ctx.daysAgo(11) }),
  ]);

  /* ---- Priya's magic link against Q-1042. Printed at the end of every seed run. ---- */
  await PortalToken.insertMany([
    {
      _id: fid(G.PORTAL, 1),
      token: PRIYA_PORTAL_TOKEN,
      quotationId: q1042._id,
      customerId: IDS.customers.acme,
      userId: IDS.users.priya,
      expiresAt: addDays(ctx.now, env.portalTokenTtlDays),
      revoked: false,
    },
    {
      // An already-expired link, so the "your link has expired" unhappy path is demoable.
      _id: fid(G.PORTAL, 2),
      token: 'demo-acme-q1042-expired-000000000',
      quotationId: q1042._id,
      customerId: IDS.customers.acme,
      userId: IDS.users.priya,
      expiresAt: ctx.daysAgo(1),
      revoked: false,
    },
  ]);

  /* ---- Q-1030 is mid-negotiation with Zenith Co, and has been for 9 days. ---- */
  const q1030: any = await Quotation.findOne({ number: 'Q-1030' }).lean();
  if (q1030) {
    await NegotiationEvent.insertMany([
      { _id: fid(G.NEGOTIATION, 1), quotationId: q1030._id, lineId: (q1030 as any).lines[0].lineId, lineName: 'Laptop Pro 14', type: NegotiationEventType.COMMENT, authorId: IDS.users.priya, authorName: 'A. Bose', fromCustomer: true, comment: 'Can you hold this price if we push the order to next quarter?', createdAt: ctx.daysAgo(9), updatedAt: ctx.daysAgo(9) },
      { _id: fid(G.NEGOTIATION, 2), quotationId: q1030._id, type: NegotiationEventType.COUNTER_DISCOUNT, authorId: IDS.users.priya, authorName: 'A. Bose', fromCustomer: true, counterDiscountPct: 18, comment: 'We have a competing quote at 18%.', createdAt: ctx.daysAgo(9), updatedAt: ctx.daysAgo(9) },
    ]);
  }
}
