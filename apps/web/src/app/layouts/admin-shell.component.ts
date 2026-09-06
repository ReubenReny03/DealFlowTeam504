import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from '../core/state/session.store';

/** The configuration area: products, price lists, warehouses, plans, governance. */
@Component({
  selector: 'df-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-50">
      <header class="df-glass-dark sticky top-0 z-40 border-b text-white">
        <div class="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
          <a routerLink="/admin/products" class="flex shrink-0 items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-slate-900 shadow-sm">DF</span>
            <span class="text-base font-semibold tracking-tight">Sales Back-end</span>
          </a>
          <nav class="df-scroll-x flex-1">
            <ul class="flex items-center gap-1">
              @for (item of nav(); track item.route) {
                <li>
                  <a [routerLink]="item.route" routerLinkActive="bg-white/15 text-white"
                     class="block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 transition-all duration-150 hover:bg-white/10 hover:text-white">{{ item.label }}</a>
                </li>
              }
            </ul>
          </nav>
          <a routerLink="/app/dashboard" class="df-btn !border-slate-700 !bg-slate-800 !px-3 !py-1.5 text-xs text-slate-200 hover:!bg-slate-700">Open sales workspace</a>
          <button type="button" class="text-xs text-slate-400 hover:text-white" (click)="session.logout()">Sign out</button>
        </div>
      </header>
      <main class="mx-auto max-w-[1600px] px-6 py-6"><router-outlet /></main>
    </div>
  `,
})
export class AdminShellComponent {
  protected readonly session = inject(SessionStore);

  /**
   * A Sales Manager reaches the back-end for the catalogue, but accounts are
   * Admin-only — the route guards it and the tab does not offer it either.
   */
  protected readonly nav = computed(() => [
    { label: 'Products', route: '/admin/products' },
    { label: 'Price Lists', route: '/admin/pricelists' },
    { label: 'Warehouses', route: '/admin/warehouses' },
    { label: 'Subscription Plans', route: '/admin/plans' },
    { label: 'Discount Tiers & Approvals', route: '/admin/config' },
    ...(this.session.isAdmin() ? [{ label: 'Users', route: '/admin/users' }] : []),
  ]);
}
