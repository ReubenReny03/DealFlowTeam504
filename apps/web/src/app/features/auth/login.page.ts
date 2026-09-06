import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { APP_NAME, APP_TAGLINE, ROLE_LABEL, type DemoAccountDto } from '@dealflow/shared';
import { environment } from '../../../environments/environment';
import { SessionStore } from '../../core/state/session.store';

/**
 * Screen 1.
 *
 * A real user signs in with their own email and password — that is the whole
 * job of this screen, so the sign-in card is centered and full-weight on it.
 *
 * "Demo accounts" is a judged-demo accelerator, not a product feature (it is
 * false, and the server refuses to list the accounts, in a production build),
 * so it stays fully collapsed until the small tab on the card's edge is
 * clicked, then slides out to the right as its own glass panel. The panel
 * stays mounted the whole time and only its size/opacity change, so it
 * animates smoothly in both directions rather than popping in and cutting
 * straight to nothing on close.
 */
@Component({
  selector: 'df-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-6 py-12">
      <!-- ambient light, purely decorative — gives the glass panel something to actually refract -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div class="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-brand-200/50 blur-3xl"></div>
        <div class="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-brand-300/40 blur-3xl"></div>
        <div class="absolute right-1/3 top-1/4 h-64 w-64 rounded-full bg-sky-200/30 blur-3xl"></div>
      </div>

      <div class="relative flex items-start">
        <!-- the sign-in card: the primary, always-full-weight surface -->
        <div class="w-[22rem] shrink-0">
          <div class="mb-8 flex items-center gap-2.5">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white shadow-sm shadow-brand-600/30">DF</span>
            <div>
              <p class="text-lg font-semibold tracking-tight text-slate-900">{{ appName }}</p>
              <p class="text-xs text-slate-500">{{ tagline }}</p>
            </div>
          </div>

          @if (reason() === 'expired') {
            <p class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Your session ended. Please sign in again.</p>
          }
          @if (reason() === 'portal') {
            <p class="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              That quotation link needs a customer sign-in. Use your portal account, or ask your account manager for a fresh link.
            </p>
          }

          <div class="df-card relative p-8 shadow-xl shadow-slate-900/[0.06]">
            <div class="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400"></div>

            <h1 class="df-h1">Sign in</h1>
            <p class="df-muted mt-1">Internal users reach the sales workspace; customers reach their own quotation.</p>

            <form class="mt-6 space-y-4" (ngSubmit)="submit()">
              <label class="block">
                <span class="df-label">Email</span>
                <input class="df-input" type="email" name="email" autocomplete="username" [(ngModel)]="email" required />
              </label>
              <label class="block">
                <span class="df-label">Password</span>
                <input class="df-input" type="password" name="password" autocomplete="current-password" [(ngModel)]="password" required />
              </label>

              @if (session.error()) {
                <p class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ session.error() }}</p>
              }

              <button type="submit" class="df-btn-primary w-full" [disabled]="session.loading() || !email || !password">
                {{ session.loading() ? 'Signing in…' : 'Sign in' }}
              </button>
            </form>

            <p class="mt-6 text-sm text-slate-500">
              Accounts are issued by an administrator — there is no self-service signup. Ask yours to
              add you on the Users screen.
            </p>

            @if (showDemoLogins) {
              <!-- the one and only affordance for the demo panel: a small edge tab, not a competing block -->
              <button
                type="button"
                class="absolute -right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-md shadow-slate-900/10 transition-all duration-300 hover:border-brand-300 hover:text-brand-600"
                [class.rotate-180]="demosOpen()"
                [attr.aria-expanded]="demosOpen()"
                title="Demo accounts"
                aria-label="Toggle demo accounts"
                (click)="toggleDemos()"
              >
                ›
              </button>
            }
          </div>
        </div>

        <!-- the demo drawer: mounted at all times, purely a size/opacity transition so it
             glides open AND closed instead of appearing/disappearing instantly -->
        @if (showDemoLogins) {
          <div
            class="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            [class]="demosOpen() ? 'ml-5 w-80 opacity-100' : 'ml-0 w-0 opacity-0'"
            [class.pointer-events-none]="!demosOpen()"
            [attr.aria-hidden]="!demosOpen()"
          >
            <div class="w-80 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts</p>
              <p class="mt-1.5 text-xs leading-relaxed text-slate-500">
                One click signs you in and drops you on that persona's own screen. Every account uses the same password.
              </p>
              <ul class="df-scroll-y mt-3 max-h-[26rem] space-y-1.5 pr-1">
                @for (account of session.demoAccounts(); track account.email) {
                  <li>
                    <button
                      type="button"
                      [tabIndex]="demosOpen() ? 0 : -1"
                      class="w-full rounded-lg border border-white/60 bg-white/60 p-2.5 text-left transition-all duration-150 hover:border-brand-300 hover:bg-white disabled:opacity-50"
                      [disabled]="session.loading()"
                      (click)="loginAs(account)"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <p class="truncate text-sm font-medium text-slate-800">{{ account.name }}</p>
                        <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{{ roleLabel(account.role) }}</span>
                      </div>
                      <p class="truncate text-xs text-slate-400">{{ account.email }}</p>
                      <p class="mt-1 line-clamp-1 text-[11px] leading-snug text-slate-400">{{ account.description }}</p>
                    </button>
                  </li>
                } @empty {
                  @if (demosLoading()) {
                    <li class="df-skeleton h-16"></li>
                    <li class="df-skeleton h-16"></li>
                    <li class="df-skeleton h-16"></li>
                  } @else {
                    <li class="rounded-lg border border-dashed border-slate-300 bg-white/60 p-3 text-xs leading-relaxed text-slate-500">
                      The API is not responding, so the demo list could not load. Start it with <code class="text-slate-700">npm run dev:api</code>,
                      or rebuild the data with <code class="text-slate-700">npm run reset</code>.
                    </li>
                  }
                }
              </ul>
              <p class="mt-3 text-[11px] text-slate-400">Demo credentials only. A production build hides this panel entirely.</p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class LoginPage implements OnInit {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly appName = APP_NAME;
  protected readonly tagline = APP_TAGLINE;
  protected readonly showDemoLogins = environment.showDemoLogins;
  protected readonly reason = signal<string | null>(null);

  protected readonly demosOpen = signal(false);
  protected readonly demosLoading = signal(false);

  email = '';
  password = '';

  ngOnInit(): void {
    this.reason.set(this.route.snapshot.queryParamMap.get('reason'));
    if (this.session.isAuthenticated()) void this.router.navigateByUrl(this.session.landingRoute());
  }

  async toggleDemos(): Promise<void> {
    const next = !this.demosOpen();
    this.demosOpen.set(next);
    if (next && this.session.demoAccounts().length === 0) {
      this.demosLoading.set(true);
      try {
        await this.session.loadDemoAccounts();
      } finally {
        this.demosLoading.set(false);
      }
    }
  }

  roleLabel(role: string): string {
    return ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role;
  }

  async submit(): Promise<void> {
    try {
      await this.session.login(this.email, this.password);
      await this.go();
    } catch { /* the store surfaced the message */ }
  }

  async loginAs(account: DemoAccountDto): Promise<void> {
    this.email = account.email;
    this.password = account.password;
    await this.submit();
  }

  private async go(): Promise<void> {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    // An account still on the password somebody else typed is offered the chance
    // to pick its own first; wherever it was headed is carried through.
    if (this.session.mustChangePassword()) {
      await this.router.navigate(['/change-password'], {
        queryParams: redirect ? { redirect } : {},
      });
      return;
    }
    await this.router.navigateByUrl(redirect ?? this.session.landingRoute());
  }
}
