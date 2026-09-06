import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { APP_NAME, ROLE_LABEL } from '@dealflow/shared';
import { SessionStore } from '../core/state/session.store';
// Notification bell hidden for now — see df-notification-bell usage below.
// import { NotificationBellComponent } from '../shared/ui/notification-bell.component';

/**
 * The internal workspace shell. Top navigation is exactly the mockup's:
 * Dashboard · Quotations · Approvals · Fulfillment · Subscriptions · Invoices ·
 * Deal Health · Reports · Products — filtered to what the signed-in role may open.
 *
 * The "Back-end" shortcut beside the bell is Admin-only. Hiding it is a
 * convenience, not a boundary: `roleGuard` on `/admin` is what actually refuses
 * everyone else, and it still does whether or not the link is on screen.
 */
@Component({
  selector: 'df-internal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive /*, NotificationBellComponent */],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-50">
      <header class="df-glass sticky top-0 z-40 border-b">
        <div class="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
          <a routerLink="/app/dashboard" class="flex shrink-0 items-center gap-2">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-sm shadow-brand-600/30"
              >DF</span
            >
            <span class="text-base font-semibold tracking-tight text-slate-900">{{ appName }}</span>
          </a>

          <nav class="df-scroll-x flex-1">
            <ul class="flex items-center gap-1">
              @for (item of session.nav(); track item.route) {
                <li>
                  <a
                    [routerLink]="item.route"
                    routerLinkActive="bg-brand-50 text-brand-700"
                    class="block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-all duration-150 hover:bg-slate-900/5 hover:text-slate-900"
                    >{{ item.label }}</a
                  >
                </li>
              }
            </ul>
          </nav>

          <div class="flex shrink-0 items-center gap-3">
            @if (session.isAdmin()) {
              <a
                routerLink="/admin/config"
                class="hidden text-sm text-slate-500 hover:text-slate-800 md:inline"
                >Back-end</a
              >
            }
            <!-- <df-notification-bell /> -->
            <div class="flex items-center gap-2">
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-2 ring-white/80"
                >{{ session.initials() }}</span
              >
              <div class="hidden leading-tight sm:block">
                <p class="text-sm font-medium text-slate-800">{{ session.user()?.name }}</p>
                <p class="text-[11px] text-slate-500">{{ roleLabel() }}</p>
              </div>
            </div>
            <button
              type="button"
              class="df-btn-ghost !px-2.5 !py-1.5 text-xs"
              (click)="session.logout()"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-[1600px] px-6 py-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class InternalShellComponent {
  protected readonly session = inject(SessionStore);
  protected readonly appName = APP_NAME;
  roleLabel(): string {
    const role = this.session.role();
    return role ? ROLE_LABEL[role] : '';
  }
}
