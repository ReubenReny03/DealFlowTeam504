/**
 * The only place a domain event is put on the wire.
 *
 * Every function here is a no-op when realtime is not running (the seed script,
 * the smoke test, a unit test), so a route never has to ask whether sockets are
 * up before telling the world what it just did. Realtime is an amplifier for
 * what already happened in Mongo — never the record of it.
 *
 * Each emitter names its own rooms. That decision belongs here, next to the
 * payload, rather than at twenty call sites that would each have to remember
 * that a quotation change concerns the rep, the customer AND anyone watching
 * the deal.
 */
import {
  Role,
  SocketEvent,
  SocketRoom,
  type AlertUpdatedPayload,
  type ApprovalUpdatedPayload,
  type ConfigUpdatedPayload,
  type FulfillmentUpdatedPayload,
  type InvoiceUpdatedPayload,
  type NegotiationEventPayload,
  type OrderUpdatedPayload,
  type QuotationUpdatedPayload,
  type StockUpdatedPayload,
  type SubscriptionUpdatedPayload,
} from '@dealflow/shared';
import { realtime } from './server.js';

/** Who did it, in the shape every route already has to hand. */
export interface EmitActor {
  id: string;
  name: string;
  role?: Role;
}

function emit(rooms: string[], event: string, payload: unknown): void {
  const io = realtime();
  if (!io || rooms.length === 0) return;
  io.to(rooms).emit(event, payload);
}

const now = (): string => new Date().toISOString();

/**
 * A quotation moved. Reaches the rep who owns it, the customer whose deal it is,
 * anyone with the deal open, and every manager — the board on screen 3 is a
 * live picture of the pipeline, so a stage change has to reach it unprompted.
 */
export function emitQuotationUpdated(
  quotation: any,
  reason: string,
  actor?: EmitActor,
): void {
  const payload: QuotationUpdatedPayload = {
    quotationId: String(quotation._id ?? quotation.id),
    number: quotation.number,
    stage: String(quotation.stage),
    version: Number(quotation.version ?? 0),
    customerId: String(quotation.customerId),
    ownerId: String(quotation.ownerId),
    reason,
    actorId: actor?.id,
    actorName: actor?.name,
    at: now(),
  };
  emit(
    [
      SocketRoom.quotation(payload.quotationId),
      SocketRoom.user(payload.ownerId),
      SocketRoom.customer(payload.customerId),
      SocketRoom.role(Role.SALES_MANAGER),
      SocketRoom.role(Role.ADMIN),
    ],
    SocketEvent.QUOTATION_UPDATED,
    payload,
  );
}

/**
 * An approval was raised or decided. The role holding the ACTIVE step is in the
 * room, which is how a Finance queue gains a row the moment a Sales Manager
 * clears the step before it — nobody refreshes to discover work arrived.
 */
export function emitApprovalUpdated(approval: any, actor?: EmitActor): void {
  const payload: ApprovalUpdatedPayload = {
    approvalId: String(approval._id ?? approval.id),
    quotationId: String(approval.quotationId),
    quotationNumber: approval.quotationNumber,
    status: String(approval.status),
    currentStage: approval.currentStage ?? undefined,
    ownerId: String(approval.ownerId),
    actorId: actor?.id,
    actorName: actor?.name,
    at: now(),
  };
  const rooms = [
    SocketRoom.quotation(payload.quotationId),
    SocketRoom.user(payload.ownerId),
    SocketRoom.role(Role.SALES_MANAGER),
    SocketRoom.role(Role.FINANCE),
    SocketRoom.role(Role.ADMIN),
  ];
  emit(rooms, SocketEvent.APPROVAL_UPDATED, payload);
}

/**
 * A message on a deal — the portal thread and the rep's thread are one thread.
 *
 * `context` matters more than it looks. The quotation room only contains people
 * who have THAT deal open, which is not where either side usually is: the
 * customer's Messages tab is not scoped to one quotation, and the rep may be on
 * their pipeline. So the event also goes to the customer's company room and the
 * owning rep's own room. Without those two, a reply is delivered to nobody
 * unless both parties happen to have the same deal open at the same moment.
 */
