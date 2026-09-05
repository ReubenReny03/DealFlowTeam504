import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/ui/toast-host.component';
import { SessionStore } from './core/state/session.store';

@Component({
  selector: 'df-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <df-toast-host />
  `,
})
export class AppComponent {
  // Rehydrates the session from localStorage before the first guard runs.
  protected readonly session = inject(SessionStore);
}
