import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  NOTIFICATION_ICON,
  NOTIFICATION_SEVERITY,
  type NotificationDto,
  type NotificationSeverity,
} from '@dealflow/shared';
import { NotificationStore } from '../../core/state/feature.stores';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AgoPipe } from '../pipes/date.pipes';
import { EmptyStateComponent } from './empty-state.component';

/**
 * The header notification centre (P2 #35). A bell with an unread badge; the
 * panel lists the signed-in user's nudges and escalations, each linking to the
 * deal it concerns and marking itself read on the way. "Mark all read" clears
 * the badge in one call.
 *
 * The list arrives over the socket, so the badge moves while the user is
 * looking at it. `load()` still runs on open — a socket that dropped and came
 * back missed whatever happened in between, and the panel is the one place that
 * has to be right when someone is reading it.
 *
 * The dot beside the header tells you whether that is currently true: green
 * while the socket is live, amber while it is reconnecting. Without it, a dead
 * connection and a quiet afternoon look identical.
 */
@Component({
  selector: 'df-notification-bell',
  standalone: true,
  imports: [AgoPipe, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'open.set(false)' },
  template: `
    <div class="relative">
      <button
        type="button"
        class="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-slate-800"
        [attr.aria-label]="
          'Notifications' + (store.unreadCount() ? ', ' + store.unreadCount() + ' unread' : '')
        "
        (click)="toggle()"
      >
        <span aria-hidden="true" class="text-lg">🔔</span>
        @if (store.unreadCount() > 0) {
          <span class="absolute -right-0.5 -top-0.5 flex min-w-4">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60"></span>
            <span
              class="relative flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white"
            >
              {{ store.unreadCount() > 9 ? '9+' : store.unreadCount() }}
            </span>
          </span>
        }
      </button>

      @if (open()) {
        <div class="fixed inset-0 z-40" (click)="open.set(false)"></div>
        <div
          class="df-scale-in absolute right-0 z-50 mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p class="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              Notifications
              <span
                class="h-1.5 w-1.5 rounded-full"
                [class.bg-emerald-500]="realtime.isLive()"
                [class.bg-amber-400]="!realtime.isLive()"
                [attr.title]="realtime.isLive() ? 'Live' : 'Reconnecting…'"
              ></span>
            </p>
            @if (store.unreadCount() > 0) {
              <button
                type="button"
                class="text-xs font-medium text-brand-600 hover:text-brand-700"
                (click)="markAll()"
              >
                Mark all read
              </button>
            }
          </div>

          <div class="max-h-96 overflow-y-auto">
            @if (store.loading() && store.items().length === 0) {
              <p class="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
            } @else if (store.items().length === 0) {
              <df-empty-state
                icon="🔔"
                title="You're all caught up"
                body="Nudges and escalations on your deals show up here."
              />
            } @else {
              <ul class="divide-y divide-slate-100">
                @for (n of store.items(); track n.id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-slate-50"
                      [class.bg-brand-50]="!n.read"
                      (click)="openNotification(n)"
                    >
                      <span class="flex items-start gap-2">
                        <span aria-hidden="true" class="mt-0.5 text-sm leading-none">{{ icon(n) }}</span>
                        <span class="flex-1 text-sm font-medium text-slate-800">{{ n.title }}</span>
                        @if (!n.read) {
                          <span
                            class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                            [class]="dotClass(n)"
                          ></span>
                        }
                      </span>
                      <span class="pl-6 text-xs leading-snug text-slate-500">{{ n.body }}</span>
                      <span class="pl-6 text-[11px] text-slate-400">{{ n.createdAt | ago }}</span>
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationBellComponent implements OnInit {
  protected readonly store = inject(NotificationStore);
  protected readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  protected readonly open = signal(false);

  /** The emoji for the notification's type. Rows written before typing fall back. */
  protected icon(n: NotificationDto): string {
    return NOTIFICATION_ICON[n.type] ?? '🔔';
  }

  /** Unread dot, tinted by how much the notification wants attention. */
  protected dotClass(n: NotificationDto): string {
    const severity: NotificationSeverity = n.severity ?? NOTIFICATION_SEVERITY[n.type] ?? 'INFO';
    return {
      CRITICAL: 'bg-rose-600',
      WARNING: 'bg-amber-500',
      SUCCESS: 'bg-emerald-500',
      INFO: 'bg-brand-600',
    }[severity];
  }

  ngOnInit(): void {
    void this.store.load();
  }

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) void this.store.load();
  }

  markAll(): void {
    void this.store.markAllRead();
  }

  openNotification(n: NotificationDto): void {
    if (!n.read) void this.store.markRead(n.id);
    this.open.set(false);
    if (n.link) void this.router.navigateByUrl(n.link);
  }
}
