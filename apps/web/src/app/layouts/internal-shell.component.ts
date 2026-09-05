import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { APP_NAME, ROLE_LABEL } from '@dealflow/shared';
import { SessionStore } from '../core/state/session.store';

/**
 * The internal workspace shell. Top navigation is exactly the mockup's:
 * Dashboard · Quotations · Approvals · Fulfillment · Subscriptions · Invoices ·
 * Deal Health · Reports · Products — filtered to what the signed-in role may open.
 */
@Component({
  selector: 'df-internal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-50">
      <header class="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
          <a routerLink="/app/dashboard" class="flex shrink-0 items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">DF</span>
            <span class="text-base font-semibold tracking-tight text-slate-900">{{ appName }}</span>
          </a>

          <nav class="df-scroll-x flex-1">
            <ul class="flex items-center gap-1">
              @for (item of session.nav(); track item.route) {
                <li>
                  <a
                    [routerLink]="item.route"
                    routerLinkActive="bg-brand-50 text-brand-700"
                    class="block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >{{ item.label }}</a>
                </li>
              }
            </ul>
          </nav>

          <div class="flex shrink-0 items-center gap-3">
            <a routerLink="/admin/config" class="hidden text-sm text-slate-500 hover:text-slate-800 md:inline">Back-end</a>
            <div class="flex items-center gap-2">
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{{ session.initials() }}</span>
              <div class="hidden leading-tight sm:block">
                <p class="text-sm font-medium text-slate-800">{{ session.user()?.name }}</p>
                <p class="text-[11px] text-slate-500">{{ roleLabel() }}</p>
              </div>
            </div>
            <button type="button" class="df-btn-ghost !px-2.5 !py-1.5 text-xs" (click)="session.logout()">Sign out</button>
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
