/**
 * The notification centre's demo data (screen 2's bell).
 *
 * Nothing here is hand-written. Every notification is DERIVED from state the
 * earlier seed modules already produced — a pending approval, an escalated
 * alert, a customer's counter-offer — which is why the bell agrees with the
 * screens: if the approval queue shows two rows waiting on Finance, Finance's
 * bell shows exactly those two.
 *
 * Runs last (order 130) for that reason: it reads what everything else wrote.
 *
 * Read/unread is chosen to make the demo legible rather than random. Anything
 * still awaiting a decision is UNREAD — that is the badge the presenter points
 * at. Anything already resolved is read history.
 */
import {
  AlertStatus,
  ApprovalStatus,
  AuditEntity,
  InvoiceStatus,
  NOTIFICATION_SEVERITY,
  NegotiationEventType,
  NotificationType,
  Role,
} from '@dealflow/shared';
import {
  Approval,
  DealAlert,
  Invoice,
  NegotiationEvent,
  Notification,
  Quotation,
  User,
} from '../../db/models.js';
import { G, fid } from '../ids.js';
import type { SeedContext } from '../context.js';

interface Row {
  userId: unknown;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string;
  actorName?: string;
  createdAt: Date;
}

export async function seedNotifications(ctx: SeedContext): Promise<void> {
  const rows: Row[] = [];

  const [users, approvals, alerts, quotations, events, invoices] = await Promise.all([
    User.find({ active: true }).lean(),
    Approval.find().lean(),
    DealAlert.find().lean(),
    Quotation.find().lean(),
    NegotiationEvent.find({ fromCustomer: true }).sort({ createdAt: 1 }).lean(),
    Invoice.find({ status: { $ne: InvoiceStatus.DRAFT } }).lean(),
  ]);

  /** Whoever currently holds a role. An approval lands on a desk, not a name. */
  const byRole = (role: Role): any[] => (users as any[]).filter((u) => u.role === role);
  /** A customer company's portal contacts. */
  const contactsOf = (customerId: unknown): any[] =>
    (users as any[]).filter(
      (u) => u.role === Role.CUSTOMER && String(u.customerId) === String(customerId),
    );
  const quotationById = new Map((quotations as any[]).map((q) => [String(q._id), q]));

  /* ---- approvals: the queue everyone is actually looking at ---- */
  for (const approval of approvals as any[]) {
    const label = approval.quotationNumber;
    if (approval.status === ApprovalStatus.PENDING && approval.currentStage) {
      for (const approver of byRole(approval.currentStage)) {
        rows.push({
          userId: approver._id,
          type: NotificationType.APPROVAL_REQUESTED,
          title: `${label} needs your approval`,
          body: `${approval.ownerName} submitted ${approval.customerName} — ${approval.amount} ${approval.currency}, risk ${approval.risk?.riskLevel ?? 'MEDIUM'}.`,
          link: `/app/approvals/${approval._id}`,
          read: false,
          entity: AuditEntity.APPROVAL,
          entityId: String(approval._id),
          entityLabel: label,
          actorName: approval.ownerName,
          createdAt: approval.submittedAt ?? ctx.daysAgo(2),
        });
      }
      continue;
    }

    // A decided approval is history for the rep who submitted it.
    const decided = approval.trail?.[approval.trail.length - 1];
    if (!decided || !approval.ownerId) continue;
    const type =
      approval.status === ApprovalStatus.APPROVED
        ? NotificationType.APPROVAL_APPROVED
        : approval.status === ApprovalStatus.REJECTED
          ? NotificationType.APPROVAL_REJECTED
          : approval.status === ApprovalStatus.RETURNED
            ? NotificationType.APPROVAL_RETURNED
            : NotificationType.APPROVAL_AUTO_APPROVED;
    rows.push({
      userId: approval.ownerId,
      type,
      title:
        type === NotificationType.APPROVAL_AUTO_APPROVED
          ? `${label} auto-approved`
          : `${label} was ${String(approval.status).toLowerCase()}`,
      body: decided.reason ?? 'Decided.',
      link: `/app/quotations/${approval.quotationId}`,
      // A returned quotation still needs the rep to do something, so it stays unread.
      read: approval.status !== ApprovalStatus.RETURNED,
      entity: AuditEntity.QUOTATION,
      entityId: String(approval.quotationId),
      entityLabel: label,
      actorName: decided.actorName,
      createdAt: approval.decidedAt ?? ctx.daysAgo(1),
    });
  }

  /* ---- deal health: the nudge and the escalation screen 14 already shows ---- */
  for (const alert of alerts as any[]) {
    const last = alert.actions?.[alert.actions.length - 1];
    if (!last) continue;
    const escalated = alert.status === AlertStatus.ESCALATED;
    const recipients = escalated ? byRole(Role.SALES_MANAGER) : [{ _id: alert.ownerId }];
    for (const recipient of recipients) {
      if (!recipient?._id) continue;
      rows.push({
        userId: recipient._id,
        type: escalated
          ? NotificationType.DEAL_HEALTH_ESCALATION
          : NotificationType.DEAL_HEALTH_NUDGE,
        title: escalated ? `Escalated: ${alert.entityLabel}` : `Nudge: ${alert.entityLabel}`,
        body: last.note || alert.detail,
        link: alert.quotationId ? `/app/quotations/${alert.quotationId}` : undefined,
        read: false,
        entity: AuditEntity.ALERT,
        entityId: String(alert._id),
        entityLabel: alert.entityLabel,
        actorName: last.actorName,
        createdAt: last.at ?? ctx.hoursAgo(6),
      });
    }
  }

  /* ---- the portal talking back: the rep hears every customer message ---- */
  for (const event of events as any[]) {
    const quotation = quotationById.get(String(event.quotationId));
    if (!quotation) continue;
    const counter = event.type === NegotiationEventType.COUNTER_DISCOUNT;
    rows.push({
      userId: quotation.ownerId,
      type: counter ? NotificationType.CUSTOMER_COUNTER_OFFER : NotificationType.CUSTOMER_COMMENT,
      title: counter
        ? `${event.authorName} proposed new terms on ${quotation.number}`
        : `${event.authorName} commented on ${quotation.number}`,
      body:
        event.comment ??
        (counter ? `Asked for ${event.counterDiscountPct}% on ${event.lineName}.` : 'Left a note.'),
      link: `/app/quotations/${quotation._id}`,
      read: false,
      entity: AuditEntity.NEGOTIATION,
      entityId: String(quotation._id),
      entityLabel: quotation.number,
      actorName: event.authorName,
      createdAt: event.createdAt ?? ctx.daysAgo(1),
    });
  }

  /* ---- billing: what the customer sees in their own bell ---- */
  for (const invoice of invoices as any[]) {
    const paid = invoice.status === InvoiceStatus.PAID;
    for (const contact of contactsOf(invoice.customerId)) {
      rows.push({
        userId: contact._id,
        type: paid ? NotificationType.PAYMENT_RECEIVED : NotificationType.INVOICE_ISSUED,
        title: paid ? `${invoice.number} settled` : `Invoice ${invoice.number} is ready`,
        body: paid
          ? `Thank you — ${invoice.total} ${invoice.currency} received in full.`
          : `${invoice.amountDue} ${invoice.currency} due ${new Date(invoice.dueDate).toDateString()}.`,
        link: '/portal/quotations',
        read: paid,
        entity: AuditEntity.INVOICE,
        entityId: String(invoice._id),
        entityLabel: invoice.number,
        createdAt: invoice.issueDate ?? ctx.daysAgo(3),
      });
    }
  }

  if (rows.length === 0) return;

  // Newest last so the fixed ids run in the same order the bell reads them.
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  await Notification.insertMany(
    rows.map((row, i) => ({
      _id: fid(G.NOTIFICATION, i + 1),
      ...row,
      severity: NOTIFICATION_SEVERITY[row.type],
      updatedAt: row.createdAt,
    })),
  );
}
