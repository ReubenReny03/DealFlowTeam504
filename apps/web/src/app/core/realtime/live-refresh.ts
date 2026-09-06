import { DestroyRef, assertInInjectionContext, effect, inject, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { auditTime, filter, merge } from 'rxjs';
import type { RealtimeEnvelope, SocketEvent } from '@dealflow/shared';
import { RealtimeService } from './realtime.service';

/** How long to gather events before reloading. One burst, one refetch. */
const BURST_MS = 250;

export interface LiveRefreshOptions {
  /** Only refresh when the event concerns this thing (a quotation id, say). */
  when?: (payload: RealtimeEnvelope & Record<string, unknown>) => boolean;
  /**
   * Refresh even when this session caused the event. Off by default: the page
   * that fired the mutation already reloaded from the response, and refetching
   * again would throw away a form the user has since started typing into.
   */
  includeOwnActions?: boolean;
  /** Widen or narrow the burst window (ms). */
  burstMs?: number;
}

/**
 * Re-run a page's own `load()` whenever the server says the thing it is showing
 * changed.
 *
 * This is deliberately a REFETCH, not a patch. The socket carries "X changed",
 * never a whole document, so the screen re-reads it over REST and stays exactly
 * as correct as it was on first load — with the role scoping, the pagination
 * and the derived counts the endpoint already applies. Patching from a socket
 * payload would mean maintaining a second, subtly different copy of every
 * screen's shaping logic.
 *
 * Three behaviours are worth knowing:
 *
 *   - **Bursts collapse.** One customer counter-offer writes several negotiation
 *     events; `auditTime` turns that into one reload rather than five.
 *   - **Your own actions are ignored** unless you ask for them, because the
 *     response you already applied is newer than the echo.
 *   - **It unsubscribes with the component.** `takeUntilDestroyed` needs an
 *     injection context, which is why this must be called from a field
 *     initialiser or a constructor.
 */
export function liveRefresh(
  events: Array<SocketEvent | string>,
  reload: () => void,
  options: LiveRefreshOptions = {},
): void {
  assertInInjectionContext(liveRefresh);
  const realtime = inject(RealtimeService);
  const destroyRef = inject(DestroyRef);

  merge(...events.map((e) => realtime.on<RealtimeEnvelope & Record<string, unknown>>(e)))
    .pipe(
      filter((payload) => {
        if (!options.includeOwnActions) {
          const me = realtime.identity()?.userId;
          if (me && payload.actorId === me) return false;
        }
        return options.when ? options.when(payload) : true;
      }),
      auditTime(options.burstMs ?? BURST_MS),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe(() => reload());
}

/**
 * Join a quotation's room for as long as the component lives.
 *
 * A rep is entitled to any quotation, but only receives the one they are
 * reading — the room is the subscription. The id arrives asynchronously (the
 * route resolves, then the page loads), so this takes a SIGNAL and re-joins
 * whenever it settles on a different quotation, leaving the previous room
 * behind. The portal's magic-link session is already in its own quotation's
 * room from the handshake, so calling this there is simply a no-op re-join.
 */
export function watchQuotation(quotationId: Signal<string | null | undefined>): void {
  assertInInjectionContext(watchQuotation);
  const realtime = inject(RealtimeService);
  const destroyRef = inject(DestroyRef);
  let stop: (() => void) | null = null;
  let watching: string | null = null;

  effect(() => {
    const id = quotationId() ?? null;
    if (id === watching) return;
    stop?.();
    stop = null;
    watching = id;
    if (id) stop = realtime.watchQuotation(id);
  });

  destroyRef.onDestroy(() => stop?.());
}
