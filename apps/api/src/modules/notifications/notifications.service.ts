/**
 * The one way a notification is ever created.
 *
 * Before this file existed, exactly one code path in the whole system wrote a
 * Notification (the deal-health nudge) and the seed wrote none — which is why
 * the header bell was empty enough to be commented out of the shell. Every
 * business event that a human needs to hear about now comes through here.
 *
 * Three rules hold everywhere:
 *
 *   1. **Nobody is notified of their own action.** Every helper takes the actor
 *      and drops them from the recipient list. A rep who approves their own
 *      draft does not get told they approved it.
 *   2. **Persist first, emit second.** The Mongo row is the notification; the
 *      socket is only how it arrives sooner. A user who was offline still finds
 *      it in the bell, and a failed emit never loses one.
 *   3. **A notification is private.** It is written per user and pushed to that
 *      user's room only. There is no shared feed to leak out of.
 */
import {
  NOTIFICATION_SEVERITY,
  Role,
  SocketEvent,
  SocketRoom,
  type AuditEntity,
  type NotificationCountPayload,
  type NotificationDto,
  type NotificationSeverity,
  type NotificationType,
} from '@dealflow/shared';
import { Notification, User } from '../../db/models.js';
import { realtime } from '../../realtime/server.js';
import { log } from '../../utils/logger.js';
import { toDto } from '../../utils/serialize.js';

/** What to say. The recipient is decided by the helper you call, not by this. */
export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  /** An in-app route: `/app/quotations/<id>`. Clicking the row goes here. */
  link?: string;
  /** Defaults to the type's own severity — only pass it when this one differs. */
  severity?: NotificationSeverity;
  entity?: AuditEntity;
  entityId?: string;
  entityLabel?: string;
}

/** Who caused the event, so they can be excluded from their own news. */
export interface NotifyActor {
  id: string;
  name: string;
  role?: Role;
}

/** Push one user's fresh badge count. Cheap, and it keeps every tab agreeing. */
async function pushUnreadCount(userId: string): Promise<void> {
  const io = realtime();
  if (!io) return;
  const unreadCount = await Notification.countDocuments({ userId, read: false });
  const payload: NotificationCountPayload = { unreadCount };
  io.to(SocketRoom.user(userId)).emit(SocketEvent.NOTIFICATION_COUNT, payload);
}

/**
 * Write one notification per recipient and push each to its own room.
 *
 * Duplicate and empty ids are dropped, and so is the actor: passing the whole
 * cast of an event and letting this sort it out is the point, because the
 * alternative is every call site remembering to filter itself.
 */
export async function notifyUsers(
  userIds: Array<string | null | undefined>,
  input: NotifyInput,
  actor?: NotifyActor,
): Promise<NotificationDto[]> {
  const recipients = [
    ...new Set(
      userIds
        .filter((id): id is string => !!id)
        .map(String)
        .filter((id) => id !== actor?.id),
    ),
  ];
  if (recipients.length === 0) return [];

  const severity = input.severity ?? NOTIFICATION_SEVERITY[input.type];
  try {
    const docs = await Notification.insertMany(
      recipients.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        severity,
        entity: input.entity,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        actorName: actor?.name,
        read: false,
      })),
    );

    const io = realtime();
    const dtos = docs.map((doc: any) => toDto(doc.toObject ? doc.toObject() : doc) as NotificationDto);
    if (io) {
      for (const dto of dtos) {
        io.to(SocketRoom.user(dto.userId)).emit(SocketEvent.NOTIFICATION_NEW, dto);
      }
      await Promise.all(recipients.map((id) => pushUnreadCount(id)));
    }
    return dtos;
  } catch (err) {
    // A notification is a courtesy on top of a business event that has already
    // succeeded and been audited. Failing to send one must never fail the
    // request that caused it — so this is logged, not thrown.
    log.warn(`notification "${input.type}" could not be delivered: ${String((err as Error).message)}`);
    return [];
  }
}

/**
 * Notify whoever currently holds a role — how an approval lands on the right
 * desk without anyone being named in the code. Inactive accounts are skipped:
 * a switched-off user is not a recipient.
 */
export async function notifyRoles(
  roles: Role[],
  input: NotifyInput,
  actor?: NotifyActor,
): Promise<NotificationDto[]> {
  if (roles.length === 0) return [];
  const users = await User.find({ role: { $in: roles }, active: true }).select('_id').lean();
  return notifyUsers(users.map((u: any) => String(u._id)), input, actor);
}

/**
 * Notify a customer company's portal contacts. Used when something the customer
 * is waiting on happens: their quotation was approved, their order shipped,
 * their rep replied.
 */
export async function notifyCustomer(
  customerId: string | null | undefined,
  input: NotifyInput,
  actor?: NotifyActor,
): Promise<NotificationDto[]> {
  if (!customerId) return [];
  const users = await User.find({ customerId, role: Role.CUSTOMER, active: true })
    .select('_id')
    .lean();
  return notifyUsers(users.map((u: any) => String(u._id)), input, actor);
}

/** After marking read: tell this user's other tabs the badge changed. */
export async function syncUnreadCount(userId: string): Promise<void> {
  await pushUnreadCount(userId);
}

/* ------------------------------------------------------------------ link helpers */

/** Where an internal user should land for a quotation. */
export const quotationLink = (quotationId: unknown): string => `/app/quotations/${String(quotationId)}`;
/** Where an approver should land. Screen 6 is the decision surface. */
export const approvalLink = (approvalId: unknown): string => `/app/approvals/${String(approvalId)}`;
/** Where a customer should land — the portal, never an internal route. */
export const portalLink = (quotationNumber: string): string => `/portal/q/${quotationNumber}`;
export const fulfillmentLink = (fulfillmentId: unknown): string => `/app/fulfillment/${String(fulfillmentId)}`;
export const invoiceLink = (invoiceId: unknown): string => `/app/invoices/${String(invoiceId)}`;
