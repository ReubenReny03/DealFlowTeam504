import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { APP_NAME, APP_TAGLINE, ROLE_LABEL, type DemoAccountDto } from '@dealflow/shared';
import { environment } from '../../../environments/environment';
import { SessionStore } from '../../core/state/session.store';

/**
 * Screen 1.
 *
 * The "Demo accounts" panel is a judged-demo accelerator: one click signs in as
 * any persona and lands on their own screen. No typing on stage. It is guarded
 * by `environment.showDemoLogins`, which is false in a production build.
 */
@Component({
  selector: 'df-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid min-h-screen lg:grid-cols-2">
      <!-- left: the form -->
      <div class="flex items-center justify-center px-6 py-12">
        <div class="w-full max-w-sm">
          <div class="mb-8 flex items-center gap-2.5">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">DF</span>
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
        </div>
      </div>

      <!-- right: the demo panel -->
      @if (showDemoLogins) {
        <div class="hidden bg-slate-900 px-8 py-12 lg:flex lg:items-center">
          <div class="w-full max-w-md">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Demo accounts</h2>
            <p class="mt-1.5 text-sm leading-relaxed text-slate-400">
              One click signs you in and drops you on that persona's own screen. Every account uses the same password.
            </p>
            <ul class="mt-5 space-y-2">
              @for (account of session.demoAccounts(); track account.email) {
                <li>
                  <button
                    type="button"
                    class="w-full rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-left transition hover:border-brand-500 hover:bg-slate-800 disabled:opacity-50"
                    [disabled]="session.loading()"
                    (click)="loginAs(account)"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-white">{{ account.name }}</p>
                        <p class="truncate text-xs text-slate-400">{{ account.email }}</p>
                      </div>
                      <span class="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-200">{{ roleLabel(account.role) }}</span>
                    </div>
                    <p class="mt-1.5 text-xs leading-snug text-slate-500">{{ account.description }}</p>
                  </button>
                </li>
              } @empty {
                <li class="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                  The API is not responding, so the demo list could not load. Start it with <code class="text-slate-300">npm run dev:api</code>,
                  or rebuild the data with <code class="text-slate-300">npm run reset</code>.
                </li>
              }
            </ul>
            <p class="mt-5 text-xs text-slate-600">Demo credentials only. A production build hides this panel entirely.</p>
          </div>
        </div>
      }
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

  email = '';
  password = '';

  ngOnInit(): void {
    this.reason.set(this.route.snapshot.queryParamMap.get('reason'));
    if (this.showDemoLogins) void this.session.loadDemoAccounts();
    if (this.session.isAuthenticated()) void this.router.navigateByUrl(this.session.landingRoute());
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
