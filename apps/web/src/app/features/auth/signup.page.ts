import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { APP_NAME, Role, ROLE_LABEL, type AuthSessionDto, type CustomerDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/state/session.store';
import { ToastStore } from '../../core/state/toast.store';

/**
 * Screen 1 (signup half).
 * An internal signup picks a team/role; a customer signup must pick the company
 * they belong to, because a portal account is scoped to exactly one customer.
 */
@Component({
  selector: 'df-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-2.5">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">DF</span>
          <p class="text-lg font-semibold tracking-tight text-slate-900">{{ appName }}</p>
        </div>

        <h1 class="df-h1">Create an account</h1>
        <p class="df-muted mt-1">Internal accounts open the sales workspace. A customer account only ever sees its own quotations.</p>

        <form class="mt-6 space-y-4" (ngSubmit)="submit()">
          <label class="block">
            <span class="df-label">Full name</span>
            <input class="df-input" name="name" [(ngModel)]="name" required />
          </label>
          <label class="block">
            <span class="df-label">Email</span>
            <input class="df-input" type="email" name="email" [(ngModel)]="email" required />
          </label>
          <label class="block">
            <span class="df-label">Password</span>
            <input class="df-input" type="password" name="password" [(ngModel)]="password" required minlength="6" />
          </label>
          <label class="block">
            <span class="df-label">Team</span>
            <select class="df-input" name="role" [(ngModel)]="role">
              @for (r of roles; track r) { <option [value]="r">{{ label(r) }}</option> }
            </select>
          </label>
          @if (role === customerRole) {
            <label class="block">
              <span class="df-label">Company</span>
              <select class="df-input" name="customerId" [(ngModel)]="customerId" required>
                <option value="">Select your company…</option>
                @for (c of customers(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
              <span class="mt-1 block text-xs text-slate-400">Your account will only ever be able to open this company's quotations.</span>
            </label>
          }
          <button type="submit" class="df-btn-primary w-full" [disabled]="busy()">{{ busy() ? 'Creating…' : 'Create account' }}</button>
        </form>

        <p class="mt-6 text-sm text-slate-500">
          Already have an account? <a routerLink="/login" class="font-medium text-brand-600 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  `,
})
export class SignupPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastStore);
  private readonly router = inject(Router);

  protected readonly appName = APP_NAME;
  protected readonly customerRole = Role.CUSTOMER;
  protected readonly roles = [Role.SALES_REP, Role.SALES_MANAGER, Role.FINANCE, Role.ADMIN, Role.CUSTOMER];
  protected readonly customers = signal<CustomerDto[]>([]);
  protected readonly busy = signal(false);

  name = '';
  email = '';
  password = '';
  role: Role = Role.SALES_REP;
  customerId = '';

  label(role: Role): string { return ROLE_LABEL[role]; }

  async ngOnInit(): Promise<void> {
    try {
      this.customers.set(await firstValueFrom(this.api.get<CustomerDto[]>('/customers')));
    } catch { /* customer list is only needed for the CUSTOMER branch */ }
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.post<AuthSessionDto>('/auth/signup', {
          name: this.name, email: this.email, password: this.password,
          role: this.role, customerId: this.role === Role.CUSTOMER ? this.customerId : undefined,
        }),
      );
      await this.session.login(this.email, this.password);
      this.toast.success('Account created', `Welcome, ${this.name}.`);
      await this.router.navigateByUrl(this.session.landingRoute());
    } catch { /* interceptor toasted it */ } finally {
      this.busy.set(false);
    }
  }
}
