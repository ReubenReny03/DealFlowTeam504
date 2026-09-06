import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_AUTH_PORTAL_TOKEN,
  SOCKET_AUTH_TOKEN,
  SOCKET_PATH,
  SocketEvent,
  type RealtimeReadyPayload,
} from '@dealflow/shared';
import { environment } from '../../../environments/environment';
import { SessionStore } from '../state/session.store';

/** What the connection indicator in the header shows. */
export type RealtimeStatus = 'offline' | 'connecting' | 'live';

interface Frame {
  event: string;
  payload: unknown;
}

/**
 * The app's single socket.
 *
 * One connection per tab, shared by every store and page. Stores do not each
 * open their own — a socket is a scarce, stateful thing, and twenty of them
 * would mean twenty handshakes, twenty room joins, and twenty chances to leak.
 *
 * The connection follows the SESSION, not the router: an `effect` watches the
 * token, so signing in connects, signing out disconnects, and swapping accounts
 * reconnects under the new identity. That last one matters — a socket
 * authenticated as the previous user would keep receiving their notifications.
 *
 * Everything arriving is funnelled through one Subject and handed out as typed
 * observables by `on()`. Reconnection, backoff and buffering are socket.io's
 * job; this file deliberately does not reimplement any of it.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly session = inject(SessionStore);
  private readonly destroyRef = inject(DestroyRef);

  private socket: Socket | null = null;
  private readonly frames = new Subject<Frame>();
  /** The credential the live socket was opened with, so we only reconnect on a real change. */
  private connectedWith: string | null = null;

  readonly status = signal<RealtimeStatus>('offline');
  readonly identity = signal<RealtimeReadyPayload | null>(null);
  /** The last connection error, for the indicator's tooltip. */
  readonly lastError = signal<string | null>(null);
  readonly isLive = computed(() => this.status() === 'live');

  constructor() {
    // Mock mode answers HTTP from fixtures; there is no server to hold a socket
    // open, so realtime stays off rather than retrying forever in the console.
    if (!environment.useMocks) {
      effect(
        () => {
          const jwt = this.session.token();
          const portalToken = this.session.portalToken();
          const credential = portalToken ? `portal:${portalToken}` : jwt ? `jwt:${jwt}` : null;
          if (credential === this.connectedWith) return;
          this.connectedWith = credential;
          this.disconnect();
          if (credential) this.connect(jwt, portalToken);
        },
        // Connecting moves `status` and `identity`, which is a signal write from
        // inside an effect. Angular requires that to be declared rather than
        // inferred — without this the effect throws NG0600 and the socket never
        // opens at all.
        { allowSignalWrites: true },
      );
    }
    this.destroyRef.onDestroy(() => this.disconnect());
  }

  /**
   * Every occurrence of one event, typed.
   *
   * Callers get a plain observable and are expected to take it through
   * `takeUntilDestroyed` — a page listening after it has been closed is the one
   * leak this design can still have.
   */
  on<T>(event: SocketEvent | string): Observable<T> {
    return this.frames.pipe(
      filter((f) => f.event === event),
      map((f) => f.payload as T),
    );
  }

  /**
   * Watch one quotation. The server refuses a quotation this session may not
   * read, so a `false` acknowledgement is an authorisation answer, not an error.
   * Returns a teardown to call when the page closes.
   */
  watchQuotation(quotationId: string): () => void {
    if (!quotationId) return () => undefined;
    this.socket?.emit(SocketEvent.SUBSCRIBE_QUOTATION, quotationId);
    return () => this.socket?.emit(SocketEvent.UNSUBSCRIBE_QUOTATION, quotationId);
  }

  private connect(jwt: string | null, portalToken: string | null): void {
    this.status.set('connecting');
    this.lastError.set(null);

    const socket = io(socketOrigin(), {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      auth: {
        [SOCKET_AUTH_TOKEN]: jwt ?? undefined,
        [SOCKET_AUTH_PORTAL_TOKEN]: portalToken ?? undefined,
      },
      // A demo laptop that sleeps should come back live on its own.
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      timeout: 10_000,
    });

    socket.on('connect', () => this.status.set('connecting'));
    socket.on(SocketEvent.READY, (payload: RealtimeReadyPayload) => {
      this.identity.set(payload);
      this.status.set('live');
    });
    socket.on('disconnect', () => this.status.set('connecting'));
    socket.on('connect_error', (err: Error) => {
      this.lastError.set(err.message);
      // An auth failure is terminal — retrying a rejected token just loops. Any
      // other failure is the network, which socket.io should keep retrying.
      if (/token|account|link|authentication/i.test(err.message)) {
        this.status.set('offline');
        socket.disconnect();
      }
    });

    // One catch-all listener instead of one per event: a new event type on the
    // server needs no change here, only a caller for `on()`.
    socket.onAny((event: string, payload: unknown) => this.frames.next({ event, payload }));

    this.socket = socket;
  }

  private disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.identity.set(null);
    this.status.set('offline');
  }
}

/**
 * The socket lives on the API's ORIGIN, not under its base path — `/api/v1` is
 * a REST prefix and the socket has its own (`SOCKET_PATH`). In production the
 * app is served from the same origin, so an empty string is correct there.
 */
function socketOrigin(): string {
  const base = environment.apiBase;
  if (!/^https?:\/\//i.test(base)) return window.location.origin;
  return new URL(base).origin;
}
