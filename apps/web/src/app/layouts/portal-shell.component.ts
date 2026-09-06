import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from '../core/state/session.store';

/**
 * The customer portal shell — a deliberately different surface.
 * Three items, no internal navigation, no way back into the workspace. A
 * customer signed in here can reach their own company's quotations and nothing else.
 */
@Component({
  selector: 'df-portal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white">
      <header class="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div class="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div class="flex items-center gap-2.5">
            <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">DF</span>
            <div class="leading-tight">
              <p class="text-sm font-semibold text-slate-900">Your quotations</p>
              <p class="text-xs text-slate-500">Shared with you by your account manager</p>
            </div>
          </div>
          @if (session.user()?.name && session.user()?.name !== 'Guest') {
            <div class="text-right leading-tight">
              <p class="text-sm font-medium text-slate-800">{{ session.user()?.name }}</p>
              <button type="button" class="text-xs text-slate-500 hover:text-slate-800" (click)="session.logout()">Sign out</button>
            </div>
          }
        </div>
        <nav class="mx-auto max-w-4xl px-6">
          <ul class="flex gap-1">
            @for (item of nav; track item.route) {
              <li>
                <a [routerLink]="item.route" routerLinkActive="border-slate-900 text-slate-900"
                   class="block border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-500 transition-all duration-150 hover:text-slate-800">{{ item.label }}</a>
              </li>
            }
          </ul>
        </nav>
      </header>
      <main class="mx-auto max-w-4xl px-6 py-8"><router-outlet /></main>
      <footer class="mx-auto max-w-4xl px-6 pb-10 text-xs text-slate-400">
        This page is a live document. Anything you propose here reaches your account manager immediately.
      </footer>
    </div>
  `,
})
export class PortalShellComponent {
  protected readonly session = inject(SessionStore);
  protected readonly nav = [
    { label: 'My Quotations', route: '/portal/quotations' },
    { label: 'Messages', route: '/portal/messages' },
    { label: 'Profile', route: '/portal/profile' },
  ];
}
