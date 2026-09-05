import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { APP_NAME, type ChangePasswordRequest, type UserDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/state/session.store';
import { ToastStore } from '../../core/state/toast.store';

/**
 * Set your own password.
 *
 * Offered straight after a first sign-in, because the password on a new account
 * was typed by whoever created it. It is an offer, not a wall: **Skip for now**
 * goes on to the workspace and leaves the flag set, so the prompt comes back next
 * time rather than nagging in the middle of a demo.
 */
@Component({
  selector: 'df-change-password',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-2.5">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">DF</span>
          <p class="text-lg font-semibold tracking-tight text-slate-900">{{ appName }}</p>
        </div>

        @if (first()) {
          <h1 class="df-h1">Choose your password</h1>
          <p class="df-muted mt-1">
            Welcome, {{ session.user()?.name }}. The password you signed in with was set by whoever
            created your account — pick your own now.
          </p>
        } @else {
          <h1 class="df-h1">Change your password</h1>
          <p class="df-muted mt-1">You will stay signed in on this device.</p>
        }

        <form class="mt-6 space-y-4" (ngSubmit)="submit()">
          <label class="block">
            <span class="df-label">Current password</span>
            <input
              class="df-input"
              type="password"
              name="currentPassword"
              autocomplete="current-password"
              [(ngModel)]="currentPassword"
              required
            />
          </label>
          <label class="block">
            <span class="df-label">New password</span>
            <input
              class="df-input"
              type="password"
              name="newPassword"
              autocomplete="new-password"
              minlength="6"
              [(ngModel)]="newPassword"
              required
            />
            <span class="mt-1 block text-xs text-slate-400">At least 6 characters.</span>
          </label>
          <label class="block">
            <span class="df-label">Confirm new password</span>
            <input
              class="df-input"
              type="password"
              name="confirmPassword"
              autocomplete="new-password"
              [(ngModel)]="confirmPassword"
              required
            />
          </label>

          @if (mismatch()) {
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The two new passwords do not match.
            </p>
          }
          @if (error()) {
            <p class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {{ error() }}
            </p>
          }

          <button type="submit" class="df-btn-primary w-full" [disabled]="busy() || !ready()">
            {{ busy() ? 'Saving…' : 'Set new password' }}
          </button>
        </form>

        <div class="mt-6 flex items-center justify-between text-sm">
          @if (first()) {
            <button type="button" class="text-slate-500 hover:text-slate-800" (click)="skip()">
              Skip for now
            </button>
            <span class="text-xs text-slate-400">We will ask again next time.</span>
          } @else {
            <button type="button" class="text-slate-500 hover:text-slate-800" (click)="skip()">
              Back
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ChangePasswordPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastStore);
  protected readonly session = inject(SessionStore);

  protected readonly appName = APP_NAME;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  /** The first-sign-in framing, rather than a change they went looking for. */
  first(): boolean {
    return this.session.mustChangePassword();
  }
  mismatch(): boolean {
    return !!this.confirmPassword && this.newPassword !== this.confirmPassword;
  }
  ready(): boolean {
    return !!this.currentPassword && this.newPassword.length >= 6 && this.newPassword === this.confirmPassword;
  }

  async submit(): Promise<void> {
    if (!this.ready()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const body: ChangePasswordRequest = {
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
      };
      const user = await firstValueFrom(this.api.post<UserDto>('/auth/change-password', body));
      // The stored session still says the old flag; the response is the truth.
      this.session.updateUser(user);
      this.toast.success('Password updated', 'Use your new password next time you sign in.');
      await this.leave();
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not change your password.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Skipping keeps the flag, so the offer returns at the next sign-in. */
  async skip(): Promise<void> {
    await this.leave();
  }

  private async leave(): Promise<void> {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    await this.router.navigateByUrl(redirect || this.session.roleLandingRoute());
  }
}