export function emitNegotiationEvent(
  event: any,
  actor?: EmitActor,
  context?: { customerId?: unknown; ownerId?: unknown },
): void {
  const payload: NegotiationEventPayload = {
    quotationId: String(event.quotationId),
    eventId: String(event._id ?? event.id),
    type: String(event.type),
    fromCustomer: !!event.fromCustomer,
    comment: event.comment,
    actorId: actor?.id ?? (event.authorId ? String(event.authorId) : undefined),
    actorName: actor?.name ?? event.authorName,
    at: now(),
  };
  const rooms = [SocketRoom.quotation(payload.quotationId)];
  if (context?.customerId) rooms.push(SocketRoom.customer(String(context.customerId)));
  if (context?.ownerId) rooms.push(SocketRoom.user(String(context.ownerId)));
  emit(rooms, SocketEvent.NEGOTIATION_EVENT, payload);
}

export function emitOrderUpdated(order: any, actor?: EmitActor): void {
  const payload: OrderUpdatedPayload = {
    orderId: String(order._id ?? order.id),
    number: order.number,
    status: String(order.status),
    quotationId: order.quotationId ? String(order.quotationId) : undefined,
    customerId: String(order.customerId),
    actorId: actor?.id,
    actorName: actor?.name,
    at: now(),
  };
  const rooms = [SocketRoom.customer(payload.customerId), SocketRoom.internal];
  if (payload.quotationId) rooms.push(SocketRoom.quotation(payload.quotationId));
  emit(rooms, SocketEvent.ORDER_UPDATED, payload);
}

export function emitFulfillmentUpdated(fulfillment: any, actor?: EmitActor): void {
  const payload: FulfillmentUpdatedPayload = {
    fulfillmentId: String(fulfillment._id ?? fulfillment.id),
    orderId: String(fulfillment.orderId),
    orderNumber: fulfillment.orderNumber,
    status: String(fulfillment.status),
    customerId: String(fulfillment.customerId),
    actorId: actor?.id,
    actorName: actor?.name,
    at: now(),
  };
  emit(
    [SocketRoom.customer(payload.customerId), SocketRoom.internal],
    SocketEvent.FULFILLMENT_UPDATED,
    payload,
  );
}

export function emitInvoiceUpdated(invoice: any, actor?: EmitActor): void {
  const payload: InvoiceUpdatedPayload = {
    invoiceId: String(invoice._id ?? invoice.id),
    number: invoice.number,
    status: String(invoice.status),
    customerId: String(invoice.customerId),
    orderId: invoice.orderId ? String(invoice.orderId) : undefined,
    actorId: actor?.id,
    actorName: actor?.name,
    at: now(),
  };
  emit(
    [
      SocketRoom.customer(payload.customerId),
      SocketRoom.role(Role.FINANCE),
      SocketRoom.role(Role.ADMIN),
    ],
    SocketEvent.INVOICE_UPDATED,
    payload,
  );
}

export function emitSubscriptionUpdated(subscription: any, actor?: EmitActor): void {
  const payload: SubscriptionUpdatedPayload = {
    subscriptionId: String(subscription._id ?? subscription.id),
    number: subscription.number,
    status: String(subscription.status),
    customerId: String(subscription.customerId),
    actorId: actor?.id,
    actorName: actor?.name,
    at: now(),
  };
  emit(
    [
      SocketRoom.customer(payload.customerId),
      SocketRoom.role(Role.FINANCE),
      SocketRoom.role(Role.ADMIN),
    ],
    SocketEvent.SUBSCRIPTION_UPDATED,
    payload,
  );
}

/** Deal health is a manager's screen, so an alert change reaches managers and the owning rep. */
export function emitAlertUpdated(alert: any, actor?: EmitActor): void {
  const payload: AlertUpdatedPayload = {
    alertId: String(alert._id ?? alert.id),
    status: String(alert.status),
    quotationId: alert.quotationId ? String(alert.quotationId) : undefined,
    ownerId: String(alert.ownerId),
    entityLabel: alert.entityLabel,
    actorId: actor?.id,
    actorName: actor?.name,
    at: now(),
  };
  emit(
    [
      SocketRoom.user(payload.ownerId),
      SocketRoom.role(Role.SALES_MANAGER),
      SocketRoom.role(Role.ADMIN),
    ],
    SocketEvent.ALERT_UPDATED,
    payload,
  );
}

export function emitStockUpdated(input: Omit<StockUpdatedPayload, 'at'>): void {
  emit([SocketRoom.internal], SocketEvent.STOCK_UPDATED, { ...input, at: now() });
}

/**
 * The approval thresholds moved. Everyone internal cares: a pending approval
 * may have just been re-scored under them.
 */
export function emitConfigUpdated(input: Omit<ConfigUpdatedPayload, 'at'>): void {
  emit([SocketRoom.internal], SocketEvent.CONFIG_UPDATED, { ...input, at: now() });
}
