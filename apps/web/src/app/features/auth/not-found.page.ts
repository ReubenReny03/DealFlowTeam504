import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/state/session.store';

@Component({
  selector: 'df-not-found',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p class="text-5xl">🧭</p>
      <h1 class="df-h1 mt-4">That page does not exist</h1>
      <p class="df-muted mt-2 max-w-md">The link may be stale, or the screen may belong to an area your account cannot open.</p>
      <a [routerLink]="home()" class="df-btn-primary mt-6">Take me back</a>
    </div>
  `,
})
export class NotFoundPage {
  private readonly session = inject(SessionStore);
  home(): string { return this.session.isAuthenticated() ? this.session.landingRoute() : '/login'; }
}
