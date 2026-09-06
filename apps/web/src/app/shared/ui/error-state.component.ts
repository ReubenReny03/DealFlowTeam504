import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Shown when a request fails. Always offers a way forward. */
@Component({
  selector: 'df-error-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="df-fade-in rounded-xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
      <h3 class="text-base font-semibold text-rose-900">{{ title() }}</h3>
      <p class="mx-auto mt-1.5 max-w-md text-sm text-rose-700">{{ message() }}</p>
      <button type="button" class="df-btn-ghost mt-4" (click)="retry.emit()">Try again</button>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly title = input('We could not load this');
  readonly message = input('The request did not come back. This is usually the API not running — check `npm run dev:api`.');
  readonly retry = output<void>();
}
