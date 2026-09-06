/**
 * The socket.io server.
 *
 * Authentication happens ONCE, in the handshake, and the result is a set of
 * rooms. Nothing downstream re-checks who may see what: an emit names a room,
 * and only sockets the handshake put in that room receive it. That is why the
 * room list below is the security boundary and should be read as carefully as
 * `requireAuth`.
 *
 * Two kinds of client connect here:
 *   - an internal user, with the same JWT they send on every REST call;
 *   - a customer, either signed in (JWT with role CUSTOMER) or holding a
 *     magic-link portal token, which unlocks exactly one quotation.
 *
 * A socket that fails the handshake is refused, not silently downgraded — a
 * connection that cannot say who it is has no room to be in.
 */
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server, type DefaultEventsMap, type Socket } from 'socket.io';
import {
  Role,
  SOCKET_AUTH_PORTAL_TOKEN,
  SOCKET_AUTH_TOKEN,
  SOCKET_PATH,
  SocketEvent,
  SocketRoom,
  type RealtimeReadyPayload,
} from '@dealflow/shared';
import { env } from '../config/env.js';
import { PortalToken, Quotation, User } from '../db/models.js';
import type { JwtPayload } from '../middleware/auth.js';
import { log } from '../utils/logger.js';

/** What the handshake established about a connection. Attached to `socket.data`. */
export interface SocketIdentity {
  userId: string;
  name: string;
  role: Role;
  customerId?: string;
  /** Magic-link sessions only: the single quotation the link unlocks. */
  quotationId?: string;
}

/**
 * socket.io carries a per-socket `data` bag whose type is the server's fourth
 * generic. Naming it here is what makes `socket.data` the identity the
 * handshake resolved, everywhere, instead of `any`.
 */
export type RealtimeServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketIdentity>;
type RealtimeSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketIdentity>;

let io: RealtimeServer | null = null;

/** The live server, or null when realtime was never started (tests, seed scripts). */
export function realtime(): RealtimeServer | null {
  return io;
}

/**
 * Resolve the handshake to an identity, or throw.
 *
 * The JWT path re-reads the account exactly as `requireAuth` does: a token is a
 * bearer credential we cannot recall, so a deactivated user must not be able to
 * hold a socket open on a token minted before they were switched off.
 */
async function identify(socket: RealtimeSocket): Promise<SocketIdentity> {
  const auth = (socket.handshake.auth ?? {}) as Record<string, string | undefined>;
  const portalToken = auth[SOCKET_AUTH_PORTAL_TOKEN];
  const bearer = auth[SOCKET_AUTH_TOKEN];

  // A magic link is checked first: it is the narrower credential, and a customer
  // holding one may also have a stale JWT sitting in localStorage.
  if (portalToken) {
    const record: any = await PortalToken.findOne({ token: portalToken }).lean();
    if (!record || record.revoked) throw new Error('This portal link is no longer valid.');
    if (new Date(record.expiresAt).getTime() < Date.now()) throw new Error('This portal link has expired.');
    const user: any = await User.findById(record.userId).select('name role active customerId').lean();
    if (!user || user.active === false) throw new Error('This portal account is no longer active.');
    return {
      userId: String(user._id),
      name: user.name,
      role: Role.CUSTOMER,
      customerId: String(record.customerId),
      quotationId: String(record.quotationId),
    };
  }

  if (!bearer) throw new Error('A token is required to open a realtime connection.');

  const payload = jwt.verify(bearer, env.jwtSecret) as JwtPayload;
  const account: any = await User.findById(payload.sub).select('name role active customerId').lean();
  if (!account || account.active === false) throw new Error('Your account is no longer active.');
  return {
    userId: String(account._id),
    name: account.name,
    role: account.role,
    customerId: account.customerId ? String(account.customerId) : undefined,
  };
}

/** Every room this identity is entitled to, decided once. */
function roomsFor(id: SocketIdentity): string[] {
  const rooms = [SocketRoom.user(id.userId), SocketRoom.role(id.role)];
  if (id.role === Role.CUSTOMER) {
    if (id.customerId) rooms.push(SocketRoom.customer(id.customerId));
    // A magic-link session lands straight in its one quotation's room, so the
    // portal is live the moment it opens without asking to subscribe.
    if (id.quotationId) rooms.push(SocketRoom.quotation(id.quotationId));
  } else {
    rooms.push(SocketRoom.internal);
  }
  return rooms;
}

/**
 * May this socket watch this quotation?
 *
 * Internal users may watch any quotation — they can already open it over REST.
 * A customer may watch only their own company's, and a magic-link session only
 * the single quotation its link was minted for. This is the same rule
 * `assertPortalScope` enforces on the REST side, and it exists here for the
 * same reason: guessing an id must not be a way in.
 */
async function mayWatchQuotation(id: SocketIdentity, quotationId: string): Promise<boolean> {
  if (id.role !== Role.CUSTOMER) return true;
  if (id.quotationId) return id.quotationId === quotationId;
  if (!id.customerId) return false;
  const quotation: any = await Quotation.findById(quotationId).select('customerId').lean();
  return !!quotation && String(quotation.customerId) === id.customerId;
}

/**
 * Start realtime on an existing HTTP server. Safe to call once; a second call
 * returns the server already running.
 */
export function initRealtime(httpServer: HttpServer): RealtimeServer {
  if (io) return io;

  io = new Server(httpServer, {
    path: SOCKET_PATH,
    serveClient: false,
    cors: {
      origin: env.webOrigin === '*' ? true : env.webOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    },
    // A tab that goes to sleep should reconnect, not be treated as gone the
    // instant it stops answering.
    pingTimeout: 25_000,
    pingInterval: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      socket.data = await identify(socket);
      next();
    } catch (err) {
      next(new Error((err as Error).message || 'Realtime authentication failed.'));
    }
  });

  io.on('connection', async (socket) => {
    const id = socket.data;
    const rooms = roomsFor(id);
    await socket.join(rooms);

    const ready: RealtimeReadyPayload = {
      userId: id.userId,
      role: id.role,
      customerId: id.customerId,
      quotationId: id.quotationId,
      rooms,
      serverTime: new Date().toISOString(),
    };
    socket.emit(SocketEvent.READY, ready);

    // Opening a quotation asks to watch it; closing it stops. Rooms are cheap,
    // but a rep with twenty tabs should not receive twenty deals' worth of
    // traffic for the one they are reading.
    socket.on(SocketEvent.SUBSCRIBE_QUOTATION, async (quotationId: unknown, ack?: (ok: boolean) => void) => {
      const target = String(quotationId ?? '');
      if (!target) return ack?.(false);
      if (!(await mayWatchQuotation(id, target))) return ack?.(false);
      await socket.join(SocketRoom.quotation(target));
      ack?.(true);
    });

    socket.on(SocketEvent.UNSUBSCRIBE_QUOTATION, async (quotationId: unknown) => {
      const target = String(quotationId ?? '');
      // The room a magic link was joined to at connect time is the session
      // itself — leaving it would silently deafen the portal.
      if (!target || target === id.quotationId) return;
      await socket.leave(SocketRoom.quotation(target));
    });

    socket.on('error', (err) => log.warn(`realtime socket error (${id.name}): ${String(err)}`));
  });

  log.ok(`Realtime listening on ${SOCKET_PATH}`);
  return io;
}

/** Stop realtime and drop every connection. Used by tests and by a clean shutdown. */
export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => io!.close(() => resolve()));
  io = null;
}
