import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Generic dialog. Escape and the backdrop both close it. */
@Component({
  selector: 'df-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close.emit()' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40" (click)="close.emit()"></div>
        <div class="df-card relative z-10 w-full max-w-lg p-6" role="dialog" aria-modal="true">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 class="df-h2">{{ title() }}</h2>
              @if (subtitle()) { <p class="df-muted mt-0.5">{{ subtitle() }}</p> }
            </div>
            <button type="button" class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close" (click)="close.emit()">✕</button>
          </div>
          <ng-content />
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input<string | null>(null);
  readonly close = output<void>();
}
